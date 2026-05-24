# Phase 6 — Financial Ontology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single source of truth for every financial metric — a pure JS `ontology.js` module — and wire `ranking.js`, the AI structured-data block, and the system-prompt benchmark table to read from it, so metric names/units/benchmarks can never drift apart.

**Architecture:** Shallow registry (Approach A). `ontology.js` exports a `METRICS` object (~65 concept entries across 6 families) plus helpers. Consumers import canonical values; no existing formulas are rewritten and no DB columns or JS fields are renamed. A no-drift test cross-checks `derive.js`/`aggregate.js` output fields against the registry. Fully additive: no migration, no Supabase change, no frontend change.

**Tech Stack:** Node.js (CommonJS), built-in `node --test` runner (zero deps), existing pure-module pattern (`derive.js`, `aggregate.js`, `ranking.js`).

**Spec:** `docs/superpowers/specs/2026-05-24-phase6-financial-ontology-design.md`

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `ontology.js` | Create | The `METRICS` registry + `UNITS` table + helpers (`get`, `format`, `byFamily`, `benchmark`, `buildBenchmarkTable`, `fieldToMetric`, `METRIC_KEYS`). Pure, no I/O. |
| `test/ontology.test.js` | Create | Schema integrity, `format`, `benchmark`, `buildBenchmarkTable`, `dependsOn` sanity. |
| `test/ontology-nodrift.test.js` | Create | No-drift guard: every `derive.js`/`aggregate.js` output field maps to an ontology entry. |
| `ranking.js` | Modify | Replace the two hardcoded `roce < 15` gates with `ontology.benchmark('roce')`. |
| `agent.js` | Modify | `buildStructuredDataContext` builds lines from `ontology.get(key).label` + `ontology.format(key, value)`. |
| `marshallPrompt.js` | Modify | Replace the literal sector-benchmark table with `${buildBenchmarkTable()}`; export stays a string. |

---

## Task 1: Build `ontology.js` core (registry + helpers)

**Files:**
- Create: `ontology.js`
- Test: `test/ontology.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/ontology.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ontology.test.js`
Expected: FAIL with `Cannot find module '../ontology'`.

- [ ] **Step 3: Write the implementation**

Create `ontology.js`:

