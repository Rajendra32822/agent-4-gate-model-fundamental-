# Phase 9 Slice 1 — Corporate Actions Ledger + Ticker Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A corporate-actions ledger + admin proposed→confirm/dismiss queue, with confirmed ticker/name changes cascading across all ticker-keyed tables (+ `ticker_history` audit + old-symbol redirect), plus best-effort auto-capture of proposals from the analysis.

**Architecture:** A pure `corporateActions.js` (parser, confirm-validation, ticker-chain resolution, the canonical ticker-keyed table list) holds the testable logic. `db.js` gets the ledger CRUD + an extended rename cascade + fail-safe `resolveTicker`/capture helpers. `index.js` exposes the ledger endpoints and wires capture + resolution in. Two UI pieces: an admin panel and a read-only list on AnalysisView. Fully additive and fail-safe (pre-migration, the new helpers no-op).

**Tech Stack:** Node.js (CommonJS), `node --test test/*.test.js` (Node 24), Supabase (PostgREST), React (CRA).

**Spec:** `docs/superpowers/specs/2026-05-25-phase9-corporate-actions-slice1-design.md`

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `db_migrations/2026-05-25-phase9-corporate-actions.sql` | Create | `corporate_actions` + `ticker_history` tables. |
| `corporateActions.js` | Create | Pure: `parseCorporateActionFromText`, `validateConfirm`, `resolveChain`, `TICKER_KEYED_TABLES`, `EVENT_TYPES`. |
| `test/corporateActions.test.js` | Create | Unit tests for the pure module. |
| `db.js` | Modify | Ledger CRUD; extend `renameTickerCascade`; `applyTickerChange`, `updateCompanyName`, `writeTickerHistory`, `resolveTicker`, `captureCorporateActionFromAnalysis`; wire `resolveTicker` into `getAnalysis`/`getCompanyBundle`. |
| `index.js` | Modify | Ledger endpoints; wire capture after `saveAnalysis`. |
| `client/src/components/admin/CorporateActionsPanel.js` | Create | Admin queue + add-action form. |
| `client/src/pages/AdminPanel.js` | Modify | Render the panel. |
| `client/src/pages/AnalysisView.js` | Modify | Read-only confirmed-actions list per ticker. |

---

## Task 1: Migration

**Files:** Create `db_migrations/2026-05-25-phase9-corporate-actions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 9 Slice 1 — corporate actions ledger + ticker history. Run once in Supabase.
CREATE TABLE IF NOT EXISTS corporate_actions (
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
  source            TEXT DEFAULT 'manual',
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_ticker ON corporate_actions (ticker);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_status ON corporate_actions (status);

CREATE TABLE IF NOT EXISTS ticker_history (
  id          BIGSERIAL PRIMARY KEY,
  old_ticker  TEXT NOT NULL,
  new_ticker  TEXT NOT NULL,
  change_date DATE,
  reason      TEXT,
  action_id   BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticker_history_old ON ticker_history (old_ticker);
```

- [ ] **Step 2: Commit**

```bash
git add db_migrations/2026-05-25-phase9-corporate-actions.sql
git commit -m "Add Phase 9 Slice 1 migration: corporate_actions + ticker_history"
```

---

## Task 2: Pure `corporateActions.js` module (TDD)

