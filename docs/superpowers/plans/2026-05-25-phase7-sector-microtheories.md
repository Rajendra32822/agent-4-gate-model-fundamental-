# Phase 7 — Sector Microtheories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Marshall quality gate sector-aware — per-sector ROCE/ROE benchmarks (banks on ROE, IT on ROCE 30, etc.) applied in both rankings and the AI analysis, editable in an admin panel.

**Architecture:** Extend the existing `sectors` table with a `primary_metric` column and seed 20 NSE industries. `ranking.js` gains pure `toSectorMap` + `resolveQualityGate` and takes a `sectorBenchmarks` map (undefined → fallback ROCE 15, so nothing breaks pre-seed). `runMarshallAnalysis` injects the company's sector benchmark into the prompt. Admin GET/PUT/seed endpoints + a Sector Benchmarks panel drive editing.

**Tech Stack:** Node.js (CommonJS), `node --test test/*.test.js` (Node 24 — the bare `node --test test/` form fails), Supabase (PostgREST), React (CRA).

**Spec:** `docs/superpowers/specs/2026-05-25-phase7-sector-microtheories-design.md`

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `db_migrations/2026-05-25-phase7-sector-microtheories.sql` | Create | `ALTER TABLE sectors ADD COLUMN primary_metric`. |
| `sectorSeed.js` | Create | Pure data: `SECTOR_SEED` (20 rows). No deps → unit-testable. |
| `test/sectorSeed.test.js` | Create | Validate the seed (20 rows, valid metrics, financials→roe). |
| `ranking.js` | Modify | Add+export `toSectorMap`, `resolveQualityGate`; thread `sectorBenchmarks` through `scoreRow`/`rankUniverse`; sector-aware Marshall strategies. |
| `test/ranking.test.js` | Modify | Sector-aware + empty-map regression tests. |
| `db.js` | Modify | `listSectors`, `updateSector`, `seedSectors` (uses `SECTOR_SEED`). |
| `index.js` | Modify | `/api/rankings/:strategy` passes the map; admin GET/PUT/seed sector endpoints. |
| `agent.js` | Modify | Inject the company's sector-benchmark block into the analysis prompt. |
| `client/src/components/admin/SectorBenchmarksPanel.js` | Create | Editable sector table (GET/PUT/seed). |
| `client/src/pages/AdminPanel.js` | Modify | Render the panel. |

---

## Task 1: Migration

**Files:** Create `db_migrations/2026-05-25-phase7-sector-microtheories.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 7 — sector microtheories. Run once in Supabase SQL editor before deploy.
-- The sectors table already exists (phase5). Add the primary-gate-metric column.
ALTER TABLE sectors ADD COLUMN IF NOT EXISTS primary_metric TEXT DEFAULT 'roce'
  CHECK (primary_metric IN ('roce','roe'));

-- Seed rows are loaded by the app's seedSectors() (admin "Seed defaults" button),
-- not here, so benchmarks stay tunable without re-running migrations.
```

- [ ] **Step 2: Commit**

```bash
git add db_migrations/2026-05-25-phase7-sector-microtheories.sql
git commit -m "Add Phase 7 migration: sectors.primary_metric column"
```

---

## Task 2: Sector seed data (pure, TDD)

**Files:** Create `sectorSeed.js`, `test/sectorSeed.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/sectorSeed.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { SECTOR_SEED } = require('../sectorSeed');

test('seed has all 20 NSE industries', () => {
  assert.equal(SECTOR_SEED.length, 20);
  const sectors = SECTOR_SEED.map(r => r.sector);
  assert.ok(sectors.includes('Information Technology'));
  assert.ok(sectors.includes('Financial Services'));
  assert.ok(sectors.includes('Capital Goods'));
  assert.equal(new Set(sectors).size, 20, 'sector names must be unique');
});

test('every row is well-formed', () => {
  for (const r of SECTOR_SEED) {
    assert.ok(r.sector, 'sector required');
    assert.ok(['roce', 'roe'].includes(r.primary_metric), `${r.sector} bad primary_metric`);
    assert.ok(typeof r.roe_benchmark === 'number' && r.roe_benchmark >= 0, `${r.sector} bad roe_benchmark`);
    if (r.primary_metric === 'roce') {
      assert.ok(typeof r.roce_benchmark === 'number' && r.roce_benchmark >= 0, `${r.sector} roce primary needs roce_benchmark`);
    }
  }
});

test('financials/realty/construction gate on ROE', () => {
  const byName = Object.fromEntries(SECTOR_SEED.map(r => [r.sector, r]));
  assert.equal(byName['Financial Services'].primary_metric, 'roe');
  assert.equal(byName['Realty'].primary_metric, 'roe');
  assert.equal(byName['Construction'].primary_metric, 'roe');
  assert.equal(byName['Information Technology'].primary_metric, 'roce');
  assert.equal(byName['Information Technology'].roce_benchmark, 30);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sectorSeed.test.js`
