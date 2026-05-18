# Phase 5.1 — Data Layer Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the structured-data foundation: 9 new Supabase tables (companies, sectors, 4 source financial tables, 3 derived/aggregate tables), a screener.in HTML scraper that populates them per ticker, pure JS modules for ratio derivation + aggregates, an API endpoint surfacing the data, an auto-expanding FinancialsGrid frontend component, and a hybrid agent.js path that uses structured data when available and falls back to the existing AI-extraction flow when not.

**Architecture:** screener.in HTML → cheerio parse → 4 source tables → derive.js (pure) → derived tables → aggregate.js (pure) → company_aggregates. Analysis prompt receives the structured bundle directly instead of raw search-result text. Backward compatible: old analyses still load and re-display correctly; new analyses use the structured path when ingestion succeeded.

**Tech Stack:** Node 18.19, Express, Supabase (Postgres), React, `cheerio` (new dep) for HTML parsing, `node:test` for unit tests.

**Spec:** Master plan §4 (Groups 1, 2, 3) + §5 (M1, M2, M3) + §10 Phase 5 row — `docs/superpowers/specs/2026-05-17-master-architecture-plan.md`

---

## File Structure

**New backend files:**
- `ingestion/screenerScraper.js` — fetch + parse screener.in HTML for one ticker
- `ingestion/orchestrator.js` — `ingestCompany(ticker)` end-to-end pipeline
- `derive.js` — pure JS: source → per-period ratios
- `aggregate.js` — pure JS: derived → 5y/10y averages and CAGRs
- `test/derive.test.js`, `test/aggregate.test.js`, `test/screenerScraper.test.js`
- `db_migrations/2026-05-17-phase5-data-layer.sql`

**Modified backend files:**
- `package.json` — add `cheerio` dependency
- `db.js` — CRUD for 9 new tables
- `agent.js` — `runMarshallAnalysis` consults structured data first, falls back to web-search path
- `index.js` — new endpoint `GET /api/company/:ticker/financials` + admin endpoint `POST /api/admin/ingest/:ticker`

**New frontend files:**
- `client/src/components/FinancialsGrid.js` — auto-expanding period columns

**Modified frontend files:**
- `client/src/pages/AnalysisView.js` — embed FinancialsGrid below Gate 2a metrics
- `client/src/pages/AdminPanel.js` — add "Ingest Ticker Fundamentals" card

---

## Task 1: SQL migration — 9 new tables

**Files:**
- Create: `db_migrations/2026-05-17-phase5-data-layer.sql`

- [ ] **Step 1: Write the migration**

Write `db_migrations/2026-05-17-phase5-data-layer.sql`:

```sql
-- Phase 5.1 — structured data layer.
-- Run once in Supabase SQL editor before deploying.

-- ─── Group 1: Universe & Reference ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  ticker          TEXT PRIMARY KEY,
  company_name    TEXT,
  isin            TEXT,
  sector          TEXT,
  sub_sector      TEXT,
  market_cap_tier TEXT CHECK (market_cap_tier IN ('large','mid','small','micro')),
  listing_date    DATE,
  is_active       BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sectors (
  sector            TEXT PRIMARY KEY,
  sub_sector        TEXT,
  roce_benchmark    NUMERIC,
  roe_benchmark     NUMERIC,
  notes             TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Group 2: Periodic Financials ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_annual_pl (
  ticker              TEXT NOT NULL,
  fy_end              DATE NOT NULL,
  fy_label            TEXT NOT NULL,
  sales_cr            NUMERIC,
  expenses_cr         NUMERIC,
  operating_profit_cr NUMERIC,
  opm_pct             NUMERIC,
  other_income_cr     NUMERIC,
  interest_cr         NUMERIC,
  depreciation_cr     NUMERIC,
  pbt_cr              NUMERIC,
  tax_pct             NUMERIC,
  net_profit_cr       NUMERIC,
  eps_rs              NUMERIC,
  is_consolidated     BOOLEAN DEFAULT true,
  source              TEXT DEFAULT 'screener.in',
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, fy_end)
);

CREATE TABLE IF NOT EXISTS company_annual_bs (
  ticker                    TEXT NOT NULL,
  fy_end                    DATE NOT NULL,
  fy_label                  TEXT NOT NULL,
  equity_share_capital_cr   NUMERIC,
  reserves_cr               NUMERIC,
  total_equity_cr           NUMERIC,
  long_term_borrowings_cr   NUMERIC,
  short_term_borrowings_cr  NUMERIC,
  total_debt_cr             NUMERIC,
  trade_payables_cr         NUMERIC,
  other_current_liab_cr     NUMERIC,
  fixed_assets_cr           NUMERIC,
  cwip_cr                   NUMERIC,
  investments_cr            NUMERIC,
  inventories_cr            NUMERIC,
  trade_receivables_cr      NUMERIC,
  cash_cr                   NUMERIC,
  other_current_assets_cr   NUMERIC,
  total_assets_cr           NUMERIC,
  book_value_per_share      NUMERIC,
  is_consolidated     BOOLEAN DEFAULT true,
  source              TEXT DEFAULT 'screener.in',
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, fy_end)
);

CREATE TABLE IF NOT EXISTS company_annual_cf (
  ticker              TEXT NOT NULL,
  fy_end              DATE NOT NULL,
  fy_label            TEXT NOT NULL,
  ocf_cr              NUMERIC,
  icf_cr              NUMERIC,
  ffc_cr              NUMERIC,
  net_change_cash_cr  NUMERIC,
  capex_cr            NUMERIC,
  free_cash_flow_cr   NUMERIC,
  dividends_paid_cr   NUMERIC,
  debt_raised_cr      NUMERIC,
  debt_repaid_cr      NUMERIC,
  is_consolidated     BOOLEAN DEFAULT true,
  source              TEXT DEFAULT 'screener.in',
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, fy_end)
);

CREATE TABLE IF NOT EXISTS company_quarterly_pl (
  ticker              TEXT NOT NULL,
  q_end               DATE NOT NULL,
  q_label             TEXT NOT NULL,
  sales_cr            NUMERIC,
  expenses_cr         NUMERIC,
  operating_profit_cr NUMERIC,
  opm_pct             NUMERIC,
  other_income_cr     NUMERIC,
  interest_cr         NUMERIC,
  depreciation_cr     NUMERIC,
  pbt_cr              NUMERIC,
  tax_pct             NUMERIC,
  net_profit_cr       NUMERIC,
  eps_rs              NUMERIC,
  is_consolidated     BOOLEAN DEFAULT true,
  source              TEXT DEFAULT 'screener.in',
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, q_end)
);

-- ─── Group 3: Derived & Aggregates ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_derived_annual (
  ticker            TEXT NOT NULL,
  fy_end            DATE NOT NULL,
  fy_label          TEXT NOT NULL,
  ebitda_margin_pct NUMERIC,
  pat_margin_pct    NUMERIC,
  roe_pct           NUMERIC,
  roce_pct          NUMERIC,
  roa_pct           NUMERIC,
  debt_to_equity    NUMERIC,
  interest_coverage NUMERIC,
  current_ratio     NUMERIC,
  ocf_to_pat_pct    NUMERIC,
  fcf_margin_pct    NUMERIC,
  revenue_yoy_pct   NUMERIC,
  ebitda_yoy_pct    NUMERIC,
  pat_yoy_pct       NUMERIC,
  computed_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, fy_end)
);

CREATE TABLE IF NOT EXISTS company_derived_quarterly (
  ticker            TEXT NOT NULL,
  q_end             DATE NOT NULL,
  q_label           TEXT NOT NULL,
  ebitda_margin_pct NUMERIC,
  pat_margin_pct    NUMERIC,
  revenue_yoy_pct   NUMERIC,
  ebitda_yoy_pct    NUMERIC,
  pat_yoy_pct       NUMERIC,
  revenue_qoq_pct   NUMERIC,
  pat_qoq_pct       NUMERIC,
  computed_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, q_end)
);

CREATE TABLE IF NOT EXISTS company_aggregates (
  ticker                  TEXT PRIMARY KEY,
  roce_5y_avg             NUMERIC,
  roe_5y_avg              NUMERIC,
  ebitda_margin_5y_avg    NUMERIC,
  pat_margin_5y_avg       NUMERIC,
  revenue_cagr_5y_pct     NUMERIC,
  pat_cagr_5y_pct         NUMERIC,
  ebitda_cagr_5y_pct      NUMERIC,
  revenue_cagr_10y_pct    NUMERIC,
  pat_cagr_10y_pct        NUMERIC,
  latest_annual_fy_end    DATE,
  latest_quarterly_q_end  DATE,
  annual_periods_count    INTEGER,
  quarterly_periods_count INTEGER,
  computed_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Helpful indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies (sector);
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies (is_active);
```

- [ ] **Step 2: User applies migration in Supabase**

Open Supabase → SQL Editor → paste the file content → Run. Verify with:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'company_%' OR table_name IN ('companies','sectors')
ORDER BY table_name;
```

Expected: 9 rows returned.

- [ ] **Step 3: Commit**

```bash
git add db_migrations/2026-05-17-phase5-data-layer.sql
git commit -m "Add SQL migration for Phase 5 data layer (9 new tables)"
```

---

## Task 2: Add cheerio dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install cheerio**

```bash
cd "C:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main"
npm install cheerio --save
```

Expected: `cheerio` appears in `package.json` dependencies.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add cheerio dependency for HTML scraping (Phase 5)"
```

---

## Task 3: Failing tests for derive.js

**Files:**
- Create: `test/derive.test.js`

- [ ] **Step 1: Write the test file**

