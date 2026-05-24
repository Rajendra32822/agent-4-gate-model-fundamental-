-- Phase 8 — current ratios snapshot for ranking.
-- Run once in Supabase SQL editor before deploying.

CREATE TABLE IF NOT EXISTS company_ratios (
  ticker          TEXT PRIMARY KEY,
  current_price   NUMERIC,
  market_cap_cr   NUMERIC,
  pe              NUMERIC,
  pb              NUMERIC,
  book_value      NUMERIC,
  dividend_yield  NUMERIC,
  roce_ttm        NUMERIC,
  roe_ttm         NUMERIC,
  face_value      NUMERIC,
  high_52w        NUMERIC,
  low_52w         NUMERIC,
  source          TEXT DEFAULT 'screener.in',
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);