Expected: FAIL — `Cannot find module '../sectorSeed'`.

- [ ] **Step 3: Create `sectorSeed.js`**

```js
/**
 * Phase 7 sector microtheory seed — per-NSE-industry Marshall quality benchmarks.
 * Pure data, no deps. Loaded into the `sectors` table by db.seedSectors().
 * primary_metric = which return metric is the quality gate for the sector.
 * roce_benchmark is null where ROCE doesn't apply (financials/asset-heavy).
 */
const SECTOR_SEED = [
  { sector: 'Information Technology',          primary_metric: 'roce', roce_benchmark: 30, roe_benchmark: 20, notes: 'asset-light, high returns' },
  { sector: 'Fast Moving Consumer Goods',      primary_metric: 'roce', roce_benchmark: 25, roe_benchmark: 20, notes: 'brand moats' },
  { sector: 'Consumer Durables',               primary_metric: 'roce', roce_benchmark: 18, roe_benchmark: 18, notes: 'brands + mfg' },
  { sector: 'Healthcare',                      primary_metric: 'roce', roce_benchmark: 20, roe_benchmark: 18, notes: 'pharma/hospitals' },
  { sector: 'Consumer Services',               primary_metric: 'roce', roce_benchmark: 18, roe_benchmark: 18, notes: 'retail/QSR/hospitality' },
  { sector: 'Services',                        primary_metric: 'roce', roce_benchmark: 18, roe_benchmark: 18, notes: 'asset-light' },
  { sector: 'Chemicals',                       primary_metric: 'roce', roce_benchmark: 18, roe_benchmark: 16, notes: 'specialty/commodity mix' },
  { sector: 'Capital Goods',                   primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: 'manufacturing baseline' },
  { sector: 'Automobile and Auto Components',  primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: 'capital-intensive mfg' },
  { sector: 'Construction Materials',          primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: 'cement etc.' },
  { sector: 'Media Entertainment & Publication', primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: '' },
  { sector: 'Diversified',                     primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: 'default' },
  { sector: 'Textiles',                        primary_metric: 'roce', roce_benchmark: 12, roe_benchmark: 12, notes: 'low-margin mfg' },
  { sector: 'Metals & Mining',                 primary_metric: 'roce', roce_benchmark: 12, roe_benchmark: 12, notes: 'cyclical commodity' },
  { sector: 'Oil Gas & Consumable Fuels',      primary_metric: 'roce', roce_benchmark: 12, roe_benchmark: 12, notes: 'capital-heavy, cyclical' },
  { sector: 'Power',                           primary_metric: 'roce', roce_benchmark: 12, roe_benchmark: 12, notes: 'regulated, capital-heavy' },
  { sector: 'Telecommunication',               primary_metric: 'roce', roce_benchmark: 10, roe_benchmark: 10, notes: 'very capital-intensive' },
  { sector: 'Financial Services',              primary_metric: 'roe',  roce_benchmark: null, roe_benchmark: 15, notes: 'banks/NBFCs — ROCE N/A' },
  { sector: 'Construction',                    primary_metric: 'roe',  roce_benchmark: null, roe_benchmark: 15, notes: 'EPC, asset/WC-heavy' },
  { sector: 'Realty',                          primary_metric: 'roe',  roce_benchmark: null, roe_benchmark: 12, notes: 'lumpy, asset-heavy' },
];

module.exports = { SECTOR_SEED };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/sectorSeed.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add sectorSeed.js test/sectorSeed.test.js
git commit -m "Add 20-industry sector benchmark seed (Phase 7 Task 2)"
```

