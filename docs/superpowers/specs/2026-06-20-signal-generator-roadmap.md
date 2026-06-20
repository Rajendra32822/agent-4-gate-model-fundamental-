# Roadmap: Combined Fundamental & Technical Signal Generator ("Signal Center")

**Date:** 2026-06-20  
**Authors:** Antigravity & Rajendra  
**Status:** PROPOSED (Awaiting final approval)  

---

## 1. Product Vision & Aligned Decisions

We will extend ValueSight from a research/ledger tool into an **actionable swing trading and investing signal generator**. The system will combine **high-conviction fundamentals** with **momentum-based technical timing**, alerting the user immediately and allowing 1-click execution.

### Key Decisions Aligned:
1. **Signal Interaction:** **Fundamentals as Quality Filter** (only evaluate top-ranked stocks passing strategy gates) + **Technicals as Timing Trigger** (determine buy/sell windows based on daily charts).
2. **Indicators Included:** 
   - *Phase 1:* RSI (14-day), EMA 20, SMA 50, SMA 200, MACD (12, 26, 9).
   - *Phase 2:* Bollinger Bands (20, 2), Volume Validation (OBV, Volume EMA).
3. **Frequency:** **Daily Swing Trading** (positions held 1 week to 2 months; evaluated nightly after market close).
4. **Signal Delivery:** Real-time **Telegram alerts** + a **Signal Center Dashboard** in the UI.
5. **Execution:** **Semi-automated Basket Export** (generate Zerodha/AngelOne compatible basket order CSVs for 1-click broker execution).

---

## 2. Database Schema (Additive)

We will introduce a table to store calculated technical indicators and a table to log generated trading signals.

```sql
-- Store nightly calculated technical indicators per ticker
CREATE TABLE IF NOT EXISTS company_technicals (
  ticker         TEXT NOT NULL,
  date           DATE NOT NULL,
  rsi            NUMERIC,
  ema_20         NUMERIC,
  sma_50         NUMERIC,
  sma_200        NUMERIC,
  macd           NUMERIC,
  macd_signal    NUMERIC,
  macd_hist      NUMERIC,
  bb_upper       NUMERIC,
  bb_lower       NUMERIC,
  volume_ema     NUMERIC,
  obv            NUMERIC,
  PRIMARY KEY (ticker, date)
);

-- Log of buy/sell signals generated
CREATE TABLE IF NOT EXISTS trade_signals (
  id             BIGSERIAL PRIMARY KEY,
  ticker         TEXT NOT NULL,
  company        TEXT,
  signal_type    TEXT NOT NULL CHECK (signal_type IN ('BUY', 'SELL')),
  strategy_key   TEXT NOT NULL,
  price          NUMERIC NOT NULL,
  date           DATE NOT NULL,
  reasons        JSONB, -- Details on which technicals triggered the signal
  status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EXECUTED', 'DISMISSED')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_technicals_date ON company_technicals (date DESC);
CREATE INDEX IF NOT EXISTS idx_trade_signals_status ON trade_signals (status);
```

---

## 3. Sprint-Wise Execution Plan

### Sprint 1: Technical Indicators Engine & Ingestion (1 Week) - ✅ COMPLETED
* **Goal:** Implement the math and calculations for all required technical indicators, storing daily indicators in the DB.
* **Tasks:**
  - [x] **[NEW] `platform/technicals.js`:** Pure helper functions to calculate RSI, EMA, SMA, and MACD from a series of historical close prices.
  - [x] **[NEW] `test/technicals.test.js`:** Write TDD unit tests verifying indicator math against standard market data values.
  - [x] **[MODIFY] `ingestion/dailyPricesRunner.js`:** Enhance price ingestion to automatically calculate daily technicals for each active ticker and upsert them to `company_technicals`.
  - [x] **[MODIFY] `index.js`:** Add database helper endpoints to query technical records.

### Sprint 2: Combined Signal Engine & Telegram Alerting (1 Week) - ✅ COMPLETED
* **Goal:** Build the signal generation logic that joins fundamentals with technical triggers, dispatching alerts.
* **Tasks:**
  - [x] **[NEW] `platform/signalEngine.js`:** Pure helper containing buy/sell trigger logic:
    - BUY Signal: Ticker is in the top-15 ranked list of an active fundamental strategy AND Price > SMA 200 (bullish filter) AND (RSI <= 35 (oversold dip) OR MACD Bullish Crossover).
    - SELL Signal: Ticker is currently held in an open position/watchlist AND (Price < SMA 50 OR RSI >= 70 (overbought) OR MACD Bearish Crossover).
  - [x] **[NEW] `test/signalEngine.test.js`:** Assert buy/sell triggers execute correctly given mock fundamentals and technical metrics.
  - [x] **[MODIFY] `index.js`:** Wire a nightly cron check that runs the signal engine after ingestion, creates `trade_signals` records, and pushes structured Telegram alerts (e.g. *"🚨 BUY SIGNAL: TCS. Rank 2 in Marshall Undervalued. RSI at 32.2. Price > 200 SMA. CMP ₹3,150. Consider buying."*).

### Sprint 3: Signal Center UI Dashboard & Basket Export (1 Week) - ✅ COMPLETED
* **Goal:** Design the frontend workspace to manage signals, mark execution, and export order baskets.
* **Tasks:**
  - [x] **[NEW] `client/src/pages/SignalCenter.js`:** Premium React dashboard containing:
    - *Active Signals Panel:* Shows buy/sell suggestions, reasons, and a status action dropdown.
    - *Historical Signals Log:* Searchable audit trail of past suggestions.
  - [x] **[NEW] `client/src/utils/basketExporter.js`:** Utility to convert pending signals into CSV formats matching:
    - **Zerodha Kite:** `TICKER,EXCHANGE,TRANSACTION_TYPE,PRODUCT,ORDER_TYPE,QUANTITY,PRICE` (e.g. `TCS,NSE,BUY,CNC,LIMIT,31,3150`).
    - **AngelOne:** Matching their basket template.
  - [x] **[MODIFY] `client/src/App.js`:** Add "Signal Center" route and nav button.

### Sprint 4: Advanced Verification & Backtester Harness (1 Week)
* **Goal:** Add Bollinger Bands and volume checks, and write a backtesting harness to check historical win rates.
* **Tasks:**
  - **[MODIFY] `platform/technicals.js`:** Add Bollinger Bands (upper/lower channel) and OBV calculations.
  - **[NEW] `platform/backtest.js`:** Add a local simulator that replays past 2-year prices, calculating what the returns, win rate, and drawdown would have been if the user had executed every signal.
  - **[NEW] `client/src/pages/BacktestPanel.js`:** Simple admin panel UI to run and view backtest reports.
