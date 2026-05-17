# Data Quality Confidence Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute a 0-100 confidence score on every analysis from objective signals, auto-retry low-confidence analyses on creation, and surface a HIGH/MEDIUM/LOW shield throughout the UI so users know how much to trust each Marshall verdict.

**Architecture:** Pure rules-based scoring module (no I/O, no AI) consumed by the existing `runMarshallAnalysis` pipeline. Score lives on the analysis JSON; two additional columns on `fundamental_metrics` enable SQL-level filtering. New React `ConfidenceShield` component is shared between the analysis detail page and dashboard table.

**Tech Stack:** Node 18.19 (built-in `node:test` runner), Express, React, Supabase (Postgres).

**Spec:** `docs/superpowers/specs/2026-05-17-confidence-score-design.md`

---

## File Structure

**New files:**
- `confidence.js` — pure scoring module (one responsibility: compute score)
- `test/confidence.test.js` — unit tests using `node:test`
- `db_migrations/2026-05-17-add-confidence-columns.sql` — one-time DDL
- `client/src/components/ConfidenceShield.js` — shared UI badge with breakdown popover

**Modified files:**
- `package.json` — add `test` script
- `agent.js` — invoke `computeConfidenceScore`, implement auto-retry on attempt 1
- `db.js` — persist `confidence_score` and `confidence_band` columns
- `index.js` — add `POST /api/admin/backfill-confidence` endpoint
- `client/src/pages/AnalysisView.js` — shield badge next to verdict + re-run button
- `client/src/pages/Dashboard.js` — confidence column, filter option, CSV columns, stat chip

---

## Task 1: Add SQL migration file and apply it

**Files:**
- Create: `db_migrations/2026-05-17-add-confidence-columns.sql`

- [ ] **Step 1: Create the migration directory and file**

```bash
mkdir -p db_migrations
```

Write `db_migrations/2026-05-17-add-confidence-columns.sql`:

```sql
-- Adds confidence score columns to fundamental_metrics for SQL-level filtering.
-- Run once in Supabase SQL editor before deploying the confidence-score feature.

ALTER TABLE fundamental_metrics
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS confidence_band  TEXT;

CREATE INDEX IF NOT EXISTS idx_fundamental_metrics_confidence_band
  ON fundamental_metrics (confidence_band);
```

- [ ] **Step 2: Apply migration in Supabase**

Open the Supabase project at https://app.supabase.com, go to **SQL Editor**, paste the contents of the file above, click **Run**. Verify with:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'fundamental_metrics'
  AND column_name IN ('confidence_score', 'confidence_band');
```

Expected: two rows returned.

- [ ] **Step 3: Commit**

```bash
git add db_migrations/2026-05-17-add-confidence-columns.sql
git commit -m "Add SQL migration for confidence_score/confidence_band columns"
```

---

## Task 2: Write failing tests for the scoring module

**Files:**
- Modify: `package.json` — add `test` script
- Create: `test/confidence.test.js`

- [ ] **Step 1: Add test script to package.json**

Edit `package.json` scripts section to add a `test` line:

```json
"scripts": {
  "build": "cd client && npm install && npm run build",
  "start": "npm install && node index.js",
  "install:all": "npm install && cd client && npm install",
  "test": "node --test test/"
}
```

- [ ] **Step 2: Create test/ directory and write the failing test file**

```bash
mkdir -p test
```

Write `test/confidence.test.js`:

```javascript
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
  assert.equal(r.breakdown.length, 8);
  assert.ok(r.breakdown.every(b => b.passed));
});

test('empty analysis scores 0 (LOW) with all 8 signals failing', () => {
  const r = computeConfidenceScore({});
  assert.equal(r.score, 0);
  assert.equal(r.band, 'LOW');
  assert.ok(r.breakdown.every(b => !b.passed));
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
  // Pick a date deterministically > 18 months before the test runs.
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  a.analysisDate = d.toISOString().split('T')[0];
  const r = computeConfidenceScore(a);
  assert.equal(r.score, 90);
});

