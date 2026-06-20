-- Migration for Sprint 1: Technical Indicators Engine
-- Run this in your Supabase SQL editor.

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

CREATE INDEX IF NOT EXISTS idx_company_technicals_date ON company_technicals (date DESC);
CREATE INDEX IF NOT EXISTS idx_company_technicals_ticker ON company_technicals (ticker);
