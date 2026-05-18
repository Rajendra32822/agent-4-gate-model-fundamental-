const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMetricNumber,
  runSanityCheck,
  extractFreshness,
  extractAllNumericMentions,
  computeConsensus,
  verifyAnalysis,
  CRITICAL_METRICS,
  PLAUSIBILITY_RANGES,
} = require('../verification');

// ─── parseMetricNumber ────────────────────────────────────────────────────
test('parseMetricNumber: percent', () => {
  assert.equal(parseMetricNumber('18%'), 18);
  assert.equal(parseMetricNumber('18.2%'), 18.2);
  assert.equal(parseMetricNumber('-5.5%'), -5.5);
});

test('parseMetricNumber: rupees', () => {
  assert.equal(parseMetricNumber('₹2,450'), 2450);
  assert.equal(parseMetricNumber('₹1,23,456 Cr'), 123456);
});

test('parseMetricNumber: ratio', () => {
  assert.equal(parseMetricNumber('25×'), 25);
  assert.equal(parseMetricNumber('1.5x'), 1.5);
});

test('parseMetricNumber: bare number', () => {
  assert.equal(parseMetricNumber('42.5'), 42.5);
});

test('parseMetricNumber: invalid returns null', () => {
  assert.equal(parseMetricNumber('N/A'), null);
  assert.equal(parseMetricNumber(''), null);
  assert.equal(parseMetricNumber(null), null);
  assert.equal(parseMetricNumber(undefined), null);
});

// ─── runSanityCheck ──────────────────────────────────────────────────────
test('runSanityCheck: ROCE within range passes', () => {
  const r = runSanityCheck('roce5yr', 18);
  assert.equal(r.passed, true);
  assert.equal(r.parsedValue, 18);
});

test('runSanityCheck: ROCE 245% fails (hallucination)', () => {
  const r = runSanityCheck('roce5yr', 245);
  assert.equal(r.passed, false);
});

test('runSanityCheck: P/E 800 fails', () => {
  const r = runSanityCheck('peRatio', 800);
  assert.equal(r.passed, false);
});

test('runSanityCheck: P/E 80 passes', () => {
  const r = runSanityCheck('peRatio', 80);
  assert.equal(r.passed, true);
});

test('runSanityCheck: unknown metric returns null', () => {
  const r = runSanityCheck('unknownMetric', 50);
  assert.equal(r, null);
});

test('runSanityCheck: null value returns null', () => {
  const r = runSanityCheck('roce5yr', null);
  assert.equal(r, null);
});

// ─── extractFreshness ────────────────────────────────────────────────────
test('extractFreshness: FY24 marker', () => {
  const r = extractFreshness('ROCE was 18% in FY24');
  assert.equal(r.asOf, 'FY24');
  assert.ok(r.ageMonths > 0);
});

test('extractFreshness: Q3FY25 marker', () => {
  const r = extractFreshness('Latest results from Q3FY25 showed strong growth');
  assert.equal(r.asOf, 'Q3FY25');
});

test('extractFreshness: month year marker', () => {
  const r = extractFreshness('Price as of March 2025 was ₹450');
  assert.match(r.asOf, /March 2025|Mar 2025/i);
});

test('extractFreshness: no date marker returns null asOf', () => {
  const r = extractFreshness('Some text without dates');
  assert.equal(r.asOf, null);
  assert.equal(r.stale, false);
});

// ─── extractAllNumericMentions ───────────────────────────────────────────
test('extractAllNumericMentions: finds ROCE values in text', () => {
  const text = 'ROCE was 18% in FY24, 17.5% in FY23, and 18.2% on average';
  const r = extractAllNumericMentions(text, 'roce5yr');
  assert.ok(r.length >= 2);
  assert.ok(r.some(n => Math.abs(n - 18) < 0.5));
});

test('extractAllNumericMentions: empty when not mentioned', () => {
  const text = 'No mention of return on capital here';
  const r = extractAllNumericMentions(text, 'roce5yr');
  assert.equal(r.length, 0);
});

// ─── computeConsensus ────────────────────────────────────────────────────
test('computeConsensus: HIGH agreement (within 5%)', () => {
  const r = computeConsensus('roce5yr', [18, 18.2, 17.8]);
  assert.equal(r.agreementBand, 'HIGH');
  assert.deepEqual(r.valuesSeen, [18, 18.2, 17.8]);
});

test('computeConsensus: MEDIUM agreement (5-15%)', () => {
  const r = computeConsensus('roce5yr', [18, 20, 17]);
  assert.equal(r.agreementBand, 'MEDIUM');
});

