-- Phase 9 Slice 1 — corporate actions ledger + ticker history. Run once in Supabase.
CREATE TABLE IF NOT EXISTS corporate_actions (
  id                BIGSERIAL PRIMARY KEY,
  ticker            TEXT NOT NULL,
  event_type        TEXT NOT NULL CHECK (event_type IN
                      ('SPLIT','BONUS','RIGHTS','BUYBACK','DIVIDEND','MERGER','DEMERGER','NAME_CHANGE','TICKER_CHANGE')),
  status            TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','dismissed')),
  ratio             TEXT,
  ex_date           DATE,
  announcement_date DATE,
  record_date       DATE,
  new_ticker        TEXT,
  new_name          TEXT,
  linked_ticker     TEXT,
  amount            NUMERIC,
  notes             TEXT,
  source            TEXT DEFAULT 'manual',
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_ticker ON corporate_actions (ticker);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_status ON corporate_actions (status);

CREATE TABLE IF NOT EXISTS ticker_history (
  id          BIGSERIAL PRIMARY KEY,
  old_ticker  TEXT NOT NULL,
  new_ticker  TEXT NOT NULL,
  change_date DATE,
  reason      TEXT,
  action_id   BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticker_history_old ON ticker_history (old_ticker);
