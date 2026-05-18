# Data Verification Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure-JS verification layer that runs after AI extraction to validate every critical metric (sanity ranges, source citations, cross-source consensus, freshness), surfaces per-metric ✓/ⓘ/⚠ badges in the UI, and triggers up to 3 focused web re-fetches when critical metrics fail verification.

**Architecture:** New `verification.js` module mirrors the existing pure-rules `confidence.js` — no I/O, fully testable. Three new signals extend the existing `computeConfidenceScore()`. AI prompt is updated to require a top-level `citations` map. UI gets a tiny `VerificationBadge` component reused per metric.

**Tech Stack:** Node 18.19 (built-in `node:test`), Express, React, Supabase (Postgres).

**Spec:** `docs/superpowers/specs/2026-05-17-data-verification-layer-design.md`

---

## File Structure

**New files:**
- `verification.js` — pure verification module (parsing, sanity, consensus, freshness, verdicts)
- `test/verification.test.js` — unit tests via `node:test`
- `client/src/components/VerificationBadge.js` — per-metric badge + hover popover

**Modified files:**
- `confidence.js` — add 3 new signals based on verification results
- `test/confidence.test.js` — tests for the 3 new signals
- `agent.js` — update analysis prompt (require citations), call `verifyAnalysis()`, run Tier 2 selective re-fetch
- `marshallPrompt.js` — add note about the new `citations` top-level field (documentation only)
- `index.js` — extend `/api/admin/backfill-confidence` to also compute sanity verification
- `client/src/pages/AnalysisView.js` — wire `VerificationBadge` into every metric row; show one-line summary on Gate 2a
- `client/src/pages/AdminPanel.js` — rename Backfill Confidence card to reflect verification

---

## Task 1: Failing tests for verification.js

**Files:**
- Create: `test/verification.test.js`

- [ ] **Step 1: Write the failing tests**

Write `test/verification.test.js`:

```javascript
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
    citations: {}, // no citation for roce5yr
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
  // 18, 25, 12 -> spread 13 / mean 18.3 ≈ 71% -> LOW
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "C:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main"
node --test test/verification.test.js 2>&1 | tail -5
```

Expected: All tests fail with `Cannot find module '../verification'`.

- [ ] **Step 3: Commit**

```bash
git add test/verification.test.js
git commit -m "Add failing tests for verification module"
```

---

## Task 2: Implement verification.js

**Files:**
- Create: `verification.js`

- [ ] **Step 1: Write the implementation**

Write `verification.js`:

