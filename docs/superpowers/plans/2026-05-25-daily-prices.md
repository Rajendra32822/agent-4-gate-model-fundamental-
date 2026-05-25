# Daily Prices Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `daily_prices` OHLCV table, Yahoo fetcher, nightly ingestion runner, and cron endpoint that unblocks Phase 9 Slice 3 and Phase 10 technical analysis.

**Architecture:** New `daily_prices` table with `(ticker, date)` PK; `fetchYahooDailyPrices` extends the existing `priceCheck.js` with an injectable HTTP getter for testability; `ingestion/dailyPricesRunner.js` mirrors the `bulkRunner.js` pattern exactly (tickers + db + opts, fire-and-forget state); new `/api/cron/ingest-daily-prices` endpoint auto-detects backfill vs incremental per ticker via `MAX(date)`.

**Tech Stack:** Node.js, Supabase/PostgreSQL, Yahoo Finance v8 chart API (already wired in priceCheck.js)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `db_migrations/2026-05-25-daily-prices.sql` | Create | Schema for `daily_prices` table |
| `priceCheck.js` | Modify | Add `fetchYahooDailyPrices` |
| `ingestion/dailyPricesRunner.js` | Create | `rangeDaysFor`, `runDailyPricesIngestion`, `getDailyPricesState` |
| `db.js` | Modify | Add `getLastPriceDate`, `upsertDailyPrices`, `getActiveTickersInUniverse` |
| `index.js` | Modify | Add `/api/cron/ingest-daily-prices` endpoint |
| `test/dailyPrices.test.js` | Create | All tests for new code |

---

### Task 1: Migration SQL

**Files:**
- Create: `db_migrations/2026-05-25-daily-prices.sql`

- [ ] **Step 1: Write the migration file**

Create `db_migrations/2026-05-25-daily-prices.sql` with this exact content:

```sql
-- Daily OHLCV price history per ticker.
-- Run once in Supabase SQL editor before deploying.

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

- [ ] **Step 2: Commit**

```bash
git add db_migrations/2026-05-25-daily-prices.sql
git commit -m "feat: add daily_prices migration (OHLCV table)"
```

---

### Task 2: `fetchYahooDailyPrices` in priceCheck.js (TDD)

**Files:**
- Create: `test/dailyPrices.test.js`
- Modify: `priceCheck.js` (add function after `fetchYahooCorporateActions`, around line 134)

The function accepts an optional `_httpGet` parameter (defaults to the module-internal `httpsGetJson`) so tests can inject a mock without needing to export the HTTP client.

- [ ] **Step 1: Create test file with failing tests**

Create `test/dailyPrices.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchYahooDailyPrices } = require('../priceCheck');

function makeChartJson(timestamps, opens, highs, lows, closes, volumes, adjcloses) {
  return {
    chart: {
      result: [{
        timestamp: timestamps,
        indicators: {
          quote: [{ open: opens, high: highs, low: lows, close: closes, volume: volumes }],
          adjclose: [{ adjclose: adjcloses }],
        },
      }],
    },
  };
}

test('fetchYahooDailyPrices: parses OHLCV + adj_close from Yahoo response', async () => {
  const mockHttp = async () => ({
    status: 200,
    json: makeChartJson(
      [1609459200, 1609545600],
      [100, 102], [105, 107], [99, 101], [103, 106],
      [1000000, 900000], [102.5, 105.8]
    ),
  });
  const rows = await fetchYahooDailyPrices('TCS', 730, mockHttp);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2021-01-01');
  assert.equal(rows[0].open, 100);
  assert.equal(rows[0].high, 105);
  assert.equal(rows[0].low, 99);
  assert.equal(rows[0].close, 103);
  assert.equal(rows[0].adjClose, 102.5);
  assert.equal(rows[0].volume, 1000000);
});

test('fetchYahooDailyPrices: filters out rows where close is null', async () => {
  const mockHttp = async () => ({
    status: 200,
    json: makeChartJson(
      [1609459200, 1609545600],
      [100, 102], [105, 107], [99, 101], [103, null],
      [1000000, 900000], [102.5, null]
    ),
  });
  const rows = await fetchYahooDailyPrices('TCS', 730, mockHttp);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].close, 103);
});

