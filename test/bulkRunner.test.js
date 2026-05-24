const test = require('node:test');
const assert = require('node:assert/strict');
const { runBulkIngestion, getBulkState } = require('../ingestion/bulkRunner');

function makeFakeDb() {
  const marks = [];
  return {
    marks,
    markIngested: async (ticker, status, error) => { marks.push({ ticker, status, error }); },
  };
}

test('runBulkIngestion: processes all tickers and marks ok', async () => {
  const db = makeFakeDb();
  const ingestFn = async (t) => ({ ticker: t, errors: [] });
  const r = await runBulkIngestion(['A', 'B', 'C'], db, { throttleMs: 0, ingestFn });
  assert.equal(r.total, 3);
  assert.equal(r.done, 3);
  assert.equal(r.failed, 0);
  assert.equal(r.running, false);
  assert.equal(db.marks.length, 3);
  assert.ok(db.marks.every(m => m.status === 'ok'));
});

test('runBulkIngestion: records failures without aborting', async () => {
  const db = makeFakeDb();
  const ingestFn = async (t) => {
    if (t === 'B') return { ticker: t, errors: [{ stage: 'fetch', error: 'boom' }] };
    return { ticker: t, errors: [] };
  };
  const r = await runBulkIngestion(['A', 'B', 'C'], db, { throttleMs: 0, ingestFn });
  assert.equal(r.done, 2);
  assert.equal(r.failed, 1);
  const bMark = db.marks.find(m => m.ticker === 'B');
  assert.equal(bMark.status, 'failed');
  assert.ok(bMark.error.includes('boom'));
});

test('runBulkIngestion: thrown error counts as failed', async () => {
  const db = makeFakeDb();
  const ingestFn = async (t) => { if (t === 'X') throw new Error('crash'); return { ticker: t, errors: [] }; };
  const r = await runBulkIngestion(['X', 'Y'], db, { throttleMs: 0, ingestFn });
  assert.equal(r.done, 1);
  assert.equal(r.failed, 1);
});

test('runBulkIngestion: empty list completes cleanly', async () => {
  const db = makeFakeDb();
  const r = await runBulkIngestion([], db, { throttleMs: 0, ingestFn: async () => ({ errors: [] }) });
  assert.equal(r.total, 0);
  assert.equal(r.running, false);
});

test('getBulkState returns a snapshot', async () => {
  const db = makeFakeDb();
  await runBulkIngestion(['A'], db, { throttleMs: 0, ingestFn: async () => ({ errors: [] }) });
  const s = getBulkState();
  assert.equal(s.total, 1);
  assert.equal(s.running, false);
  assert.ok(s.finishedAt);
});
