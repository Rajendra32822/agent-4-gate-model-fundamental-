import React, { useState, useEffect, useCallback } from 'react';
import authFetch from '../lib/api';

const fmt = (n, suffix = '') => (n == null || !isFinite(n)) ? '—' : `${Number(n).toFixed(1)}${suffix}`;
const fmtX = (n) => (n == null || !isFinite(n)) ? '—' : `${Number(n).toFixed(2)}×`;
const fmtInr = (n) => (n == null || !isFinite(n)) ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// Columns shown per strategy (besides rank/ticker/company/sector/score)
const STRATEGY_COLS = {
  marshall_undervalued: [
    { key: 'roce_5y_avg', label: 'ROCE 5y', fmt: (n) => fmt(n, '%') },
    { key: 'pe', label: 'P/E', fmt: fmtX },
    { key: 'debt_to_equity', label: 'D/E', fmt: (n) => fmt(n) },
    { key: 'revenue_cagr_5y_pct', label: 'Rev CAGR', fmt: (n) => fmt(n, '%') },
  ],
  quality_compounders: [
    { key: 'roce_5y_avg', label: 'ROCE 5y', fmt: (n) => fmt(n, '%') },
    { key: 'revenue_cagr_5y_pct', label: 'Rev CAGR', fmt: (n) => fmt(n, '%') },
    { key: 'pat_cagr_5y_pct', label: 'PAT CAGR', fmt: (n) => fmt(n, '%') },
    { key: 'debt_to_equity', label: 'D/E', fmt: (n) => fmt(n) },
  ],
  deep_value: [
    { key: 'pe', label: 'P/E', fmt: fmtX },
    { key: 'pb', label: 'P/B', fmt: fmtX },
    { key: 'roe_ttm', label: 'ROE', fmt: (n) => fmt(n, '%') },
    { key: 'current_price', label: 'CMP', fmt: fmtInr },
  ],
  high_growth: [
    { key: 'revenue_cagr_5y_pct', label: 'Rev CAGR', fmt: (n) => fmt(n, '%') },
    { key: 'pat_cagr_5y_pct', label: 'PAT CAGR', fmt: (n) => fmt(n, '%') },
    { key: 'roce_5y_avg', label: 'ROCE 5y', fmt: (n) => fmt(n, '%') },
  ],
};

export default function Rankings({ onSelectStock }) {
  const [strategies, setStrategies] = useState([]);
  const [active, setActive] = useState(localStorage.getItem('rankingStrategy') || 'marshall_undervalued');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    authFetch('/api/rankings').then(r => r.ok ? r.json() : []).then(setStrategies).catch(() => {});
  }, []);

  const load = useCallback(async (strat) => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`/api/rankings/${strat}?limit=30`);
      if (!res.ok) throw new Error(`Server ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(active); }, [active, load]);

  const selectStrategy = (k) => { setActive(k); localStorage.setItem('rankingStrategy', k); };
  const cols = STRATEGY_COLS[active] || [];
  const activeDef = strategies.find(s => s.key === active);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Rankings</div>
        <div className="page-subtitle">Decision engine · ranked opportunities across your universe</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {strategies.map(s => (
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

      {activeDef && (
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{activeDef.description}</div>
      )}

      {loading && <div style={{ color: 'var(--text-3)', padding: 24, textAlign: 'center' }}>Ranking…</div>}
      {error && <div style={{ color: 'var(--fail)', padding: 24, textAlign: 'center' }}>{error}</div>}

      {!loading && data && data.results.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, color: 'var(--text-3)', marginBottom: 12 }}>◌</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>No matches yet</div>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
            {data.universeSize === 0
              ? 'Ingest the universe first — Admin → Load Nifty 500 → Ingest 50 stalest.'
              : `No stocks in your ${data.universeSize}-company universe pass this strategy's filters.`}
          </div>
        </div>
      )}

      {!loading && data && data.results.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
            {data.count} matches from {data.universeSize} companies with data · generated {new Date(data.generatedAt).toLocaleString('en-IN')}
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['#','Ticker','Company','Sector', ...cols.map(c => c.label), 'Score'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.05, color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.results.map(r => (
                  <tr key={r.ticker} onClick={() => onSelectStock?.(r.ticker)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{r.rank}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>{r.ticker}</td>
                    <td style={{ padding: '10px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company_name || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-3)', fontSize: 11 }}>{r.sector || '—'}</td>
                    {cols.map(c => (
                      <td key={c.key} style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{c.fmt(r[c.key])}</td>
                    ))}
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
