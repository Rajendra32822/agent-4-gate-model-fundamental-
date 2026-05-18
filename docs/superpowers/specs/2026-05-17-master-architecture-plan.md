# ValueSight — Master Architecture Plan

**Date:** 2026-05-17
**Status:** Approved (awaiting written-spec review)
**Type:** Strategic master plan (supersedes earlier roadmap)
**Prior roadmap:** `2026-05-17-ontoagent-roadmap.md` — superseded by phasing in §10

## 1. North Star

> *"A system that continuously converts fragmented information into executable
> conviction — with memory, context, and accountability."*

ValueSight is a **decision engine, not a data portal**. Screener.in already
wins on raw fundamental screening; Tijori already wins on alt-data; we don't
compete on those. We compete on synthesis — turning fragmented multi-source
signals into actionable verdicts you can act on with confidence, with full
memory of what was decided and why.

### Four pillars (drive every architectural choice)

| Pillar | What it means | How it appears in architecture |
| --- | --- | --- |
| Continuous | Always-on data pipeline | Nightly bulk fetchers, real-time price stream |
| Fragmented → unified | Multi-source ingest, single ontology | Ingestion layer + Group 1-2 tables |
| Executable conviction | Actionable verdicts with sizing & horizon | Analysis service emits decisions, not just metrics |
| Memory & accountability | Every decision tracked + backtested | `analyses`, `analysis_outcomes`, `decision_log` |

## 2. Strategic Decisions (locked from Q1–Q10)

| ID | Decision |
| --- | --- |
| Universe scope | Nifty 500 + selected mid/small caps (~500-1,500 tickers) |
| User model | Multi-user ready from now on, public/paid eventually |
| Horizons | Long + medium + short term (Marshall + technical signals) |
| AI budget | Free by default, paid only on user-flagged "Deep Analysis" |
| Data freshness | Real-time prices on stock page; fundamentals daily; financials on release |
| Hosting | Render free → paid plan as bulk pipeline scales |
| Priority order | Data layer → Ontology → Microtheories → Ranking → CorpActions → Technical |
| Differentiator | Decision engine: synthesis, memory, accountability |

## 3. Tier Coverage Model

| Tier | Scope | Pipeline | Cost | Refresh |
| --- | --- | --- | --- | --- |
| A. Universe | ~1,500 stocks | Structured data fetch only, no AI. Rankings + signals in SQL. | ₹0 | Nightly cron |
| B. Active | ~50-200 (watchlist, portfolio, recently analysed) | Free OpenRouter AI for Marshall narrative | ~₹0 | Weekly + on-demand |
| C. Deep | ~5-20/month | Marshall + paid Anthropic Sonnet for narrative + Tier-2 verification + qualitative gates | ~₹2-5/analysis | User-clicked "Deep Analysis" |

A and B run automatically. C is user-gated.

## 4. Database Modules

Total ~28 tables across 11 groups. Existing in **bold**.

### Group 1 — Universe & Reference

- `companies` — static metadata: ticker, company name, isin, sector, sub-sector, listing date, market_cap_tier (large/mid/small/micro), is_active
- `sectors` — sector + sub-sector catalogue with Marshall benchmark thresholds

### Group 2 — Periodic Financials (refactor of current AI-extracted approach)

