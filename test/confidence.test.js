const test = require('node:test');
const assert = require('node:assert/strict');
const { computeConfidenceScore, bandForScore } = require('../confidence');

test('bandForScore boundaries', () => {
  assert.equal(bandForScore(100), 'HIGH');
  assert.equal(bandForScore(80),  'HIGH');
  assert.equal(bandForScore(79),  'MEDIUM');
  assert.equal(bandForScore(60),  'MEDIUM');
  assert.equal(bandForScore(59),  'LOW');
  assert.equal(bandForScore(0),   'LOW');
});

const todayISO = new Date().toISOString().split('T')[0];

const perfectAnalysis = {
  liveQuote: { price: 450, marketCap: 5_000_000_000 },
  gate2a: {
    financialsType: 'CONSOLIDATED',
    dataConfidence: 'HIGH',
    metrics: {
      roce5yr:    { yearsOfData: 5, confidence: 'HIGH' },
      roeLast:    { confidence: 'HIGH' },
      debtEquity: { confidence: 'HIGH' },
    },
  },
  gate2c: { indicators: { promoterHolding: { confidence: 'HIGH' } } },
  rawDataSources: 5,
  analysisDate: todayISO,
};

test('perfect analysis scores 100 (HIGH)', () => {
  const r = computeConfidenceScore(perfectAnalysis);
  assert.equal(r.score, 100);
  assert.equal(r.band, 'HIGH');
  // 8 base signals + 3 verification signals (added 2026-05-17)
  assert.equal(r.breakdown.length, 11);
  assert.ok(r.breakdown.every(b => b.passed));
});

test('empty analysis scores 0 (LOW)', () => {
  // Note: critical_metrics_high_confidence passes vacuously when no metrics exist
  // (no metrics means 0 LOW counts, which is < 3). All other 7 signals fail.
  // Total penalty 110 clamps to 100, so score = 0.
  const r = computeConfidenceScore({});
  assert.equal(r.score, 0);
  assert.equal(r.band, 'LOW');
  const failed = r.breakdown.filter(b => !b.passed);
  assert.equal(failed.length, 7);
});

test('missing live price subtracts 25', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  delete a.liveQuote.price;
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 75);
  assert.equal(r.band, 'MEDIUM');
});

test('missing live market cap subtracts 15', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  delete a.liveQuote.marketCap;
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 85);
  assert.equal(r.band, 'HIGH');
});

test('fewer than 3 years of ROCE data subtracts 20', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.gate2a.metrics.roce5yr.yearsOfData = 2;
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 80);
});

test('standalone financials subtracts 15', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.gate2a.financialsType = 'STANDALONE';
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 85);
});

test('gate2a confidence LOW subtracts 15', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.gate2a.dataConfidence = 'LOW';
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 85);
});

test('three or more LOW-confidence metrics subtracts 10', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.gate2a.metrics.roce5yr.confidence    = 'LOW';
  a.gate2a.metrics.roeLast.confidence    = 'LOW';
  a.gate2a.metrics.debtEquity.confidence = 'LOW';
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 90);
});

test('fewer than 4 search queries subtracts 10', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.rawDataSources = 3;
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 90);
});

test('stale analysis (> 18 months old) subtracts 10', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  a.analysisDate = d.toISOString().split('T')[0];
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 90);
});

test('multiple failures stack penalties', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  delete a.liveQuote.price;
  delete a.liveQuote.marketCap;
  a.gate2a.financialsType = 'STANDALONE';
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 45);
  assert.equal(r.band, 'LOW');
});

test('score is clamped at 0 if penalties exceed 100', () => {
  const r = computeConfidenceScore({});
  assert.equal(r.score, 0);
  assert.ok(r.score >= 0);
});

test('breakdown contains penalty=0 for passing signals', () => {
  const r = computeConfidenceScore(perfectAnalysis);
  assert.ok(r.breakdown.every(b => b.penalty === 0));
});

test('computedAt is an ISO timestamp', () => {
  const r = computeConfidenceScore({});
  assert.match(r.computedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

// ─── Verification-derived signals ──────────────────────────────────────────

test('metrics_have_citations passes when ≥80% have citation', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr:    { verdict: 'VERIFIED' },
    roeLast:    { verdict: 'VERIFIED' },
    debtEquity: { verdict: 'VERIFIED' },
    promoterPledge: { verdict: 'VERIFIED' },
    currentPrice:   { verdict: 'UNSOURCED' },
  };
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 100);
});

test('metrics_have_citations fails when < 80% have citation', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr:    { verdict: 'UNSOURCED' },
    roeLast:    { verdict: 'UNSOURCED' },
    debtEquity: { verdict: 'VERIFIED' },
  };
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 90);
});

test('metrics_pass_sanity fails when any IMPLAUSIBLE', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr: { verdict: 'IMPLAUSIBLE' },
  };
  const r = computeConfidenceScore(a);
  // citations: 1/1 cited (IMPLAUSIBLE is not UNSOURCED) → passes
  // sanity: any IMPLAUSIBLE → fails -15
  // consensus: no consensus data → vacuous pass
  // Result: 100 - 15 = 85
  assert.equal(r.score, 85);
});

test('cross_source_consensus passes vacuously when no consensus data', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr: { verdict: 'VERIFIED', consensus: { agreementBand: 'NOT_FOUND_IN_SOURCES' } },
  };
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 100);
});

test('cross_source_consensus fails when most LOW agreement', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr: { verdict: 'VERIFIED', consensus: { agreementBand: 'LOW' } },
    roeLast: { verdict: 'VERIFIED', consensus: { agreementBand: 'LOW' } },
  };
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 90);
});

test('verification signals vacuous-pass when no verifications field (old analyses)', () => {
  // Older analyses without the verifications block should NOT be penalised.
  // All 3 verification signals pass vacuously, so score stays at 100.
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 100);
});