---

## Task 3: Sector-aware ranking (pure, TDD)

**Files:** Modify `ranking.js`, `test/ranking.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/ranking.test.js` (after the existing tests; `test`, `assert`, `scoreRow`, `rankUniverse` are already imported at the top):

```js
const { toSectorMap, resolveQualityGate } = require('../ranking');

const SECTORS = toSectorMap([
  { sector: 'Information Technology', primary_metric: 'roce', roce_benchmark: 30, roe_benchmark: 20 },
  { sector: 'Financial Services',     primary_metric: 'roe',  roce_benchmark: null, roe_benchmark: 15 },
]);

test('toSectorMap keys rows by sector', () => {
  assert.equal(SECTORS['Information Technology'].roce_benchmark, 30);
  assert.equal(SECTORS['Financial Services'].primary_metric, 'roe');
});

test('resolveQualityGate uses ROE for roe-primary sectors', () => {
  const g = resolveQualityGate({ sector: 'Financial Services', roe_5y_avg: 18, roce_5y_avg: 4 }, SECTORS);
  assert.equal(g.metric, 'ROE');
  assert.equal(g.value, 18);
  assert.equal(g.benchmark, 15);
});

test('resolveQualityGate uses ROCE at the sector threshold', () => {
  const g = resolveQualityGate({ sector: 'Information Technology', roce_5y_avg: 28 }, SECTORS);
  assert.equal(g.metric, 'ROCE');
  assert.equal(g.benchmark, 30);
});

test('resolveQualityGate falls back to ROCE 15 for unknown/missing sector', () => {
  assert.equal(resolveQualityGate({ sector: 'Nonexistent', roce_5y_avg: 20 }, SECTORS).benchmark, 15);
  assert.equal(resolveQualityGate({ sector: 'X', roce_5y_avg: 20 }, undefined).benchmark, 15);
});

test('IT name needs ROCE 30 under sector benchmarks', () => {
  const itLow  = { sector: 'Information Technology', roce_5y_avg: 25, debt_to_equity: 0.1, pat_cagr_5y_pct: 10, pe: 20, revenue_cagr_5y_pct: 12 };
  const itHigh = { sector: 'Information Technology', roce_5y_avg: 32, debt_to_equity: 0.1, pat_cagr_5y_pct: 10, pe: 20, revenue_cagr_5y_pct: 12 };
  assert.equal(scoreRow('marshall_undervalued', itLow,  SECTORS).passes, false); // 25 < 30
  assert.equal(scoreRow('marshall_undervalued', itHigh, SECTORS).passes, true);  // 32 >= 30
});

test('bank passes quality_compounders on ROE, not ROCE', () => {
  // ROCE is tiny (meaningless) but ROE clears 15 → should pass on ROE
  const bank = { sector: 'Financial Services', roce_5y_avg: 3, roe_5y_avg: 18, revenue_cagr_5y_pct: 14, pat_cagr_5y_pct: 16, debt_to_equity: 0 };
  const res = scoreRow('quality_compounders', bank, SECTORS);
  assert.equal(res.passes, true);
  assert.match(res.reasons[0], /ROE 18%/);
});

test('empty/undefined sector map reproduces flat ROCE-15 behavior', () => {
  const r = { sector: 'Anything', roce_5y_avg: 14, debt_to_equity: 0.1, pat_cagr_5y_pct: 10, pe: 20, revenue_cagr_5y_pct: 12 };
  assert.equal(scoreRow('marshall_undervalued', r).passes, false);          // 14 < 15
  assert.equal(scoreRow('marshall_undervalued', { ...r, roce_5y_avg: 16 }).passes, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ranking.test.js`
Expected: FAIL — `toSectorMap is not a function`.

- [ ] **Step 3: Add helpers to `ranking.js`**

After the `const num = ...` line near the top, add:

