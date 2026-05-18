-- Phase 5.1 — structured data layer.
-- Run once in Supabase SQL editor before deploying.

-- ─── Group 1: Universe & Reference ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  ticker          TEXT PRIMARY KEY,
  company_name    TEXT,
  isin            TEXT,
  sector          TEXT,
  sub_sector      TEXT,
  market_cap_tier TEXT CHECK (market_cap_tier IN ('large','mid','small','micro')),
  listing_date    DATE,
  is_active       BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sectors (
  sector            TEXT PRIMARY KEY,
  sub_sector        TEXT,
  roce_benchmark    NUMERIC,
  roe_benchmark     NUMERIC,
  notes             TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Group 2: Periodic Financials ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_annual_pl (
  ticker              TEXT NOT NULL,
  fy_end              DATE NOT NULL,
  fy_label            TEXT NOT NULL,
  sales_cr            NUMERIC,
  expenses_cr         NUMERIC,
  operating_profit_cr NUMERIC,
  opm_pct             NUMERIC,
  other_income_cr     NUMERIC,
  interest_cr         NUMERIC,
  depreciation_cr     NUMERIC,
  pbt_cr              NUMERIC,
  tax_pct             NUMERIC,
  net_profit_cr       NUMERIC,
  eps_rs              NUMERIC,
  is_consolidated     BOOLEAN DEFAULT true,
  source              TEXT DEFAULT 'screener.in',
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, fy_end)
);

CREATE TABLE IF NOT EXISTS company_annual_bs (
  ticker                    TEXT NOT NULL,
  fy_end                    DATE NOT NULL,
  fy_label                  TEXT NOT NULL,
  equity_share_capital_cr   NUMERIC,
  reserves_cr               NUMERIC,
  total_equity_cr           NUMERIC,
  long_term_borrowings_cr   NUMERIC,
  short_term_borrowings_cr  NUMERIC,
  total_debt_cr             NUMERIC,
  trade_payables_cr         NUMERIC,
  other_current_liab_cr     NUMERIC,
  fixed_assets_cr           NUMERIC,
  cwip_cr                   NUMERIC,
  investments_cr            NUMERIC,
  inventories_cr            NUMERIC,
  trade_receivables_cr      NUMERIC,
  cash_cr                   NUMERIC,
  other_current_assets_cr   NUMERIC,
  total_assets_cr           NUMERIC,
  book_value_per_share      NUMERIC,
  is_consolidated     BOOLEAN DEFAULT true,
  source              TEXT DEFAULT 'screener.in',
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, fy_end)
);

CREATE TABLE IF NOT EXISTS company_annual_cf (
  ticker              TEXT NOT NULL,
  fy_end              DATE NOT NULL,
  fy_label            TEXT NOT NULL,
  ocf_cr              NUMERIC,
  icf_cr              NUMERIC,
  ffc_cr              NUMERIC,
  net_change_cash_cr  NUMERIC,
  capex_cr            NUMERIC,
  free_cash_flow_cr   NUMERIC,
  dividends_paid_cr   NUMERIC,
  debt_raised_cr      NUMERIC,
  debt_repaid_cr      NUMERIC,
  is_consolidated     BOOLEAN DEFAULT true,
  source              TEXT DEFAULT 'screener.in',
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, fy_end)
);

CREATE TABLE IF NOT EXISTS company_quarterly_pl (
  ticker              TEXT NOT NULL,
  q_end               DATE NOT NULL,
  q_label             TEXT NOT NULL,
  sales_cr            NUMERIC,
  expenses_cr         NUMERIC,
  operating_profit_cr NUMERIC,
  opm_pct             NUMERIC,
  other_income_cr     NUMERIC,
  interest_cr         NUMERIC,
  depreciation_cr     NUMERIC,
  pbt_cr              NUMERIC,
  tax_pct             NUMERIC,
  net_profit_cr       NUMERIC,
  eps_rs              NUMERIC,
  is_consolidated     BOOLEAN DEFAULT true,
  source              TEXT DEFAULT 'screener.in',
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, q_end)
);

-- ─── Group 3: Derived & Aggregates ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_derived_annual (
  ticker            TEXT NOT NULL,
  fy_end            DATE NOT NULL,
  fy_label          TEXT NOT NULL,
  ebitda_margin_pct NUMERIC,
  pat_margin_pct    NUMERIC,
  roe_pct           NUMERIC,
  roce_pct          NUMERIC,
  roa_pct           NUMERIC,
  debt_to_equity    NUMERIC,
  interest_coverage NUMERIC,
  current_ratio     NUMERIC,
  ocf_to_pat_pct    NUMERIC,
  fcf_margin_pct    NUMERIC,
  revenue_yoy_pct   NUMERIC,
  ebitda_yoy_pct    NUMERIC,
  pat_yoy_pct       NUMERIC,
  computed_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, fy_end)
);

CREATE TABLE IF NOT EXISTS company_derived_quarterly (
  ticker            TEXT NOT NULL,
  q_end             DATE NOT NULL,
  q_label           TEXT NOT NULL,
  ebitda_margin_pct NUMERIC,
  pat_margin_pct    NUMERIC,
  revenue_yoy_pct   NUMERIC,
  ebitda_yoy_pct    NUMERIC,
  pat_yoy_pct       NUMERIC,
  revenue_qoq_pct   NUMERIC,
  pat_qoq_pct       NUMERIC,
  computed_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, q_end)
);

CREATE TABLE IF NOT EXISTS company_aggregates (
  ticker                  TEXT PRIMARY KEY,
  roce_5y_avg             NUMERIC,
  roe_5y_avg              NUMERIC,
  ebitda_margin_5y_avg    NUMERIC,
  pat_margin_5y_avg       NUMERIC,
  revenue_cagr_5y_pct     NUMERIC,
  pat_cagr_5y_pct         NUMERIC,
  ebitda_cagr_5y_pct      NUMERIC,
  revenue_cagr_10y_pct    NUMERIC,
  pat_cagr_10y_pct        NUMERIC,
  latest_annual_fy_end    DATE,
  latest_quarterly_q_end  DATE,
  annual_periods_count    INTEGER,
  quarterly_periods_count INTEGER,
  computed_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Helpful indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies (sector);
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies (is_active);
