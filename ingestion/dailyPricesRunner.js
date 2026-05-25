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
