import React, { useState, useEffect, useCallback } from 'react';
import authFetch from '../lib/api';

const ALERT_ICONS = { BUY_ZONE: '🎯', PROFIT_TARGET: '💰', STOP_LOSS: '🛑' };
const ALERT_COLORS = { BUY_ZONE: '#22c55e', PROFIT_TARGET: '#f59e0b', STOP_LOSS: '#ef4444' };
const VERDICT_COLORS = { BUY: '#22c55e', WATCH: '#f59e0b', AVOID: '#ef4444' };

function fmt(n) {
  if (!n && n !== 0) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtPct(n) {
  if (!n && n !== 0) return '—';
  const v = Number(n).toFixed(2);
  return (n >= 0 ? '+' : '') + v + '%';
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PriceBar({ current, low, high, bull }) {
  if (!current || !low || !high) return null;
  const min = low * 0.7;
  const max = (bull || high * 1.5) * 1.1;
  const pct = (v) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  return (
    <div style={{ position: 'relative', height: 6, background: '#1e293b', borderRadius: 4, margin: '8px 0' }}>
      {/* Entry zone band */}
      <div style={{
        position: 'absolute', top: 0, height: '100%', borderRadius: 4,
        left: pct(low) + '%', width: (pct(high) - pct(low)) + '%',
        background: 'rgba(34,197,94,0.35)',
      }} />
      {/* Bull case marker */}
      {bull && <div style={{ position: 'absolute', top: -2, width: 2, height: 10, background: '#f59e0b', left: pct(bull) + '%' }} />}
      {/* Current price marker */}
      <div style={{
        position: 'absolute', top: -4, width: 4, height: 14, borderRadius: 2,
        background: current <= high ? '#22c55e' : current >= (bull || high * 1.5) ? '#f59e0b' : '#94a3b8',
        left: `calc(${pct(current)}% - 2px)`,
        boxShadow: '0 0 4px rgba(255,255,255,0.3)',
      }} />
    </div>
  );
}

export default function WatchesPage({ onSelectStock, isAdmin }) {
  const [tab, setTab] = useState('watches');
  const [watches, setWatches] = useState([]);
  const [trades, setTrades] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [wRes, tRes, aRes] = await Promise.all([
        authFetch('/api/watches'),
        authFetch('/api/trades'),
        authFetch('/api/alerts'),
      ]);
      if (!wRes.ok || !tRes.ok || !aRes.ok) throw new Error('Failed to load data');
      const [w, t, a] = await Promise.all([wRes.json(), tRes.json(), aRes.json()]);
      setWatches(Array.isArray(w) ? w : []);
      setTrades(Array.isArray(t) ? t : []);
      setAlerts(Array.isArray(a) ? a : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async () => {
    await authFetch('/api/alerts/mark-read', { method: 'POST' });
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
  };

  const toggleWatchStatus = async (ticker, currentStatus) => {
    const next = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    await authFetch(`/api/watches/${ticker}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    setWatches(prev => prev.map(w => w.ticker === ticker ? { ...w, status: next } : w));
  };

  const closeTrade = async (ticker) => {
    const price = prompt(`Enter sell price for ${ticker}:`);
    if (!price || isNaN(price)) return;
    const res = await authFetch(`/api/trades/${ticker}/close`, { method: 'POST', body: JSON.stringify({ sellPrice: parseFloat(price), exitReason: 'MANUAL' }) });
    if (res.ok) load();
  };

  // Portfolio stats
  const openTrades = trades.filter(t => t.status === 'HOLDING');
  const closedTrades = trades.filter(t => t.status === 'SOLD');
  const avgPnl = closedTrades.length ? closedTrades.reduce((s, t) => s + (t.pnl_pct || 0), 0) / closedTrades.length : null;
  const wins = closedTrades.filter(t => (t.pnl_pct || 0) > 0).length;
  const unread = alerts.filter(a => !a.is_read).length;

  return (
    <div style={{ padding: '0 0 60px' }}>
      {/* Page header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Tracking & Alerts</div>
          <div className="page-subtitle">Entry zone monitoring · Virtual portfolio · Alert history</div>
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ fontSize: 13 }}>↻ Refresh</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'watches', label: `Watches (${watches.length})` },
          { id: 'portfolio', label: `Portfolio (${openTrades.length} open)` },
          { id: 'alerts', label: `Alerts${unread > 0 ? ` · ${unread} new` : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', padding: '10px 20px', cursor: 'pointer',
            fontSize: 14, fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>
          Loading…
        </div>
      )}
      {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>⚠ {error}</div>}

      {/* ── WATCHES TAB ─────────────────────────────────────────────────── */}
      {!loading && tab === 'watches' && (
        <div>
          {watches.length === 0 ? (
            <EmptyState icon="◎" title="No watches yet" desc="Run an analysis — entry zones are automatically tracked." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {watches.map(w => (
                <div key={w.ticker} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '18px 20px',
                  opacity: w.status === 'PAUSED' ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <button onClick={() => onSelectStock?.(w.ticker)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{w.ticker}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 8 }}>{w.company}</span>
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'rgba(0,0,0,0.3)', color: VERDICT_COLORS[w.overall_verdict] || '#94a3b8' }}>
                        {w.overall_verdict || '—'}
                      </span>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: w.status === 'ACTIVE' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)', color: w.status === 'ACTIVE' ? '#22c55e' : '#64748b' }}>
                        {w.status}
                      </span>
                      {isAdmin && (
                        <button onClick={() => toggleWatchStatus(w.ticker, w.status)} style={{ fontSize: 11, background: 'var(--border)', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}>
                          {w.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                        </button>
                      )}
                    </div>
                  </div>

                  <PriceBar current={w.latest_price} low={w.entry_low} high={w.entry_high} bull={w.bull_case} />

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
                    <Metric label="Current Price" value={fmt(w.latest_price)} highlight={w.latest_price && w.entry_high && w.latest_price <= w.entry_high} />
                    <Metric label="Entry Zone" value={w.entry_low && w.entry_high ? `${fmt(w.entry_low)}–${fmt(w.entry_high).replace('₹', '')}` : '—'} color="#22c55e" />
                    <Metric label="Bull Case" value={fmt(w.bull_case)} color="#f59e0b" />
                    <Metric label="Bear Case" value={fmt(w.bear_case)} color="#ef4444" />
                  </div>

                  {w.open_trade && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 8, fontSize: 12, color: '#60a5fa', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span>📈 Virtual trade open · Bought at {fmt(w.open_trade.buy_price)}</span>
                      <span style={{ color: (w.open_trade.pnl_pct || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                        P&L: {fmtPct(w.open_trade.pnl_pct)}
                      </span>
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    Analysed {fmtDate(w.analysis_date)} · Price updated {fmtDate(w.price_updated_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PORTFOLIO TAB ────────────────────────────────────────────────── */}
      {!loading && tab === 'portfolio' && (
        <div>
          {/* Stats bar */}
          {closedTrades.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
              <StatCard label="Closed Trades" value={closedTrades.length} />
              <StatCard label="Win Rate" value={closedTrades.length ? `${Math.round((wins / closedTrades.length) * 100)}%` : '—'} />
              <StatCard label="Avg Return" value={avgPnl !== null ? fmtPct(avgPnl) : '—'} color={avgPnl >= 0 ? '#22c55e' : '#ef4444'} />
              <StatCard label="Open Positions" value={openTrades.length} />
            </div>
          )}

          {trades.length === 0 ? (
            <EmptyState icon="📊" title="No trades yet" desc="Virtual trades open automatically when a stock enters its entry zone." />
          ) : (
            <>
              {openTrades.length > 0 && (
                <Section title="Open Positions">
                  <TradeTable trades={openTrades} isAdmin={isAdmin} onClose={closeTrade} onSelect={onSelectStock} />
                </Section>
              )}
              {closedTrades.length > 0 && (
                <Section title="Closed Trades">
                  <TradeTable trades={closedTrades} closed isAdmin={isAdmin} onSelect={onSelectStock} />
                </Section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ALERTS TAB ───────────────────────────────────────────────────── */}
      {!loading && tab === 'alerts' && (
        <div>
          {unread > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button onClick={markRead} style={{ fontSize: 12, background: 'var(--border)', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}>
                ✓ Mark all as read
              </button>
            </div>
          )}
          {alerts.length === 0 ? (
            <EmptyState icon="🔔" title="No alerts yet" desc="Alerts fire when a stock enters its entry zone, hits bull case, or drops to bear case." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map(a => (
                <div key={a.id} style={{
                  background: a.is_read ? 'var(--surface)' : 'rgba(201,168,76,0.06)',
                  border: `1px solid ${a.is_read ? 'var(--border)' : 'rgba(201,168,76,0.25)'}`,
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', gap: 14, alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{ALERT_ICONS[a.alert_type] || '🔔'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: ALERT_COLORS[a.alert_type] || '#94a3b8', letterSpacing: '0.5px' }}>
                        {a.alert_type?.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(a.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5 }}>{a.message}</div>
                    {a.triggered_price && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Triggered at {fmt(a.triggered_price)}</div>
                    )}
                  </div>
                  {!a.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c9a84c', flexShrink: 0, marginTop: 4 }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color, highlight }) {
  return (
    <div style={{ background: highlight ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 10px', border: highlight ? '1px solid rgba(34,197,94,0.25)' : '1px solid transparent' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: highlight ? '#22c55e' : (color || 'var(--text)'), fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function TradeTable({ trades, closed, isAdmin, onClose, onSelect }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: closed ? '1fr 1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr 1fr', gap: 0, padding: '8px 16px', background: 'rgba(0,0,0,0.2)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
        <span>Ticker</span><span>Buy Price</span><span>Current / Sell</span><span>P&L</span>
        {closed && <span>Exit Reason</span>}
        {!closed && isAdmin && <span>Action</span>}
      </div>
      {trades.map(t => (
        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: closed ? '1fr 1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr 1fr', gap: 0, padding: '12px 16px', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
          <button onClick={() => onSelect?.(t.ticker)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: '#60a5fa', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)' }}>{t.ticker}</button>
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{fmt(t.buy_price)}</span>
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{fmt(closed ? t.sell_price : t.current_price)}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: (t.pnl_pct || 0) >= 0 ? '#22c55e' : '#ef4444' }}>{fmtPct(t.pnl_pct)}</span>
          {closed && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.exit_reason || '—'}</span>}
          {!closed && isAdmin && (
            <button onClick={() => onClose(t.ticker)} style={{ fontSize: 11, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, desc }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}
