const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideExits, decideEntries, applyTick, computeBookMetrics } = require('../platform/paperTrade');

// Mock data structures to simulate database responses
const MOCK_RANKING_DATASET = [
  { ticker: 'TCS', company_name: 'TCS Ltd', sector: 'IT', current_price: 3000, roce_5y_avg: 35, debt_to_equity: 0.1, pat_cagr_5y_pct: 12, pe: 25, rank: 1, reasons: ['ROCE 35%'] },
  { ticker: 'INFY', company_name: 'Infosys', sector: 'IT', current_price: 1500, roce_5y_avg: 32, debt_to_equity: 0.0, pat_cagr_5y_pct: 10, pe: 22, rank: 2, reasons: ['ROCE 32%'] },
  { ticker: 'WIPRO', company_name: 'Wipro', sector: 'IT', current_price: 500, roce_5y_avg: 18, debt_to_equity: 0.2, pat_cagr_5y_pct: 5, pe: 15, rank: 3, reasons: ['ROCE 18%'] }
];

const MOCK_SECTORS = [
  { sector: 'IT', primary_metric: 'roce', roce_benchmark: 30 }
];

test('Paper-trade Tick Flow Integration: simulates exits, entries, cash updates, and snapshots correctly', () => {
  const tickDate = '2026-06-20';
  const strategyKey = 'marshall_undervalued';

  // 1. Initial State: TCS is open, Wipro is not held, cash is 14,00,000 (1 position cost 100k)
  const meta = { strategy_key: strategyKey, inception_date: '2026-06-18', initial_capital: 1500000 };
  const openTrades = [
    { id: 1, strategy_key: strategyKey, ticker: 'TCS', entry_date: '2026-06-18', entry_price: 3000, current_price: 3000, shares: 33.333333, status: 'OPEN' }
  ];
  const closedTrades = [];

  // Fresh ranking dataset
  const freshRowsByTicker = {};
  const pricesByTicker = {};
  for (const r of MOCK_RANKING_DATASET) {
    freshRowsByTicker[r.ticker] = r;
    pricesByTicker[r.ticker] = r.current_price;
  }
  pricesByTicker['^NSEI'] = 22000; // Nifty 50 close price today

  // Sector benchmarks mapping
  const sectorBenchmarks = { IT: { primary_metric: 'roce', roce_benchmark: 30 } };

  // 2. Run Exits: TCS still passes (ROCE 35% >= 30, PE 25 <= 35) -> exits should be empty
  const exits = decideExits(openTrades, freshRowsByTicker, sectorBenchmarks, pricesByTicker, tickDate);
  assert.equal(exits.length, 0);

  const remainingOpenTrades = openTrades.filter(t => !exits.some(e => e.id === t.id));
  assert.equal(remainingOpenTrades.length, 1);

  // 3. Compute Cash: Initial 15L - 100k open cost = 14L
  const allClosedTrades = closedTrades.concat(exits);
  const openCost = remainingOpenTrades.length * 100000;
  const realizedPnL = allClosedTrades.reduce((sum, t) => sum + (t.exit_price * t.shares - 100000), 0);
  const cash = meta.initial_capital - openCost + realizedPnL;
  assert.equal(cash, 1400000);

  // 4. Run Entries: Free slots = min(15-1, 14L/100k) = 14
  const freeSlots = Math.min(15 - remainingOpenTrades.length, Math.floor(cash / 100000));
  assert.equal(freeSlots, 14);

  // Candidates in top-15: INFY (passes, rank 2), WIPRO (fails Marshall Undervalued ROCE gate 18 < 30)
  // Let's filter ranked list
  const rankedRows = MOCK_RANKING_DATASET.filter(r => {
    // Only INFY and TCS pass
    if (r.ticker === 'WIPRO') return false; // fails Marshall gate ROCE 18 < 30
    return true;
  });

  const entries = decideEntries(strategyKey, rankedRows, remainingOpenTrades.map(t => t.ticker), freeSlots, pricesByTicker, tickDate);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ticker, 'INFY');
  assert.equal(entries[0].entry_price, 1500);

  // 5. Apply Tick:
  const finalOpenTrades = remainingOpenTrades.concat(entries);
  const cashForTick = cash - (entries.length * 100000); // 14L - 100k = 13L
  const { updatedTrades, bookValue } = applyTick(finalOpenTrades, cashForTick, pricesByTicker, tickDate);

  // TCS price is 3000, shares is 33.333333 -> value 100000
  // INFY price is 1500, shares is 66.666667 -> value 100000
  // bookValue = 13L + 200000 = 1500000
  assert.equal(bookValue, 1500000.00);
  assert.equal(updatedTrades.length, 2);
  assert.equal(updatedTrades[1].ticker, 'INFY');
  assert.equal(updatedTrades[1].current_price, 1500);
});

test('Paper-trade Tick Flow Integration: exits position when thesis breaks and computes return correctly', () => {
  const tickDate = '2026-06-20';
  const strategyKey = 'marshall_undervalued';

  const meta = { strategy_key: strategyKey, inception_date: '2026-06-18', initial_capital: 1500000 };
  const openTrades = [
    { id: 1, strategy_key: strategyKey, ticker: 'TCS', entry_date: '2026-06-18', entry_price: 3000, current_price: 3000, shares: 33.333333, status: 'OPEN' }
  ];
  const closedTrades = [];

  // TCS now trades at 3500 but fails P/E gate (PE = 38 > 35)
  const freshRowsByTicker = {
    TCS: { ticker: 'TCS', sector: 'IT', current_price: 3500, roce_5y_avg: 35, debt_to_equity: 0.1, pat_cagr_5y_pct: 12, pe: 38 }
  };
  const pricesByTicker = { TCS: 3500, '^NSEI': 22000 };
  const sectorBenchmarks = { IT: { primary_metric: 'roce', roce_benchmark: 30 } };

  // 1. Run Exits -> TCS should be closed at 3500
  const exits = decideExits(openTrades, freshRowsByTicker, sectorBenchmarks, pricesByTicker, tickDate);
  assert.equal(exits.length, 1);
  assert.equal(exits[0].ticker, 'TCS');
  assert.equal(exits[0].status, 'CLOSED');
  assert.equal(exits[0].exit_price, 3500);
  assert.equal(exits[0].return_pct, 0.1667); // (3500 / 3000) - 1 = 0.16666... -> 0.1667

  const remainingOpenTrades = openTrades.filter(t => !exits.some(e => e.id === t.id));
  assert.equal(remainingOpenTrades.length, 0);

  // 2. Compute Cash -> 15L - 0 open cost + realized profit (3500 * 33.333333 - 100k)
  // 3500 * 33.333333 = 116666.67
  const allClosedTrades = closedTrades.concat(exits);
  const openCost = remainingOpenTrades.length * 100000;
  const realizedPnL = allClosedTrades.reduce((sum, t) => sum + (t.exit_price * t.shares - 100000), 0);
  const cash = meta.initial_capital - openCost + realizedPnL;
  assert.equal(Number(cash.toFixed(2)), 1516666.67); // approx 116.7k profit
});
