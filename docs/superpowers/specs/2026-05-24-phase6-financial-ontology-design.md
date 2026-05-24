# Phase 6 — Financial Ontology Layer

**Date:** 2026-05-24
**Status:** Approved (awaiting written-spec review)
**Type:** Phase design (implements Phase 6 of the master plan)
**Master plan:** `2026-05-17-master-architecture-plan.md` §10 — "Ontology: Formal types/relationships; clean up Group 2 line-item names into a canonical vocabulary. Type-safe agent reasoning."

## 1. Problem & North Star check

Today the definition of each financial metric is scattered across three places that can silently drift apart:

- `derive.js` computes ROCE, ROE, margins, etc. with field names like `roce_pct`.
- `aggregate.js` produces `roce_5y_avg`, CAGRs, etc.
- `ranking.js` hardcodes quality benchmarks (`if (roce < 15)`).
- `marshallPrompt.js` describes the same metrics — and their sector benchmarks — as **prose** to the AI (IT ≥ 30%, FMCG ≥ 25%, …).

There is no single place that says "this is ROCE: its label, unit, formula, direction, and benchmark." A label, unit, or threshold can change in one file and not the others. **Phase 6 establishes a single source of truth** — a canonical metric vocabulary that `ranking.js`, the AI data block, and the prompt all read from, so they cannot drift.

North Star fit: this makes agent reasoning *consistent and accountable* — every number the system shows or reasons about traces to one definition. It is also the foundation Phase 7 (sector microtheories) reads benchmarks from.

## 2. Locked decisions (from brainstorm 2026-05-24)

| # | Decision | Value |
| --- | --- | --- |
| Primary pain point | **B — metric consistency / single source of truth** (not scraper resilience, not full sector-benchmark system) |
| Scope of metrics | **Full (option 3)** — derived ratios + raw line items + valuation + aggregates (≈65 concepts) |
| Registry depth | **Shallow** — registry of metadata; modules keep their own formula code. No rewrite of tested compute logic. |
| Form | **Approach A — a pure JS module** (`ontology.js`), matching the existing pure-module + `node --test` pattern. No DB table, no JSON config. |
| Prompt table | **Generate now** — the sector ROCE benchmark table in the system prompt is generated from ontology data (captures the *existing* prose benchmarks; full DB-backed sector model is still Phase 7). |

## 3. The metric entry schema

`ontology.js` exports a `METRICS` object, **one entry per metric concept** (not per field). A concept is defined once even when it materializes as multiple fields (e.g. ROCE → `roce_pct`, `roce_5y_avg`, `roce_ttm`).

```js
roce: {
  key:        'roce',
  label:      'Return on Capital Employed',
  short:      'ROCE',
  family:     'derived',        // derived | raw_pl | raw_bs | raw_cf | valuation | aggregate
  unit:       'percent',        // percent | ratio | x | rupees_cr | rupees
  direction:  'higher_better',  // higher_better | lower_better | neutral
  formula:    'EBIT / (Total Equity + Total Debt)',   // human-readable, documentation only (shallow)
  dependsOn:  ['operating_profit', 'depreciation', 'total_equity', 'total_debt'],
  description:'How efficiently the business converts all capital into operating profit. Marshall\'s primary quality gate.',
  benchmark:  { default: 15, bySector: { /* see §6 */ } },  // optional; only on canonical-gate metrics
  fields:     { annual: 'roce_pct', aggregate: 'roce_5y_avg', ttm: 'roce_ttm' },
}
```

Field rules:

- **`fields`** maps the concept to the actual column / JS field names already in the codebase. Nothing is renamed; the ontology only *records* where each concept lives. This is the bridge that keeps the 115 passing tests untouched.
- **`benchmark`** is optional. Only metrics that act as canonical quality gates carry it. In Phase 6 that is `roce` (with sector overrides) and `roe` (default only). All strategy-specific cutoffs (e.g. deep-value P/E ≤ 15) stay in `ranking.js` — they are strategy identity, not metric truth.
- **`formula`** is a documentation string, not executed (shallow). Known limitation: it could theoretically drift from `derive.js`'s real math. Accepted trade-off; the no-drift test (§7) guards *field/key* drift, which is the drift actually encountered. Deep mode (formula-ownership) is a possible later upgrade.