```js
/**
 * Financial ontology — single source of truth for every metric in ValueSight.
 * Pure module, no I/O. One entry per metric CONCEPT (not per field): a concept
 * is defined once even when it materialises as several fields (e.g. ROCE →
 * roce_pct, roce_5y_avg, roce_ttm). `fields` maps a concept to the actual
 * column / JS field names already used by the scraper, derive.js and aggregate.js
 * — nothing is renamed.
 *
 * Shallow registry: `formula` is documentation, not executed. The no-drift test
 * (test/ontology-nodrift.test.js) guards field/key drift, which is what bites.
 */

// ── Unit display rules (defined once) ───────────────────────────────────────
const UNITS = {
  percent:   (n) => `${Number(n.toFixed(1))}%`,
  ratio:     (n) => `${n.toFixed(2)}`,
  x:         (n) => `${n.toFixed(2)}×`,
  rupees_cr: (n) => `₹${Number(n.toFixed(0)).toLocaleString('en-IN')} Cr`,
  rupees:    (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
};

// ── ROCE sector benchmarks (ordered to render the prompt table verbatim) ─────
// Captured from marshallPrompt.js prose. Phase 7 moves this into a DB table.
const ROCE_SECTOR_BENCHMARKS = [
  { sector: 'IT / Software / SaaS',                  min: 30 },
  { sector: 'FMCG / Consumer Brands',                min: 25 },
  { sector: 'Pharma / Healthcare Services',          min: 20 },
  { sector: 'Retail / D2C / QSR',                    min: 18 },
  { sector: 'General Manufacturing / Capital Goods', min: 15 },
  { sector: 'Infrastructure / Real Estate / EPC',    min: null, note: 'Not applicable — use asset turnover + ROE instead' },
  { sector: 'Financial Services / NBFC / Banks',     min: null, note: 'Not applicable — use ROE ≥ 15% and NIM instead' },
];

// Helper to keep raw_* (passthrough) entries terse.
const raw = (key, label, family, unit, direction, fields, extra = {}) =>
  ({ key, label, family, unit, direction, fields, ...extra });

const METRICS = {
  // ── raw_pl (11) — parsePlSection → company_annual_pl / company_quarterly_pl ──
  sales:            raw('sales', 'Sales / Revenue', 'raw_pl', 'rupees_cr', 'higher_better', { annual: 'sales_cr', quarterly: 'sales_cr' }),
  expenses:         raw('expenses', 'Operating Expenses', 'raw_pl', 'rupees_cr', 'neutral', { annual: 'expenses_cr', quarterly: 'expenses_cr' }),
  operating_profit: raw('operating_profit', 'Operating Profit (EBITDA-style)', 'raw_pl', 'rupees_cr', 'higher_better', { annual: 'operating_profit_cr', quarterly: 'operating_profit_cr' },
                        { description: "screener.in 'Operating Profit' = Sales − Expenses, BEFORE D&A (EBITDA-style). derive.js: EBITDA = this; EBIT = this − depreciation." }),
  opm:              raw('opm', 'Operating Profit Margin', 'raw_pl', 'percent', 'higher_better', { annual: 'opm_pct', quarterly: 'opm_pct' }),
  other_income:     raw('other_income', 'Other Income', 'raw_pl', 'rupees_cr', 'neutral', { annual: 'other_income_cr', quarterly: 'other_income_cr' }),
  interest:         raw('interest', 'Interest Expense', 'raw_pl', 'rupees_cr', 'lower_better', { annual: 'interest_cr', quarterly: 'interest_cr' }),
  depreciation:     raw('depreciation', 'Depreciation & Amortisation', 'raw_pl', 'rupees_cr', 'neutral', { annual: 'depreciation_cr', quarterly: 'depreciation_cr' }),
  pbt:              raw('pbt', 'Profit Before Tax', 'raw_pl', 'rupees_cr', 'higher_better', { annual: 'pbt_cr', quarterly: 'pbt_cr' }),
  tax_rate:         raw('tax_rate', 'Effective Tax Rate', 'raw_pl', 'percent', 'neutral', { annual: 'tax_pct', quarterly: 'tax_pct' }),
  net_profit:       raw('net_profit', 'Net Profit (PAT)', 'raw_pl', 'rupees_cr', 'higher_better', { annual: 'net_profit_cr', quarterly: 'net_profit_cr' }),
  eps:              raw('eps', 'Earnings Per Share', 'raw_pl', 'rupees', 'higher_better', { annual: 'eps_rs', quarterly: 'eps_rs' }),

  // ── raw_bs (17) — parseBsSection → company_annual_bs ──
  equity_share_capital:      raw('equity_share_capital', 'Equity Share Capital', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'equity_share_capital_cr' }),
  reserves:                  raw('reserves', 'Reserves', 'raw_bs', 'rupees_cr', 'higher_better', { annual: 'reserves_cr' }),
  total_equity:              raw('total_equity', 'Total Equity', 'raw_bs', 'rupees_cr', 'higher_better', { annual: 'total_equity_cr' }),
  long_term_borrowings:      raw('long_term_borrowings', 'Long-term Borrowings', 'raw_bs', 'rupees_cr', 'lower_better', { annual: 'long_term_borrowings_cr' }),
  short_term_borrowings:     raw('short_term_borrowings', 'Short-term Borrowings', 'raw_bs', 'rupees_cr', 'lower_better', { annual: 'short_term_borrowings_cr' }),
  total_debt:                raw('total_debt', 'Total Debt', 'raw_bs', 'rupees_cr', 'lower_better', { annual: 'total_debt_cr' }),
  trade_payables:            raw('trade_payables', 'Trade Payables', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'trade_payables_cr' }),
  other_current_liabilities: raw('other_current_liabilities', 'Other Current Liabilities', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'other_current_liab_cr' }),
  fixed_assets:              raw('fixed_assets', 'Fixed Assets', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'fixed_assets_cr' }),
  cwip:                      raw('cwip', 'Capital Work in Progress', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'cwip_cr' }),
  investments:               raw('investments', 'Investments', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'investments_cr' }),
  inventories:               raw('inventories', 'Inventories', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'inventories_cr' }),
  trade_receivables:         raw('trade_receivables', 'Trade Receivables', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'trade_receivables_cr' }),
  cash:                      raw('cash', 'Cash & Equivalents', 'raw_bs', 'rupees_cr', 'higher_better', { annual: 'cash_cr' }),
  other_current_assets:      raw('other_current_assets', 'Other Current Assets', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'other_current_assets_cr' }),
  total_assets:              raw('total_assets', 'Total Assets', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'total_assets_cr' }),
  book_value_per_share:      raw('book_value_per_share', 'Book Value per Share', 'raw_bs', 'rupees', 'higher_better', { annual: 'book_value_per_share', ttm: 'book_value' }),

  // ── raw_cf (9) — parseCfSection → company_annual_cf ──
  ocf:             raw('ocf', 'Operating Cash Flow', 'raw_cf', 'rupees_cr', 'higher_better', { annual: 'ocf_cr' }),
  icf:             raw('icf', 'Investing Cash Flow', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'icf_cr' }),
  ffc:             raw('ffc', 'Financing Cash Flow', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'ffc_cr' }),
  net_change_cash: raw('net_change_cash', 'Net Change in Cash', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'net_change_cash_cr' }),
  capex:           raw('capex', 'Capital Expenditure', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'capex_cr' }),
  free_cash_flow:  raw('free_cash_flow', 'Free Cash Flow', 'raw_cf', 'rupees_cr', 'higher_better', { annual: 'free_cash_flow_cr' }),
  dividends_paid:  raw('dividends_paid', 'Dividends Paid', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'dividends_paid_cr' }),
  debt_raised:     raw('debt_raised', 'Debt Raised', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'debt_raised_cr' }),
  debt_repaid:     raw('debt_repaid', 'Debt Repaid', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'debt_repaid_cr' }),

  // ── derived (15) — derive.js ──
  ebitda_margin: { key: 'ebitda_margin', label: 'EBITDA Margin', short: 'EBITDA Margin', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Operating Profit / Sales', dependsOn: ['operating_profit', 'sales'],
    description: 'Operating profitability before D&A.',
    fields: { annual: 'ebitda_margin_pct', quarterly: 'ebitda_margin_pct', aggregate: 'ebitda_margin_5y_avg' } },
  pat_margin: { key: 'pat_margin', label: 'PAT Margin', short: 'PAT Margin', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Net Profit / Sales', dependsOn: ['net_profit', 'sales'],
    description: 'Net profitability after all costs and tax.',
    fields: { annual: 'pat_margin_pct', quarterly: 'pat_margin_pct', aggregate: 'pat_margin_5y_avg' } },
  roe: { key: 'roe', label: 'Return on Equity', short: 'ROE', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Net Profit / Total Equity', dependsOn: ['net_profit', 'total_equity'],
    description: 'Return generated on shareholder capital. Marshall gate for financial-sector businesses.',
    benchmark: { default: 15 },
    fields: { annual: 'roe_pct', aggregate: 'roe_5y_avg', ttm: 'roe_ttm' } },
  roce: { key: 'roce', label: 'Return on Capital Employed', short: 'ROCE', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'EBIT / (Total Equity + Total Debt)', dependsOn: ['operating_profit', 'depreciation', 'total_equity', 'total_debt'],
    description: "How efficiently the business converts all capital into operating profit. Marshall's primary quality gate.",
    benchmark: { default: 15, bySector: ROCE_SECTOR_BENCHMARKS },
    fields: { annual: 'roce_pct', aggregate: 'roce_5y_avg', ttm: 'roce_ttm' } },
  roa: { key: 'roa', label: 'Return on Assets', short: 'ROA', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Net Profit / Total Assets', dependsOn: ['net_profit', 'total_assets'],
    fields: { annual: 'roa_pct' } },
  debt_to_equity: { key: 'debt_to_equity', label: 'Debt to Equity', short: 'D/E', family: 'derived', unit: 'x', direction: 'lower_better',
    formula: 'Total Debt / Total Equity', dependsOn: ['total_debt', 'total_equity'],
    fields: { annual: 'debt_to_equity' } },
  interest_coverage: { key: 'interest_coverage', label: 'Interest Coverage', short: 'Int. Cov.', family: 'derived', unit: 'x', direction: 'higher_better',
    formula: 'EBIT / Interest', dependsOn: ['operating_profit', 'depreciation', 'interest'],
    fields: { annual: 'interest_coverage' } },
  current_ratio: { key: 'current_ratio', label: 'Current Ratio', short: 'Curr. Ratio', family: 'derived', unit: 'ratio', direction: 'higher_better',
    formula: 'Current Assets / Current Liabilities',
    dependsOn: ['inventories', 'trade_receivables', 'cash', 'other_current_assets', 'trade_payables', 'other_current_liabilities'],
    fields: { annual: 'current_ratio' } },
  ocf_to_pat: { key: 'ocf_to_pat', label: 'OCF to PAT', short: 'OCF/PAT', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Operating Cash Flow / Net Profit', dependsOn: ['ocf', 'net_profit'],
    description: 'Cash-backing of reported profit; low values flag earnings quality.',
    fields: { annual: 'ocf_to_pat_pct' } },
  fcf_margin: { key: 'fcf_margin', label: 'FCF Margin', short: 'FCF Margin', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Free Cash Flow / Sales', dependsOn: ['free_cash_flow', 'sales'],
    fields: { annual: 'fcf_margin_pct' } },
  revenue_yoy: { key: 'revenue_yoy', label: 'Revenue Growth YoY', short: 'Rev YoY', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(Sales − Prior Sales) / |Prior Sales|', dependsOn: ['sales'],
    fields: { annual: 'revenue_yoy_pct', quarterly: 'revenue_yoy_pct' } },
  ebitda_yoy: { key: 'ebitda_yoy', label: 'EBITDA Growth YoY', short: 'EBITDA YoY', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(OP − Prior OP) / |Prior OP|', dependsOn: ['operating_profit'],
    fields: { annual: 'ebitda_yoy_pct', quarterly: 'ebitda_yoy_pct' } },
  pat_yoy: { key: 'pat_yoy', label: 'PAT Growth YoY', short: 'PAT YoY', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(PAT − Prior PAT) / |Prior PAT|', dependsOn: ['net_profit'],
    fields: { annual: 'pat_yoy_pct', quarterly: 'pat_yoy_pct' } },
  revenue_qoq: { key: 'revenue_qoq', label: 'Revenue Growth QoQ', short: 'Rev QoQ', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(Sales − Prior Quarter Sales) / |Prior Quarter Sales|', dependsOn: ['sales'],
    fields: { quarterly: 'revenue_qoq_pct' } },
  pat_qoq: { key: 'pat_qoq', label: 'PAT Growth QoQ', short: 'PAT QoQ', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(PAT − Prior Quarter PAT) / |Prior Quarter PAT|', dependsOn: ['net_profit'],
    fields: { quarterly: 'pat_qoq_pct' } },

  // ── valuation (8) — parseTopRatios ──
  current_price:  raw('current_price', 'Current Price', 'valuation', 'rupees', 'neutral', { ttm: 'current_price' }),
  market_cap:     raw('market_cap', 'Market Capitalisation', 'valuation', 'rupees_cr', 'neutral', { ttm: 'market_cap_cr' }),
  pe:             raw('pe', 'Price to Earnings', 'valuation', 'x', 'lower_better', { ttm: 'pe' }),
  pb:             raw('pb', 'Price to Book', 'valuation', 'x', 'lower_better', { ttm: 'pb' }),
  dividend_yield: raw('dividend_yield', 'Dividend Yield', 'valuation', 'percent', 'higher_better', { ttm: 'dividend_yield' }),
  face_value:     raw('face_value', 'Face Value', 'valuation', 'rupees', 'neutral', { ttm: 'face_value' }),
  high_52w:       raw('high_52w', '52-Week High', 'valuation', 'rupees', 'neutral', { ttm: 'high_52w' }),
  low_52w:        raw('low_52w', '52-Week Low', 'valuation', 'rupees', 'neutral', { ttm: 'low_52w' }),

  // ── aggregate (5) — aggregate.js CAGRs ──
  revenue_cagr_5y:  { key: 'revenue_cagr_5y', label: 'Revenue CAGR 5y', short: 'Rev CAGR 5y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 5y', dependsOn: ['sales'], fields: { aggregate: 'revenue_cagr_5y_pct' } },
  pat_cagr_5y:      { key: 'pat_cagr_5y', label: 'PAT CAGR 5y', short: 'PAT CAGR 5y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 5y', dependsOn: ['net_profit'], fields: { aggregate: 'pat_cagr_5y_pct' } },
  ebitda_cagr_5y:   { key: 'ebitda_cagr_5y', label: 'EBITDA CAGR 5y', short: 'EBITDA CAGR 5y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 5y', dependsOn: ['operating_profit'], fields: { aggregate: 'ebitda_cagr_5y_pct' } },
  revenue_cagr_10y: { key: 'revenue_cagr_10y', label: 'Revenue CAGR 10y', short: 'Rev CAGR 10y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 10y', dependsOn: ['sales'], fields: { aggregate: 'revenue_cagr_10y_pct' } },
  pat_cagr_10y:     { key: 'pat_cagr_10y', label: 'PAT CAGR 10y', short: 'PAT CAGR 10y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 10y', dependsOn: ['net_profit'], fields: { aggregate: 'pat_cagr_10y_pct' } },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const METRIC_KEYS = Object.keys(METRICS);

function get(key) {
  return METRICS[key] || null;
}

function format(key, value) {
  if (value == null || !isFinite(value)) return 'n/a';
  const m = METRICS[key];
  if (!m) return String(value);
  return UNITS[m.unit](Number(value));
}

function byFamily(family) {
  return Object.values(METRICS).filter(m => m.family === family);
}

// benchmark(key)            → default numeric benchmark, or null if none
// benchmark(key, sector)    → sector min if listed; null if sector listed as na;
//                             default if sector not listed
function benchmark(key, sector) {
  const b = METRICS[key]?.benchmark;
  if (!b) return null;
  if (sector == null) return b.default ?? null;
  const row = (b.bySector || []).find(r => r.sector === sector);
  if (!row) return b.default ?? null;
  return row.min;   // number, or null for na rows
}

// Reverse index: actual field name → concept key. Used by the no-drift test.
const FIELD_TO_METRIC = {};
for (const m of Object.values(METRICS)) {
  for (const fieldName of Object.values(m.fields)) {
    FIELD_TO_METRIC[fieldName] = m.key;
  }
}
function fieldToMetric(fieldName) {
  return FIELD_TO_METRIC[fieldName] || null;
}

// Render the ROCE sector benchmark markdown table (matches marshallPrompt.js).
function buildBenchmarkTable() {
  const lines = ['| Sector | Minimum ROCE for PASS |', '|---|---|'];
  for (const r of ROCE_SECTOR_BENCHMARKS) {
    const right = r.min != null ? `≥ ${r.min}%` : r.note;
    lines.push(`| ${r.sector} | ${right} |`);
  }
  return lines.join('\n');
}

module.exports = { METRICS, METRIC_KEYS, UNITS, get, format, byFamily, benchmark, fieldToMetric, buildBenchmarkTable };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ontology.test.js`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add ontology.js test/ontology.test.js
git commit -m "Add financial ontology registry (Phase 6 Task 1)"
```

---

## Task 2: No-drift guard test

**Files:**
- Create: `test/ontology-nodrift.test.js`

This test fails loudly if anyone adds a field to `derive.js`/`aggregate.js` without registering it in the ontology — the mechanism that keeps the single source of truth true over time.

- [ ] **Step 1: Write the failing test**

Create `test/ontology-nodrift.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const ont = require('../ontology');
const { deriveAnnual, deriveQuarterly } = require('../derive');
const { aggregate } = require('../aggregate');

