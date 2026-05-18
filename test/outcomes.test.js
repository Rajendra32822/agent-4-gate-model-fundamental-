const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findClosestPrice,
  priceAtOffset,
  computeOutcome,
} = require('../outcomes');

const series = (rows) => rows.map(r => ({ date: r[0], close: r[1] }));

test('findClosestPrice: exact date match', () => {
  const s = series([['2026-01-01', 100], ['2026-01-02', 101]]);
  assert.equal(findClosestPrice(s, '2026-01-01'), 100);
});

test('findClosestPrice: uses prior date when exact missing', () => {
  const s = series([['2026-01-01', 100], ['2026-01-03', 103]]);
  assert.equal(findClosestPrice(s, '2026-01-02'), 100);
});

test('findClosestPrice: empty series returns null', () => {
  assert.equal(findClosestPrice([], '2026-01-01'), null);
  assert.equal(findClosestPrice(null, '2026-01-01'), null);
});

test('findClosestPrice: future-only series returns null', () => {
  const s = series([['2026-02-01', 100]]);
  assert.equal(findClosestPrice(s, '2026-01-01'), null);
});

test('priceAtOffset: 30 days later', () => {
  const s = series([
    ['2026-01-01', 100],
    ['2026-01-31', 110],
    ['2026-02-15', 115],
  ]);
  assert.equal(priceAtOffset(s, '2026-01-01', 30), 110);
});

test('computeOutcome: full happy path', () => {
  const s = series([
    ['2026-01-01', 100],
    ['2026-02-01', 105],
    ['2026-04-01', 115],
    ['2026-07-01', 120],
    ['2027-01-01', 140],
  ]);
  const out = computeOutcome('X', '2026-01-01', s, {
    entryZone: '₹90–110',
    valuationScenarios: {
      bullCase: { price: '₹130' },
      bearCase: { price: '₹80' },
    },
  });
  assert.equal(out.price_at_analysis, 100);
  assert.equal(out.return_1m_pct, 5);
  assert.equal(out.return_3m_pct, 15);
  assert.equal(out.return_6m_pct, 20);
  assert.equal(out.return_1y_pct, 40);
  assert.equal(out.hit_bull_case, true);
  assert.equal(out.hit_bear_case, false);
  assert.equal(out.hit_entry_zone, true);
});

test('computeOutcome: no data → null returns', () => {
  const out = computeOutcome('X', '2030-01-01', series([['2026-01-01', 100]]), {});
  assert.equal(out.price_at_analysis, null);
});

test('computeOutcome: hit_bear_case true when price dips below', () => {
  const s = series([
    ['2026-01-01', 100],
    ['2026-03-01', 75],
    ['2026-07-01', 105],
  ]);
  const out = computeOutcome('X', '2026-01-01', s, {
    valuationScenarios: { bearCase: { price: '₹80' } },
  });
  assert.equal(out.hit_bear_case, true);
});

test('computeOutcome: hit_entry_zone false when price stays above', () => {
  const s = series([
    ['2026-01-01', 200],
    ['2026-04-01', 220],
  ]);
  const out = computeOutcome('X', '2026-01-01', s, { entryZone: '₹90–110' });
  assert.equal(out.hit_entry_zone, false);
});

test('computeOutcome: handles missing gate3', () => {
  const s = series([['2026-01-01', 100], ['2026-02-01', 110]]);
  const out = computeOutcome('X', '2026-01-01', s, null);
  assert.equal(out.price_at_analysis, 100);
  assert.equal(out.return_1m_pct, 10);
  assert.equal(out.hit_entry_zone, false);
  assert.equal(out.hit_bull_case, false);
  assert.equal(out.hit_bear_case, false);
});
