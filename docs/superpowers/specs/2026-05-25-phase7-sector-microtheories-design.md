# Phase 7 — Sector Microtheories

**Date:** 2026-05-25
**Status:** Approved (awaiting written-spec review)
**Type:** Phase design (implements Phase 7 of the master plan)
**Master plan:** `2026-05-17-master-architecture-plan.md` §10 — "Sector microtheories: per-sector Marshall benchmarks — makes ranking sector-aware."
**Builds on:** Phase 6 (financial ontology) — which captured the broad-bucket sector ROCE benchmarks as data and left the handoff for moving them into a DB table.

## 1. Problem & goal

Ranking and the Marshall analysis currently apply a **flat ROCE ≥ 15%** quality gate to every company. That is wrong across sectors: IT compounders should clear ~30%, FMCG ~25%, while **banks/NBFCs have no meaningful ROCE at all** and must be judged on **ROE** — and Financial Services is the single largest slice of the universe (**101 of ~500** Nifty 500 names). A flat ROCE gate unfairly filters or mis-scores ~20% of the universe.

**Goal:** make the quality gate **sector-aware** — per-sector ROCE/ROE benchmarks and a per-sector choice of which metric is the primary gate — applied consistently in both the SQL-style rankings and the AI analysis, and editable by the admin.

## 2. Current state (explored 2026-05-25)

- `companies.sector` is populated from the **NSE "Industry"** column of `data/nifty500.csv` (`index.js` load-nifty500 route). It holds **20 distinct NSE industries**: Financial Services (101), Capital Goods (63), Healthcare (49), Automobile & Auto Components (38), Consumer Services (29), FMCG (28), Information Technology (27), Chemicals (26), Metals & Mining (20), Power (18), Oil Gas & Consumable Fuels (18), Consumer Durables (16), Services (14), Construction (13), Realty (11), Construction Materials (11), Telecommunication (10), Textiles (5), Media Entertainment & Publication (4), Diversified (3).
- A `sectors` reference table already exists (phase5 migration): `sector` PK, `sub_sector`, `roce_benchmark`, `roe_benchmark`, `notes`, `updated_at` — currently empty.
- `ranking.js` (pure module) gates `marshall_undervalued` and `quality_compounders` on `ontology.benchmark('roce')` = flat 15; `deep_value` / `high_growth` don't use ROCE.
- The AI system prompt contains a Phase 6 generated 7-bucket ROCE table (`ontology.buildBenchmarkTable()`).

## 3. Locked decisions (brainstorm 2026-05-25)

| # | Decision |
| --- | --- |
| Storage | **Reuse the existing `sectors` table** (not a new `sector_microtheories` table). |
| Scope | **Rankings + AI analysis + an in-app Admin Sectors editor** (full scope). |
| Inapplicable ROCE | **Add a `primary_metric` column** (`roce`/`roe`); financials/realty/construction gate on ROE, everyone else on ROCE. |
| Admin editing | In-app panel on the existing Admin page; edits via API, not SQL. |

## 4. Schema change + seed

**Migration** (`db_migrations/2026-05-25-phase7-sector-microtheories.sql`, run manually in Supabase):
```sql
ALTER TABLE sectors ADD COLUMN IF NOT EXISTS primary_metric TEXT DEFAULT 'roce'
  CHECK (primary_metric IN ('roce','roe'));
```

**Seed** — not in the migration; loaded by an idempotent `seedSectors()` (upsert on `sector`) via the admin "Seed defaults" button. `SECTOR_SEED` constant:

| sector (NSE industry) | primary_metric | roce_benchmark | roe_benchmark | notes |
| --- | --- | --- | --- | --- |
| Information Technology | roce | 30 | 20 | asset-light, high returns |
| Fast Moving Consumer Goods | roce | 25 | 20 | brand moats |
| Consumer Durables | roce | 18 | 18 | brands + mfg |
| Healthcare | roce | 20 | 18 | pharma/hospitals |
| Consumer Services | roce | 18 | 18 | retail/QSR/hospitality |
| Services | roce | 18 | 18 | asset-light |
| Chemicals | roce | 18 | 16 | specialty/commodity mix |
| Capital Goods | roce | 15 | 15 | manufacturing baseline |
| Automobile and Auto Components | roce | 15 | 15 | capital-intensive mfg |
| Construction Materials | roce | 15 | 15 | cement etc. |
| Media Entertainment & Publication | roce | 15 | 15 | — |
| Diversified | roce | 15 | 15 | default |
| Textiles | roce | 12 | 12 | low-margin mfg |
| Metals & Mining | roce | 12 | 12 | cyclical commodity |
| Oil Gas & Consumable Fuels | roce | 12 | 12 | capital-heavy, cyclical |
| Power | roce | 12 | 12 | regulated, capital-heavy |
| Telecommunication | roce | 10 | 10 | very capital-intensive |
| Financial Services | roe | (null) | 15 | banks/NBFCs — ROCE N/A |
| Construction | roe | (null) | 15 | EPC, asset/WC-heavy |
| Realty | roe | (null) | 12 | lumpy, asset-heavy |