// Non-metric bookkeeping keys that aggregate.js emits — intentionally not in the ontology.
const AGGREGATE_ALLOWLIST = new Set([
  'ticker', 'latest_annual_fy_end', 'latest_quarterly_q_end',
  'annual_periods_count', 'quarterly_periods_count',
]);

function assertAllMapped(obj, allowlist = new Set()) {
  for (const fieldName of Object.keys(obj)) {
    if (allowlist.has(fieldName)) continue;
    assert.ok(
      ont.fieldToMetric(fieldName),
      `Field "${fieldName}" has no ontology entry — register it in ontology.js`
    );
  }
}

test('every deriveAnnual output field is in the ontology', () => {
  const pl  = { sales_cr: 1000, expenses_cr: 700, operating_profit_cr: 300, depreciation_cr: 50, interest_cr: 20, net_profit_cr: 180 };
  const bs  = { total_equity_cr: 900, total_debt_cr: 200, total_assets_cr: 1500, inventories_cr: 100, trade_receivables_cr: 80, cash_cr: 60, other_current_assets_cr: 10, trade_payables_cr: 70, other_current_liab_cr: 30 };
  const cf  = { ocf_cr: 200, free_cash_flow_cr: 150 };
  const out = deriveAnnual({ pl, bs, cf, priorPl: { sales_cr: 900, operating_profit_cr: 270, net_profit_cr: 150 } });
  assertAllMapped(out);
});