Write `test/derive.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveAnnual,
  deriveQuarterly,
} = require('../derive');

// ─── Annual: a single fully-populated year ────────────────────────────────
test('deriveAnnual: full year with prior year for YoY', () => {
  const pl = {
    ticker: 'X', fy_end: '2026-03-31', fy_label: 'FY26',
    sales_cr: 1000, operating_profit_cr: 200, depreciation_cr: 50,
    interest_cr: 20, net_profit_cr: 120,
  };
  const bs = {
    ticker: 'X', fy_end: '2026-03-31', fy_label: 'FY26',
    total_equity_cr: 800, total_debt_cr: 200, total_assets_cr: 1200,
    inventories_cr: 100, trade_receivables_cr: 150, cash_cr: 50,
    other_current_assets_cr: 50,
    trade_payables_cr: 80, other_current_liab_cr: 70,
  };
  const cf = {
    ticker: 'X', fy_end: '2026-03-31', fy_label: 'FY26',
    ocf_cr: 150, free_cash_flow_cr: 90,
  };
  const priorPl = {
    sales_cr: 800, operating_profit_cr: 150, net_profit_cr: 90,
  };

  const r = deriveAnnual({ pl, bs, cf, priorPl });

  // Margins
  assert.equal(r.ebitda_margin_pct, 25);    // (200+50)/1000 * 100
  assert.equal(r.pat_margin_pct, 12);       // 120/1000 * 100
  // ROE: pat / total_equity = 120/800 = 15%
  assert.equal(r.roe_pct, 15);
  // ROCE: EBIT / (equity + debt). EBIT = OP - depreciation? No — operating_profit IS EBIT-equivalent here for screener.
  // We define EBIT = operating_profit + other_income. For test we ignore other_income → EBIT = 200.
  // ROCE = 200 / (800 + 200) * 100 = 20%
  assert.equal(r.roce_pct, 20);
  // ROA: pat / total_assets = 120/1200 = 10%
  assert.equal(r.roa_pct, 10);
  // Debt/Equity = 200/800 = 0.25
  assert.equal(r.debt_to_equity, 0.25);
  // Interest coverage: EBIT / interest = 200/20 = 10
  assert.equal(r.interest_coverage, 10);
  // Current ratio: current_assets / current_liabilities
  //   current_assets = inv+recv+cash+other = 100+150+50+50 = 350
  //   current_liab = trade_pay+other = 80+70 = 150
  //   ratio = 350/150 = 2.33
  assert.equal(r.current_ratio, 2.33);
  // OCF/PAT = 150/120 = 1.25 → 125%
  assert.equal(r.ocf_to_pat_pct, 125);
  // FCF margin = 90/1000 = 9%
  assert.equal(r.fcf_margin_pct, 9);
  // YoY
  assert.equal(r.revenue_yoy_pct, 25);      // 200/800 * 100
  assert.equal(r.pat_yoy_pct, 33.33);       // 30/90 * 100
});

test('deriveAnnual: handles missing prior year (no YoY)', () => {
  const r = deriveAnnual({
    pl: { sales_cr: 1000, operating_profit_cr: 200, net_profit_cr: 120 },
    bs: { total_equity_cr: 800, total_debt_cr: 200, total_assets_cr: 1200 },
    cf: { ocf_cr: 150, free_cash_flow_cr: 90 },
    priorPl: null,
  });
  assert.equal(r.revenue_yoy_pct, null);
  assert.equal(r.pat_yoy_pct, null);
});

test('deriveAnnual: handles missing BS (returns null ratios)', () => {
  const r = deriveAnnual({
    pl: { sales_cr: 1000, operating_profit_cr: 200, net_profit_cr: 120 },
    bs: null, cf: null, priorPl: null,
  });
  assert.equal(r.roe_pct, null);
  assert.equal(r.roce_pct, null);
  assert.equal(r.debt_to_equity, null);
  // Margin still works from P&L alone
  assert.equal(r.pat_margin_pct, 12);
});

test('deriveAnnual: zero division produces null', () => {
  const r = deriveAnnual({
    pl: { sales_cr: 0, operating_profit_cr: 0, net_profit_cr: 0 },
    bs: { total_equity_cr: 0, total_debt_cr: 0, total_assets_cr: 0 },
    cf: { ocf_cr: 0, free_cash_flow_cr: 0 },
    priorPl: null,
  });
  assert.equal(r.pat_margin_pct, null);
  assert.equal(r.roe_pct, null);
});

// ─── Quarterly ────────────────────────────────────────────────────────────
test('deriveQuarterly: YoY + QoQ', () => {
  const r = deriveQuarterly({
    current:    { sales_cr: 100, operating_profit_cr: 20, net_profit_cr: 12 },
    samePriorYear: { sales_cr: 80,  operating_profit_cr: 16, net_profit_cr: 8 },
    priorQuarter:  { sales_cr: 95,  operating_profit_cr: 19, net_profit_cr: 11 },
  });
  assert.equal(r.revenue_yoy_pct, 25);   // 20/80
  assert.equal(r.pat_yoy_pct, 50);       // 4/8
  assert.equal(r.revenue_qoq_pct, 5.26); // 5/95 ≈ 5.26%
  assert.equal(r.ebitda_margin_pct, 20); // 20/100
});

test('deriveQuarterly: missing prior periods returns nulls', () => {
  const r = deriveQuarterly({
    current: { sales_cr: 100, operating_profit_cr: 20, net_profit_cr: 12 },
    samePriorYear: null,
    priorQuarter: null,
  });
  assert.equal(r.revenue_yoy_pct, null);
  assert.equal(r.revenue_qoq_pct, null);
  assert.equal(r.ebitda_margin_pct, 20);
});
```

- [ ] **Step 2: Run tests to confirm fail**

```bash
node --test test/derive.test.js 2>&1 | tail -3
```

Expected: all fail with `Cannot find module '../derive'`.

- [ ] **Step 3: Commit**

```bash
git add test/derive.test.js
git commit -m "Add failing tests for derive.js (annual + quarterly ratios)"
```

---

## Task 4: Implement derive.js

**Files:**
- Create: `derive.js`

- [ ] **Step 1: Write the module**

Write `derive.js`:

```javascript
/**
 * Pure ratio derivation. No I/O.
 *
 * deriveAnnual({ pl, bs, cf, priorPl }) → derived ratios for one fiscal year
 * deriveQuarterly({ current, samePriorYear, priorQuarter }) → derived ratios for one quarter
 *
 * All numeric outputs are rounded to 2 decimals. Missing/zero inputs produce null
 * rather than NaN/Infinity.
 */

function safe(num) {
  if (num == null || !isFinite(num)) return null;
  return Number(num.toFixed(2));
}

function div(numerator, denominator) {
  if (numerator == null || denominator == null) return null;
  const d = Number(denominator);
  if (!isFinite(d) || d === 0) return null;
  const n = Number(numerator);
  if (!isFinite(n)) return null;
  return n / d;
}

function pctChange(current, prior) {
  if (current == null || prior == null) return null;
  if (prior === 0) return null;
  return safe(((current - prior) / Math.abs(prior)) * 100);
}

function sumIfPresent(obj, keys) {
  let total = 0;
  let found = false;
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && isFinite(v)) {
      total += Number(v);
      found = true;
    }
  }
  return found ? total : null;
}

function deriveAnnual({ pl, bs, cf, priorPl }) {
  const sales        = pl?.sales_cr ?? null;
  const opProfit     = pl?.operating_profit_cr ?? null;
  const depreciation = pl?.depreciation_cr ?? 0;
  const interest     = pl?.interest_cr ?? null;
  const netProfit    = pl?.net_profit_cr ?? null;
  const ebitda       = (opProfit != null && depreciation != null) ? opProfit + depreciation : null;
  // For Indian P&L extracted from screener: "operating_profit" is EBIT-equivalent (already excludes depreciation? No — screener's "Operating Profit" INCLUDES depreciation deducted? Actually screener's Operating Profit = Sales - Expenses, before depreciation.)
  // Convention used here: operating_profit_cr from screener IS EBITDA-style (pre-depreciation). So EBIT = operating_profit - depreciation.
  const ebit         = (opProfit != null && depreciation != null) ? opProfit - depreciation : opProfit;

  const totalEquity  = bs?.total_equity_cr ?? null;
  const totalDebt    = bs?.total_debt_cr ?? null;
  const totalAssets  = bs?.total_assets_cr ?? null;

  const currentAssets = sumIfPresent(bs, ['inventories_cr','trade_receivables_cr','cash_cr','other_current_assets_cr']);
  const currentLiab   = sumIfPresent(bs, ['trade_payables_cr','other_current_liab_cr']);
  const capitalEmployed = (totalEquity != null && totalDebt != null) ? totalEquity + totalDebt : null;

  const ocf          = cf?.ocf_cr ?? null;
  const fcf          = cf?.free_cash_flow_cr ?? null;

  return {
    ebitda_margin_pct: ebitda != null && sales ? safe((ebitda / sales) * 100) : null,
    pat_margin_pct:    netProfit != null && sales ? safe((netProfit / sales) * 100) : null,
    roe_pct:           netProfit != null && totalEquity ? safe((netProfit / totalEquity) * 100) : null,
    roce_pct:          ebit != null && capitalEmployed ? safe((ebit / capitalEmployed) * 100) : null,
    roa_pct:           netProfit != null && totalAssets ? safe((netProfit / totalAssets) * 100) : null,
    debt_to_equity:    totalDebt != null && totalEquity ? safe(totalDebt / totalEquity) : null,
    interest_coverage: ebit != null && interest ? safe(ebit / interest) : null,
    current_ratio:     currentAssets != null && currentLiab ? safe(currentAssets / currentLiab) : null,
    ocf_to_pat_pct:    ocf != null && netProfit ? safe((ocf / netProfit) * 100) : null,
    fcf_margin_pct:    fcf != null && sales ? safe((fcf / sales) * 100) : null,
    revenue_yoy_pct:   pctChange(sales, priorPl?.sales_cr),
    ebitda_yoy_pct:    pctChange(
      (opProfit != null && depreciation != null) ? opProfit + depreciation : null,
      (priorPl?.operating_profit_cr != null) ? priorPl.operating_profit_cr + (priorPl.depreciation_cr || 0) : null
    ),
    pat_yoy_pct:       pctChange(netProfit, priorPl?.net_profit_cr),
  };
}

function deriveQuarterly({ current, samePriorYear, priorQuarter }) {
  const sales     = current?.sales_cr ?? null;
  const opProfit  = current?.operating_profit_cr ?? null;
  const netProfit = current?.net_profit_cr ?? null;
  const ebitda    = opProfit; // screener convention for quarterly

  return {
    ebitda_margin_pct: ebitda != null && sales ? safe((ebitda / sales) * 100) : null,
    pat_margin_pct:    netProfit != null && sales ? safe((netProfit / sales) * 100) : null,
    revenue_yoy_pct:   pctChange(sales,     samePriorYear?.sales_cr),
    ebitda_yoy_pct:    pctChange(opProfit,  samePriorYear?.operating_profit_cr),
    pat_yoy_pct:       pctChange(netProfit, samePriorYear?.net_profit_cr),
    revenue_qoq_pct:   pctChange(sales,     priorQuarter?.sales_cr),
    pat_qoq_pct:       pctChange(netProfit, priorQuarter?.net_profit_cr),
  };
}

module.exports = { deriveAnnual, deriveQuarterly };
```

