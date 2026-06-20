const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideExits, decideEntries, applyTick, computeBookMetrics } = require('../platform/paperTrade');

// Mock sector benchmarks
const MOCK_SECTOR_BENCHMARKS = {
  IT: { primary_metric: 'roce', roce_benchmark: 30, roe_benchmark: null }
};

test('decideExits: keeps positions that still pass the gate', () => {
  const openPositions = [
    { strategy_key: 'marshall_undervalued', ticker: 'TCS', entry_price: 3000, current_price: 3100, status: 'OPEN' }
  ];
  const freshRowsByTicker = {
    TCS: {
      ticker: 'TCS',
      sector: 'IT',
      roce_5y_avg: 35, // passes IT ROCE gate >= 30
      debt_to_equity: 0.1,
      pat_cagr_5y_pct: 12,
      pe: 25,
      current_price: 3100
    }
  };

  const exits = decideExits(openPositions, freshRowsByTicker, MOCK_SECTOR_BENCHMARKS, {}, '2026-06-20');
  assert.equal(exits.length, 0);
});

test('decideExits: closes position when thesis breaks (e.g. high P/E)', () => {
  const openPositions = [
    { strategy_key: 'marshall_undervalued', ticker: 'TCS', entry_price: 3000, current_price: 3500, status: 'OPEN' }
  ];
  const freshRowsByTicker = {
    TCS: {
      ticker: 'TCS',
      sector: 'IT',
      roce_5y_avg: 35,
      debt_to_equity: 0.1,
      pat_cagr_5y_pct: 12,
      pe: 40, // fails P/E gate (> 35)
      current_price: 3500
    }
  };

  const exits = decideExits(openPositions, freshRowsByTicker, MOCK_SECTOR_BENCHMARKS, { TCS: 3600 }, '2026-06-20');
  assert.equal(exits.length, 1);
  assert.equal(exits[0].status, 'CLOSED');
  assert.equal(exits[0].exit_price, 3600);
  assert.equal(exits[0].exit_date, '2026-06-20');
  assert.ok(exits[0].exit_reason.includes('P/E out of range'));
  assert.equal(exits[0].return_pct, 0.2); // (3600 / 3000) - 1
});

test('decideExits: closes position when fundamentals data goes missing', () => {
  const openPositions = [
    { strategy_key: 'marshall_undervalued', ticker: 'TCS', entry_price: 3000, current_price: 3100, status: 'OPEN' }
  ];
  const freshRowsByTicker = {}; // TCS missing

  const exits = decideExits(openPositions, freshRowsByTicker, MOCK_SECTOR_BENCHMARKS, { TCS: 3200 }, '2026-06-20');
  assert.equal(exits.length, 1);
  assert.equal(exits[0].status, 'CLOSED');
  assert.equal(exits[0].exit_price, 3200);
  assert.equal(exits[0].exit_reason, 'Data missing / Deactivated');
  assert.equal(exits[0].return_pct, 0.0667); // (3200 / 3000) - 1 = 0.066666... -> 0.0667
});

test('decideEntries: selects new qualifying stocks and ignores already held ones', () => {
  const rankedRows = [
    { rank: 1, ticker: 'INFY', company_name: 'Infosys', current_price: 1500, reasons: ['ROCE 32%'] },
    { rank: 2, ticker: 'TCS', company_name: 'TCS', current_price: 3000, reasons: ['ROCE 38%'] },
    { rank: 3, ticker: 'WIPRO', company_name: 'Wipro', current_price: 500, reasons: ['ROCE 18%'] }
  ];
  const openTickers = ['INFY']; // INFY already held

  const entries = decideEntries('marshall_undervalued', rankedRows, openTickers, 2, { TCS: 3100 }, '2026-06-20');
  assert.equal(entries.length, 2);
  
  // First entry should be TCS (rank 2, since INFY was skipped)
  assert.equal(entries[0].ticker, 'TCS');
  assert.equal(entries[0].entry_price, 3100); // from pricesByTicker
  assert.equal(entries[0].shares, 32.258065);
  assert.equal(entries[0].status, 'OPEN');

  // Second entry should be WIPRO (rank 3)
  assert.equal(entries[1].ticker, 'WIPRO');
  assert.equal(entries[1].entry_price, 500); // fallback to row.current_price
  assert.equal(entries[1].shares, 200); // 100000 / 500
});

test('decideEntries: returns empty array if free slots is 0 or negative', () => {
  const rankedRows = [
    { rank: 1, ticker: 'INFY', company_name: 'Infosys', current_price: 1500, reasons: ['ROCE 32%'] }
  ];
  const entries = decideEntries('marshall_undervalued', rankedRows, [], 0, {}, '2026-06-20');
  assert.equal(entries.length, 0);
});

test('applyTick: updates price and returns, and computes book value correctly', () => {
  const openTrades = [
    { ticker: 'TCS', entry_price: 3000, current_price: 3000, shares: 33.333333 },
    { ticker: 'INFY', entry_price: 1500, current_price: 1500, shares: 66.666667 }
  ];
  const todaysPrices = { TCS: 3300, INFY: 1400 };

  const { updatedTrades, bookValue } = applyTick(openTrades, 500000, todaysPrices, '2026-06-20');
  
  assert.equal(updatedTrades[0].current_price, 3300);
  assert.equal(updatedTrades[0].return_pct, 0.1); // (3300 / 3000) - 1
  
  assert.equal(updatedTrades[1].current_price, 1400);
  assert.equal(updatedTrades[1].return_pct, -0.0667); // (1400 / 1500) - 1 = -0.06666... -> -0.0667
  
  // Book Value = Cash + sum(shares * price)
  // portfolioVal = (33.333333 * 3300) + (66.666667 * 1400) = 109999.9989 + 93333.3338 = 203333.33
  // bookValue = 500000 + 203333.33 = 703333.33
  assert.equal(bookValue, 703333.33);
});

test('computeBookMetrics: calculates returns, win rate, max drawdown, and alpha correctly', () => {
  const closedTrades = [
    { ticker: 'TCS', return_pct: 0.15 },
    { ticker: 'INFY', return_pct: -0.05 },
    { ticker: 'WIPRO', return_pct: 0.05 }
  ];

  const equityCurve = [
    { date: '2026-06-18', book_value: 1500000, book_return_pct: 0 },
    { date: '2026-06-19', book_value: 1600000, book_return_pct: 0.0667 },
    { date: '2026-06-20', book_value: 1550000, book_return_pct: 0.0333 }
  ];

  const benchmarkInfo = {
    inception_benchmark_price: 20000,
    latest_benchmark_price: 20200 // index return is +1% (0.01)
  };

  const metrics = computeBookMetrics(closedTrades, equityCurve, benchmarkInfo);

  // Cumulative return matches the latest book return
  assert.equal(metrics.cumulativeReturnPct, 0.0333);
  
  // Win rate: 2 out of 3 closed trades are winners -> 66.67%
  assert.equal(metrics.winRatePct, 66.67);
  
  // Max Drawdown: Peak was 1600000, trough was 1550000 -> (1600000 - 1550000) / 1600000 = 0.03125 -> 3.13%
  assert.equal(metrics.maxDrawdownPct, 3.13);
  
  // Alpha = Cumulative return - index return = 0.0333 - 0.01 = 0.0233 -> 2.33% alpha (2.33 pct points)
  assert.equal(metrics.alphaPct, 2.33);
});