test('fetchYahooDailyPrices: falls back from .NS to .BO when first call throws', async () => {
  let callCount = 0;
  const mockHttp = async () => {
    callCount++;
    if (callCount === 1) throw new Error('NS blocked');
    return {
      status: 200,
      json: makeChartJson([1609459200], [100], [105], [99], [103], [1000000], [102.5]),
    };
  };
  const rows = await fetchYahooDailyPrices('TCS', 730, mockHttp);
  assert.equal(rows.length, 1);
  assert.equal(callCount, 2);
});

test('fetchYahooDailyPrices: returns [] when both exchanges fail', async () => {
  const mockHttp = async () => { throw new Error('blocked'); };
  const rows = await fetchYahooDailyPrices('TCS', 730, mockHttp);
  assert.deepEqual(rows, []);
});

test('fetchYahooDailyPrices: maps rangeDays to Yahoo range param correctly', async () => {
  const urls = [];
  const mockHttp = async (url) => {
    urls.push(url);
    return { status: 200, json: makeChartJson([1609459200], [100], [105], [99], [103], [1000000], [102.5]) };
  };
  await fetchYahooDailyPrices('TCS', 365, mockHttp);
  await fetchYahooDailyPrices('TCS', 730, mockHttp);
  await fetchYahooDailyPrices('TCS', 1800, mockHttp);
  assert.ok(urls[0].includes('range=1y'), `expected range=1y in ${urls[0]}`);
  assert.ok(urls[1].includes('range=2y'), `expected range=2y in ${urls[1]}`);
  assert.ok(urls[2].includes('range=5y'), `expected range=5y in ${urls[2]}`);
});
```

- [ ] **Step 2: Run — confirm tests fail**

```
node --test test/dailyPrices.test.js
```

Expected: FAIL — `fetchYahooDailyPrices is not a function`

- [ ] **Step 3: Implement `fetchYahooDailyPrices` in priceCheck.js**

In `priceCheck.js`, add this function after `fetchYahooCorporateActions` (after line ~134, before the format helpers):

```js
/**
 * Fetch daily OHLCV + adjusted-close history for a ticker from Yahoo Finance.
 * Returns: [{ date, open, high, low, close, adjClose, volume }, ...]
 * Returns [] on failure — non-throwing; caller decides whether to skip or retry.
 *
 * @param {number} rangeDays  ≤365 → 1y, ≤730 → 2y, else 5y
 * @param {Function} _httpGet injectable for tests; defaults to httpsGetJson
 */
