import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

export default function PendingActionsBanner({ onChange }) {
  const [pending, setPending] = useState([]);

  const reload = () => {
    authFetch('/api/portfolio/transactions?status=proposed')
      .then(r => r.ok ? r.json() : [])
      .then(setPending)
      .catch(() => {});
  };

  useEffect(() => { reload(); }, []);

  const act = async (id, action) => {
    await authFetch(`/api/portfolio/transactions/${id}/${action}`, { method: 'POST' });
    reload();
    onChange?.();
  };

  if (pending.length === 0) return null;

  return (
    <div style={{
      background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.4)',
      borderRadius: 12, padding: '12px 16px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 12, color: '#c9a84c', fontWeight: 700, marginBottom: 8 }}>
        ⚠ {pending.length} pending corporate action{pending.length > 1 ? 's' : ''}
      </div>
      {pending.map(p => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
          <span>
            <b>{p.ticker}</b> {p.type}
            {p.ratio && ` ${p.ratio}`}
            {p.amount && ` ₹${p.amount}/sh`}
            <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>on {p.transaction_date}</span>
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => act(p.id, 'confirm')} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}>Confirm</button>
            <button onClick={() => act(p.id, 'dismiss')} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}