- `company_annual_pl` — annual P&L, one row per (ticker, fy_end). Columns: sales, expenses, operating_profit, opm_pct, other_income, interest, depreciation, pbt, tax_pct, net_profit, eps_rs
- `company_annual_bs` — annual balance sheet: equity_share_capital, reserves, total_equity, long/short term borrowings, total_debt, payables, fixed_assets, cwip, investments, inventories, receivables, cash, total_assets, book_value_per_share
- `company_annual_cf` — annual cash flow: ocf, icf, ffc, net_change_cash, capex, free_cash_flow, dividends_paid, debt_raised, debt_repaid
- `company_quarterly_pl` — quarterly P&L (P&L only, matches screener.in's "Quarterly Results" structure): same line items as annual P&L

All four tables default `is_consolidated = true`. All four are designed for
**auto-expand**: new periods are inserted as rows, never schema changes.

### Group 3 — Derived & Aggregates (computed from Group 2)

- `company_derived_annual` — per-year ratios: ebitda_margin, pat_margin, roe, roce, roa, debt_to_equity, interest_coverage, current_ratio, ocf_to_pat, fcf_margin, YoY growth metrics
- `company_derived_quarterly` — per-quarter: margins, YoY growth, QoQ growth
- `company_aggregates` — per-ticker: 5y averages (ROCE, ROE, margins), 5y/10y CAGRs (revenue, PAT, EBITDA), latest period markers, count of periods available

### Group 4 — Live & Streaming

- `company_live` — current snapshot: price, market_cap_cr, pe, pb, dividend_yield, 52w_high, 52w_low. In-memory cached 60s; persisted on every analysis run.
- `daily_prices` — rolling 5-year OHLC daily series per ticker (compact)
- (no `price_ticks` table — intra-day data lives only in-memory + streamed via SSE)

### Group 5 — Analyses & Decisions (existing + extend)

- **`analyses`** — full Marshall analysis JSON snapshots ✓
- **`analysis_outcomes`** — 1m/3m/6m/1y returns post-analysis ✓
- **`fundamental_metrics`** — flat numeric snapshot per analysis + confidence columns ✓
- `decision_log` (new) — every signal/verdict + user response (acted/dismissed/ignored) for accountability
- `signals` (new) — non-analysis triggers: results dropped, buy zone hit, pledge change, sector rotation. Each row links to a user via watchlist.

### Group 6 — User-scoped (existing) ✓

- `auth.users` (Supabase), `profiles`, `portfolio_transactions`, `watchlist`, `watches`, `virtual_trades`, `alerts`

### Group 7 — Rankings (new, Phase 8)

- `ranking_strategies` — named definitions: "Marshall undervalued", "High-ROCE midcaps", "Momentum + value blend". Each strategy is an SQL expression + weights.
- `ranking_cache` — pre-computed top-N per strategy, refreshed nightly. Schema: (strategy_id, ticker, rank, score, computed_at)

### Group 8 — Microtheories (new, Phase 7)

- `sector_microtheories` — per-sector benchmark overrides: IT ROCE >=30%, FMCG >=25%, Pharma >=20%, etc. Plus per-sector Marshall gate rules.
- `microtheory_overrides` — manual case-specific overrides (admin-curated)

### Group 9 — Confidence & Verification (existing) ✓

Lives on `analyses.data` JSONB. `confidence_score` / `confidence_band`
columns mirror to `fundamental_metrics` for SQL filtering.

### Group 10 — Corporate Actions (new, Phase 9)

Standalone subsystem per user request — name changes, M&A, demergers, splits, bonus, rights, buybacks.

- `corporate_actions` — single canonical table for all event types:
  - id, ticker, event_type (`SPLIT`, `BONUS`, `RIGHTS`, `BUYBACK`, `DIVIDEND`, `MERGER`, `DEMERGER`, `NAME_CHANGE`, `TICKER_CHANGE`)
  - ratio (e.g. "1:5"), ratio_from, ratio_to (parsed)
  - ex_date, announcement_date, record_date
  - new_ticker (for ticker changes, mergers, demergers)
  - new_name (for name changes)
  - linked_ticker (for mergers — the absorbed entity, for demergers — the spinoff)
  - amount (for buybacks, rights)
  - notes
  - source, fetched_at, is_confirmed
- `ticker_history` — links old ticker symbols to current — every analysis still works after a ticker change. Schema: (old_ticker, new_ticker, change_date, reason)

Critical: when a name/ticker change or merger happens, all existing
`analyses`, `portfolio_transactions`, `watchlist` rows pointing at the old
ticker need to resolve correctly. `ticker_history` provides the lookup.

### Group 11 — Technical Analysis (new, Phase 10)

Layered on top of `daily_prices`. Computed nightly for any ticker the user
has actively analysed (Tier B) or holds (portfolio).

- `technical_indicators` — per-ticker per-date: rsi_14, macd_line, macd_signal, macd_hist, sma_50, sma_100, sma_200, ema_20, bb_upper, bb_lower, bb_middle, adx_14, atr_14, volume_avg_20
- `technical_signals` — derived events: ticker, signal_type (GOLDEN_CROSS, DEATH_CROSS, RSI_OVERSOLD, RSI_OVERBOUGHT, BREAKOUT_RESISTANCE, BREAKDOWN_SUPPORT, MACD_BULLISH, MACD_BEARISH), signal_date, strength (0-100), is_acknowledged

The Marshall verdict stays the primary call. Technical signals add a
secondary "tactical timing" layer for ENTRY timing of an already-approved
buy — never as the primary buy reason.

## 5. Backend Modules

### M1. Ingestion service (new core)

- `ingestion/screenerScraper.js` — fetch screener.in JSON for one ticker, normalize to Group 2 source tables. Handles consolidated/standalone toggle.
- `ingestion/nseScraper.js` — fetch NSE official endpoints for live price, shareholding pattern, promoter pledge, corporate-action announcements
- `ingestion/yahooFetcher.js` — extend existing `priceCheck.js` for full 5-year daily OHLC + corporate-action events
- `ingestion/orchestrator.js` — knows which fetcher to call for which ticker/tier at what frequency
- `ingestion/nightlyBulk.js` — Tier A universe-wide bulk runner (~1,500 tickers, ~30 min run)

### M2. Computation service (new)

- `derive.js` — pure-JS: takes Group 2 raw → produces Group 3 derived metrics for one ticker
- `aggregate.js` — pure-JS: takes derived → produces `company_aggregates`
- `ranking.js` — SQL-based: refreshes `ranking_cache` for all strategies nightly

### M3. Analysis service (existing, refactored)

- `agent.js` — refactor: receive structured Group 2/3 input INSTEAD of raw web text. No more 5-search prompts. AI only does framework application + qualitative narrative.
- `confidence.js` ✓
- `verification.js` ✓ (simplified — much less to verify when inputs are structured)
- `portfolio.js` ✓
- `outcomes.js` ✓

### M4. Signal service (new)

- `signals/buyZoneDetector.js` — fires when daily price enters a saved entry zone
- `signals/resultsListener.js` — fires when `company_quarterly_pl` gets a new row for a watched ticker
- `signals/pledgeChangeDetector.js` — fires when promoter pledge moves >2% qoq
- `signals/decisionLogger.js` — writes to `decision_log`
- `signals/technicalSignalEmitter.js` (Phase 10) — fires technical events

### M5. Corporate Actions service (new, Phase 9)

- `corporateActions/fetcher.js` — pulls from Yahoo events + NSE corporate-actions feed
- `corporateActions/applier.js` — when a confirmed event happens:
  - **SPLIT/BONUS**: adjusts all `daily_prices`, `analyses` historical prices, portfolio cost basis
  - **NAME_CHANGE/TICKER_CHANGE**: writes `ticker_history`, updates `companies.ticker` (with audit trail)
  - **MERGER**: marks absorbed ticker as inactive, links to absorber, optionally migrates portfolio positions
  - **DEMERGER**: creates new `companies` row for spinoff, allocates cost basis per ratio
- `corporateActions/queue.js` — proposed events held for admin/user confirmation (no silent mutations — matches existing portfolio behaviour)

### M6. Technical Analysis service (new, Phase 10)

- `technical/indicators.js` — compute RSI, MACD, MAs, BB, ADX, ATR from `daily_prices`
- `technical/signals.js` — derive cross/breakout signals from indicators
- `technical/runner.js` — nightly job: refresh indicators for all Tier B + portfolio tickers

### M7. Cron orchestrator (extend existing)

- **Nightly (4 AM IST)**: ingestion bulk run → derive → aggregate → ranking refresh → outcome backfill (1y horizon) → technical refresh → corporate-action fetch
- **Hourly**: price check for held + watchlist (existing)
- **Real-time (on-demand)**: when user opens a stock page → SSE stream of live price (refresh every 15s)

### M8. API layer (extend existing `index.js`)

New route groups:
- `GET /api/universe` — list of all covered tickers with summary
- `GET /api/company/:ticker` — full Group 2-4 data for one ticker
- `GET /api/company/:ticker/financials` — auto-expanding table data (last N periods)
- `GET /api/rankings/:strategy` — pre-computed ranked list
- `POST /api/analyse/:ticker?tier=deep` — trigger deep analysis (Tier C)
- `GET /api/stream/price/:ticker` — SSE live price stream
- `GET /api/signals` — user's pending signals
- `POST /api/signals/:id/ack` — acknowledge a signal
- `GET /api/corporate-actions/:ticker` — corp actions history for a ticker
- `POST /api/admin/corporate-actions/:id/confirm` — admin confirm proposed action
- `GET /api/technical/:ticker` — technical indicators + signals

All existing endpoints preserved.

### M9. AI router (existing, refine)

- Default: OpenRouter free models (Gemma 4 / DeepSeek V4 Flash / etc.)
- On user click "Deep Analysis": Anthropic Sonnet 4.5
- Per-user token budget for multi-user (eventual)
- Cost meter visible in admin panel

## 6. Frontend Modules

### F1. Pages

| Page | Status | Role |
| --- | --- | --- |
| Dashboard | exists — evolve | Decision Center: pending signals at top, watchlist, recent analyses |
| Universe explorer | new | Filter all ~1,500 stocks by SQL criteria — Screener.in equivalent built locally |
| Rankings | new | Pre-computed top-N lists per strategy with strategy switcher |
| Stock page | new (replaces older Watches detail) | Single-ticker deep view: live price ticker + auto-expanding financials grid + technical chart + corporate-actions log + Marshall analysis history + "Run Deep Analysis" button |
| Analysis viewer | exists | Marshall result (already has ConfidenceShield, VerificationBadge, CMP-position bar) |
| Portfolio | exists ✓ | Holdings / Transactions / Framework Performance |
| Watchlist (Tracking) | exists | Stocks with active entry-zone watches |
| Decision history | new | Audit log: every verdict, what you did, how it played out |
| Admin | exists | Backfills, invite users, settings |
| Profile | exists ✓ | — |

### F2. Shared components

Existing ✓: `ConfidenceShield`, `VerificationBadge`, `CmpPositionBar` (inside AnalysisView), Portfolio components.

New:
- `PriceTicker` — live price with SSE-driven updates
- `FinancialsGrid` — auto-expanding columns per period (matches screener.in's quarterly results visual)
- `RankingTable` — sortable, filterable, sticky-header
- `SignalCard` — actionable notification with accept/dismiss/snooze
- `CorporateActionsLog` — chronological action history per ticker
- `TechnicalChart` — price + indicators overlay (Phase 10)

### F3. State management

- Current: page-level `useState`
- Future when multi-user state gets complex: lightweight Zustand store for `user`, `liveQuotes`, `portfolio`. No Redux.

## 7. Operating Model

| Item | Plan |
| --- | --- |
| Hosting | Render free → paid plan when bulk fetcher requires background worker (~Phase 5) |
| Database | Supabase free → paid as universe data grows (~50 GB at 1,500 tickers × 10 years) |
| AI free-default | OpenRouter free models for Tier A + B |
| AI paid on-demand | Anthropic Sonnet only on "Deep Analysis" click |
| Multi-user readiness | Schema already per-user where it matters; pricing tier deferred |
| Real-time prices | SSE stream from server, in-memory 60s cache |
| Cron | cron-job.org pings `/api/cron/*` endpoints |

**Expected steady-state cost** (single user): ₹0-500/month base infra + per-deep-analysis AI cost (~₹2-5 each, capped by user's own usage).

## 8. Testing & Quality

- Pure-JS modules (`derive.js`, `aggregate.js`, `ranking.js`, `confidence.js`, `verification.js`, `portfolio.js`, `outcomes.js`, `technical/indicators.js`) all unit-tested via `node --test test/`
- I/O modules (ingestion scrapers, signal emitters) covered by integration tests against fixture JSON
- Frontend manual smoke tests after each Render deploy
- No e2e test framework — single-user scale doesn't justify Playwright yet

## 9. Migration & Backward Compatibility

Each phase ships behind a feature flag where possible:

- Phase 5 (data layer): new tables are additive — old AI-extracted analyses keep working. The new structured-data path goes live for analyses run *after* deploy.
- Phase 9 (corporate actions): name/ticker changes always go through `ticker_history` lookup; old code paths get a thin shim that resolves old tickers via this table.

## 10. Phasing (Revised — Master)

| Phase | Module | Goal | Status |
| --- | --- | --- | --- |
| 1-4 (done) | OntoAgent foundation: confidence, verification, portfolio, episodic memory | Trust + memory layer | ✅ shipped |
| **5 — Data layer** | Group 1, 2, 3 tables + Ingestion service + Computation service + Analysis service refactor | Structured-data foundation; eliminates AI-extraction errors | Next |
| 6 — Ontology | Formal types/relationships; clean up Group 2 line-item names into a canonical vocabulary | Type-safe agent reasoning | After 5 |
| 7 — Sector microtheories | Group 8 tables + sector-aware Marshall logic | Per-sector benchmarks (IT vs FMCG vs Banks) | After 6 |
| 8 — Ranking | Group 7 tables + Ranking computation + Frontend Rankings + Universe explorer pages | Decision engine: top-N undervalued, cross-stock compare | After 7 |
| 9 — Corporate actions | Group 10 tables + Corporate Actions service + UI for confirmations | Name changes, mergers, demergers handled cleanly | After 8 |
| 10 — Technical analysis | Group 11 tables + Technical service + TechnicalChart component | Tactical entry-timing layer on top of Marshall verdicts | After 9 |
| Deferred | Reasoning trace, dialog, alerts/email, mobile, tax reports, billing | Lower priority per Q7 | Later |

Each phase produces working software on its own. Each phase will have its
own brainstorm → spec → plan → implementation cycle.

## 11. Acceptance Criteria for this Master Plan

1. Phase 5 unblocks all the deferred features by providing structured data
2. Each phase's spec doc references the relevant section of this master plan
3. Strategic decisions (§2) are saved to project memory so future sessions inherit context
4. No phase silently overwrites another's tables — additive migrations only
5. The North Star (§1) is verifiable at each phase: "does this make a user's
   decision faster, more confident, or more accountable?" If no — defer it.
