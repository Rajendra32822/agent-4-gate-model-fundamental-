# Phase 9 (Slice 1) — Corporate Actions Ledger + Ticker/Name-Change Resolution

**Date:** 2026-05-25
**Status:** Approved (awaiting written-spec review)
**Type:** Phase design (first slice of Phase 9 of the master plan)
**Master plan:** `2026-05-17-master-architecture-plan.md` §4 Group 10 + §5 M5 — Corporate Actions subsystem.

## 1. Scope decomposition (why this is a slice)

Phase 9 (corporate actions) is too large for one spec. Exploration found:
- **`daily_prices` does not exist** → the master plan's "adjust historical prices for splits" applier has nothing to adjust (blocked; really a Phase 10 prerequisite).
- **SPLIT/BONUS cost-basis is already handled** — `portfolio.js` (`parseSplitRatio`) adjusts holdings when a SPLIT/BONUS *transaction* is entered. Done.
- **`renameTickerCascade` is partial** — hard-renames 9 structured tables only (even misses `company_ratios`), skips `analyses`/`portfolio_transactions`/`watchlist`, and keeps no audit trail. The master plan's flagged "critical requirement" (records resolving after a ticker change) is genuinely unmet.

**Decomposition:**
- **Slice 1 (this spec):** corporate-actions ledger + confirmation queue + ticker/name-change resolution.
- Slice 2: auto-fetcher (Yahoo/NSE) proposing events into the queue.
- Slice 3: SPLIT/BONUS price-history adjustment (needs `daily_prices` first).
- Slice 4: MERGER/DEMERGER appliers.

## 2. Locked decisions (brainstorm 2026-05-25)

| # | Decision |
| --- | --- |
| Ticker resolution | **A — hard-rename everywhere + `ticker_history` audit + `resolveTicker` redirect** (not a non-mutating mapping layer). |
| Confirm scope | **A — act only on `TICKER_CHANGE`/`NAME_CHANGE`**; all other event types are recorded-only in Slice 1. |
| Event entry | **B — manual admin entry + best-effort auto-capture of *proposed* rows from the analysis `corporateActions` field.** |

## 3. Data model

**`corporate_actions`** — canonical ledger:
```sql
CREATE TABLE corporate_actions (
  id                BIGSERIAL PRIMARY KEY,
  ticker            TEXT NOT NULL,
  event_type        TEXT NOT NULL CHECK (event_type IN
                      ('SPLIT','BONUS','RIGHTS','BUYBACK','DIVIDEND','MERGER','DEMERGER','NAME_CHANGE','TICKER_CHANGE')),
  status            TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','dismissed')),
  ratio             TEXT,
  ex_date           DATE,
  announcement_date DATE,
  record_date       DATE,
  new_ticker        TEXT,
  new_name          TEXT,
  linked_ticker     TEXT,
  amount            NUMERIC,
  notes             TEXT,
  source            TEXT DEFAULT 'manual',   -- 'manual' | 'analysis'
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON corporate_actions (ticker);
CREATE INDEX ON corporate_actions (status);
```

**`ticker_history`** — OLD→NEW lookup/audit:
```sql
CREATE TABLE ticker_history (
  id          BIGSERIAL PRIMARY KEY,
  old_ticker  TEXT NOT NULL,
  new_ticker  TEXT NOT NULL,
  change_date DATE,
  reason      TEXT,
  action_id   BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON ticker_history (old_ticker);
```

## 4. Queue lifecycle + confirm behavior

States: `proposed` → `confirmed` | `dismissed`. Nothing mutates until admin confirms. `confirmed`/`dismissed` are terminal (redo = new action).

| event_type | On confirm |
| --- | --- |
| `TICKER_CHANGE` | `applyTickerChange` (cascade OLD→`new_ticker` across all ticker-keyed tables) + write `ticker_history` + `applied_at`. |
| `NAME_CHANGE` | `UPDATE companies SET company_name = new_name WHERE ticker = …` + `applied_at`. |
| `SPLIT`/`BONUS`/`DIVIDEND`/`RIGHTS`/`BUYBACK`/`MERGER`/`DEMERGER` | Mark `confirmed` only — recorded, no mutation. |

Guards: confirm requires the type's fields (`TICKER_CHANGE`→`new_ticker`, `NAME_CHANGE`→`new_name`); confirming a non-`proposed` row is a no-op (cascade can't run twice).

## 5. Ticker/name-change resolution

**`applyTickerChange(oldTicker, newTicker, actionId)`** extends the cascade to **every** ticker-keyed table `db.js` touches (per-table try/catch, returns `{updated[], errors[]}`):
- Structured: companies, company_annual_pl/bs/cf, company_quarterly_pl, company_derived_annual/quarterly, company_aggregates, company_shareholding, **company_ratios** (was missing).
- Analyses/memory: **analyses, fundamental_metrics, analysis_outcomes** (were missing).
- User: **portfolio_transactions, watchlist, watches, virtual_trades, price_checks** (were missing).
- Ledger: **corporate_actions** is also renamed OLD→NEW so a ticker's event log follows it to the new symbol. **`ticker_history` is NOT renamed** — it stores the literal OLD→NEW mapping (the audit trail). The confirm status update is by `id` (not ticker), so renaming the in-flight action row mid-cascade is safe.

Then writes `ticker_history (old, new, change_date = ex_date || today, reason:'TICKER_CHANGE', action_id)` and sets `applied_at`. The exact set is exported as a `TICKER_KEYED_TABLES` constant (test-guarded). Implementation: **extend the existing `renameTickerCascade`** to this full set (also fixes the existing admin rename endpoint); `applyTickerChange` wraps it + writes history.

