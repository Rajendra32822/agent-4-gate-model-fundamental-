const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../aggregate');

test('aggregate: 5-year averages', () => {
  const annualDerived = [
    { fy_end: '2026-03-31', roce_pct: 22, roe_pct: 18, ebitda_margin_pct: 20, pat_margin_pct: 12 },
    { fy_end: '2025-03-31', roce_pct: 20, roe_pct: 17, ebitda_margin_pct: 19, pat_margin_pct: 11 },
    { fy_end: '2024-03-31', roce_pct: 18, roe_pct: 16, ebitda_margin_pct: 18, pat_margin_pct: 10 },
    { fy_end: '2023-03-31', roce_pct: 16, roe_pct: 15, ebitda_margin_pct: 17, pat_margin_pct:  9 },
    { fy_end: '2022-03-31', roce_pct: 14, roe_pct: 14, ebitda_margin_pct: 16, pat_margin_pct:  8 },
  ];
  const annualPl = [
    { fy_end: '2026-03-31', sales_cr: 1500, net_profit_cr: 180, operating_profit_cr: 300 },
    { fy_end: '2025-03-31', sales_cr: 1300, net_profit_cr: 145, operating_profit_cr: 250 },
    { fy_end: '2024-03-31', sales_cr: 1100, net_profit_cr: 110, operating_profit_cr: 200 },
    { fy_end: '2023-03-31', sales_cr:  950, net_profit_cr:  85, operating_profit_cr: 165 },
    { fy_end: '2022-03-31', sales_cr:  800, net_profit_cr:  64, operating_profit_cr: 130 },
  ];
  const r = aggregate('X', annualPl, annualDerived, []);
  assert.equal(r.roce_5y_avg, 18);
  assert.equal(r.roe_5y_avg, 16);
  assert.equal(r.ebitda_margin_5y_avg, 18);
  assert.equal(r.pat_margin_5y_avg, 10);
  assert.ok(Math.abs(r.revenue_cagr_5y_pct - 17.0) < 0.5);
  assert.ok(Math.abs(r.pat_cagr_5y_pct - 29.5) < 1.0);
  assert.equal(r.latest_annual_fy_end, '2026-03-31');
  assert.equal(r.annual_periods_count, 5);
});

test('aggregate: fewer than 5 years uses what is available', () => {
  const r = aggregate('X',
    [
      { fy_end: '2026-03-31', sales_cr: 1500, net_profit_cr: 180 },
      { fy_end: '2025-03-31', sales_cr: 1300, net_profit_cr: 145 },
    ],
    [
      { fy_end: '2026-03-31', roce_pct: 22, roe_pct: 18, ebitda_margin_pct: 20, pat_margin_pct: 12 },
      { fy_end: '2025-03-31', roce_pct: 20, roe_pct: 17, ebitda_margin_pct: 19, pat_margin_pct: 11 },
    ],
    []
  );
  assert.equal(r.roce_5y_avg, 21);
  assert.equal(r.annual_periods_count, 2);
  assert.ok(Math.abs(r.revenue_cagr_5y_pct - 15.38) < 0.1);
});

test('aggregate: empty inputs returns nulls but ticker preserved', () => {
  const r = aggregate('X', [], [], []);
  assert.equal(r.ticker, 'X');
  assert.equal(r.roce_5y_avg, null);
  assert.equal(r.revenue_cagr_5y_pct, null);
  assert.equal(r.annual_periods_count, 0);
});

test('aggregate: latest quarter tracked', () => {
  const r = aggregate('X', [], [], [{ q_end: '2026-06-30', q_label: 'Q1FY27' }]);
  assert.equal(r.latest_quarterly_q_end, '2026-06-30');
  assert.equal(r.quarterly_periods_count, 1);
});
