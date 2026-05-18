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
