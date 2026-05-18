# Portfolio Tracking + Episodic Memory — Design

**Date:** 2026-05-17
**Status:** Approved (awaiting written-spec review)
**Project:** ValueSight — Phase 4 of the OntoAgent roadmap
**Roadmap:** `docs/superpowers/specs/2026-05-17-ontoagent-roadmap.md`

## Problem

ValueSight has analysed dozens of stocks and tagged each with a BUY / WATCH /
AVOID verdict. The user has been investing based on these calls but cannot
answer two questions:

1. **What is my actual portfolio worth right now and how is each position
   performing?** Today the tool tracks a watchlist and auto-opened "virtual
   trades" but does not let the user enter real positions with quantities
   and prices.

2. **Has the Marshall 4-gate framework actually worked for the picks I
   have made?** There is no historical-outcome tracking — every analysis is
   a snapshot in time with no follow-up data showing whether the verdict
   played out.

Without (1) the user has no portfolio overview. Without (2) we have no way
to measure or improve the framework, and downstream phases (ranking,
explainability with historical context) have no data to lean on.

## Goal

Build a single Portfolio area in the app that delivers both views:

- **Personal P&L** (primary): a full transaction log (BUY / SELL / DIVIDEND
  / SPLIT / BONUS) per user, from which holdings, average buy price,
  realised P&L, unrealised P&L, total dividends, and total return are
  computed live.
- **Framework Performance** (secondary): historical return data attached to
  every saved analysis, surfaced as backtest stats per verdict (BUY / WATCH
  / AVOID) at 1m / 3m / 6m / 1y horizons.

## Non-Goals

- CSV import from broker statements → Phase 4.1
- Brokerage / STT / stamp duty per trade → Phase 4.1
- Tax reports (LTCG / STCG split) → Phase 4.2
- Connect-broker-API integrations (Zerodha Kite, Upstox) → Phase 4.3
- Sector / market-cap allocation pie charts → Phase 4.1
- Benchmark comparison vs Nifty/Sensex → Phase 4.1
- Gate-level accuracy breakdowns ("does Gate 2a really predict?") — deferred
  to Phase 5 (Reasoning Trace)

## Data Model

Two new tables. SQL migration lives at
`db_migrations/2026-05-17-portfolio-and-outcomes.sql`. The user runs it
once in the Supabase SQL editor before deploy.

### `portfolio_transactions` (per-user)

```sql
CREATE TABLE IF NOT EXISTS portfolio_transactions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker        TEXT NOT NULL,
  company       TEXT,
  type          TEXT NOT NULL CHECK (type IN ('BUY','SELL','DIVIDEND','SPLIT','BONUS')),
  quantity      NUMERIC,
  price         NUMERIC,
  amount        NUMERIC,
  ratio         TEXT,
  transaction_date DATE NOT NULL,
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual','yahoo-auto','csv-import')),
  status        TEXT NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed','proposed','dismissed')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pt_user_ticker ON portfolio_transactions (user_id, ticker);
CREATE INDEX IF NOT EXISTS idx_pt_user_date   ON portfolio_transactions (user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_pt_status      ON portfolio_transactions (user_id, status);
```

Notes on field usage:

| Field | BUY | SELL | DIVIDEND | SPLIT | BONUS |
| --- | --- | --- | --- | --- | --- |
| `quantity` | shares bought | shares sold | (optional) | new qty | new qty |
| `price` | per-share cost | per-share sale | per-share div | — | — |
| `amount` | qty × price | qty × price | total div received | — | — |
| `ratio` | — | — | — | e.g. `1:5` | e.g. `1:1` |

`status` defaults to `confirmed` for manual entries. Auto-detected corporate
actions land as `proposed` and the user confirms or dismisses from the UI.

### `analysis_outcomes` (shared)

```sql
CREATE TABLE IF NOT EXISTS analysis_outcomes (
  ticker             TEXT NOT NULL,
  analysis_date      DATE NOT NULL,
  verdict            TEXT,
  entry_low          NUMERIC,
  entry_high         NUMERIC,
  price_at_analysis  NUMERIC,
  price_1w           NUMERIC,
  price_1m           NUMERIC,
  price_3m           NUMERIC,
  price_6m           NUMERIC,
  price_1y           NUMERIC,
  return_1m_pct      NUMERIC,
  return_3m_pct      NUMERIC,
  return_6m_pct      NUMERIC,
  return_1y_pct      NUMERIC,
  hit_entry_zone     BOOLEAN,
  hit_bull_case      BOOLEAN,
  hit_bear_case      BOOLEAN,
  computed_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, analysis_date)
);

CREATE INDEX IF NOT EXISTS idx_ao_verdict ON analysis_outcomes (verdict);
```

