import React, { useState, useEffect, useCallback } from 'react';
import authFetch from '../../lib/api';
import TransactionModal from './TransactionModal';
import PendingActionsBanner from './PendingActionsBanner';

const fmtInr = (n) => {
  if (n == null || !isFinite(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};
const fmtPct = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const plColour = (n) => n > 0 ? 'var(--pass)' : n < 0 ? 'var(--fail)' : 'var(--text-3)';

export default function HoldingsTable({ onSelectStock }) {
  const [data, setData] = useState({ holdings: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/portfolio/holdings');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const j = await res.json();
      setData(j);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload, reloadKey]);

  const onSaved = () => { setModal(null); setReloadKey(k => k + 1); };

  return (
    <div>
      <PendingActionsBanner onChange={() => setReloadKey(k => k + 1)} />

      {data.summary && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Portfolio value</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{fmtInr(data.summary.totalValue)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Invested {fmtInr(data.summary.totalInvested)} · {data.summary.positionsCount} positions
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total return</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: plColour(data.summary.totalReturn) }}>
              {fmtPct(data.summary.returnPct)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Unrealised {fmtInr(data.summary.totalUnrealised)} · Realised {fmtInr(data.summary.totalRealised)} · Divs {fmtInr(data.summary.totalDividends)}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'BUY' })}>+ Buy</button>
        <button className="btn btn-secondary" onClick={() => setModal({ type: 'SELL' })}>+ Sell</button>
        <button className="btn btn-secondary" onClick={() => setModal({ type: 'DIVIDEND' })}>+ Dividend</button>
        <button className="btn btn-secondary" onClick={() => setModal({ type: 'SPLIT' })}>+ Split/Bonus</button>
      </div>

      {loading && <div style={{ color: 'var(--text-3)', padding: 24, textAlign: 'center' }}>Loading…</div>}
      {error   && <div style={{ color: 'var(--fail)', padding: 24, textAlign: 'center' }}>{error}</div>}

      {!loading && !error && data.holdings.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, color: 'var(--text-3)', marginBottom: 12 }}>◌</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>No positions yet</div>
          <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>Add your first BUY to start tracking.</div>
          <button className="btn btn-primary" onClick={() => setModal({ type: 'BUY' })}>+ Add Buy</button>
        </div>
      )}

      {!loading && data.holdings.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Ticker','Company','Qty','Avg Buy','CMP','Unrealised','Realised','Dividends','Total Return'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.05, color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.holdings.filter(h => h.quantity > 0).map(h => (
                <tr
                  key={h.ticker}
                  onClick={() => onSelectStock?.(h.ticker)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                >
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>{h.ticker}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.company || '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{h.quantity}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(h.avgBuyPrice)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(h.cmp)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(h.unrealisedPl) }}>
                    {fmtInr(h.unrealisedPl)} ({fmtPct(h.unrealisedPlPct)})
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(h.realisedPl) }}>{fmtInr(h.realisedPl)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(h.totalDividends)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: plColour(h.totalReturn), fontWeight: 600 }}>{fmtInr(h.totalReturn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <TransactionModal
          type={modal.type}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
