const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateTechnicalsForSeries
} = require('../platform/technicals');

test('calculateSMA: computes simple moving averages correctly', () => {
  const prices = [10, 11, 12, 13, 14];
  const sma3 = calculateSMA(prices, 3);
  
  assert.deepEqual(sma3, [null, null, 11, 12, 13]);
});

test('calculateSMA: handles leading nulls correctly', () => {
  const prices = [null, null, 10, 11, 12, 13, 14];
  const sma3 = calculateSMA(prices, 3);
  
  assert.deepEqual(sma3, [null, null, null, null, 11, 12, 13]);
});

test('calculateEMA: computes exponential moving averages correctly', () => {
  const prices = [10, 11, 12, 13, 14];
  const ema3 = calculateEMA(prices, 3);
  
  // Period 3 EMA:
  // multiplier = 2 / 4 = 0.5
  // Index 0, 1 = null
  // Index 2 (initial SMA) = (10+11+12)/3 = 11
  // Index 3 = (13 - 11) * 0.5 + 11 = 12
  // Index 4 = (14 - 12) * 0.5 + 12 = 13
  assert.deepEqual(ema3, [null, null, 11, 12, 13]);
});

test('calculateEMA: handles leading nulls in EMA gracefully', () => {
  const prices = [null, null, 10, 11, 12, 13, 14];
  const ema3 = calculateEMA(prices, 3);
  
  assert.deepEqual(ema3, [null, null, null, null, 11, 12, 13]);
});

test('calculateRSI: computes Relative Strength Index correctly', () => {
  // Setup a sequence of rising prices (RSI should be high)
  const prices = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170];
  const rsi = calculateRSI(prices, 14);
  
  assert.equal(rsi.length, 15);
  // The first 14 elements (0 to 13) should be null
  assert.equal(rsi[0], null);
  assert.equal(rsi[13], null);
  // Index 14 (15th price) should be 100 because there were only gains and no losses
  assert.equal(rsi[14], 100);
});

test('calculateMACD: computes MACD lines and signal lines', () => {
  // Generate 40 close prices so EMA(26) and signal EMA(9) can be calculated
  const prices = [];
  for (let i = 0; i < 45; i++) {
    prices.push(100 + i);
  }
  
  const { macd, signal, hist } = calculateMACD(prices, 12, 26, 9);
  
  assert.equal(macd.length, 45);
  assert.equal(signal.length, 45);
  assert.equal(hist.length, 45);
  
  // The first 25 elements of MACD (slow EMA period - 1) should be null
  assert.equal(macd[24], null);
  // Subsequent points should have numeric values
  assert.ok(typeof macd[25] === 'number');
  
  // Signal EMA needs 9 more periods, so first 25 + 8 = 33 elements should be null
  assert.equal(signal[32], null);
  assert.ok(typeof signal[34] === 'number');
  assert.ok(typeof hist[34] === 'number');
});

test('calculateTechnicalsForSeries: builds a complete metrics object per day', () => {
  const dailyPrices = [];
  for (let i = 0; i < 60; i++) {
    dailyPrices.push({
      date: `2026-01-${String(i+1).padStart(2, '0')}`,
      close: 100 + i,
      volume: 1000
    });
  }

  const results = calculateTechnicalsForSeries(dailyPrices);
  assert.equal(results.length, 60);
  assert.equal(results[59].date, '2026-01-60');
  assert.ok(results[59].rsi !== null);
  assert.ok(results[59].ema_20 !== null);
  assert.ok(results[59].sma_50 !== null);
  assert.ok(results[59].macd !== null);
});