test('computeConsensus: LOW agreement (> 15%)', () => {
  const r = computeConsensus('roce5yr', [18, 25, 12]);
  assert.equal(r.agreementBand, 'LOW');
});

test('computeConsensus: SINGLE_SOURCE when one value', () => {
  const r = computeConsensus('roce5yr', [18]);
  assert.equal(r.agreementBand, 'SINGLE_SOURCE');
});

test('computeConsensus: NOT_FOUND_IN_SOURCES when empty', () => {
  const r = computeConsensus('roce5yr', []);
  assert.equal(r.agreementBand, 'NOT_FOUND_IN_SOURCES');
});

// ─── verifyAnalysis end-to-end ───────────────────────────────────────────
test('verifyAnalysis: VERIFIED for clean metric', () => {
  const analysis = {
    ticker: 'X',
    gate2a: { metrics: { roce5yr: { value: '18%', confidence: 'HIGH' } } },
    gate2c: { indicators: {} },
    gate3:  { metrics: {} },
    citations: {
      roce5yr: { quote: 'ROCE has averaged 18.2% over FY24', sourceIndex: 1 },
    },
  };
  const rawData = [{ data: 'ROCE was 18% in FY24, 18.2% over 5 years' }];
  const result = verifyAnalysis(analysis, rawData);
  const v = result.verifications.roce5yr;
  assert.equal(v.verdict, 'VERIFIED');
  assert.equal(v.sanity.passed, true);
});

test('verifyAnalysis: IMPLAUSIBLE flags out-of-range', () => {
  const analysis = {
    ticker: 'X',
    gate2a: { metrics: { roce5yr: { value: '245%', confidence: 'HIGH' } } },
    gate2c: { indicators: {} },
    gate3:  { metrics: {} },
    citations: { roce5yr: { quote: 'ROCE 245%', sourceIndex: 1 } },
  };
  const result = verifyAnalysis(analysis, [{ data: '' }]);
  assert.equal(result.verifications.roce5yr.verdict, 'IMPLAUSIBLE');
  assert.equal(result.verifications.roce5yr.sanity.passed, false);
});

test('verifyAnalysis: UNSOURCED when no citation', () => {
  const analysis = {
    ticker: 'X',
    gate2a: { metrics: { roce5yr: { value: '18%' } } },
    gate2c: { indicators: {} },
    gate3:  { metrics: {} },
    citations: {},
  };
  const result = verifyAnalysis(analysis, [{ data: '' }]);
  assert.equal(result.verifications.roce5yr.verdict, 'UNSOURCED');
});

test('verifyAnalysis: SOURCED_ONLY when LOW consensus', () => {
  const analysis = {
    ticker: 'X',
    gate2a: { metrics: { roce5yr: { value: '18%' } } },
    gate2c: { indicators: {} },
    gate3:  { metrics: {} },
    citations: { roce5yr: { quote: 'ROCE 18%', sourceIndex: 1 } },
  };
  const rawData = [
    { data: 'ROCE was 18% in FY24' },
    { data: 'ROCE around 25% reported' },
    { data: 'ROCE around 12% as reported' },
  ];
  const result = verifyAnalysis(analysis, rawData);
  assert.equal(result.verifications.roce5yr.verdict, 'SOURCED_ONLY');
  assert.equal(result.verifications.roce5yr.consensus.agreementBand, 'LOW');
});

test('verifyAnalysis: handles string-shaped currentPrice', () => {
  const analysis = {
    ticker: 'X',
    gate2a: { metrics: {} },
    gate2c: { indicators: {} },
    gate3:  { metrics: { currentPrice: '₹450' } },
    citations: { currentPrice: { quote: 'Current price ₹450', sourceIndex: 1 } },
  };
  const result = verifyAnalysis(analysis, [{ data: 'price 450' }]);
  assert.equal(result.verifications.currentPrice.sanity.passed, true);
  assert.equal(result.verifications.currentPrice.sanity.parsedValue, 450);
});

test('verifyAnalysis: CRITICAL_METRICS list contains 12 entries', () => {
  assert.equal(CRITICAL_METRICS.length, 12);
});

test('verifyAnalysis: PLAUSIBILITY_RANGES has range for every critical metric', () => {
  for (const m of CRITICAL_METRICS) {
    assert.ok(PLAUSIBILITY_RANGES[m], `Missing range for ${m}`);
    assert.equal(PLAUSIBILITY_RANGES[m].length, 2);
  }
});