**Files:** Create `corporateActions.js`, `test/corporateActions.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/corporateActions.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseCorporateActionFromText, validateConfirm, resolveChain, TICKER_KEYED_TABLES } = require('../corporateActions');

test('parse: none/na/empty → null', () => {
  assert.equal(parseCorporateActionFromText('None found'), null);
  assert.equal(parseCorporateActionFromText('No corporate actions in the last 3 years'), null);
  assert.equal(parseCorporateActionFromText('N/A'), null);
  assert.equal(parseCorporateActionFromText(''), null);
  assert.equal(parseCorporateActionFromText(null), null);
});

test('parse: split/bonus with ratio', () => {
  assert.deepEqual(parseCorporateActionFromText('1:5 stock split, ex-date Mar 2024'), { event_type: 'SPLIT', ratio: '1:5' });
  assert.deepEqual(parseCorporateActionFromText('Bonus issue 1:1 announced'), { event_type: 'BONUS', ratio: '1:1' });
});

test('parse: demerger before merger; name/ticker changes', () => {
  assert.equal(parseCorporateActionFromText('Company underwent a demerger').event_type, 'DEMERGER');
  assert.equal(parseCorporateActionFromText('Merger with XYZ completed').event_type, 'MERGER');
  assert.equal(parseCorporateActionFromText('The company was renamed to ABC Ltd').event_type, 'NAME_CHANGE');
  assert.equal(parseCorporateActionFromText('Buyback of shares at ₹500').event_type, 'BUYBACK');
});

test('parse: unrecognized → null', () => {
  assert.equal(parseCorporateActionFromText('Strong quarterly results, no special items'), null);
});

test('validateConfirm enforces required fields per type', () => {
  assert.equal(validateConfirm({ event_type: 'TICKER_CHANGE' }).ok, false);
  assert.equal(validateConfirm({ event_type: 'TICKER_CHANGE', new_ticker: 'NEW' }).ok, true);
  assert.equal(validateConfirm({ event_type: 'NAME_CHANGE' }).ok, false);
  assert.equal(validateConfirm({ event_type: 'NAME_CHANGE', new_name: 'New Co' }).ok, true);
  assert.equal(validateConfirm({ event_type: 'SPLIT' }).ok, true);
});

test('resolveChain follows old→new and guards cycles', () => {
  assert.equal(resolveChain([], 'TCS'), 'TCS');
  assert.equal(resolveChain([{ old_ticker: 'OLD', new_ticker: 'NEW' }], 'OLD'), 'NEW');
  assert.equal(resolveChain([{ old_ticker: 'A', new_ticker: 'B' }, { old_ticker: 'B', new_ticker: 'C' }], 'A'), 'C');
  assert.equal(resolveChain([{ old_ticker: 'X', new_ticker: 'Y' }], 'Z'), 'Z'); // unmapped
  const cyc = resolveChain([{ old_ticker: 'A', new_ticker: 'B' }, { old_ticker: 'B', new_ticker: 'A' }], 'A');
  assert.ok(cyc === 'A' || cyc === 'B'); // terminates, no infinite loop
});

test('TICKER_KEYED_TABLES covers the critical user/analysis tables', () => {
  for (const t of ['analyses', 'portfolio_transactions', 'watchlist', 'company_ratios', 'corporate_actions']) {
    assert.ok(TICKER_KEYED_TABLES.includes(t), `missing ${t}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/corporateActions.test.js`
Expected: FAIL — `Cannot find module '../corporateActions'`.

- [ ] **Step 3: Create `corporateActions.js`**

```js
/**
 * Pure logic for the corporate-actions subsystem. No I/O.
 */

// Every table keyed by `ticker` that must move when a ticker changes.
const TICKER_KEYED_TABLES = [
  'companies', 'company_annual_pl', 'company_annual_bs', 'company_annual_cf',
  'company_quarterly_pl', 'company_derived_annual', 'company_derived_quarterly',
  'company_aggregates', 'company_shareholding', 'company_ratios',
  'analyses', 'fundamental_metrics', 'analysis_outcomes',
  'portfolio_transactions', 'watchlist', 'watches', 'virtual_trades', 'price_checks',
  'corporate_actions',
];

const EVENT_TYPES = ['SPLIT', 'BONUS', 'RIGHTS', 'BUYBACK', 'DIVIDEND', 'MERGER', 'DEMERGER', 'NAME_CHANGE', 'TICKER_CHANGE'];

