# Phase 2 Design Specification — Forward Paper-Trade Test ("Strategy Lab")

**Date:** 2026-06-20  
**Status:** DRAFT  
**Author:** Antigravity  

## 1. Goal & Product Requirements
We will build a forward paper-trading simulation engine ("Strategy Lab") for the four fundamental strategies:
- `marshall_undervalued`
- `quality_compounders`
- `deep_value`
- `high_growth`

The engine will track separate virtual portfolios (books) for each strategy, initialized with ₹15,00,000. Each book has 15 slots of ₹1,00,000.
We will run this forward in time, benchmarked against the Nifty 50 index (`^NSEI`).

### Key Rules
- **Decoupled Engine:** The calculations must be pure and written in a testable, logic-only module `platform/paperTrade.js`.
- **Cash Accounting:** Initial cash is ₹15,00,000. When we enter a position, cash decreases by ₹1,00,000, and we buy fractional shares: `shares = 100000 / entry_price`. When we exit, the position closes, and we add the realized proceeds `shares * exit_price` back to the cash pool.
- **Equal Slots:** Maximum of 15 slots. We only deploy cash into new positions if we have free slots (up to 15) AND at least ₹1,00,000 in cash.
- **Entry Decisions:** Enter names that pass the strategy's quality gate AND are ranked in the top-15. Tickers already held in the portfolio are skipped. Fill empty slots in order of descending ranking.
- **Exit Decisions:** Re-run the strategy's own quality gate `ranking.scoreRow(strategyKey, row, sectorBenchmarks)`. If it returns `passes: false` (or if data is completely missing/stale), close the trade at the current price. The exit reason will capture the gate that was violated.
- **Benchmark:** Nifty 50 index (`^NSEI`) will be stored in `daily_prices`. Book performance will be benchmarked against Nifty 50 cumulative returns since the book's inception date.
- **Daily Tick Cron:** A nightly cron job `POST /api/cron/paper-trade-tick` (with `x-cron-secret`) will execute the logic: load open trades, execute exits, execute entries, tick current prices, compute ending metrics, and record a daily book valuation snapshot.

---

## 2. Database Schema (Additive)

We will introduce three new tables:

```sql
-- Metadata for strategy books
CREATE TABLE IF NOT EXISTS paper_book_meta (
  strategy_key    TEXT PRIMARY KEY,
  inception_date  DATE NOT NULL,
  initial_capital NUMERIC NOT NULL DEFAULT 1500000
);

-- Individual paper trade transactions
CREATE TABLE IF NOT EXISTS paper_trades (
  id             BIGSERIAL PRIMARY KEY,
  strategy_key   TEXT NOT NULL,
  ticker         TEXT NOT NULL,
  company        TEXT,
  entry_date     DATE NOT NULL,
  entry_price    NUMERIC NOT NULL,
  entry_rank     INTEGER,
  entry_reasons  JSONB,
  exit_date      DATE,
  exit_price     NUMERIC,
  exit_reason    TEXT,
  status         TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  shares         NUMERIC NOT NULL,
  current_price  NUMERIC NOT NULL,
  return_pct     NUMERIC NOT NULL DEFAULT 0,
  last_updated   TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Daily book performance snapshots
CREATE TABLE IF NOT EXISTS paper_book_daily (
  strategy_key       TEXT NOT NULL,
  date               DATE NOT NULL,
  book_value         NUMERIC NOT NULL,
  book_return_pct    NUMERIC NOT NULL,
  nifty50_return_pct NUMERIC,
  open_positions     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (strategy_key, date)
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_strategy ON paper_trades (strategy_key);
CREATE INDEX IF NOT EXISTS idx_paper_trades_status ON paper_trades (status);
CREATE INDEX IF NOT EXISTS idx_paper_book_daily_date ON paper_book_daily (date DESC);
```

---

## 3. Pure Calculation Engine (`platform/paperTrade.js`)

We will decouple DB logic and encapsulate calculations in a pure helper module.

### Core API

#### `decideExits(openPositions, freshRowsByTicker, sectorBenchmarks)`
Checks each open position against its fresh fundamentals row using `scoreRow()`.
- **Returns:** `{ exits: [] }` where each exit is enriched with `exit_price`, `exit_reason`, and `exit_date`.

#### `decideEntries(strategyKey, rankedRows, openTickers, freeSlots, pricesByTicker)`
Determines which new tickers to buy.
- **Returns:** `{ entries: [] }` list of new trade objects.

#### `computeBookMetrics(trades, dailyHistory, benchmarkHistory)`
Computes portfolio analytics:
- Cumulative Return %
- Win Rate % (for closed trades)
- Max Drawdown % (based on daily book history)
- Alpha vs Nifty 50

---

## 4. Integration & UI

1. **Daily Cron Trigger:**
   - Run daily prices ingestion first.
   - Run `POST /api/cron/paper-trade-tick` which loads all necessary datasets, executes engine calls, performs DB upserts, and logs/alerts the summary.
2. **Strategy Lab UI Page:**
   - Render per-strategy stats, performance charts, open positions, and closed trades history.
