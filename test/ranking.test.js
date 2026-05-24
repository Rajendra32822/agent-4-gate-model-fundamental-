const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreRow, rankUniverse, STRATEGY_LIST } = require('../ranking');
const ontology = require('../ontology');

const row = (o) => ({
  ticker: 'X', company_name: 'X Co', sector: 'IT',
  roce_5y_avg: 20, roe_5y_avg: 18, revenue_cagr_5y_pct: 15, pat_cagr_5y_pct: 18,
  debt_to_equity: 0.2, pe: 20, pb: 3, roe_ttm: 18, current_price: 100,
  ...o,
});

test('STRATEGY_LIST exposes 4 strategies with key+label', () => {
  assert.equal(STRATEGY_LIST.length, 4);
  for (const s of STRATEGY_LIST) {
    assert.ok(s.key && s.label && s.description);
  }
});

test('marshall_undervalued passes quality+cheap row', () => {
  const r = scoreRow('marshall_undervalued', row());
  assert.equal(r.passes, true);
  assert.ok(r.score > 0);
});

test('marshall_undervalued fails expensive row (high P/E)', () => {
  const r = scoreRow('marshall_undervalued', row({ pe: 80 }));
  assert.equal(r.passes, false);
});

test('marshall_undervalued fails low-quality row (low ROCE)', () => {
  const r = scoreRow('marshall_undervalued', row({ roce_5y_avg: 8 }));
  assert.equal(r.passes, false);
});

test('marshall_undervalued fails high-debt row', () => {
  const r = scoreRow('marshall_undervalued', row({ debt_to_equity: 1.2 }));
  assert.equal(r.passes, false);
});

test('quality_compounders ranks high ROCE above low ROCE', () => {
  const hi = scoreRow('quality_compounders', row({ roce_5y_avg: 30 }));
  const lo = scoreRow('quality_compounders', row({ roce_5y_avg: 16 }));
  assert.ok(hi.passes && lo.passes);
  assert.ok(hi.score > lo.score);
});

test('deep_value requires both low P/E and low P/B', () => {
  assert.equal(scoreRow('deep_value', row({ pe: 12, pb: 1.5, roe_ttm: 14 })).passes, true);
  assert.equal(scoreRow('deep_value', row({ pe: 12, pb: 4, roe_ttm: 14 })).passes, false); // P/B too high
  assert.equal(scoreRow('deep_value', row({ pe: 30, pb: 1.5, roe_ttm: 14 })).passes, false); // P/E too high
});

test('high_growth filters on revenue CAGR', () => {
  assert.equal(scoreRow('high_growth', row({ revenue_cagr_5y_pct: 25 })).passes, true);
  assert.equal(scoreRow('high_growth', row({ revenue_cagr_5y_pct: 5 })).passes, false);
});

test('rows missing required metrics are excluded', () => {
  const r = scoreRow('marshall_undervalued', row({ pe: null }));
  assert.equal(r.passes, false);
});

test('rankUniverse sorts desc by score and assigns ranks', () => {
  const rows = [
    row({ ticker: 'A', roce_5y_avg: 18, pe: 25 }),
    row({ ticker: 'B', roce_5y_avg: 30, pe: 15 }),
    row({ ticker: 'C', roce_5y_avg: 22, pe: 20 }),
  ];
  const ranked = rankUniverse('marshall_undervalued', rows);
  assert.equal(ranked[0].ticker, 'B');  // highest (roce+growth)/pe
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[ranked.length - 1].rank, ranked.length);
  // scores monotonically non-increasing
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i-1].score >= ranked[i].score);
});

test('rankUniverse respects limit', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row({ ticker: 'T' + i, roce_5y_avg: 16 + i }));
  const ranked = rankUniverse('quality_compounders', rows, 5);
  assert.equal(ranked.length, 5);
});

test('rankUniverse excludes failing rows', () => {
  const rows = [
    row({ ticker: 'GOOD', roce_5y_avg: 25, pe: 18 }),
    row({ ticker: 'BAD', roce_5y_avg: 5, pe: 18 }),  // fails marshall
  ];
  const ranked = rankUniverse('marshall_undervalued', rows);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].ticker, 'GOOD');
});

test('unknown strategy returns empty ranking', () => {
  assert.deepEqual(rankUniverse('nonsense', [row()]), []);
});

test('marshall_undervalued ROCE gate uses the ontology benchmark', () => {
  const min = ontology.benchmark('roce'); // 15
  const justUnder = { roce_5y_avg: min - 0.1, debt_to_equity: 0.2, pat_cagr_5y_pct: 10, pe: 20, revenue_cagr_5y_pct: 12 };
  const justOver  = { roce_5y_avg: min + 0.1, debt_to_equity: 0.2, pat_cagr_5y_pct: 10, pe: 20, revenue_cagr_5y_pct: 12 };
  assert.equal(scoreRow('marshall_undervalued', justUnder).passes, false);
  assert.equal(scoreRow('marshall_undervalued', justOver).passes, true);
});
