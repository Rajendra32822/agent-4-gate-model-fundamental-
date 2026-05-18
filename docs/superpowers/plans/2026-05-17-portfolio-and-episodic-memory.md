# Portfolio Tracking + Episodic Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a per-user transaction-log-based portfolio tracker (BUY/SELL/DIVIDEND/SPLIT/BONUS) with live FIFO holdings derivation, plus episodic memory that captures historical 1m/3m/6m/1y returns for every saved analysis and surfaces a framework-performance backtest.

**Architecture:** Two new Supabase tables (`portfolio_transactions` per-user, `analysis_outcomes` shared). Two new pure JS modules (`portfolio.js` for derivation, `outcomes.js` for return computation) — fully unit-tested via `node:test`. New Express endpoints in `index.js`. Existing daily cron extended to detect Yahoo corporate actions and propose transactions, plus run outcome backfill. New React `Portfolio` page with three tabs (Holdings / Transactions / Framework Performance).

**Tech Stack:** Node 18.19 + Express, React, Supabase (Postgres), Yahoo Finance v8/chart endpoint (already in use).

**Spec:** `docs/superpowers/specs/2026-05-17-portfolio-and-episodic-memory-design.md`

---

## File Structure

**New backend files:**
- `portfolio.js` — pure derivation of holdings + portfolio summary from a transaction array
- `outcomes.js` — pure computation of analysis outcomes from a price series; daily cron driver
- `test/portfolio.test.js` — unit tests
- `test/outcomes.test.js` — unit tests
- `db_migrations/2026-05-17-portfolio-and-outcomes.sql` — one-time DDL

**Modified backend files:**
- `db.js` — CRUD for `portfolio_transactions` and `analysis_outcomes`
- `index.js` — portfolio + outcome endpoints + admin backfill
- `priceCheck.js` — extend daily cron with corporate-action detection + outcome backfill

**New frontend files:**
- `client/src/pages/Portfolio.js` — top-level page with tabs
- `client/src/components/portfolio/HoldingsTable.js`
- `client/src/components/portfolio/TransactionModal.js`
- `client/src/components/portfolio/TransactionsList.js`
- `client/src/components/portfolio/FrameworkPerformance.js`
- `client/src/components/portfolio/PendingActionsBanner.js`

**Modified frontend files:**
- `client/src/App.js` — add Portfolio nav entry + route
- `client/src/pages/AdminPanel.js` — add "Backfill Analysis Outcomes" card

---

## Task 1: SQL migration

**Files:**
- Create: `db_migrations/2026-05-17-portfolio-and-outcomes.sql`

- [ ] **Step 1: Write the migration file**

Write `db_migrations/2026-05-17-portfolio-and-outcomes.sql`:

```sql
-- Portfolio tracking + episodic memory tables.
-- Run once in Supabase SQL editor before deploying Phase 4.

-- Per-user transaction log (BUY / SELL / DIVIDEND / SPLIT / BONUS).
CREATE TABLE IF NOT EXISTS portfolio_transactions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker        TEXT NOT NULL,
  company       TEXT,
  type          TEXT NOT NULL CHECK (type IN ('BUY','SELL','DIVIDEND','SPLIT','BONUS')),
  quantity      NUMERIC,
  price         NUMERIC,
  amount        NUMERIC,
  ratio         TEXT,
  transaction_date DATE NOT NULL,
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual','yahoo-auto','csv-import')),
  status        TEXT NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed','proposed','dismissed')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pt_user_ticker ON portfolio_transactions (user_id, ticker);
CREATE INDEX IF NOT EXISTS idx_pt_user_date   ON portfolio_transactions (user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_pt_status      ON portfolio_transactions (user_id, status);

-- Shared episodic memory: historical outcomes per analysis.
CREATE TABLE IF NOT EXISTS analysis_outcomes (
  ticker             TEXT NOT NULL,
  analysis_date      DATE NOT NULL,
  verdict            TEXT,
  entry_low          NUMERIC,
  entry_high         NUMERIC,
  price_at_analysis  NUMERIC,
  price_1w           NUMERIC,
  price_1m           NUMERIC,
  price_3m           NUMERIC,
  price_6m           NUMERIC,
  price_1y           NUMERIC,
  return_1m_pct      NUMERIC,
  return_3m_pct      NUMERIC,
  return_6m_pct      NUMERIC,
  return_1y_pct      NUMERIC,
  hit_entry_zone     BOOLEAN,
  hit_bull_case      BOOLEAN,
  hit_bear_case      BOOLEAN,
  computed_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, analysis_date)
);
CREATE INDEX IF NOT EXISTS idx_ao_verdict ON analysis_outcomes (verdict);
```

- [ ] **Step 2: User applies migration in Supabase SQL Editor**

Paste the SQL above. Run. Verify with:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('portfolio_transactions', 'analysis_outcomes');
```

Expected: two rows.

- [ ] **Step 3: Commit**

```bash
git add db_migrations/2026-05-17-portfolio-and-outcomes.sql
git commit -m "Add SQL migration for portfolio_transactions + analysis_outcomes"
```

---

## Task 2: Failing tests for portfolio.js

**Files:**
- Create: `test/portfolio.test.js`

- [ ] **Step 1: Write the test file**

Write `test/portfolio.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeHoldings, computePortfolioSummary } = require('../portfolio');

const tx = (overrides) => ({
  ticker: 'X', company: 'X Co',
  type: 'BUY', quantity: 100, price: 50,
  transaction_date: '2026-01-01', status: 'confirmed',
  ...overrides,
});

test('empty transactions returns empty holdings', () => {
  const h = computeHoldings([], {});
  assert.deepEqual(h, []);
});

test('single BUY creates one holding', () => {
  const h = computeHoldings([tx()], { X: 60 });
  assert.equal(h.length, 1);
  assert.equal(h[0].ticker, 'X');
  assert.equal(h[0].quantity, 100);
  assert.equal(h[0].avgBuyPrice, 50);
  assert.equal(h[0].cmp, 60);
  assert.equal(h[0].unrealisedPl, 1000);
  assert.equal(h[0].unrealisedPlPct, 20);
  assert.equal(h[0].realisedPl, 0);
});

test('two BUYs compute weighted average', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 100, price: 70, transaction_date: '2026-02-01' }),
  ];
  const h = computeHoldings(txs, { X: 80 });
  assert.equal(h[0].quantity, 200);
  assert.equal(h[0].avgBuyPrice, 60); // (100*50 + 100*70) / 200
});

test('SELL realises P&L using FIFO', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 100, price: 70, transaction_date: '2026-02-01' }),
    tx({ type: 'SELL', quantity: 50, price: 80, transaction_date: '2026-03-01' }),
  ];
  const h = computeHoldings(txs, { X: 90 });
  // Sells 50 from the oldest lot (₹50 cost) → realised = (80-50)*50 = 1500
  assert.equal(h[0].quantity, 150);
  assert.equal(h[0].realisedPl, 1500);
  // Remaining lots: 50 @ ₹50 + 100 @ ₹70 = avg ₹63.33
  assert.equal(h[0].avgBuyPrice, 63.33);
});

test('SELL spanning multiple lots', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 100, price: 70, transaction_date: '2026-02-01' }),
    tx({ type: 'SELL', quantity: 150, price: 80, transaction_date: '2026-03-01' }),
  ];
  const h = computeHoldings(txs, { X: 90 });
  // Sells full first lot (100 @ 50) + 50 from second lot (50 @ 70)
  // realised = (80-50)*100 + (80-70)*50 = 3000 + 500 = 3500
  assert.equal(h[0].quantity, 50);
  assert.equal(h[0].realisedPl, 3500);
  assert.equal(h[0].avgBuyPrice, 70);
});

test('SPLIT 1:5 multiplies qty and divides price', () => {
  const txs = [
    tx({ quantity: 100, price: 500, transaction_date: '2026-01-01' }),
    tx({ type: 'SPLIT', ratio: '1:5', transaction_date: '2026-02-01', quantity: null, price: null }),
  ];
  const h = computeHoldings(txs, { X: 110 });
  assert.equal(h[0].quantity, 500);
  assert.equal(h[0].avgBuyPrice, 100);
});

test('BONUS 1:1 doubles holdings', () => {
  const txs = [
    tx({ quantity: 100, price: 200, transaction_date: '2026-01-01' }),
    tx({ type: 'BONUS', ratio: '1:1', transaction_date: '2026-02-01', quantity: null, price: null }),
  ];
  const h = computeHoldings(txs, { X: 110 });
  assert.equal(h[0].quantity, 200);
  assert.equal(h[0].avgBuyPrice, 100);
});

