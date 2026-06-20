-- Migration for Sprint 2: Combined Signal Engine & Telegram Alerting
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS trade_signals (
  id             BIGSERIAL PRIMARY KEY,
  ticker         TEXT NOT NULL,
  company        TEXT,
  signal_type    TEXT NOT NULL CHECK (signal_type IN ('BUY', 'SELL')),
  strategy_key   TEXT NOT NULL,
  price          NUMERIC NOT NULL,
  date           DATE NOT NULL,
  reasons        JSONB, -- Details on why the signal triggered
  status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EXECUTED', 'DISMISSED')),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_ticker_date_strategy_type UNIQUE (ticker, date, strategy_key, signal_type)
);

CREATE INDEX IF NOT EXISTS idx_trade_signals_status ON trade_signals (status);
CREATE INDEX IF NOT EXISTS idx_trade_signals_date ON trade_signals (date DESC);
