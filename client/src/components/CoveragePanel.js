import React, { useState, useEffect, useCallback, useRef } from 'react';
import authFetch from '../lib/api';

const fmtDate = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const statusColour = (s) => s === 'ok' ? '#22c55e' : s === 'failed' ? '#f87171' : 'var(--text-3)';

export default function CoveragePanel() {
  const [data, setData] = useState({ summary: null, coverage: [] });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [seedText, setSeedText] = useState('');
  const [filter, setFilter] = useState('');
  const pollRef = useRef(null);

  const loadCoverage = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/coverage');
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/ingest/status');
      if (res.ok) {
        const s = await res.json();
        setBulk(s);
        if (!s.running && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          loadCoverage();
        }
      }
    } catch { /* ignore */ }
  }, [loadCoverage]);

  useEffect(() => {
    loadCoverage();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadCoverage]);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(pollStatus, 3000);
  };

  const post = async (url, body) => {
    const res = await authFetch(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  };

  const handleLoadNifty = async () => {
    setMsg('Loading Nifty 500…');
    const { ok, data } = await post('/api/admin/universe/load-nifty500');
    setMsg(ok ? `✓ Loaded ${data.added} of ${data.parsed} companies` : `⚠ ${data.error}`);
    loadCoverage();
  };

  const handleSeed = async () => {
    if (!seedText.trim()) return;
    const { ok, data } = await post('/api/admin/universe/seed', { tickers: seedText });
    setMsg(ok ? `✓ Seeded ${data.added} tickers` : `⚠ ${data.error}`);
    setSeedText('');
    loadCoverage();
  };

  const handleBulkStale = async () => {
    const { ok, data } = await post('/api/admin/ingest/bulk', { limit: 50 });
    if (ok) { setMsg(`Started bulk ingest of ${data.count} stalest tickers…`); startPolling(); }
    else setMsg(`⚠ ${data.error}`);
  };

  const ingestOne = async (ticker) => {
    setMsg(`Ingesting ${ticker}…`);
    const { ok, data } = await post(`/api/admin/ingest/${ticker}`);
    setMsg(ok ? `✓ ${ticker}: ${data.periods_added} periods` : `⚠ ${data.error}`);
    loadCoverage();
  };

  const editCompany = async (ticker) => {
    const name = window.prompt(`New company name for ${ticker} (blank to skip):`);
    const sector = window.prompt(`New sector for ${ticker} (blank to skip):`);
    const updates = {};
    if (name) updates.company_name = name;
    if (sector) updates.sector = sector;
    if (!Object.keys(updates).length) return;
    const res = await authFetch(`/api/admin/universe/company/${ticker}`, { method: 'PUT', body: JSON.stringify(updates) });
    setMsg(res.ok ? `✓ Updated ${ticker}` : `⚠ update failed`);
    loadCoverage();
  };

  const renameCompany = async (ticker) => {
    const newTicker = window.prompt(`Rename ${ticker} to (new ticker symbol):`);
    if (!newTicker) return;
    const res = await authFetch(`/api/admin/universe/company/${ticker}/rename`, { method: 'POST', body: JSON.stringify({ newTicker }) });
    const j = await res.json();
    setMsg(j.ok ? `✓ Renamed ${ticker} → ${newTicker.toUpperCase()} (${j.updated.length} tables)` : `⚠ rename had errors`);
    loadCoverage();
  };

  const deleteCompany = async (ticker) => {
    if (!window.confirm(`Deactivate ${ticker}? (soft delete)`)) return;
    const res = await authFetch(`/api/admin/universe/company/${ticker}`, { method: 'DELETE' });
    setMsg(res.ok ? `✓ Deactivated ${ticker}` : `⚠ delete failed`);
    loadCoverage();
  };

  const s = data.summary;
  const rows = data.coverage.filter(c =>
    !filter ||
    c.ticker?.toLowerCase().includes(filter.toLowerCase()) ||
    c.company_name?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>🌐 Universe Master & Coverage</h2>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
        Manage the Nifty 500 master list and bulk-ingest fundamentals from screener.in.
      </p>

      {s && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap', fontSize: 13 }}>
          <span><b>{s.total}</b> total</span>
          <span style={{ color: '#22c55e' }}><b>{s.ok}</b> ingested</span>
          <span style={{ color: '#f87171' }}><b>{s.failed}</b> failed</span>
          <span style={{ color: 'var(--text-3)' }}><b>{s.pending}</b> pending</span>
        </div>
      )}

      {bulk?.running && (
        <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
          ⏳ Ingesting {bulk.done + bulk.failed}/{bulk.total} · current: <b>{bulk.current || '—'}</b> · {bulk.failed} failed
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleLoadNifty}>📋 Load Nifty 500</button>
        <button className="btn btn-secondary" onClick={handleBulkStale} disabled={bulk?.running}>⚡ Ingest 50 stalest</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="input-field" placeholder="Add tickers (comma/space separated)" value={seedText} onChange={e => setSeedText(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <button className="btn btn-secondary" onClick={handleSeed} disabled={!seedText.trim()}>+ Add</button>
      </div>

      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? '#22c55e' : 'var(--text-2)', marginBottom: 12 }}>{msg}</div>}

      <input className="input-field" placeholder="🔍 Filter coverage…" value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom: 10, width: '100%' }} />

      {loading ? <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading…</div> : (
        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: 'var(--surface2)' }}>
                {['Ticker','Company','Sector','Status','Last ingested',''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.ticker} style={{ borderBottom: '1px solid var(--border)', opacity: c.is_active === false ? 0.4 : 1 }}>
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{c.ticker}</td>
                  <td style={{ padding: '6px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company_name || '—'}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-3)' }}>{c.sector || '—'}</td>
                  <td style={{ padding: '6px 10px', color: statusColour(c.ingest_status), fontWeight: 600 }}>{c.ingest_status || 'pending'}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-3)', fontSize: 11 }}>{fmtDate(c.last_ingested_at)}</td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => ingestOne(c.ticker)} title="Ingest now" style={iconBtn}>📥</button>
                    <button onClick={() => editCompany(c.ticker)} title="Edit name/sector" style={iconBtn}>✎</button>
                    <button onClick={() => renameCompany(c.ticker)} title="Rename ticker" style={iconBtn}>↦</button>
                    <button onClick={() => deleteCompany(c.ticker)} title="Deactivate" style={iconBtn}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Showing {rows.length} of {data.coverage.length}</div>
    </div>
  );
}

const iconBtn = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--text-3)', fontSize: 13, marginRight: 6, padding: 2,
};