Values are best-judgment defaults (Marshall buckets + standard norms); all editable in the admin panel.

## 5. Ranking integration

- **DB:** `listSectors()` returns the rows; a pure `toSectorMap(rows)` builds `{ [sector]: { primary_metric, roce_benchmark, roe_benchmark } }`.
- **`ranking.js` stays pure** — the map is passed in: `rankUniverse(strategyKey, rows, sectorBenchmarks, limit)`, `scoreRow(strategyKey, row, sectorBenchmarks)`.
- **Resolver:**
```js
function resolveQualityGate(row, sectorBenchmarks) {
  const s = sectorBenchmarks?.[row.sector];
  if (s && s.primary_metric === 'roe')
    return { metric: 'ROE',  value: num(row.roe_5y_avg),  benchmark: s.roe_benchmark };
  return   { metric: 'ROCE', value: num(row.roce_5y_avg), benchmark: s?.roce_benchmark ?? 15 };
}
```
- `marshall_undervalued` and `quality_compounders` use the resolved metric for **both gate and score** (a bank is scored on ROE, not ROCE). `deep_value` / `high_growth` unchanged. Reason strings become explicit, e.g. `"ROE 18% ≥ 15 (Financial Services)"`.
- `/api/rankings` fetches the map (`toSectorMap(await listSectors())`) and passes it in.
- **Backward-compat:** unknown/missing sector → fallback ROCE ≥ 15 (today's behavior). Empty `sectors` table → rankings identical to today.

## 6. Sector-aware AI analysis

In `runMarshallAnalysis`, after the bundle (which carries `company.sector`), look up the sector in the map and inject an authoritative block into the prompt (same mechanism as the live-price anchor):
```
=== SECTOR BENCHMARK (ValueSight microtheory — AUTHORITATIVE for this company) ===
<Company> is classified under: <sector>.
Marshall quality gate for this sector: <ROCE|ROE> ≥ <benchmark>%.
Apply THIS threshold in Gate 2A — do not use a generic 15% or another sector's number.
<if roe-primary>: financial/asset-heavy sector — assess ROE (not ROCE) as the primary return metric.
=== END SECTOR BENCHMARK ===
```
- Reuses the same sector map → one source of truth for analysis and rankings.
- The Phase 6 7-bucket table stays in the system prompt as a general fallback; the injected per-company value takes precedence (one added instruction line).
- **Graceful skip:** if the ticker has no `companies.sector`, omit the block; the AI falls back to the general table.

## 7. Admin Sectors editor

**API (`requireAdmin`, `index.js`):**
- `GET /api/admin/sectors` → all rows.
- `PUT /api/admin/sectors/:sector` → update `primary_metric`/`roce_benchmark`/`roe_benchmark`/`notes`. Validates: benchmarks numeric ≥ 0; `primary_metric ∈ {roce, roe}`.
- `POST /api/admin/sectors/seed` → idempotent `seedSectors()` (first-time populate / reset to defaults).

**DB helpers (`db.js`):** `listSectors()`, `updateSector(sector, patch)`, `seedSectors()`.

**Frontend:** a "Sector Benchmarks" panel on the existing Admin page — editable table (primary_metric dropdown, ROCE/ROE numeric inputs, notes, per-row Save) + a "Seed / reset defaults" button. ROE-primary rows grey out the ROCE input.

## 8. Testing

- **Pure (TDD):** `toSectorMap(rows)`; `resolveQualityGate(row, map)` (ROCE normal / ROE financials / fallback 15); ranking score cases (bank→ROE, IT→ROCE 30); **regression: empty map reproduces today's flat-15 ranking byte-for-byte**.
- **I/O (manual after deploy):** admin GET/PUT/seed endpoints; the Admin panel; the injected sector block in a real analysis.

## 9. Rollout

Migration → DB helpers → `ranking.js` (TDD) → `/api/rankings` wiring → AI injection → admin endpoints + panel → push. Then (user): run the migration, click **Seed defaults**, verify.

## 10. Acceptance criteria

1. Seeded: a Financial Services company is gated/scored on ROE; IT on ROCE 30; Capital Goods on ROCE 15.
2. Unseeded (empty `sectors`): rankings byte-identical to today.
3. The analysis prompt carries the company's sector benchmark; Gate 2A applies it.
4. Admin can view, edit, and seed sectors in-app.
5. All tests green (existing + new).

## 11. Out of scope

- New `sector_microtheories` / `microtheory_overrides` tables (the `sectors` table suffices; per-company manual overrides deferred until a real need).
- Removing `ontology.js` `ROCE_SECTOR_BENCHMARKS` (kept as the system-prompt fallback table).
- Sub-sector-level benchmarks (sector-level only for now).
- New ranking strategies (e.g. a dedicated financials screen) — possible follow-up.

## 12. Pending user (manual) steps

- Run the Phase 7 migration in Supabase.
- Admin → "Seed defaults" to populate the 20 sectors.