```javascript
/**
 * Pure data-verification layer (no I/O, no API calls).
 *
 * Given an analysis JSON and the raw search-result data, this module:
 *  1. Runs sanity checks on every critical metric (plausibility ranges)
 *  2. Validates AI-provided citations (quote + sourceIndex)
 *  3. Computes cross-source consensus from the raw search texts
 *  4. Extracts freshness markers (FY/quarter) from citation quotes
 *  5. Assigns a verdict per metric: VERIFIED / SOURCED_ONLY / UNSOURCED / IMPLAUSIBLE
 *
 * Output is stored on analysis.verifications (flat map keyed by metric).
 */

// Critical metrics (Gate 2a + Gate 2c + Gate 3) that must be verified.
const CRITICAL_METRICS = [
  // Gate 2a
  'roce5yr', 'roeLast', 'revenueCAGR5yr', 'patCAGR5yr',
  'debtEquity', 'promoterPledge', 'ocfQuality',
  // Gate 2c
  'promoterHolding',
  // Gate 3
  'currentPrice', 'marketCap', 'peRatio', 'priceBook',
];

// [min, max] expected ranges. Values outside → IMPLAUSIBLE.
const PLAUSIBILITY_RANGES = {
  roce5yr:         [-50, 80],
  roeLast:         [-50, 80],
  revenueCAGR5yr:  [-50, 200],
  patCAGR5yr:      [-100, 300],
  debtEquity:      [0, 10],
  promoterHolding: [0, 100],
  promoterPledge:  [0, 100],
  ocfQuality:      [-50, 200],
  peRatio:         [0, 500],
  priceBook:       [0, 50],
  currentPrice:    [0.01, 200000],
  marketCap:       [1, 50_000_000],
};

// Regex patterns to find each metric in raw source text.
// Each pattern captures one numeric group.
const METRIC_TEXT_PATTERNS = {
  roce5yr:         /\bROCE\b[^.\n]{0,40}?(-?\d+(?:\.\d+)?)\s*%/gi,
  roeLast:         /\bROE\b[^.\n]{0,40}?(-?\d+(?:\.\d+)?)\s*%/gi,
  revenueCAGR5yr:  /revenue\s+CAGR[^.\n]{0,40}?(-?\d+(?:\.\d+)?)\s*%/gi,
  patCAGR5yr:      /(?:PAT|profit)\s+CAGR[^.\n]{0,40}?(-?\d+(?:\.\d+)?)\s*%/gi,
  debtEquity:      /debt[\s\-\/]+(?:to[\s\-]+)?equity[^.\n]{0,40}?(-?\d+(?:\.\d+)?)/gi,
  promoterHolding: /promoter\s+holding[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%/gi,
  promoterPledge:  /promoter\s+pledge[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%/gi,
  ocfQuality:      /(?:OCF|operating\s+cash\s+flow)\s+(?:quality|conversion)[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%/gi,
  peRatio:         /\bP\/?E\b(?:\s+ratio)?[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*[×x]?/gi,
  priceBook:       /(?:P\/?B|price[\s\-]+to[\s\-]+book)[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*[×x]?/gi,
  currentPrice:    /(?:current\s+price|share\s+price)[^.\n]{0,40}?₹?\s*(\d+(?:,\d+)*(?:\.\d+)?)/gi,
  marketCap:       /market\s+cap(?:italisation)?[^.\n]{0,40}?₹?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*Cr/gi,
};

/**
 * Parse a number from common metric string formats.
 * Handles: "18%", "₹2,450", "1.5×", "25x", "42.5"
 * Returns null if no number can be parsed.
 */
function parseMetricNumber(str) {
  if (str == null) return null;
  if (typeof str === 'number') return isFinite(str) ? str : null;
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (!trimmed || /^N\/?A/i.test(trimmed)) return null;
  // Strip rupee, commas, percent, x/×, whitespace, "Cr" suffix
  const cleaned = trimmed
    .replace(/[₹,\s]/g, '')
    .replace(/Cr$/i, '')
    .replace(/[×x%]/g, '');
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return isFinite(n) ? n : null;
}

/**
 * Run a plausibility check for a known metric.
 * Returns null if metric is unknown or value cannot be parsed.
 */
function runSanityCheck(metricKey, value) {
  const range = PLAUSIBILITY_RANGES[metricKey];
  if (!range) return null;
  const num = typeof value === 'number' ? value : parseMetricNumber(value);
  if (num == null) return null;
  const [min, max] = range;
  return {
    passed: num >= min && num <= max,
    expectedRange: `${min} to ${max}`,
    parsedValue: num,
  };
}

/**
 * Extract a freshness marker from a citation quote.
 * Looks for FY-year, quarter-FY-year, or month-year patterns.
 */
function extractFreshness(quote) {
  if (!quote || typeof quote !== 'string') {
    return { asOf: null, ageMonths: null, stale: false };
  }

  // Q3FY25 / Q1FY24 pattern
  const q = quote.match(/\b(Q[1-4]FY\d{2})\b/i);
  if (q) {
    const asOf = q[1].toUpperCase();
    const fyTwo = parseInt(asOf.slice(-2), 10);
    const quarter = parseInt(asOf[1], 10);
    // FY25 ends Mar 2025; Q1 ≈ Jun, Q2 ≈ Sep, Q3 ≈ Dec, Q4 ≈ Mar
    const baseYear = 2000 + fyTwo - 1; // FY25 -> calendar 2024 start
    const quarterEndMonths = { 1: 5, 2: 8, 3: 11, 4: 14 }; // months past Jan of baseYear
    const quarterEnd = new Date(baseYear, quarterEndMonths[quarter], 0);
    const ageMonths = monthsBetween(quarterEnd, new Date());
    return {
      asOf,
      ageMonths,
      stale: ageMonths > 12,
    };
  }

  // FY24 / FY2024 pattern
  const fy = quote.match(/\bFY(\d{2,4})\b/i);
  if (fy) {
    const yr = fy[1].length === 2 ? 2000 + parseInt(fy[1], 10) : parseInt(fy[1], 10);
    const asOf = `FY${yr % 100}`;
    // FY ends March of that calendar year
    const fyEnd = new Date(yr, 2, 31);
    const ageMonths = monthsBetween(fyEnd, new Date());
    return {
      asOf,
      ageMonths,
      stale: ageMonths > 24, // 5-yr metrics allowed older
    };
  }

  // Month YYYY pattern (e.g. "March 2025")
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const my = quote.match(new RegExp(`\\b(${MONTHS.join('|')})\\s+(20\\d{2})\\b`, 'i'));
  if (my) {
    const asOf = `${my[1]} ${my[2]}`;
    const monthIdx = MONTHS.findIndex(m => m.toLowerCase() === my[1].toLowerCase());
    const refDate = new Date(parseInt(my[2], 10), monthIdx, 1);
    const ageMonths = monthsBetween(refDate, new Date());
    return {
      asOf,
      ageMonths,
      stale: ageMonths > 12,
    };
  }

  return { asOf: null, ageMonths: null, stale: false };
}

function monthsBetween(earlier, later) {
  const ms = later.getTime() - earlier.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24 * 30.44));
}

/**
 * Find every numeric mention of a metric in a raw source text using
 * the metric's regex pattern.
 */
function extractAllNumericMentions(text, metricKey) {
  if (!text || typeof text !== 'string') return [];
  const pattern = METRIC_TEXT_PATTERNS[metricKey];
  if (!pattern) return [];
  const matches = [];
  // Re-create pattern to reset lastIndex (global regex stateful)
  const re = new RegExp(pattern.source, pattern.flags);
  let m;
  while ((m = re.exec(text)) !== null) {
    const num = parseFloat(m[1].replace(/,/g, ''));
    if (isFinite(num)) matches.push(num);
  }
  return matches;
}

/**
 * Decide consensus band from an array of numeric mentions.
 */
function computeConsensus(metricKey, valuesSeen) {
  if (!valuesSeen || valuesSeen.length === 0) {
    return { agreementBand: 'NOT_FOUND_IN_SOURCES', valuesSeen: [], spreadPct: null };
  }
  if (valuesSeen.length === 1) {
    return { agreementBand: 'SINGLE_SOURCE', valuesSeen, spreadPct: 0 };
  }
  const min = Math.min(...valuesSeen);
  const max = Math.max(...valuesSeen);
  const mean = valuesSeen.reduce((a, b) => a + b, 0) / valuesSeen.length;
  const spreadPct = mean !== 0 ? (Math.abs(max - min) / Math.abs(mean)) * 100 : 0;
  let agreementBand = 'LOW';
  if (spreadPct <= 5)        agreementBand = 'HIGH';
  else if (spreadPct <= 15)  agreementBand = 'MEDIUM';
  return { agreementBand, valuesSeen, spreadPct: Number(spreadPct.toFixed(1)) };
}

/**
 * Pull the raw value out of a metric — handles both object-shape (with .value)
 * and bare-string metrics (currentPrice, marketCap).
 */
function rawMetricValue(metric) {
  if (metric == null) return null;
  if (typeof metric === 'string' || typeof metric === 'number') return metric;
  if (typeof metric === 'object' && 'value' in metric) return metric.value;
  return null;
}

/**
 * Look up a critical metric's container (object or string) by key.
 */
function findMetricByKey(analysis, key) {
  if (analysis?.gate2a?.metrics?.[key] !== undefined)    return analysis.gate2a.metrics[key];
  if (analysis?.gate2c?.indicators?.[key] !== undefined) return analysis.gate2c.indicators[key];
  if (analysis?.gate3?.metrics?.[key] !== undefined)     return analysis.gate3.metrics[key];
  return null;
}

/**
 * Main entry point. Mutates the passed analysis (also returns it) by adding
 * an `analysis.verifications` flat map: { metricKey -> verification }.
 */
function verifyAnalysis(analysis, rawData) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  const verifications = {};
  const citations = analysis.citations || {};
  const sources = Array.isArray(rawData) ? rawData : [];

  for (const key of CRITICAL_METRICS) {
    const metric = findMetricByKey(analysis, key);
    const value = rawMetricValue(metric);
    if (value == null) continue; // skip metrics that weren't populated at all

    const citation = citations[key] || null;
    const sanity   = runSanityCheck(key, value);
    const freshness = citation?.quote ? extractFreshness(citation.quote) : { asOf: null, ageMonths: null, stale: false };

    // Gather numeric mentions across all sources for consensus
    const allMentions = [];
    for (const src of sources) {
      const mentions = extractAllNumericMentions(src?.data || '', key);
      allMentions.push(...mentions);
    }
    const consensus = computeConsensus(key, allMentions);

    // Verdict logic
    let verdict;
    if (sanity && sanity.passed === false) {
      verdict = 'IMPLAUSIBLE';
    } else if (!citation || !citation.quote) {
      verdict = 'UNSOURCED';
    } else if (consensus.agreementBand === 'LOW' || freshness.stale) {
      verdict = 'SOURCED_ONLY';
    } else {
      verdict = 'VERIFIED';
    }

    verifications[key] = {
      citation,
      sanity,
      consensus,
      freshness,
      refetched: false,
      verdict,
    };
  }

  analysis.verifications = verifications;
  return analysis;
}

module.exports = {
  parseMetricNumber,
  runSanityCheck,
  extractFreshness,
  extractAllNumericMentions,
  computeConsensus,
  verifyAnalysis,
  CRITICAL_METRICS,
  PLAUSIBILITY_RANGES,
  METRIC_TEXT_PATTERNS,
};
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd "C:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main"
node --test test/verification.test.js 2>&1 | tail -8
```