- [ ] **Step 2: Run tests**

```bash
node --test test/derive.test.js 2>&1 | grep -E "pass [0-9]|fail [0-9]"
```

Expected: `pass 6` `fail 0`.

- [ ] **Step 3: Commit**

```bash
git add derive.js
git commit -m "Implement derive.js: pure annual + quarterly ratio computation"
```

---

## Task 5: Failing tests for aggregate.js

**Files:**
- Create: `test/aggregate.test.js`

- [ ] **Step 1: Write the tests**

Write `test/aggregate.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../aggregate');

const yr = (fy, sales, pat, ebitda, roce, roe, ebitdaMargin, patMargin) => ({
  fy_end: `20${fy.slice(2)}-03-31`,
  fy_label: fy,
  sales_cr: sales, net_profit_cr: pat, operating_profit_cr: ebitda,
  // derived inputs:
  roce_pct: roce, roe_pct: roe, ebitda_margin_pct: ebitdaMargin, pat_margin_pct: patMargin,
});

test('aggregate: 5-year averages', () => {
  // Latest year first
  const annualDerived = [
    { fy_end: '2026-03-31', roce_pct: 22, roe_pct: 18, ebitda_margin_pct: 20, pat_margin_pct: 12 },
    { fy_end: '2025-03-31', roce_pct: 20, roe_pct: 17, ebitda_margin_pct: 19, pat_margin_pct: 11 },
    { fy_end: '2024-03-31', roce_pct: 18, roe_pct: 16, ebitda_margin_pct: 18, pat_margin_pct: 10 },
    { fy_end: '2023-03-31', roce_pct: 16, roe_pct: 15, ebitda_margin_pct: 17, pat_margin_pct:  9 },
    { fy_end: '2022-03-31', roce_pct: 14, roe_pct: 14, ebitda_margin_pct: 16, pat_margin_pct:  8 },
  ];
  const annualPl = [
    { fy_end: '2026-03-31', sales_cr: 1500, net_profit_cr: 180, operating_profit_cr: 300 },
    { fy_end: '2025-03-31', sales_cr: 1300, net_profit_cr: 145, operating_profit_cr: 250 },
    { fy_end: '2024-03-31', sales_cr: 1100, net_profit_cr: 110, operating_profit_cr: 200 },
    { fy_end: '2023-03-31', sales_cr:  950, net_profit_cr:  85, operating_profit_cr: 165 },
    { fy_end: '2022-03-31', sales_cr:  800, net_profit_cr:  64, operating_profit_cr: 130 },
  ];
  const r = aggregate('X', annualPl, annualDerived, []);
  assert.equal(r.roce_5y_avg, 18);                // (22+20+18+16+14)/5
  assert.equal(r.roe_5y_avg, 16);                 // (18+17+16+15+14)/5
  assert.equal(r.ebitda_margin_5y_avg, 18);       // (20+19+18+17+16)/5
  assert.equal(r.pat_margin_5y_avg, 10);          // (12+11+10+9+8)/5

  // CAGR: (1500/800)^(1/4) - 1 ≈ 17.0%  (4 intervals across 5 years)
  assert.ok(Math.abs(r.revenue_cagr_5y_pct - 17.0) < 0.5);
  // PAT CAGR: (180/64)^(1/4) - 1 ≈ 29.5%
  assert.ok(Math.abs(r.pat_cagr_5y_pct - 29.5) < 1.0);

  assert.equal(r.latest_annual_fy_end, '2026-03-31');
  assert.equal(r.annual_periods_count, 5);
});

test('aggregate: fewer than 5 years → uses what is available', () => {
  const r = aggregate('X',
    [
      { fy_end: '2026-03-31', sales_cr: 1500, net_profit_cr: 180 },
      { fy_end: '2025-03-31', sales_cr: 1300, net_profit_cr: 145 },
    ],
    [
      { fy_end: '2026-03-31', roce_pct: 22, roe_pct: 18, ebitda_margin_pct: 20, pat_margin_pct: 12 },
      { fy_end: '2025-03-31', roce_pct: 20, roe_pct: 17, ebitda_margin_pct: 19, pat_margin_pct: 11 },
    ],
    []
  );
  assert.equal(r.roce_5y_avg, 21);  // (22+20)/2
  assert.equal(r.annual_periods_count, 2);
  // CAGR over 1 interval: 1500/1300 - 1 = 15.4%
  assert.ok(Math.abs(r.revenue_cagr_5y_pct - 15.38) < 0.1);
});

test('aggregate: empty inputs → all nulls but ticker preserved', () => {
  const r = aggregate('X', [], [], []);
  assert.equal(r.ticker, 'X');
  assert.equal(r.roce_5y_avg, null);
  assert.equal(r.revenue_cagr_5y_pct, null);
  assert.equal(r.annual_periods_count, 0);
});

test('aggregate: latest quarter tracked', () => {
  const r = aggregate('X', [], [], [{ q_end: '2026-06-30', q_label: 'Q1FY27' }]);
  assert.equal(r.latest_quarterly_q_end, '2026-06-30');
  assert.equal(r.quarterly_periods_count, 1);
});
```

- [ ] **Step 2: Run tests to confirm fail**

```bash
node --test test/aggregate.test.js 2>&1 | tail -3
```

Expected: fail with `Cannot find module '../aggregate'`.

- [ ] **Step 3: Commit**

```bash
git add test/aggregate.test.js
git commit -m "Add failing tests for aggregate.js (5y averages + CAGRs)"
```

---

## Task 6: Implement aggregate.js

**Files:**
- Create: `aggregate.js`

- [ ] **Step 1: Write the module**

Write `aggregate.js`:

```javascript
/**
 * Pure aggregation. No I/O.
 *
 * aggregate(ticker, annualPl, annualDerived, quarterlyPl) →
 *   per-ticker { roce_5y_avg, ..., revenue_cagr_5y_pct, ... }
 *
 * Inputs must be in descending date order (newest first) — we sort defensively.
 * Missing data produces nulls.
 */

function safe(num) {
  if (num == null || !isFinite(num)) return null;
  return Number(num.toFixed(2));
}

function mean(arr) {
  const nums = arr.filter(v => v != null && isFinite(v));
  if (nums.length === 0) return null;
  return safe(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function cagr(latest, earliest, years) {
  if (latest == null || earliest == null) return null;
  if (earliest <= 0 || years <= 0) return null;
  const ratio = latest / earliest;
  if (!isFinite(ratio) || ratio <= 0) return null;
  return safe((Math.pow(ratio, 1 / years) - 1) * 100);
}

function sortDesc(rows, key) {
  return [...rows].sort((a, b) => String(b[key]).localeCompare(String(a[key])));
}

function aggregate(ticker, annualPl, annualDerived, quarterlyPl) {
  const sortedPl = sortDesc(annualPl || [], 'fy_end');
  const sortedDr = sortDesc(annualDerived || [], 'fy_end');
  const sortedQ  = sortDesc(quarterlyPl || [], 'q_end');

  // 5y window
  const last5Pl = sortedPl.slice(0, 5);
  const last5Dr = sortedDr.slice(0, 5);

  // Averages from derived
  const roce_5y_avg          = mean(last5Dr.map(r => r.roce_pct));
  const roe_5y_avg           = mean(last5Dr.map(r => r.roe_pct));
  const ebitda_margin_5y_avg = mean(last5Dr.map(r => r.ebitda_margin_pct));
  const pat_margin_5y_avg    = mean(last5Dr.map(r => r.pat_margin_pct));

  // CAGRs from P&L (years = number of intervals = N - 1 where N = data points)
  const revenue_cagr_5y_pct = last5Pl.length >= 2
    ? cagr(last5Pl[0]?.sales_cr,       last5Pl[last5Pl.length - 1]?.sales_cr,       last5Pl.length - 1)
    : null;
  const pat_cagr_5y_pct = last5Pl.length >= 2
    ? cagr(last5Pl[0]?.net_profit_cr,  last5Pl[last5Pl.length - 1]?.net_profit_cr,  last5Pl.length - 1)
    : null;
  const ebitda_cagr_5y_pct = last5Pl.length >= 2
    ? cagr(last5Pl[0]?.operating_profit_cr, last5Pl[last5Pl.length - 1]?.operating_profit_cr, last5Pl.length - 1)
    : null;

  // 10y CAGRs from full data
  const last10Pl = sortedPl.slice(0, 10);
  const revenue_cagr_10y_pct = last10Pl.length >= 2
    ? cagr(last10Pl[0]?.sales_cr,       last10Pl[last10Pl.length - 1]?.sales_cr,       last10Pl.length - 1)
    : null;
  const pat_cagr_10y_pct = last10Pl.length >= 2
    ? cagr(last10Pl[0]?.net_profit_cr,  last10Pl[last10Pl.length - 1]?.net_profit_cr,  last10Pl.length - 1)
    : null;

  return {
    ticker,
    roce_5y_avg,
    roe_5y_avg,
    ebitda_margin_5y_avg,
    pat_margin_5y_avg,
    revenue_cagr_5y_pct,
    pat_cagr_5y_pct,
    ebitda_cagr_5y_pct,
    revenue_cagr_10y_pct,
    pat_cagr_10y_pct,
    latest_annual_fy_end:    sortedPl[0]?.fy_end ?? null,
    latest_quarterly_q_end:  sortedQ[0]?.q_end ?? null,
    annual_periods_count:    sortedPl.length,
    quarterly_periods_count: sortedQ.length,
  };
}

module.exports = { aggregate };
```

