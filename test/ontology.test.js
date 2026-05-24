const { test } = require('node:test');
const assert = require('node:assert');
const ont = require('../ontology');

const FAMILIES = ['raw_pl', 'raw_bs', 'raw_cf', 'derived', 'valuation', 'aggregate'];
const UNIT_NAMES = ['percent', 'ratio', 'x', 'rupees_cr', 'rupees'];

test('every entry has required keys and key matches its map key', () => {
  for (const [k, m] of Object.entries(ont.METRICS)) {
    assert.equal(m.key, k, `key mismatch for ${k}`);
    assert.ok(m.label, `${k} missing label`);
    assert.ok(FAMILIES.includes(m.family), `${k} bad family ${m.family}`);
    assert.ok(UNIT_NAMES.includes(m.unit), `${k} bad unit ${m.unit}`);
    assert.ok(['higher_better', 'lower_better', 'neutral'].includes(m.direction), `${k} bad direction`);
    assert.ok(m.fields && typeof m.fields === 'object', `${k} missing fields map`);
  }
});

test('catalog has the expected family counts (~65 total)', () => {
  const counts = {};
  for (const m of Object.values(ont.METRICS)) counts[m.family] = (counts[m.family] || 0) + 1;
  assert.equal(counts.raw_pl, 11);
  assert.equal(counts.raw_bs, 17);
  assert.equal(counts.raw_cf, 9);
  assert.equal(counts.derived, 15);
  assert.equal(counts.valuation, 8);
  assert.equal(counts.aggregate, 5);
  assert.equal(Object.keys(ont.METRICS).length, 65);
});

test('format renders per-unit', () => {
  assert.equal(ont.format('roce', 15), '15%');
  assert.equal(ont.format('roce', 18.2), '18.2%');
  assert.equal(ont.format('market_cap', 1234), '₹1,234 Cr');
  assert.equal(ont.format('debt_to_equity', 1.5), '1.50×');
  assert.equal(ont.format('current_ratio', 0.45), '0.45');
  assert.equal(ont.format('eps', 2450), '₹2,450.00');
  assert.equal(ont.format('roce', null), 'n/a');
  assert.equal(ont.format('roce', undefined), 'n/a');
});

test('benchmark returns default, sector value, fallback, and null for na', () => {
  assert.equal(ont.benchmark('roce'), 15);
  assert.equal(ont.benchmark('roce', 'IT / Software / SaaS'), 30);
  assert.equal(ont.benchmark('roce', 'FMCG / Consumer Brands'), 25);
  assert.equal(ont.benchmark('roce', 'Totally Unknown Sector'), 15); // fallback to default
  assert.equal(ont.benchmark('roce', 'Financial Services / NBFC / Banks'), null); // na
  assert.equal(ont.benchmark('roe'), 15);
  assert.equal(ont.benchmark('roa'), null); // no benchmark field
});

test('byFamily and METRIC_KEYS', () => {
  assert.equal(ont.byFamily('valuation').length, 8);
  assert.ok(ont.METRIC_KEYS.includes('roce'));
  assert.equal(ont.METRIC_KEYS.length, 65);
});

test('buildBenchmarkTable matches the canonical table exactly', () => {
  const expected = [
    '| Sector | Minimum ROCE for PASS |',
    '|---|---|',
    '| IT / Software / SaaS | ≥ 30% |',
    '| FMCG / Consumer Brands | ≥ 25% |',
    '| Pharma / Healthcare Services | ≥ 20% |',
    '| Retail / D2C / QSR | ≥ 18% |',
    '| General Manufacturing / Capital Goods | ≥ 15% |',
    '| Infrastructure / Real Estate / EPC | Not applicable — use asset turnover + ROE instead |',
    '| Financial Services / NBFC / Banks | Not applicable — use ROE ≥ 15% and NIM instead |',
  ].join('\n');
  assert.equal(ont.buildBenchmarkTable(), expected);
});

test('every dependsOn reference points to a real metric', () => {
  for (const m of Object.values(ont.METRICS)) {
    for (const dep of m.dependsOn || []) {
      assert.ok(ont.METRICS[dep], `${m.key} dependsOn unknown metric "${dep}"`);
    }
  }
});
