-- Migration for Phase 2: Forward Paper-Trade Test ("Strategy Lab")
-- Run this in your Supabase SQL editor before launching the cron job.

CREATE TABLE IF NOT EXISTS paper_book_meta (
  strategy_key    TEXT PRIMARY KEY,
  inception_date  DATE NOT NULL,
  initial_capital NUMERIC NOT NULL DEFAULT 1500000
);

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
