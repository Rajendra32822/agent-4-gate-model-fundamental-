const { test } = require('node:test');
const assert = require('node:assert');
const { SECTOR_SEED } = require('../sectorSeed');

test('seed has all 20 NSE industries', () => {
  assert.equal(SECTOR_SEED.length, 20);
  const sectors = SECTOR_SEED.map(r => r.sector);
  assert.ok(sectors.includes('Information Technology'));
  assert.ok(sectors.includes('Financial Services'));
  assert.ok(sectors.includes('Capital Goods'));
  assert.equal(new Set(sectors).size, 20, 'sector names must be unique');
});

test('every row is well-formed', () => {
  for (const r of SECTOR_SEED) {
    assert.ok(r.sector, 'sector required');
    assert.ok(['roce', 'roe'].includes(r.primary_metric), `${r.sector} bad primary_metric`);
    assert.ok(typeof r.roe_benchmark === 'number' && r.roe_benchmark >= 0, `${r.sector} bad roe_benchmark`);
    if (r.primary_metric === 'roce') {
      assert.ok(typeof r.roce_benchmark === 'number' && r.roce_benchmark >= 0, `${r.sector} roce primary needs roce_benchmark`);
    }
  }
});

test('financials/realty/construction gate on ROE', () => {
  const byName = Object.fromEntries(SECTOR_SEED.map(r => [r.sector, r]));
  assert.equal(byName['Financial Services'].primary_metric, 'roe');
  assert.equal(byName['Realty'].primary_metric, 'roe');
  assert.equal(byName['Construction'].primary_metric, 'roe');
  assert.equal(byName['Information Technology'].primary_metric, 'roce');
  assert.equal(byName['Information Technology'].roce_benchmark, 30);
});