### Formatting is unit-driven

A `UNITS` table defines display rules once, and `format(key, value)` looks up the metric's unit:

| unit | example output | rule |
| --- | --- | --- |
| `percent` | `15%` | 1 decimal, `%` suffix |
| `ratio` | `0.45` | 2 decimals |
| `x` | `1.50×` | 2 decimals, `×` suffix |
| `rupees_cr` | `₹1,234 Cr` | 0 decimals, `₹` prefix, ` Cr` suffix, en-IN grouping |
| `rupees` | `₹2,450.00` | 2 decimals, `₹` prefix, en-IN grouping |
| (null value) | `n/a` | — |

### Exported helpers

`get(key)`, `format(key, value)`, `byFamily(family)`, `benchmark(key[, sector])`, `buildBenchmarkTable()`, `METRIC_KEYS`.

## 4. The catalog (≈65 concept entries)

Organizing rule — **"averages fold, transforms don't":**
- An *average* of a metric is the same concept materialized in the aggregate table → lives in `fields.aggregate` (not a separate entry).
- A *transform* (growth rate, CAGR) answers a different question → its own entry.

### Family `raw_pl` (11) — `parsePlSection` → `company_annual_pl` / `company_quarterly_pl`

| key | label | unit | direction | field(s) |
| --- | --- | --- | --- | --- |
| sales | Sales / Revenue | rupees_cr | higher_better | sales_cr |
| expenses | Operating Expenses | rupees_cr | neutral | expenses_cr |
| operating_profit | Operating Profit (EBITDA-style) | rupees_cr | higher_better | operating_profit_cr |
| opm | Operating Profit Margin | percent | higher_better | opm_pct |
| other_income | Other Income | rupees_cr | neutral | other_income_cr |
| interest | Interest Expense | rupees_cr | lower_better | interest_cr |
| depreciation | Depreciation & Amortisation | rupees_cr | neutral | depreciation_cr |
| pbt | Profit Before Tax | rupees_cr | higher_better | pbt_cr |
| tax_rate | Effective Tax Rate | percent | neutral | tax_pct |
| net_profit | Net Profit (PAT) | rupees_cr | higher_better | net_profit_cr |
| eps | Earnings Per Share | rupees | higher_better | eps_rs |

> Note pinned by the ontology: screener.in's "Operating Profit" is **EBITDA-style** (Sales − Expenses, before D&A), matching `derive.js`'s convention (`EBITDA = operating_profit_cr`, `EBIT = operating_profit_cr − depreciation_cr`). Recording this resolves the exact ambiguity the `derive.js` comment flags.

`raw_pl` fields appear in both annual and quarterly tables under the same column name: `fields: { annual: 'X_cr', quarterly: 'X_cr' }`.

### Family `raw_bs` (17) — `parseBsSection` → `company_annual_bs`

equity_share_capital, reserves, total_equity, long_term_borrowings, short_term_borrowings, total_debt, trade_payables, other_current_liabilities, fixed_assets, cwip, investments, inventories, trade_receivables, cash, other_current_assets, total_assets, book_value_per_share.

All `rupees_cr` except `book_value_per_share` (`rupees`). Directions: `total_equity`/`reserves`/`cash`/`book_value_per_share` → higher_better; `total_debt`/`long_term_borrowings`/`short_term_borrowings` → lower_better; rest → neutral. `book_value_per_share.fields = { annual: 'book_value_per_share', ttm: 'book_value' }` (ttm from `parseTopRatios`).

### Family `raw_cf` (9) — `parseCfSection` → `company_annual_cf`

ocf, icf, ffc, net_change_cash, capex, free_cash_flow, dividends_paid, debt_raised, debt_repaid. All `rupees_cr`. `ocf` and `free_cash_flow` → higher_better; rest → neutral.

### Family `derived` (15) — `derive.js`