- [ ] **Step 2: Run tests**

```bash
node --test test/aggregate.test.js 2>&1 | grep -E "pass [0-9]|fail [0-9]"
```

Expected: `pass 4` `fail 0`.

- [ ] **Step 3: Commit**

```bash
git add aggregate.js
git commit -m "Implement aggregate.js: 5y/10y averages + CAGRs from derived rows"
```

---

## Task 7: db.js CRUD for new tables

**Files:**
- Modify: `db.js`

- [ ] **Step 1: Add CRUD functions**

Open `db.js`. Just above the existing `module.exports = {` block, add:

```javascript
// ─── Companies (Group 1) ──────────────────────────────────────────────────────

async function upsertCompany(row) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('companies').upsert(
      { ...row, ticker: row.ticker.toUpperCase(), updated_at: new Date().toISOString() },
      { onConflict: 'ticker' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertCompany error:', err.message);
    return false;
  }
}

async function getCompany(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db.from('companies')
      .select('*').eq('ticker', ticker.toUpperCase()).single();
    if (error) return null;
    return data;
  } catch (err) {
    console.error('getCompany error:', err.message);
    return null;
  }
}

// ─── Source financial tables (Group 2) ───────────────────────────────────────

async function upsertAnnualPl(rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from('company_annual_pl').upsert(
      rows.map(r => ({ ...r, ticker: r.ticker.toUpperCase(), fetched_at: new Date().toISOString() })),
      { onConflict: 'ticker,fy_end' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertAnnualPl error:', err.message);
    return false;
  }
}

async function upsertAnnualBs(rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from('company_annual_bs').upsert(
      rows.map(r => ({ ...r, ticker: r.ticker.toUpperCase(), fetched_at: new Date().toISOString() })),
      { onConflict: 'ticker,fy_end' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertAnnualBs error:', err.message);
    return false;
  }
}

async function upsertAnnualCf(rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from('company_annual_cf').upsert(
      rows.map(r => ({ ...r, ticker: r.ticker.toUpperCase(), fetched_at: new Date().toISOString() })),
      { onConflict: 'ticker,fy_end' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertAnnualCf error:', err.message);
    return false;
  }
}

async function upsertQuarterlyPl(rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from('company_quarterly_pl').upsert(
      rows.map(r => ({ ...r, ticker: r.ticker.toUpperCase(), fetched_at: new Date().toISOString() })),
      { onConflict: 'ticker,q_end' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertQuarterlyPl error:', err.message);
    return false;
  }
}

// ─── Derived & aggregates (Group 3) ──────────────────────────────────────────

async function upsertDerivedAnnual(rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from('company_derived_annual').upsert(
      rows.map(r => ({ ...r, ticker: r.ticker.toUpperCase(), computed_at: new Date().toISOString() })),
      { onConflict: 'ticker,fy_end' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertDerivedAnnual error:', err.message);
    return false;
  }
}

async function upsertDerivedQuarterly(rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from('company_derived_quarterly').upsert(
      rows.map(r => ({ ...r, ticker: r.ticker.toUpperCase(), computed_at: new Date().toISOString() })),
      { onConflict: 'ticker,q_end' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertDerivedQuarterly error:', err.message);
    return false;
  }
}

async function upsertAggregates(row) {
  try {
    const db = getAdminClient();
    if (!db || !row?.ticker) return false;
    const { error } = await db.from('company_aggregates').upsert(
      { ...row, ticker: row.ticker.toUpperCase(), computed_at: new Date().toISOString() },
      { onConflict: 'ticker' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertAggregates error:', err.message);
    return false;
  }
}

// ─── Bundle reader: everything we need for an analysis ──────────────────────

async function getCompanyBundle(ticker) {
  const db = getAdminClient();
  if (!db) return null;
  const T = ticker.toUpperCase();
  try {
    const [companyRes, plRes, bsRes, cfRes, qRes, dAnnualRes, dQRes, aggRes] = await Promise.all([
      db.from('companies').select('*').eq('ticker', T).maybeSingle(),
      db.from('company_annual_pl').select('*').eq('ticker', T).order('fy_end', { ascending: false }),
      db.from('company_annual_bs').select('*').eq('ticker', T).order('fy_end', { ascending: false }),
      db.from('company_annual_cf').select('*').eq('ticker', T).order('fy_end', { ascending: false }),
      db.from('company_quarterly_pl').select('*').eq('ticker', T).order('q_end', { ascending: false }),
      db.from('company_derived_annual').select('*').eq('ticker', T).order('fy_end', { ascending: false }),
      db.from('company_derived_quarterly').select('*').eq('ticker', T).order('q_end', { ascending: false }),
      db.from('company_aggregates').select('*').eq('ticker', T).maybeSingle(),
    ]);
    return {
      ticker: T,
      company: companyRes.data || null,
      annual_pl: plRes.data || [],
      annual_bs: bsRes.data || [],
      annual_cf: cfRes.data || [],
      quarterly_pl: qRes.data || [],
      derived_annual: dAnnualRes.data || [],
      derived_quarterly: dQRes.data || [],
      aggregates: aggRes.data || null,
    };
  } catch (err) {
    console.error('getCompanyBundle error:', err.message);
    return null;
  }
}
```

- [ ] **Step 2: Add new functions to module.exports**

Find the existing `module.exports = {` block. Locate the line with `upsertOutcome, getAllOutcomes, getOutcomesByTicker,` and add after it (still inside the exports object):

```javascript
  // Phase 5: structured data layer
  upsertCompany, getCompany,
  upsertAnnualPl, upsertAnnualBs, upsertAnnualCf, upsertQuarterlyPl,
  upsertDerivedAnnual, upsertDerivedQuarterly, upsertAggregates,
  getCompanyBundle,
```

- [ ] **Step 3: Syntax check**

```bash
node --check db.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add db.js
git commit -m "Add db.js CRUD for Phase 5 structured tables (companies + financials + derived + aggregates)"
```

---

## Task 8: Failing tests for screenerScraper

**Files:**
- Create: `test/screenerScraper.test.js`

- [ ] **Step 1: Write the test file**

Write `test/screenerScraper.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseScreenerHtml, normalizePeriod } = require('../ingestion/screenerScraper');

const FIXTURE_HTML = `
<html><body>
<section id="quarters">
  <table class="data-table">
    <thead><tr><th></th>
      <th>Mar 2024</th><th>Jun 2024</th><th>Sep 2024</th><th>Dec 2024</th><th>Mar 2025</th>
    </tr></thead>
    <tbody>
      <tr><td>Sales +</td><td>37,923</td><td>39,315</td><td>40,986</td><td>41,764</td><td>40,925</td></tr>
      <tr><td>Expenses +</td><td>29,139</td><td>29,878</td><td>31,177</td><td>31,649</td><td>31,051</td></tr>
      <tr><td>Operating Profit</td><td>8,784</td><td>9,437</td><td>9,809</td><td>10,115</td><td>9,874</td></tr>
      <tr><td>OPM %</td><td>23%</td><td>24%</td><td>24%</td><td>24%</td><td>24%</td></tr>
      <tr><td>Other Income +</td><td>2,729</td><td>838</td><td>712</td><td>859</td><td>1,190</td></tr>
      <tr><td>Interest</td><td>110</td><td>105</td><td>108</td><td>101</td><td>102</td></tr>
      <tr><td>Depreciation</td><td>1,163</td><td>1,149</td><td>1,160</td><td>1,203</td><td>1,299</td></tr>
      <tr><td>Profit before tax</td><td>10,240</td><td>9,021</td><td>9,253</td><td>9,670</td><td>9,663</td></tr>
      <tr><td>Tax %</td><td>22%</td><td>29%</td><td>30%</td><td>29%</td><td>27%</td></tr>
      <tr><td>Net Profit +</td><td>7,975</td><td>6,374</td><td>6,516</td><td>6,822</td><td>7,038</td></tr>
      <tr><td>EPS in Rs</td><td>19.20</td><td>15.34</td><td>15.67</td><td>16.39</td><td>16.93</td></tr>
    </tbody>
  </table>
</section>

<section id="profit-loss">
  <table class="data-table">
    <thead><tr><th></th><th>Mar 2022</th><th>Mar 2023</th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
    <tbody>
      <tr><td>Sales +</td><td>100,000</td><td>120,000</td><td>140,000</td><td>160,000</td></tr>
      <tr><td>Expenses +</td><td>75,000</td><td>90,000</td><td>105,000</td><td>118,000</td></tr>
      <tr><td>Operating Profit</td><td>25,000</td><td>30,000</td><td>35,000</td><td>42,000</td></tr>
      <tr><td>OPM %</td><td>25%</td><td>25%</td><td>25%</td><td>26%</td></tr>
      <tr><td>Net Profit +</td><td>15,000</td><td>18,000</td><td>22,000</td><td>26,000</td></tr>
      <tr><td>EPS in Rs</td><td>30.00</td><td>36.00</td><td>44.00</td><td>52.00</td></tr>
    </tbody>
  </table>
</section>

<section id="balance-sheet">
  <table class="data-table">
    <thead><tr><th></th><th>Mar 2022</th><th>Mar 2023</th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
    <tbody>
      <tr><td>Equity Capital</td><td>500</td><td>500</td><td>500</td><td>500</td></tr>
      <tr><td>Reserves</td><td>40,000</td><td>50,000</td><td>62,000</td><td>76,000</td></tr>
      <tr><td>Borrowings +</td><td>15,000</td><td>13,000</td><td>11,000</td><td>9,000</td></tr>
      <tr><td>Total Liabilities</td><td>70,000</td><td>78,000</td><td>87,000</td><td>96,000</td></tr>
      <tr><td>Fixed Assets +</td><td>30,000</td><td>33,000</td><td>36,000</td><td>40,000</td></tr>
      <tr><td>Total Assets</td><td>70,000</td><td>78,000</td><td>87,000</td><td>96,000</td></tr>
    </tbody>
  </table>