This table is **shared across all users**: the data is about the analysis,
not who is viewing it.

## Holdings Derivation (computed live, not stored)

Holdings are derived from the transaction log on every read. For each ticker
the user has any transactions in:

```
total_buys     = sum(quantity for type IN ('BUY','SPLIT','BONUS'))
total_sells    = sum(quantity for type = 'SELL')
current_qty    = total_buys − total_sells
avg_buy_price  = FIFO average over remaining lots
                 (sells consume oldest buys first)
realised_pl    = ∑ over SELL transactions of (sell_price − cost_basis_at_sell) × qty_sold
unrealised_pl  = (current_cmp − avg_buy_price) × current_qty
total_div      = sum(amount for type = 'DIVIDEND')
total_return   = realised_pl + unrealised_pl + total_div
```

`current_cmp` comes from the existing `fetchYahooPrice()` helper. For the
holdings page render we fetch CMP for each held ticker in parallel, with
a 30-second cache to avoid hammering Yahoo on tab-switches.

SPLIT and BONUS rows do not affect `realised_pl` or `total_return`; they
only adjust `current_qty` and `avg_buy_price` (the per-share cost basis
divides by the same ratio as the share count multiplies).

## Auto Split / Bonus / Dividend Detection

Daily cron (extending `runDailyPriceCheck` in `priceCheck.js`):

```
For each (user_id, ticker) pair present in confirmed portfolio_transactions:
  1. Fetch Yahoo Finance corporate actions for the ticker
     (chart endpoint with events=div,split, range=1y)
  2. For each split/bonus/dividend event NOT already present in
     portfolio_transactions for this user:
       - Insert a row with status='proposed', source='yahoo-auto'
       - Create an alert (existing `createAlert` infra) so the user sees a
         "pending corporate action" banner on the Portfolio page
  3. User confirms in UI → status flips to 'confirmed'.
     User dismisses → status flips to 'dismissed' (kept for audit; ignored in math).
```

The system NEVER silently mutates a position. The user always has the final
say. Dismissed proposals are never re-proposed.

## Episodic Memory: Capturing Analysis Outcomes

New module `outcomes.js` exposes one entry point:

```javascript
computeOutcome(ticker, analysisDate, priceSeries) -> {
  price_at_analysis, price_1w, price_1m, price_3m, price_6m, price_1y,
  return_1m_pct, return_3m_pct, return_6m_pct, return_1y_pct,
  hit_entry_zone, hit_bull_case, hit_bear_case
}
```

Pure function — given a Yahoo daily price series (array of `{date, close}`)
and the analysis date, returns the outcome shape above. No I/O.

Daily cron extension (`runOutcomeBackfill` in `outcomes.js`):

```
For each row in analyses where:
  - analysis_date <= today − 7 days  (give at least one week of data) AND
  - either no row exists in analysis_outcomes OR
    the most-recently-passed horizon (1m/3m/6m/1y) has changed since computed_at

  - Fetch Yahoo Finance chart for ticker, range='5y', interval='1d'
  - Build the price series
  - Call computeOutcome()
  - Upsert into analysis_outcomes
```

This runs as a single nightly pass; daily horizon transitions naturally
trigger re-computation.

One-time **admin backfill endpoint** `POST /api/admin/backfill-outcomes`:

```
For every analysis with analysis_date ≥ today − 2y (cap to limit Yahoo load):
  - Same logic as above, but synchronous and reports progress.
  - Returns { computed, skipped, errors }.
```

The Admin Panel gains a new card "Backfill Analysis Outcomes" that wires to
this endpoint.

## UI Surface

### New top-level nav item

Between `Tracking` and `Profile`, add **Portfolio**. Available to all
authenticated users (not just admin — every user has their own portfolio).

### Three tabs on the Portfolio page

| Tab | Purpose |
| --- | --- |
| **Holdings** (default) | Aggregated table — one row per ticker — with CMP, qty, avg buy, unrealised P&L, realised P&L, dividends, total return |
| **Transactions** | Chronological log of every BUY/SELL/DIVIDEND/SPLIT/BONUS with filters and edit/delete |
| **Framework Performance** | Backtest stats per verdict at 1m/3m/6m/1y horizons |