async function fetchYahooDailyPrices(ticker, rangeDays = 730, _httpGet = httpsGetJson) {
  const range = rangeDays <= 365 ? '1y' : rangeDays <= 730 ? '2y' : '5y';
  for (const ex of ['NS', 'BO']) {
    const symbol = toYahooSymbol(ticker, ex);
    try {
      const { status, json } = await _httpGet(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`
      );
      if (status !== 200) continue;
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const timestamps  = result.timestamp || [];
      const quote       = result.indicators?.quote?.[0] || {};
      const adjCloseArr = result.indicators?.adjclose?.[0]?.adjclose || [];
      const rows = [];
      for (let i = 0; i < timestamps.length; i++) {
        const close = quote.close?.[i];
        if (close == null) continue;
        rows.push({
          date:     new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open:     quote.open?.[i]   ?? null,
          high:     quote.high?.[i]   ?? null,
          low:      quote.low?.[i]    ?? null,
          close,
          adjClose: adjCloseArr[i]    ?? null,
          volume:   quote.volume?.[i] ?? null,
        });
      }
      if (rows.length > 0) return rows;
    } catch { /* try next exchange */ }
  }
  return [];
}
```

Then add `fetchYahooDailyPrices` to the `module.exports` at the bottom of `priceCheck.js`:

```js
module.exports = {
  fetchYahooPrice, fetchYahooQuote, fetchYahooCorporateActions, fetchYahooDailyPrices,
  formatInrPrice, formatInrCrore,
  extractWatchFromAnalysis, runDailyPriceCheck, parseEntryZone, parsePrice,
};
```

- [ ] **Step 4: Run — confirm tests pass**

```
node --test test/dailyPrices.test.js
```

Expected: 5 PASS

- [ ] **Step 5: Run full suite — confirm no regressions**

```
node --test test/*.test.js
```

Expected: 163 pass (158 + 5), 0 fail

- [ ] **Step 6: Commit**

```bash
git add priceCheck.js test/dailyPrices.test.js
git commit -m "feat: add fetchYahooDailyPrices to priceCheck.js (TDD)"
```

---

### Task 3: `rangeDaysFor` helper + db helpers (TDD)

**Files:**
- Create: `ingestion/dailyPricesRunner.js` (skeleton — runner added in Task 4)
- Modify: `db.js` (add 3 helpers + update exports)
- Modify: `test/dailyPrices.test.js` (append `rangeDaysFor` tests)

- [ ] **Step 1: Append `rangeDaysFor` tests to `test/dailyPrices.test.js`**

Append to the bottom of `test/dailyPrices.test.js`:

```js
const { rangeDaysFor } = require('../ingestion/dailyPricesRunner');

test('rangeDaysFor: null → 730 (full 2-year backfill)', () => {
  assert.equal(rangeDaysFor(null), 730);
});

test('rangeDaysFor: undefined → 730', () => {
  assert.equal(rangeDaysFor(undefined), 730);
});

test('rangeDaysFor: date before today → 7 (incremental)', () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(rangeDaysFor(yesterday.toISOString().split('T')[0]), 7);
});

test('rangeDaysFor: today → 0 (skip, already up to date)', () => {
  const today = new Date().toISOString().split('T')[0];
  assert.equal(rangeDaysFor(today), 0);
});
```

- [ ] **Step 2: Run — confirm new tests fail**

```
node --test test/dailyPrices.test.js
```

Expected: 5 pass, 4 fail — `Cannot find module '../ingestion/dailyPricesRunner'`

- [ ] **Step 3: Create `ingestion/dailyPricesRunner.js`**

Create `ingestion/dailyPricesRunner.js`:

```js
const { fetchYahooDailyPrices } = require('../priceCheck');

const dailyPricesState = {
  running:    false,
  total:      0,
  done:       0,
  failed:     0,
  skipped:    0,
  current:    null,
  startedAt:  null,
  finishedAt: null,
};

function getDailyPricesState() {
  return { ...dailyPricesState };
}

/**
 * Maps the last known price date to a Yahoo fetch window.
 * null/undefined → 730  (full 2-year backfill)
 * date < today   → 7   (incremental — covers weekends/gaps)
 * date = today   → 0   (skip — already up to date)
 */
function rangeDaysFor(lastDate) {
  if (!lastDate) return 730;
  const last  = new Date(lastDate);
  const today = new Date();
  last.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  if (last >= today) return 0;
  return 7;
}

module.exports = { rangeDaysFor, getDailyPricesState };
```

- [ ] **Step 4: Run — confirm `rangeDaysFor` tests pass**

```
node --test test/dailyPrices.test.js
```

Expected: 9 pass, 0 fail

- [ ] **Step 5: Add three db helpers to `db.js`**

In `db.js`, find the line that starts `// Phase 9: corporate actions` near the bottom (around line 1200). Insert the following new section immediately before `module.exports`:

```js
// ─── Daily prices ─────────────────────────────────────────────────────────────

async function getLastPriceDate(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db
      .from('daily_prices')
      .select('date')
      .eq('ticker', ticker.toUpperCase())
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.date ?? null;
  } catch (err) {
    console.error('getLastPriceDate error:', err.message);
    return null;
  }
}

async function upsertDailyPrices(rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from('daily_prices').upsert(
      rows.map(r => ({
        ticker:     r.ticker.toUpperCase(),
        date:       r.date,
        open:       r.open,
        high:       r.high,
        low:        r.low,
        close:      r.close,
        adj_close:  r.adjClose,
        volume:     r.volume,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: 'ticker,date' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertDailyPrices error:', err.message);
    return false;
  }
}

async function getActiveTickersInUniverse() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db
      .from('companies')
      .select('ticker')
      .eq('is_active', true)
      .order('ticker');
    if (error) throw error;
    return (data || []).map(r => r.ticker);
  } catch (err) {
    console.error('getActiveTickersInUniverse error:', err.message);
    return [];
  }
}
```

Then in `module.exports` at the very bottom of `db.js`, add a new line after the Phase 9 exports:

```js
  // Daily prices
  getLastPriceDate, upsertDailyPrices, getActiveTickersInUniverse,
```

- [ ] **Step 6: Run full suite — confirm no regressions**

```
node --test test/*.test.js
```

Expected: 167 pass (158 + 5 fetcher + 4 rangeDaysFor), 0 fail

- [ ] **Step 7: Commit**

```bash
git add ingestion/dailyPricesRunner.js db.js test/dailyPrices.test.js
git commit -m "feat: add rangeDaysFor helper and daily_prices db helpers"
```

---

### Task 4: `runDailyPricesIngestion` (TDD)

**Files:**
- Modify: `ingestion/dailyPricesRunner.js` (add runner + `sleep`)
- Modify: `test/dailyPrices.test.js` (append runner tests)

- [ ] **Step 1: Append runner tests to `test/dailyPrices.test.js`**

Append to the bottom of `test/dailyPrices.test.js`:

```js
const { runDailyPricesIngestion } = require('../ingestion/dailyPricesRunner');

function makeFakeDb(opts = {}) {
  const upserted = [];
  return {
    upserted,
    getLastPriceDate:  async (ticker) => (opts.lastDates || {})[ticker] ?? null,
    upsertDailyPrices: async (rows)   => { upserted.push(...rows); return true; },
  };
}

const SAMPLE_ROW = {
  date: '2021-01-01', open: 100, high: 105, low: 99,
  close: 103, adjClose: 102.5, volume: 1000000,
};

test('runDailyPricesIngestion: processes all tickers and returns counts', async () => {
  const db = makeFakeDb();
  const r = await runDailyPricesIngestion(['TCS', 'INFY'], db, {
    throttleMs: 0,
    fetchFn: async () => [SAMPLE_ROW],
  });
  assert.equal(r.total, 2);
  assert.equal(r.done, 2);
  assert.equal(r.failed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(db.upserted.length, 2);
  assert.equal(db.upserted[0].ticker, 'TCS');
});

test('runDailyPricesIngestion: skips ticker already up to date', async () => {
  const today = new Date().toISOString().split('T')[0];
  const db = makeFakeDb({ lastDates: { TCS: today } });
  const r = await runDailyPricesIngestion(['TCS', 'INFY'], db, {
    throttleMs: 0,
    fetchFn: async () => [SAMPLE_ROW],
  });
  assert.equal(r.done, 1);
  assert.equal(r.skipped, 1);
});

test('runDailyPricesIngestion: fetch failure counts as failed, run continues', async () => {
  const db = makeFakeDb();
  const r = await runDailyPricesIngestion(['TCS', 'INFY'], db, {
    throttleMs: 0,
    fetchFn: async (ticker) => {
      if (ticker === 'TCS') throw new Error('Yahoo blocked');
      return [SAMPLE_ROW];
    },
  });
  assert.equal(r.done, 1);
  assert.equal(r.failed, 1);
});

test('runDailyPricesIngestion: empty rows from fetch counts as done (not failed)', async () => {
  const db = makeFakeDb();
  const r = await runDailyPricesIngestion(['TCS'], db, {
    throttleMs: 0,
    fetchFn: async () => [],
  });
  assert.equal(r.done, 1);
  assert.equal(r.failed, 0);
  assert.equal(db.upserted.length, 0);
});

test('runDailyPricesIngestion: empty ticker list completes cleanly', async () => {
  const db = makeFakeDb();
  const r = await runDailyPricesIngestion([], db, {
    throttleMs: 0,
    fetchFn: async () => [],
  });
  assert.equal(r.total, 0);
  assert.equal(r.done, 0);
});
```

- [ ] **Step 2: Run — confirm new tests fail**

```
node --test test/dailyPrices.test.js
```

Expected: 9 pass, 5 fail — `runDailyPricesIngestion is not a function`

- [ ] **Step 3: Add `sleep` and `runDailyPricesIngestion` to `ingestion/dailyPricesRunner.js`**

In `ingestion/dailyPricesRunner.js`, add the following before `module.exports`. Then replace the `module.exports` line at the bottom:

```js
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fetches daily OHLCV prices for all tickers and upserts into daily_prices.
 * Per ticker: no rows → 2-year backfill; has rows → 7-day incremental; today → skip.
 *
 * @param {string[]} tickers  array of ticker symbols
 * @param {object}   db       { getLastPriceDate, upsertDailyPrices }
 * @param {object}   opts     { throttleMs=1200, fetchFn=fetchYahooDailyPrices }
 */
async function runDailyPricesIngestion(tickers, db, opts = {}) {
  const throttleMs = opts.throttleMs ?? 1200;
  const fetchFn    = opts.fetchFn    || fetchYahooDailyPrices;

  dailyPricesState.running    = true;
  dailyPricesState.total      = tickers.length;
  dailyPricesState.done       = 0;
  dailyPricesState.failed     = 0;
  dailyPricesState.skipped    = 0;
  dailyPricesState.startedAt  = new Date().toISOString();
  dailyPricesState.finishedAt = null;

  for (const ticker of tickers) {
    dailyPricesState.current = ticker;
    try {
      const lastDate  = await db.getLastPriceDate(ticker);
      const rangeDays = rangeDaysFor(lastDate);
      if (rangeDays === 0) {
        dailyPricesState.skipped++;
        continue;
      }
      const rows = await fetchFn(ticker, rangeDays);
      if (rows.length > 0) {
        await db.upsertDailyPrices(rows.map(r => ({ ...r, ticker })));
      }
      dailyPricesState.done++;
    } catch (err) {
      console.error(`[dailyPrices] ${ticker}: ${err.message}`);
      dailyPricesState.failed++;
    }
    await sleep(throttleMs);
  }

  dailyPricesState.running    = false;
  dailyPricesState.finishedAt = new Date().toISOString();

  return {
    total:   dailyPricesState.total,
    done:    dailyPricesState.done,
    failed:  dailyPricesState.failed,
    skipped: dailyPricesState.skipped,
  };
}

module.exports = { rangeDaysFor, getDailyPricesState, runDailyPricesIngestion };
```

- [ ] **Step 4: Run — confirm all tests pass**

```
node --test test/dailyPrices.test.js
```

Expected: 14 pass, 0 fail

- [ ] **Step 5: Run full suite — confirm no regressions**

```
node --test test/*.test.js
```

Expected: 172 pass (158 + 14), 0 fail

- [ ] **Step 6: Commit**

```bash
git add ingestion/dailyPricesRunner.js test/dailyPrices.test.js
git commit -m "feat: add runDailyPricesIngestion to dailyPricesRunner.js (TDD)"
```

---

### Task 5: Cron endpoint in index.js

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Add imports at the top of index.js**

In `index.js`, find the existing destructured require from `'./db'` (around line 1). Add `getLastPriceDate`, `upsertDailyPrices`, and `getActiveTickersInUniverse` to it. For example, locate this line:

```js
const { ..., applyTickerChange, writeTickerHistory, updateCompanyName, resolveTicker, captureCorporateActionFromAnalysis,
```

Add the three new helpers to the same destructure (or on the next line if it keeps things readable):

```js
  getLastPriceDate, upsertDailyPrices, getActiveTickersInUniverse,
```

Then, alongside the existing ingestion runner imports (near line 43), add:

```js
const { runDailyPricesIngestion, getDailyPricesState } = require('./ingestion/dailyPricesRunner');
```

- [ ] **Step 2: Add the cron endpoint**

In `index.js`, find the `/api/cron/ingest-universe` endpoint (around line 870). Add the new endpoint immediately after it:

```js
app.post('/api/cron/ingest-daily-prices', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (getDailyPricesState().running) {
    return res.status(409).json({ error: 'Already running' });
  }
  const tickers = await getActiveTickersInUniverse();
  runDailyPricesIngestion(tickers, { getLastPriceDate, upsertDailyPrices })
    .catch(e => console.error('[cron] daily prices error:', e.message));
  res.status(202).json({ started: true, tickers: tickers.length });
});
```

- [ ] **Step 3: Run full test suite — confirm no regressions**

```
node --test test/*.test.js
```

Expected: 172 pass, 0 fail

- [ ] **Step 4: Commit and push**

```bash
git add index.js
git commit -m "feat: add /api/cron/ingest-daily-prices endpoint"
git push
```

Render deploys in ~3-5 min.

---

## Post-deploy checklist

- [ ] Run `db_migrations/2026-05-25-daily-prices.sql` in Supabase SQL editor
- [ ] Add cron job on cron-job.org:
  - URL: `https://<render-url>/api/cron/ingest-daily-prices`
  - Method: POST
  - Header: `x-cron-secret: <your CRON_SECRET>`
  - Schedule: Daily at 5:00 PM IST (11:30 UTC)
  - Timezone: Asia/Kolkata
- [ ] Test manually: `curl -X POST https://<render-url>/api/cron/ingest-daily-prices -H "x-cron-secret: <secret>"`
- [ ] Verify 202 `{ started: true, tickers: N }` response
- [ ] After ~15 min, check Supabase `daily_prices` table has rows populating
