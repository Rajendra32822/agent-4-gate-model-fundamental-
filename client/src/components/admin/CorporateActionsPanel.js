import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

const EVENT_TYPES = ['SPLIT', 'BONUS', 'RIGHTS', 'BUYBACK', 'DIVIDEND', 'MERGER', 'DEMERGER', 'NAME_CHANGE', 'TICKER_CHANGE'];
const blank = { ticker: '', event_type: 'SPLIT', ratio: '', new_ticker: '', new_name: '', ex_date: '', notes: '' };

export default function CorporateActionsPanel() {
  const [queue, setQueue] = useState([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await authFetch('/api/admin/corporate-actions?status=proposed');
      setQueue(await res.json());
    } catch (e) { setMsg(`Load failed: ${e.message}`); }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.ticker) { setMsg('ticker required'); return; }
    setBusy(true); setMsg('');
    try {
      const body = { ...form, ticker: form.ticker.toUpperCase() };
      const res = await authFetch('/api/admin/corporate-actions', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'failed'); }
      setForm(blank); setMsg('Added'); await load();
    } catch (e) { setMsg(`Add failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  const editRow = (id, field, value) => setQueue(q => q.map(r => r.id === id ? { ...r, [field]: value } : r));

  const saveRow = async (row) => {
    await authFetch(`/api/admin/corporate-actions/${row.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ratio: row.ratio, new_ticker: row.new_ticker, new_name: row.new_name, notes: row.notes }),
    });
    setMsg(`Saved #${row.id}`);
  };

  const confirm = async (row) => {
    if (!window.confirm(`Confirm ${row.event_type} for ${row.ticker}? ${row.event_type === 'TICKER_CHANGE' ? 'This renames the ticker everywhere.' : ''}`)) return;
    const res = await authFetch(`/api/admin/corporate-actions/${row.id}/confirm`, { method: 'POST' });
    const data = await res.json();
    setMsg(res.ok ? `Confirmed #${row.id}` : `Confirm failed: ${data.error}`);
    await load();
  };

  const dismiss = async (row) => {
    await authFetch(`/api/admin/corporate-actions/${row.id}/dismiss`, { method: 'POST' });
    setMsg(`Dismissed #${row.id}`); await load();
  };

  const cell = { padding: '4px 6px', borderBottom: '1px solid var(--border)', fontSize: 12 };
  const inp = { background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', width: 90 };

  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, marginTop: 0 }}>Corporate Actions — Proposed Queue</h2>
      {msg && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <input placeholder="TICKER" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value })} style={inp} />
        <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} style={inp}>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="ratio 1:5" value={form.ratio} onChange={e => setForm({ ...form, ratio: e.target.value })} style={inp} />
        <input placeholder="new_ticker" value={form.new_ticker} onChange={e => setForm({ ...form, new_ticker: e.target.value })} style={inp} />
        <input placeholder="new_name" value={form.new_name} onChange={e => setForm({ ...form, new_name: e.target.value })} style={{ ...inp, width: 130 }} />
        <input placeholder="ex_date" type="date" value={form.ex_date} onChange={e => setForm({ ...form, ex_date: e.target.value })} style={inp} />
        <button className="btn" disabled={busy} onClick={add}>+ Add</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-3)' }}>
            <th style={cell}>Ticker</th><th style={cell}>Type</th><th style={cell}>Ratio</th>
            <th style={cell}>New ticker</th><th style={cell}>New name</th><th style={cell}>Src</th><th style={cell}></th>
          </tr></thead>
          <tbody>
            {queue.map(r => (
              <tr key={r.id}>
                <td style={cell}>{r.ticker}</td>
                <td style={cell}>{r.event_type}</td>
                <td style={cell}><input value={r.ratio ?? ''} onChange={e => editRow(r.id, 'ratio', e.target.value)} style={{ ...inp, width: 60 }} /></td>
                <td style={cell}><input value={r.new_ticker ?? ''} onChange={e => editRow(r.id, 'new_ticker', e.target.value)} style={{ ...inp, width: 80 }} /></td>
                <td style={cell}><input value={r.new_name ?? ''} onChange={e => editRow(r.id, 'new_name', e.target.value)} style={{ ...inp, width: 110 }} /></td>
                <td style={cell}>{r.source}</td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                  <button className="btn" onClick={() => saveRow(r)}>Save</button>{' '}
                  <button className="btn" onClick={() => confirm(r)}>Confirm</button>{' '}
                  <button className="btn" onClick={() => dismiss(r)}>Dismiss</button>
                </td>
              </tr>
            ))}
            {queue.length === 0 && <tr><td style={cell} colSpan={7}>No proposed actions.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
