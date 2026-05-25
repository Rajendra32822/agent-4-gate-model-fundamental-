import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

export default function SectorBenchmarksPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingSector, setSavingSector] = useState(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/sectors');
      setRows(await res.json());
    } catch (e) { setMsg(`Load failed: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const edit = (sector, field, value) => {
    setRows(rs => rs.map(r => r.sector === sector ? { ...r, [field]: value } : r));
  };

  const save = async (row) => {
    setSavingSector(row.sector);
    setMsg('');
    try {
      const res = await authFetch(`/api/admin/sectors/${encodeURIComponent(row.sector)}`, {
        method: 'PUT',
        body: JSON.stringify({
          primary_metric: row.primary_metric,
          roce_benchmark: row.roce_benchmark === '' || row.roce_benchmark == null ? null : Number(row.roce_benchmark),
          roe_benchmark:  row.roe_benchmark === '' || row.roe_benchmark == null ? null : Number(row.roe_benchmark),
          notes: row.notes || '',
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'save failed'); }
      setMsg(`Saved ${row.sector}`);
    } catch (e) { setMsg(`Save failed: ${e.message}`); }
    finally { setSavingSector(null); }
  };

  const seed = async () => {
    if (!window.confirm('Seed/reset all 20 sectors to default benchmarks? This overwrites current values.')) return;
    setMsg('Seeding...');
    try {
      const res = await authFetch('/api/admin/sectors/seed', { method: 'POST' });
      const data = await res.json();
      setMsg(data.error ? `Seed failed: ${data.error}` : `Seeded ${data.seeded} sectors`);
      await load();
    } catch (e) { setMsg(`Seed failed: ${e.message}`); }
  };

  const cell = { padding: '4px 6px', borderBottom: '1px solid var(--border)', fontSize: 12 };
  const input = { width: 60, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px' };

  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Sector Benchmarks</h2>
        <button className="btn" onClick={seed}>Seed / reset defaults</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{msg}</div>}
      {loading ? <div style={{ fontSize: 12 }}>Loading…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-3)' }}>
                <th style={cell}>Sector</th><th style={cell}>Primary</th><th style={cell}>ROCE %</th><th style={cell}>ROE %</th><th style={cell}>Notes</th><th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.sector}>
                  <td style={cell}>{r.sector}</td>
                  <td style={cell}>
                    <select value={r.primary_metric || 'roce'} onChange={e => edit(r.sector, 'primary_metric', e.target.value)}
                            style={{ ...input, width: 70 }}>
                      <option value="roce">ROCE</option>
                      <option value="roe">ROE</option>
                    </select>
                  </td>
                  <td style={cell}>
                    <input type="number" value={r.roce_benchmark ?? ''} disabled={r.primary_metric === 'roe'}
                           onChange={e => edit(r.sector, 'roce_benchmark', e.target.value)} style={input} />
                  </td>
                  <td style={cell}>
                    <input type="number" value={r.roe_benchmark ?? ''}
                           onChange={e => edit(r.sector, 'roe_benchmark', e.target.value)} style={input} />
                  </td>
                  <td style={cell}>
                    <input type="text" value={r.notes ?? ''} onChange={e => edit(r.sector, 'notes', e.target.value)}
                           style={{ ...input, width: 160 }} />
                  </td>
                  <td style={cell}>
                    <button className="btn" disabled={savingSector === r.sector} onClick={() => save(r)}>
                      {savingSector === r.sector ? '…' : 'Save'}
                    </button>
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
