const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runDailyPricesIngestion } = require('../ingestion/dailyPricesRunner');

test('runDailyPricesIngestion: calculates and saves technicals when price rows are upserted', async () => {
  const historyPrices = [];
  // Build a series of 60 days of prices to ensure technical calculations can run
  for (let i = 0; i < 60; i++) {
    historyPrices.push({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      close: 100 + i,
      volume: 1000
    });
  }

  const savedTechnicals = [];
  let historyFetchedTicker = null;

  const mockDb = {
    getLastPriceDate: async (ticker) => null, // trigger backfill
    upsertDailyPrices: async (rows) => true,
    getDailyPricesHistory: async (ticker, limit) => {
      historyFetchedTicker = ticker;
      return historyPrices;
    },
    saveCompanyTechnicals: async (rows) => {
      savedTechnicals.push(...rows);
      return true;
    }
  };

  const sampleRow = {
    date: '2026-01-60', open: 158, high: 160, low: 157,
    close: 159, adjClose: 159, volume: 1000,
  };

  const result = await runDailyPricesIngestion(['INFY'], mockDb, {
    throttleMs: 0,
    fetchFn: async () => [sampleRow],
  });

  assert.equal(result.total, 1);
  assert.equal(result.done, 1);
  assert.equal(result.failed, 0);

  // Assert history fetching and technical calculations
  assert.equal(historyFetchedTicker, 'INFY');
  assert.equal(savedTechnicals.length, 60);
  
  // Verify structure of stored technicals
  const lastRecord = savedTechnicals[59];
  assert.equal(lastRecord.ticker, 'INFY');
  assert.equal(lastRecord.date, '2026-01-60');
  assert.ok(typeof lastRecord.rsi === 'number' || lastRecord.rsi === null);
  assert.ok(typeof lastRecord.ema_20 === 'number' || lastRecord.ema_20 === null);
  assert.ok(typeof lastRecord.sma_50 === 'number' || lastRecord.sma_50 === null);
});

test('runDailyPricesIngestion: skips technical calculations if upserted rows are empty', async () => {
  let technicalsSaved = false;

  const mockDb = {
    getLastPriceDate: async (ticker) => null,
    upsertDailyPrices: async (rows) => true,
    getDailyPricesHistory: async (ticker, limit) => [],
    saveCompanyTechnicals: async (rows) => {
      technicalsSaved = true;
      return true;
    }
  };

  const result = await runDailyPricesIngestion(['INFY'], mockDb, {
    throttleMs: 0,
    fetchFn: async () => [], // empty fetch
  });

  assert.equal(result.total, 1);
  assert.equal(result.done, 1);
  assert.equal(technicalsSaved, false);
});
