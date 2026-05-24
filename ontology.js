/**
 * Financial ontology — single source of truth for every metric in ValueSight.
 * Pure module, no I/O. One entry per metric CONCEPT (not per field): a concept
 * is defined once even when it materialises as several fields (e.g. ROCE →
 * roce_pct, roce_5y_avg, roce_ttm). `fields` maps a concept to the actual
 * column / JS field names already used by the scraper, derive.js and aggregate.js
 * — nothing is renamed.
 *
 * Shallow registry: `formula` is documentation, not executed. The no-drift test
 * (test/ontology-nodrift.test.js) guards field/key drift, which is what bites.
 */

// ── Unit display rules (defined once) ───────────────────────────────────────
const UNITS = {
  percent:   (n) => `${Number(n.toFixed(1))}%`,
  ratio:     (n) => `${n.toFixed(2)}`,
  x:         (n) => `${n.toFixed(2)}×`,
  rupees_cr: (n) => `₹${Number(n.toFixed(0)).toLocaleString('en-IN')} Cr`,
  rupees:    (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
};

// ── ROCE sector benchmarks (ordered to render the prompt table verbatim) ─────
// Captured from marshallPrompt.js prose. Phase 7 moves this into a DB table.
const ROCE_SECTOR_BENCHMARKS = [
  { sector: 'IT / Software / SaaS',                  min: 30 },
  { sector: 'FMCG / Consumer Brands',                min: 25 },
  { sector: 'Pharma / Healthcare Services',          min: 20 },
  { sector: 'Retail / D2C / QSR',                    min: 18 },
  { sector: 'General Manufacturing / Capital Goods', min: 15 },
  { sector: 'Infrastructure / Real Estate / EPC',    min: null, note: 'Not applicable — use asset turnover + ROE instead' },
  { sector: 'Financial Services / NBFC / Banks',     min: null, note: 'Not applicable — use ROE ≥ 15% and NIM instead' },
];

// Helper to keep raw_* (passthrough) entries terse.
const raw = (key, label, family, unit, direction, fields, extra = {}) =>
  ({ key, label, family, unit, direction, fields, ...extra });

const METRICS = {
  // ── raw_pl (11) — parsePlSection → company_annual_pl / company_quarterly_pl ──
  sales:            raw('sales', 'Sales / Revenue', 'raw_pl', 'rupees_cr', 'higher_better', { annual: 'sales_cr', quarterly: 'sales_cr' }),
  expenses:         raw('expenses', 'Operating Expenses', 'raw_pl', 'rupees_cr', 'neutral', { annual: 'expenses_cr', quarterly: 'expenses_cr' }),
  operating_profit: raw('operating_profit', 'Operating Profit (EBITDA-style)', 'raw_pl', 'rupees_cr', 'higher_better', { annual: 'operating_profit_cr', quarterly: 'operating_profit_cr' },
                        { description: "screener.in 'Operating Profit' = Sales − Expenses, BEFORE D&A (EBITDA-style). derive.js: EBITDA = this; EBIT = this − depreciation." }),
  opm:              raw('opm', 'Operating Profit Margin', 'raw_pl', 'percent', 'higher_better', { annual: 'opm_pct', quarterly: 'opm_pct' }),
  other_income:     raw('other_income', 'Other Income', 'raw_pl', 'rupees_cr', 'neutral', { annual: 'other_income_cr', quarterly: 'other_income_cr' }),
  interest:         raw('interest', 'Interest Expense', 'raw_pl', 'rupees_cr', 'lower_better', { annual: 'interest_cr', quarterly: 'interest_cr' }),
  depreciation:     raw('depreciation', 'Depreciation & Amortisation', 'raw_pl', 'rupees_cr', 'neutral', { annual: 'depreciation_cr', quarterly: 'depreciation_cr' }),
  pbt:              raw('pbt', 'Profit Before Tax', 'raw_pl', 'rupees_cr', 'higher_better', { annual: 'pbt_cr', quarterly: 'pbt_cr' }),
  tax_rate:         raw('tax_rate', 'Effective Tax Rate', 'raw_pl', 'percent', 'neutral', { annual: 'tax_pct', quarterly: 'tax_pct' }),
  net_profit:       raw('net_profit', 'Net Profit (PAT)', 'raw_pl', 'rupees_cr', 'higher_better', { annual: 'net_profit_cr', quarterly: 'net_profit_cr' }),
  eps:              raw('eps', 'Earnings Per Share', 'raw_pl', 'rupees', 'higher_better', { annual: 'eps_rs', quarterly: 'eps_rs' }),

  // ── raw_bs (17) — parseBsSection → company_annual_bs ──
  equity_share_capital:      raw('equity_share_capital', 'Equity Share Capital', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'equity_share_capital_cr' }),
  reserves:                  raw('reserves', 'Reserves', 'raw_bs', 'rupees_cr', 'higher_better', { annual: 'reserves_cr' }),
  total_equity:              raw('total_equity', 'Total Equity', 'raw_bs', 'rupees_cr', 'higher_better', { annual: 'total_equity_cr' }),
  long_term_borrowings:      raw('long_term_borrowings', 'Long-term Borrowings', 'raw_bs', 'rupees_cr', 'lower_better', { annual: 'long_term_borrowings_cr' }),
  short_term_borrowings:     raw('short_term_borrowings', 'Short-term Borrowings', 'raw_bs', 'rupees_cr', 'lower_better', { annual: 'short_term_borrowings_cr' }),
  total_debt:                raw('total_debt', 'Total Debt', 'raw_bs', 'rupees_cr', 'lower_better', { annual: 'total_debt_cr' }),
  trade_payables:            raw('trade_payables', 'Trade Payables', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'trade_payables_cr' }),
  other_current_liabilities: raw('other_current_liabilities', 'Other Current Liabilities', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'other_current_liab_cr' }),
  fixed_assets:              raw('fixed_assets', 'Fixed Assets', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'fixed_assets_cr' }),
  cwip:                      raw('cwip', 'Capital Work in Progress', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'cwip_cr' }),
  investments:               raw('investments', 'Investments', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'investments_cr' }),
  inventories:               raw('inventories', 'Inventories', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'inventories_cr' }),
  trade_receivables:         raw('trade_receivables', 'Trade Receivables', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'trade_receivables_cr' }),
  cash:                      raw('cash', 'Cash & Equivalents', 'raw_bs', 'rupees_cr', 'higher_better', { annual: 'cash_cr' }),
  other_current_assets:      raw('other_current_assets', 'Other Current Assets', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'other_current_assets_cr' }),
  total_assets:              raw('total_assets', 'Total Assets', 'raw_bs', 'rupees_cr', 'neutral', { annual: 'total_assets_cr' }),
  book_value_per_share:      raw('book_value_per_share', 'Book Value per Share', 'raw_bs', 'rupees', 'higher_better', { annual: 'book_value_per_share', ttm: 'book_value' }),

  // ── raw_cf (9) — parseCfSection → company_annual_cf ──
  ocf:             raw('ocf', 'Operating Cash Flow', 'raw_cf', 'rupees_cr', 'higher_better', { annual: 'ocf_cr' }),
  icf:             raw('icf', 'Investing Cash Flow', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'icf_cr' }),
  ffc:             raw('ffc', 'Financing Cash Flow', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'ffc_cr' }),
  net_change_cash: raw('net_change_cash', 'Net Change in Cash', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'net_change_cash_cr' }),
  capex:           raw('capex', 'Capital Expenditure', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'capex_cr' }),
  free_cash_flow:  raw('free_cash_flow', 'Free Cash Flow', 'raw_cf', 'rupees_cr', 'higher_better', { annual: 'free_cash_flow_cr' }),
  dividends_paid:  raw('dividends_paid', 'Dividends Paid', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'dividends_paid_cr' }),
  debt_raised:     raw('debt_raised', 'Debt Raised', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'debt_raised_cr' }),
  debt_repaid:     raw('debt_repaid', 'Debt Repaid', 'raw_cf', 'rupees_cr', 'neutral', { annual: 'debt_repaid_cr' }),

  // ── derived (15) — derive.js ──
  ebitda_margin: { key: 'ebitda_margin', label: 'EBITDA Margin', short: 'EBITDA Margin', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Operating Profit / Sales', dependsOn: ['operating_profit', 'sales'],
    description: 'Operating profitability before D&A.',
    fields: { annual: 'ebitda_margin_pct', quarterly: 'ebitda_margin_pct', aggregate: 'ebitda_margin_5y_avg' } },
  pat_margin: { key: 'pat_margin', label: 'PAT Margin', short: 'PAT Margin', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Net Profit / Sales', dependsOn: ['net_profit', 'sales'],
    description: 'Net profitability after all costs and tax.',
    fields: { annual: 'pat_margin_pct', quarterly: 'pat_margin_pct', aggregate: 'pat_margin_5y_avg' } },
  roe: { key: 'roe', label: 'Return on Equity', short: 'ROE', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Net Profit / Total Equity', dependsOn: ['net_profit', 'total_equity'],
    description: 'Return generated on shareholder capital. Marshall gate for financial-sector businesses.',
    benchmark: { default: 15 },
    fields: { annual: 'roe_pct', aggregate: 'roe_5y_avg', ttm: 'roe_ttm' } },
  roce: { key: 'roce', label: 'Return on Capital Employed', short: 'ROCE', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'EBIT / (Total Equity + Total Debt)', dependsOn: ['operating_profit', 'depreciation', 'total_equity', 'total_debt'],
    description: "How efficiently the business converts all capital into operating profit. Marshall's primary quality gate.",
    benchmark: { default: 15, bySector: ROCE_SECTOR_BENCHMARKS },
    fields: { annual: 'roce_pct', aggregate: 'roce_5y_avg', ttm: 'roce_ttm' } },
  roa: { key: 'roa', label: 'Return on Assets', short: 'ROA', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Net Profit / Total Assets', dependsOn: ['net_profit', 'total_assets'],
    fields: { annual: 'roa_pct' } },
  debt_to_equity: { key: 'debt_to_equity', label: 'Debt to Equity', short: 'D/E', family: 'derived', unit: 'x', direction: 'lower_better',
    formula: 'Total Debt / Total Equity', dependsOn: ['total_debt', 'total_equity'],
    fields: { annual: 'debt_to_equity' } },
  interest_coverage: { key: 'interest_coverage', label: 'Interest Coverage', short: 'Int. Cov.', family: 'derived', unit: 'x', direction: 'higher_better',
    formula: 'EBIT / Interest', dependsOn: ['operating_profit', 'depreciation', 'interest'],
    fields: { annual: 'interest_coverage' } },
  current_ratio: { key: 'current_ratio', label: 'Current Ratio', short: 'Curr. Ratio', family: 'derived', unit: 'ratio', direction: 'higher_better',
    formula: 'Current Assets / Current Liabilities',
    dependsOn: ['inventories', 'trade_receivables', 'cash', 'other_current_assets', 'trade_payables', 'other_current_liabilities'],
    fields: { annual: 'current_ratio' } },
  ocf_to_pat: { key: 'ocf_to_pat', label: 'OCF to PAT', short: 'OCF/PAT', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Operating Cash Flow / Net Profit', dependsOn: ['ocf', 'net_profit'],
    description: 'Cash-backing of reported profit; low values flag earnings quality.',
    fields: { annual: 'ocf_to_pat_pct' } },
  fcf_margin: { key: 'fcf_margin', label: 'FCF Margin', short: 'FCF Margin', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: 'Free Cash Flow / Sales', dependsOn: ['free_cash_flow', 'sales'],
    fields: { annual: 'fcf_margin_pct' } },
  revenue_yoy: { key: 'revenue_yoy', label: 'Revenue Growth YoY', short: 'Rev YoY', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(Sales − Prior Sales) / |Prior Sales|', dependsOn: ['sales'],
    fields: { annual: 'revenue_yoy_pct', quarterly: 'revenue_yoy_pct' } },
  ebitda_yoy: { key: 'ebitda_yoy', label: 'EBITDA Growth YoY', short: 'EBITDA YoY', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(OP − Prior OP) / |Prior OP|', dependsOn: ['operating_profit'],
    fields: { annual: 'ebitda_yoy_pct', quarterly: 'ebitda_yoy_pct' } },
  pat_yoy: { key: 'pat_yoy', label: 'PAT Growth YoY', short: 'PAT YoY', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(PAT − Prior PAT) / |Prior PAT|', dependsOn: ['net_profit'],
    fields: { annual: 'pat_yoy_pct', quarterly: 'pat_yoy_pct' } },
  revenue_qoq: { key: 'revenue_qoq', label: 'Revenue Growth QoQ', short: 'Rev QoQ', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(Sales − Prior Quarter Sales) / |Prior Quarter Sales|', dependsOn: ['sales'],
    fields: { quarterly: 'revenue_qoq_pct' } },
  pat_qoq: { key: 'pat_qoq', label: 'PAT Growth QoQ', short: 'PAT QoQ', family: 'derived', unit: 'percent', direction: 'higher_better',
    formula: '(PAT − Prior Quarter PAT) / |Prior Quarter PAT|', dependsOn: ['net_profit'],
    fields: { quarterly: 'pat_qoq_pct' } },

  // ── valuation (8) — parseTopRatios ──
  current_price:  raw('current_price', 'Current Price', 'valuation', 'rupees', 'neutral', { ttm: 'current_price' }),
  market_cap:     raw('market_cap', 'Market Capitalisation', 'valuation', 'rupees_cr', 'neutral', { ttm: 'market_cap_cr' }),
  pe:             raw('pe', 'Price to Earnings', 'valuation', 'x', 'lower_better', { ttm: 'pe' }),
  pb:             raw('pb', 'Price to Book', 'valuation', 'x', 'lower_better', { ttm: 'pb' }),
  dividend_yield: raw('dividend_yield', 'Dividend Yield', 'valuation', 'percent', 'higher_better', { ttm: 'dividend_yield' }),
  face_value:     raw('face_value', 'Face Value', 'valuation', 'rupees', 'neutral', { ttm: 'face_value' }),
  high_52w:       raw('high_52w', '52-Week High', 'valuation', 'rupees', 'neutral', { ttm: 'high_52w' }),
  low_52w:        raw('low_52w', '52-Week Low', 'valuation', 'rupees', 'neutral', { ttm: 'low_52w' }),

  // ── aggregate (5) — aggregate.js CAGRs ──
  revenue_cagr_5y:  { key: 'revenue_cagr_5y', label: 'Revenue CAGR 5y', short: 'Rev CAGR 5y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 5y', dependsOn: ['sales'], fields: { aggregate: 'revenue_cagr_5y_pct' } },
  pat_cagr_5y:      { key: 'pat_cagr_5y', label: 'PAT CAGR 5y', short: 'PAT CAGR 5y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 5y', dependsOn: ['net_profit'], fields: { aggregate: 'pat_cagr_5y_pct' } },
  ebitda_cagr_5y:   { key: 'ebitda_cagr_5y', label: 'EBITDA CAGR 5y', short: 'EBITDA CAGR 5y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 5y', dependsOn: ['operating_profit'], fields: { aggregate: 'ebitda_cagr_5y_pct' } },
  revenue_cagr_10y: { key: 'revenue_cagr_10y', label: 'Revenue CAGR 10y', short: 'Rev CAGR 10y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 10y', dependsOn: ['sales'], fields: { aggregate: 'revenue_cagr_10y_pct' } },
  pat_cagr_10y:     { key: 'pat_cagr_10y', label: 'PAT CAGR 10y', short: 'PAT CAGR 10y', family: 'aggregate', unit: 'percent', direction: 'higher_better',
    formula: '(latest/earliest)^(1/years) − 1 over 10y', dependsOn: ['net_profit'], fields: { aggregate: 'pat_cagr_10y_pct' } },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const METRIC_KEYS = Object.keys(METRICS);