Expected: All tests pass (`fail 0`).

- [ ] **Step 3: Commit**

```bash
git add verification.js
git commit -m "Implement verification.js: pure sanity/consensus/freshness/verdict module"
```

---

## Task 3: Require citations in the analysis prompt

**Files:**
- Modify: `agent.js` (the `analysisPrompt` template in `runMarshallAnalysis`)

- [ ] **Step 1: Locate the existing MANDATORY block in agent.js**

```bash
grep -n "MANDATORY — Gate 3 fields that MUST be populated" agent.js
```

Note the line number returned.

- [ ] **Step 2: Replace the MANDATORY block to also require citations**

Find this block in `agent.js`:

```
MANDATORY — Gate 3 fields that MUST be populated from the search data above:
- gate3.metrics.currentPrice: STRING like "₹2,450" — use the LIVE price from Data Source 1 (today's date)
- gate3.metrics.marketCap: STRING like "₹1,23,456 Cr" — use the market cap from Data Source 1
- gate3.metrics.peRatio: OBJECT { "value": "25×", "status": "INFO" } — use P/E from Data Source 1
- gate3.metrics.priceBook: OBJECT { "value": "3.5x", "benchmark": "≤3×", "status": "PASS|FAIL|WARN" } — use P/B from Data Source 1
- gate3.metrics.dividendYield: OBJECT { "value": "1.2%", "status": "INFO" } — use dividend yield from Data Source 1
If Data Source 1 has no price, check all other sources. If genuinely not found, set value to "N/A — not found in search data" but keep the object shape — do NOT invent a number and do NOT change the field type.
```

Replace with:

```
MANDATORY — Gate 3 fields that MUST be populated from the search data above:
- gate3.metrics.currentPrice: STRING like "₹2,450" — use the LIVE price from Data Source 1 (today's date)
- gate3.metrics.marketCap: STRING like "₹1,23,456 Cr" — use the market cap from Data Source 1
- gate3.metrics.peRatio: OBJECT { "value": "25×", "status": "INFO" } — use P/E from Data Source 1
- gate3.metrics.priceBook: OBJECT { "value": "3.5x", "benchmark": "≤3×", "status": "PASS|FAIL|WARN" } — use P/B from Data Source 1
- gate3.metrics.dividendYield: OBJECT { "value": "1.2%", "status": "INFO" } — use dividend yield from Data Source 1
If Data Source 1 has no price, check all other sources. If genuinely not found, set value to "N/A — not found in search data" but keep the object shape — do NOT invent a number and do NOT change the field type.

MANDATORY — Source citations (anti-hallucination guard):
Include a top-level "citations" object in your JSON output that maps each critical metric key
to an object {"quote": "...", "sourceIndex": N}. The quote must be a verbatim snippet (≤ 200 chars)
copied from one of the numbered Data Sources above that supports the number you extracted.
sourceIndex is which Data Source (1-5) the quote came from.

Required citation keys (provide all that you populated; omit only if the metric is truly missing):
  roce5yr, roeLast, revenueCAGR5yr, patCAGR5yr, debtEquity, promoterPledge, ocfQuality,
  promoterHolding, currentPrice, marketCap, peRatio, priceBook

Do NOT fabricate citation quotes. If no source genuinely supports a value, omit that citation
entry — a missing citation will be flagged by the verification layer as UNSOURCED, which is
acceptable. Fabricating citations is far worse than admitting unsourced values.

Example:
"citations": {
  "roce5yr":      { "quote": "ROCE averaged 18.2% over the last 5 years", "sourceIndex": 2 },
  "currentPrice": { "quote": "Current price: ₹2,450 (as of today)", "sourceIndex": 1 },
  ...
}
```

- [ ] **Step 3: Syntax-check**

```bash
node --check agent.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add agent.js
git commit -m "Require citation snippets per critical metric in analysis prompt"
```

---

## Task 4: Call verifyAnalysis from agent.js

**Files:**
- Modify: `agent.js` (`runMarshallAnalysis` and `runUpdateAnalysis`)

- [ ] **Step 1: Import verification module at top of agent.js**

Find this line near the top of `agent.js`:

```javascript
const { computeConfidenceScore } = require('./confidence');
```

Add right below it:

```javascript
const { verifyAnalysis } = require('./verification');
```

- [ ] **Step 2: Call verifyAnalysis in runMarshallAnalysis**

Locate this section in `runMarshallAnalysis`:

```javascript
    // Override AI-extracted price/marketCap with deterministic Yahoo Finance data
    onProgress?.({ stage: 'processing', message: 'Fetching live market data...', progress: 90 });
    await enrichWithLiveMarketData(analysisResult);

    // Compute data-quality confidence score
    analysisResult.confidence = computeConfidenceScore(analysisResult);
```

Replace with:

```javascript
    // Override AI-extracted price/marketCap with deterministic Yahoo Finance data
    onProgress?.({ stage: 'processing', message: 'Fetching live market data...', progress: 88 });
    await enrichWithLiveMarketData(analysisResult);

    // Run Tier-1 verification (sanity, citations, cross-source consensus, freshness)
    onProgress?.({ stage: 'processing', message: 'Verifying data quality...', progress: 91 });
    verifyAnalysis(analysisResult, rawData);

    // Compute data-quality confidence score (now reads verification flags)
    analysisResult.confidence = computeConfidenceScore(analysisResult);
```

- [ ] **Step 3: Call verifyAnalysis in runUpdateAnalysis too**

Locate in `runUpdateAnalysis`:

```javascript
    // Enrich quarterly updates with live Yahoo data too
    onProgress?.({ stage: 'processing', message: 'Fetching live market data...', progress: 90 });
    await enrichWithLiveMarketData(analysisResult);

    // Compute confidence on updated analysis (no auto-retry for updates)
    analysisResult.confidence = computeConfidenceScore(analysisResult);
```

Replace with:

