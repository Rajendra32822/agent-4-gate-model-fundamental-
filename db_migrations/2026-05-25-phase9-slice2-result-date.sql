-- Phase 9 Slice 2 — add next result date to companies.
-- Run once in Supabase SQL editor before deploying.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS next_result_date  DATE,
  ADD COLUMN IF NOT EXISTS result_date_source TEXT DEFAULT 'screener.in';
