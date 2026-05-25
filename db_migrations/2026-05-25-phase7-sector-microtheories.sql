-- Phase 7 — sector microtheories. Run once in Supabase SQL editor before deploy.
-- The sectors table already exists (phase5). Add the primary-gate-metric column.
ALTER TABLE sectors ADD COLUMN IF NOT EXISTS primary_metric TEXT DEFAULT 'roce'
  CHECK (primary_metric IN ('roce','roe'));

-- Seed rows are loaded by the app's seedSectors() (admin "Seed defaults" button),
-- not here, so benchmarks stay tunable without re-running migrations.