```javascript
    // Enrich quarterly updates with live Yahoo data too
    onProgress?.({ stage: 'processing', message: 'Fetching live market data...', progress: 88 });
    await enrichWithLiveMarketData(analysisResult);

    // Verify the updated analysis
    onProgress?.({ stage: 'processing', message: 'Verifying data quality...', progress: 91 });
    verifyAnalysis(analysisResult, freshData);

    // Compute confidence on updated analysis (no auto-retry for updates)
    analysisResult.confidence = computeConfidenceScore(analysisResult);
```

- [ ] **Step 4: Syntax-check + smoke-test verification on fake data**

```bash
node --check agent.js && node -e "
const { verifyAnalysis } = require('./verification');
const a = {
  ticker: 'X',
  gate2a: { metrics: { roce5yr: { value: '18%' } } },
  gate2c: { indicators: {} },
  gate3:  { metrics: { currentPrice: '₹450' } },
  citations: {
    roce5yr:      { quote: 'ROCE averaged 18.2% over FY24', sourceIndex: 1 },
    currentPrice: { quote: 'Current price ₹450', sourceIndex: 1 }
  }
};
verifyAnalysis(a, [{ data: 'ROCE was 18% in FY24 and current price ₹450' }]);
console.log('roce verdict:', a.verifications.roce5yr.verdict);
console.log('price verdict:', a.verifications.currentPrice.verdict);
"
```

Expected output:

```
roce verdict: VERIFIED
price verdict: VERIFIED
```

- [ ] **Step 5: Commit**

```bash
git add agent.js
git commit -m "Run verifyAnalysis after enrichment in both new + update flows"
```

---

## Task 5: Add Tier 2 selective re-fetch

**Files:**
- Modify: `agent.js` (`runMarshallAnalysis` — add Tier 2 step after `verifyAnalysis`)

- [ ] **Step 1: Add helper functions at the top of agent.js (after existing helpers)**

Locate the existing helper `function buildExpandedQueries` and add these two new functions **directly above** it:

```javascript
/**
 * Build a single focused web query for one specific metric that needs Tier 2 verification.
 */
function buildVerificationQuery(metricKey, ticker, companyName) {
  const templates = {
    roce5yr: {
      query: `site:screener.in ${ticker} ROCE 5 year average consolidated`,
      instruction: `Find the 5-year average ROCE % for ${companyName} (${ticker}) from screener.in. Return only the number with a one-sentence quote from the page.`,
    },
    currentPrice: {
      query: `${companyName} ${ticker} NSE current share price today live`,
      instruction: `Find today's current share price of ${companyName} (${ticker}) on NSE. Return the price in ₹ and the exact line you found it in.`,
    },
    marketCap: {
      query: `${companyName} ${ticker} market capitalisation NSE Cr today`,
      instruction: `Find the current market capitalisation of ${companyName} (${ticker}) in ₹ Cr. Return the number and the source line.`,
    },
    promoterPledge: {
      query: `${companyName} ${ticker} promoter pledge shareholding pattern latest`,
      instruction: `Find the latest promoter pledge % for ${companyName} (${ticker}) from the latest shareholding disclosure. Return the percentage and source line.`,
    },
    peRatio: {
      query: `site:screener.in ${ticker} P/E ratio TTM`,
      instruction: `Find the trailing twelve-month P/E ratio for ${companyName} (${ticker}) from screener.in. Return the P/E number and source line.`,
    },
    promoterHolding: {
      query: `${companyName} ${ticker} promoter holding shareholding pattern latest quarter`,
      instruction: `Find the latest promoter holding % for ${companyName} (${ticker}). Return the percentage and source line.`,
    },
    priceBook: {
      query: `site:screener.in ${ticker} price to book ratio`,
      instruction: `Find the current price-to-book ratio for ${companyName} (${ticker}) from screener.in. Return the P/B number and source line.`,
    },
    roeLast: {
      query: `site:screener.in ${ticker} ROE latest year consolidated`,
      instruction: `Find the latest annual ROE % for ${companyName} (${ticker}) from screener.in. Return the percentage and source line.`,
    },
    debtEquity: {
      query: `site:screener.in ${ticker} debt to equity ratio latest`,
      instruction: `Find the current debt-to-equity ratio for ${companyName} (${ticker}) from screener.in. Return the ratio and source line.`,
    },
  };
  return templates[metricKey] || null;
}

/**
 * Run Tier 2: for each critical metric that failed verification, fire one
 * focused web search and try to extract a better value. Capped at 3 calls.
 */
async function runTier2Refetch(analysis, ticker, companyName) {
  const { parseMetricNumber, runSanityCheck } = require('./verification');
  const verifications = analysis.verifications || {};
  // Priority: Gate 3 first (price/mcap most critical), then Gate 2a, then Gate 2c
  const priorityOrder = [
    'currentPrice', 'marketCap', 'peRatio', 'priceBook',
    'roce5yr', 'roeLast', 'debtEquity', 'promoterPledge', 'ocfQuality',
    'revenueCAGR5yr', 'patCAGR5yr',
    'promoterHolding',
  ];

  let refetchCount = 0;
  const REFETCH_CAP = 3;

  for (const metricKey of priorityOrder) {
    if (refetchCount >= REFETCH_CAP) break;
    const v = verifications[metricKey];
    if (!v) continue;
    const needsRefetch =
      v.verdict === 'IMPLAUSIBLE' ||
      v.verdict === 'UNSOURCED' ||
      v.consensus?.agreementBand === 'LOW';
    if (!needsRefetch) continue;

    const tmpl = buildVerificationQuery(metricKey, ticker, companyName);
    if (!tmpl) continue;

    try {
      console.log(`🔎 Tier-2 re-fetch for ${ticker}.${metricKey} (verdict was ${v.verdict})`);
      const text = await callSearchModel({ userContent: tmpl.instruction, maxTokens: 600 });
      // Parse a number out of the returned text using the verification module's logic
      const { extractAllNumericMentions } = require('./verification');
      const mentions = extractAllNumericMentions(text, metricKey);
      if (mentions.length > 0) {
        const newValue = mentions[0];
        const sanity = runSanityCheck(metricKey, newValue);
        if (sanity?.passed) {
          // Patch the metric value
          patchMetricValue(analysis, metricKey, newValue);
          v.refetched = true;
          v.refetchSource = 'single-query verification';
          v.refetchValue = newValue;
          v.sanity = sanity;
          // Re-evaluate verdict
          v.verdict = 'VERIFIED';
        }
      }
    } catch (err) {
      console.error(`Tier-2 re-fetch failed for ${metricKey}:`, err.message);
    }
    refetchCount += 1;
  }
}

/**
 * Patch a metric's value in-place, handling both object-shape and bare-string metrics.
 */