```js
// Build a { [sector]: benchmarkRow } lookup from sector rows.
function toSectorMap(rows) {
  const map = {};
  for (const r of rows || []) {
    if (r && r.sector) map[r.sector] = r;
  }
  return map;
}

// Pick the quality gate for a row's sector. ROE-primary sectors (banks, realty,
// construction) gate on ROE; everyone else on ROCE at their sector threshold.
// Unknown/missing sector → ROCE at the ontology default (15).
function resolveQualityGate(row, sectorBenchmarks) {
  const s = sectorBenchmarks?.[row.sector];
  if (s && s.primary_metric === 'roe') {
    return { metric: 'ROE', value: num(row.roe_5y_avg), benchmark: s.roe_benchmark };
  }
  return { metric: 'ROCE', value: num(row.roce_5y_avg), benchmark: s?.roce_benchmark ?? ontology.benchmark('roce') };
}
```

- [ ] **Step 4: Update the two Marshall strategies to use the resolved gate**

In `ranking.js`, replace the `marshall_undervalued` `score` function body:

```js
    score(r) {
      const roce = num(r.roce_5y_avg), de = num(r.debt_to_equity);
      const patCagr = num(r.pat_cagr_5y_pct), pe = num(r.pe);
      const revCagr = num(r.revenue_cagr_5y_pct) ?? 0;
      const reasons = [];
      const roceMin = ontology.benchmark('roce');
      if (roce == null || roce < roceMin) return fail(`ROCE 5y < ${roceMin}%`);
      if (de == null || de > 0.5)    return fail('Debt/Equity > 0.5');
      if (patCagr == null || patCagr <= 0) return fail('PAT not growing');
      if (pe == null || pe <= 0 || pe > 35) return fail('P/E out of range (0-35]');
      reasons.push(`ROCE ${roce}%`, `D/E ${de}`, `P/E ${pe}`, `Rev CAGR ${revCagr}%`);
      return ok(((roce + revCagr) / pe), reasons);
    },
```
with:
```js
    score(r, sectorBenchmarks) {
      const gate = resolveQualityGate(r, sectorBenchmarks);
      const de = num(r.debt_to_equity);
      const patCagr = num(r.pat_cagr_5y_pct), pe = num(r.pe);
      const revCagr = num(r.revenue_cagr_5y_pct) ?? 0;
      if (gate.value == null || gate.value < gate.benchmark) return fail(`${gate.metric} 5y < ${gate.benchmark}%`);
      if (de == null || de > 0.5)    return fail('Debt/Equity > 0.5');
      if (patCagr == null || patCagr <= 0) return fail('PAT not growing');
      if (pe == null || pe <= 0 || pe > 35) return fail('P/E out of range (0-35]');
      const reasons = [`${gate.metric} ${gate.value}%`, `D/E ${de}`, `P/E ${pe}`, `Rev CAGR ${revCagr}%`];
      return ok(((gate.value + revCagr) / pe), reasons);
    },
```

Replace the `quality_compounders` `score` function body:

```js
    score(r) {
      const roce = num(r.roce_5y_avg);
      const roceMin = ontology.benchmark('roce');
      if (roce == null || roce < roceMin) return fail(`ROCE 5y < ${roceMin}%`);
      const revCagr = num(r.revenue_cagr_5y_pct) ?? 0;
      const patCagr = num(r.pat_cagr_5y_pct) ?? 0;
      const de = num(r.debt_to_equity) ?? 0;
      const s = roce * 0.5 + revCagr * 0.3 + patCagr * 0.3 - de * 5;
      return ok(s, [`ROCE ${roce}%`, `Rev CAGR ${revCagr}%`, `PAT CAGR ${patCagr}%`]);
    },
```
with:
```js
    score(r, sectorBenchmarks) {
      const gate = resolveQualityGate(r, sectorBenchmarks);
      if (gate.value == null || gate.value < gate.benchmark) return fail(`${gate.metric} 5y < ${gate.benchmark}%`);
      const revCagr = num(r.revenue_cagr_5y_pct) ?? 0;
      const patCagr = num(r.pat_cagr_5y_pct) ?? 0;
      const de = num(r.debt_to_equity) ?? 0;
      const s = gate.value * 0.5 + revCagr * 0.3 + patCagr * 0.3 - de * 5;
      return ok(s, [`${gate.metric} ${gate.value}%`, `Rev CAGR ${revCagr}%`, `PAT CAGR ${patCagr}%`]);
    },
```

