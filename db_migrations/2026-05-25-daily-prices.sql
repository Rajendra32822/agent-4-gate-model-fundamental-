-- Daily OHLCV price history per ticker.
-- Run once in Supabase SQL editor before deploying.

CREATE TABLE IF NOT EXISTS daily_prices (
  ticker     TEXT    NOT NULL,
  date       DATE    NOT NULL,
  open       NUMERIC,
  high       NUMERIC,
  low        NUMERIC,
  close      NUMERIC,
  adj_close  NUMERIC,
  volume     BIGINT,
  source     TEXT DEFAULT 'yahoo',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_prices_ticker ON daily_prices (ticker);
CREATE INDEX IF NOT EXISTS idx_daily_prices_date   ON daily_prices (date DESC);
