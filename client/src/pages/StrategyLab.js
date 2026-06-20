import React, { useState, useEffect, useCallback } from 'react';
import authFetch from '../lib/api';

const fmtPct = (n) => {
  if (n == null || !isFinite(n)) return '—';
  const val = Number(n) * 100;
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
};

const fmtVal = (n) => {
  if (n == null || !isFinite(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const fmtLakhs = (n) => {
  if (n == null || !isFinite(n)) return '—';
  return `₹${(Number(n) / 100000).toFixed(2)}L`;
};

// SVG Dual Line Chart Component
function EquityCurveChart({ curve }) {
  if (!curve || curve.length < 2) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, background: 'var(--surface2)', borderRadius: 8 }}>
        Insufficient historical data to render chart. (Need at least 2 daily ticks).
      </div>
    );
  }

  const width = 600;
  const height = 240;
  const padding = 40;

  // Find min and max for scaling
  const allReturns = curve.flatMap(d => [d.book_return_pct ?? 0, d.nifty50_return_pct ?? 0]);
  let minVal = Math.min(...allReturns);
  let maxVal = Math.max(...allReturns);
  
  // Pad values slightly so chart doesn't touch borders
  const range = maxVal - minVal;
  minVal = minVal - (range * 0.1 || 0.02);
  maxVal = maxVal + (range * 0.1 || 0.02);

  const getX = (index) => padding + (index / (curve.length - 1)) * (width - padding * 2);
  const getY = (val) => height - padding - ((val - minVal) / (maxVal - minVal)) * (height - padding * 2);

  // Generate paths
  let stratPath = '';
  let niftyPath = '';

  curve.forEach((pt, i) => {
    const x = getX(i);
    const yStrat = getY(pt.book_return_pct ?? 0);
    const yNifty = getY(pt.nifty50_return_pct ?? 0);

    if (i === 0) {
      stratPath = `M ${x} ${yStrat}`;
      niftyPath = `M ${x} ${yNifty}`;
    } else {
      stratPath += ` L ${x} ${yStrat}`;
      niftyPath += ` L ${x} ${yNifty}`;
    }
  });

  // Grid lines
  const gridLines = [];
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const v = minVal + (i / gridCount) * (maxVal - minVal);
    gridLines.push(v);
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Performance Curve vs Nifty 50</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--accent)' }}></span>
            <span style={{ color: 'var(--text)' }}>Strategy Book</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 12, height: 3, background: '#718096' }}></span>
            <span style={{ color: 'var(--text-3)' }}>Nifty 50 Index</span>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 500, height: 'auto', display: 'block' }}>
          {/* Horizontal Grid lines & labels */}
          {gridLines.map((v, i) => {
            const y = getY(v);
            return (
              <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padding - 6} y={y + 4} fill="var(--text-3)" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)">
                  {(v * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}

          {/* Paths */}
          <path d={niftyPath} fill="none" stroke="#718096" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={stratPath} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots on points if points are few */}
          {curve.length <= 15 && curve.map((pt, i) => (
            <g key={i}>
              <circle cx={getX(i)} cy={getY(pt.book_return_pct ?? 0)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
              <circle cx={getX(i)} cy={getY(pt.nifty50_return_pct ?? 0)} r="3" fill="#718096" stroke="var(--surface)" strokeWidth="1" />
            </g>
          ))}

          {/* Inception & Today labels */}
          <text x={padding} y={height - 12} fill="var(--text-3)" fontSize="10" textAnchor="start">
            {curve[0].date}
          </text>
          <text x={width - padding} y={height - 12} fill="var(--text-3)" fontSize="10" textAnchor="end">
            {curve[curve.length - 1].date}
          </text>
        </svg>
      </div>
    </div>
  );
}

export default function StrategyLab({ onSelectStock }) {
  const [stats, setStats] = useState(null);
  const [active, setActive] = useState(localStorage.getItem('labStrategy') || 'marshall_undervalued');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/paper-trading/stats');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const selectStrategy = (k) => {
    setActive(k);
    localStorage.setItem('labStrategy', k);
  };

  const strategiesList = [
    { key: 'marshall_undervalued', label: 'Marshall Undervalued' },
    { key: 'quality_compounders', label: 'Quality Compounders' },
    { key: 'deep_value', label: 'Deep Value' },
    { key: 'high_growth', label: 'High Growth' }
  ];

  const currentData = stats?.[active];
  const initialized = currentData?.initialized ?? false;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Strategy Lab</div>
        <div className="page-subtitle">Forward paper-trading sandbox · live strategy performance vs Nifty 50</div>
      </div>

      {/* Warning Caveats Banner */}
      <div style={{
        background: 'rgba(201, 168, 76, 0.1)',
        border: '1px solid var(--accent)',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 20,
        fontSize: 13,
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
        <div style={{ fontSize: 20 }}>⚠️</div>
        <div>
          <strong>Sandbox Notice:</strong> All strategies running in the Strategy Lab represent forward simulations started from inception dates. Returns are calculated gross of transaction costs/taxes using 15 equal slots of ₹1,00,000 (total ₹15L capital). No live brokerage or execution is tied to this sandbox. Not statistically meaningful until enough closed trades accrue.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {strategiesList.map(s => (
          <button
            key={s.key}
            onClick={() => selectStrategy(s.key)}
            style={{
              padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${active === s.key ? 'var(--accent)' : 'var(--border)'}`,
              background: active === s.key ? 'var(--surface2)' : 'transparent',
              color: active === s.key ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--text-3)', padding: 24, textAlign: 'center' }}>Loading strategy logs...</div>}
      {error && <div style={{ color: 'var(--fail)', padding: 24, textAlign: 'center' }}>{error}</div>}

      {!loading && !error && !initialized && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, color: 'var(--text-3)', marginBottom: 12 }}>◌</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>Strategy Book Not Active</div>
          <div style={{ color: 'var(--text-2)', fontSize: 13, maxWidth: 500, margin: '0 auto' }}>
            This strategy book has not recorded its first tick yet. It will automatically initialize and begin tracking when the daily cron run pings the `/api/cron/paper-trade-tick` route.
          </div>
        </div>
      )}

      {!loading && !error && initialized && (
        <>
          {/* Key Metrics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 20
          }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>Book Value</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {fmtLakhs(currentData.equityCurve[currentData.equityCurve.length - 1]?.book_value)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Initial Capital: {fmtLakhs(currentData.meta.initial_capital)}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>Cumulative Return</div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: (currentData.metrics.cumulativeReturnPct >= 0) ? 'var(--pass)' : 'var(--fail)'
              }}>
                {fmtPct(currentData.metrics.cumulativeReturnPct)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Index return: {fmtPct(currentData.equityCurve[currentData.equityCurve.length - 1]?.nifty50_return_pct)}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>Alpha vs Nifty 50</div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: (currentData.metrics.alphaPct >= 0) ? 'var(--pass)' : 'var(--fail)'
              }}>
                {(currentData.metrics.alphaPct >= 0 ? '+' : '') + currentData.metrics.alphaPct.toFixed(2)}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Since Inception: {currentData.meta.inception_date}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>Win Rate</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {currentData.metrics.winRatePct.toFixed(1)}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Closed trades: {currentData.metrics.totalTrades}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>Max Drawdown</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--fail)' }}>
                -{currentData.metrics.maxDrawdownPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Trough peak drawdown
              </div>
            </div>
          </div>

          {/* Curve Chart */}
          <div style={{ marginBottom: 24 }}>
            <EquityCurveChart curve={currentData.equityCurve} />
          </div>

          {/* Active Open Positions Table */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span>Open Positions ({currentData.openPositions.length} / 15 slots)</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>
                Allocated Capital: {fmtLakhs(currentData.openPositions.length * 100000)}
              </span>
            </div>

            {currentData.openPositions.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
                No active positions. Cash completely idle.
              </div>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Ticker', 'Company', 'Buy Date', 'Purchase Price', 'CMP', 'Shares', 'Current Value', 'Return %'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.openPositions.map(p => {
                      const posVal = p.shares * p.current_price;
                      return (
                        <tr key={p.ticker} onClick={() => onSelectStock?.(p.ticker)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>{p.ticker}</td>
                          <td style={{ padding: '8px 12px' }}>{p.company || '—'}</td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)' }}>{p.entry_date}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmtVal(p.entry_price)}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmtVal(p.current_price)}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{Number(p.shares).toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtVal(posVal)}</td>
                          <td style={{
                            padding: '8px 12px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            color: (p.return_pct >= 0) ? 'var(--pass)' : 'var(--fail)'
                          }}>
                            {fmtPct(p.return_pct)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Closed Trades History Table */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Closed Trades Log</div>

            {currentData.closedTrades.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
                No completed trades yet. Exit triggers will record here.
              </div>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Ticker', 'Buy Date', 'Sell Date', 'Purchase Price', 'Exit Price', 'Exit Reason', 'P&L %'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.closedTrades.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>{t.ticker}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)' }}>{t.entry_date}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)' }}>{t.exit_date}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmtVal(t.entry_price)}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmtVal(t.exit_price)}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-2)', fontSize: 12, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.exit_reason}>
                          {t.exit_reason || '—'}
                        </td>
                        <td style={{
                          padding: '8px 12px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: (t.return_pct >= 0) ? 'var(--pass)' : 'var(--fail)'
                        }}>
                          {fmtPct(t.return_pct)}
                        </td>
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