**Conflict handling:** if NEW already exists (PK collision), that table's update errors and is reported in `errors[]` — non-fatal; admin resolves manually.

**`resolveTicker(ticker)`** — looks up `ticker_history`, follows OLD→NEW→NEWER to the latest symbol (pure `resolveChain(historyRows, ticker)` core, cycle-guarded), returns input if unmapped. Wired into `getAnalysis`, `getCompanyBundle`, `/api/lookup` so old symbols redirect post-rename. **Fail-safe:** errors (e.g. table missing pre-migration) → return input unchanged.

## 6. Auto-capture from analysis

**Pure `parseCorporateActionFromText(text)` → `{ event_type, ratio } | null`:** null for "None found"/"N/A"/unrecognized; keyword→valid enum type (`split`→SPLIT, `bonus`→BONUS, `dividend`→DIVIDEND, `rights`→RIGHTS, `buyback`→BUYBACK, `demerger`→DEMERGER, `merger`→MERGER, `renamed`/`name change`→NAME_CHANGE, `ticker change`→TICKER_CHANGE); extracts `ratio` like `1:5`. Never invents an out-of-enum type.

**`captureCorporateActionFromAnalysis(analysis)`** (db helper): parse `analysis.corporateActions`; on a hit, **dedup** (skip if a `proposed`/`confirmed` action exists for the same `(ticker, event_type)`), insert a `proposed` row (`source:'analysis'`, `notes` = raw narrative). Called from `/api/analyse` **after `saveAnalysis`**, fire-and-forget (`.catch`), like the existing auto-watch call. **Fail-safe** if the table doesn't exist. Captured rows are pure candidates — admin reviews/edits/confirms; only admin-entered structured fields trigger a cascade.

## 7. API + frontend

**Pure logic (`corporateActions.js`):** `parseCorporateActionFromText`, `validateConfirm(action) → {ok, error}`, `resolveChain(historyRows, ticker)`, `TICKER_KEYED_TABLES`.

**Endpoints (`index.js`):**
- `GET /api/corporate-actions/:ticker` (requireAuth) → ticker's `confirmed` actions.
- `GET /api/admin/corporate-actions?status=proposed` (requireAdmin) → queue.
- `POST /api/admin/corporate-actions` (requireAdmin) → create `proposed`.
- `PUT /api/admin/corporate-actions/:id` (requireAdmin) → edit a `proposed` row.
- `POST /api/admin/corporate-actions/:id/confirm` (requireAdmin) → guard → `validateConfirm` → apply per type → `setStatus('confirmed', applied_at)`.
- `POST /api/admin/corporate-actions/:id/dismiss` (requireAdmin).

**DB helpers (`db.js`):** `listCorporateActions(ticker)`, `listCorporateActionsByStatus(status)`, `getCorporateAction(id)`, `createCorporateAction(row)`, `updateCorporateAction(id, patch)`, `setCorporateActionStatus(id, status, extra)`, `applyTickerChange`, `updateCompanyName(ticker, name)`, `writeTickerHistory(...)`, `resolveTicker(ticker)`, `captureCorporateActionFromAnalysis(analysis)`.

**Frontend:**
- **Admin "Corporate Actions" panel** (AdminPanel, like the Sector panel): proposed queue with edit/confirm/dismiss + cascade-result display + an "Add action" form.
- **AnalysisView**: compact read-only "Corporate Actions" list (confirmed events) from the public endpoint.

## 8. Testing

- **Pure (TDD):** `parseCorporateActionFromText`, `validateConfirm`, `resolveChain`, and a `TICKER_KEYED_TABLES` completeness assertion.
- **I/O (manual after deploy):** add→queue→confirm/dismiss; a TICKER_CHANGE moves records + writes history + old-symbol lookup redirects; NAME_CHANGE renames; a split-detecting analysis drops one deduped proposal; AnalysisView list shows confirmed actions.

## 9. Rollout

Migration → `corporateActions.js` (+ tests) → `db.js` helpers (extend `renameTickerCascade`; `applyTickerChange`, `resolveTicker`, `captureCorporateActionFromAnalysis`) → `index.js` endpoints + wire capture after `saveAnalysis` + wire `resolveTicker` into `getAnalysis`/`getCompanyBundle`/`/api/lookup` → frontend → push. Then (user): run the migration, test.

## 10. Acceptance criteria

1. Admin adds a proposed action, sees it queued, confirms/dismisses.
2. Confirming a `TICKER_CHANGE` moves all records OLD→NEW (incl. analyses/portfolio/watchlist), writes `ticker_history`, and an old-symbol lookup redirects to NEW.
3. Confirming a `NAME_CHANGE` updates `companies.company_name`.
4. Other event types confirm as recorded-only (no mutation).
5. A split/bonus-detecting analysis drops exactly one deduped `proposed` row; "None found" drops none.
6. Confirmed actions render on AnalysisView.
7. All tests green; no regressions; pre-migration behavior unchanged (fail-safe helpers).

## 11. Out of scope (later slices)

- Auto-fetcher (Yahoo/NSE) → Slice 2.
- SPLIT/BONUS price-history adjustment (`daily_prices`) → Slice 3.
- MERGER/DEMERGER appliers (mark-inactive, spinoff cost-basis allocation) → Slice 4.
- Non-mutating ticker resolution layer (rejected in favor of hard-rename + audit).

## 12. Pending user (manual) steps

- Run the Phase 9 Slice 1 migration in Supabase.
