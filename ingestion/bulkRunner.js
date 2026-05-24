/**
 * Bulk ingestion runner. Processes a list of tickers sequentially with a
 * throttle, recording per-ticker status. Designed to run in the background
 * (fire-and-forget from an HTTP handler).
 *
 * Module-level `bulkState` lets the coverage dashboard observe live progress.
 */

const { ingestCompany } = require('./orchestrator');

const bulkState = {
  running: false,
  total: 0,
  done: 0,
  failed: 0,
  current: null,
  startedAt: null,
  finishedAt: null,
};

function getBulkState() {
  return { ...bulkState };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * @param tickers  array of ticker symbols
 * @param db       db helpers object (needs upsert* + markIngested)
 * @param opts     { throttleMs = 2500, ingestFn = ingestCompany }
 */
async function runBulkIngestion(tickers, db, opts = {}) {
  const throttleMs = opts.throttleMs ?? 2500;
  const ingestFn   = opts.ingestFn   || ingestCompany;

  bulkState.running = true;
  bulkState.total = tickers.length;
  bulkState.done = 0;
  bulkState.failed = 0;
  bulkState.startedAt = new Date().toISOString();
  bulkState.finishedAt = null;

  for (const ticker of tickers) {
    bulkState.current = ticker;
    try {
      const result = await ingestFn(ticker, db);
      const ok = !result.errors || result.errors.length === 0;
      if (db.markIngested) {
        await db.markIngested(ticker, ok ? 'ok' : 'failed',
          ok ? null : JSON.stringify(result.errors).slice(0, 500));
      }
      if (ok) bulkState.done += 1;
      else    bulkState.failed += 1;
    } catch (e) {
      bulkState.failed += 1;
      if (db.markIngested) {
        await db.markIngested(ticker, 'failed', String(e.message).slice(0, 500));
      }
    }
    if (throttleMs > 0) await sleep(throttleMs);
  }

  bulkState.current = null;
  bulkState.running = false;
  bulkState.finishedAt = new Date().toISOString();
  return getBulkState();
}

module.exports = { runBulkIngestion, getBulkState, bulkState };