function patchMetricValue(analysis, key, newNumber) {
  const formatters = {
    currentPrice: (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
    marketCap:    (n) => `₹${Number(n.toFixed(0)).toLocaleString('en-IN')} Cr`,
    roce5yr:      (n) => `${n}%`,
    roeLast:      (n) => `${n}%`,
    revenueCAGR5yr: (n) => `${n}%`,
    patCAGR5yr:   (n) => `${n}%`,
    promoterHolding: (n) => `${n}%`,
    promoterPledge:  (n) => `${n}%`,
    ocfQuality:   (n) => `${n}%`,
    debtEquity:   (n) => `${n.toFixed(2)}x`,
    peRatio:      (n) => `${n.toFixed(1)}×`,
    priceBook:    (n) => `${n.toFixed(2)}x`,
  };
  const fmt = formatters[key];
  if (!fmt) return;
  const formatted = fmt(newNumber);

  // Gate 2a object-shape
  if (analysis.gate2a?.metrics?.[key]) {
    if (typeof analysis.gate2a.metrics[key] === 'object') {
      analysis.gate2a.metrics[key].value = formatted;
    } else {
      analysis.gate2a.metrics[key] = formatted;
    }
    return;
  }
  // Gate 2c
  if (analysis.gate2c?.indicators?.[key]) {
    if (typeof analysis.gate2c.indicators[key] === 'object') {
      analysis.gate2c.indicators[key].value = formatted;
    } else {
      analysis.gate2c.indicators[key] = formatted;
    }
    return;
  }
  // Gate 3 (currentPrice/marketCap are bare strings; peRatio/priceBook are objects)
  if (analysis.gate3?.metrics?.[key] !== undefined) {
    if (typeof analysis.gate3.metrics[key] === 'object') {
      analysis.gate3.metrics[key].value = formatted;
    } else {
      analysis.gate3.metrics[key] = formatted;
    }
  }
}
```

- [ ] **Step 2: Call runTier2Refetch in runMarshallAnalysis**

Find this section in `runMarshallAnalysis` (added in Task 4):

```javascript
    // Run Tier-1 verification (sanity, citations, cross-source consensus, freshness)
    onProgress?.({ stage: 'processing', message: 'Verifying data quality...', progress: 91 });
    verifyAnalysis(analysisResult, rawData);

    // Compute data-quality confidence score (now reads verification flags)
    analysisResult.confidence = computeConfidenceScore(analysisResult);
```

Replace with:

```javascript
    // Run Tier-1 verification (sanity, citations, cross-source consensus, freshness)
    onProgress?.({ stage: 'processing', message: 'Verifying data quality...', progress: 91 });
    verifyAnalysis(analysisResult, rawData);

    // Tier 2: selective re-fetch for failing critical metrics (capped at 3 calls)
    if (process.env.ENABLE_TIER2_REFETCH !== 'false') {
      const needsRefetch = Object.values(analysisResult.verifications || {})
        .some(v => v.verdict === 'IMPLAUSIBLE' || v.verdict === 'UNSOURCED' || v.consensus?.agreementBand === 'LOW');
      if (needsRefetch) {
        onProgress?.({ stage: 'processing', message: 'Re-fetching unverified metrics...', progress: 93 });
        await runTier2Refetch(analysisResult, ticker, companyName);
      }
    }

    // Compute data-quality confidence score (reads verification flags)
    analysisResult.confidence = computeConfidenceScore(analysisResult);
```

- [ ] **Step 3: Syntax-check**

```bash
node --check agent.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add agent.js
git commit -m "Add Tier 2 selective re-fetch (max 3 focused queries per analysis)"
```

---

## Task 6: Extend confidence signals with 3 verification-based checks

**Files:**
- Modify: `confidence.js`
- Modify: `test/confidence.test.js`

- [ ] **Step 1: Add 3 new signals to confidence.js**

Open `confidence.js` and find the `SIGNALS` object. After the existing `data_freshness_18_months` entry (the last one), add three new entries directly before the closing `}` of `SIGNALS`:

Find:

```javascript
  data_freshness_18_months: (a) => {
    if (!a?.analysisDate) return { passed: false, penalty: 10 };
    const ageMs = Date.now() - new Date(a.analysisDate).getTime();
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44);
    return { passed: ageMonths <= 18, penalty: 10 };
  },
};
```

Replace with:

```javascript
  data_freshness_18_months: (a) => {
    if (!a?.analysisDate) return { passed: false, penalty: 10 };
    const ageMs = Date.now() - new Date(a.analysisDate).getTime();
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44);
    return { passed: ageMonths <= 18, penalty: 10 };
  },

  // ─── Verification-derived signals (added 2026-05-17 with verification layer) ──

  // ≥ 80% of critical metrics with a value have a citation (i.e. verdict !== 'UNSOURCED')
  metrics_have_citations: (a) => {
    const v = a?.verifications;
    if (!v || Object.keys(v).length === 0) return { passed: false, penalty: 10 };
    const total = Object.keys(v).length;
    const cited = Object.values(v).filter(x => x.verdict !== 'UNSOURCED').length;
    return { passed: total === 0 ? false : (cited / total) >= 0.8, penalty: 10 };
  },

  // No critical metric is IMPLAUSIBLE (out of expected range = likely hallucination)
  metrics_pass_sanity: (a) => {
    const v = a?.verifications;
    if (!v) return { passed: false, penalty: 15 };
    const anyImplausible = Object.values(v).some(x => x.verdict === 'IMPLAUSIBLE');
    return { passed: !anyImplausible, penalty: 15 };
  },

  // ≥ 50% of metrics with consensus data show HIGH/MEDIUM agreement
  cross_source_consensus: (a) => {
    const v = a?.verifications;
    if (!v) return { passed: false, penalty: 10 };
    const withConsensus = Object.values(v).filter(x =>
      x.consensus &&
      x.consensus.agreementBand !== 'NOT_FOUND_IN_SOURCES' &&
      x.consensus.agreementBand !== 'SINGLE_SOURCE'
    );
    if (withConsensus.length === 0) return { passed: true, penalty: 10 }; // vacuous pass
    const good = withConsensus.filter(x =>
      x.consensus.agreementBand === 'HIGH' || x.consensus.agreementBand === 'MEDIUM'
    ).length;
    return { passed: (good / withConsensus.length) >= 0.5, penalty: 10 };
  },
};
```

- [ ] **Step 2: Add tests for the 3 new signals**

Open `test/confidence.test.js`. After the last existing test (which is `test('computedAt is an ISO timestamp', ...)`) add these tests at the end of the file:

```javascript

// ─── Verification-derived signals ──────────────────────────────────────────