test('every deriveQuarterly output field is in the ontology', () => {
  const out = deriveQuarterly({
    current: { sales_cr: 300, operating_profit_cr: 90, net_profit_cr: 50 },
    samePriorYear: { sales_cr: 250, operating_profit_cr: 70, net_profit_cr: 40 },
    priorQuarter: { sales_cr: 280, net_profit_cr: 48 },
  });
  assertAllMapped(out);
});

test('every aggregate output field is in the ontology (minus bookkeeping)', () => {
  const annualPl = [
    { fy_end: '2024-03-31', sales_cr: 1000, operating_profit_cr: 300, net_profit_cr: 180 },
    { fy_end: '2020-03-31', sales_cr: 600,  operating_profit_cr: 180, net_profit_cr: 100 },
  ];
  const annualDerived = [
    { fy_end: '2024-03-31', roce_pct: 25, roe_pct: 20, ebitda_margin_pct: 30, pat_margin_pct: 18 },
    { fy_end: '2020-03-31', roce_pct: 22, roe_pct: 18, ebitda_margin_pct: 28, pat_margin_pct: 16 },
  ];
  const out = aggregate('TCS', annualPl, annualDerived, []);
  assertAllMapped(out, AGGREGATE_ALLOWLIST);
});
```

- [ ] **Step 2: Run test to verify it passes immediately**

Run: `node --test test/ontology-nodrift.test.js`
Expected: PASS — the ontology from Task 1 already covers every field. (If it fails, a field is missing from `ontology.js`; add the matching entry and re-run.)

> Note: this is a guard test, so it should pass once the ontology is correct. To *prove* it bites, you may temporarily rename a `fields` value in `ontology.js`, see the test fail, then revert — optional.

- [ ] **Step 3: Commit**

```bash
git add test/ontology-nodrift.test.js
git commit -m "Add no-drift guard test cross-checking derive/aggregate fields (Phase 6 Task 2)"
```

---

## Task 3: Wire `ranking.js` to the ontology benchmark

**Files:**
- Modify: `ranking.js` (the `marshall_undervalued` and `quality_compounders` strategies)

Replace the two hardcoded `roce < 15` gates. `benchmark('roce')` returns `15`, so ranking rows, order, scores, and reason text stay identical.

- [ ] **Step 1: Write the failing test**

Add to `test/ranking.test.js` (append at end, before any trailing module code):

```js
const ontology = require('../ontology');

