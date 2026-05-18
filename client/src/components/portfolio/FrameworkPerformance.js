import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

const fmtPct = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const plColour = (n) => n > 0 ? 'var(--pass)' : n < 0 ? 'var(--fail)' : 'var(--text-3)';

function aggregateByVerdict(outcomes, verdict, horizonKey) {
  const subset = outcomes.filter(o => o.verdict === verdict && o[horizonKey] != null);
  if (subset.length === 0) return null;
  const returns = subset.map(o => o[horizonKey]);
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const hitRate = subset.filter(o => o[horizonKey] > 0).length / subset.length * 100;
  const best  = subset.reduce((m, o) => o[horizonKey] > m[horizonKey] ? o : m, subset[0]);
  const worst = subset.reduce((m, o) => o[horizonKey] < m[horizonKey] ? o : m, subset[0]);
  return {
    count: subset.length,
    avg: Number(avg.toFixed(2)),
    hitRate: Number(hitRate.toFixed(1)),
    best: { ticker: best.ticker, pct: best[horizonKey] },
    worst: { ticker: worst.ticker, pct: worst[horizonKey] },
  };
}

export default function FrameworkPerformance({ onSelectStock }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState('return_6m_pct');

  useEffect(() => {
    authFetch('/api/outcomes')
      .then(r => r.ok ? r.json() : [])
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const buy   = aggregateByVerdict(data, 'BUY',   horizon);
  const watch = aggregateByVerdict(data, 'WATCH', horizon);
  const avoid = aggregateByVerdict(data, 'AVOID', horizon);
  const alpha = (buy && avoid) ? buy.avg - avoid.avg : null;

  if (loading) return <div style={{ color: 'var(--text-3)', padding: 24, textAlign: 'center' }}>Loading outcomes…</div>;

  if (data.length === 0) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, color: 'var(--text-3)', marginBottom: 12 }}>◌</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>No outcome data yet</div>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>Run the Admin Panel "Backfill Analysis Outcomes" once to compute historical returns.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Horizon:</span>
        {[
          { k: 'return_1m_pct', l: '1m' },
          { k: 'return_3m_pct', l: '3m' },
          { k: 'return_6m_pct', l: '6m' },
          { k: 'return_1y_pct', l: '1y' },
        ].map(h => (
          <button key={h.k} onClick={() => setHorizon(h.k)} style={{
            padding: '6px 12px', background: horizon === h.k ? 'var(--surface2)' : 'transparent',
            border: `1px solid ${horizon === h.k ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6, color: horizon === h.k ? 'var(--accent)' : 'var(--text-2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)',
          }}>{h.l}</button>
        ))}
        {alpha != null && (
          <span style={{ marginLeft: 'auto', fontSize: 13, color: plColour(alpha) }}>
            Framework α (BUY − AVOID): <b>{fmtPct(alpha)}</b>
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
        <VerdictCard title="BUY"   stats={buy}   colour="var(--pass)" />
        <VerdictCard title="WATCH" stats={watch} colour="var(--warn)" />
        <VerdictCard title="AVOID" stats={avoid} colour="var(--fail)" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              {['Ticker','Date','Verdict','1m','3m','6m','1y','Entry hit','Bull hit','Bear hit'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.05, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(o => (
              <tr key={`${o.ticker}-${o.analysis_date}`} onClick={() => onSelectStock?.(o.ticker)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{o.ticker}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{o.analysis_date}</td>
                <td style={{ padding: '8px 12px' }}><span className={`verdict-badge verdict-${o.verdict}`}>{o.verdict}</span></td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(o.return_1m_pct) }}>{fmtPct(o.return_1m_pct)}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(o.return_3m_pct) }}>{fmtPct(o.return_3m_pct)}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(o.return_6m_pct) }}>{fmtPct(o.return_6m_pct)}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(o.return_1y_pct) }}>{fmtPct(o.return_1y_pct)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{o.hit_entry_zone ? '✓' : '—'}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{o.hit_bull_case  ? '✓' : '—'}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{o.hit_bear_case  ? '⚠' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VerdictCard({ title, stats, colour }) {
  if (!stats) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontWeight: 700, color: colour, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title} calls</div>
        <div style={{ color: 'var(--text-3)', marginTop: 6 }}>No data</div>
      </div>
    );
  }
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${colour}33`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, color: colour, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title} calls ({stats.count})</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>avg:</span>
        <span style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: plColour(stats.avg) }}>{fmtPct(stats.avg)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
        <span>hit rate: <b style={{ color: 'var(--text-2)' }}>{stats.hitRate}%</b></span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
        best: <b style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{stats.best.ticker}</b> {fmtPct(stats.best.pct)}<br />
        worst: <b style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{stats.worst.ticker}</b> {fmtPct(stats.worst.pct)}
      </div>
    </div>
  );
}
