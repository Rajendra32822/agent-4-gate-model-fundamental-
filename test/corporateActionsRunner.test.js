const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runCorporateActionsProposal } = require('../ingestion/corporateActionsRunner');

function makeFakeDb(opts = {}) {
  const created = [];
  return {
    created,
    corporateActionExists: async (ticker, eventType, exDate) =>
      (opts.existing || []).some(e =>
        e.ticker === ticker && e.event_type === eventType && e.ex_date === exDate
      ),
    createCorporateAction: async (row) => { created.push(row); return row; },
  };
}

const YAHOO_RESULT = {
  splits:    [{ date: '2024-06-15', ratio: '1:2' }],
  dividends: [{ date: '2024-03-10', amount: 5 }],
};

test('runCorporateActionsProposal: proposes splits and dividends as proposed', async () => {
  const db = makeFakeDb();
  const r = await runCorporateActionsProposal(['TCS'], db, {
    throttleMs: 0,
    fetchFn: async () => YAHOO_RESULT,
  });
  assert.equal(r.total, 1);
  assert.equal(r.done, 1);
  assert.equal(r.failed, 0);
  assert.equal(db.created.length, 2);
  assert.ok(db.created.find(c => c.event_type === 'SPLIT' && c.ratio === '1:2'));
  assert.ok(db.created.find(c => c.event_type === 'DIVIDEND' && c.amount === 5));
  assert.ok(db.created.every(c => c.status === 'proposed' && c.source === 'yahoo'));
});

test('runCorporateActionsProposal: skips already-existing (ticker, event_type, ex_date)', async () => {
  const db = makeFakeDb({
    existing: [{ ticker: 'TCS', event_type: 'SPLIT', ex_date: '2024-06-15' }],
  });
  const r = await runCorporateActionsProposal(['TCS'], db, {
    throttleMs: 0,
    fetchFn: async () => YAHOO_RESULT,
  });
  assert.equal(r.done, 1);
  assert.equal(db.created.length, 1);
  assert.equal(db.created[0].event_type, 'DIVIDEND');
});

test('runCorporateActionsProposal: Yahoo failure counts as failed, run continues', async () => {
  const db = makeFakeDb();
  const r = await runCorporateActionsProposal(['TCS', 'INFY'], db, {
    throttleMs: 0,
    fetchFn: async (ticker) => {
      if (ticker === 'TCS') throw new Error('Yahoo blocked');
      return { splits: [], dividends: [] };
    },
  });
  assert.equal(r.done, 1);
  assert.equal(r.failed, 1);
});

test('runCorporateActionsProposal: empty Yahoo result counts as done', async () => {
  const db = makeFakeDb();
  const r = await runCorporateActionsProposal(['TCS'], db, {
    throttleMs: 0,
    fetchFn: async () => ({ splits: [], dividends: [] }),
  });
  assert.equal(r.done, 1);
  assert.equal(r.failed, 0);
  assert.equal(db.created.length, 0);
});

test('runCorporateActionsProposal: empty ticker list completes cleanly', async () => {
  const db = makeFakeDb();
  const r = await runCorporateActionsProposal([], db, {
    throttleMs: 0,
    fetchFn: async () => ({ splits: [], dividends: [] }),
  });
  assert.equal(r.total, 0);
  assert.equal(r.done, 0);
});