(`deep_value` and `high_growth` are unchanged — JS ignores the extra `sectorBenchmarks` arg passed to them.)

- [ ] **Step 5: Thread the map through `scoreRow` and `rankUniverse`, and export helpers**

Replace:
```js
function scoreRow(strategyKey, row) {
  const strat = STRATEGIES[strategyKey];
  if (!strat) return { passes: false, score: 0, reasons: ['unknown strategy'] };
  return strat.score(row);
}

function rankUniverse(strategyKey, rows, limit = 20) {
  const strat = STRATEGIES[strategyKey];
  if (!strat || !Array.isArray(rows)) return [];
  const scored = [];
  for (const r of rows) {
    const res = strat.score(r);
    if (res.passes) scored.push({ ...r, score: res.score, reasons: res.reasons });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}
```
with:
```js
function scoreRow(strategyKey, row, sectorBenchmarks) {
  const strat = STRATEGIES[strategyKey];
  if (!strat) return { passes: false, score: 0, reasons: ['unknown strategy'] };
  return strat.score(row, sectorBenchmarks);
}

function rankUniverse(strategyKey, rows, sectorBenchmarks = {}, limit = 20) {
  const strat = STRATEGIES[strategyKey];
  if (!strat || !Array.isArray(rows)) return [];
  const scored = [];
  for (const r of rows) {
    const res = strat.score(r, sectorBenchmarks);
    if (res.passes) scored.push({ ...r, score: res.score, reasons: res.reasons });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}
```

Update the exports line:
```js
module.exports = { scoreRow, rankUniverse, STRATEGY_LIST, STRATEGIES };
```
to:
```js
module.exports = { scoreRow, rankUniverse, STRATEGY_LIST, STRATEGIES, toSectorMap, resolveQualityGate };
```

- [ ] **Step 6: Run the full suite**

Run: `node --test test/*.test.js`
Expected: PASS — new ranking tests pass; **all existing ranking tests still pass** (2-arg calls → `sectorBenchmarks={}` → fallback ROCE 15, identical to before).

- [ ] **Step 7: Commit**

```bash
git add ranking.js test/ranking.test.js
git commit -m "Make ranking sector-aware (ROE for financials, per-sector ROCE) (Phase 7 Task 3)"
```

---

## Task 4: DB helpers for sectors

**Files:** Modify `db.js`

- [ ] **Step 1: Add the helpers**

In `db.js`, add near `listCompanies` (and `require` the seed at the top of the file: `const { SECTOR_SEED } = require('./sectorSeed');`):

```js
async function listSectors() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('sectors')
      .select('sector, primary_metric, roce_benchmark, roe_benchmark, notes')
      .order('sector', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listSectors error:', err.message);
    return [];
  }
}

async function updateSector(sector, patch) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const allowed = ['primary_metric', 'roce_benchmark', 'roe_benchmark', 'notes'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  clean.updated_at = new Date().toISOString();
  const { data, error } = await db.from('sectors').update(clean).eq('sector', sector).select().maybeSingle();
  if (error) return { error: error.message };
  return { sector: data };
}

async function seedSectors() {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const rows = SECTOR_SEED.map(r => ({ ...r, updated_at: new Date().toISOString() }));
  const { error } = await db.from('sectors').upsert(rows, { onConflict: 'sector' });
  if (error) return { error: error.message };
  return { seeded: rows.length };
}
```

Add all three to `db.js`'s `module.exports`.

- [ ] **Step 2: Verify the module loads**

Run: `node -e "const db=require('./db'); console.log(['listSectors','updateSector','seedSectors'].filter(k=>typeof db[k]==='function').join(','));"`
Expected: `listSectors,updateSector,seedSectors`

- [ ] **Step 3: Run the full suite (no regressions)**