function get(key) {
  return METRICS[key] || null;
}

function format(key, value) {
  if (value == null || !isFinite(value)) return 'n/a';
  const m = METRICS[key];
  if (!m) return String(value);
  return UNITS[m.unit](Number(value));
}

function byFamily(family) {
  return Object.values(METRICS).filter(m => m.family === family);
}

// benchmark(key)            → default numeric benchmark, or null if none
// benchmark(key, sector)    → sector min if listed; null if sector listed as na;
//                             default if sector not listed
function benchmark(key, sector) {
  const b = METRICS[key]?.benchmark;
  if (!b) return null;
  if (sector == null) return b.default ?? null;
  const row = (b.bySector || []).find(r => r.sector === sector);
  if (!row) return b.default ?? null;
  return row.min;   // number, or null for na rows
}

// Reverse index: actual field name → concept key. Used by the no-drift test.
const FIELD_TO_METRIC = {};
for (const m of Object.values(METRICS)) {
  for (const fieldName of Object.values(m.fields)) {
    FIELD_TO_METRIC[fieldName] = m.key;
  }
}
function fieldToMetric(fieldName) {
  return FIELD_TO_METRIC[fieldName] || null;
}

// Render the ROCE sector benchmark markdown table (matches marshallPrompt.js).
function buildBenchmarkTable() {
  const lines = ['| Sector | Minimum ROCE for PASS |', '|---|---|'];
  for (const r of ROCE_SECTOR_BENCHMARKS) {
    const right = r.min != null ? `≥ ${r.min}%` : r.note;
    lines.push(`| ${r.sector} | ${right} |`);
  }
  return lines.join('\n');
}

module.exports = { METRICS, METRIC_KEYS, UNITS, get, format, byFamily, benchmark, fieldToMetric, buildBenchmarkTable };