</section>

<section id="cash-flow">
  <table class="data-table">
    <thead><tr><th></th><th>Mar 2022</th><th>Mar 2023</th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
    <tbody>
      <tr><td>Cash from Operating Activity +</td><td>20,000</td><td>23,000</td><td>27,000</td><td>32,000</td></tr>
      <tr><td>Cash from Investing Activity +</td><td>-8,000</td><td>-9,000</td><td>-10,000</td><td>-11,000</td></tr>
      <tr><td>Cash from Financing Activity +</td><td>-5,000</td><td>-6,000</td><td>-7,000</td><td>-8,000</td></tr>
      <tr><td>Net Cash Flow</td><td>7,000</td><td>8,000</td><td>10,000</td><td>13,000</td></tr>
    </tbody>
  </table>
</section>
</body></html>
`;

test('normalizePeriod: annual fiscal year', () => {
  assert.deepEqual(normalizePeriod('Mar 2024'), { date: '2024-03-31', label: 'FY24', kind: 'annual' });
  assert.deepEqual(normalizePeriod('Mar 2026'), { date: '2026-03-31', label: 'FY26', kind: 'annual' });
});

test('normalizePeriod: quarter ends', () => {
  assert.deepEqual(normalizePeriod('Jun 2024'), { date: '2024-06-30', label: 'Q1FY25', kind: 'quarter' });
  assert.deepEqual(normalizePeriod('Sep 2024'), { date: '2024-09-30', label: 'Q2FY25', kind: 'quarter' });
  assert.deepEqual(normalizePeriod('Dec 2024'), { date: '2024-12-31', label: 'Q3FY25', kind: 'quarter' });
});

test('parseScreenerHtml: extracts quarterly P&L', () => {
  const result = parseScreenerHtml('TEST', FIXTURE_HTML);
  assert.ok(Array.isArray(result.quarterly_pl));
  assert.equal(result.quarterly_pl.length, 5);
  const mar25 = result.quarterly_pl.find(r => r.q_end === '2025-03-31');
  assert.equal(mar25.sales_cr, 40925);
  assert.equal(mar25.net_profit_cr, 7038);
  assert.equal(mar25.opm_pct, 24);
  assert.equal(mar25.eps_rs, 16.93);
});

test('parseScreenerHtml: extracts annual P&L', () => {
  const result = parseScreenerHtml('TEST', FIXTURE_HTML);
  assert.ok(Array.isArray(result.annual_pl));
  assert.equal(result.annual_pl.length, 4);
  const fy25 = result.annual_pl.find(r => r.fy_end === '2025-03-31');
  assert.equal(fy25.sales_cr, 160000);
  assert.equal(fy25.net_profit_cr, 26000);
  assert.equal(fy25.eps_rs, 52);
});

test('parseScreenerHtml: extracts annual BS (equity computed)', () => {
  const result = parseScreenerHtml('TEST', FIXTURE_HTML);
  assert.equal(result.annual_bs.length, 4);
  const fy25 = result.annual_bs.find(r => r.fy_end === '2025-03-31');
  assert.equal(fy25.equity_share_capital_cr, 500);
  assert.equal(fy25.reserves_cr, 76000);
  assert.equal(fy25.total_equity_cr, 76500); // equity + reserves
  assert.equal(fy25.total_debt_cr, 9000);
  assert.equal(fy25.total_assets_cr, 96000);
});

test('parseScreenerHtml: extracts annual CF', () => {
  const result = parseScreenerHtml('TEST', FIXTURE_HTML);
  assert.equal(result.annual_cf.length, 4);
  const fy25 = result.annual_cf.find(r => r.fy_end === '2025-03-31');
  assert.equal(fy25.ocf_cr, 32000);
  assert.equal(fy25.icf_cr, -11000);
  assert.equal(fy25.ffc_cr, -8000);
  assert.equal(fy25.net_change_cash_cr, 13000);
});

test('parseScreenerHtml: empty/garbage HTML returns empty arrays', () => {
  const result = parseScreenerHtml('TEST', '<html><body><h1>not screener</h1></body></html>');
  assert.deepEqual(result.quarterly_pl, []);
  assert.deepEqual(result.annual_pl, []);
});
```

- [ ] **Step 2: Confirm fail**

```bash
node --test test/screenerScraper.test.js 2>&1 | tail -3
```

Expected: fail with `Cannot find module '../ingestion/screenerScraper'`.

- [ ] **Step 3: Commit**

```bash
git add test/screenerScraper.test.js
git commit -m "Add failing tests for screenerScraper (HTML parse + period normalisation)"
```

---

## Task 9: Implement screenerScraper.js

**Files:**
- Create: `ingestion/screenerScraper.js`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p ingestion
```

Write `ingestion/screenerScraper.js`:

```javascript
/**
 * screener.in scraper. Two surfaces:
 *   fetchScreenerHtml(ticker)   — async, HTTP GET screener.in/company/{ticker}/consolidated/
 *   parseScreenerHtml(ticker, html) — pure, returns { annual_pl, annual_bs, annual_cf, quarterly_pl }
 *
 * The parser is the testable core. Network is isolated for easy mocking.
 *
 * IMPORTANT: screener.in HTML structure may change. The selectors here assume
 * the four canonical sections #quarters, #profit-loss, #balance-sheet, #cash-flow,
 * each containing a single table.data-table whose first <thead> row has period
 * column headers like "Mar 2024" and whose <tbody> rows are line items.
 */

const https = require('https');
const cheerio = require('cheerio');

const MONTHS = {
  Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6,
  Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12,
};

const LAST_DAY = { 1:31, 2:28, 3:31, 4:30, 5:31, 6:30, 7:31, 8:31, 9:30, 10:31, 11:30, 12:31 };