test('DIVIDEND adds to totalDividends', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ type: 'DIVIDEND', quantity: null, price: null, amount: 500, transaction_date: '2026-03-01' }),
  ];
  const h = computeHoldings(txs, { X: 60 });
  assert.equal(h[0].totalDividends, 500);
  assert.equal(h[0].quantity, 100);
});

test('proposed status is ignored', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 50, price: 60, transaction_date: '2026-02-01', status: 'proposed' }),
  ];
  const h = computeHoldings(txs, { X: 70 });
  assert.equal(h[0].quantity, 100);
});

test('dismissed status is ignored', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ quantity: 50, price: 60, transaction_date: '2026-02-01', status: 'dismissed' }),
  ];
  const h = computeHoldings(txs, { X: 70 });
  assert.equal(h[0].quantity, 100);
});

test('multi-ticker computed independently', () => {
  const txs = [
    tx({ ticker: 'A', quantity: 10, price: 100 }),
    tx({ ticker: 'B', quantity: 20, price: 200 }),
  ];
  const h = computeHoldings(txs, { A: 110, B: 250 });
  assert.equal(h.length, 2);
  const a = h.find(x => x.ticker === 'A');
  const b = h.find(x => x.ticker === 'B');
  assert.equal(a.quantity, 10);
  assert.equal(b.quantity, 20);
  assert.equal(b.unrealisedPl, 1000); // (250-200)*20
});

test('totalReturn sums unrealised, realised, dividends', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ type: 'SELL', quantity: 50, price: 80, transaction_date: '2026-02-01' }),
    tx({ type: 'DIVIDEND', quantity: null, price: null, amount: 300, transaction_date: '2026-03-01' }),
  ];
  const h = computeHoldings(txs, { X: 100 });
  // remaining 50 @ 50 → unrealised = (100-50)*50 = 2500
  // realised = (80-50)*50 = 1500
  // dividends = 300
  // total = 4300
  assert.equal(h[0].totalReturn, 4300);
});

test('computePortfolioSummary aggregates across tickers', () => {
  const txs = [
    tx({ ticker: 'A', quantity: 10, price: 100 }),
    tx({ ticker: 'B', quantity: 20, price: 200 }),
  ];
  const s = computePortfolioSummary(txs, { A: 120, B: 250 });
  assert.equal(s.positionsCount, 2);
  assert.equal(s.totalInvested, 10 * 100 + 20 * 200); // 5000
  assert.equal(s.totalValue,    10 * 120 + 20 * 250); // 6200
  assert.equal(s.totalUnrealised, 200 + 1000);        // 1200
  assert.equal(s.returnPct, 24); // 1200 / 5000 * 100
});