Run: `node --test test/*.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add db.js
git commit -m "Add listSectors/updateSector/seedSectors db helpers (Phase 7 Task 4)"
```

---

## Task 5: Wire rankings + admin sector endpoints

**Files:** Modify `index.js`

- [ ] **Step 1: Import the new helpers and ranking utilities**

In `index.js`, add `listSectors, updateSector, seedSectors` to the `require('./db')` destructure, and add `toSectorMap` to the `require('./ranking')` destructure:

```js
const { rankUniverse, STRATEGY_LIST, toSectorMap } = require('./ranking');
```

- [ ] **Step 2: Pass the sector map into ranking**

Replace:
```js
    const dataset = await getRankingDataset();
    const results = rankUniverse(req.params.strategy, dataset, limit);
```
with:
```js
    const dataset = await getRankingDataset();
    const sectorMap = toSectorMap(await listSectors());
    const results = rankUniverse(req.params.strategy, dataset, sectorMap, limit);
```

- [ ] **Step 3: Add the admin sector endpoints**

After the `/api/rankings/:strategy` route, add:

```js
// ─── Phase 7: sector microtheory benchmarks (admin) ───────────────────────────
app.get('/api/admin/sectors', requireAdmin, async (req, res) => {
  res.json(await listSectors());
});

app.put('/api/admin/sectors/:sector', requireAdmin, async (req, res) => {
  const { primary_metric, roce_benchmark, roe_benchmark, notes } = req.body || {};
  if (primary_metric != null && !['roce', 'roe'].includes(primary_metric)) {
    return res.status(400).json({ error: "primary_metric must be 'roce' or 'roe'" });
  }
  for (const [k, v] of [['roce_benchmark', roce_benchmark], ['roe_benchmark', roe_benchmark]]) {
    if (v != null && (typeof v !== 'number' || v < 0 || !isFinite(v))) {
      return res.status(400).json({ error: `${k} must be a number >= 0` });
    }
  }
  const result = await updateSector(req.params.sector, { primary_metric, roce_benchmark, roe_benchmark, notes });
  if (result.error) return res.status(500).json(result);
  res.json(result);
});

app.post('/api/admin/sectors/seed', requireAdmin, async (req, res) => {
  const result = await seedSectors();
  if (result.error) return res.status(500).json(result);
  res.json(result);
});
```

- [ ] **Step 4: Verify + full suite**

