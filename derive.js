/**
 * Pure ratio derivation. No I/O.
 *
 * Convention: screener.in's "Operating Profit" is EBITDA-style (Sales − Expenses,
 * BEFORE depreciation/interest/tax). So:
 *   - EBITDA = operating_profit_cr
 *   - EBIT   = operating_profit_cr - depreciation_cr
 *
 * deriveAnnual({ pl, bs, cf, priorPl }) → derived ratios for one fiscal year
 * deriveQuarterly({ current, samePriorYear, priorQuarter }) → ratios for one quarter
 */

function safe(num) {
  if (num == null || !isFinite(num)) return null;
  return Number(num.toFixed(2));
}

function pctChange(current, prior) {
  if (current == null || prior == null) return null;
  if (prior === 0) return null;
  return safe(((current - prior) / Math.abs(prior)) * 100);
}

function sumIfPresent(obj, keys) {
  let total = 0;
  let found = false;
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && isFinite(v)) {
      total += Number(v);
      found = true;
    }
  }
  return found ? total : null;
}

function deriveAnnual({ pl, bs, cf, priorPl }) {
  const sales        = pl?.sales_cr ?? null;
  const opProfit     = pl?.operating_profit_cr ?? null;     // EBITDA
  const depreciation = pl?.depreciation_cr ?? 0;
  const interest     = pl?.interest_cr ?? null;
  const netProfit    = pl?.net_profit_cr ?? null;
  const ebitda       = opProfit;                            // screener convention
  const ebit         = (opProfit != null) ? opProfit - depreciation : null;

  const totalEquity  = bs?.total_equity_cr ?? null;
  const totalDebt    = bs?.total_debt_cr ?? null;
  const totalAssets  = bs?.total_assets_cr ?? null;

  const currentAssets = sumIfPresent(bs, ['inventories_cr','trade_receivables_cr','cash_cr','other_current_assets_cr']);
  const currentLiab   = sumIfPresent(bs, ['trade_payables_cr','other_current_liab_cr']);
  const capitalEmployed = (totalEquity != null && totalDebt != null) ? totalEquity + totalDebt : null;

  const ocf = cf?.ocf_cr ?? null;
  const fcf = cf?.free_cash_flow_cr ?? null;

  return {
    ebitda_margin_pct: ebitda != null && sales ? safe((ebitda / sales) * 100) : null,
    pat_margin_pct:    netProfit != null && sales ? safe((netProfit / sales) * 100) : null,
    roe_pct:           netProfit != null && totalEquity ? safe((netProfit / totalEquity) * 100) : null,
    roce_pct:          ebit != null && capitalEmployed ? safe((ebit / capitalEmployed) * 100) : null,
    roa_pct:           netProfit != null && totalAssets ? safe((netProfit / totalAssets) * 100) : null,
    debt_to_equity:    totalDebt != null && totalEquity ? safe(totalDebt / totalEquity) : null,
    interest_coverage: ebit != null && interest ? safe(ebit / interest) : null,
    current_ratio:     currentAssets != null && currentLiab ? safe(currentAssets / currentLiab) : null,
    ocf_to_pat_pct:    ocf != null && netProfit ? safe((ocf / netProfit) * 100) : null,
    fcf_margin_pct:    fcf != null && sales ? safe((fcf / sales) * 100) : null,
    revenue_yoy_pct:   pctChange(sales,     priorPl?.sales_cr),
    ebitda_yoy_pct:    pctChange(opProfit,  priorPl?.operating_profit_cr),
    pat_yoy_pct:       pctChange(netProfit, priorPl?.net_profit_cr),
  };
}

function deriveQuarterly({ current, samePriorYear, priorQuarter }) {
  const sales     = current?.sales_cr ?? null;
  const opProfit  = current?.operating_profit_cr ?? null;
  const netProfit = current?.net_profit_cr ?? null;

  return {
    ebitda_margin_pct: opProfit != null && sales ? safe((opProfit / sales) * 100) : null,
    pat_margin_pct:    netProfit != null && sales ? safe((netProfit / sales) * 100) : null,
    revenue_yoy_pct:   pctChange(sales,     samePriorYear?.sales_cr),
    ebitda_yoy_pct:    pctChange(opProfit,  samePriorYear?.operating_profit_cr),
    pat_yoy_pct:       pctChange(netProfit, samePriorYear?.net_profit_cr),
    revenue_qoq_pct:   pctChange(sales,     priorQuarter?.sales_cr),
    pat_qoq_pct:       pctChange(netProfit, priorQuarter?.net_profit_cr),
  };
}

module.exports = { deriveAnnual, deriveQuarterly };
