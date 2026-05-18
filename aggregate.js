/**
 * Pure aggregation. No I/O.
 *
 * aggregate(ticker, annualPl, annualDerived, quarterlyPl) →
 *   per-ticker { roce_5y_avg, ..., revenue_cagr_5y_pct, ... }
 *
 * Inputs are sorted defensively (newest first). Missing data produces nulls.
 */

function safe(num) {
  if (num == null || !isFinite(num)) return null;
  return Number(num.toFixed(2));
}

function mean(arr) {
  const nums = arr.filter(v => v != null && isFinite(v));
  if (nums.length === 0) return null;
  return safe(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function cagr(latest, earliest, years) {
  if (latest == null || earliest == null) return null;
  if (earliest <= 0 || years <= 0) return null;
  const ratio = latest / earliest;
  if (!isFinite(ratio) || ratio <= 0) return null;
  return safe((Math.pow(ratio, 1 / years) - 1) * 100);
}

function sortDesc(rows, key) {
  return [...rows].sort((a, b) => String(b[key]).localeCompare(String(a[key])));
}

function aggregate(ticker, annualPl, annualDerived, quarterlyPl) {
  const sortedPl = sortDesc(annualPl || [], 'fy_end');
  const sortedDr = sortDesc(annualDerived || [], 'fy_end');
  const sortedQ  = sortDesc(quarterlyPl || [], 'q_end');

  const last5Pl = sortedPl.slice(0, 5);
  const last5Dr = sortedDr.slice(0, 5);

  const roce_5y_avg          = mean(last5Dr.map(r => r.roce_pct));
  const roe_5y_avg           = mean(last5Dr.map(r => r.roe_pct));
  const ebitda_margin_5y_avg = mean(last5Dr.map(r => r.ebitda_margin_pct));
  const pat_margin_5y_avg    = mean(last5Dr.map(r => r.pat_margin_pct));

  const revenue_cagr_5y_pct = last5Pl.length >= 2
    ? cagr(last5Pl[0]?.sales_cr,       last5Pl[last5Pl.length - 1]?.sales_cr,       last5Pl.length - 1)
    : null;
  const pat_cagr_5y_pct = last5Pl.length >= 2
    ? cagr(last5Pl[0]?.net_profit_cr,  last5Pl[last5Pl.length - 1]?.net_profit_cr,  last5Pl.length - 1)
    : null;
  const ebitda_cagr_5y_pct = last5Pl.length >= 2
    ? cagr(last5Pl[0]?.operating_profit_cr, last5Pl[last5Pl.length - 1]?.operating_profit_cr, last5Pl.length - 1)
    : null;

  const last10Pl = sortedPl.slice(0, 10);
  const revenue_cagr_10y_pct = last10Pl.length >= 2
    ? cagr(last10Pl[0]?.sales_cr,       last10Pl[last10Pl.length - 1]?.sales_cr,       last10Pl.length - 1)
    : null;
  const pat_cagr_10y_pct = last10Pl.length >= 2
    ? cagr(last10Pl[0]?.net_profit_cr,  last10Pl[last10Pl.length - 1]?.net_profit_cr,  last10Pl.length - 1)
    : null;

  return {
    ticker,
    roce_5y_avg,
    roe_5y_avg,
    ebitda_margin_5y_avg,
    pat_margin_5y_avg,
    revenue_cagr_5y_pct,
    pat_cagr_5y_pct,
    ebitda_cagr_5y_pct,
    revenue_cagr_10y_pct,
    pat_cagr_10y_pct,
    latest_annual_fy_end:    sortedPl[0]?.fy_end ?? null,
    latest_quarterly_q_end:  sortedQ[0]?.q_end ?? null,
    annual_periods_count:    sortedPl.length,
    quarterly_periods_count: sortedQ.length,
  };
}

module.exports = { aggregate };
