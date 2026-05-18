import React, { useState, useEffect, useCallback } from 'react';
import authFetch from '../../lib/api';

const TYPE_COLOUR = {
  BUY: 'var(--pass)', SELL: '#f59e0b', DIVIDEND: 'var(--accent)',
  SPLIT: 'var(--text-2)', BONUS: 'var(--text-2)',
};

const fmtInr = (n) => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function TransactionsList() {
  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState(null);
  const [filterTicker, setFT] = useState('');
  const [filterType,   setFTy] = useState('');

  const reload = useCallback(async () => {
    setLoad(true); setError(null);
    try {
      const qs = [];
      if (filterTicker) qs.push(`ticker=${encodeURIComponent(filterTicker.toUpperCase())}`);
      if (filterType)   qs.push(`type=${encodeURIComponent(filterType)}`);
      const res = await authFetch(`/api/portfolio/transactions${qs.length ? '?' + qs.join('&') : ''}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setItems(await res.json());
    } catch (err) { setError(err.message); }
    finally { setLoad(false); }
  }, [filterTicker, filterType]);

  useEffect(() => { reload(); }, [reload]);

  const onDelete = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    const res = await authFetch(`/api/portfolio/transactions/${id}`, { method: 'DELETE' });
    if (res.ok) reload();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input-field" placeholder="Filter by ticker" value={filterTicker} onChange={e => setFT(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select className="input-field" value={filterType} onChange={e => setFTy(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">All types</option>
          {['BUY','SELL','DIVIDEND','SPLIT','BONUS'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading && <div style={{ color: 'var(--text-3)', padding: 24, textAlign: 'center' }}>Loading…</div>}
      {error   && <div style={{ color: 'var(--fail)', padding: 24, textAlign: 'center' }}>{error}</div>}

      {!loading && items.length === 0 && (
        <div style={{ color: 'var(--text-3)', padding: 40, textAlign: 'center' }}>No transactions yet.</div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Date','Type','Ticker','Qty','Price','Amount','Ratio','Notes',''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.05, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{t.transaction_date}</td>
                  <td style={{ padding: '10px 12px', color: TYPE_COLOUR[t.type], fontWeight: 600 }}>{t.type}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{t.ticker}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{t.quantity ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(t.price)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtInr(t.amount)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>{t.ratio || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-3)', fontSize: 11 }}>{t.notes || ''}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button onClick={() => onDelete(t.id)} title="Delete" style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
