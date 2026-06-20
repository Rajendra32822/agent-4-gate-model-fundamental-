const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkSignalsForTicker } = require('../platform/signalEngine');

test('Signal engine integrates with mock datasets', () => {
  const rankingDataset = [
    { ticker: 'TCS', company: 'Tata Consultancy Services', current_price: 3500 },
    { ticker: 'INFY', company: 'Infosys Limited', current_price: 1500 }
  ];

  const technicalsByTicker = {
    TCS: [
      { date: '2026-06-20', close: 3500, rsi: 30, sma_200: 3200, sma_50: 3300, macd_hist: -1 }
    ],
    INFY: [
      { date: '2026-06-20', close: 1500, rsi: 45, sma_200: 1600, sma_50: 1550, macd_hist: 1 }
    ]
  };

  const top15ByStrategy = {
    marshall_undervalued: ['TCS']
  };

  const openByStrategy = {
    marshall_undervalued: []
  };

  const signals = [];
  for (const ticker of ['TCS', 'INFY']) {
    const rankedStrategies = [];
    const openStrategies = [];
    
    if (top15ByStrategy.marshall_undervalued.includes(ticker)) {
      rankedStrategies.push('marshall_undervalued');
    }
    if (openByStrategy.marshall_undervalued.includes(ticker)) {
      openStrategies.push('marshall_undervalued');
    }

    const tech = technicalsByTicker[ticker];
    const generated = checkSignalsForTicker(ticker, tech, rankedStrategies, openStrategies);
    signals.push(...generated);
  }

  // TCS should trigger BUY signal because it is top-15, not held, price > SMA 200, and RSI <= 35
  assert.equal(signals.length, 1);
  assert.equal(signals[0].ticker, 'TCS');
  assert.equal(signals[0].signal_type, 'BUY');
  assert.equal(signals[0].strategy_key, 'marshall_undervalued');
});
