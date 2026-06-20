import React, { useState } from 'react';
import authFetch from '../lib/api';

const fmtVal = (n) => {
  if (n == null || !isFinite(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const fmtPct = (n) => {
  if (n == null || !isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;
};

const STRATEGIES_LIST = [
  { key: 'marshall_undervalued', label: 'Marshall Undervalued' },
  { key: 'quality_compounders', label: 'Quality Compounders' },
  { key: 'deep_value', label: 'Deep Value' },
  { key: 'high_growth', label: 'High Growth' }
];

// SVG Equity Curve Chart
function EquityCurveChart({ curve }) {
  if (!curve || curve.length < 2) return null;

  const width = 600;
  const height = 240;
  const padding = 40;

  const returns = curve.map(d => d.returnPct);
  let minVal = Math.min(...returns);
  let maxVal = Math.max(...returns);
  const range = maxVal - minVal;
  minVal = minVal - (range * 0.1 || 2);
  maxVal = maxVal + (range * 0.1 || 2);

  const getX = (index) => padding + (index / (curve.length - 1)) * (width - padding * 2);
  const getY = (val) => height - padding - ((val - minVal) / (maxVal - minVal)) * (height - padding * 2);

  let path = '';
  curve.forEach((pt, i) => {
    const x = getX(i);
    const y = getY(pt.returnPct);
    if (i === 0) path = `M ${x} ${y}`;
    else path += ` L ${x} ${y}`;
  });

  const gridLines = [];
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    gridLines.push(minVal + (i / gridCount) * (maxVal - minVal));
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Equity Growth Curve (%)</div>
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 500, height: 'auto', display: 'block' }}>
          {gridLines.map((v, i) => {
            const y = getY(v);
            return (
              <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padding - 6} y={y + 4} fill="var(--text-3)" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)">
                  {v.toFixed(1)}%
                </text>
              </g>
            );
          })}

          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {curve.length <= 20 && curve.map((pt, i) => (
            <circle key={i} cx={getX(i)} cy={getY(pt.returnPct)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
          ))}

          <text x={padding} y={height - 12} fill="var(--text-3)" fontSize="10" textAnchor="start">Inception</text>
          <text x={width - padding} y={height - 12} fill="var(--text-3)" fontSize="10" textAnchor="end">Latest</text>
        </svg>
      </div>
    </div>
  );
}

export default function BacktestPanel() {
  const [strategyKey, setStrategyKey] = useState('marshall_undervalued');
  const [allocation, setAllocation] = useState(100000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyKey, allocation })
      });
      if (!res.ok) throw new Error(`Backtest failed: ${res.statusText}`);
      const data = await res.json();
      setReport(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Backtester Harness</div>
        <div className="page-subtitle">Replay past 2-year prices for the active strategy universe to calculate historical returns, win rates, and drawdowns.</div>
      </div>

      {/* Inputs Bar */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        padding: 16, marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', fontWeight: 600 }}>Strategy Universe</label>
          <select 
            value={strategyKey}
            onChange={(e) => setStrategyKey(e.target.value)}
            className="input-field"
            style={{ padding: '8px 12px', fontSize: 14 }}
          >
            {STRATEGIES_LIST.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 160 }}>
          <label style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', fontWeight: 600 }}>Notional Trade Capital</label>
          <input 
            type="number"
            value={allocation}
            onChange={(e) => setAllocation(Number(e.target.value))}
            className="input-field"
            style={{ padding: '8px 12px', fontSize: 14, fontFamily: 'var(--font-mono)' }}
          />
        </div>

        <button 
          className="btn btn-primary" 
          onClick={runBacktest} 
          disabled={loading}
          style={{ height: 42, padding: '0 24px', fontWeight: 600 }}
        >
          {loading ? 'Simulating...' : '⚡ Run Backtest'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--fail)', padding: 24, textAlign: 'center' }}>{error}</div>}

      {!loading && !error && report && (
        <>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div className="card card-sm" style={{ background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Strategy Return</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: report.summary.returnPct >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
                {report.summary.returnPct.toFixed(2)}%
              </div>
            </div>
            <div className="card card-sm" style={{ background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Net P&L</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: report.summary.netPnl >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
                {fmtVal(report.summary.netPnl)}
              </div>
            </div>
            <div className="card card-sm" style={{ background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Win Rate</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {report.summary.winRatePct}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                {report.summary.winningTrades} win / {report.summary.totalTrades} total
              </div>
            </div>
            <div className="card card-sm" style={{ background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Max Drawdown</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--fail)' }}>
                -{report.summary.maxDrawdownPct}%
              </div>
            </div>
          </div>

          {/* Equity Chart */}
          <div style={{ marginBottom: 24 }}>
            <EquityCurveChart curve={report.equityCurve} />
          </div>

          {/* Closed Trades List */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Simulated Trades Log</div>
            {report.closedTrades.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, color: 'var(--text-3)', textAlign: 'center' }}>
                No completed trades in backtest history.
              </div>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      {['Ticker', 'Buy Date', 'Sell Date', 'Purchase Price', 'Exit Price', 'P&L', 'Return %', 'Exit Reason'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.closedTrades.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>{t.ticker}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)' }}>{t.entry_date}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)' }}>{t.exit_date}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmtVal(t.entry_price)}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmtVal(t.exit_price)}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: t.pnl >= 0 ? 'var(--pass)' : 'var(--fail)' }}>{fmtVal(t.pnl)}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: t.return_pct >= 0 ? 'var(--pass)' : 'var(--fail)' }}>{fmtPct(t.return_pct / 100)}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-2)', fontSize: 12 }}>{t.exit_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