test('metrics_have_citations passes when ≥80% have citation', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr:    { verdict: 'VERIFIED' },
    roeLast:    { verdict: 'VERIFIED' },
    debtEquity: { verdict: 'VERIFIED' },
    promoterPledge: { verdict: 'VERIFIED' },
    currentPrice:   { verdict: 'UNSOURCED' }, // 4/5 = 80% cited
  };
  const r = computeConfidenceScore(a);
  // No signal failures → still 100
  assert.equal(r.score, 100);
});

test('metrics_have_citations fails when < 80% have citation', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr:    { verdict: 'UNSOURCED' },
    roeLast:    { verdict: 'UNSOURCED' },
    debtEquity: { verdict: 'VERIFIED' },
  }; // 1/3 = 33% cited
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 90); // -10 for citations
});

test('metrics_pass_sanity fails when any IMPLAUSIBLE', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr: { verdict: 'IMPLAUSIBLE' },
  };
  const r = computeConfidenceScore(a);
  // -10 (citations: 0/1 cited) -15 (sanity) -10 (consensus vacuous pass — no consensus data) = -25... wait, vacuous PASS for consensus
  // Actually: citations: 0/1 = 0% cited (fails) -10, sanity fails -15, consensus passes (vacuous) → 100-25=75
  assert.equal(r.score, 75);
});

test('cross_source_consensus passes vacuously when no consensus data', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr: { verdict: 'VERIFIED', consensus: { agreementBand: 'NOT_FOUND_IN_SOURCES' } },
  };
  const r = computeConfidenceScore(a);
  // citations: 1/1 cited (passes), sanity passes (no IMPLAUSIBLE), consensus vacuous pass → 100
  assert.equal(r.score, 100);
});

test('cross_source_consensus fails when most LOW agreement', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  a.verifications = {
    roce5yr: { verdict: 'VERIFIED', consensus: { agreementBand: 'LOW' } },
    roeLast: { verdict: 'VERIFIED', consensus: { agreementBand: 'LOW' } },
  };
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 90); // -10 consensus
});

test('verification signals all fail when no verifications at all', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  // perfectAnalysis has no verifications field at all
  const r = computeConfidenceScore(a);
  // citations -10, sanity -15, consensus -10 = -35
  assert.equal(r.score, 65);
});
```

- [ ] **Step 3: Run tests**

```bash
node --test test/confidence.test.js 2>&1 | tail -5
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add confidence.js test/confidence.test.js
git commit -m "Add 3 verification-derived signals to confidence score (citations/sanity/consensus)"
```

---

## Task 7: Create VerificationBadge React component

**Files:**
- Create: `client/src/components/VerificationBadge.js`

- [ ] **Step 1: Write the component**

Write `client/src/components/VerificationBadge.js`:

```jsx
import React, { useState, useRef, useEffect } from 'react';

const STYLES = {
  VERIFIED:     { icon: '✓', colour: '#10b981', label: 'VERIFIED' },
  SOURCED_ONLY: { icon: 'ⓘ', colour: '#c9a84c', label: 'SOURCED_ONLY' },
  IMPLAUSIBLE:  { icon: '⚠', colour: '#ef4444', label: 'IMPLAUSIBLE' },
  UNSOURCED:    { icon: '?', colour: '#7a7a7a', label: 'UNSOURCED' },
  NONE:         { icon: '—', colour: '#5e5c58', label: 'NO DATA' },
};