function parseNumber(str) {
  if (str == null) return null;
  const cleaned = String(str).replace(/[,\s%₹]/g, '').trim();
  if (!cleaned || /^N\/?A$/i.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

function normalizePeriod(label) {
  // "Mar 2024" → annual / quarter detection
  const m = String(label).trim().match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  const year  = parseInt(m[2], 10);
  const day   = LAST_DAY[month];
  const date  = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  // Annual on screener = Mar (Indian fiscal year-end). Other months = quarter.
  if (month === 3) {
    return { date, label: `FY${String(year).slice(2)}`, kind: 'annual' };
  }
  // Quarter mapping: Jun→Q1, Sep→Q2, Dec→Q3, Mar→Q4 of NEXT fiscal year
  const qMap = { 6:'Q1', 9:'Q2', 12:'Q3' };
  const q = qMap[month];
  if (!q) return null;
  // Q1FY25 means Jun 2024 (fiscal year that ends Mar 2025)
  const fy = month === 12 ? year + 1 : year + 1;
  return { date, label: `${q}FY${String(fy).slice(2)}`, kind: 'quarter' };
}

function rowLabel(text) {
  return String(text || '').replace(/\s*\+\s*$/, '').trim().toLowerCase();
}

function extractTable($, sectionSelector) {
  const tbl = $(sectionSelector).find('table.data-table').first();
  if (!tbl.length) return { headers: [], rows: [] };
  const headers = tbl.find('thead tr th').slice(1).map((_, el) => $(el).text().trim()).get();
  const rows = [];
  tbl.find('tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 2) return;
    const label = rowLabel(cells.eq(0).text());
    const values = cells.slice(1).map((_, td) => $(td).text().trim()).get();
    rows.push({ label, values });
  });
  return { headers, rows };
}

function findRow(rows, ...needles) {
  for (const r of rows) {
    for (const n of needles) {
      if (r.label.includes(n)) return r.values;
    }
  }
  return null;
}

function buildPlRow(ticker, period, values, idx) {
  // values is an object: { sales, expenses, ... } indexed by period column
  return {
    ticker,
    [period.kind === 'annual' ? 'fy_end'   : 'q_end']:   period.date,
    [period.kind === 'annual' ? 'fy_label' : 'q_label']: period.label,
    sales_cr:            parseNumber(values.sales?.[idx]),
    expenses_cr:         parseNumber(values.expenses?.[idx]),
    operating_profit_cr: parseNumber(values.op?.[idx]),
    opm_pct:             parseNumber(values.opm?.[idx]),
    other_income_cr:     parseNumber(values.other_income?.[idx]),
    interest_cr:         parseNumber(values.interest?.[idx]),
    depreciation_cr:     parseNumber(values.depreciation?.[idx]),
    pbt_cr:              parseNumber(values.pbt?.[idx]),
    tax_pct:             parseNumber(values.tax?.[idx]),
    net_profit_cr:       parseNumber(values.net_profit?.[idx]),
    eps_rs:              parseNumber(values.eps?.[idx]),
  };
}

function parsePlSection($, sectionSelector, kind /* 'annual' | 'quarter' */) {
  const { headers, rows } = extractTable($, sectionSelector);
  if (!headers.length || !rows.length) return [];
  const v = {
    sales:        findRow(rows, 'sales'),
    expenses:     findRow(rows, 'expenses'),
    op:           findRow(rows, 'operating profit'),
    opm:          findRow(rows, 'opm'),
    other_income: findRow(rows, 'other income'),
    interest:     findRow(rows, 'interest'),
    depreciation: findRow(rows, 'depreciation'),
    pbt:          findRow(rows, 'profit before tax'),
    tax:          findRow(rows, 'tax %'),
    net_profit:   findRow(rows, 'net profit'),
    eps:          findRow(rows, 'eps'),
  };
  const out = [];
  headers.forEach((h, i) => {
    const p = normalizePeriod(h);
    if (!p || p.kind !== kind) return;
    out.push(buildPlRow(null, p, v, i));
  });
  return out;
}

function parseBsSection($, sectionSelector) {
  const { headers, rows } = extractTable($, sectionSelector);
  if (!headers.length || !rows.length) return [];
  const v = {
    equity:        findRow(rows, 'equity capital'),
    reserves:      findRow(rows, 'reserves'),
    borrowings:    findRow(rows, 'borrowings'),
    other_liab:    findRow(rows, 'other liabilities'),
    total_liab:    findRow(rows, 'total liabilities'),
    fixed_assets:  findRow(rows, 'fixed assets'),
    cwip:          findRow(rows, 'cwip'),
    investments:   findRow(rows, 'investments'),
    other_assets:  findRow(rows, 'other assets'),
    total_assets:  findRow(rows, 'total assets'),
  };
  const out = [];
  headers.forEach((h, i) => {
    const p = normalizePeriod(h);
    if (!p || p.kind !== 'annual') return;
    const equity   = parseNumber(v.equity?.[i]);
    const reserves = parseNumber(v.reserves?.[i]);
    out.push({
      fy_end:   p.date,
      fy_label: p.label,
      equity_share_capital_cr: equity,
      reserves_cr:             reserves,
      total_equity_cr:         (equity != null && reserves != null) ? equity + reserves : null,
      long_term_borrowings_cr:  null,
      short_term_borrowings_cr: null,
      total_debt_cr:           parseNumber(v.borrowings?.[i]),
      trade_payables_cr:       null,
      other_current_liab_cr:   parseNumber(v.other_liab?.[i]),
      fixed_assets_cr:         parseNumber(v.fixed_assets?.[i]),
      cwip_cr:                 parseNumber(v.cwip?.[i]),
      investments_cr:          parseNumber(v.investments?.[i]),
      inventories_cr:          null,
      trade_receivables_cr:    null,
      cash_cr:                 null,
      other_current_assets_cr: parseNumber(v.other_assets?.[i]),
      total_assets_cr:         parseNumber(v.total_assets?.[i]),
      book_value_per_share:    null,
    });
  });
  return out;
}

function parseCfSection($, sectionSelector) {
  const { headers, rows } = extractTable($, sectionSelector);
  if (!headers.length || !rows.length) return [];
  const v = {
    ocf:   findRow(rows, 'cash from operating'),
    icf:   findRow(rows, 'cash from investing'),
    ffc:   findRow(rows, 'cash from financing'),
    net:   findRow(rows, 'net cash flow'),
  };
  const out = [];
  headers.forEach((h, i) => {
    const p = normalizePeriod(h);
    if (!p || p.kind !== 'annual') return;
    out.push({
      fy_end:   p.date,
      fy_label: p.label,
      ocf_cr:             parseNumber(v.ocf?.[i]),
      icf_cr:             parseNumber(v.icf?.[i]),
      ffc_cr:             parseNumber(v.ffc?.[i]),
      net_change_cash_cr: parseNumber(v.net?.[i]),
      capex_cr:           null,
      free_cash_flow_cr:  null,
      dividends_paid_cr:  null,
      debt_raised_cr:     null,
      debt_repaid_cr:     null,
    });
  });
  return out;
}

function parseScreenerHtml(ticker, html) {
  const T = ticker.toUpperCase();
  const $ = cheerio.load(html);
  const annualPl  = parsePlSection($, '#profit-loss', 'annual').map(r => ({ ticker: T, ...r }));
  const quartPl   = parsePlSection($, '#quarters',    'quarter').map(r => ({ ticker: T, ...r }));
  const annualBs  = parseBsSection($, '#balance-sheet').map(r => ({ ticker: T, ...r }));
  const annualCf  = parseCfSection($, '#cash-flow').map(r => ({ ticker: T, ...r }));
  return {
    annual_pl:    annualPl,
    annual_bs:    annualBs,
    annual_cf:    annualCf,
    quarterly_pl: quartPl,
  };
}

function fetchScreenerHtml(ticker, opts = {}) {
  const T = ticker.toUpperCase();
  const path = opts.standalone
    ? `/company/${T}/`
    : `/company/${T}/consolidated/`;
  return new Promise((resolve, reject) => {
    https.get(`https://www.screener.in${path}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode === 302 && !opts.standalone) {
        // Some companies don't have a /consolidated/ page — retry standalone
        return fetchScreenerHtml(ticker, { standalone: true }).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`screener.in returned ${res.statusCode}`));
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = { fetchScreenerHtml, parseScreenerHtml, normalizePeriod, parseNumber };
```

- [ ] **Step 2: Run tests**

```bash
node --test test/screenerScraper.test.js 2>&1 | grep -E "pass [0-9]|fail [0-9]"
```

Expected: `pass 7` `fail 0`.

- [ ] **Step 3: Commit**

```bash
git add ingestion/screenerScraper.js
git commit -m "Implement screenerScraper: HTML parse for 4 statements with fixture-tested parser"
```

---

## Task 10: Orchestrator — ingestCompany(ticker)

**Files:**
- Create: `ingestion/orchestrator.js`

- [ ] **Step 1: Write the orchestrator**

Write `ingestion/orchestrator.js`:

```javascript
/**
 * Orchestrator: end-to-end ingestion for one ticker.
 *
 * ingestCompany(ticker, db) →
 *   1. Fetch screener.in HTML
 *   2. Parse to source-table rows
 *   3. Upsert source tables
 *   4. Derive per-period ratios → upsert derived tables
 *   5. Aggregate → upsert company_aggregates
 *   6. Return summary { ticker, periods_added, errors }
 */

const { fetchScreenerHtml, parseScreenerHtml } = require('./screenerScraper');
const { deriveAnnual, deriveQuarterly } = require('../derive');
const { aggregate } = require('../aggregate');

async function ingestCompany(ticker, db) {
  const T = ticker.toUpperCase();
  const summary = { ticker: T, periods_added: 0, errors: [] };

  // 1. Fetch
  let html;
  try {
    html = await fetchScreenerHtml(T);
  } catch (e) {
    summary.errors.push({ stage: 'fetch', error: e.message });
    return summary;
  }

  // 2. Parse
  let parsed;
  try {
    parsed = parseScreenerHtml(T, html);
  } catch (e) {
    summary.errors.push({ stage: 'parse', error: e.message });
    return summary;
  }

  // 3. Upsert source tables
  try {
    if (parsed.annual_pl.length)    await db.upsertAnnualPl(parsed.annual_pl);
    if (parsed.annual_bs.length)    await db.upsertAnnualBs(parsed.annual_bs);
    if (parsed.annual_cf.length)    await db.upsertAnnualCf(parsed.annual_cf);
    if (parsed.quarterly_pl.length) await db.upsertQuarterlyPl(parsed.quarterly_pl);
    summary.periods_added = parsed.annual_pl.length + parsed.quarterly_pl.length;
  } catch (e) {
    summary.errors.push({ stage: 'upsert_source', error: e.message });
    return summary;
  }

  // 4. Derive per-period
  try {
    const annualDerived = [];
    const sortedPl = [...parsed.annual_pl].sort((a,b) => b.fy_end.localeCompare(a.fy_end));
    const bsByFy   = Object.fromEntries(parsed.annual_bs.map(r => [r.fy_end, r]));
    const cfByFy   = Object.fromEntries(parsed.annual_cf.map(r => [r.fy_end, r]));
    for (let i = 0; i < sortedPl.length; i++) {
      const pl = sortedPl[i];
      const priorPl = sortedPl[i + 1] || null;
      const dr = deriveAnnual({ pl, bs: bsByFy[pl.fy_end], cf: cfByFy[pl.fy_end], priorPl });
      annualDerived.push({ ticker: T, fy_end: pl.fy_end, fy_label: pl.fy_label, ...dr });
    }
    if (annualDerived.length) await db.upsertDerivedAnnual(annualDerived);

    const quarterDerived = [];
    const sortedQ = [...parsed.quarterly_pl].sort((a,b) => b.q_end.localeCompare(a.q_end));
    for (let i = 0; i < sortedQ.length; i++) {
      const current = sortedQ[i];
      const priorQuarter  = sortedQ[i + 1] || null;
      const samePriorYear = sortedQ[i + 4] || null;
      const dr = deriveQuarterly({ current, samePriorYear, priorQuarter });
      quarterDerived.push({ ticker: T, q_end: current.q_end, q_label: current.q_label, ...dr });
    }
    if (quarterDerived.length) await db.upsertDerivedQuarterly(quarterDerived);

    // 5. Aggregate
    const agg = aggregate(T, parsed.annual_pl, annualDerived, parsed.quarterly_pl);
    await db.upsertAggregates(agg);
  } catch (e) {
    summary.errors.push({ stage: 'derive_aggregate', error: e.message });
  }

  return summary;
}

module.exports = { ingestCompany };
```

- [ ] **Step 2: Syntax check**

```bash
node --check ingestion/orchestrator.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add ingestion/orchestrator.js
git commit -m "Add ingestion/orchestrator: end-to-end pipeline for one ticker"
```

---

## Task 11: API endpoints — bundle reader + admin ingest

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Import the new modules**

Find the existing import block in `index.js`:

```javascript
const { fetchYahooPrice } = require('./priceCheck');
```

Add directly below:

```javascript
const { ingestCompany } = require('./ingestion/orchestrator');
```

- [ ] **Step 2: Add `getCompanyBundle` to the destructured db imports**

Find:

```javascript
  upsertOutcome, getAllOutcomes, getOutcomesByTicker,
} = require('./db');
```

Replace with:

```javascript
  upsertOutcome, getAllOutcomes, getOutcomesByTicker,
  upsertCompany, getCompany,
  upsertAnnualPl, upsertAnnualBs, upsertAnnualCf, upsertQuarterlyPl,
  upsertDerivedAnnual, upsertDerivedQuarterly, upsertAggregates,
  getCompanyBundle,
} = require('./db');
```

- [ ] **Step 3: Add the new endpoints**

Just above the existing `/api/admin/backfill-outcomes` endpoint, add:

```javascript
// ─── Phase 5: structured-data endpoints ──────────────────────────────────────

app.get('/api/company/:ticker/financials', requireAuth, async (req, res) => {
  try {
    const bundle = await getCompanyBundle(req.params.ticker);
    if (!bundle) return res.status(404).json({ error: 'No data for ticker' });
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/ingest/:ticker', requireAdmin, async (req, res) => {
  try {
    const dbHelpers = {
      upsertAnnualPl, upsertAnnualBs, upsertAnnualCf, upsertQuarterlyPl,
      upsertDerivedAnnual, upsertDerivedQuarterly, upsertAggregates,
    };
    const result = await ingestCompany(req.params.ticker, dbHelpers);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Syntax check**

```bash
node --check index.js
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add index.js
git commit -m "Add /api/company/:ticker/financials + /api/admin/ingest/:ticker endpoints"
```

---

## Task 12: FinancialsGrid component (auto-expanding)

**Files:**
- Create: `client/src/components/FinancialsGrid.js`

- [ ] **Step 1: Write the component**

Write `client/src/components/FinancialsGrid.js`:

```jsx
import React, { useState, useEffect } from 'react';
import authFetch from '../lib/api';

const fmtCr = (n) => {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString('en-IN');
};
const fmtPct = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;
const fmtX   = (n) => n == null ? '—' : `${Number(n).toFixed(2)}×`;

const PL_ROWS = [
  { key: 'sales_cr',            label: 'Sales',            fmt: fmtCr },
  { key: 'expenses_cr',         label: 'Expenses',         fmt: fmtCr },
  { key: 'operating_profit_cr', label: 'Operating Profit', fmt: fmtCr, bold: true },
  { key: 'opm_pct',             label: 'OPM %',            fmt: fmtPct },
  { key: 'other_income_cr',     label: 'Other Income',     fmt: fmtCr },
  { key: 'interest_cr',         label: 'Interest',         fmt: fmtCr },
  { key: 'depreciation_cr',     label: 'Depreciation',     fmt: fmtCr },
  { key: 'pbt_cr',              label: 'Profit before tax',fmt: fmtCr, bold: true },
  { key: 'tax_pct',             label: 'Tax %',            fmt: fmtPct },
  { key: 'net_profit_cr',       label: 'Net Profit',       fmt: fmtCr, bold: true },
  { key: 'eps_rs',              label: 'EPS in ₹',         fmt: fmtCr },
];

const BS_ROWS = [
  { key: 'equity_share_capital_cr', label: 'Equity Capital',  fmt: fmtCr },
  { key: 'reserves_cr',             label: 'Reserves',        fmt: fmtCr },
  { key: 'total_equity_cr',         label: 'Total Equity',    fmt: fmtCr, bold: true },
  { key: 'total_debt_cr',           label: 'Borrowings',      fmt: fmtCr },
  { key: 'other_current_liab_cr',   label: 'Other Liabilities',fmt: fmtCr },
  { key: 'fixed_assets_cr',         label: 'Fixed Assets',    fmt: fmtCr },
  { key: 'cwip_cr',                 label: 'CWIP',            fmt: fmtCr },
  { key: 'investments_cr',          label: 'Investments',     fmt: fmtCr },
  { key: 'total_assets_cr',         label: 'Total Assets',    fmt: fmtCr, bold: true },
];

const CF_ROWS = [
  { key: 'ocf_cr',             label: 'Cash from Operating',  fmt: fmtCr, bold: true },
  { key: 'icf_cr',             label: 'Cash from Investing',  fmt: fmtCr },
  { key: 'ffc_cr',             label: 'Cash from Financing',  fmt: fmtCr },
  { key: 'net_change_cash_cr', label: 'Net Cash Flow',        fmt: fmtCr, bold: true },
];

const DERIVED_ANNUAL_ROWS = [
  { key: 'ebitda_margin_pct', label: 'EBITDA margin', fmt: fmtPct },
  { key: 'pat_margin_pct',    label: 'PAT margin',    fmt: fmtPct },
  { key: 'roe_pct',           label: 'ROE',           fmt: fmtPct, bold: true },
  { key: 'roce_pct',          label: 'ROCE',          fmt: fmtPct, bold: true },
  { key: 'debt_to_equity',    label: 'Debt / Equity', fmt: fmtX },
  { key: 'interest_coverage', label: 'Interest cov.', fmt: fmtX },
];

function Section({ title, columns, rows, data, periodKey }) {
  if (!data?.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}></th>
              {columns.map(c => (
                <th key={c[periodKey]} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontFamily: 'var(--font-mono)' }}>
                  {c[periodKey === 'fy_end' ? 'fy_label' : 'q_label']}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', color: r.bold ? 'var(--text)' : 'var(--text-2)', fontWeight: r.bold ? 600 : 400 }}>{r.label}</td>
                {columns.map(c => (
                  <td key={c[periodKey]} style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.bold ? 'var(--text)' : 'var(--text-2)', fontWeight: r.bold ? 600 : 400 }}>
                    {r.fmt(c[r.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FinancialsGrid({ ticker }) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    authFetch(`/api/company/${ticker}/financials`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`Server ${r.status}`)))
      .then(d => { setBundle(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [ticker]);

  if (loading) return <div style={{ color: 'var(--text-3)', padding: 12, fontSize: 12 }}>Loading financials…</div>;
  if (error)   return <div style={{ color: 'var(--text-3)', padding: 12, fontSize: 12 }}>Financial data not yet ingested for {ticker}. Run admin → Ingest Ticker.</div>;
  if (!bundle) return null;

  const annualByFy = Object.fromEntries((bundle.annual_pl || []).map(r => [r.fy_end, r]));
  const bsByFy     = Object.fromEntries((bundle.annual_bs || []).map(r => [r.fy_end, r]));
  const cfByFy     = Object.fromEntries((bundle.annual_cf || []).map(r => [r.fy_end, r]));
  const drByFy     = Object.fromEntries((bundle.derived_annual || []).map(r => [r.fy_end, r]));
  const annualCols = (bundle.annual_pl || []).slice(0, 8).map(r => ({
    fy_end: r.fy_end, fy_label: r.fy_label, ...r, ...bsByFy[r.fy_end], ...cfByFy[r.fy_end], ...drByFy[r.fy_end],
  }));
  const quarterCols = (bundle.quarterly_pl || []).slice(0, 13);

  return (
    <div>
      <Section title="Quarterly P&L (consolidated, ₹ Cr)" columns={quarterCols} rows={PL_ROWS} data={quarterCols} periodKey="q_end" />
      <Section title="Annual P&L (consolidated, ₹ Cr)"   columns={annualCols}  rows={PL_ROWS} data={annualCols}  periodKey="fy_end" />
      <Section title="Annual Balance Sheet (₹ Cr)"        columns={annualCols}  rows={BS_ROWS} data={annualCols}  periodKey="fy_end" />
      <Section title="Annual Cash Flow (₹ Cr)"            columns={annualCols}  rows={CF_ROWS} data={annualCols}  periodKey="fy_end" />
      <Section title="Annual Derived Ratios"              columns={annualCols}  rows={DERIVED_ANNUAL_ROWS} data={annualCols} periodKey="fy_end" />
    </div>
  );
}
```

- [ ] **Step 2: Brace check**

```bash
node -e "
const c=require('fs').readFileSync('client/src/components/FinancialsGrid.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log((o===cl && p===pl)?'OK':'FAIL');
"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/FinancialsGrid.js
git commit -m "Add FinancialsGrid component: auto-expanding period columns for P&L/BS/CF/derived"
```

---

## Task 13: Refactor `agent.js` — hybrid path (structured first, AI extraction fallback)

**Files:**
- Modify: `agent.js`

- [ ] **Step 1: Import getCompanyBundle**

Open `agent.js`. Find the top imports. After the `verifyAnalysis` line, add:

```javascript
const { getCompanyBundle } = require('./db');
```

- [ ] **Step 2: Add a helper that builds the structured-data prompt section**

Just above the `runMarshallAnalysis` function, add this helper:

```javascript
/**
 * Builds a compact, Marshall-relevant structured data block from a company bundle.
 * Returns null if no data found — caller falls back to the existing AI-extraction path.
 */
function buildStructuredDataContext(bundle) {
  if (!bundle) return null;
  const a = bundle.aggregates || {};
  const lastAnnualPl = (bundle.annual_pl || [])[0];
  const lastDerived  = (bundle.derived_annual || [])[0];
  const lastQuarter  = (bundle.quarterly_pl || [])[0];

  // Only return a structured context if we have at least one annual row
  if (!lastAnnualPl) return null;

  const annual = (bundle.annual_pl || []).slice(0, 5).map(r => ({
    fy: r.fy_label,
    sales_cr: r.sales_cr, op_profit_cr: r.operating_profit_cr,
    net_profit_cr: r.net_profit_cr, eps: r.eps_rs,
  }));
  const quarters = (bundle.quarterly_pl || []).slice(0, 5).map(r => ({
    q: r.q_label,
    sales_cr: r.sales_cr, op_profit_cr: r.operating_profit_cr,
    net_profit_cr: r.net_profit_cr,
  }));

  return [
    '=== AUTHORITATIVE STRUCTURED FINANCIAL DATA (source: screener.in consolidated) ===',
    `Latest annual: ${lastAnnualPl.fy_label} (period ending ${lastAnnualPl.fy_end})`,
    `Latest quarter: ${lastQuarter?.q_label || 'n/a'}`,
    '',
    'KEY AGGREGATES:',
    `  ROCE 5y avg: ${a.roce_5y_avg ?? 'n/a'}%`,
    `  ROE 5y avg:  ${a.roe_5y_avg ?? 'n/a'}%`,
    `  Revenue CAGR 5y: ${a.revenue_cagr_5y_pct ?? 'n/a'}%`,
    `  PAT CAGR 5y:     ${a.pat_cagr_5y_pct ?? 'n/a'}%`,
    `  EBITDA margin 5y avg: ${a.ebitda_margin_5y_avg ?? 'n/a'}%`,
    `  PAT margin 5y avg:    ${a.pat_margin_5y_avg ?? 'n/a'}%`,
    '',
    'LATEST FY DERIVED METRICS:',
    `  ROCE: ${lastDerived?.roce_pct ?? 'n/a'}%`,
    `  ROE:  ${lastDerived?.roe_pct ?? 'n/a'}%`,
    `  Debt/Equity: ${lastDerived?.debt_to_equity ?? 'n/a'}`,
    `  Interest coverage: ${lastDerived?.interest_coverage ?? 'n/a'}×`,
    `  OCF/PAT: ${lastDerived?.ocf_to_pat_pct ?? 'n/a'}%`,
    `  FCF margin: ${lastDerived?.fcf_margin_pct ?? 'n/a'}%`,
    '',
    'ANNUAL P&L (₹ Cr):',
    JSON.stringify(annual, null, 2),
    '',
    'QUARTERLY P&L (₹ Cr):',
    JSON.stringify(quarters, null, 2),
    '=== END STRUCTURED DATA — TREAT AS PRIMARY SOURCE OF TRUTH FOR NUMBERS ===',
  ].join('\n');
}
```

- [ ] **Step 3: Wire the helper into `runMarshallAnalysis`**

Inside `runMarshallAnalysis`, find the section where `rawData` is fetched:

```javascript
    const rawData = await fetchCompanyData(ticker, companyName, opts.extraQueries || []);
```

Add directly below (before the `dataContext` line):

```javascript
    // Phase 5: prefer structured data when available
    const bundle = await getCompanyBundle(ticker).catch(() => null);
    const structuredContext = buildStructuredDataContext(bundle);
    if (structuredContext) {
      console.log(`📚 Using structured data for ${ticker} (${bundle.annual_pl.length} annual periods, ${bundle.quarterly_pl.length} quarters)`);
    }
```

Then find the `analysisPrompt` template-literal definition. Locate this line inside the prompt:

```javascript
Financial and business data gathered:

${dataContext}
```

Replace with:

```javascript
Financial and business data gathered:

${structuredContext ? structuredContext + '\n\n' : ''}${dataContext}
```

This prepends the authoritative structured data when available, while keeping the
existing search-text context for qualitative narrative (Gate 2b moat, news,
management quotes, etc.). The model is instructed to treat structured data as
the source of truth for numbers.

- [ ] **Step 4: Syntax check**

```bash
node --check agent.js
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add agent.js
git commit -m "Refactor agent: prepend authoritative structured data to analysis prompt when available"
```

---

## Task 14: Admin Panel — Ingest Ticker card

**Files:**
- Modify: `client/src/pages/AdminPanel.js`

- [ ] **Step 1: Add state hooks and handler**

Open `AdminPanel.js`. Find the existing `handleBackfillOutcomes` function. Directly below its closing `};`, add:

```javascript
  // Phase 5: ingest a single ticker's structured data from screener.in
  const [ingestTicker, setIngestTicker] = useState('');
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestResult, setIngestResult] = useState(null);

  const handleIngest = async (e) => {
    e.preventDefault();
    if (!ingestTicker.trim()) return;
    setIngestLoading(true); setIngestResult(null);
    try {
      const res = await authFetch(`/api/admin/ingest/${ingestTicker.trim().toUpperCase()}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const errs = (data.errors || []).map(e => `${e.stage}: ${e.error}`).join('; ');
        setIngestResult(
          errs
            ? `⚠ Partial — ${data.periods_added} periods. Errors: ${errs}`
            : `✓ Done — ${data.periods_added} periods stored for ${data.ticker}`
        );
      } else {
        setIngestResult(`⚠ ${data.error}`);
      }
    } catch (e) {
      setIngestResult('⚠ ' + e.message);
    } finally {
      setIngestLoading(false);
    }
  };
```

- [ ] **Step 2: Add the card to the JSX**

Find the existing "Backfill Analysis Outcomes" card. Directly after its closing `</div>`, add:

```javascript
        {/* Ingest single ticker's fundamentals (Phase 5) */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIcon}>📥</div>
            <div>
              <h2 style={styles.cardTitle}>Ingest Ticker Fundamentals</h2>
              <p style={styles.cardSubtitle}>
                Fetch 5y annual P&L + Balance Sheet + Cash Flow + recent quarterly P&L from screener.in (consolidated) for one ticker, then compute derived ratios + aggregates. Run before analysing the ticker to use structured data path.
              </p>
            </div>
          </div>
          <form onSubmit={handleIngest} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={ingestTicker}
              onChange={e => setIngestTicker(e.target.value)}
              placeholder="HFCL, BHARTIARTL, …"
              className="input-field"
              style={{ minWidth: 200, textTransform: 'uppercase' }}
            />
            <button
              type="submit"
              disabled={ingestLoading || !ingestTicker.trim()}
              style={{ background: '#3b82f6', color: '#0d0f11', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: ingestLoading ? 'not-allowed' : 'pointer', opacity: ingestLoading ? 0.7 : 1, fontFamily: 'inherit' }}
            >
              {ingestLoading ? 'Ingesting…' : '📥 Ingest Now'}
            </button>
          </form>
          {ingestResult && <div style={{ marginTop: 12, fontSize: 13, color: ingestResult.startsWith('✓') ? '#22c55e' : '#f87171' }}>{ingestResult}</div>}
        </div>
```

- [ ] **Step 3: Brace check**

```bash
node -e "
const c=require('fs').readFileSync('client/src/pages/AdminPanel.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log((o===cl && p===pl)?'OK':'FAIL');
"
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/AdminPanel.js
git commit -m "Add 'Ingest Ticker Fundamentals' card to Admin Panel"
```

---

## Task 15: Wire FinancialsGrid into AnalysisView + E2E push

**Files:**
- Modify: `client/src/pages/AnalysisView.js`

- [ ] **Step 1: Import FinancialsGrid**

Open `AnalysisView.js`. Find this import:

```javascript
import VerificationBadge from '../components/VerificationBadge';
```

Add directly below:

```javascript
import FinancialsGrid from '../components/FinancialsGrid';
```

- [ ] **Step 2: Render FinancialsGrid inside Gate 2a**

Find the Gate 2a `<GateSection ...>` block. Locate the existing closing `</GateSection>` for Gate 2a. Directly above that closing tag, add:

```javascript
          <div style={{ marginTop: 16 }}>
            <div className="section-label">Structured Financials (auto-expanding)</div>
            <FinancialsGrid ticker={ticker} />
          </div>
```

(`ticker` is already in scope from the component's props.)

- [ ] **Step 3: Brace check**

```bash
node -e "
const c=require('fs').readFileSync('client/src/pages/AnalysisView.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log((o===cl && p===pl)?'OK':'FAIL');
"
```

Expected: `OK`.

- [ ] **Step 4: Full test suite**

```bash
node --test test/derive.test.js     2>&1 | grep -E "pass [0-9]|fail [0-9]"
node --test test/aggregate.test.js  2>&1 | grep -E "pass [0-9]|fail [0-9]"
node --test test/screenerScraper.test.js 2>&1 | grep -E "pass [0-9]|fail [0-9]"
```

Expected: each file shows `fail 0`.

- [ ] **Step 5: Backend syntax sweep**

```bash
node --check derive.js && node --check aggregate.js && node --check db.js && node --check agent.js && node --check index.js && node --check ingestion/screenerScraper.js && node --check ingestion/orchestrator.js && echo "Backend OK"
```

Expected: `Backend OK`.

- [ ] **Step 6: Commit + push**

```bash
git add client/src/pages/AnalysisView.js
git commit -m "Render FinancialsGrid inside Gate 2a section"
git push origin main
```

- [ ] **Step 7: Manual smoke test once Render deploys (~3-5 min)**

1. User runs the SQL migration in Supabase (Task 1 Step 2) if not already done.
2. Open Admin Panel → `📥 Ingest Ticker Fundamentals` card → enter `HFCL` → click "Ingest Now". Wait ~10s. Expected: `✓ Done — N periods stored for HFCL`.
3. Open any analysis page for HFCL (run a fresh analysis if needed). Scroll to Gate 2a → the FinancialsGrid table should appear with auto-expanding period columns.
4. New analyses run after Step 2 should have a `📚 Using structured data for HFCL …` log line in Render logs, confirming the structured path is engaged.

- [ ] **Step 8: Mark feature complete**

If all smoke-test steps pass, Phase 5.1 is shipped.

---

## Self-Review Notes

**Spec coverage (master plan §4, §5, §10):**

- ✅ Group 1 (companies, sectors) — Task 1 + Task 7 CRUD
- ✅ Group 2 (4 source tables) — Task 1 + Task 7 CRUD + Task 9 parser
- ✅ Group 3 (derived + aggregates) — Tasks 3-6 + Task 7 CRUD
- ✅ M1 Ingestion service: screenerScraper.js — Tasks 8-9. nseScraper / yahoo extend / orchestrator nightly bulk → deferred to Phase 5.2
- ✅ M2 Computation: derive.js + aggregate.js — Tasks 3-6
- ✅ M3 Analysis service refactor — Task 13 (hybrid path; AI fallback preserved)
- ✅ Phase 5 row of §10 phasing — this plan

**Deferred to Phase 5.2 (next plan):**
- NSE scraper for live shareholding + promoter pledge
- Yahoo fetcher extension for full price history
- Nightly bulk universe ingestion across ~1,500 tickers
- Removal of AI-extraction fallback path once structured data proven reliable

**Name & type consistency:**
- Table names match SQL migration → db.js CRUD → frontend column keys
- `fy_end`/`q_end` used consistently as date columns
- `fy_label`/`q_label` used consistently as human-readable labels
- Function names: `upsertAnnualPl/Bs/Cf/QuarterlyPl`, `upsertDerivedAnnual/Quarterly`, `upsertAggregates`, `getCompanyBundle` consistent everywhere
- Period kind `'annual' | 'quarter'` consistent in `normalizePeriod`
- All units suffixed `_cr` (₹ Crores) and `_pct` (percent) per convention
