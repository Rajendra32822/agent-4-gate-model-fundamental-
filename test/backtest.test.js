const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runStrategyBacktest } = require('../platform/backtest');

test('runStrategyBacktest: simulates buy and sell cycles correctly', async () => {
  const prices = [];
  for (let i = 0; i < 300; i++) {
    prices.push({
      date: `2026-01-${String(i+1).padStart(3, '0')}`,
      close: 100,
      volume: 1000
    });
  }

  const mockDb = {
    getDailyPricesHistory: async (ticker, limit) => {
      const customPrices = JSON.parse(JSON.stringify(prices));
      for (let i = 0; i < customPrices.length; i++) {
        if (i < 200) {
          customPrices[i].close = 100;
        } else if (i >= 200 && i < 280) {
          customPrices[i].close = 500;
        } else if (i >= 280 && i < 285) {
          customPrices[i].close = 500 - (i - 280) * 40; // drop to 300
        } else {
          customPrices[i].close = 300 + (i - 285) * 27; // pump to 705
        }
      }
      return customPrices;
    }
  };

  const results = await runStrategyBacktest(['TCS'], mockDb, 100000);
  assert.ok(results.summary.totalTrades >= 1);
  assert.ok(typeof results.summary.winRatePct === 'number');
  assert.ok(results.equityCurve.length > 1);
});

test('runStrategyBacktest: completes cleanly with empty tickers list', async () => {
  const mockDb = { getDailyPricesHistory: async () => [] };
  const results = await runStrategyBacktest([], mockDb, 100000);
  assert.equal(results.summary.totalTrades, 0);
  assert.equal(results.summary.winRatePct, 0);
  assert.equal(results.closedTrades.length, 0);
});