export default function VerificationBadge({ verification, metricLabel }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!verification) {
    return (
      <span
        title="Verification data not available (pre-2026-05). Re-run analysis for full verification."
        style={{
          fontSize: 10, color: STYLES.NONE.colour, marginLeft: 6, opacity: 0.6,
          cursor: 'help', fontFamily: 'var(--font-mono)',
        }}
      >
        {STYLES.NONE.icon}
      </span>
    );
  }

  const s = STYLES[verification.verdict] || STYLES.NONE;
  const cit = verification.citation;

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block', marginLeft: 6 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          fontSize: 11, fontWeight: 700, color: s.colour,
          background: 'transparent', border: `1px solid ${s.colour}`,
          padding: '0 5px', borderRadius: 6, cursor: 'pointer',
          fontFamily: 'var(--font-mono)', lineHeight: '14px',
        }}
        title={`Verification: ${s.label}`}
      >
        {s.icon}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 12px', minWidth: 340, maxWidth: 420,
          zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          fontSize: 12, color: 'var(--text-2)', textAlign: 'left',
          fontFamily: 'var(--font-sans)',
        }}>
          <div style={{ fontWeight: 700, color: s.colour, marginBottom: 8 }}>
            {metricLabel || 'Metric'} · {s.label}
          </div>
          {cit?.quote && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Source quote (Data Source {cit.sourceIndex})
              </div>
              <div style={{ fontStyle: 'italic', borderLeft: '2px solid var(--border)', paddingLeft: 8, marginTop: 4 }}>
                "{cit.quote}"
              </div>
            </div>
          )}
          {!cit?.quote && verification.verdict === 'UNSOURCED' && (
            <div style={{ marginBottom: 8, color: 'var(--text-3)' }}>
              No citation provided by the AI for this metric.
            </div>
          )}
          {verification.sanity && (
            <Row
              ok={verification.sanity.passed}
              label="Plausibility"
              detail={verification.sanity.passed
                ? `${verification.sanity.parsedValue} within ${verification.sanity.expectedRange}`
                : `${verification.sanity.parsedValue} OUTSIDE ${verification.sanity.expectedRange}`}
            />
          )}
          {verification.consensus && verification.consensus.agreementBand !== 'NOT_FOUND_IN_SOURCES' && (
            <Row
              ok={verification.consensus.agreementBand === 'HIGH' || verification.consensus.agreementBand === 'MEDIUM' || verification.consensus.agreementBand === 'SINGLE_SOURCE'}
              label="Cross-source"
              detail={`${verification.consensus.agreementBand} (${verification.consensus.valuesSeen?.length || 0} mentions)`}
            />
          )}
          {verification.freshness?.asOf && (
            <Row
              ok={!verification.freshness.stale}
              label="Freshness"
              detail={`${verification.freshness.asOf} · ${verification.freshness.ageMonths} months old`}
            />
          )}
          {verification.refetched && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>
              ↻ Value was re-fetched via Tier 2 verification.
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function Row({ ok, label, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 0' }}>
      <span style={{ color: ok ? '#10b981' : '#ef4444', fontWeight: 700, width: 12 }}>
        {ok ? '✓' : '✕'}
      </span>
      <span style={{ color: 'var(--text-3)', minWidth: 92 }}>{label}</span>
      <span style={{ color: ok ? 'var(--text-2)' : '#ef4444' }}>{detail}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify syntax (brace balance)**

```bash
node -e "
const fs=require('fs');
const c=fs.readFileSync('client/src/components/VerificationBadge.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log('braces:',o,'==',cl,'parens:',p,'==',pl, (o===cl && p===pl)?'OK':'FAIL');
"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/VerificationBadge.js
git commit -m "Add VerificationBadge React component with citation popover"
```

---

## Task 8: Wire VerificationBadge into AnalysisView

**Files:**
- Modify: `client/src/pages/AnalysisView.js`

- [ ] **Step 1: Import the new component**

Find this line near the top of `AnalysisView.js`:

```javascript
import ConfidenceShield from '../components/ConfidenceShield';
```

Add directly below:

```javascript
import VerificationBadge from '../components/VerificationBadge';
```

- [ ] **Step 2: Update MetricRow to accept and render verification**

Find this existing function at the top of the file:

```javascript
function MetricRow({ label, value, benchmark, status }) {
  return (
    <div className="metric-row">
      <span className="metric-row-label">{label}</span>
      <span className="metric-row-value font-mono" style={{ color: statusColor(status) }}>{value || '—'}</span>
      {benchmark && <span className="metric-row-bench">{benchmark}</span>}
      {status && <span className={`status-pill status-${status}`}>{status}</span>}
    </div>
  );
}
```

Replace with:

```javascript
function MetricRow({ label, value, benchmark, status, verification, showVerification }) {
  return (
    <div className="metric-row">
      <span className="metric-row-label">
        {label}
        {showVerification && <VerificationBadge verification={verification} metricLabel={label} />}
      </span>
      <span className="metric-row-value font-mono" style={{ color: statusColor(status) }}>{value || '—'}</span>
      {benchmark && <span className="metric-row-bench">{benchmark}</span>}
      {status && <span className={`status-pill status-${status}`}>{status}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Pass verification into Gate 3 metric rows**

Find the Gate 3 rendering block (the one with `Object.entries(gate3.metrics).map`):

```javascript
                {Object.entries(gate3.metrics).map(([k, m]) => {
                  // currentPrice and marketCap are plain strings in the schema; others are {value, benchmark, status} objects
                  const isString = typeof m === 'string' || typeof m === 'number';
                  return (
                    <MetricRow
                      key={k}
                      label={formatMetricLabel(k)}
                      value={isString ? m : m?.value}
                      benchmark={isString ? null : m?.benchmark}
                      status={isString ? null : m?.status}
                    />
                  );
                })}
```

Replace with:

```javascript
                {Object.entries(gate3.metrics).map(([k, m]) => {
                  const isString = typeof m === 'string' || typeof m === 'number';
                  return (
                    <MetricRow
                      key={k}
                      label={formatMetricLabel(k)}
                      value={isString ? m : m?.value}
                      benchmark={isString ? null : m?.benchmark}
                      status={isString ? null : m?.status}
                      verification={analysis.verifications?.[k]}
                      showVerification={true}
                    />
                  );
                })}
```

- [ ] **Step 4: Pass verification into Gate 2a metric rows**

Find the Gate 2a rendering block. Search for `gate2a.metrics` and `Object.entries`. The pattern looks like:

```javascript
                {Object.entries(gate2a.metrics).map(([k, m]) => (
                  <MetricRow key={k} label={formatMetricLabel(k)} value={m.value} benchmark={m.benchmark} status={m.status} />
                ))}
```

Replace with:

```javascript
                {Object.entries(gate2a.metrics).map(([k, m]) => (
                  <MetricRow
                    key={k}
                    label={formatMetricLabel(k)}
                    value={m?.value}
                    benchmark={m?.benchmark}
                    status={m?.status}
                    verification={analysis.verifications?.[k]}
                    showVerification={true}
                  />
                ))}
```

- [ ] **Step 5: Pass verification into Gate 2c indicator rows**

Find the Gate 2c rendering block (`gate2c.indicators` Object.entries):

```javascript
                {Object.entries(gate2c.indicators).map(([k, i]) => (
                  <MetricRow key={k} label={formatMetricLabel(k)} value={i.value} status={i.status} />
                ))}
```

Replace with:

```javascript
                {Object.entries(gate2c.indicators).map(([k, i]) => (
                  <MetricRow
                    key={k}
                    label={formatMetricLabel(k)}
                    value={i?.value}
                    status={i?.status}
                    verification={analysis.verifications?.[k]}
                    showVerification={true}
                  />
                ))}
```

- [ ] **Step 6: Add one-line summary above Gate 2a when issues exist**

Find the Gate 2a rendering wrapper (the GateSection for Gate 2a). Right after the `<GateSection ...>` opening tag and before any inner content, insert:

```javascript
          {analysis.verifications && (() => {
            const vs = Object.values(analysis.verifications);
            const implausible = vs.filter(v => v.verdict === 'IMPLAUSIBLE').length;
            const unsourced  = vs.filter(v => v.verdict === 'UNSOURCED').length;
            const stale      = vs.filter(v => v.freshness?.stale).length;
            const issues     = implausible + unsourced + stale;
            if (issues === 0) return null;
            const parts = [];
            if (implausible) parts.push(`${implausible} IMPLAUSIBLE`);
            if (unsourced)   parts.push(`${unsourced} UNSOURCED`);
            if (stale)       parts.push(`${stale} stale`);
            return (
              <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, padding: '8px 12px', marginBottom: 12,
                fontSize: 12, color: '#ef4444',
              }}>
                ⚠ Verification: {parts.join(' · ')}. Hover any metric badge for details. Re-run for fresh data.
              </div>
            );
          })()}
```

The exact insertion point: directly inside `<GateSection number="Gate 2a" ...>` as the first child.

To find the exact location, search for `gate2a &&` in the file and look at the matching JSX block.

- [ ] **Step 7: Brace + paren balance check**

```bash
node -e "
const fs=require('fs');
const c=fs.readFileSync('client/src/pages/AnalysisView.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log('braces:',o,'==',cl,'parens:',p,'==',pl, (o===cl && p===pl)?'OK':'FAIL');
"
```

Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/AnalysisView.js
git commit -m "Wire VerificationBadge into Gate 2a/2c/3 metric rows + verification summary"
```

---

## Task 9: Update backfill endpoint to compute verification

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Import verifyAnalysis in index.js**

Find this line:

```javascript
const { computeConfidenceScore } = require('./confidence');
```

Add right below:

```javascript
const { verifyAnalysis } = require('./verification');
```

- [ ] **Step 2: Extend the backfill endpoint**

Find the backfill endpoint:

```javascript
app.post('/api/admin/backfill-confidence', requireAdmin, async (req, res) => {
  try {
    const analyses = await getAllAnalyses();
    const results = { updated: 0, errors: [], bands: { HIGH: 0, MEDIUM: 0, LOW: 0 } };
    for (const row of analyses) {
      try {
        const full = await getAnalysis(row.ticker);
        if (!full) continue;
        const confidence = computeConfidenceScore(full);
        full.confidence = confidence;
        await saveAnalysis(full);
        await saveFundamentalMetrics(full);
        cache.del(`analysis_${row.ticker}`);
        results.updated++;
        results.bands[confidence.band]++;
      } catch (e) {
        results.errors.push({ ticker: row.ticker, error: e.message });
      }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Replace with:

```javascript
app.post('/api/admin/backfill-confidence', requireAdmin, async (req, res) => {
  try {
    const analyses = await getAllAnalyses();
    const results = { updated: 0, errors: [], bands: { HIGH: 0, MEDIUM: 0, LOW: 0 } };
    for (const row of analyses) {
      try {
        const full = await getAnalysis(row.ticker);
        if (!full) continue;
        // Run sanity verification on saved values (no API calls).
        // Older analyses won't have citations or rawData, so consensus/freshness/citation
        // will be empty — but sanity still works on the saved numbers.
        verifyAnalysis(full, []);
        const confidence = computeConfidenceScore(full);
        full.confidence = confidence;
        await saveAnalysis(full);
        await saveFundamentalMetrics(full);
        cache.del(`analysis_${row.ticker}`);
        results.updated++;
        results.bands[confidence.band]++;
      } catch (e) {
        results.errors.push({ ticker: row.ticker, error: e.message });
      }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Syntax check**

```bash
node --check index.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add index.js
git commit -m "Backfill endpoint now also computes sanity verification on old analyses"
```

---

## Task 10: Update Admin Panel button label + verification + push

**Files:**
- Modify: `client/src/pages/AdminPanel.js`

- [ ] **Step 1: Update the Backfill Confidence card text**

Find this block in `AdminPanel.js`:

```javascript
              <h2 style={styles.cardTitle}>Backfill Confidence Scores</h2>
              <p style={styles.cardSubtitle}>
                Run once to compute a 0–100 data-quality confidence score for every existing analysis. No API calls — just re-scores from saved JSON. New analyses get scored automatically. LOW-confidence analyses can be re-run from the analysis page.
              </p>
```

Replace with:

```javascript
              <h2 style={styles.cardTitle}>Backfill Verification + Confidence</h2>
              <p style={styles.cardSubtitle}>
                Run once to compute sanity verification (plausibility checks) and confidence scores for every existing analysis. No API calls — just re-scores from saved JSON. Older analyses won't have full citation/consensus data but will get sanity-checked. New analyses get verified automatically with all checks.
              </p>
```

Find the button label:

```javascript
            {confidenceLoading ? 'Scoring analyses…' : '🛡 Backfill Confidence Scores'}
```

Replace with:

```javascript
            {confidenceLoading ? 'Verifying analyses…' : '🛡 Backfill Verification + Confidence'}
```

- [ ] **Step 2: Brace + paren balance check**

```bash
node -e "
const fs=require('fs');
const c=fs.readFileSync('client/src/pages/AdminPanel.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log('braces:',o,'==',cl,'parens:',p,'==',pl, (o===cl && p===pl)?'OK':'FAIL');
"
```

Expected: `OK`.

- [ ] **Step 3: Run full test suite**

```bash
node --test test/ 2>&1 | tail -8
```

Expected: all tests pass, `fail 0`.

- [ ] **Step 4: All-file syntax check**

```bash
node --check confidence.js && node --check verification.js && node --check agent.js && node --check db.js && node --check index.js && echo "All backend OK"
```

Expected: `All backend OK`.

- [ ] **Step 5: Commit + push everything**

```bash
git add client/src/pages/AdminPanel.js
git commit -m "Update Admin Panel button to reflect verification + confidence backfill"
git push origin main
```

- [ ] **Step 6: Manual smoke test against the deployed app**

After Render finishes the rebuild (~3-5 min):

1. Open the Admin Panel and click **🛡 Backfill Verification + Confidence**. Wait for the success message. Verify the response shows band counts.
2. Open any analysis page. Hover any metric in Gate 2a/3 — you should see a tiny badge (✓/ⓘ/⚠/—) next to the label.
3. Click the badge — popover shows sanity-check result. Older analyses will show "Verification data not available" tooltip on the grey "—" badge.
4. Run a NEW analysis on a mid-cap (e.g. POLYCAB). Watch progress for new stages ("Verifying data quality...", possibly "Re-fetching unverified metrics..."). When complete, every critical metric should have a green ✓ badge with a citation quote visible on hover.
5. Open the analysis JSON via DevTools network tab — verify `verifications` block and `citations` block exist.

If any badge is unexpectedly red ⚠ on a sanity-passing metric, that's a real flag and worth investigating — exactly what the layer was built to surface.

---

## Self-Review Notes

**Spec coverage verified:**

- ✅ Section 1 (citations) — Task 3 (prompt) + Task 4 (verifyAnalysis reads them)
- ✅ Section 2 (plausibility ranges) — Task 2 (runSanityCheck + PLAUSIBILITY_RANGES)
- ✅ Section 3 (cross-source consensus) — Task 2 (extractAllNumericMentions + computeConsensus)
- ✅ Section 4 (freshness extraction) — Task 2 (extractFreshness)
- ✅ Section 5 (Tier 2 re-fetch) — Task 5 (runTier2Refetch with 3-call cap + priority order)
- ✅ Section 6 (UI badge) — Tasks 7 (component) + 8 (integration)
- ✅ Section 7 (confidence signals) — Task 6 (3 new signals + tests)
- ✅ Section 8 (backfill) — Task 9 (extends existing endpoint)
- ✅ Section 9 (backward compat) — VerificationBadge handles missing verification gracefully
- ✅ Section 10 (acceptance criteria) — Task 10 smoke test covers all 7

**Type/name consistency:**

- `verifications` (plural, flat map keyed by metric key) used consistently in verification.js, confidence.js, AnalysisView.js
- `citations` (plural, top-level on analysis JSON) consistent in agent.js prompt and verification.js consumer
- Verdict enum (`VERIFIED`/`SOURCED_ONLY`/`UNSOURCED`/`IMPLAUSIBLE`) consistent in verification.js, ConfidenceShield (n/a), VerificationBadge, AnalysisView summary line
- Signal names (`metrics_have_citations`/`metrics_pass_sanity`/`cross_source_consensus`) consistent in confidence.js + confidence.test.js
- `CRITICAL_METRICS` list of 12 used consistently across verification.js + confidence.js consumers
- Tier 2 cap of 3 consistent across spec, task 5, and acceptance criteria
