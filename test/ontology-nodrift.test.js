const { test } = require('node:test');
const assert = require('node:assert');
const ont = require('../ontology');
const { deriveAnnual, deriveQuarterly } = require('../derive');
const { aggregate } = require('../aggregate');

// Non-metric bookkeeping keys that aggregate.js emits — intentionally not in the ontology.
const AGGREGATE_ALLOWLIST = new Set([
  'ticker', 'latest_annual_fy_end', 'latest_quarterly_q_end',
  'annual_periods_count', 'quarterly_periods_count',
]);

function assertAllMapped(obj, allowlist = new Set()) {
  for (const fieldName of Object.keys(obj)) {
    if (allowlist.has(fieldName)) continue;
    assert.ok(
      ont.fieldToMetric(fieldName),
      `Field "${fieldName}" has no ontology entry — register it in ontology.js`
    );
  }
}

test('every deriveAnnual output field is in the ontology', () => {
  const pl  = { sales_cr: 1000, expenses_cr: 700, operating_profit_cr: 300, depreciation_cr: 50, interest_cr: 20, net_profit_cr: 180 };
  const bs  = { total_equity_cr: 900, total_debt_cr: 200, total_assets_cr: 1500, inventories_cr: 100, trade_receivables_cr: 80, cash_cr: 60, other_current_assets_cr: 10, trade_payables_cr: 70, other_current_liab_cr: 30 };
  const cf  = { ocf_cr: 200, free_cash_flow_cr: 150 };
  const out = deriveAnnual({ pl, bs, cf, priorPl: { sales_cr: 900, operating_profit_cr: 270, net_profit_cr: 150 } });
  assertAllMapped(out);
});

test('every deriveQuarterly output field is in the ontology', () => {
  const out = deriveQuarterly({
    current: { sales_cr: 300, operating_profit_cr: 90, net_profit_cr: 50 },
    samePriorYear: { sales_cr: 250, operating_profit_cr: 70, net_profit_cr: 40 },
    priorQuarter: { sales_cr: 280, net_profit_cr: 48 },
  });
  assertAllMapped(out);
});

test('every aggregate output field is in the ontology (minus bookkeeping)', () => {
  const annualPl = [
    { fy_end: '2024-03-31', sales_cr: 1000, operating_profit_cr: 300, net_profit_cr: 180 },
    { fy_end: '2020-03-31', sales_cr: 600,  operating_profit_cr: 180, net_profit_cr: 100 },
  ];
  const annualDerived = [
    { fy_end: '2024-03-31', roce_pct: 25, roe_pct: 20, ebitda_margin_pct: 30, pat_margin_pct: 18 },
    { fy_end: '2020-03-31', roce_pct: 22, roe_pct: 18, ebitda_margin_pct: 28, pat_margin_pct: 16 },
  ];
  const out = aggregate('TCS', annualPl, annualDerived, []);
  assertAllMapped(out, AGGREGATE_ALLOWLIST);
});
