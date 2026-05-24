-- Phase 5.2 — shareholding + ingestion coverage tracking.
-- Run once in Supabase SQL editor before deploying.

CREATE TABLE IF NOT EXISTS company_shareholding (
  ticker          TEXT NOT NULL,
  period_end      DATE NOT NULL,
  period_label    TEXT,
  promoter_pct    NUMERIC,
  pledge_pct      NUMERIC,
  fii_pct         NUMERIC,
  dii_pct         NUMERIC,
  government_pct  NUMERIC,
  public_pct      NUMERIC,
  shareholders    INTEGER,
  source          TEXT DEFAULT 'screener.in',
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, period_end)
);
CREATE INDEX IF NOT EXISTS idx_shareholding_ticker ON company_shareholding (ticker, period_end DESC);

-- Ingestion tracking columns on companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS last_ingested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ingest_status TEXT DEFAULT 'pending'
    CHECK (ingest_status IN ('pending','ok','failed')),
  ADD COLUMN IF NOT EXISTS ingest_error TEXT;
