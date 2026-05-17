-- Adds confidence score columns to fundamental_metrics for SQL-level filtering.
-- Run once in Supabase SQL editor before deploying the confidence-score feature.

ALTER TABLE fundamental_metrics
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS confidence_band  TEXT;

CREATE INDEX IF NOT EXISTS idx_fundamental_metrics_confidence_band
  ON fundamental_metrics (confidence_band);
