# Phase 9 Slice 2 — Corporate Actions Auto-Fetcher + Result Dates
**Date:** 2026-05-25
**Status:** Approved

---

## 1. Goal

Two additions that run nightly with zero manual effort:

1. **Corporate actions auto-proposer** — fetch splits and dividends from Yahoo Finance for all active tickers and propose them into the existing `corporate_actions` admin queue (status = `proposed`). Admin confirms or dismisses.
2. **Quarterly result dates** — extract each company's next result date from screener.in and store on `companies.next_result_date`. Stale dates (>5 days past) are cleared automatically so only upcoming dates are shown.

---

## 2. Schema Change

Migration: `db_migrations/2026-05-25-phase9-slice2-result-date.sql`

```sql
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS next_result_date  DATE,
  ADD COLUMN IF NOT EXISTS result_date_source TEXT DEFAULT 'screener.in';
```

No new table. `next_result_date` lives on `companies` — one value per ticker, overwritten nightly.

---

## 3. Result Date Extraction (free ride on existing scrape)

### 3a. `ingestion/screenerScraper.js` — extend `parseTopRatios`

Screener.in's top-ratios section includes a "Result date" label. `parseTopRatios` is extended to extract it:

- Match label `/result\s*date/i` in the ratios list
- Parse value e.g. `"Jun 2025"` or `"30 Jun 2025"` → `YYYY-MM-DD` via new pure helper `parseResultDate(str)`
- Return `resultDate` (ISO string or `null`) alongside existing ratio fields

### 3b. `parseResultDate(str)` — new pure helper in `screenerScraper.js`

```
parseResultDate("Jun 2025")     → "2025-06-01"  (first of month if no day given)
parseResultDate("30 Jun 2025")  → "2025-06-30"
parseResultDate(null)           → null
parseResultDate("N/A")          → null
```

Stale filter: if parsed date is **more than 5 days in the past** (relative to today) → return `null`. Prevents storing "Jun 2025 results happened last week" when screener hasn't yet published the next date.

### 3c. `ingestion/orchestrator.js` — pass result date to `upsertCompany`

After scraping, always write the result date (including `null`) so stale DB values are cleared when screener stops showing a date:
```js
await upsertCompany({ ticker, ..., next_result_date: topRatios.resultDate ?? null, result_date_source: 'screener.in' });
```

The existing `ingest-universe` nightly cron now silently keeps `next_result_date` current for all 500 tickers. No extra HTTP calls.

---

## 4. Corporate Actions Auto-Proposer

### 4a. New file `ingestion/corporateActionsRunner.js`

```
runCorporateActionsProposal(tickers, db, opts)
  → Promise<{ total, done, failed, skipped }>
```

Per ticker:
1. `fetchYahooCorporateActions(ticker, 365)` — 1-year lookback (already in priceCheck.js)
2. Map `splits[]` → `{ event_type: 'SPLIT', ex_date, ratio, source: 'yahoo' }`
3. Map `dividends[]` → `{ event_type: 'DIVIDEND', ex_date, amount, source: 'yahoo' }`
4. For each candidate: `db.corporateActionExists(ticker, event_type, ex_date)` → if true, skip
5. `db.createCorporateAction({ ticker, event_type, ex_date, ratio/amount, source: 'yahoo', status: 'proposed' })`

Throttle: **1.5s** between tickers (~12 min for 500 tickers).

Module-level `corporateActionsProposalState` (same `running/total/done/failed/skipped` shape as `bulkRunner`, `dailyPricesRunner`) for 409 overlap guard.

### 4b. New db helper `corporateActionExists(ticker, event_type, ex_date)` in `db.js`

```sql
SELECT 1 FROM corporate_actions
WHERE ticker = $1 AND event_type = $2 AND ex_date = $3
LIMIT 1
```

Returns `true` / `false`. Prevents duplicate proposals on repeated nightly runs.

### 4c. New cron endpoint in `index.js`

```
POST /api/cron/propose-corporate-actions
Header: x-cron-secret: <CRON_SECRET>

202: { started: true, tickers: N }
401: Unauthorized
409: Already running
```

Fire-and-forget, same pattern as `/api/cron/ingest-daily-prices`.

---

## 5. cron-job.org Configuration

Second cron job (after daily prices):

| Field | Value |
|---|---|
| URL | `https://<render-url>/api/cron/propose-corporate-actions` |
| Method | POST |
| Header | `x-cron-secret: <CRON_SECRET>` |
| Schedule | Daily **6:00 PM IST (12:30 UTC)** |
| Timezone | UTC |

Runs 1 hour after the daily prices cron (5 PM IST) to avoid overlap.

---

## 6. Error Handling

- Per-ticker Yahoo failures → logged + `failed++`, run continues
- `corporateActionExists` query fails → log + skip candidate (no blind inserts)
- `createCorporateAction` fails → log + `failed++`, continue
- Result date parse fails/stale → `null` stored (safe)

---

## 7. Testing

### New: `test/corporateActionsRunner.test.js`

| Test | What it verifies |
|---|---|
| `corporateActionExists` — unknown | Returns false |
| `corporateActionExists` — existing row | Returns true |
| `runCorporateActionsProposal` — happy path | Splits + dividends proposed into db |
| `runCorporateActionsProposal` — deduplication | Existing `(ticker, event_type, ex_date)` not re-inserted |
| `runCorporateActionsProposal` — Yahoo failure | Counted as failed, run continues |
| `runCorporateActionsProposal` — empty Yahoo result | Counted as done, nothing inserted |

### New: `test/screenerScraper.test.js` extension

- Add "Result date: 30 Jun 2025" row to fixture HTML → verify `parseTopRatios` returns correct `resultDate`

### New: pure unit tests for `parseResultDate`

| Test | Input → Output |
|---|---|
| Month-year only | `"Jun 2025"` → `"2025-06-01"` |
| Day-month-year | `"30 Jun 2025"` → `"2025-06-30"` |
| Stale (>5 days past) | old date → `null` |
| null/empty | `null` → `null` |
| "N/A" | → `null` |

---

## 8. What This Does NOT Include

- No UI changes to the admin panel (existing Corporate Actions panel already shows `proposed` queue)
- No BONUS, RIGHTS, MERGER, TICKER_CHANGE from Yahoo (Yahoo only provides splits + dividends)
- No NSE data source (deferred — Yahoo covers the most common corporate actions)
- Phase 9 Slice 4 (merger/demerger appliers) is separate
