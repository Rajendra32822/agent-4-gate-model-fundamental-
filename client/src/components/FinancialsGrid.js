import React, { useState, useEffect } from 'react';
import authFetch from '../lib/api';

const fmtCr = (n) => {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString('en-IN');
};
const fmtPct = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;
const fmtX   = (n) => n == null ? '—' : `${Number(n).toFixed(2)}×`;

const PL_ROWS = [
  { key: 'sales_cr',            label: 'Sales',            fmt: fmtCr },
  { key: 'expenses_cr',         label: 'Expenses',         fmt: fmtCr },
  { key: 'operating_profit_cr', label: 'Operating Profit', fmt: fmtCr, bold: true },
  { key: 'opm_pct',             label: 'OPM %',            fmt: fmtPct },
  { key: 'other_income_cr',     label: 'Other Income',     fmt: fmtCr },
  { key: 'interest_cr',         label: 'Interest',         fmt: fmtCr },
  { key: 'depreciation_cr',     label: 'Depreciation',     fmt: fmtCr },
  { key: 'pbt_cr',              label: 'Profit before tax',fmt: fmtCr, bold: true },
  { key: 'tax_pct',             label: 'Tax %',            fmt: fmtPct },
  { key: 'net_profit_cr',       label: 'Net Profit',       fmt: fmtCr, bold: true },
  { key: 'eps_rs',              label: 'EPS in ₹',         fmt: fmtCr },
];

const BS_ROWS = [
  { key: 'equity_share_capital_cr', label: 'Equity Capital',  fmt: fmtCr },
  { key: 'reserves_cr',             label: 'Reserves',        fmt: fmtCr },
  { key: 'total_equity_cr',         label: 'Total Equity',    fmt: fmtCr, bold: true },
  { key: 'total_debt_cr',           label: 'Borrowings',      fmt: fmtCr },
  { key: 'other_current_liab_cr',   label: 'Other Liabilities',fmt: fmtCr },
  { key: 'fixed_assets_cr',         label: 'Fixed Assets',    fmt: fmtCr },
  { key: 'cwip_cr',                 label: 'CWIP',            fmt: fmtCr },
  { key: 'investments_cr',          label: 'Investments',     fmt: fmtCr },
  { key: 'total_assets_cr',         label: 'Total Assets',    fmt: fmtCr, bold: true },
];

const CF_ROWS = [
  { key: 'ocf_cr',             label: 'Cash from Operating',  fmt: fmtCr, bold: true },
  { key: 'icf_cr',             label: 'Cash from Investing',  fmt: fmtCr },
  { key: 'ffc_cr',             label: 'Cash from Financing',  fmt: fmtCr },
  { key: 'net_change_cash_cr', label: 'Net Cash Flow',        fmt: fmtCr, bold: true },
];

const DERIVED_ANNUAL_ROWS = [
  { key: 'ebitda_margin_pct', label: 'EBITDA margin', fmt: fmtPct },
  { key: 'pat_margin_pct',    label: 'PAT margin',    fmt: fmtPct },
  { key: 'roe_pct',           label: 'ROE',           fmt: fmtPct, bold: true },
  { key: 'roce_pct',          label: 'ROCE',          fmt: fmtPct, bold: true },
  { key: 'debt_to_equity',    label: 'Debt / Equity', fmt: fmtX },
  { key: 'interest_coverage', label: 'Interest cov.', fmt: fmtX },
];

function Section({ title, columns, rows, periodKey }) {
  if (!columns?.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}></th>
              {columns.map(c => (
                <th key={c[periodKey]} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontFamily: 'var(--font-mono)' }}>
                  {c[periodKey === 'fy_end' ? 'fy_label' : 'q_label']}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', color: r.bold ? 'var(--text)' : 'var(--text-2)', fontWeight: r.bold ? 600 : 400 }}>{r.label}</td>
                {columns.map(c => (
                  <td key={c[periodKey]} style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.bold ? 'var(--text)' : 'var(--text-2)', fontWeight: r.bold ? 600 : 400 }}>
                    {r.fmt(c[r.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FinancialsGrid({ ticker }) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    authFetch(`/api/company/${ticker}/financials`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`Server ${r.status}`)))
      .then(d => { setBundle(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [ticker]);

  if (loading) return <div style={{ color: 'var(--text-3)', padding: 12, fontSize: 12 }}>Loading financials…</div>;
  if (error)   return <div style={{ color: 'var(--text-3)', padding: 12, fontSize: 12 }}>Financial data not yet ingested for {ticker}. Run admin → Ingest Ticker.</div>;
  if (!bundle) return null;

  const bsByFy = Object.fromEntries((bundle.annual_bs || []).map(r => [r.fy_end, r]));
  const cfByFy = Object.fromEntries((bundle.annual_cf || []).map(r => [r.fy_end, r]));
  const drByFy = Object.fromEntries((bundle.derived_annual || []).map(r => [r.fy_end, r]));
  const annualCols = (bundle.annual_pl || []).slice(0, 8).map(r => ({
    fy_end: r.fy_end, fy_label: r.fy_label, ...r, ...bsByFy[r.fy_end], ...cfByFy[r.fy_end], ...drByFy[r.fy_end],
  }));
  const quarterCols = (bundle.quarterly_pl || []).slice(0, 13);

  return (
    <div>
      <Section title="Quarterly P&L (consolidated, ₹ Cr)" columns={quarterCols} rows={PL_ROWS} periodKey="q_end" />
      <Section title="Annual P&L (consolidated, ₹ Cr)"   columns={annualCols}  rows={PL_ROWS} periodKey="fy_end" />
      <Section title="Annual Balance Sheet (₹ Cr)"        columns={annualCols}  rows={BS_ROWS} periodKey="fy_end" />
      <Section title="Annual Cash Flow (₹ Cr)"            columns={annualCols}  rows={CF_ROWS} periodKey="fy_end" />
      <Section title="Annual Derived Ratios"              columns={annualCols}  rows={DERIVED_ANNUAL_ROWS} periodKey="fy_end" />
    </div>
  );
}
