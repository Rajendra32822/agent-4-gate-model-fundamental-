const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkSignalsForTicker } = require('../platform/signalEngine');

test('checkSignalsForTicker: generates BUY signal on oversold RSI when price > 200 SMA', () => {
  const technicals = [
    { date: '2026-06-20', close: 150, rsi: 30, sma_200: 120, sma_50: 130, macd: 1, macd_signal: 1.2, macd_hist: -0.2 },
    { date: '2026-06-19', close: 148, rsi: 32, sma_200: 119, sma_50: 129, macd: 0.9, macd_signal: 1.1, macd_hist: -0.2 }
  ];

  const signals = checkSignalsForTicker('TCS', technicals, ['marshall_undervalued'], []);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signal_type, 'BUY');
  assert.equal(signals[0].strategy_key, 'marshall_undervalued');
  assert.equal(signals[0].price, 150);
  assert.ok(signals[0].reasons.description.includes('RSI is oversold'));
});

test('checkSignalsForTicker: generates BUY signal on MACD bullish crossover when price > 200 SMA', () => {
  const technicals = [
    { date: '2026-06-20', close: 150, rsi: 45, sma_200: 120, sma_50: 130, macd: 1.3, macd_signal: 1.2, macd_hist: 0.1 },
    { date: '2026-06-19', close: 148, rsi: 43, sma_200: 119, sma_50: 129, macd: 1.1, macd_signal: 1.2, macd_hist: -0.1 }
  ];

  const signals = checkSignalsForTicker('TCS', technicals, ['marshall_undervalued'], []);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signal_type, 'BUY');
  assert.equal(signals[0].strategy_key, 'marshall_undervalued');
  assert.ok(signals[0].reasons.description.includes('MACD Bullish Crossover'));
});

test('checkSignalsForTicker: skips BUY signal if price <= 200 SMA', () => {
  const technicals = [
    { date: '2026-06-20', close: 110, rsi: 30, sma_200: 120, sma_50: 115, macd: 1, macd_signal: 1.2, macd_hist: -0.2 }
  ];

  const signals = checkSignalsForTicker('TCS', technicals, ['marshall_undervalued'], []);
  assert.equal(signals.length, 0);
});

test('checkSignalsForTicker: skips BUY signal if already held in the strategy', () => {
  const technicals = [
    { date: '2026-06-20', close: 150, rsi: 30, sma_200: 120, sma_50: 130, macd: 1, macd_signal: 1.2, macd_hist: -0.2 }
  ];

  const signals = checkSignalsForTicker('TCS', technicals, ['marshall_undervalued'], ['marshall_undervalued']);
  assert.equal(signals.length, 0);
});

test('checkSignalsForTicker: generates SELL signal on 50 SMA break', () => {
  const technicals = [
    { date: '2026-06-20', close: 125, rsi: 50, sma_200: 120, sma_50: 130, macd: 1, macd_signal: 0.8, macd_hist: 0.2 },
    { date: '2026-06-19', close: 128, rsi: 52, sma_200: 119, sma_50: 129, macd: 1.1, macd_signal: 0.9, macd_hist: 0.2 }
  ];

  const signals = checkSignalsForTicker('TCS', technicals, [], ['marshall_undervalued']);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signal_type, 'SELL');
  assert.equal(signals[0].strategy_key, 'marshall_undervalued');
  assert.ok(signals[0].reasons.description.includes('broke below 50 SMA'));
});

test('checkSignalsForTicker: generates SELL signal on overbought RSI', () => {
  const technicals = [
    { date: '2026-06-20', close: 150, rsi: 72, sma_200: 120, sma_50: 140, macd: 1, macd_signal: 0.8, macd_hist: 0.2 }
  ];

  const signals = checkSignalsForTicker('TCS', technicals, [], ['marshall_undervalued']);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signal_type, 'SELL');
  assert.ok(signals[0].reasons.description.includes('RSI is overbought'));
});

test('checkSignalsForTicker: generates SELL signal on MACD bearish crossover', () => {
  const technicals = [
    { date: '2026-06-20', close: 150, rsi: 55, sma_200: 120, sma_50: 140, macd: 1.1, macd_signal: 1.2, macd_hist: -0.1 },
    { date: '2026-06-19', close: 152, rsi: 58, sma_200: 119, sma_50: 139, macd: 1.3, macd_signal: 1.2, macd_hist: 0.1 }
  ];

  const signals = checkSignalsForTicker('TCS', technicals, [], ['marshall_undervalued']);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signal_type, 'SELL');
  assert.ok(signals[0].reasons.description.includes('MACD Bearish Crossover'));
});

test('checkSignalsForTicker: handles empty technicals list gracefully', () => {
  const signals = checkSignalsForTicker('TCS', [], ['marshall_undervalued'], []);
  assert.equal(signals.length, 0);
});
