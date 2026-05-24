# Phase 8 — Ranking Module — Design

**Date:** 2026-05-17
**Status:** Approved (awaiting written-spec review)
**Project:** ValueSight — Phase 8 (jumped ahead; data foundation from Phase 5 in place)
**Master plan:** `2026-05-17-master-architecture-plan.md` §4 Group 7, §5 M2 ranking, §10 Phase 8

## Problem

We now have structured fundamentals for the Nifty 500 universe (Phase 5).
But there's no way to ask the decision-engine question: **"across all 500
stocks, which are the best undervalued quality opportunities right now?"**

Two gaps:
1. No **current valuation** (P/E, P/B, price) stored in a queryable table —
   only historical financials + aggregates exist. Ranking by "cheapness" needs it.
2. No **ranking engine** that scores and orders the universe by strategy.

## Goal

1. Capture current ratios (price, market cap, P/E, book value, dividend yield,
   ROCE/ROE TTM) from screener.in's top-of-page box → `company_ratios` table,
   refreshed during ingestion.
2. A pure-JS ranking engine scoring the universe by 4 built-in strategies.
3. A Rankings page: pick a strategy → see the ranked shortlist → click into analysis.

## Decisions (locked)

| ID | Decision |
| --- | --- |
| Q1 | Yes — scrape current ratios from screener top box into `company_ratios` |
| Q2 | All 4 strategies in v1 (Marshall Undervalued, Quality Compounders, Deep Value, High Growth) |
| Q3 | Global benchmarks now; sector-aware via Phase 7 microtheories later |

## Non-Goals (deferred)

- `ranking_cache` table — compute on-demand (fast over 500 rows); add caching only if slow
- Sector-relative benchmarks → Phase 7
- Custom user-defined screener → Phase 8.1
- Momentum/technical ranking → Phase 10

## Data Model

### New table: `company_ratios` (current snapshot, 1 row per ticker)

```sql
CREATE TABLE IF NOT EXISTS company_ratios (
  ticker          TEXT PRIMARY KEY,
  current_price   NUMERIC,
  market_cap_cr   NUMERIC,
  pe              NUMERIC,
  pb              NUMERIC,
  book_value      NUMERIC,
  dividend_yield  NUMERIC,
  roce_ttm        NUMERIC,
  roe_ttm         NUMERIC,
  face_value      NUMERIC,
  high_52w        NUMERIC,
  low_52w         NUMERIC,
  source          TEXT DEFAULT 'screener.in',
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);
```

`pb` is derived: `current_price / book_value` when screener doesn't show it directly.

## Scraper Extension

screener.in renders a top ratios list (`ul#top-ratios`, each `<li>` has a
`.name` and `.value` span). `parseTopRatios($)` maps:

| screener label | column |
| --- | --- |
| Market Cap | market_cap_cr |
| Current Price | current_price |
| High / Low | high_52w / low_52w |
| Stock P/E | pe |
| Book Value | book_value |
| Dividend Yield | dividend_yield |
| ROCE | roce_ttm |
| ROE | roe_ttm |
| Face Value | face_value |

`parseScreenerHtml` return shape extends with `ratios: { ... }` (single object,
or null if the box is absent). `pb` computed post-parse.

Orchestrator upserts `company_ratios` during every ingestion (alongside the
existing source tables).

## Ranking Engine (`ranking.js`, pure)

```
STRATEGIES = { marshall_undervalued, quality_compounders, deep_value, high_growth }

scoreRow(strategyKey, row) → { passes: bool, score: number, reasons: string[] }
rankUniverse(strategyKey, rows, limit=20) → [{ rank, ...row, score, reasons }]
```

`row` is a merged record per ticker: aggregates + ratios + latest derived.

### Strategy definitions (global benchmarks)

**marshall_undervalued** — quality AND cheap
- Passes: `roce_5y_avg ≥ 15` AND `debt_to_equity ≤ 0.5` AND `pat_cagr_5y > 0` AND `0 < pe ≤ 35`
- Score: `(roce_5y_avg + revenue_cagr_5y) / pe` (high quality + growth per unit of P/E)

**quality_compounders** — quality regardless of price
- Passes: `roce_5y_avg ≥ 15`
- Score: `roce_5y_avg*0.5 + revenue_cagr_5y*0.3 + pat_cagr_5y*0.3 − debt_to_equity*5`

**deep_value** — cheap with positive returns
- Passes: `0 < pe ≤ 15` AND `0 < pb ≤ 2` AND `roe_ttm > 0`
- Score: `roe_ttm / (pe * pb)` (return per unit of combined cheapness)

**high_growth** — growth leaders
- Passes: `revenue_cagr_5y > 10`
- Score: `revenue_cagr_5y*0.5 + pat_cagr_5y*0.5`

Rows missing a required metric fail the filter (excluded). Score rounds to 2 dp.

## db.js additions

- `upsertRatios(row)` — upsert one `company_ratios` row
- `getRankingDataset()` — returns merged array for all companies that have
  aggregates: join `companies` (name, sector) + `company_aggregates`
  (roce_5y_avg, roe_5y_avg, revenue_cagr_5y_pct, pat_cagr_5y_pct,
  ebitda_margin_5y_avg) + `company_ratios` (pe, pb, current_price,
  market_cap_cr, roe_ttm, dividend_yield) + latest `company_derived_annual`
  (debt_to_equity). Merge in JS keyed by ticker.

## API

| Method + Path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/rankings` | auth | List strategy definitions `[{ key, label, description }]` |
| `GET /api/rankings/:strategy?limit=20` | auth | Ranked results for a strategy |

Ranking endpoint loads `getRankingDataset()`, runs `rankUniverse`, returns
`{ strategy, generatedAt, count, results: [...] }`.

## Frontend

### New page `Rankings.js` + nav entry "Rankings" (between Dashboard and Tracking)

- Strategy switcher (4 pill buttons) with one-line description of the selected one
- Ranked table columns adapt to strategy but always show: Rank · Ticker ·
  Company · Sector · the strategy's key metrics · Score
- Each row clickable → navigates to analysis for that ticker
- Empty state if no data: "Ingest the universe first (Admin → Load Nifty 500 → Ingest)"

### Component `RankingTable.js`
Reusable sortable table; columns passed in per strategy.

## Testing

`test/ranking.test.js` (pure engine):
- marshall_undervalued passes a quality+cheap row, fails an expensive one
- quality_compounders ranks high-ROCE above low-ROCE
- deep_value requires both low P/E and low P/B
- high_growth filters on revenue CAGR
- rows missing metrics are excluded
- rankUniverse sorts descending by score and assigns ranks 1..N
- limit caps results

## Acceptance Criteria

1. After ingesting tickers, `company_ratios` has current price/PE/PB per ticker.
2. `GET /api/rankings/marshall_undervalued` returns a ranked shortlist with
   scores and pass-reasons.
3. Rankings page shows all 4 strategies; switching re-ranks instantly.
4. Clicking a ranked row opens that stock's analysis.
5. `test/ranking.test.js` passes.
6. Ranking query over 500 rows responds in < 1s (no AI, pure SQL+JS).

## Risk Notes

- **screener top-ratios HTML variance:** some companies omit dividend yield or
  show "ROCE %" vs "Return on capital employed". Parser matches on label
  substrings and treats every field nullable.
- **Stale ratios:** ratios are as fresh as last ingestion. Coverage dashboard
  already shows `last_ingested_at`. Nightly cron keeps them current.
- **Thin coverage early:** if only N tickers are ingested, rankings rank only
  those N. Expected until bulk ingestion completes.