// Best-effort parse of the analysis free-text `corporateActions` field → a proposed
// event, or null when nothing recognizable (so we never create junk rows).
function parseCorporateActionFromText(text) {
  if (text == null) return null;
  const raw = String(text);
  const t = raw.toLowerCase().trim();
  if (!t || /none found|no corporate action|not found|^n\/?a$|^none$/.test(t)) return null;
  const m = raw.match(/\b(\d+)\s*:\s*(\d+)\b/);
  const ratio = m ? `${m[1]}:${m[2]}` : null;
  let event_type = null;
  if (/demerg/.test(t)) event_type = 'DEMERGER';
  else if (/merg|amalgamat/.test(t)) event_type = 'MERGER';
  else if (/split/.test(t)) event_type = 'SPLIT';
  else if (/bonus/.test(t)) event_type = 'BONUS';
  else if (/rights\s+(issue|entitlement)|rights\b/.test(t)) event_type = 'RIGHTS';
  else if (/buy\s?back/.test(t)) event_type = 'BUYBACK';
  else if (/ticker change|symbol change|new symbol|symbol changed/.test(t)) event_type = 'TICKER_CHANGE';
  else if (/renamed|name change|name changed|changed its name/.test(t)) event_type = 'NAME_CHANGE';
  else if (/dividend/.test(t)) event_type = 'DIVIDEND';
  if (!event_type) return null;
  return { event_type, ratio };
}

// Required-field check before confirming/applying an action.
function validateConfirm(action) {
  if (!action) return { ok: false, error: 'action not found' };
  if (action.event_type === 'TICKER_CHANGE' && !action.new_ticker) {
    return { ok: false, error: 'TICKER_CHANGE requires new_ticker' };
  }
  if (action.event_type === 'NAME_CHANGE' && !action.new_name) {
    return { ok: false, error: 'NAME_CHANGE requires new_name' };
  }
  return { ok: true };
}

// Follow old→new through ticker_history rows to the latest symbol. Cycle-guarded.
function resolveChain(historyRows, ticker) {
  if (!ticker) return ticker;
  const byOld = {};
  for (const r of historyRows || []) {
    if (r && r.old_ticker) byOld[String(r.old_ticker).toUpperCase()] = String(r.new_ticker || '').toUpperCase();
  }
  let cur = String(ticker).toUpperCase();
  const seen = new Set([cur]);
  while (byOld[cur]) {
    const next = byOld[cur];
    if (!next || seen.has(next)) break;
    cur = next;
    seen.add(cur);
  }
  return cur;
}

module.exports = { TICKER_KEYED_TABLES, EVENT_TYPES, parseCorporateActionFromText, validateConfirm, resolveChain };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/corporateActions.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add corporateActions.js test/corporateActions.test.js
git commit -m "Add pure corporateActions module: parse/validate/resolveChain (Phase 9 Task 2)"
```

---

## Task 3: Ledger CRUD helpers in `db.js`

**Files:** Modify `db.js`

- [ ] **Step 1: Import the pure module at the top of `db.js`**

After the existing `const { SECTOR_SEED } = require('./sectorSeed');` line, add:
```js
const { TICKER_KEYED_TABLES, parseCorporateActionFromText, resolveChain } = require('./corporateActions');
```

- [ ] **Step 2: Add the CRUD helpers** (near `renameTickerCascade`)

```js
// ── Phase 9: corporate actions ledger ──
async function createCorporateAction(row) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const { data, error } = await db.from('corporate_actions')
    .insert({ ...row, ticker: String(row.ticker).toUpperCase(), updated_at: new Date().toISOString() })
    .select().maybeSingle();
  if (error) return { error: error.message };
  return { action: data };
}

async function getCorporateAction(id) {
  const db = getAdminClient();
  if (!db) return null;
  const { data, error } = await db.from('corporate_actions').select('*').eq('id', id).maybeSingle();
  if (error) return null;
  return data;
}

async function listCorporateActions(ticker, status) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    let q = db.from('corporate_actions').select('*').eq('ticker', String(ticker).toUpperCase());
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listCorporateActions error:', err.message);
    return [];
  }
}

async function listCorporateActionsByStatus(status) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('corporate_actions').select('*')
      .eq('status', status).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listCorporateActionsByStatus error:', err.message);
    return [];
  }
}