Run: `node --check index.js && node --test test/*.test.js`
Expected: no syntax error; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add index.js
git commit -m "Wire sector map into rankings + add admin sector endpoints (Phase 7 Task 5)"
```

---

## Task 6: Inject sector benchmark into the AI analysis

**Files:** Modify `agent.js`

- [ ] **Step 1: Add a sector-block builder near `buildLiveMarketBlock`**

```js
// Build an authoritative sector-benchmark block for the prompt. Returns null if
// the company has no classified sector or no matching benchmark row.
function buildSectorBenchmarkBlock(companyName, sector, sectorRow) {
  if (!sector || !sectorRow) return null;
  const roe = sectorRow.primary_metric === 'roe';
  const metric = roe ? 'ROE' : 'ROCE';
  const bench = roe ? sectorRow.roe_benchmark : sectorRow.roce_benchmark;
  if (bench == null) return null;
  return [
    '=== SECTOR BENCHMARK (ValueSight microtheory — AUTHORITATIVE for this company) ===',
    `${companyName} is classified under sector: ${sector}.`,
    `Marshall quality gate for this sector: ${metric} >= ${bench}%.`,
    'Apply THIS threshold in Gate 2A — do not use a generic 15% or another sector\'s number.',
    roe ? 'This is a financial/asset-heavy sector — assess ROE (not ROCE) as the primary return metric.' : '',
    '=== END SECTOR BENCHMARK ===',
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 2: Build the block in `runMarshallAnalysis`**

Just after the live-price block is built (the `const liveMarketBlock = ...` / log line), add:

```js
    // Sector microtheory: tell the AI this company's sector-specific quality gate.
    let sectorBlock = null;
    try {
      const sector = bundle?.company?.sector;
      if (sector) {
        const { listSectors } = require('./db');
        const sectorRow = (await listSectors()).find(s => s.sector === sector);
        sectorBlock = buildSectorBenchmarkBlock(companyName, sector, sectorRow);
        if (sectorBlock) console.log(`🏭 Sector benchmark for ${ticker}: ${sector}`);
      }
    } catch (e) { console.error('Sector benchmark lookup failed:', e.message); }
```

- [ ] **Step 3: Inject the block into the prompt**

Replace:
```js
${structuredContext ? structuredContext + '\n\n' : ''}${liveMarketBlock ? liveMarketBlock + '\n\n' : ''}${dataContext}
```
with:
```js
${structuredContext ? structuredContext + '\n\n' : ''}${liveMarketBlock ? liveMarketBlock + '\n\n' : ''}${sectorBlock ? sectorBlock + '\n\n' : ''}${dataContext}
```

- [ ] **Step 4: Verify the module loads + full suite**

Run: `node -e "require('./agent'); console.log('agent loads OK')" && node --test test/*.test.js`
Expected: `agent loads OK`; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add agent.js
git commit -m "Inject company sector benchmark into the analysis prompt (Phase 7 Task 6)"
```

---

## Task 7: Admin Sector Benchmarks panel (frontend)

**Files:** Create `client/src/components/admin/SectorBenchmarksPanel.js`; Modify `client/src/pages/AdminPanel.js`

- [ ] **Step 1: Create the panel component**

Create `client/src/components/admin/SectorBenchmarksPanel.js`:

```jsx
import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

export default function SectorBenchmarksPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingSector, setSavingSector] = useState(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/sectors');
      setRows(await res.json());
    } catch (e) { setMsg(`Load failed: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const edit = (sector, field, value) => {
    setRows(rs => rs.map(r => r.sector === sector ? { ...r, [field]: value } : r));
  };

  const save = async (row) => {
    setSavingSector(row.sector);
    setMsg('');
    try {
      const res = await authFetch(`/api/admin/sectors/${encodeURIComponent(row.sector)}`, {
        method: 'PUT',
        body: JSON.stringify({
          primary_metric: row.primary_metric,
          roce_benchmark: row.roce_benchmark === '' || row.roce_benchmark == null ? null : Number(row.roce_benchmark),
          roe_benchmark:  row.roe_benchmark === '' || row.roe_benchmark == null ? null : Number(row.roe_benchmark),
          notes: row.notes || '',
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'save failed'); }
      setMsg(`Saved ${row.sector}`);
    } catch (e) { setMsg(`Save failed: ${e.message}`); }
    finally { setSavingSector(null); }
  };

  const seed = async () => {
    if (!window.confirm('Seed/reset all 20 sectors to default benchmarks? This overwrites current values.')) return;
    setMsg('Seeding...');
    try {
      const res = await authFetch('/api/admin/sectors/seed', { method: 'POST' });
      const data = await res.json();
      setMsg(data.error ? `Seed failed: ${data.error}` : `Seeded ${data.seeded} sectors`);
      await load();
    } catch (e) { setMsg(`Seed failed: ${e.message}`); }
  };

  const cell = { padding: '4px 6px', borderBottom: '1px solid var(--border)', fontSize: 12 };
  const input = { width: 60, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px' };

  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Sector Benchmarks</h2>
        <button className="btn" onClick={seed}>Seed / reset defaults</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{msg}</div>}
      {loading ? <div style={{ fontSize: 12 }}>Loading…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-3)' }}>
                <th style={cell}>Sector</th><th style={cell}>Primary</th><th style={cell}>ROCE %</th><th style={cell}>ROE %</th><th style={cell}>Notes</th><th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.sector}>
                  <td style={cell}>{r.sector}</td>
                  <td style={cell}>
                    <select value={r.primary_metric || 'roce'} onChange={e => edit(r.sector, 'primary_metric', e.target.value)}
                            style={{ ...input, width: 70 }}>
                      <option value="roce">ROCE</option>
                      <option value="roe">ROE</option>
                    </select>
                  </td>
                  <td style={cell}>
                    <input type="number" value={r.roce_benchmark ?? ''} disabled={r.primary_metric === 'roe'}
                           onChange={e => edit(r.sector, 'roce_benchmark', e.target.value)} style={input} />
                  </td>
                  <td style={cell}>
                    <input type="number" value={r.roe_benchmark ?? ''}
                           onChange={e => edit(r.sector, 'roe_benchmark', e.target.value)} style={input} />
                  </td>
                  <td style={cell}>
                    <input type="text" value={r.notes ?? ''} onChange={e => edit(r.sector, 'notes', e.target.value)}
                           style={{ ...input, width: 160 }} />
                  </td>
                  <td style={cell}>
                    <button className="btn" disabled={savingSector === r.sector} onClick={() => save(r)}>
                      {savingSector === r.sector ? '…' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it in `AdminPanel.js`**

At the top of `client/src/pages/AdminPanel.js`, add the import after the existing imports:
```js
import SectorBenchmarksPanel from '../components/admin/SectorBenchmarksPanel';
```
Then inside the returned JSX, after the data/ingest card block and before the closing container `</div>`, add:
```jsx
        <SectorBenchmarksPanel />
```
(Place it among the other admin cards — exact sibling location doesn't matter as long as it's inside the main content container.)

- [ ] **Step 3: Verify JSX is balanced**

Read the modified region of `AdminPanel.js` to confirm `<SectorBenchmarksPanel />` sits between sibling elements with no unbalanced tags. (No local CRA build available — Render builds on deploy; a JSX error fails the build without affecting the running site.)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/admin/SectorBenchmarksPanel.js client/src/pages/AdminPanel.js
git commit -m "Add admin Sector Benchmarks editor panel (Phase 7 Task 7)"
```

---

## Task 8: Push & post-deploy validation

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Confirm full suite green locally**

Run: `node --test test/*.test.js`
Expected: all prior + new tests PASS.

- [ ] **Step 3: Manual post-deploy (per spec §8/§10)**

- Run the migration in Supabase (`db_migrations/2026-05-25-phase7-sector-microtheories.sql`).
- Admin page → **Sector Benchmarks** panel appears → click **Seed / reset defaults** → 20 rows populate.
- Rankings: open **Quality Compounders** — a strong bank (e.g. an HDFC/ICICI-type) should now appear, scored on ROE (reason shows `ROE …%`); a mid-ROCE IT name should drop out unless it clears 30%.
- Run a standard analysis on a bank → Render logs show `🏭 Sector benchmark for <T>: Financial Services` and Gate 2A reasons about ROE.
- Edit a sector benchmark in the panel, Save, re-open rankings → the change takes effect.

---

## Self-Review Notes

- **Spec coverage:** §4 schema → Task 1; §4 seed → Task 2; §5 ranking (toSectorMap/resolveQualityGate/threading/strategies/fallback) → Task 3; §5 `/api/rankings` wiring → Task 5 Step 2; §6 AI injection → Task 6; §7 endpoints → Task 5 Step 3; §7 db helpers → Task 4; §7 frontend → Task 7; §8 testing → Tasks 2-3 + Task 8 Step 3; §9 rollout → task order; §10 acceptance → Task 8 Step 3.
- **Placeholder scan:** all code steps are complete.
- **Type consistency:** `toSectorMap(rows)→map`, `resolveQualityGate(row, map)→{metric,value,benchmark}`, `rankUniverse(key, rows, sectorBenchmarks={}, limit=20)`, `scoreRow(key, row, sectorBenchmarks)`, `score(r, sectorBenchmarks)` — consistent across Tasks 3/5. `SECTOR_SEED` row shape (`sector, primary_metric, roce_benchmark, roe_benchmark, notes`) matches the `sectors` columns and `seedSectors`/`listSectors`/the panel. `/api/admin/sectors` PUT body matches `updateSector`'s allowed fields.
- **Backward-compat verified:** existing `rankUniverse`/`scoreRow` callers/tests pass 2 args → `sectorBenchmarks={}`/undefined → `resolveQualityGate` fallback ROCE 15 → identical to today.
