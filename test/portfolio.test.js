const test = require('node:test');
const assert = require('node:assert/strict');
const { computeHoldings, computePortfolioSummary } = require('../portfolio');

const tx = (overrides) => ({
  ticker: 'X', company: 'X Co',
  type: 'BUY', quantity: 100, price: 50,
  transaction_date: '2026-01-01', status: 'confirmed',
  ...overrides,
});

test('empty transactions returns empty holdings', () => {
  assert.deepEqual(computeHoldings([], {}), []);
});

test('single BUY creates one holding', () => {
  const h = computeHoldings([tx()], { X: 60 });
  assert.equal(h.length, 1);
  assert.equal(h[0].ticker, 'X');
  assert.equal(h[0].quantity, 100);
  assert.equal(h[0].avgBuyPrice, 50);
  assert.equal(h[0].cmp, 60);
  assert.equal(h[0].unrealisedPl, 1000);
  assert.equal(h[0].unrealisedPlPct, 20);
  assert.equal(h[0].realisedPl, 0);
});

test('two BUYs compute weighted average', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 100, price: 70, transaction_date: '2026-02-01' }),
  ];
  const h = computeHoldings(txs, { X: 80 });
  assert.equal(h[0].quantity, 200);
  assert.equal(h[0].avgBuyPrice, 60);
});

test('SELL realises P&L using FIFO', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 100, price: 70, transaction_date: '2026-02-01' }),
    tx({ type: 'SELL', quantity: 50, price: 80, transaction_date: '2026-03-01' }),
  ];
  const h = computeHoldings(txs, { X: 90 });
  assert.equal(h[0].quantity, 150);
  assert.equal(h[0].realisedPl, 1500);
  assert.equal(h[0].avgBuyPrice, 63.33);
});

test('SELL spanning multiple lots', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 100, price: 70, transaction_date: '2026-02-01' }),
    tx({ type: 'SELL', quantity: 150, price: 80, transaction_date: '2026-03-01' }),
  ];
  const h = computeHoldings(txs, { X: 90 });
  assert.equal(h[0].quantity, 50);
  assert.equal(h[0].realisedPl, 3500);
  assert.equal(h[0].avgBuyPrice, 70);
});

test('SPLIT 1:5 multiplies qty and divides price', () => {
  const txs = [
    tx({ quantity: 100, price: 500, transaction_date: '2026-01-01' }),
    tx({ type: 'SPLIT', ratio: '1:5', transaction_date: '2026-02-01', quantity: null, price: null }),
  ];
  const h = computeHoldings(txs, { X: 110 });
  assert.equal(h[0].quantity, 500);
  assert.equal(h[0].avgBuyPrice, 100);
});

test('BONUS 1:1 doubles holdings', () => {
  const txs = [
    tx({ quantity: 100, price: 200, transaction_date: '2026-01-01' }),
    tx({ type: 'BONUS', ratio: '1:1', transaction_date: '2026-02-01', quantity: null, price: null }),
  ];
  const h = computeHoldings(txs, { X: 110 });
  assert.equal(h[0].quantity, 200);
  assert.equal(h[0].avgBuyPrice, 100);
});

test('DIVIDEND adds to totalDividends', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ type: 'DIVIDEND', quantity: null, price: null, amount: 500, transaction_date: '2026-03-01' }),
  ];
  const h = computeHoldings(txs, { X: 60 });
  assert.equal(h[0].totalDividends, 500);
  assert.equal(h[0].quantity, 100);
});

test('proposed status is ignored', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 50, price: 60, transaction_date: '2026-02-01', status: 'proposed' }),
  ];
  const h = computeHoldings(txs, { X: 70 });
  assert.equal(h[0].quantity, 100);
});

test('dismissed status is ignored', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 50, price: 60, transaction_date: '2026-02-01', status: 'dismissed' }),
  ];
  const h = computeHoldings(txs, { X: 70 });
  assert.equal(h[0].quantity, 100);
});

test('multi-ticker computed independently', () => {
  const txs = [
    tx({ ticker: 'A', quantity: 10, price: 100 }),
    tx({ ticker: 'B', quantity: 20, price: 200 }),
  ];
  const h = computeHoldings(txs, { A: 110, B: 250 });
  assert.equal(h.length, 2);
  const b = h.find(x => x.ticker === 'B');
  assert.equal(b.unrealisedPl, 1000);
});

test('totalReturn sums unrealised, realised, dividends', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ type: 'SELL', quantity: 50, price: 80, transaction_date: '2026-02-01' }),
    tx({ type: 'DIVIDEND', quantity: null, price: null, amount: 300, transaction_date: '2026-03-01' }),
  ];
  const h = computeHoldings(txs, { X: 100 });
  assert.equal(h[0].totalReturn, 4300);
});

test('computePortfolioSummary aggregates across tickers', () => {
  const txs = [
    tx({ ticker: 'A', quantity: 10, price: 100 }),
    tx({ ticker: 'B', quantity: 20, price: 200 }),
  ];
  const s = computePortfolioSummary(txs, { A: 120, B: 250 });
  assert.equal(s.positionsCount, 2);
  assert.equal(s.totalInvested, 5000);
  assert.equal(s.totalValue, 6200);
  assert.equal(s.totalUnrealised, 1200);
  assert.equal(s.returnPct, 24);
});

test('sold-out position shows quantity 0', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ type: 'SELL', quantity: 100, price: 80, transaction_date: '2026-02-01' }),
  ];
  const h = computeHoldings(txs, { X: 90 });
  assert.equal(h[0].quantity, 0);
  assert.equal(h[0].realisedPl, 3000);
  assert.equal(h[0].unrealisedPl, 0);
});
