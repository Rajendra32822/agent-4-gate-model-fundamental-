const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveAnnual,
  deriveQuarterly,
} = require('../derive');

test('deriveAnnual: full year with prior year for YoY', () => {
  const pl = {
    ticker: 'X', fy_end: '2026-03-31', fy_label: 'FY26',
    sales_cr: 1000, operating_profit_cr: 200, depreciation_cr: 50,
    interest_cr: 20, net_profit_cr: 120,
  };
  const bs = {
    ticker: 'X', fy_end: '2026-03-31', fy_label: 'FY26',
    total_equity_cr: 800, total_debt_cr: 200, total_assets_cr: 1200,
    inventories_cr: 100, trade_receivables_cr: 150, cash_cr: 50,
    other_current_assets_cr: 50,
    trade_payables_cr: 80, other_current_liab_cr: 70,
  };
  const cf = {
    ticker: 'X', fy_end: '2026-03-31', fy_label: 'FY26',
    ocf_cr: 150, free_cash_flow_cr: 90,
  };
  const priorPl = {
    sales_cr: 800, operating_profit_cr: 150, net_profit_cr: 90,
  };

  const r = deriveAnnual({ pl, bs, cf, priorPl });

  assert.equal(r.ebitda_margin_pct, 20);    // op_profit / sales = 200/1000 (op_profit IS EBITDA convention)
  assert.equal(r.pat_margin_pct, 12);
  assert.equal(r.roe_pct, 15);
  // EBIT = op_profit - depreciation = 150. ROCE = 150 / 1000 = 15%
  assert.equal(r.roce_pct, 15);
  assert.equal(r.roa_pct, 10);
  assert.equal(r.debt_to_equity, 0.25);
  // Interest coverage = EBIT/interest = 150/20 = 7.5
  assert.equal(r.interest_coverage, 7.5);
  // CA = 100+150+50+50 = 350. CL = 80+70 = 150. Ratio = 2.33
  assert.equal(r.current_ratio, 2.33);
  assert.equal(r.ocf_to_pat_pct, 125);
  assert.equal(r.fcf_margin_pct, 9);
  assert.equal(r.revenue_yoy_pct, 25);
  assert.equal(r.pat_yoy_pct, 33.33);
});

test('deriveAnnual: handles missing prior year (no YoY)', () => {
  const r = deriveAnnual({
    pl: { sales_cr: 1000, operating_profit_cr: 200, net_profit_cr: 120 },
    bs: { total_equity_cr: 800, total_debt_cr: 200, total_assets_cr: 1200 },
    cf: { ocf_cr: 150, free_cash_flow_cr: 90 },
    priorPl: null,
  });
  assert.equal(r.revenue_yoy_pct, null);
  assert.equal(r.pat_yoy_pct, null);
});

test('deriveAnnual: handles missing BS (returns null ratios)', () => {
  const r = deriveAnnual({
    pl: { sales_cr: 1000, operating_profit_cr: 200, net_profit_cr: 120 },
    bs: null, cf: null, priorPl: null,
  });
  assert.equal(r.roe_pct, null);
  assert.equal(r.roce_pct, null);
  assert.equal(r.debt_to_equity, null);
  assert.equal(r.pat_margin_pct, 12);
});

test('deriveAnnual: zero division produces null', () => {
  const r = deriveAnnual({
    pl: { sales_cr: 0, operating_profit_cr: 0, net_profit_cr: 0 },
    bs: { total_equity_cr: 0, total_debt_cr: 0, total_assets_cr: 0 },
    cf: { ocf_cr: 0, free_cash_flow_cr: 0 },
    priorPl: null,
  });
  assert.equal(r.pat_margin_pct, null);
  assert.equal(r.roe_pct, null);
});

test('deriveQuarterly: YoY + QoQ', () => {
  const r = deriveQuarterly({
    current:    { sales_cr: 100, operating_profit_cr: 20, net_profit_cr: 12 },
    samePriorYear: { sales_cr: 80,  operating_profit_cr: 16, net_profit_cr: 8 },
    priorQuarter:  { sales_cr: 95,  operating_profit_cr: 19, net_profit_cr: 11 },
  });
  assert.equal(r.revenue_yoy_pct, 25);
  assert.equal(r.pat_yoy_pct, 50);
  assert.equal(r.revenue_qoq_pct, 5.26);
  assert.equal(r.ebitda_margin_pct, 20);
});

test('deriveQuarterly: missing prior periods returns nulls', () => {
  const r = deriveQuarterly({
    current: { sales_cr: 100, operating_profit_cr: 20, net_profit_cr: 12 },
    samePriorYear: null,
    priorQuarter: null,
  });
  assert.equal(r.revenue_yoy_pct, null);
  assert.equal(r.revenue_qoq_pct, null);
  assert.equal(r.ebitda_margin_pct, 20);
});