### Holdings tab layout

```
┌────────────────────────────────────────────────────────────┐
│  Portfolio value                          Total return     │
│  ₹X,XX,XXX                                +Y.Y% (₹+Z,ZZZ)  │
│  Invested ₹A,AA,AAA · Dividends ₹B,BBB · Realised ₹C,CCC   │
└────────────────────────────────────────────────────────────┘

⚠ 2 pending corporate actions — review
    [Confirm split 1:5 TEJASNET 2026-04-15]  [Dismiss]
    [Confirm dividend ₹19/sh HDFCBANK]       [Dismiss]

[+ Buy]  [+ Sell]  [+ Dividend]  [⋮ Other]
         (Other dropdown: Split | Bonus | Edit position | Import CSV*)
         (*CSV grayed out — v4.1)

| Ticker | Company    | Qty | Avg Buy | CMP    | Unrealised   | Realised | Divs | Total Return |
| HDFC.. | HDFC Bank  | 100 | ₹1,250  | ₹1,650 | +₹40,000 +32% | ₹0       | ₹500 | +32.5%       |
| TEJAS..| Tejas Net  |  50 | ₹420    | ₹445   | +₹1,250   +6% | ₹0       | ₹0   | +6.0%        |
```

Click a row → drill into per-ticker breakdown showing lot-by-lot detail.

### Transactions tab layout

Chronological list. Columns: Date · Type · Ticker · Qty · Price · Amount · Notes · ⋮ (edit/delete).
Filters at top: ticker dropdown, type checkboxes, date range.

### Framework Performance tab layout

Three summary cards across the top:

```
┌─ BUY calls (24) ─────┐  ┌─ WATCH calls (45) ─┐  ┌─ AVOID calls (12) ──┐
│ avg 6m: +14.2%       │  │ avg 6m:  +3.1%     │  │ avg 6m:  −4.5%      │
│ hit rate: 71%        │  │ hit rate: 49%      │  │ hit rate: 33%       │
│ best: PIDILITIND +47%│  │ best:  TCS +18%    │  │ best:  TATAMOTORS +9│
│ worst: PAYTM    −22% │  │ worst: ZOMATO −12% │  │ worst: PAYTM    −40%│
└──────────────────────┘  └────────────────────┘  └─────────────────────┘

Framework alpha (BUY 6m return − AVOID 6m return): +18.7%
```

"Hit rate" = % of analyses with positive 6m return.

Below the cards: a sortable table of every analysis with verdict + each
horizon's return. Click a row → analysis detail page.

### Quick-add modals

Single modal pattern, type-aware. For Buy/Sell:

```
┌────────────────────────────────┐
│  Add Buy                       │
├────────────────────────────────┤
│  Ticker  [autocomplete______]  │
│  Quantity [_____]              │
│  Price/share ₹[_____]          │
│  Date     [2026-05-17]         │
│  Notes (optional) [_________]  │
│                                │
│        [Cancel]  [Save Buy]    │
└────────────────────────────────┘
```

For Dividend:

```
┌────────────────────────────────┐
│  Add Dividend                  │
├────────────────────────────────┤
│  Ticker  [autocomplete______]  │
│  Total amount ₹[_____]         │
│  Date     [2026-05-17]         │
│  Per-share ₹[auto if qty known]│
│                                │
│      [Cancel]  [Save Dividend] │
└────────────────────────────────┘
```

For Split/Bonus (rare manual entry):

```
┌────────────────────────────────┐
│  Add Split / Bonus             │
├────────────────────────────────┤
│  Ticker  [autocomplete______]  │
│  Type   ( ) Split  ( ) Bonus   │
│  Ratio  [_]:[_]                │
│  Ex-date [2026-04-15]          │
│                                │
│        [Cancel]  [Save]        │
└────────────────────────────────┘
```

Ticker autocomplete is sourced from existing analyses (best for valid Indian
tickers) plus a free-text fallback for tickers the user hasn't analysed yet.

## API Surface

New Express endpoints, all guarded by `requireAuth` (per-user) except the
backfill which uses `requireAdmin`:

| Method + Path | Purpose |
| --- | --- |
| `GET /api/portfolio/holdings` | Aggregated holdings for the logged-in user (computed live) |
| `GET /api/portfolio/transactions` | Transaction log for the logged-in user (with filters via query string) |
| `POST /api/portfolio/transactions` | Add a new transaction |
| `PUT /api/portfolio/transactions/:id` | Edit a transaction |
| `DELETE /api/portfolio/transactions/:id` | Delete a transaction |
| `POST /api/portfolio/transactions/:id/confirm` | Confirm a `proposed` corporate-action transaction |
| `POST /api/portfolio/transactions/:id/dismiss` | Dismiss a `proposed` transaction |
| `GET /api/outcomes` | All analysis outcomes (shared data) for backtest tab |
| `GET /api/outcomes/:ticker` | Outcomes for one ticker |
| `POST /api/admin/backfill-outcomes` | Admin one-shot backfill |

All responses are JSON. Errors follow the existing `{ error: '...' }`
shape.

## Implementation Components

### New backend modules

- `portfolio.js` — pure derivation: takes a transaction array, returns
  computed holdings and per-ticker stats. Easy to unit-test.
- `outcomes.js` — `computeOutcome(ticker, analysisDate, priceSeries)` pure
  function + `runOutcomeBackfill()` cron-friendly entry.

### Modified backend files

- `db.js` — CRUD for `portfolio_transactions` and `analysis_outcomes`.
- `priceCheck.js` — extend the daily cron to also scan for corporate
  actions per user and call `runOutcomeBackfill()`.
- `index.js` — wire the new endpoints.

### New frontend components

- `client/src/pages/Portfolio.js` — top-level page with tabs and routing
- `client/src/components/portfolio/HoldingsTable.js`
- `client/src/components/portfolio/TransactionsList.js`
- `client/src/components/portfolio/FrameworkPerformance.js`
- `client/src/components/portfolio/TransactionModal.js` (Buy / Sell /
  Dividend / Split modal — single component, type-aware)
- `client/src/components/portfolio/PendingActionsBanner.js`

### Modified frontend files

- `client/src/App.js` — add Portfolio nav entry
- `client/src/pages/AdminPanel.js` — add "Backfill Analysis Outcomes" card

## Testing Plan

Unit tests via `node:test`:

- `test/portfolio.test.js`
  - Single BUY → holdings show 1 lot, avg = buy price
  - BUY then BUY → weighted average
  - BUY then SELL → realised P&L, FIFO consumption
  - BUY then SPLIT 1:5 → qty × 5, avg ÷ 5
  - DIVIDEND only → no qty change, dividends accrue
  - Multiple tickers → independent computation
- `test/outcomes.test.js`
  - Synthetic price series → returns at 1m/3m/6m computed correctly
  - `hit_entry_zone` true when min(prices) within zone
  - `hit_bull_case` true when max(prices) ≥ bull
  - Missing data points → null, no crash

Manual smoke test outlined in the implementation plan.

## Acceptance Criteria

1. A new "Portfolio" nav item is visible to every signed-in user.
2. Adding a Buy and a Dividend transaction updates the Holdings table
   correctly with no page refresh required.
3. Selling part of a position shows realised P&L on the Holdings row.
4. Splits proposed by Yahoo appear in the pending-actions banner; clicking
   Confirm adjusts holdings and removes the banner.
5. After running the admin backfill once, the Framework Performance tab
   shows non-zero return data for every analysis older than 7 days.
6. All 8 + N unit tests (portfolio + outcomes) pass via `npm test`.
7. Per-user privacy: User A cannot see User B's transactions via any API.
8. Adding all P&L computations adds < 200 ms to a Holdings page load
   (cached CMP, in-memory aggregation).

## Risk Notes

- **Yahoo Finance rate limits** — the daily cron and backfill could trigger
  many chart calls. Mitigation: the chart endpoint already returns 5 years
  of daily data per call, so we need ≤ 1 call per ticker per backfill, not
  per analysis. Cache the response in memory during the backfill run.
- **FIFO accuracy** — Indian tax law uses FIFO for LTCG; we follow the same
  convention for `realised_pl`. Out of scope: tax-optimised SELL ordering.
- **Corporate-action detection accuracy** — Yahoo's events endpoint is
  authoritative for splits/dividends; we rely on it. If a corporate action
  is missing from Yahoo, the user can still enter it manually.
- **Editing/deleting historical transactions** — must not corrupt holdings.
  All computations are derived live from the transaction set, so edits
  recompute cleanly.
