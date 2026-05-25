# Daily Prices Table — Design Spec
**Date:** 2026-05-25
**Phase:** Foundation (unblocks Phase 9 Slice 3 + Phase 10)
**Status:** Approved

---

## 1. Goal

Introduce a `daily_prices` table storing OHLCV + adjusted-close history per ticker. This is pure infrastructure — no UI surface. It unblocks:
- **Phase 9 Slice 3** — split/bonus price-history adjustment (needs a per-date price series to retroactively correct)
- **Phase 10** — RSI, MACD, moving-average overlays on fundamental verdicts (needs ≥200 days of history)

---

## 2. Database Schema

Migration file: `db_migrations/2026-05-25-daily-prices.sql`

```sql
CREATE TABLE IF NOT EXISTS daily_prices (
  ticker     TEXT    NOT NULL,
  date       DATE    NOT NULL,
  open       NUMERIC,
  high       NUMERIC,
  low        NUMERIC,
  close      NUMERIC,
  adj_close  NUMERIC,
  volume     BIGINT,
  source     TEXT DEFAULT 'yahoo',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_prices_ticker ON daily_prices (ticker);
CREATE INDEX IF NOT EXISTS idx_daily_prices_date   ON daily_prices (date DESC);
```

**Key decisions:**
- Primary key `(ticker, date)` — natural, upsert-safe; re-running cron never duplicates rows
- `volume BIGINT` — share counts exceed 2B for large-cap Indian stocks
- `adj_close` stored alongside `close` — Yahoo provides retroactive split/bonus adjustments; Phase 9 Slice 3 can choose which series to use
- Index on `date DESC` — makes "latest N rows for a ticker" fast for Phase 10 indicator computation

---

## 3. Data Source

**Yahoo Finance v8 chart endpoint** — already used in `priceCheck.js`.

URL pattern: `https://query1.finance.yahoo.com/v8/finance/chart/TICKER.NS?interval=1d&range=2y`

Exchange suffix fallback: try `.NS` (NSE) first, then `.BO` (BSE) — same as existing `toYahooSymbol` helper.

Response fields used:
- `chart.result[0].timestamp[]` → Unix timestamps → converted to `YYYY-MM-DD`
- `indicators.quote[0].open[]`, `.high[]`, `.low[]`, `.close[]`, `.volume[]`
- `indicators.adjclose[0].adjclose[]`

Rows where `close` is null are filtered out (Yahoo returns sparse rows for non-trading days).

---

## 4. New Code

### 4a. `priceCheck.js` — new export `fetchYahooDailyPrices`

```
fetchYahooDailyPrices(ticker, rangeDays = 730)
  → Promise<[{ date, open, high, low, close, adjClose, volume }]>
  → returns [] on failure (non-throwing)
```

- `rangeDays` → Yahoo range param: ≤365 → `1y`, ≤730 → `2y`, else `5y`
- Reuses `toYahooSymbol` and `httpsGetJson` already in the file
- Filters null `close` rows before returning

### 4b. `ingestion/dailyPricesRunner.js` — new file

```
runDailyPricesIngestion(db)
  → Promise<{ total, done, failed, skipped }>
```

Internal helpers:
- `rangeDaysFor(lastDate)` — null → 730 (full backfill); date < today → 7 (incremental); date = today → skip (0)
- Module-level `dailyPricesState` (mirrors `bulkState` in `bulkRunner.js`) for future admin observability

Behaviour per ticker:
1. Call `db.getLastPriceDate(ticker)` → `lastDate`
2. Compute `rangeDays = rangeDaysFor(lastDate)`; if 0 → `skipped++`, continue
3. Call `fetchYahooDailyPrices(ticker, rangeDays)`
4. Filter rows already in DB (date ≤ lastDate) — Yahoo's 7-day range overlaps by design; upsert handles duplicates anyway
5. Call `db.upsertDailyPrices(rows)`
6. Wait 1.2s (throttle)

Sequential processing — no parallelism — to stay within Yahoo's rate limits.
Estimated nightly runtime for 500 tickers: ~10 min.

### 4c. `db.js` — three new helpers

| Function | Query |
|---|---|
| `getLastPriceDate(ticker)` | `SELECT MAX(date) FROM daily_prices WHERE ticker = $1` |
| `upsertDailyPrices(rows)` | Bulk upsert into `daily_prices` with `onConflict: 'ticker,date'` |
| `getActiveTickersInUniverse()` | `SELECT ticker FROM companies WHERE is_active = true ORDER BY ticker` |

### 4d. `index.js` — new cron endpoint

```
POST /api/cron/ingest-daily-prices
Header: x-cron-secret: <CRON_SECRET>
```

- Validates secret (401 if missing/wrong)
- Guards against overlap: if `dailyPricesState.running` → 409
- Loads tickers via `getActiveTickersInUniverse()`
- Calls `runDailyPricesIngestion` fire-and-forget
- Responds immediately: `202 { started: true, tickers: N }`

---

## 5. cron-job.org Configuration

| Field | Value |
|---|---|
| URL | `https://<render-url>/api/cron/ingest-daily-prices` |
| Method | POST |
| Header | `x-cron-secret: <CRON_SECRET>` |
| Schedule | Daily at **5:00 PM IST (11:30 UTC)** |
| Timezone | Asia/Kolkata |

Market closes 3:30 PM IST — 1.5hr buffer before ingestion.

---

## 6. Error Handling

- Per-ticker failures logged + counted as `failed`; run continues (same pattern as `bulkRunner`)
- Yahoo null OHLCV rows silently filtered — not a failure
- Both `.NS` and `.BO` failing → ticker marked `failed`, skipped, retried on next nightly run
- No within-run retry — next nightly run naturally retries all failed tickers (their `lastDate` remains stale)

---

## 7. Testing

New test file `test/dailyPrices.test.js`:

| Test | What it verifies |
|---|---|
| `getLastPriceDate` — unknown ticker | Returns null |
| `getLastPriceDate` — known ticker | Returns ISO date string |
| `rangeDaysFor` — null | Returns 730 |
| `rangeDaysFor` — date < today | Returns 7 |
| `rangeDaysFor` — today | Returns 0 (skip) |
| `upsertDailyPrices` — idempotency | Same rows inserted twice → no duplicates |
| `fetchYahooDailyPrices` — happy path | Mocked `httpsGetJson`; verifies OHLCV + adj_close parsed correctly |
| `fetchYahooDailyPrices` — NS fallback to BO | First call throws, second (BO) succeeds |
| `fetchYahooDailyPrices` — null-row filtering | Rows with null close excluded from output |

No live Yahoo calls in tests — all external HTTP mocked.

---

## 8. What This Does NOT Include

- No UI surface (admin panel progress widget deferred — `dailyPricesState` is ready for it)
- No Phase 10 indicator computation (RSI/MACD/MAs built on top of this table in Phase 10)
- No Phase 9 Slice 3 price-history adjustment (uses this table, built separately)
- No intraday bars — EOD only
- No data-quality validation (e.g. high < low checks) — deferred
