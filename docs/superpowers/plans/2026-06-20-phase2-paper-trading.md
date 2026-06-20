# Implementation Plan — Phase 2: Forward Paper-Trade Test ("Strategy Lab")

We will implement the tasks under Phase 2 of the [ROADMAP.md](file:///c:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main/docs/superpowers/ROADMAP.md) to build the forward paper-trading simulation engine, its integration with daily price crons, and the "Strategy Lab" React UI.

## Proposed Changes

### Slice 1: Database Migrations, Engine, and Tests

#### [NEW] [2026-06-20-phase2-paper-trading.sql](file:///c:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main/db_migrations/2026-06-20-phase2-paper-trading.sql)
- Creates `paper_book_meta`, `paper_trades`, and `paper_book_daily` tables.
- Adds necessary indexes on strategy_key, status, and date.

#### [NEW] [paperTrade.js](file:///c:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main/platform/paperTrade.js)
- Implements pure portfolio and strategy allocation logic:
  - `decideExits(openPositions, freshRowsByTicker, sectorBenchmarks)`
  - `decideEntries(strategyKey, rankedRows, openTickers, freeSlots, pricesByTicker)`
  - `applyTick(book, todaysPrices, indexLevel)`
  - `computeBookMetrics(closedTrades, equityCurve, benchmarkCurve)`

#### [NEW] [paperTrade.test.js](file:///c:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main/test/paperTrade.test.js)
- Unit tests covering cash accounting, exit execution (thesis breaks), entry ranking, and performance metrics (max drawdown, win rate, return).

### Slice 2: Database Helpers, Ingestion, and Cron Setup

#### [MODIFY] [db.js](file:///c:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main/db.js)
- Implements:
  - `getPaperBookMeta()`, `savePaperBookMeta()`
  - `getPaperTrades(strategyKey, status)`
  - `savePaperTrades(trades)` (insert new ones, update status/exits on closed ones)
  - `savePaperBookDaily(snapshots)`
  - `getPaperBookDaily(strategyKey)`

#### [MODIFY] [index.js](file:///c:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main/index.js)
- Expose `POST /api/cron/paper-trade-tick` which:
  - Validates `x-cron-secret`.
  - Performs daily Nifty 50 (`^NSEI`) ingestion using `fetchYahooDailyPrices` and updates `daily_prices`.
  - Runs paper trading calculations for each active strategy.
  - Updates DB state and daily performance snapshots.
  - Sends a Telegram alert with the summary return and transactions for each strategy.

### Slice 3: Strategy Lab UI

#### [NEW] [StrategyLab.js](file:///c:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main/client/src/pages/StrategyLab.js)
- Frontend page displaying:
  - Headline performance metrics vs Nifty 50.
  - Equity curves for all 4 strategies.
  - Current open positions (ticker, company, return %, purchase price, current price).
  - Historical closed trades with exit reasons.

---

## Verification Plan

### Automated Tests
- Run `node --test test/paperTrade.test.js` to ensure the core portfolio engine works flawlessly.
- Ensure all other existing tests (186/186) continue to pass.

### Manual Verification
- Execute migrations in Supabase.
- Run a manual trigger of `/api/cron/paper-trade-tick` with a custom date override to verify full end-to-end flow.
- Confirm Telegram alerts are successfully dispatched.