test('marshall_undervalued ROCE gate uses the ontology benchmark', () => {
  const min = ontology.benchmark('roce'); // 15
  const justUnder = { roce_5y_avg: min - 0.1, debt_to_equity: 0.2, pat_cagr_5y_pct: 10, pe: 20, revenue_cagr_5y_pct: 12 };
  const justOver  = { roce_5y_avg: min + 0.1, debt_to_equity: 0.2, pat_cagr_5y_pct: 10, pe: 20, revenue_cagr_5y_pct: 12 };
  assert.equal(scoreRow('marshall_undervalued', justUnder).passes, false);
  assert.equal(scoreRow('marshall_undervalued', justOver).passes, true);
});
```

(Confirm `scoreRow` and `test`/`assert` are already imported at the top of `test/ranking.test.js`; they are used by existing tests there.)

- [ ] **Step 2: Run test to verify current behavior**

Run: `node --test test/ranking.test.js`
Expected: PASS already (the literal 15 equals the benchmark) — this test locks the behavior so the refactor stays equivalent.

- [ ] **Step 3: Make the change**

In `ranking.js`, add the import near the top (after the file's opening comment, before `const num`):

```js
const ontology = require('./ontology');
```

In the `marshall_undervalued` strategy, change:

```js
      if (roce == null || roce < 15) return fail('ROCE 5y < 15%');