async function updateCorporateAction(id, patch) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const allowed = ['event_type', 'ratio', 'ex_date', 'announcement_date', 'record_date',
                   'new_ticker', 'new_name', 'linked_ticker', 'amount', 'notes'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  clean.updated_at = new Date().toISOString();
  const { data, error } = await db.from('corporate_actions').update(clean).eq('id', id).select().maybeSingle();
  if (error) return { error: error.message };
  return { action: data };
}

async function setCorporateActionStatus(id, status, extra = {}) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const { data, error } = await db.from('corporate_actions')
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', id).select().maybeSingle();
  if (error) return { error: error.message };
  return { action: data };
}
```

- [ ] **Step 3: Verify the module loads**

Run: `node -e "const db=require('./db'); console.log(['createCorporateAction','getCorporateAction','listCorporateActions','listCorporateActionsByStatus','updateCorporateAction','setCorporateActionStatus'].filter(k=>typeof db[k]==='function').length + ' helpers')"`
Expected: `6 helpers` (after Step 4's export edit — do Step 4 first if this prints 0).

- [ ] **Step 4: Add to `db.js` `module.exports`**

In the exports object, add a line:
```js
  // Phase 9: corporate actions
  createCorporateAction, getCorporateAction, listCorporateActions, listCorporateActionsByStatus,
  updateCorporateAction, setCorporateActionStatus,