test('sold-out position shows quantity 0', () => {
  const txs = [
    tx({ quantity: 100, price: 50, transaction_date: '2026-01-01' }),
    tx({ type: 'SELL', quantity: 100, price: 80, transaction_date: '2026-02-01' }),
  ];
  const h = computeHoldings(txs, { X: 90 });
  assert.equal(h[0].quantity, 0);
  assert.equal(h[0].realisedPl, 3000);
  assert.equal(h[0].unrealisedPl, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "C:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main"
node --test test/portfolio.test.js 2>&1 | tail -3
```

Expected: All tests fail with `Cannot find module '../portfolio'`.

- [ ] **Step 3: Commit**

```bash
git add test/portfolio.test.js
git commit -m "Add failing tests for portfolio derivation module"
```

---

## Task 3: Implement portfolio.js

**Files:**
- Create: `portfolio.js`

- [ ] **Step 1: Write the implementation**

Write `portfolio.js`:

```javascript
/**
 * Pure portfolio derivation. No I/O. Given a transaction array and a
 * CMP map, computes per-ticker holdings and a portfolio summary.
 *
 * Transaction shape (from the portfolio_transactions table):
 *   { ticker, company, type, quantity, price, amount, ratio,
 *     transaction_date, status, ... }
 *
 * Only `status: 'confirmed'` transactions contribute. Proposed and
 * dismissed rows are ignored.
 *
 * Holdings use FIFO for realised P&L (Indian LTCG convention).
 */

function parseSplitRatio(type, ratio) {
  // Returns multiplier applied to share count (and divisor of price basis).
  // Split 1:5 → 1 share becomes 5 → multiplier 5/1 = 5
  // Bonus 1:1 → 1 free share per share held → multiplier (1+1)/1 = 2
  if (!ratio) return 1;
  const m = String(ratio).match(/(\d+)[:\s]+(\d+)/);
  if (!m) return 1;
  const from = parseInt(m[1], 10);
  const to   = parseInt(m[2], 10);
  if (!from || !to) return 1;
  if (type === 'SPLIT') return to / from;
  if (type === 'BONUS') return (from + to) / from;
  return 1;
}

function computeHoldings(transactions, cmpMap = {}) {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const byTicker = {};
  for (const t of transactions) {
    if (!t || t.status !== 'confirmed') continue;
    if (!byTicker[t.ticker]) byTicker[t.ticker] = [];
    byTicker[t.ticker].push(t);
  }

  const holdings = [];
  for (const [ticker, txs] of Object.entries(byTicker)) {
    const sorted = [...txs].sort((a, b) =>
      String(a.transaction_date).localeCompare(String(b.transaction_date)));

    const lots = [];           // [{ qty, price, date }]
    let realisedPl = 0;
    let totalDividends = 0;
    let company = null;

    for (const t of sorted) {
      if (!company && t.company) company = t.company;
      const qty   = Number(t.quantity);
      const price = Number(t.price);

      if (t.type === 'BUY') {
        if (qty > 0 && price >= 0) lots.push({ qty, price, date: t.transaction_date });
      } else if (t.type === 'SELL') {
        let remaining = qty;
        const sellPrice = price;
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(remaining, lot.qty);
          realisedPl += (sellPrice - lot.price) * take;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 1e-9) lots.shift();
        }
      } else if (t.type === 'DIVIDEND') {
        totalDividends += Number(t.amount || 0);
      } else if (t.type === 'SPLIT' || t.type === 'BONUS') {
        const mult = parseSplitRatio(t.type, t.ratio);
        if (mult !== 1) {
          for (const lot of lots) {
            lot.qty   *= mult;
            lot.price /= mult;
          }
        }
      }
    }

    const currentQty   = lots.reduce((s, l) => s + l.qty, 0);
    const totalCost    = lots.reduce((s, l) => s + l.qty * l.price, 0);
    const avgBuyPrice  = currentQty > 0 ? totalCost / currentQty : 0;
    const cmp          = Number(cmpMap[ticker] ?? 0);
    const unrealisedPl = currentQty > 0 ? (cmp - avgBuyPrice) * currentQty : 0;
    const unrealisedPct = avgBuyPrice ? ((cmp - avgBuyPrice) / avgBuyPrice) * 100 : 0;

    holdings.push({
      ticker,
      company,
      quantity:       round(currentQty),
      avgBuyPrice:    round(avgBuyPrice),
      cmp,
      unrealisedPl:   round(unrealisedPl),
      unrealisedPlPct: round(unrealisedPct),
      realisedPl:     round(realisedPl),
      totalDividends: round(totalDividends),
      totalReturn:    round(realisedPl + unrealisedPl + totalDividends),
      lots: lots.map(l => ({ qty: round(l.qty), price: round(l.price), date: l.date })),
    });
  }
  return holdings;
}

function computePortfolioSummary(transactions, cmpMap = {}) {
  const holdings = computeHoldings(transactions, cmpMap);
  let totalValue = 0, totalInvested = 0;
  let totalUnrealised = 0, totalRealised = 0, totalDividends = 0;
  let positionsCount = 0;
  for (const h of holdings) {
    if (h.quantity > 0) positionsCount++;
    totalValue      += h.quantity * h.cmp;
    totalInvested   += h.quantity * h.avgBuyPrice;
    totalUnrealised += h.unrealisedPl;
    totalRealised   += h.realisedPl;
    totalDividends  += h.totalDividends;
  }
  const totalReturn = totalUnrealised + totalRealised + totalDividends;
  const returnPct   = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
  return {
    positionsCount,
    totalValue:      round(totalValue),
    totalInvested:   round(totalInvested),
    totalUnrealised: round(totalUnrealised),
    totalRealised:   round(totalRealised),
    totalDividends:  round(totalDividends),
    totalReturn:     round(totalReturn),
    returnPct:       round(returnPct),
  };
}

function round(n) {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

module.exports = { computeHoldings, computePortfolioSummary, parseSplitRatio };
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
node --test test/portfolio.test.js 2>&1 | tail -5
```

Expected: All 14 tests pass.

- [ ] **Step 3: Commit**

```bash
git add portfolio.js
git commit -m "Implement portfolio.js: pure FIFO derivation of holdings + summary"
```

---

## Task 4: Failing tests for outcomes.js

**Files:**
- Create: `test/outcomes.test.js`

- [ ] **Step 1: Write the tests**

Write `test/outcomes.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findClosestPrice,
  priceAtOffset,
  computeOutcome,
} = require('../outcomes');

const series = (rows) => rows.map(r => ({ date: r[0], close: r[1] }));

test('findClosestPrice: exact date match', () => {
  const s = series([['2026-01-01', 100], ['2026-01-02', 101]]);
  assert.equal(findClosestPrice(s, '2026-01-01'), 100);
});

test('findClosestPrice: uses prior date when exact missing', () => {
  const s = series([['2026-01-01', 100], ['2026-01-03', 103]]);
  // weekend gap: query 2026-01-02 → returns 100 (closest prior)
  assert.equal(findClosestPrice(s, '2026-01-02'), 100);
});

test('findClosestPrice: empty series returns null', () => {
  assert.equal(findClosestPrice([], '2026-01-01'), null);
  assert.equal(findClosestPrice(null, '2026-01-01'), null);
});

test('findClosestPrice: future-only series returns null', () => {
  // target before any data point
  const s = series([['2026-02-01', 100]]);
  assert.equal(findClosestPrice(s, '2026-01-01'), null);
});

test('priceAtOffset: 30 days later', () => {
  const s = series([
    ['2026-01-01', 100],
    ['2026-01-31', 110],
    ['2026-02-15', 115],
  ]);
  assert.equal(priceAtOffset(s, '2026-01-01', 30), 110);
});

test('computeOutcome: full happy path', () => {
  const s = series([
    ['2026-01-01', 100],
    ['2026-02-01', 105],     // ~1m
    ['2026-04-01', 115],     // ~3m
    ['2026-07-01', 120],     // ~6m
    ['2027-01-01', 140],     // ~1y
  ]);
  const out = computeOutcome('X', '2026-01-01', s, {
    entryZone: '₹90–110',
    valuationScenarios: {
      bullCase: { price: '₹130' },
      bearCase: { price: '₹80' },
    },
  });
  assert.equal(out.price_at_analysis, 100);
  assert.equal(out.return_1m_pct, 5);
  assert.equal(out.return_3m_pct, 15);
  assert.equal(out.return_6m_pct, 20);
  assert.equal(out.return_1y_pct, 40);
  assert.equal(out.hit_bull_case, true); // 140 ≥ 130
  assert.equal(out.hit_bear_case, false); // never went below 80
  assert.equal(out.hit_entry_zone, true); // 100 is within 90-110
});

test('computeOutcome: no data → null returns', () => {
  const out = computeOutcome('X', '2030-01-01', series([['2026-01-01', 100]]), {});
  assert.equal(out.price_at_analysis, null);
});

test('computeOutcome: hit_bear_case true when price dips below', () => {
  const s = series([
    ['2026-01-01', 100],
    ['2026-03-01', 75],   // dips below bear 80
    ['2026-07-01', 105],
  ]);
  const out = computeOutcome('X', '2026-01-01', s, {
    valuationScenarios: { bearCase: { price: '₹80' } },
  });
  assert.equal(out.hit_bear_case, true);
});

test('computeOutcome: hit_entry_zone false when price stays above', () => {
  const s = series([
    ['2026-01-01', 200],
    ['2026-04-01', 220],
  ]);
  const out = computeOutcome('X', '2026-01-01', s, { entryZone: '₹90–110' });
  assert.equal(out.hit_entry_zone, false);
});

test('computeOutcome: handles missing gate3', () => {
  const s = series([['2026-01-01', 100], ['2026-02-01', 110]]);
  const out = computeOutcome('X', '2026-01-01', s, null);
  assert.equal(out.price_at_analysis, 100);
  assert.equal(out.return_1m_pct, 10);
  assert.equal(out.hit_entry_zone, false);
  assert.equal(out.hit_bull_case, false);
  assert.equal(out.hit_bear_case, false);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test test/outcomes.test.js 2>&1 | tail -3
```

Expected: All fail with `Cannot find module '../outcomes'`.

- [ ] **Step 3: Commit**

```bash
git add test/outcomes.test.js
git commit -m "Add failing tests for outcomes module"
```

---

## Task 5: Implement outcomes.js

**Files:**
- Create: `outcomes.js`

- [ ] **Step 1: Write the implementation**

Write `outcomes.js`:

```javascript
/**
 * Pure outcome computation. Given a Yahoo Finance daily price series
 * (array of { date: 'YYYY-MM-DD', close: number }) and an analysis date,
 * computes returns at 1w/1m/3m/6m/1y horizons and whether the price ever
 * hit the entry zone, bull case, or bear case.
 */

function findClosestPrice(priceSeries, targetDate) {
  if (!Array.isArray(priceSeries) || priceSeries.length === 0) return null;
  const target = new Date(targetDate).getTime();
  if (!isFinite(target)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const p of priceSeries) {
    if (!p?.date || p.close == null) continue;
    const pd = new Date(p.date).getTime();
    if (!isFinite(pd) || pd > target) continue;
    const diff = target - pd;
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return best ? best.close : null;
}

function priceAtOffset(priceSeries, baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return findClosestPrice(priceSeries, d.toISOString().split('T')[0]);
}

function parsePriceString(str) {
  if (str == null) return null;
  const m = String(str).replace(/[₹,\s]/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parseRangeString(str) {
  if (!str) return [null, null];
  const cleaned = String(str).replace(/[₹,\s]/g, '');
  const m = cleaned.match(/(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [null, null];
}

function pctChange(p, p0) {
  if (p == null || p0 == null || p0 === 0) return null;
  return Number((((p - p0) / p0) * 100).toFixed(2));
}

function computeOutcome(ticker, analysisDate, priceSeries, gate3) {
  const price0 = findClosestPrice(priceSeries, analysisDate);
  if (price0 == null) {
    return {
      ticker,
      analysis_date: analysisDate,
      price_at_analysis: null,
      price_1w: null, price_1m: null, price_3m: null, price_6m: null, price_1y: null,
      return_1m_pct: null, return_3m_pct: null, return_6m_pct: null, return_1y_pct: null,
      hit_entry_zone: false, hit_bull_case: false, hit_bear_case: false,
    };
  }

  const price_1w = priceAtOffset(priceSeries, analysisDate, 7);
  const price_1m = priceAtOffset(priceSeries, analysisDate, 30);
  const price_3m = priceAtOffset(priceSeries, analysisDate, 90);
  const price_6m = priceAtOffset(priceSeries, analysisDate, 180);
  const price_1y = priceAtOffset(priceSeries, analysisDate, 365);

  // Collect future prices for hit-flag computation
  const analysisTime = new Date(analysisDate).getTime();
  const futurePrices = (priceSeries || [])
    .filter(p => p?.date && p.close != null && new Date(p.date).getTime() >= analysisTime)
    .map(p => p.close);

  const [entryLow, entryHigh] = parseRangeString(gate3?.entryZone);
  const bull = parsePriceString(gate3?.valuationScenarios?.bullCase?.price);
  const bear = parsePriceString(gate3?.valuationScenarios?.bearCase?.price);

  const hit_entry_zone = (entryLow != null && entryHigh != null)
    ? futurePrices.some(p => p >= entryLow * 0.98 && p <= entryHigh)
    : false;
  const hit_bull_case  = bull != null ? futurePrices.some(p => p >= bull) : false;
  const hit_bear_case  = bear != null ? futurePrices.some(p => p <= bear) : false;

  return {
    ticker,
    analysis_date: analysisDate,
    price_at_analysis: price0,
    price_1w, price_1m, price_3m, price_6m, price_1y,
    return_1m_pct: pctChange(price_1m, price0),
    return_3m_pct: pctChange(price_3m, price0),
    return_6m_pct: pctChange(price_6m, price0),
    return_1y_pct: pctChange(price_1y, price0),
    hit_entry_zone, hit_bull_case, hit_bear_case,
  };
}

module.exports = { findClosestPrice, priceAtOffset, computeOutcome, parsePriceString, parseRangeString };
```

- [ ] **Step 2: Run tests**

```bash
node --test test/outcomes.test.js 2>&1 | tail -5
```

Expected: All 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add outcomes.js
git commit -m "Implement outcomes.js: pure return + hit-flag computation"
```

---

## Task 6: Add db.js CRUD for transactions + outcomes

**Files:**
- Modify: `db.js` — append new functions before `module.exports`

- [ ] **Step 1: Add portfolio CRUD functions**

Find the line `module.exports = {` near the bottom of `db.js`. Just above it, add:

```javascript
// ─── Portfolio transactions (per-user) ────────────────────────────────────────

async function addPortfolioTransaction(userId, tx) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const row = {
      user_id: userId,
      ticker: tx.ticker?.toUpperCase(),
      company: tx.company ?? null,
      type: tx.type,
      quantity: tx.quantity != null ? Number(tx.quantity) : null,
      price:    tx.price    != null ? Number(tx.price)    : null,
      amount:   tx.amount   != null ? Number(tx.amount)   :
                (tx.quantity != null && tx.price != null
                  ? Number(tx.quantity) * Number(tx.price)
                  : null),
      ratio: tx.ratio ?? null,
      transaction_date: tx.transaction_date,
      notes: tx.notes ?? null,
      source: tx.source || 'manual',
      status: tx.status || 'confirmed',
    };
    const { data, error } = await db.from('portfolio_transactions').insert(row).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('addPortfolioTransaction error:', err.message);
    return null;
  }
}

async function listPortfolioTransactions(userId, filters = {}) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    let q = db.from('portfolio_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false });
    if (filters.ticker) q = q.eq('ticker', filters.ticker.toUpperCase());
    if (filters.type)   q = q.eq('type', filters.type);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.from)   q = q.gte('transaction_date', filters.from);
    if (filters.to)     q = q.lte('transaction_date', filters.to);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listPortfolioTransactions error:', err.message);
    return [];
  }
}

async function updatePortfolioTransaction(userId, id, updates) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const allowed = ['ticker','company','type','quantity','price','amount','ratio','transaction_date','notes','status'];
    const row = {};
    for (const k of allowed) if (k in updates) row[k] = updates[k];
    const { data, error } = await db.from('portfolio_transactions')
      .update(row).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('updatePortfolioTransaction error:', err.message);
    return null;
  }
}

async function deletePortfolioTransaction(userId, id) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('portfolio_transactions')
      .delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('deletePortfolioTransaction error:', err.message);
    return false;
  }
}

async function setTransactionStatus(userId, id, status) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('portfolio_transactions')
      .update({ status }).eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('setTransactionStatus error:', err.message);
    return false;
  }
}

// ─── Analysis outcomes (shared) ───────────────────────────────────────────────

async function upsertOutcome(record) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('analysis_outcomes')
      .upsert(record, { onConflict: 'ticker,analysis_date' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertOutcome error:', err.message);
    return false;
  }
}

async function getAllOutcomes() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('analysis_outcomes')
      .select('*')
      .order('analysis_date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('getAllOutcomes error:', err.message);
    return [];
  }
}

async function getOutcomesByTicker(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('analysis_outcomes')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .order('analysis_date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('getOutcomesByTicker error:', err.message);
    return [];
  }
}
```

- [ ] **Step 2: Add the new functions to module.exports**

Find `module.exports = {` at the bottom of `db.js`. Add the new function names. Locate the existing block:

```javascript
module.exports = {
  connectDB, saveAnalysis, getAnalysis, getAllAnalyses, getAnalysisHistory, deleteAnalysis,
  getProfile, updateProfile, getWatchlist, addToWatchlist, removeFromWatchlist, getCurrentQuarter,
  // tracking
  upsertWatch, getActiveWatches, getAllWatches, updateWatchStatus,
  savePriceCheck, getLatestPrices,
  openVirtualTrade, closeVirtualTrade, updateOpenTrades, getAllTrades,
  createAlert, getAlerts, getUnreadAlertCount, markAllAlertsRead,
  // fundamental metrics
  saveFundamentalMetrics, getMetricsHistory, getAllMetricsLatest,
};
```

Replace with:

```javascript
module.exports = {
  connectDB, saveAnalysis, getAnalysis, getAllAnalyses, getAnalysisHistory, deleteAnalysis,
  getProfile, updateProfile, getWatchlist, addToWatchlist, removeFromWatchlist, getCurrentQuarter,
  // tracking
  upsertWatch, getActiveWatches, getAllWatches, updateWatchStatus,
  savePriceCheck, getLatestPrices,
  openVirtualTrade, closeVirtualTrade, updateOpenTrades, getAllTrades,
  createAlert, getAlerts, getUnreadAlertCount, markAllAlertsRead,
  // fundamental metrics
  saveFundamentalMetrics, getMetricsHistory, getAllMetricsLatest,
  // portfolio + outcomes (added 2026-05-17)
  addPortfolioTransaction, listPortfolioTransactions, updatePortfolioTransaction,
  deletePortfolioTransaction, setTransactionStatus,
  upsertOutcome, getAllOutcomes, getOutcomesByTicker,
};
```

- [ ] **Step 3: Syntax check**

```bash
node --check db.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add db.js
git commit -m "Add db.js CRUD for portfolio_transactions and analysis_outcomes"
```

---

## Task 7: Add Express API endpoints for portfolio + outcomes

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Import new modules at top of index.js**

Find this line near the top:

```javascript
const { verifyAnalysis } = require('./verification');
```

Add directly below:

```javascript
const { computeHoldings, computePortfolioSummary } = require('./portfolio');
const { computeOutcome } = require('./outcomes');
const { fetchYahooPrice } = require('./priceCheck');
```

- [ ] **Step 2: Add to the destructured db imports**

Find the existing db destructure (lines starting `const {`):

```javascript
  saveFundamentalMetrics, getMetricsHistory, getAllMetricsLatest,
} = require('./db');
```

Replace with:

```javascript
  saveFundamentalMetrics, getMetricsHistory, getAllMetricsLatest,
  addPortfolioTransaction, listPortfolioTransactions, updatePortfolioTransaction,
  deletePortfolioTransaction, setTransactionStatus,
  upsertOutcome, getAllOutcomes, getOutcomesByTicker,
} = require('./db');
```

- [ ] **Step 3: Add the portfolio endpoints**

Find a good insertion point — just before `// ─── Daily price check cron` block, add the portfolio endpoints:

```javascript
// ─── Portfolio endpoints (per-user) ───────────────────────────────────────────
app.get('/api/portfolio/transactions', requireAuth, async (req, res) => {
  try {
    const txs = await listPortfolioTransactions(req.user.id, {
      ticker: req.query.ticker,
      type:   req.query.type,
      status: req.query.status,
      from:   req.query.from,
      to:     req.query.to,
    });
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/portfolio/transactions', requireAuth, async (req, res) => {
  const tx = req.body || {};
  if (!tx.ticker || !tx.type || !tx.transaction_date) {
    return res.status(400).json({ error: 'ticker, type and transaction_date are required' });
  }
  const allowedTypes = ['BUY','SELL','DIVIDEND','SPLIT','BONUS'];
  if (!allowedTypes.includes(tx.type)) {
    return res.status(400).json({ error: `type must be one of ${allowedTypes.join(', ')}` });
  }
  const saved = await addPortfolioTransaction(req.user.id, tx);
  if (!saved) return res.status(500).json({ error: 'Failed to save transaction' });
  res.json(saved);
});

app.put('/api/portfolio/transactions/:id', requireAuth, async (req, res) => {
  const updated = await updatePortfolioTransaction(req.user.id, req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Transaction not found' });
  res.json(updated);
});

app.delete('/api/portfolio/transactions/:id', requireAuth, async (req, res) => {
  const ok = await deletePortfolioTransaction(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ success: true });
});

app.post('/api/portfolio/transactions/:id/confirm', requireAuth, async (req, res) => {
  const ok = await setTransactionStatus(req.user.id, req.params.id, 'confirmed');
  if (!ok) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ success: true });
});

app.post('/api/portfolio/transactions/:id/dismiss', requireAuth, async (req, res) => {
  const ok = await setTransactionStatus(req.user.id, req.params.id, 'dismissed');
  if (!ok) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ success: true });
});

app.get('/api/portfolio/holdings', requireAuth, async (req, res) => {
  try {
    const txs = await listPortfolioTransactions(req.user.id, { status: 'confirmed' });
    const tickers = [...new Set(txs.map(t => t.ticker))];
    // Parallel CMP fetch with 30s memo
    const cmpMap = {};
    await Promise.all(tickers.map(async (t) => {
      try { cmpMap[t] = await fetchYahooPrice(t); } catch { cmpMap[t] = 0; }
    }));
    const holdings = computeHoldings(txs, cmpMap);
    const summary  = computePortfolioSummary(txs, cmpMap);
    res.json({ holdings, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Outcomes endpoints (shared data) ─────────────────────────────────────────
app.get('/api/outcomes', requireAuth, async (req, res) => {
  try {
    const out = await getAllOutcomes();
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/outcomes/:ticker', requireAuth, async (req, res) => {
  try {
    const out = await getOutcomesByTicker(req.params.ticker);
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
```

- [ ] **Step 4: Add the admin backfill endpoint**

Find this existing endpoint:

```javascript
// ─── Admin: backfill confidence scores onto all existing analyses ────────────
app.post('/api/admin/backfill-confidence', requireAdmin, async (req, res) => {
```

Add this new endpoint **directly above** it:

```javascript
// ─── Admin: backfill analysis outcomes (historical returns) ──────────────────
app.post('/api/admin/backfill-outcomes', requireAdmin, async (req, res) => {
  try {
    const https = require('https');
    const analyses = await getAllAnalyses();
    const results = { computed: 0, skipped: 0, errors: [] };

    // Cache Yahoo chart responses across analyses (one ticker can have multiple analyses)
    const chartCache = {};
    const fetchChart5y = (ticker) => new Promise((resolve, reject) => {
      if (chartCache[ticker]) return resolve(chartCache[ticker]);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.toUpperCase()}.NS?interval=1d&range=5y`;
      https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        timeout: 15000,
      }, (rs) => {
        let data = '';
        rs.on('data', c => data += c);
        rs.on('end', () => {
          try {
            const j = JSON.parse(data);
            const r = j?.chart?.result?.[0];
            const ts = r?.timestamp || [];
            const closes = r?.indicators?.quote?.[0]?.close || [];
            const series = ts.map((t, i) => ({
              date: new Date(t * 1000).toISOString().split('T')[0],
              close: closes[i],
            })).filter(p => p.close != null);
            chartCache[ticker] = series;
            resolve(series);
          } catch (e) { reject(e); }
        });
      }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
    });

    for (const row of analyses) {
      try {
        const full = await getAnalysis(row.ticker);
        if (!full) { results.skipped++; continue; }
        const series = await fetchChart5y(full.ticker);
        const out = computeOutcome(full.ticker, full.analysisDate, series, full.gate3);
        // Add verdict and entry zone summary from the analysis
        const er = (full.gate3?.entryZone || '').replace(/[₹,\s]/g, '').match(/(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)/);
        out.verdict    = full.overallVerdict || null;
        out.entry_low  = er ? parseFloat(er[1]) : null;
        out.entry_high = er ? parseFloat(er[2]) : null;
        const saved = await upsertOutcome(out);
        if (saved) results.computed++;
      } catch (e) {
        results.errors.push({ ticker: row.ticker, error: e.message });
      }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

```

- [ ] **Step 5: Syntax check**

```bash
node --check index.js
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add index.js
git commit -m "Add portfolio + outcomes API endpoints + admin backfill"
```

---

## Task 8: Extend daily cron for corporate-action detection

**Files:**
- Modify: `priceCheck.js`

- [ ] **Step 1: Add helper to fetch Yahoo corporate actions**

Open `priceCheck.js`. Add this function after `fetchYahooQuote` (around the existing Yahoo helpers block):

```javascript
/**
 * Fetch corporate-action events (splits + dividends) for a ticker from Yahoo.
 * Returns: { splits: [{ date, ratio }], dividends: [{ date, amount }] }
 * Falls back to empty arrays on failure.
 */
async function fetchYahooCorporateActions(ticker, rangeDays = 365) {
  for (const ex of ['NS', 'BO']) {
    const symbol = toYahooSymbol(ticker, ex);
    try {
      const range = `${Math.max(1, Math.round(rangeDays / 365))}y`;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}&events=div,split`;
      const { status, json } = await httpsGetJson(url);
      if (status !== 200) continue;
      const events = json?.chart?.result?.[0]?.events || {};
      const splits = Object.values(events.splits || {}).map(s => ({
        date: new Date(s.date * 1000).toISOString().split('T')[0],
        ratio: `${s.numerator}:${s.denominator}`,
      }));
      const dividends = Object.values(events.dividends || {}).map(d => ({
        date: new Date(d.date * 1000).toISOString().split('T')[0],
        amount: d.amount,
      }));
      if (splits.length > 0 || dividends.length > 0) {
        return { splits, dividends };
      }
    } catch { /* try next */ }
  }
  return { splits: [], dividends: [] };
}
```

- [ ] **Step 2: Add the exports**

Find the `module.exports = {` block at the bottom of `priceCheck.js` and add `fetchYahooCorporateActions`:

```javascript
module.exports = {
  fetchYahooPrice, fetchYahooQuote, fetchYahooCorporateActions, formatInrPrice, formatInrCrore,
  extractWatchFromAnalysis, runDailyPriceCheck, parseEntryZone, parsePrice,
};
```

- [ ] **Step 3: Syntax check**

```bash
node --check priceCheck.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add priceCheck.js
git commit -m "Add fetchYahooCorporateActions to priceCheck for split/dividend detection"
```

Note: the actual cron extension that proposes transactions (calls
`addPortfolioTransaction` with `status: 'proposed'` and `source: 'yahoo-auto'`)
is deferred to Phase 4.1 — for v1 the user manually adds splits/bonuses via UI.
Yahoo helper is in place for when we wire it.

---

## Task 9: Portfolio page scaffold + nav entry

**Files:**
- Create: `client/src/pages/Portfolio.js`
- Modify: `client/src/App.js`

- [ ] **Step 1: Create the Portfolio page**

```bash
mkdir -p client/src/components/portfolio
```

Write `client/src/pages/Portfolio.js`:

```jsx
import React, { useState } from 'react';
import HoldingsTable from '../components/portfolio/HoldingsTable';
import TransactionsList from '../components/portfolio/TransactionsList';
import FrameworkPerformance from '../components/portfolio/FrameworkPerformance';

const TABS = [
  { key: 'holdings',    label: 'Holdings' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'performance',  label: 'Framework Performance' },
];

export default function Portfolio({ onSelectStock }) {
  const [tab, setTab] = useState(localStorage.getItem('portfolioTab') || 'holdings');
  const setTabPersisted = (k) => { setTab(k); localStorage.setItem('portfolioTab', k); };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Portfolio</div>
        <div className="page-subtitle">Real positions · Framework performance backtest</div>
      </div>

      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTabPersisted(t.key)}
            style={{
              padding: '10px 16px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`,
              color: tab === t.key ? 'var(--text)' : 'var(--text-3)',
              fontSize: 13, fontWeight: tab === t.key ? 700 : 500, cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'holdings'     && <HoldingsTable onSelectStock={onSelectStock} />}
      {tab === 'transactions' && <TransactionsList />}
      {tab === 'performance'  && <FrameworkPerformance onSelectStock={onSelectStock} />}
    </div>
  );
}
```

- [ ] **Step 2: Add Portfolio nav entry to App.js**

Open `client/src/App.js`. Find the existing imports:

```javascript
import WatchesPage from './pages/WatchesPage';
```

Add directly below:

```javascript
import Portfolio from './pages/Portfolio';
```

- [ ] **Step 3: Add Portfolio nav button**

Find the Header's nav (search for `Tracking` button — the one with unreadAlerts badge). Just after the Tracking button's closing `</button>` and before the Profile button, insert:

```jsx
          <button className={`nav-btn ${page === 'portfolio' ? 'active' : ''}`} onClick={() => onNavigate('portfolio')}>
            Portfolio
          </button>
```

- [ ] **Step 4: Add Portfolio route in the main switch**

Find the existing page render block:

```javascript
        {page === 'watches' && (
          <WatchesPage onSelectStock={(ticker) => navigateTo('analysis', ticker)} isAdmin={isAdmin} />
        )}
```

Add directly after:

```javascript
        {page === 'portfolio' && (
          <Portfolio onSelectStock={(ticker) => navigateTo('analysis', ticker)} />
        )}
```

- [ ] **Step 5: Brace/paren balance check**

```bash
node -e "
const fs=require('fs');
for(const f of ['client/src/pages/Portfolio.js','client/src/App.js']){
  const c=fs.readFileSync(f,'utf8');
  const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
  console.log(f, (o===cl && p===pl)?'OK':'FAIL');
}
"
```

Expected: both OK. Components imported but not yet existing — they'll be created in next tasks (App still parses because imports resolve at runtime).

- [ ] **Step 6: Commit**

```bash
git add client/src/App.js client/src/pages/Portfolio.js
git commit -m "Add Portfolio page scaffold with three tabs + nav entry"
```

---

## Task 10: HoldingsTable component

**Files:**
- Create: `client/src/components/portfolio/HoldingsTable.js`

- [ ] **Step 1: Write the component**

Write `client/src/components/portfolio/HoldingsTable.js`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import authFetch from '../../lib/api';
import TransactionModal from './TransactionModal';
import PendingActionsBanner from './PendingActionsBanner';

const fmtInr = (n) => {
  if (n == null || !isFinite(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};
const fmtPct = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const plColour = (n) => n > 0 ? 'var(--pass)' : n < 0 ? 'var(--fail)' : 'var(--text-3)';

export default function HoldingsTable({ onSelectStock }) {
  const [data, setData] = useState({ holdings: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // { type: 'BUY' | 'SELL' | 'DIVIDEND' | null }
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/portfolio/holdings');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const j = await res.json();
      setData(j);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload, reloadKey]);

  const onSaved = () => { setModal(null); setReloadKey(k => k + 1); };

  return (
    <div>
      <PendingActionsBanner onChange={() => setReloadKey(k => k + 1)} />

      {data.summary && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Portfolio value</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{fmtInr(data.summary.totalValue)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Invested {fmtInr(data.summary.totalInvested)} · {data.summary.positionsCount} positions
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total return</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: plColour(data.summary.totalReturn) }}>
              {fmtPct(data.summary.returnPct)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Unrealised {fmtInr(data.summary.totalUnrealised)} · Realised {fmtInr(data.summary.totalRealised)} · Divs {fmtInr(data.summary.totalDividends)}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'BUY' })}>+ Buy</button>
        <button className="btn btn-secondary" onClick={() => setModal({ type: 'SELL' })}>+ Sell</button>
        <button className="btn btn-secondary" onClick={() => setModal({ type: 'DIVIDEND' })}>+ Dividend</button>
        <button className="btn btn-secondary" onClick={() => setModal({ type: 'SPLIT' })}>+ Split/Bonus</button>
      </div>

      {loading && <div style={{ color: 'var(--text-3)', padding: 24, textAlign: 'center' }}>Loading…</div>}
      {error   && <div style={{ color: 'var(--fail)', padding: 24, textAlign: 'center' }}>{error}</div>}

      {!loading && !error && data.holdings.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, color: 'var(--text-3)', marginBottom: 12 }}>◌</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>No positions yet</div>
          <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>Add your first BUY to start tracking.</div>
          <button className="btn btn-primary" onClick={() => setModal({ type: 'BUY' })}>+ Add Buy</button>
        </div>
      )}

      {!loading && data.holdings.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Ticker','Company','Qty','Avg Buy','CMP','Unrealised','Realised','Dividends','Total Return'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.05, color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.holdings.filter(h => h.quantity > 0).map(h => (
                <tr
                  key={h.ticker}
                  onClick={() => onSelectStock?.(h.ticker)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>{h.ticker}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.company || '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{h.quantity}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(h.avgBuyPrice)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(h.cmp)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(h.unrealisedPl) }}>
                    {fmtInr(h.unrealisedPl)} ({fmtPct(h.unrealisedPlPct)})
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(h.realisedPl) }}>{fmtInr(h.realisedPl)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(h.totalDividends)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(h.totalReturn), fontWeight: 600 }}>{fmtInr(h.totalReturn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <TransactionModal
          type={modal.type}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Brace balance check**

```bash
node -e "
const fs=require('fs');
const c=fs.readFileSync('client/src/components/portfolio/HoldingsTable.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log((o===cl && p===pl)?'OK':'FAIL');
"
```

Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/portfolio/HoldingsTable.js
git commit -m "Add HoldingsTable component: summary card + holdings rows + quick-add buttons"
```

---

## Task 11: TransactionModal component

**Files:**
- Create: `client/src/components/portfolio/TransactionModal.js`

- [ ] **Step 1: Write the component**

Write `client/src/components/portfolio/TransactionModal.js`:

```jsx
import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

const TITLES = {
  BUY:      'Add Buy',
  SELL:     'Add Sell',
  DIVIDEND: 'Add Dividend',
  SPLIT:    'Add Split / Bonus',
};

export default function TransactionModal({ type, onClose, onSaved }) {
  const [ticker, setTicker]   = useState('');
  const [company, setCompany] = useState('');
  const [quantity, setQty]    = useState('');
  const [price, setPrice]     = useState('');
  const [amount, setAmount]   = useState('');
  const [ratio, setRatio]     = useState('');
  const [splitType, setSplitType] = useState('SPLIT');
  const [date, setDate]       = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  // Ticker autocomplete from existing analyses
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => {
    authFetch('/api/analyses').then(r => r.ok ? r.json() : []).then(setSuggestions).catch(() => {});
  }, []);

  const onTickerChange = (v) => {
    setTicker(v.toUpperCase());
    const m = suggestions.find(s => s.ticker?.toUpperCase() === v.toUpperCase());
    if (m) setCompany(m.company || '');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const realType = (type === 'SPLIT') ? splitType : type;
    const body = {
      ticker, company, type: realType, transaction_date: date, notes,
      quantity: quantity ? Number(quantity) : null,
      price:    price    ? Number(price)    : null,
      amount:   amount   ? Number(amount)   : null,
      ratio:    ratio || null,
    };
    try {
      const res = await authFetch('/api/portfolio/transactions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
      onSaved?.(j);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '20px 24px', width: '100%', maxWidth: 440,
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 16 }}>{TITLES[type] || 'Add Transaction'}</div>

        <Field label="Ticker">
          <input list="ticker-options" value={ticker} onChange={e => onTickerChange(e.target.value)} required className="input-field" placeholder="HDFCBANK" autoFocus />
          <datalist id="ticker-options">
            {suggestions.map(s => <option key={s.ticker} value={s.ticker}>{s.company}</option>)}
          </datalist>
        </Field>

        {(type === 'BUY' || type === 'SELL') && (
          <>
            <Field label="Quantity">
              <input type="number" step="any" value={quantity} onChange={e => setQty(e.target.value)} required className="input-field" />
            </Field>
            <Field label="Price per share (₹)">
              <input type="number" step="any" value={price} onChange={e => setPrice(e.target.value)} required className="input-field" />
            </Field>
          </>
        )}

        {type === 'DIVIDEND' && (
          <>
            <Field label="Total amount received (₹)">
              <input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} required className="input-field" />
            </Field>
            <Field label="Per-share amount (₹, optional)">
              <input type="number" step="any" value={price} onChange={e => setPrice(e.target.value)} className="input-field" placeholder="auto-computed if blank" />
            </Field>
          </>
        )}

        {type === 'SPLIT' && (
          <>
            <Field label="Type">
              <div style={{ display: 'flex', gap: 12 }}>
                <label><input type="radio" name="st" value="SPLIT" checked={splitType === 'SPLIT'} onChange={e => setSplitType(e.target.value)} /> Split</label>
                <label><input type="radio" name="st" value="BONUS" checked={splitType === 'BONUS'} onChange={e => setSplitType(e.target.value)} /> Bonus</label>
              </div>
            </Field>
            <Field label="Ratio (e.g. 1:5 for split, 1:1 for bonus)">
              <input value={ratio} onChange={e => setRatio(e.target.value)} required className="input-field" placeholder="1:5" />
            </Field>
          </>
        )}

        <Field label="Date">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="input-field" />
        </Field>

        <Field label="Notes (optional)">
          <input value={notes} onChange={e => setNotes(e.target.value)} className="input-field" />
        </Field>

        {error && <div style={{ color: 'var(--fail)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Brace check**

```bash
node -e "
const c=require('fs').readFileSync('client/src/components/portfolio/TransactionModal.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log((o===cl && p===pl)?'OK':'FAIL');
"
```

Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/portfolio/TransactionModal.js
git commit -m "Add TransactionModal: type-aware form for BUY/SELL/DIVIDEND/SPLIT"
```

---

## Task 12: TransactionsList component

**Files:**
- Create: `client/src/components/portfolio/TransactionsList.js`

- [ ] **Step 1: Write the component**

Write `client/src/components/portfolio/TransactionsList.js`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import authFetch from '../../lib/api';

const TYPE_COLOUR = {
  BUY: 'var(--pass)', SELL: '#f59e0b', DIVIDEND: 'var(--accent)',
  SPLIT: 'var(--text-2)', BONUS: 'var(--text-2)',
};

const fmtInr = (n) => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function TransactionsList() {
  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState(null);
  const [filterTicker, setFT] = useState('');
  const [filterType,   setFTy] = useState('');

  const reload = useCallback(async () => {
    setLoad(true); setError(null);
    try {
      const qs = [];
      if (filterTicker) qs.push(`ticker=${encodeURIComponent(filterTicker.toUpperCase())}`);
      if (filterType)   qs.push(`type=${encodeURIComponent(filterType)}`);
      const res = await authFetch(`/api/portfolio/transactions${qs.length ? '?' + qs.join('&') : ''}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setItems(await res.json());
    } catch (err) { setError(err.message); }
    finally { setLoad(false); }
  }, [filterTicker, filterType]);

  useEffect(() => { reload(); }, [reload]);

  const onDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    const res = await authFetch(`/api/portfolio/transactions/${id}`, { method: 'DELETE' });
    if (res.ok) reload();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input-field" placeholder="Filter by ticker" value={filterTicker} onChange={e => setFT(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select className="input-field" value={filterType} onChange={e => setFTy(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">All types</option>
          {['BUY','SELL','DIVIDEND','SPLIT','BONUS'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading && <div style={{ color: 'var(--text-3)', padding: 24, textAlign: 'center' }}>Loading…</div>}
      {error   && <div style={{ color: 'var(--fail)', padding: 24, textAlign: 'center' }}>{error}</div>}

      {!loading && items.length === 0 && (
        <div style={{ color: 'var(--text-3)', padding: 40, textAlign: 'center' }}>No transactions yet.</div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Date','Type','Ticker','Qty','Price','Amount','Ratio','Notes',''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.05, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{t.transaction_date}</td>
                  <td style={{ padding: '10px 12px', color: TYPE_COLOUR[t.type], fontWeight: 600 }}>{t.type}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{t.ticker}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{t.quantity ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(t.price)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(t.amount)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>{t.ratio || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-3)', fontSize: 11 }}>{t.notes || ''}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button onClick={() => onDelete(t.id)} title="Delete" style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13 }}>✕</button>
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

- [ ] **Step 2: Brace check + commit**

```bash
node -e "
const c=require('fs').readFileSync('client/src/components/portfolio/TransactionsList.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log((o===cl && p===pl)?'OK':'FAIL');
" && git add client/src/components/portfolio/TransactionsList.js && git commit -m "Add TransactionsList component with filters and delete"
```

Expected: OK and commit succeeds.

---

## Task 13: FrameworkPerformance tab

**Files:**
- Create: `client/src/components/portfolio/FrameworkPerformance.js`

- [ ] **Step 1: Write the component**

Write `client/src/components/portfolio/FrameworkPerformance.js`:

```jsx
import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

const fmtPct = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const plColour = (n) => n > 0 ? 'var(--pass)' : n < 0 ? 'var(--fail)' : 'var(--text-3)';

function aggregateByVerdict(outcomes, verdict, horizonKey) {
  const subset = outcomes.filter(o => o.verdict === verdict && o[horizonKey] != null);
  if (subset.length === 0) return null;
  const returns = subset.map(o => o[horizonKey]);
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const hitRate = subset.filter(o => o[horizonKey] > 0).length / subset.length * 100;
  const best  = subset.reduce((m, o) => o[horizonKey] > m[horizonKey] ? o : m, subset[0]);
  const worst = subset.reduce((m, o) => o[horizonKey] < m[horizonKey] ? o : m, subset[0]);
  return {
    count: subset.length,
    avg: Number(avg.toFixed(2)),
    hitRate: Number(hitRate.toFixed(1)),
    best: { ticker: best.ticker, pct: best[horizonKey] },
    worst: { ticker: worst.ticker, pct: worst[horizonKey] },
  };
}

export default function FrameworkPerformance({ onSelectStock }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState('return_6m_pct');

  useEffect(() => {
    authFetch('/api/outcomes')
      .then(r => r.ok ? r.json() : [])
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const buy   = aggregateByVerdict(data, 'BUY',   horizon);
  const watch = aggregateByVerdict(data, 'WATCH', horizon);
  const avoid = aggregateByVerdict(data, 'AVOID', horizon);
  const alpha = (buy && avoid) ? buy.avg - avoid.avg : null;

  if (loading) return <div style={{ color: 'var(--text-3)', padding: 24, textAlign: 'center' }}>Loading outcomes…</div>;

  if (data.length === 0) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, color: 'var(--text-3)', marginBottom: 12 }}>◌</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>No outcome data yet</div>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>Run the Admin Panel "Backfill Analysis Outcomes" once to compute historical returns.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Horizon:</span>
        {[
          { k: 'return_1m_pct', l: '1m' },
          { k: 'return_3m_pct', l: '3m' },
          { k: 'return_6m_pct', l: '6m' },
          { k: 'return_1y_pct', l: '1y' },
        ].map(h => (
          <button key={h.k} onClick={() => setHorizon(h.k)} style={{
            padding: '6px 12px', background: horizon === h.k ? 'var(--surface2)' : 'transparent',
            border: `1px solid ${horizon === h.k ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6, color: horizon === h.k ? 'var(--accent)' : 'var(--text-2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)',
          }}>{h.l}</button>
        ))}
        {alpha != null && (
          <span style={{ marginLeft: 'auto', fontSize: 13, color: plColour(alpha) }}>
            Framework α (BUY − AVOID): <b>{fmtPct(alpha)}</b>
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
        <VerdictCard title="BUY"   stats={buy}   colour="var(--pass)" />
        <VerdictCard title="WATCH" stats={watch} colour="var(--warn)" />
        <VerdictCard title="AVOID" stats={avoid} colour="var(--fail)" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              {['Ticker','Date','Verdict','1m','3m','6m','1y','Entry hit','Bull hit','Bear hit'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.05, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(o => (
              <tr key={`${o.ticker}-${o.analysis_date}`} onClick={() => onSelectStock?.(o.ticker)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{o.ticker}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{o.analysis_date}</td>
                <td style={{ padding: '8px 12px' }}><span className={`verdict-badge verdict-${o.verdict}`}>{o.verdict}</span></td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(o.return_1m_pct) }}>{fmtPct(o.return_1m_pct)}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(o.return_3m_pct) }}>{fmtPct(o.return_3m_pct)}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(o.return_6m_pct) }}>{fmtPct(o.return_6m_pct)}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(o.return_1y_pct) }}>{fmtPct(o.return_1y_pct)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{o.hit_entry_zone ? '✓' : '—'}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{o.hit_bull_case  ? '✓' : '—'}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{o.hit_bear_case  ? '⚠' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VerdictCard({ title, stats, colour }) {
  if (!stats) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontWeight: 700, color: colour, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title} calls</div>
        <div style={{ color: 'var(--text-3)', marginTop: 6 }}>No data</div>
      </div>
    );
  }
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${colour}33`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, color: colour, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title} calls ({stats.count})</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>avg:</span>
        <span style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: plColour(stats.avg) }}>{fmtPct(stats.avg)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
        <span>hit rate: <b style={{ color: 'var(--text-2)' }}>{stats.hitRate}%</b></span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
        best: <b style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{stats.best.ticker}</b> {fmtPct(stats.best.pct)}<br />
        worst: <b style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{stats.worst.ticker}</b> {fmtPct(stats.worst.pct)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Brace check + commit**

```bash
node -e "
const c=require('fs').readFileSync('client/src/components/portfolio/FrameworkPerformance.js','utf8');
const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
console.log((o===cl && p===pl)?'OK':'FAIL');
" && git add client/src/components/portfolio/FrameworkPerformance.js && git commit -m "Add FrameworkPerformance tab: per-verdict cards + outcomes table"
```

Expected: OK.

---

## Task 14: PendingActionsBanner + Admin backfill card

**Files:**
- Create: `client/src/components/portfolio/PendingActionsBanner.js`
- Modify: `client/src/pages/AdminPanel.js`

- [ ] **Step 1: Write the PendingActionsBanner component**

Write `client/src/components/portfolio/PendingActionsBanner.js`:

```jsx
import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

export default function PendingActionsBanner({ onChange }) {
  const [pending, setPending] = useState([]);

  const reload = () => {
    authFetch('/api/portfolio/transactions?status=proposed')
      .then(r => r.ok ? r.json() : [])
      .then(setPending)
      .catch(() => {});
  };

  useEffect(() => { reload(); }, []);

  const act = async (id, action) => {
    await authFetch(`/api/portfolio/transactions/${id}/${action}`, { method: 'POST' });
    reload();
    onChange?.();
  };

  if (pending.length === 0) return null;

  return (
    <div style={{
      background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.4)',
      borderRadius: 12, padding: '12px 16px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 12, color: '#c9a84c', fontWeight: 700, marginBottom: 8 }}>
        ⚠ {pending.length} pending corporate action{pending.length > 1 ? 's' : ''}
      </div>
      {pending.map(p => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
          <span>
            <b>{p.ticker}</b> {p.type}
            {p.ratio && ` ${p.ratio}`}
            {p.amount && ` ₹${p.amount}/sh`}
            <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>on {p.transaction_date}</span>
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => act(p.id, 'confirm')} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}>Confirm</button>
            <button onClick={() => act(p.id, 'dismiss')} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add Backfill Outcomes card to AdminPanel.js**

Open `client/src/pages/AdminPanel.js`. Find the existing "Backfill Verification + Confidence" section. After its closing `</div>` (the card wrapper), add:

```javascript
        {/* Backfill Analysis Outcomes */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIcon}>📈</div>
            <div>
              <h2 style={styles.cardTitle}>Backfill Analysis Outcomes</h2>
              <p style={styles.cardSubtitle}>
                Run once to compute historical 1m/3m/6m/1y returns for every saved analysis. Powers the Framework Performance tab on the Portfolio page. Uses Yahoo Finance historical data — one call per ticker.
              </p>
            </div>
          </div>
          <button
            onClick={handleBackfillOutcomes}
            disabled={outcomesLoading}
            style={{ background: '#10b981', color: '#0d0f11', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: outcomesLoading ? 'not-allowed' : 'pointer', opacity: outcomesLoading ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {outcomesLoading ? 'Computing outcomes…' : '📈 Backfill Analysis Outcomes'}
          </button>
          {outcomesResult && <div style={{ marginTop: 12, fontSize: 13, color: outcomesResult.startsWith('✓') ? '#22c55e' : '#f87171' }}>{outcomesResult}</div>}
        </div>
```

- [ ] **Step 3: Add the state hooks and handler at the top of AdminPanel**

Find the existing "Backfill confidence scores" hooks section in AdminPanel.js:

```javascript
  // Backfill confidence scores
  const [confidenceLoading, setConfidenceLoading] = useState(false);
  const [confidenceResult, setConfidenceResult] = useState(null);
```

Add directly below the existing confidence backfill handler:

```javascript
  // Backfill analysis outcomes
  const [outcomesLoading, setOutcomesLoading] = useState(false);
  const [outcomesResult,  setOutcomesResult]  = useState(null);

  const handleBackfillOutcomes = async () => {
    setOutcomesLoading(true); setOutcomesResult(null);
    try {
      const res = await authFetch('/api/admin/backfill-outcomes', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setOutcomesResult(`✓ Done — ${data.computed} outcomes computed, ${data.skipped} skipped${data.errors?.length ? `, ${data.errors.length} errors` : ''}.`);
      } else {
        setOutcomesResult(`⚠ ${data.error}`);
      }
    } catch (e) {
      setOutcomesResult('⚠ ' + e.message);
    } finally {
      setOutcomesLoading(false);
    }
  };
```

- [ ] **Step 4: Brace check + commit**

```bash
node -e "
const fs=require('fs');
for(const f of ['client/src/components/portfolio/PendingActionsBanner.js','client/src/pages/AdminPanel.js']){
  const c=fs.readFileSync(f,'utf8');
  const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
  console.log(f, (o===cl && p===pl)?'OK':'FAIL');
}
" && git add client/src/components/portfolio/PendingActionsBanner.js client/src/pages/AdminPanel.js && git commit -m "Add PendingActionsBanner + 'Backfill Analysis Outcomes' card in Admin Panel"
```

Expected: both OK.

---

## Task 15: End-to-end verification + push

**Files:**
- None (verification only)

- [ ] **Step 1: Run unit tests for both new modules**

```bash
node --test test/portfolio.test.js 2>&1 | grep -E "pass [0-9]|fail [0-9]"
node --test test/outcomes.test.js  2>&1 | grep -E "pass [0-9]|fail [0-9]"
```

Expected: `fail 0` on both, with all tests passing.

- [ ] **Step 2: Backend syntax check**

```bash
node --check portfolio.js && node --check outcomes.js && node --check db.js && node --check index.js && node --check priceCheck.js && echo "Backend OK"
```

Expected: `Backend OK`.

- [ ] **Step 3: Frontend brace balance check**

```bash
node -e "
const fs=require('fs');
const files = [
  'client/src/App.js',
  'client/src/pages/Portfolio.js',
  'client/src/pages/AdminPanel.js',
  'client/src/components/portfolio/HoldingsTable.js',
  'client/src/components/portfolio/TransactionModal.js',
  'client/src/components/portfolio/TransactionsList.js',
  'client/src/components/portfolio/FrameworkPerformance.js',
  'client/src/components/portfolio/PendingActionsBanner.js',
];
let allOk = true;
for (const f of files) {
  const c=fs.readFileSync(f,'utf8');
  const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length, p=(c.match(/\\(/g)||[]).length, pl=(c.match(/\\)/g)||[]).length;
  const ok = (o===cl && p===pl);
  if (!ok) allOk = false;
  console.log(f, ok?'OK':'FAIL');
}
process.exit(allOk ? 0 : 1);
"
```

Expected: every file `OK`.

- [ ] **Step 4: Push to main**

```bash
git push origin main
```

Render will rebuild backend + frontend automatically (~3-5 min).

- [ ] **Step 5: Manual smoke test against deployed app**

After Render finishes:

1. Open the app. A new **Portfolio** nav item is visible.
2. Click Portfolio → defaults to Holdings tab → "No positions yet" empty state.
3. Click **+ Add Buy** → modal opens. Enter HDFCBANK, qty 10, price 1500, today's date. Save.
4. Holdings table now shows HDFCBANK with quantity 10, avg ₹1,500, CMP (live from Yahoo), unrealised P&L.
5. Switch to **Transactions** tab → shows the BUY row. Filter by ticker works.
6. Add a **+ Dividend** transaction for HDFCBANK ₹250. Switch back to Holdings — totalDividends shows ₹250.
7. Open the Admin Panel and click **📈 Backfill Analysis Outcomes**. Wait for success.
8. Back to Portfolio → **Framework Performance** tab → cards show BUY/WATCH/AVOID stats and outcomes table.
9. Try the **+ Sell** flow with quantity 5 at price 1700 — Holdings now shows 5 remaining, realised P&L = (1700-1500)*5 = ₹1000.
10. Try **+ Split/Bonus** with ratio 1:2, type Split — quantity goes from 5 to 10, avg buy halves.

- [ ] **Step 6: Mark feature complete**

If all 10 smoke-test steps pass, feature is shipped.

---

## Self-Review Notes

**Spec coverage:**

- ✅ Section 1 (Data model) — Task 1
- ✅ Section 2 (Holdings derivation, FIFO) — Tasks 2 + 3
- ✅ Section 3 (Auto split/bonus detection) — Task 8 (Yahoo helper in place; cron wiring deferred to v4.1 per task note)
- ✅ Section 4 (Episodic memory) — Tasks 4 + 5 + 7 (backfill endpoint)
- ✅ Section 5 (UI structure: 3 tabs) — Task 9 + 10 + 12 + 13
- ✅ Section 6 (Quick-add UI) — Task 11
- ✅ Section 7 (Framework Performance stats) — Task 13
- ✅ Section 8 (Migration + backfill) — Task 1 + 7 + 14
- ✅ Section 9 (Per-user privacy via user_id) — Task 6 (all CRUD filters on user_id)
- ✅ Section 10 (Out of scope items documented and deferred)

**Name consistency:**

- Tables: `portfolio_transactions`, `analysis_outcomes` consistent across migration, db.js, endpoints, frontend
- Status enum: `confirmed` / `proposed` / `dismissed` consistent
- Type enum: `BUY` / `SELL` / `DIVIDEND` / `SPLIT` / `BONUS` consistent
- Function names: `addPortfolioTransaction`, `listPortfolioTransactions`, `updatePortfolioTransaction`, `deletePortfolioTransaction`, `setTransactionStatus`, `upsertOutcome`, `getAllOutcomes`, `getOutcomesByTicker` consistent
- Endpoint paths: `/api/portfolio/*` and `/api/outcomes/*` consistent
- Frontend components: Portfolio + HoldingsTable + TransactionModal + TransactionsList + FrameworkPerformance + PendingActionsBanner consistent

**Known accepted limitations (per spec):**

- Auto split/bonus cron wiring deferred to v4.1 — Task 8 lays the foundation
- CSV broker import deferred — out of scope per spec
- Brokerage/STT/charges deferred — out of scope per spec