```
to:
```js
      const roceMin = ontology.benchmark('roce');
      if (roce == null || roce < roceMin) return fail(`ROCE 5y < ${roceMin}%`);
```

In the `quality_compounders` strategy, change:

```js
      if (roce == null || roce < 15) return fail('ROCE 5y < 15%');
```
to:
```js
      const roceMin = ontology.benchmark('roce');
      if (roce == null || roce < roceMin) return fail(`ROCE 5y < ${roceMin}%`);
```

Leave every other threshold (`de > 0.5`, `pe > 35`, deep-value `pe`/`pb`, `high_growth` revenue CAGR) untouched.

- [ ] **Step 4: Run the full test suite to verify nothing changed**

Run: `node --test test/*.test.js`
Expected: PASS — all 115 existing tests plus the new ones. Ranking behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add ranking.js test/ranking.test.js
git commit -m "Wire ranking.js ROCE gate to ontology benchmark (Phase 6 Task 3)"
```

---

## Task 4: Wire `agent.js` `buildStructuredDataContext` to the ontology

**Files:**
- Modify: `agent.js` (the `buildStructuredDataContext` function, ~lines 426-473)

Build the KEY AGGREGATES and LATEST FY DERIVED METRICS lines from ontology labels + `format()` so the AI sees canonical vocabulary.

- [ ] **Step 1: Add the import**

At the top of `agent.js`, alongside the other `require`s (e.g. after `const { getCompanyBundle } = require('./db');`):

```js
const ontology = require('./ontology');
```

- [ ] **Step 2: Replace the two formatted blocks**

In `buildStructuredDataContext`, replace this block:

```js
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
```

with:

```js
    'KEY AGGREGATES:',
    `  ${ontology.get('roce').label} (5y avg): ${ontology.format('roce', a.roce_5y_avg)}`,
    `  ${ontology.get('roe').label} (5y avg): ${ontology.format('roe', a.roe_5y_avg)}`,
    `  ${ontology.get('revenue_cagr_5y').label}: ${ontology.format('revenue_cagr_5y', a.revenue_cagr_5y_pct)}`,
    `  ${ontology.get('pat_cagr_5y').label}: ${ontology.format('pat_cagr_5y', a.pat_cagr_5y_pct)}`,
    `  ${ontology.get('ebitda_margin').label} (5y avg): ${ontology.format('ebitda_margin', a.ebitda_margin_5y_avg)}`,
    `  ${ontology.get('pat_margin').label} (5y avg): ${ontology.format('pat_margin', a.pat_margin_5y_avg)}`,
    '',
    'LATEST FY DERIVED METRICS:',
    `  ${ontology.get('roce').label}: ${ontology.format('roce', lastDerived?.roce_pct)}`,
    `  ${ontology.get('roe').label}: ${ontology.format('roe', lastDerived?.roe_pct)}`,
    `  ${ontology.get('debt_to_equity').label}: ${ontology.format('debt_to_equity', lastDerived?.debt_to_equity)}`,
    `  ${ontology.get('interest_coverage').label}: ${ontology.format('interest_coverage', lastDerived?.interest_coverage)}`,
    `  ${ontology.get('ocf_to_pat').label}: ${ontology.format('ocf_to_pat', lastDerived?.ocf_to_pat_pct)}`,
    `  ${ontology.get('fcf_margin').label}: ${ontology.format('fcf_margin', lastDerived?.fcf_margin_pct)}`,
```

- [ ] **Step 3: Smoke-test that the module loads and produces a block**

Run:
```bash
node -e "const a=require('./agent'); console.log('agent.js loaded OK');"
```
Expected: prints `agent.js loaded OK` with no throw (confirms the ontology import and references resolve).

- [ ] **Step 4: Run the full test suite**

Run: `node --test test/*.test.js`
Expected: PASS — no test depends on the exact text of this block, and the module still loads.

- [ ] **Step 5: Commit**

```bash
git add agent.js
git commit -m "Build AI structured-data block from ontology labels/format (Phase 6 Task 4)"
```

---

## Task 5: Generate the `marshallPrompt.js` benchmark table from the ontology

**Files:**
- Modify: `marshallPrompt.js` (lines 38-46 — the literal table)

- [ ] **Step 1: Add the import**

At the very top of `marshallPrompt.js` (before the opening comment block or right after it, but before `const MARSHALL_SYSTEM_PROMPT`):

```js
const { buildBenchmarkTable } = require('./ontology');
```

- [ ] **Step 2: Replace the literal table with interpolation**

`MARSHALL_SYSTEM_PROMPT` is a template literal, so it evaluates `buildBenchmarkTable()` once at module load and the export stays a plain string. Replace these exact lines (the markdown table, lines 38-46):

```
| Sector | Minimum ROCE for PASS |
|---|---|
| IT / Software / SaaS | ≥ 30% |
| FMCG / Consumer Brands | ≥ 25% |
| Pharma / Healthcare Services | ≥ 20% |
| Retail / D2C / QSR | ≥ 18% |
| General Manufacturing / Capital Goods | ≥ 15% |
| Infrastructure / Real Estate / EPC | Not applicable — use asset turnover + ROE instead |
| Financial Services / NBFC / Banks | Not applicable — use ROE ≥ 15% and NIM instead |
```

with a single line:

```
${buildBenchmarkTable()}
```

Leave the blank line above (after "use the table below):") and the blank line + "- If sector is ambiguous, default to ≥ 15%..." line below exactly as they are.

- [ ] **Step 3: Verify the generated prompt matches the old table exactly**

Run:
```bash
node -e "const {buildBenchmarkTable}=require('./ontology'); const {MARSHALL_SYSTEM_PROMPT}=require('./marshallPrompt'); console.log(MARSHALL_SYSTEM_PROMPT.includes(buildBenchmarkTable()) && MARSHALL_SYSTEM_PROMPT.includes('| IT / Software / SaaS | ≥ 30% |') && MARSHALL_SYSTEM_PROMPT.includes('| Financial Services / NBFC / Banks | Not applicable — use ROE ≥ 15% and NIM instead |') ? 'TABLE OK' : 'TABLE MISMATCH');"
```
Expected: prints `TABLE OK`.

- [ ] **Step 4: Run the full test suite**

Run: `node --test test/*.test.js`
Expected: PASS — all tests green; `marshallPrompt.js` still exports a string.

- [ ] **Step 5: Commit**

```bash
git add marshallPrompt.js
git commit -m "Generate Marshall prompt ROCE benchmark table from ontology (Phase 6 Task 5)"
```

---

## Task 6: Push & post-deploy validation

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```
Render auto-deploys in ~3-5 min.

- [ ] **Step 2: Confirm full suite green locally**

Run: `node --test test/*.test.js`
Expected: 115 prior tests + new ontology tests all PASS.

- [ ] **Step 3: Post-deploy regression checks (manual, per spec §9)**

- Open the **Rankings** page in production; pick one strategy (e.g. Marshall Undervalued) and confirm the top-N list and scores are **identical** to before the deploy (benchmark = 15 = old literal).
- Confirm a real analysis still renders (Gate 2A metrics populated) — verifies `buildStructuredDataContext` still feeds the AI a valid block.
- (Optional) Confirm the system prompt's sector table is unchanged by spot-checking an analysis that cites a sector ROCE benchmark.

---

## Self-Review Notes

- **Spec coverage:** §3 schema → Task 1; §4 catalog (65 entries) → Task 1; §5A ranking → Task 3; §5B agent → Task 4; §5C no-drift → Task 2; §5D + §6 table generation → Task 5; §7 tests → Tasks 1-2; §8 rollout → Tasks 1-6; §9 acceptance → Task 6 Step 3.
- **No placeholders:** every code step shows complete code.
- **Type consistency:** helper names (`get`, `format`, `byFamily`, `benchmark`, `fieldToMetric`, `buildBenchmarkTable`, `METRIC_KEYS`) are defined in Task 1 and used identically in Tasks 2-5. `benchmark('roce')` → 15 throughout. `fields` values feed `fieldToMetric` used by Task 2.