test('multiple failures stack penalties', () => {
  const a = JSON.parse(JSON.stringify(perfectAnalysis));
  delete a.liveQuote.price;            // -25
  delete a.liveQuote.marketCap;        // -15
  a.gate2a.financialsType = 'STANDALONE'; // -15
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
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm test
```

Expected: All tests fail with `Cannot find module '../confidence'`.

- [ ] **Step 4: Commit**

```bash
git add package.json test/confidence.test.js
git commit -m "Add failing tests for confidence score module"
```

---

## Task 3: Implement confidence.js to make tests pass

**Files:**
- Create: `confidence.js`

- [ ] **Step 1: Write the minimal implementation**

Write `confidence.js`:

```javascript
/**
 * Pure rules-based data-quality confidence scoring.
 * No I/O, no external calls. Takes an analysis JSON object and returns
 * { score, band, breakdown, computedAt }.
 *
 * Score starts at 100 and subtracts a penalty for each failing signal.
 * Final score is clamped to [0, 100].
 *
 * To add or remove a signal, edit the SIGNALS object below.
 */

// Critical metric keys whose `confidence: LOW` flags count toward the
// `critical_metrics_high_confidence` signal.
const CRITICAL_METRIC_KEYS = [
  'roce5yr', 'roeLast', 'revenueCAGR5yr', 'patCAGR5yr',
  'debtEquity', 'promoterPledge', 'ocfQuality', 'promoterHolding',
];

const SIGNALS = {
  live_price: (a) => ({
    passed: a?.liveQuote?.price != null && a.liveQuote.price > 0,
    penalty: 25,
  }),

  live_market_cap: (a) => ({
    passed: a?.liveQuote?.marketCap != null && a.liveQuote.marketCap > 0,
    penalty: 15,
  }),

  roce_years_of_data_gte_3: (a) => {
    const y = a?.gate2a?.metrics?.roce5yr?.yearsOfData;
    return { passed: typeof y === 'number' && y >= 3, penalty: 20 };
  },

  consolidated_financials: (a) => ({
    passed: a?.gate2a?.financialsType === 'CONSOLIDATED',
    penalty: 15,
  }),

  gate2a_confidence_high: (a) => {
    const dc = a?.gate2a?.dataConfidence;
    return { passed: dc === 'HIGH' || dc === 'MEDIUM', penalty: 15 };
  },

  critical_metrics_high_confidence: (a) => {
    const pool = {
      ...(a?.gate2a?.metrics    || {}),
      ...(a?.gate2c?.indicators || {}),
    };
    const lowCount = CRITICAL_METRIC_KEYS
      .map(k => pool[k])
      .filter(m => m && typeof m === 'object' && m.confidence === 'LOW')
      .length;
    return { passed: lowCount < 3, penalty: 10 };
  },

  search_queries_returned: (a) => ({
    passed: (a?.rawDataSources ?? 0) >= 4,
    penalty: 10,
  }),

  data_freshness_18_months: (a) => {
    if (!a?.analysisDate) return { passed: false, penalty: 10 };
    const ageMs = Date.now() - new Date(a.analysisDate).getTime();
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44);
    return { passed: ageMonths <= 18, penalty: 10 };
  },
};

function bandForScore(score) {
  if (score >= 80) return 'HIGH';
  if (score >= 60) return 'MEDIUM';
  return 'LOW';
}

function computeConfidenceScore(analysis) {
  const breakdown = [];
  let totalPenalty = 0;

  for (const [name, fn] of Object.entries(SIGNALS)) {
    const result = fn(analysis);
    breakdown.push({
      signal: name,
      passed: result.passed,
      penalty: result.passed ? 0 : result.penalty,
    });
    if (!result.passed) totalPenalty += result.penalty;
  }

  const score = Math.max(0, 100 - totalPenalty);
  return {
    score,
    band: bandForScore(score),
    breakdown,
    computedAt: new Date().toISOString(),
  };
}

module.exports = {
  computeConfidenceScore,
  bandForScore,
  SIGNALS,
  CRITICAL_METRIC_KEYS,
};
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
npm test
```

Expected: All 15 tests pass.

- [ ] **Step 3: Commit**

```bash
git add confidence.js
git commit -m "Implement confidence.js: 8-signal rules-based scoring"
```

---

## Task 4: Wire confidence into runMarshallAnalysis with auto-retry

**Files:**
- Modify: `agent.js` — function `fetchCompanyData` (accept prependQueries) and `runMarshallAnalysis` (compute + retry)

- [ ] **Step 1: Update fetchCompanyData to accept extra queries**

Locate `fetchCompanyData` in `agent.js` (currently around line 117) and update the signature and array assembly:

Find:

```javascript
async function fetchCompanyData(ticker, companyName) {
```

Replace with:

```javascript
async function fetchCompanyData(ticker, companyName, prependQueries = []) {
```

Then, inside the function, find the line that loops over `searches`:

```javascript
  for (const { query, instruction } of searches) {
```

And replace with:

```javascript
  const allSearches = [...prependQueries, ...searches];
  for (const { query, instruction } of allSearches) {
```

- [ ] **Step 2: Import confidence module at top of agent.js**

Find this near the top of `agent.js`:

```javascript
const { MARSHALL_SYSTEM_PROMPT } = require('./marshallPrompt');
```

Add right below it:

```javascript
const { computeConfidenceScore } = require('./confidence');
```

- [ ] **Step 3: Add confidence computation + auto-retry in runMarshallAnalysis**

Locate the end of `runMarshallAnalysis` (after `await enrichWithLiveMarketData(analysisResult);`):

Find:

```javascript
    // Override AI-extracted price/marketCap with deterministic Yahoo Finance data
    // (AI extraction is unreliable for mid/small caps — Yahoo is the source of truth)
    onProgress?.({ stage: 'processing', message: 'Fetching live market data...', progress: 92 });
    await enrichWithLiveMarketData(analysisResult);

    onProgress?.({ stage: 'complete', message: 'Analysis complete!', progress: 100 });

    return { success: true, analysis: analysisResult };
```

Replace with:

```javascript
    // Override AI-extracted price/marketCap with deterministic Yahoo Finance data
    onProgress?.({ stage: 'processing', message: 'Fetching live market data...', progress: 90 });
    await enrichWithLiveMarketData(analysisResult);

    // Compute data-quality confidence score
    analysisResult.confidence = computeConfidenceScore(analysisResult);
    console.log(`📊 Confidence for ${ticker}: ${analysisResult.confidence.score}/100 (${analysisResult.confidence.band})`);

    // Auto-retry once if first attempt produced LOW confidence
    const attempt = arguments[3]?.attempt || 1;
    if (analysisResult.confidence.band === 'LOW' && attempt === 1) {
      onProgress?.({ stage: 'gates', message: 'Low confidence — retrying with deeper search...', progress: 92 });
      console.log(`⚠️  Auto-retrying ${ticker} for higher confidence`);

      const failed = new Set(
        analysisResult.confidence.breakdown.filter(b => !b.passed).map(b => b.signal)
      );
      const extraQueries = buildExpandedQueries(ticker, companyName, failed);

      const retry = await runMarshallAnalysis(ticker, companyName, onProgress, {
        attempt: 2,
        extraQueries,
      });

      if (retry?.success && retry.analysis.confidence.score > analysisResult.confidence.score) {
        retry.analysis.confidence.retryUsed = true;
        onProgress?.({ stage: 'complete', message: 'Analysis complete (retried)!', progress: 100 });
        return retry;
      }
      analysisResult.confidence.retryUsed = true;
      analysisResult.confidence.retryNotImproved = true;
    }

    onProgress?.({ stage: 'complete', message: 'Analysis complete!', progress: 100 });
    return { success: true, analysis: analysisResult };
```

- [ ] **Step 4: Add buildExpandedQueries helper and accept opts on runMarshallAnalysis**

Find the current signature of runMarshallAnalysis:

```javascript
async function runMarshallAnalysis(ticker, companyName, onProgress) {
```

Replace with:

```javascript
async function runMarshallAnalysis(ticker, companyName, onProgress, opts = {}) {
```

Find the call site near the top of the function:

```javascript
    const rawData = await fetchCompanyData(ticker, companyName);
```

Replace with:

```javascript
    const rawData = await fetchCompanyData(ticker, companyName, opts.extraQueries || []);
```

Now add `buildExpandedQueries` as a module-level helper. Place it directly above `runMarshallAnalysis` definition:

```javascript
/**
 * Returns extra search queries to prepend on a retry attempt, chosen
 * based on which confidence signals failed on attempt 1.
 */
function buildExpandedQueries(ticker, companyName, failedSignals) {
  const cy = new Date().getFullYear();
  const out = [];

  if (failedSignals.has('live_price')) {
    out.push({
      query: `site:moneycontrol.com ${ticker} current share price live`,
      instruction: `Find the LIVE current share price of ${companyName} (${ticker}) on moneycontrol.com or NSE India. Return only the price in ₹ and the timestamp it was last updated.`,
    });
  }

  if (failedSignals.has('roce_years_of_data_gte_3')) {
    out.push({
      query: `site:screener.in ${ticker} 10 years financials profit loss balance sheet`,
      instruction: `Extract at least 5 years of financial data for ${companyName} (${ticker}) from screener.in. Return Revenue, EBITDA, PAT, ROCE %, ROE % for each year FY${cy - 5} through FY${cy}.`,
    });
  }

  if (failedSignals.has('consolidated_financials')) {
    out.push({
      query: `${companyName} consolidated annual report FY${cy} subsidiary structure`,
      instruction: `Find CONSOLIDATED (not standalone) annual financials for ${companyName}. State the subsidiary structure and confirm whether the latest reported figures include all subsidiaries. Return revenue, profit, ROCE, debt at consolidated level.`,
    });
  }

  if (failedSignals.has('live_market_cap')) {
    out.push({
      query: `${companyName} ${ticker} market capitalisation today ₹ Cr NSE`,
      instruction: `Find the current market capitalisation of ${companyName} (${ticker}) in ₹ Cr from NSE India, Bloomberg, or Reuters. Return just the number with the source.`,
    });
  }

  return out;
}
```

- [ ] **Step 5: Apply the same enrichment to runUpdateAnalysis**

Find in `runUpdateAnalysis`:

```javascript
    // Enrich quarterly updates with live Yahoo data too
    onProgress?.({ stage: 'processing', message: 'Fetching live market data...', progress: 92 });
    await enrichWithLiveMarketData(analysisResult);

    onProgress?.({ stage: 'complete', message: 'Update complete!', progress: 100 });
```

Replace with:

```javascript
    // Enrich quarterly updates with live Yahoo data too
    onProgress?.({ stage: 'processing', message: 'Fetching live market data...', progress: 90 });
    await enrichWithLiveMarketData(analysisResult);

    // Compute confidence on updated analysis (no auto-retry for updates — they reuse old data)
    analysisResult.confidence = computeConfidenceScore(analysisResult);
    console.log(`📊 Confidence for ${ticker} update: ${analysisResult.confidence.score}/100 (${analysisResult.confidence.band})`);

    onProgress?.({ stage: 'complete', message: 'Update complete!', progress: 100 });
```

- [ ] **Step 6: Syntax-check agent.js**

```bash
node --check agent.js
```

Expected: no output (success).

- [ ] **Step 7: Smoke-test confidence integration without running a full analysis**

Create a one-off test script `test/_smoke_agent.js` (gitignored — we delete after):

```javascript
const { computeConfidenceScore } = require('../confidence');

const fakeAnalysis = {
  liveQuote: { price: 450 }, // no marketCap — should subtract 15
  gate2a: {
    financialsType: 'STANDALONE', // -15
    dataConfidence: 'HIGH',
    metrics: { roce5yr: { yearsOfData: 5 } },
  },
  gate2c: {},
  rawDataSources: 5,
  analysisDate: new Date().toISOString().split('T')[0],
};

const r = computeConfidenceScore(fakeAnalysis);
console.log('score:', r.score, 'band:', r.band);
console.assert(r.score === 70, 'Expected 70, got ' + r.score);
console.assert(r.band === 'MEDIUM', 'Expected MEDIUM, got ' + r.band);
console.log('✅ smoke test passed');
```

Run:

```bash
node test/_smoke_agent.js
```

Expected output: `score: 70 band: MEDIUM` and `✅ smoke test passed`.

Then delete the smoke file:

```bash
rm test/_smoke_agent.js
```

- [ ] **Step 8: Commit**

```bash
git add agent.js
git commit -m "Compute confidence score after every analysis + auto-retry once if LOW"
```

---

## Task 5: Persist confidence to fundamental_metrics

**Files:**
- Modify: `db.js` — function `saveFundamentalMetrics`

- [ ] **Step 1: Add confidence columns to the row object**

Locate `saveFundamentalMetrics` in `db.js`. Find the `row` object construction. Find the closing of the row object:

```javascript
      // Entry zone
      entry_zone_low:       null,
      entry_zone_high:      null,
    };
```

Replace with:

```javascript
      // Entry zone
      entry_zone_low:       null,
      entry_zone_high:      null,

      // Data quality confidence (added 2026-05-17)
      confidence_score:     analysis.confidence?.score ?? null,
      confidence_band:      analysis.confidence?.band  ?? null,
    };
```

- [ ] **Step 2: Syntax-check db.js**

```bash
node --check db.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add db.js
git commit -m "Persist confidence_score and confidence_band to fundamental_metrics"
```

---

## Task 6: Add backfill endpoint for existing analyses

**Files:**
- Modify: `index.js` — add new admin endpoint

- [ ] **Step 1: Import confidence module at top of index.js**

Find the existing requires near the top of `index.js`:

```javascript
const { extractWatchFromAnalysis, runDailyPriceCheck } = require('./priceCheck');
```

Add right below it:

```javascript
const { computeConfidenceScore } = require('./confidence');
```

- [ ] **Step 2: Add backfill endpoint**

Find the existing admin backfill endpoint for metrics:

```javascript
// ─── Admin: backfill fundamental_metrics from all saved analyses ──────────────
app.post('/api/admin/backfill-metrics', requireAdmin, async (req, res) => {
```

Add this new endpoint directly above it:

```javascript
// ─── Admin: backfill confidence scores onto all existing analyses ────────────
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

- [ ] **Step 3: Syntax-check index.js**

```bash
node --check index.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add index.js
git commit -m "Add /api/admin/backfill-confidence endpoint"
```

---

## Task 7: Create ConfidenceShield React component

**Files:**
- Create: `client/src/components/ConfidenceShield.js`

- [ ] **Step 1: Create the components directory and component**

```bash
mkdir -p client/src/components
```

Write `client/src/components/ConfidenceShield.js`:

```jsx
import React, { useState, useRef, useEffect } from 'react';

const COLOURS = {
  HIGH:   { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#10b981' },
  MEDIUM: { bg: 'rgba(201,168,76,0.14)', border: '#c9a84c', text: '#c9a84c' },
  LOW:    { bg: 'rgba(239,68,68,0.14)',  border: '#ef4444', text: '#ef4444' },
};

const SIGNAL_LABELS = {
  live_price:                       'Live market price available',
  live_market_cap:                  'Market cap available',
  roce_years_of_data_gte_3:         'At least 3 years of ROCE history',
  consolidated_financials:          'Consolidated (not standalone) financials',
  gate2a_confidence_high:           'AI confidence on quantitative data',
  critical_metrics_high_confidence: 'Critical metrics not marked LOW',
  search_queries_returned:          'At least 4 of 5 searches returned data',
  data_freshness_18_months:         'Data within 18 months',
};

const SIZE_MAP = {
  sm: { pad: '2px 8px',  fs: 10, ic: 11 },
  md: { pad: '4px 10px', fs: 11, ic: 13 },
  lg: { pad: '6px 14px', fs: 13, ic: 15 },
};

export default function ConfidenceShield({ confidence, size = 'md', showBreakdown = true }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!confidence || typeof confidence.score !== 'number') return null;
  const c = COLOURS[confidence.band] || COLOURS.LOW;
  const s = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (showBreakdown) setOpen(o => !o); }}
        style={{
          padding: s.pad, fontSize: s.fs, fontWeight: 600,
          background: c.bg, border: `1px solid ${c.border}`,
          color: c.text, borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          cursor: showBreakdown ? 'pointer' : 'default',
          fontFamily: 'var(--font-mono)',
        }}
        title={showBreakdown ? 'Click for breakdown' : `Confidence: ${confidence.band}`}
      >
        <span style={{ fontSize: s.ic }}>🛡</span>
        <span>{confidence.band}</span>
        <span style={{ opacity: 0.7 }}>{confidence.score}</span>
      </button>

      {open && showBreakdown && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 14px', minWidth: 320,
          zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          textAlign: 'left',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Confidence Breakdown · {confidence.score}/100
          </div>
          {confidence.breakdown?.map(b => (
            <div key={b.signal} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, padding: '4px 0',
              color: b.passed ? 'var(--text-2)' : 'var(--fail)',
            }}>
              <span>
                <span style={{ marginRight: 6, fontWeight: 700 }}>{b.passed ? '✓' : '✕'}</span>
                {SIGNAL_LABELS[b.signal] || b.signal}
              </span>
              {!b.passed && (
                <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.75 }}>−{b.penalty}</span>
              )}
            </div>
          ))}
          {confidence.retryUsed && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>
              {confidence.retryNotImproved
                ? 'Auto-retry attempted but did not improve the score.'
                : 'Score improved after one auto-retry.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "const fs = require('fs'); const c = fs.readFileSync('client/src/components/ConfidenceShield.js', 'utf8'); const o = (c.match(/{/g)||[]).length; const cl = (c.match(/}/g)||[]).length; const p = (c.match(/\\(/g)||[]).length; const pl = (c.match(/\\)/g)||[]).length; console.log('braces:', o, '==', cl, 'parens:', p, '==', pl, o===cl && p===pl ? '✅' : '❌');"
```

Expected: braces balance, parens balance, ✅.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ConfidenceShield.js
git commit -m "Add shared ConfidenceShield React component with breakdown popover"
```

---

## Task 8: Show shield in AnalysisView header + add re-run button

**Files:**
- Modify: `client/src/pages/AnalysisView.js`

- [ ] **Step 1: Import ConfidenceShield at the top of AnalysisView.js**

Find the existing imports at the top:

```javascript
import React, { useState, useEffect } from 'react';
import authFetch from '../lib/api';
```

Add right below:

```javascript
import ConfidenceShield from '../components/ConfidenceShield';
```

- [ ] **Step 2: Find the analysis header and add the shield next to the verdict**

Locate the section where the verdict badge is rendered near the top of the analysis view. Search for the verdict-badge pattern in AnalysisView.js. Find:

```javascript
            <span className={`verdict-badge verdict-${analysis.overallVerdict}`}>
              {analysis.overallVerdict}
            </span>
```

Replace with:

```javascript
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className={`verdict-badge verdict-${analysis.overallVerdict}`}>
                {analysis.overallVerdict}
              </span>
              <ConfidenceShield confidence={analysis.confidence} size="md" />
            </div>
```

- [ ] **Step 3: Add re-run button when confidence is LOW (admin only)**

Locate the Update Analysis button block. Find:

```javascript
      <div className="analysis-header-actions">
```

Look at the buttons inside and add the new conditional re-run button. Find the closing of that block (e.g. before `</div>`) — actually search for the Update Analysis button code and add an extra button next to it when needed.

Find the existing actions section (it contains "Update Analysis" button). Add right after the existing Update button, inside the actions container:

```javascript
        {isAdmin && analysis.confidence?.band === 'LOW' && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onRerun}
            style={{ borderColor: '#ef4444', color: '#ef4444' }}
            title={`Confidence is LOW (${analysis.confidence.score}/100). Re-run fetches fresh data and recomputes.`}
          >
            ⚠ Re-run (LOW conf.)
          </button>
        )}
```

If the AnalysisView component does not already accept `isAdmin` and `onRerun` props, add them to the function signature:

Find:

```javascript
export default function AnalysisView({ ticker, onBack, onAnalysisComplete, isAdmin }) {
```

(if `isAdmin` is already there, just add `onRerun` if missing):

```javascript
export default function AnalysisView({ ticker, onBack, onAnalysisComplete, isAdmin, onRerun }) {
```

If `onRerun` is not yet wired, add a fallback handler inside the component:

```javascript
  const handleRerun = onRerun || (async () => {
    // Default: trigger the same flow as the Update Analysis button
    const event = new CustomEvent('rerun-analysis', { detail: { ticker } });
    window.dispatchEvent(event);
  });
```

And use `handleRerun` instead of `onRerun` in the button's onClick.

- [ ] **Step 4: Verify braces balance**

```bash
node -e "const fs=require('fs'); const c=fs.readFileSync('client/src/pages/AnalysisView.js','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; const p=(c.match(/\\(/g)||[]).length; const pl=(c.match(/\\)/g)||[]).length; console.log('braces:',o,'==',cl,'parens:',p,'==',pl, o===cl && p===pl ? '✅':'❌');"
```

Expected: ✅.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/AnalysisView.js
git commit -m "Show confidence shield + re-run button on analysis view"
```

---

## Task 9: Show confidence column + filter in Dashboard

**Files:**
- Modify: `client/src/pages/Dashboard.js`

- [ ] **Step 1: Import ConfidenceShield**

Find imports at top of Dashboard.js:

```javascript
import React, { useState, useMemo, useEffect } from 'react';
import authFetch from '../lib/api';
```

Add right below:

```javascript
import ConfidenceShield from '../components/ConfidenceShield';
```

- [ ] **Step 2: Add Confidence column to the table header**

Find the table header in `StockTable`:

```javascript
            <th className="th-sort" onClick={() => onSort('verdict')}>Verdict{arrow('verdict')}</th>
            <th>G1</th>
```

Replace with:

```javascript
            <th className="th-sort" onClick={() => onSort('verdict')}>Verdict{arrow('verdict')}</th>
            <th className="th-sort" onClick={() => onSort('confidence')}>Conf{arrow('confidence')}</th>
            <th>G1</th>
```

- [ ] **Step 3: Add Confidence cell to the table body**

Find in the row body:

```javascript
                <td><span className={`verdict-badge verdict-${verdict}`}>{VERDICT_ICONS[verdict]} {verdict}</span></td>
                {GATE_KEYS.map(k => (
```

Replace with:

```javascript
                <td><span className={`verdict-badge verdict-${verdict}`}>{VERDICT_ICONS[verdict]} {verdict}</span></td>
                <td><ConfidenceShield confidence={a.confidence} size="sm" /></td>
                {GATE_KEYS.map(k => (
```

- [ ] **Step 4: Support sorting by confidence**

Find the sort switch inside the `useMemo` block in the Dashboard component:

```javascript
      switch (sortKey) {
        case 'ticker':  av = a.ticker || ''; bv = b.ticker || ''; break;
        case 'company': av = a.company || ''; bv = b.company || ''; break;
        case 'verdict': av = verdictRank[a.overallVerdict] ?? 9; bv = verdictRank[b.overallVerdict] ?? 9; break;
```

Add a new case after `verdict`:

```javascript
        case 'confidence': av = a.confidence?.score ?? -1; bv = b.confidence?.score ?? -1; break;
```

- [ ] **Step 5: Add "Undervalued + HIGH confidence" smart filter option**

Find the smart-filter select element:

```javascript
            <select className="controls-select" value={smartFilter} onChange={e => { setSmart(e.target.value); setVerdict('ALL'); }}>
              <option value="ALL">Smart filter: All</option>
              <option value="UNDERVALUED">★ Undervalued (Marshall criteria)</option>
              <option value="QUALITY">Quality only (gates 1+2 PASS)</option>
              <option value="STALE">Stale (need refresh)</option>
            </select>
```

Replace with:

```javascript
            <select className="controls-select" value={smartFilter} onChange={e => { setSmart(e.target.value); setVerdict('ALL'); }}>
              <option value="ALL">Smart filter: All</option>
              <option value="UNDERVALUED">★ Undervalued (Marshall criteria)</option>
              <option value="UNDERVALUED_HIGH_CONF">★ Undervalued + HIGH confidence only</option>
              <option value="QUALITY">Quality only (gates 1+2 PASS)</option>
              <option value="LOW_CONFIDENCE">Low confidence (need re-run)</option>
              <option value="STALE">Stale (need refresh)</option>
            </select>
```

- [ ] **Step 6: Implement the new filter cases**

Find the `passSmartFilter` function:

```javascript
    if (smartFilter === 'STALE') return getDaysOld(a.analysisDate || a.savedAt) >= 90;
    return true;
  };
```

Replace with:

```javascript
    if (smartFilter === 'UNDERVALUED_HIGH_CONF') {
      const qualityOk = verdicts.g1 === 'PASS' && verdicts.g2a === 'PASS' &&
                        verdicts.g2b === 'PASS' && verdicts.g2c === 'PASS' &&
                        ['SCREAMING_BUY', 'VALUE_BUY'].includes(verdicts.g3);
      return qualityOk && a.confidence?.band === 'HIGH';
    }
    if (smartFilter === 'LOW_CONFIDENCE') return a.confidence?.band === 'LOW';
    if (smartFilter === 'STALE') return getDaysOld(a.analysisDate || a.savedAt) >= 90;
    return true;
  };
```

- [ ] **Step 7: Add Confidence columns to CSV export**

Find the `exportCSV` function:

```javascript
    const headers = ['Ticker','Company','Verdict','G1','G2a','G2b','G2c','G3','CMP','ROCE','P/E','EntryZone','AnalysisDate'];
```

Replace with:

```javascript
    const headers = ['Ticker','Company','Verdict','ConfidenceBand','ConfidenceScore','G1','G2a','G2b','G2c','G3','CMP','ROCE','P/E','EntryZone','AnalysisDate'];
```

Then find the row construction:

```javascript
      lines.push([
        a.ticker, `"${(a.company || '').replace(/"/g, '""')}"`, a.overallVerdict,
        a.gate1Verdict || '', a.gate2aVerdict || '', a.gate2bVerdict || '', a.gate2cVerdict || '', a.gate3Verdict || '',
```

Replace with:

```javascript
      lines.push([
        a.ticker, `"${(a.company || '').replace(/"/g, '""')}"`, a.overallVerdict,
        a.confidence?.band ?? '', a.confidence?.score ?? '',
        a.gate1Verdict || '', a.gate2aVerdict || '', a.gate2bVerdict || '', a.gate2cVerdict || '', a.gate3Verdict || '',
```

- [ ] **Step 8: Add stat chip for High-Confidence Buys**

Find the stats useMemo block:

```javascript
    undervalued: analyses.filter(a => {
      const v = { g1: a.gate1Verdict, g2a: a.gate2aVerdict, g2b: a.gate2bVerdict, g2c: a.gate2cVerdict, g3: a.gate3Verdict };
      return v.g1 === 'PASS' && v.g2a === 'PASS' && v.g2b === 'PASS' && v.g2c === 'PASS' &&
             ['SCREAMING_BUY', 'VALUE_BUY'].includes(v.g3);
    }).length,
    stale: analyses.filter(a => getDaysOld(a.analysisDate || a.savedAt) >= 90).length,
```

Replace with:

```javascript
    undervalued: analyses.filter(a => {
      const v = { g1: a.gate1Verdict, g2a: a.gate2aVerdict, g2b: a.gate2bVerdict, g2c: a.gate2cVerdict, g3: a.gate3Verdict };
      return v.g1 === 'PASS' && v.g2a === 'PASS' && v.g2b === 'PASS' && v.g2c === 'PASS' &&
             ['SCREAMING_BUY', 'VALUE_BUY'].includes(v.g3);
    }).length,
    undervaluedHighConf: analyses.filter(a => {
      const v = { g1: a.gate1Verdict, g2a: a.gate2aVerdict, g2b: a.gate2bVerdict, g2c: a.gate2cVerdict, g3: a.gate3Verdict };
      return v.g1 === 'PASS' && v.g2a === 'PASS' && v.g2b === 'PASS' && v.g2c === 'PASS' &&
             ['SCREAMING_BUY', 'VALUE_BUY'].includes(v.g3) &&
             a.confidence?.band === 'HIGH';
    }).length,
    lowConfidence: analyses.filter(a => a.confidence?.band === 'LOW').length,
    stale: analyses.filter(a => getDaysOld(a.analysisDate || a.savedAt) >= 90).length,
```

Then find the stats chip row:

```javascript
            <button className={`stat-chip stat-undervalued ${smartFilter === 'UNDERVALUED' ? 'active' : ''}`} title="Passes all quality gates + Gate 3 is Value Buy or Screaming Buy" onClick={() => { setSmart(s => s === 'UNDERVALUED' ? 'ALL' : 'UNDERVALUED'); setVerdict('ALL'); }}>
              <span className="stat-num">{stats.undervalued}</span>
              <span className="stat-lbl">★ Undervalued</span>
            </button>
            <button className={`stat-chip stat-stale ${smartFilter === 'STALE' ? 'active' : ''}`} onClick={() => { setSmart(s => s === 'STALE' ? 'ALL' : 'STALE'); setVerdict('ALL'); }}>
              <span className="stat-num">{stats.stale}</span>
              <span className="stat-lbl">Stale (90d+)</span>
            </button>
```

Replace with:

```javascript
            <button className={`stat-chip stat-undervalued ${smartFilter === 'UNDERVALUED' ? 'active' : ''}`} title="Passes all quality gates + Gate 3 is Value Buy or Screaming Buy" onClick={() => { setSmart(s => s === 'UNDERVALUED' ? 'ALL' : 'UNDERVALUED'); setVerdict('ALL'); }}>
              <span className="stat-num">{stats.undervalued}</span>
              <span className="stat-lbl">★ Undervalued</span>
            </button>
            <button className={`stat-chip stat-undervalued ${smartFilter === 'UNDERVALUED_HIGH_CONF' ? 'active' : ''}`} title="Undervalued AND high data-quality confidence" onClick={() => { setSmart(s => s === 'UNDERVALUED_HIGH_CONF' ? 'ALL' : 'UNDERVALUED_HIGH_CONF'); setVerdict('ALL'); }}>
              <span className="stat-num">{stats.undervaluedHighConf}</span>
              <span className="stat-lbl">★ High-Conf Buys</span>
            </button>
            <button className={`stat-chip stat-avoid ${smartFilter === 'LOW_CONFIDENCE' ? 'active' : ''}`} title="Analyses with LOW data quality — consider re-running" onClick={() => { setSmart(s => s === 'LOW_CONFIDENCE' ? 'ALL' : 'LOW_CONFIDENCE'); setVerdict('ALL'); }}>
              <span className="stat-num">{stats.lowConfidence}</span>
              <span className="stat-lbl">⚠ Low Conf</span>
            </button>
            <button className={`stat-chip stat-stale ${smartFilter === 'STALE' ? 'active' : ''}`} onClick={() => { setSmart(s => s === 'STALE' ? 'ALL' : 'STALE'); setVerdict('ALL'); }}>
              <span className="stat-num">{stats.stale}</span>
              <span className="stat-lbl">Stale (90d+)</span>
            </button>
```

- [ ] **Step 9: Verify braces balance**

```bash
node -e "const fs=require('fs'); const c=fs.readFileSync('client/src/pages/Dashboard.js','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; const p=(c.match(/\\(/g)||[]).length; const pl=(c.match(/\\)/g)||[]).length; console.log('braces:',o,'==',cl,'parens:',p,'==',pl, o===cl && p===pl ? '✅':'❌');"
```

Expected: ✅.

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/Dashboard.js
git commit -m "Add confidence column, filters, stat chips, and CSV export to dashboard"
```

---

## Task 10: Make existing analyses pick up confidence on next fetch (lazy backfill)

The backfill endpoint exists but requires admin to trigger. Provide a tiny convenience: when an analysis is fetched from the DB and it has no `confidence` field, compute one on the fly so the UI never breaks for old data.

**Files:**
- Modify: `index.js` — the `GET /api/analysis/:ticker` and `GET /api/analyses` endpoints

- [ ] **Step 1: Add lazy compute on single-analysis fetch**

Find in `index.js`:

```javascript
// ─── Get single analysis ──────────────────────────────────────────────────────
app.get('/api/analysis/:ticker', requireAuth, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const cached = cache.get(`analysis_${ticker}`);
  if (cached) return res.json(cached);
  const stored = await getAnalysis(ticker);
  if (stored) {
    cache.set(`analysis_${ticker}`, stored);
    return res.json(stored);
  }
  res.status(404).json({ error: 'Analysis not found' });
});
```

Replace with:

```javascript
// ─── Get single analysis ──────────────────────────────────────────────────────
app.get('/api/analysis/:ticker', requireAuth, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const cached = cache.get(`analysis_${ticker}`);
  if (cached) return res.json(cached);
  const stored = await getAnalysis(ticker);
  if (stored) {
    // Lazy-compute confidence for analyses created before this feature shipped.
    // This does not persist; user can run /api/admin/backfill-confidence to make it permanent.
    if (!stored.confidence) {
      stored.confidence = computeConfidenceScore(stored);
    }
    cache.set(`analysis_${ticker}`, stored);
    return res.json(stored);
  }
  res.status(404).json({ error: 'Analysis not found' });
});
```

- [ ] **Step 2: Add confidence to the dashboard list response**

Find the list endpoint:

```javascript
app.get('/api/analyses', requireAuth, async (req, res) => {
  try {
    let analyses = await getAllAnalyses();
```

The summary fields built by `getAllAnalyses` in db.js do not include `confidence`. The dashboard already calls `/api/metrics` to enrich rows; we'll extend that endpoint instead since `fundamental_metrics` will have `confidence_score` and `confidence_band` after Task 5 + Task 6 runs.

No change needed in this endpoint — the dashboard pulls confidence via the metrics map. Confirm by checking the Dashboard component's `metricsMap`. Move to next step.

- [ ] **Step 3: Surface confidence in /api/metrics response (already returns the row automatically)**

No code change. The existing endpoint `/api/metrics` does `SELECT *` via `getAllMetricsLatest`, which now returns the new columns automatically.

In Dashboard.js, the rendering, filters, AND stats all reference `a.confidence`. For older analyses without embedded confidence, we reconstruct it from `metricsMap` ONCE — BEFORE filter/stats run — so everything sees a consistent view.

Find this line in Dashboard.js (just after the `metricsMap` useEffect):

```javascript
  // Smart filter logic
  const passSmartFilter = (a) => {
```

Add directly above the `// Smart filter logic` comment:

```javascript
  // Merge confidence from fundamental_metrics into the analysis summary objects
  // so filters, stats, sorting, and rendering all see a consistent view —
  // even for analyses created before the confidence feature shipped.
  const analysesWithConfidence = useMemo(() => {
    return analyses.map(a => {
      if (a.confidence) return a;
      const m = metricsMap[a.ticker];
      if (m?.confidence_band && m?.confidence_score != null) {
        return {
          ...a,
          confidence: {
            score: m.confidence_score,
            band: m.confidence_band,
            breakdown: [], // empty — full breakdown only lives on the full analysis JSON
          },
        };
      }
      return a;
    });
  }, [analyses, metricsMap]);

```

- [ ] **Step 4: Use `analysesWithConfidence` everywhere `analyses` is read in Dashboard.js**

Find the `filtered` useMemo:

```javascript
  const filtered = useMemo(() => {
    let result = analyses;
```

Replace with:

```javascript
  const filtered = useMemo(() => {
    let result = analysesWithConfidence;
```

And update its dependency array:

```javascript
  }, [analyses, search, verdictFilter, smartFilter, sortKey, sortDir, metricsMap]);
```

Replace with:

```javascript
  }, [analysesWithConfidence, search, verdictFilter, smartFilter, sortKey, sortDir, metricsMap]);
```

Find the `stats` useMemo:

```javascript
  const stats = useMemo(() => ({
    total: analyses.length,
    buy: analyses.filter(a => a.overallVerdict === 'BUY').length,
    watch: analyses.filter(a => a.overallVerdict === 'WATCH').length,
    avoid: analyses.filter(a => a.overallVerdict === 'AVOID').length,
    undervalued: analyses.filter(a => {
```

Replace all uses of `analyses` with `analysesWithConfidence` inside that useMemo, AND update its dependency array from `[analyses]` to `[analysesWithConfidence]`.

The full replacement for the stats useMemo:

```javascript
  const stats = useMemo(() => ({
    total: analysesWithConfidence.length,
    buy: analysesWithConfidence.filter(a => a.overallVerdict === 'BUY').length,
    watch: analysesWithConfidence.filter(a => a.overallVerdict === 'WATCH').length,
    avoid: analysesWithConfidence.filter(a => a.overallVerdict === 'AVOID').length,
    undervalued: analysesWithConfidence.filter(a => {
      const v = { g1: a.gate1Verdict, g2a: a.gate2aVerdict, g2b: a.gate2bVerdict, g2c: a.gate2cVerdict, g3: a.gate3Verdict };
      return v.g1 === 'PASS' && v.g2a === 'PASS' && v.g2b === 'PASS' && v.g2c === 'PASS' &&
             ['SCREAMING_BUY', 'VALUE_BUY'].includes(v.g3);
    }).length,
    undervaluedHighConf: analysesWithConfidence.filter(a => {
      const v = { g1: a.gate1Verdict, g2a: a.gate2aVerdict, g2b: a.gate2bVerdict, g2c: a.gate2cVerdict, g3: a.gate3Verdict };
      return v.g1 === 'PASS' && v.g2a === 'PASS' && v.g2b === 'PASS' && v.g2c === 'PASS' &&
             ['SCREAMING_BUY', 'VALUE_BUY'].includes(v.g3) &&
             a.confidence?.band === 'HIGH';
    }).length,
    lowConfidence: analysesWithConfidence.filter(a => a.confidence?.band === 'LOW').length,
    stale: analysesWithConfidence.filter(a => getDaysOld(a.analysisDate || a.savedAt) >= 90).length,
  }), [analysesWithConfidence]);
```

Note: keep the "no analyses" guard intact. If `analyses.length === 0`, the empty state still renders — `analysesWithConfidence.length` will also be 0.

Replace the empty state check too. Find:

```javascript
      ) : analyses.length === 0 ? (
```

Replace with:

```javascript
      ) : analysesWithConfidence.length === 0 ? (
```

And finally the trailing count text. Find:

```javascript
            Showing {filtered.length} of {analyses.length} analyses
```

Replace with:

```javascript
            Showing {filtered.length} of {analysesWithConfidence.length} analyses
```

- [ ] **Step 5: Syntax check both files**

```bash
node --check index.js && node -e "const fs=require('fs'); const c=fs.readFileSync('client/src/pages/Dashboard.js','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'Dashboard ✅' : 'Dashboard ❌');"
```

Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add index.js client/src/pages/Dashboard.js
git commit -m "Lazy-compute confidence for older analyses + surface in dashboard list"
```

---

## Task 11: End-to-end verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run unit tests one more time**

```bash
npm test
```

Expected: all 15 tests pass.

- [ ] **Step 2: Verify all changed files have balanced syntax**

```bash
node --check confidence.js && node --check agent.js && node --check db.js && node --check index.js && echo "All backend files OK"
```

Expected: `All backend files OK`.

- [ ] **Step 3: Final git push**

```bash
git push origin main
```

Render will rebuild automatically. Watch the deploy logs for any startup errors. Backend should boot in <30s.

- [ ] **Step 4: Manual smoke test against the deployed app**

Once Render finishes the rebuild:

1. Open the dashboard. Confirm the "Conf" column is visible in the table.
2. Older analyses should show some confidence band (lazy-computed). Click the shield on one — popover opens with the breakdown.
3. Run a new analysis on a mid-cap stock (e.g. POLYCAB). Watch the progress bar — if confidence comes out LOW you should see "Low confidence — retrying with deeper search" in the message.
4. Open the new analysis. The shield should appear in the header next to the verdict.
5. If the shield is LOW and you are admin, the "⚠ Re-run (LOW conf.)" button should appear in the header actions area.
6. Run the backfill once as admin:
   ```bash
   curl -X POST https://agent-4-gate-model-fundamental.onrender.com/api/admin/backfill-confidence \
     -H "Authorization: Bearer <your supabase admin JWT>"
   ```
   Expected response: `{ "success": true, "updated": N, "bands": { "HIGH": x, "MEDIUM": y, "LOW": z } }`.
7. Export CSV from the dashboard. Open in a spreadsheet. Verify "ConfidenceBand" and "ConfidenceScore" columns are populated.

- [ ] **Step 5: Mark feature complete**

If all steps pass, the feature is shipped. No further commits required.

---

## Self-Review Notes

Spec coverage verified:

- ✅ Scoring rubric (Task 3 implements all 8 signals)
- ✅ Bands (HIGH/MEDIUM/LOW thresholds in `bandForScore`)
- ✅ Auto-retry once on creation when < 60 (Task 4 step 3)
- ✅ Manual re-run button on existing LOW analyses (Task 8 step 3)
- ✅ Data model — confidence on analysis JSON, score/band columns on fundamental_metrics (Task 1 + 5)
- ✅ Backfill endpoint (Task 6)
- ✅ UI surface — shield in analysis view (Task 8), dashboard column (Task 9), filter (Task 9 step 5-6), stat chip (Task 9 step 8), CSV export (Task 9 step 7)
- ✅ Migration documented (Task 1)
- ✅ Edge cases tested (Task 2 tests cover clamping, multiple failures, missing fields)

Type and name consistency verified:

- `computeConfidenceScore`, `bandForScore`, `SIGNALS`, `CRITICAL_METRIC_KEYS` consistent across confidence.js, tests, agent.js, index.js
- `confidence.score`, `confidence.band`, `confidence.breakdown`, `confidence.retryUsed` consistent across backend and frontend
- `confidence_score`, `confidence_band` Postgres columns consistent in migration + db.js + Dashboard's metrics map
- Signal names (`live_price`, `live_market_cap`, etc.) consistent between confidence.js, ConfidenceShield SIGNAL_LABELS, and tests