```

- [ ] **Step 5: Verify + full suite**

Run: `node -e "require('./db')" && node --test test/*.test.js 2>&1 | grep -E "^(ℹ (tests|pass|fail))"`
Expected: loads OK; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add db.js
git commit -m "Add corporate_actions CRUD db helpers (Phase 9 Task 3)"
```

---

## Task 4: Cascade, resolution, and capture helpers in `db.js`

**Files:** Modify `db.js`

- [ ] **Step 1: Replace `renameTickerCascade`'s hardcoded table list with the canonical set**

Find:
```js
  const tables = [
    'companies', 'company_annual_pl', 'company_annual_bs', 'company_annual_cf',
    'company_quarterly_pl', 'company_derived_annual', 'company_derived_quarterly',
    'company_aggregates', 'company_shareholding',
  ];
```
Replace with:
```js
  const tables = TICKER_KEYED_TABLES;
```

- [ ] **Step 2: Add the cascade/resolution/capture helpers** (after `renameTickerCascade`)

```js
async function writeTickerHistory(oldTicker, newTicker, reason, actionId, changeDate) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const { error } = await db.from('ticker_history').insert({
    old_ticker: String(oldTicker).toUpperCase(),
    new_ticker: String(newTicker).toUpperCase(),
    change_date: changeDate || new Date().toISOString().split('T')[0],
    reason: reason || null,
    action_id: actionId || null,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

async function applyTickerChange(oldTicker, newTicker, actionId, changeDate) {
  const cascade = await renameTickerCascade(oldTicker, newTicker);
  const hist = await writeTickerHistory(oldTicker, newTicker, 'TICKER_CHANGE', actionId, changeDate);
  return { ...cascade, ticker_history: hist };
}

async function updateCompanyName(ticker, newName) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const { error } = await db.from('companies')
    .update({ company_name: newName, updated_at: new Date().toISOString() })
    .eq('ticker', String(ticker).toUpperCase());
  if (error) return { error: error.message };
  return { ok: true };
}

// Redirect an old symbol to its current one. Fail-safe: any error → return input.
async function resolveTicker(ticker) {
  try {
    const db = getAdminClient();
    if (!db || !ticker) return ticker;
    const { data, error } = await db.from('ticker_history').select('old_ticker, new_ticker');
    if (error || !data || !data.length) return ticker;
    return resolveChain(data, ticker);
  } catch {
    return ticker;
  }
}

// Best-effort: drop a PROPOSED row from an analysis's corporateActions text.
// Fail-safe + deduped. Never mutates anything.
async function captureCorporateActionFromAnalysis(analysis) {
  try {
    const parsed = parseCorporateActionFromText(analysis?.corporateActions);
    if (!parsed) return { skipped: 'no action' };
    const db = getAdminClient();
    if (!db || !analysis?.ticker) return { skipped: 'no db/ticker' };
    const ticker = String(analysis.ticker).toUpperCase();
    const { data: existing } = await db.from('corporate_actions').select('id')
      .eq('ticker', ticker).eq('event_type', parsed.event_type)
      .in('status', ['proposed', 'confirmed']).limit(1);
    if (existing && existing.length) return { skipped: 'duplicate' };
    const { error } = await db.from('corporate_actions').insert({
      ticker, event_type: parsed.event_type, ratio: parsed.ratio,
      status: 'proposed', source: 'analysis',
      notes: String(analysis.corporateActions).slice(0, 500),
    });
    if (error) return { error: error.message };
    return { proposed: parsed.event_type };
  } catch (e) {
    return { error: e.message };
  }
}
```

- [ ] **Step 3: Export the new helpers**

Add to `db.js` `module.exports` (in the Phase 9 group):
```js
  applyTickerChange, writeTickerHistory, updateCompanyName, resolveTicker, captureCorporateActionFromAnalysis,
```

- [ ] **Step 4: Verify + full suite**

Run: `node -e "require('./db'); console.log('ok')" && node --test test/*.test.js 2>&1 | grep -E "^(ℹ (tests|pass|fail))"`
Expected: `ok`; all tests PASS (existing tests unaffected — new helpers aren't called by them).

- [ ] **Step 5: Commit**

```bash
git add db.js
git commit -m "Add ticker-change cascade, resolveTicker, and analysis capture helpers (Phase 9 Task 4)"
```

---

## Task 5: Wire `resolveTicker` into reads

**Files:** Modify `db.js` (`getAnalysis`, `getCompanyBundle`)

- [ ] **Step 1: Resolve in `getAnalysis`**

In `getAnalysis(ticker)`, immediately after `if (!db) return null;`, add a resolution line and use it. Change the function start:
```js
async function getAnalysis(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return null;
```
to:
```js
async function getAnalysis(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    ticker = await resolveTicker(ticker);
```
(All subsequent uses of `ticker` in the function now use the resolved symbol.)

- [ ] **Step 2: Resolve in `getCompanyBundle`**

In `getCompanyBundle(ticker)`, change the start:
```js
async function getCompanyBundle(ticker) {
  const db = getAdminClient();
  if (!db) return null;
  const T = ticker.toUpperCase();
```
to:
```js
async function getCompanyBundle(ticker) {
  const db = getAdminClient();
  if (!db) return null;
  const T = (await resolveTicker(ticker)).toUpperCase();
```

- [ ] **Step 3: Verify + full suite**

Run: `node -e "require('./db'); console.log('ok')" && node --test test/*.test.js 2>&1 | grep -E "^(ℹ (tests|pass|fail))"`
Expected: `ok`; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add db.js
git commit -m "Redirect old tickers via resolveTicker in getAnalysis/getCompanyBundle (Phase 9 Task 5)"
```

---

## Task 6: API endpoints + capture wiring

**Files:** Modify `index.js`

- [ ] **Step 1: Import the new db helpers + pure validators**

Add to the `require('./db')` destructure (in a Phase 9 group):
```js
  createCorporateAction, getCorporateAction, listCorporateActions, listCorporateActionsByStatus,
  updateCorporateAction, setCorporateActionStatus, applyTickerChange, updateCompanyName,
  captureCorporateActionFromAnalysis,
```
Add a new require near the other module requires (after the ranking require):
```js
const { validateConfirm, EVENT_TYPES } = require('./corporateActions');
```

- [ ] **Step 2: Wire capture after `saveAnalysis`**

In the `/api/analyse` route, after the existing line:
```js
      saveFundamentalMetrics(result.analysis).catch(e => console.error('Metrics save error:', e.message));
```
add:
```js
      captureCorporateActionFromAnalysis(result.analysis).catch(e => console.error('Corp-action capture error:', e.message));
```

- [ ] **Step 3: Add the endpoints** (after the admin sector endpoints block)

```js
// ─── Phase 9: corporate actions ───────────────────────────────────────────────
app.get('/api/corporate-actions/:ticker', requireAuth, async (req, res) => {
  res.json(await listCorporateActions(req.params.ticker, 'confirmed'));
});

app.get('/api/admin/corporate-actions', requireAdmin, async (req, res) => {
  const status = req.query.status || 'proposed';
  res.json(await listCorporateActionsByStatus(status));
});

app.post('/api/admin/corporate-actions', requireAdmin, async (req, res) => {
  const { ticker, event_type } = req.body || {};
  if (!ticker || !event_type) return res.status(400).json({ error: 'ticker and event_type required' });
  if (!EVENT_TYPES.includes(event_type)) return res.status(400).json({ error: 'invalid event_type' });
  const result = await createCorporateAction({ ...req.body, status: 'proposed', source: 'manual' });
  if (result.error) return res.status(500).json(result);
  res.json(result);
});

app.put('/api/admin/corporate-actions/:id', requireAdmin, async (req, res) => {
  const existing = await getCorporateAction(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.status !== 'proposed') return res.status(400).json({ error: 'can only edit proposed actions' });
  const result = await updateCorporateAction(req.params.id, req.body || {});
  if (result.error) return res.status(500).json(result);
  res.json(result);
});

app.post('/api/admin/corporate-actions/:id/confirm', requireAdmin, async (req, res) => {
  const action = await getCorporateAction(req.params.id);
  if (!action) return res.status(404).json({ error: 'not found' });
  if (action.status !== 'proposed') return res.status(400).json({ error: `already ${action.status}` });
  const v = validateConfirm(action);
  if (!v.ok) return res.status(400).json({ error: v.error });

  let applied = null;
  if (action.event_type === 'TICKER_CHANGE') {
    applied = await applyTickerChange(action.ticker, action.new_ticker, action.id, action.ex_date);
  } else if (action.event_type === 'NAME_CHANGE') {
    applied = await updateCompanyName(action.ticker, action.new_name);
  }
  await setCorporateActionStatus(req.params.id, 'confirmed', { applied_at: new Date().toISOString() });
  res.json({ confirmed: true, applied });
});

app.post('/api/admin/corporate-actions/:id/dismiss', requireAdmin, async (req, res) => {
  const result = await setCorporateActionStatus(req.params.id, 'dismissed');
  if (result.error) return res.status(500).json(result);
  res.json({ dismissed: true });
});
```

- [ ] **Step 4: Verify + full suite**

Run: `node --check index.js && node --test test/*.test.js 2>&1 | grep -E "^(ℹ (tests|pass|fail))"`
Expected: no syntax error; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add index.js
git commit -m "Add corporate-actions endpoints + analysis capture wiring (Phase 9 Task 6)"
```

---

## Task 7: Frontend — admin panel + AnalysisView list

**Files:** Create `client/src/components/admin/CorporateActionsPanel.js`; Modify `client/src/pages/AdminPanel.js`, `client/src/pages/AnalysisView.js`

- [ ] **Step 1: Create the admin panel**

Create `client/src/components/admin/CorporateActionsPanel.js`:

```jsx
import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

const EVENT_TYPES = ['SPLIT', 'BONUS', 'RIGHTS', 'BUYBACK', 'DIVIDEND', 'MERGER', 'DEMERGER', 'NAME_CHANGE', 'TICKER_CHANGE'];
const blank = { ticker: '', event_type: 'SPLIT', ratio: '', new_ticker: '', new_name: '', ex_date: '', notes: '' };

export default function CorporateActionsPanel() {
  const [queue, setQueue] = useState([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await authFetch('/api/admin/corporate-actions?status=proposed');
      setQueue(await res.json());
    } catch (e) { setMsg(`Load failed: ${e.message}`); }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.ticker) { setMsg('ticker required'); return; }
    setBusy(true); setMsg('');
    try {
      const body = { ...form, ticker: form.ticker.toUpperCase() };
      const res = await authFetch('/api/admin/corporate-actions', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'failed'); }
      setForm(blank); setMsg('Added'); await load();
    } catch (e) { setMsg(`Add failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  const editRow = (id, field, value) => setQueue(q => q.map(r => r.id === id ? { ...r, [field]: value } : r));

  const saveRow = async (row) => {
    await authFetch(`/api/admin/corporate-actions/${row.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ratio: row.ratio, new_ticker: row.new_ticker, new_name: row.new_name, notes: row.notes }),
    });
    setMsg(`Saved #${row.id}`);
  };

  const confirm = async (row) => {
    if (!window.confirm(`Confirm ${row.event_type} for ${row.ticker}? ${row.event_type === 'TICKER_CHANGE' ? 'This renames the ticker everywhere.' : ''}`)) return;
    const res = await authFetch(`/api/admin/corporate-actions/${row.id}/confirm`, { method: 'POST' });
    const data = await res.json();
    setMsg(res.ok ? `Confirmed #${row.id}` : `Confirm failed: ${data.error}`);
    await load();
  };

  const dismiss = async (row) => {
    await authFetch(`/api/admin/corporate-actions/${row.id}/dismiss`, { method: 'POST' });
    setMsg(`Dismissed #${row.id}`); await load();
  };

  const cell = { padding: '4px 6px', borderBottom: '1px solid var(--border)', fontSize: 12 };
  const inp = { background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', width: 90 };

  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, marginTop: 0 }}>Corporate Actions — Proposed Queue</h2>
      {msg && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <input placeholder="TICKER" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value })} style={inp} />
        <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} style={inp}>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="ratio 1:5" value={form.ratio} onChange={e => setForm({ ...form, ratio: e.target.value })} style={inp} />
        <input placeholder="new_ticker" value={form.new_ticker} onChange={e => setForm({ ...form, new_ticker: e.target.value })} style={inp} />
        <input placeholder="new_name" value={form.new_name} onChange={e => setForm({ ...form, new_name: e.target.value })} style={{ ...inp, width: 130 }} />
        <input placeholder="ex_date" type="date" value={form.ex_date} onChange={e => setForm({ ...form, ex_date: e.target.value })} style={inp} />
        <button className="btn" disabled={busy} onClick={add}>+ Add</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-3)' }}>
            <th style={cell}>Ticker</th><th style={cell}>Type</th><th style={cell}>Ratio</th>
            <th style={cell}>New ticker</th><th style={cell}>New name</th><th style={cell}>Src</th><th style={cell}></th>
          </tr></thead>
          <tbody>
            {queue.map(r => (
              <tr key={r.id}>
                <td style={cell}>{r.ticker}</td>
                <td style={cell}>{r.event_type}</td>
                <td style={cell}><input value={r.ratio ?? ''} onChange={e => editRow(r.id, 'ratio', e.target.value)} style={{ ...inp, width: 60 }} /></td>
                <td style={cell}><input value={r.new_ticker ?? ''} onChange={e => editRow(r.id, 'new_ticker', e.target.value)} style={{ ...inp, width: 80 }} /></td>
                <td style={cell}><input value={r.new_name ?? ''} onChange={e => editRow(r.id, 'new_name', e.target.value)} style={{ ...inp, width: 110 }} /></td>
                <td style={cell}>{r.source}</td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                  <button className="btn" onClick={() => saveRow(r)}>Save</button>{' '}
                  <button className="btn" onClick={() => confirm(r)}>Confirm</button>{' '}
                  <button className="btn" onClick={() => dismiss(r)}>Dismiss</button>
                </td>
              </tr>
            ))}
            {queue.length === 0 && <tr><td style={cell} colSpan={7}>No proposed actions.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it in `AdminPanel.js`**

Add the import after the SectorBenchmarksPanel import:
```js
import CorporateActionsPanel from '../components/admin/CorporateActionsPanel';
```
Render it right after `<SectorBenchmarksPanel />`:
```jsx
        <CorporateActionsPanel />
```

- [ ] **Step 3: Add a read-only list to `AnalysisView.js`**

Near the top of the AnalysisView component body (with the other hooks), add state + fetch:
```js
  const [corpActions, setCorpActions] = useState([]);
  useEffect(() => {
    if (!analysis?.ticker) return;
    authFetch(`/api/corporate-actions/${analysis.ticker}`)
      .then(r => r.json()).then(d => setCorpActions(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [analysis?.ticker]);
```
(Ensure `useState`, `useEffect` are imported from React and `authFetch` from `../lib/api` — add to existing imports if missing.)

Then render a compact block where appropriate in the JSX (e.g. near the gate3 valuation section):
```jsx
          {corpActions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="section-label">Corporate Actions</div>
              <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-3)' }}>
                {corpActions.map(a => (
                  <li key={a.id}>
                    <b>{a.event_type}</b>{a.ratio ? ` ${a.ratio}` : ''}{a.ex_date ? ` · ex ${a.ex_date}` : ''}
                    {a.new_ticker ? ` → ${a.new_ticker}` : ''}{a.new_name ? ` → ${a.new_name}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
```

- [ ] **Step 4: Verify JSX balance**

Read the modified regions of `AnalysisView.js` and `AdminPanel.js` to confirm tags are balanced and imports resolve. (No local CRA build — Render builds on deploy; a JSX error fails the build without affecting the running site.)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/admin/CorporateActionsPanel.js client/src/pages/AdminPanel.js client/src/pages/AnalysisView.js
git commit -m "Add corporate-actions admin panel + per-ticker list on AnalysisView (Phase 9 Task 7)"
```

---

## Task 8: Push & post-deploy validation

- [ ] **Step 1: Push + confirm suite**

```bash
git push origin main
node --test test/*.test.js
```
Expected: all tests PASS.

- [ ] **Step 2: Manual post-deploy (per spec §10)**

- Run the migration in Supabase (`db_migrations/2026-05-25-phase9-corporate-actions.sql`).
- Admin → **Corporate Actions** panel: add a `TICKER_CHANGE` (ticker=OLD, new_ticker=NEW) → Confirm → confirm the cascade result lists updated tables; check `ticker_history` has the row; open the OLD ticker's analysis URL and confirm it resolves to NEW's data.
- Add a `NAME_CHANGE` → Confirm → company name updates.
- Add a `SPLIT` → Confirm → status flips to confirmed, no other mutation.
- Run a standard analysis on a stock whose `corporateActions` mentions a split → a `proposed` row appears in the queue (source=analysis); re-run → no duplicate.
- Open a stock with a confirmed action in AnalysisView → the Corporate Actions list shows it.

---

## Self-Review Notes

- **Spec coverage:** §3 tables → T1; §4 lifecycle/confirm → T6 (confirm endpoint) + T2 (validateConfirm); §5 cascade/resolve → T4 + T5 + T2 (TICKER_KEYED_TABLES/resolveChain); §6 capture → T2 (parse) + T4 (capture) + T6 (wiring); §7 endpoints → T6, helpers → T3/T4, frontend → T7; §8 testing → T2 + T8; §9 rollout → task order; §10 acceptance → T8 Step 2.
- **Placeholder scan:** every code step is complete.
- **Type consistency:** `parseCorporateActionFromText→{event_type,ratio}|null`, `validateConfirm(action)→{ok,error}`, `resolveChain(rows,ticker)→string`, `TICKER_KEYED_TABLES` (array) — defined in T2, consumed in T3/T4/T6. `applyTickerChange(old,new,actionId,changeDate)`, `createCorporateAction(row)→{action|error}`, `setCorporateActionStatus(id,status,extra)` consistent across T4/T6. Endpoint bodies match `updateCorporateAction`'s allowed fields.
- **Backward-compat:** `resolveTicker`/`captureCorporateActionFromAnalysis` are try/catch fail-safe → pre-migration they return input / no-op; existing tests don't call the new helpers, so the suite is unaffected until the new pure-module tests (which don't touch I/O).