| key | unit | direction | benchmark | aggregate field |
| --- | --- | --- | --- | --- |
| ebitda_margin | percent | higher_better | — | ebitda_margin_5y_avg |
| pat_margin | percent | higher_better | — | pat_margin_5y_avg |
| roe | percent | higher_better | default 15 | roe_5y_avg |
| roce | percent | higher_better | default 15 + bySector | roce_5y_avg |
| roa | percent | higher_better | — | — |
| debt_to_equity | x | lower_better | — | — |
| interest_coverage | x | higher_better | — | — |
| current_ratio | ratio | higher_better | — | — |
| ocf_to_pat | percent | higher_better | — | — |
| fcf_margin | percent | higher_better | — | — |
| revenue_yoy | percent | higher_better | — | — |
| ebitda_yoy | percent | higher_better | — | — |
| pat_yoy | percent | higher_better | — | — |
| revenue_qoq | percent | higher_better | — | — (quarterly only) |
| pat_qoq | percent | higher_better | — | — (quarterly only) |

### Family `valuation` (8) — `parseTopRatios`

current_price (rupees), market_cap (rupees_cr), pe (x, lower_better), pb (x, lower_better), dividend_yield (percent, higher_better), face_value (rupees), high_52w (rupees), low_52w (rupees). Price/market-cap/face-value/52w → neutral.

### Family `aggregate` (5) — `aggregate.js` CAGRs

revenue_cagr_5y, pat_cagr_5y, ebitda_cagr_5y, revenue_cagr_10y, pat_cagr_10y. All `percent`, higher_better.

### Folded (not separate entries)

`roce_5y_avg`→roce, `roe_5y_avg`→roe, `ebitda_margin_5y_avg`→ebitda_margin, `pat_margin_5y_avg`→pat_margin (via `fields.aggregate`); `roce_ttm`→roce, `roe_ttm`→roe (via `fields.ttm`); `book_value`→book_value_per_share (via `fields.ttm`).

### Excluded (bookkeeping, not metrics)

`latest_annual_fy_end`, `latest_quarterly_q_end`, `annual_periods_count`, `quarterly_periods_count`.

## 5. Consumer integration

Shallow rule: consumers *import* canonical values; no formulas rewritten; nothing renamed.

**A) `ranking.js` (biggest win).** Replace the hardcoded ROCE quality benchmark with an ontology lookup, at **both** places the ROCE gate appears (`marshall_undervalued` and `quality_compounders`):
```js
const roceMin = ontology.benchmark('roce');   // 15 today; Phase 7 overrides per sector
if (roce == null || roce < roceMin) return fail(`ROCE 5y < ${roceMin}%`);
```
**Strategy-specific cutoffs (e.g. `deep_value` P/E ≤ 15, `marshall_undervalued` D/E ≤ 0.5, `high_growth` revenue CAGR > 10) stay in the strategy.** Reason strings are left exactly as-is (no `format()` reformatting here) so that — because `benchmark('roce')` returns 15, the old literal — ranking rows, order, scores, **and reason text are all unchanged** by this phase. (`format()` is used in consumer B, where there is no identical-output requirement.)

**B) `agent.js` → `buildStructuredDataContext` (high value).** Build each line of the AI data block from `ontology.get(key).label` + `ontology.format(key, value)` instead of hand-written strings. The AI then sees canonical labels and consistent units.

**C) `derive.js` / `aggregate.js` (validation, not refactor).** No runtime change. Enforcement is a test (§7) that cross-checks every field these modules emit against the ontology.

**D) `marshallPrompt.js` (generate the benchmark table).** Assemble `MARSHALL_SYSTEM_PROMPT = HEAD + buildBenchmarkTable() + TAIL` at module load. The export **stays a string**, so `agent.js`'s import is unchanged. The generated table must reproduce the current prose table exactly.

## 6. Sector benchmark capture (the slice of Phase 7 pulled in by "generate now")

To generate the prompt table faithfully, the existing sector ROCE benchmarks move from prose into ontology data, hung on the `roce` entry:

```js
benchmark: {
  default: 15,
  bySector: {
    'IT/Software/SaaS':               30,
    'FMCG/Consumer Brands':           25,
    'Pharma/Healthcare':              20,
    'Retail/D2C/QSR':                 18,
    'Manufacturing/Capital Goods':    15,
    'Infrastructure/Real Estate/EPC': { na: true, use: 'asset turnover + ROE' },
    'Financial Services/NBFC/Banks':  { na: true, use: 'ROE ≥ 15% and NIM' },
  },
}
```

`benchmark('roce', sector)` returns the sector value when present, else `default`; `{na, use}` entries are surfaced for the table renderer. These labels are the prompt's broad buckets, **not** the exact `companies.sector` taxonomy.

**Phase 7 handoff:** move `bySector` into a `sector_microtheories` DB table, make it admin-editable, reconcile labels with the real sector taxonomy, and wire `ranking.js` to call `benchmark('roce', row.sector)`. Phase 6 deliberately leaves `ranking.js` on the default so its output is unchanged.

## 7. Testing (`test/ontology.test.js`, run under `node --test`)

1. **Schema integrity** — every entry has `key`, `label`, `family`, `unit`, `direction`; `key` equals its object key; `unit` is a known unit; `family` is a known family.
2. **`format(key, value)`** — `percent → "15%"`, `rupees_cr → "₹1,234 Cr"`, `x → "1.50×"`, `ratio → "0.45"`, `rupees → "₹2,450.00"`, null → `"n/a"`.
3. **No-drift guard (key test)** — assert every field emitted by `derive.js` (`deriveAnnual`, `deriveQuarterly`) and `aggregate.js` (`aggregate`) resolves to an ontology entry via `fields` or a CAGR concept. An unregistered field fails this test.
4. **`benchmark(key[, sector])`** — default with no sector; sector value when present; falls back to default for unknown sector; surfaces `{na, use}` correctly.
5. **`buildBenchmarkTable()`** — output contains the expected rows (IT 30%, FMCG 25%, Pharma 20%, Retail 18%, Manufacturing 15%, both N/A rows).
6. **Referential sanity** — every `dependsOn` key points to a real metric entry.

Each consumer edit also gets a focused assertion that it reads from the ontology rather than a literal.

## 8. Rollout & file-by-file changes

Fully additive. **No migration, no Supabase change, no frontend change.**

**New files (2):** `ontology.js`, `test/ontology.test.js`.

**Edited files (3):** `ranking.js` (benchmark lookup + format), `agent.js` (`buildStructuredDataContext`), `marshallPrompt.js` (generated table; export stays a string).

**TDD execution order — commit per task, push at end:**
1. `ontology.js` core + entries + helpers; schema/format/benchmark/table/dependsOn tests → commit
2. No-drift guard test cross-checking `derive.js` + `aggregate.js`; fill any gaps → commit
3. Wire `ranking.js` → test → commit
4. Wire `agent.js` structured context → test → commit
5. Generate `marshallPrompt.js` table → test → commit
6. Push → Render redeploys

## 9. Acceptance criteria

1. All ≈65 concepts present; `node --test` green including the new file; **115 existing tests still pass.**
2. **No-drift guard passes** — every `derive.js`/`aggregate.js` output field maps to an ontology entry.
3. **Ranking output is byte-identical** before vs. after (default ROCE benchmark = 15 = old literal). Verified with a live ranking run post-deploy.
4. **Generated prompt benchmark table matches the current prose table exactly** — same sectors, same numbers, same N/A notes.
5. A real analysis still produces a valid structured-data block (`buildStructuredDataContext`) using canonical labels/units.
6. Phase 7 can read sector benchmarks from `benchmark('roce', sector)` without further ontology changes.

## 10. Out of scope (explicit)

- DB-backed / admin-editable sector benchmarks (Phase 7).
- Wiring `ranking.js` to per-sector benchmarks (Phase 7).
- Formula-ownership / deep registry (possible later upgrade).
- Scraper resilience / formal label→column contract (pain point A, deferred).
- Any rename of existing DB columns or JS field names.
