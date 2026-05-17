import React, { useState, useMemo, useEffect } from 'react';
import authFetch from '../lib/api';

const VERDICT_ICONS = { BUY: '▲', WATCH: '◉', AVOID: '▼' };
const GATE_KEYS = ['gate1', 'gate2a', 'gate2b', 'gate2c', 'gate3'];
const GATE_LABELS = { gate1: 'G1', gate2a: 'G2a', gate2b: 'G2b', gate2c: 'G2c', gate3: 'G3' };

function getDaysOld(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function StaleBadge({ days }) {
  if (days < 30) return <span className="age-badge age-fresh">● Fresh</span>;
  if (days < 90) return <span className="age-badge age-aging">{days}d old</span>;
  return <span className="age-badge age-stale">↻ Stale</span>;
}

function GateIndicator({ verdict }) {
  if (!verdict) return <span className="gate-dot empty" />;
  const map = { PASS: 'pass', FAIL: 'fail', CONDITIONAL: 'warn',
    VALUE_BUY: 'pass', SCREAMING_BUY: 'pass', FAIR_VALUE: 'warn',
    EXPENSIVE: 'fail', EXTREME_PREMIUM: 'fail' };
  return <span className={`gate-dot ${map[verdict] || 'warn'}`} title={verdict} />;
}

// ─── Card view (kept for users who prefer visual layout) ──────────────────
function StockCard({ analysis, metrics, onClick, onUpdate }) {
  const verdict = analysis.overallVerdict || 'WATCH';
  const days = getDaysOld(analysis.analysisDate || analysis.savedAt);
  const isStale = days >= 90;

  return (
    <div className={`stock-card ${isStale ? 'stock-card-stale' : ''}`} onClick={onClick}>
      <div className="stock-card-header">
        <div>
          <div className="stock-ticker">{analysis.ticker}</div>
          <div className="stock-name">{analysis.company}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span className={`verdict-badge verdict-${verdict}`}>
            {VERDICT_ICONS[verdict]} {verdict}
          </span>
          <StaleBadge days={days} />
        </div>
      </div>

      <div className="stock-gates-row">
        {GATE_KEYS.map(k => (
          <div key={k} className="gate-indicator-item">
            <GateIndicator verdict={analysis[`${k}Verdict`] || (analysis[k]?.verdict)} />
            <span className="gate-indicator-label">{GATE_LABELS[k]}</span>
          </div>
        ))}
      </div>

      {metrics && (metrics.current_price || metrics.roce_pct) && (
        <div className="stock-metrics-row">
          {metrics.current_price && <span>CMP: <b>₹{metrics.current_price}</b></span>}
          {metrics.roce_pct != null && <span>ROCE: <b>{metrics.roce_pct}%</b></span>}
          {metrics.pe_ratio != null && <span>P/E: <b>{metrics.pe_ratio}×</b></span>}
        </div>
      )}

      <div className="stock-entry">
        <span className="stock-entry-label">Entry zone</span>
        <span className="stock-entry-value font-mono">
          {analysis.targetEntryPrice || '—'}
        </span>
      </div>

      <div className="stock-card-footer">
        <span className="stock-date">Analysed {analysis.analysisDate}</span>
        {isStale && (
          <button
            className="btn-update-small"
            onClick={e => { e.stopPropagation(); onUpdate(analysis); }}
          >
            ↻ Update
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Table view ──────────────────────────────────────────────────────────
function StockTable({ rows, metricsMap, sortKey, sortDir, onSort, onSelect, onUpdate }) {
  const arrow = (k) => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <div className="table-wrap">
      <table className="stock-table">
        <thead>
          <tr>
            <th className="th-sort" onClick={() => onSort('ticker')}>Ticker{arrow('ticker')}</th>
            <th className="th-sort" onClick={() => onSort('company')}>Company{arrow('company')}</th>
            <th className="th-sort" onClick={() => onSort('verdict')}>Verdict{arrow('verdict')}</th>
            <th>G1</th>
            <th>G2a</th>
            <th>G2b</th>
            <th>G2c</th>
            <th>G3</th>
            <th className="th-sort" onClick={() => onSort('cmp')}>CMP{arrow('cmp')}</th>
            <th className="th-sort" onClick={() => onSort('roce')}>ROCE{arrow('roce')}</th>
            <th className="th-sort" onClick={() => onSort('pe')}>P/E{arrow('pe')}</th>
            <th>Entry Zone</th>
            <th className="th-sort" onClick={() => onSort('days')}>Age{arrow('days')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(a => {
            const m = metricsMap[a.ticker] || {};
            const days = getDaysOld(a.analysisDate || a.savedAt);
            const verdict = a.overallVerdict || 'WATCH';
            const isStale = days >= 90;
            return (
              <tr key={a.ticker} onClick={() => onSelect(a.ticker)} className={isStale ? 'stale-row' : ''}>
                <td className="td-ticker font-mono">{a.ticker}</td>
                <td className="td-company">{a.company}</td>
                <td><span className={`verdict-badge verdict-${verdict}`}>{VERDICT_ICONS[verdict]} {verdict}</span></td>
                {GATE_KEYS.map(k => (
                  <td key={k} className="td-gate"><GateIndicator verdict={a[`${k}Verdict`] || a[k]?.verdict} /></td>
                ))}
                <td className="td-num">{m.current_price != null ? `₹${m.current_price}` : '—'}</td>
                <td className="td-num">{m.roce_pct != null ? `${m.roce_pct}%` : '—'}</td>
                <td className="td-num">{m.pe_ratio != null ? `${m.pe_ratio}×` : '—'}</td>
                <td className="td-entry font-mono">{a.targetEntryPrice || '—'}</td>
                <td className="td-age"><StaleBadge days={days} /></td>
                <td className="td-action">
                  {isStale && (
                    <button className="btn-update-small" onClick={e => { e.stopPropagation(); onUpdate(a); }}>↻</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────
export default function Dashboard({ analyses, loading, serverStatus, loadError, onRetry, onSelect, onNewAnalysis, onUpdate, isAdmin }) {
  const [view, setView]               = useState(localStorage.getItem('dashboardView') || 'table');
  const [search, setSearch]           = useState('');
  const [verdictFilter, setVerdict]   = useState('ALL');
  const [smartFilter, setSmart]       = useState('ALL');
  const [sortKey, setSortKey]         = useState('verdict');
  const [sortDir, setSortDir]         = useState('asc');
  const [metricsMap, setMetricsMap]   = useState({});

  // Persist view preference
  useEffect(() => { localStorage.setItem('dashboardView', view); }, [view]);

  // Fetch fundamental_metrics for CMP, ROCE, P/E in the table
  useEffect(() => {
    if (!analyses.length) return;
    let cancelled = false;
    authFetch('/api/metrics')
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        if (cancelled) return;
        const map = {};
        rows.forEach(r => { map[r.ticker] = r; });
        setMetricsMap(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [analyses]);

  // Smart filter logic
  const passSmartFilter = (a) => {
    if (smartFilter === 'ALL') return true;
    const verdicts = {
      g1: a.gate1Verdict || a.gate1?.verdict,
      g2a: a.gate2aVerdict || a.gate2a?.verdict,
      g2b: a.gate2bVerdict || a.gate2b?.verdict,
      g2c: a.gate2cVerdict || a.gate2c?.verdict,
      g3: a.gate3Verdict || a.gate3?.verdict,
    };
    if (smartFilter === 'UNDERVALUED') {
      // All quality gates PASS + Gate 3 is SCREAMING_BUY or VALUE_BUY
      return verdicts.g1 === 'PASS' && verdicts.g2a === 'PASS' &&
             verdicts.g2b === 'PASS' && verdicts.g2c === 'PASS' &&
             ['SCREAMING_BUY', 'VALUE_BUY'].includes(verdicts.g3);
    }
    if (smartFilter === 'QUALITY') {
      // All quality gates PASS regardless of valuation
      return verdicts.g1 === 'PASS' && verdicts.g2a === 'PASS' &&
             verdicts.g2b === 'PASS' && verdicts.g2c === 'PASS';
    }
    if (smartFilter === 'STALE') return getDaysOld(a.analysisDate || a.savedAt) >= 90;
    return true;
  };

  // Apply all filters and sort
  const filtered = useMemo(() => {
    let result = analyses;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        (a.ticker || '').toLowerCase().includes(q) ||
        (a.company || '').toLowerCase().includes(q)
      );
    }
    if (verdictFilter !== 'ALL') {
      result = result.filter(a => a.overallVerdict === verdictFilter);
    }
    result = result.filter(passSmartFilter);

    const verdictRank = { BUY: 0, WATCH: 1, AVOID: 2 };
    result = [...result].sort((a, b) => {
      const m = (t) => metricsMap[t] || {};
      let av, bv;
      switch (sortKey) {
        case 'ticker':  av = a.ticker || ''; bv = b.ticker || ''; break;
        case 'company': av = a.company || ''; bv = b.company || ''; break;
        case 'verdict': av = verdictRank[a.overallVerdict] ?? 9; bv = verdictRank[b.overallVerdict] ?? 9; break;
        case 'cmp':     av = m(a.ticker).current_price ?? -1; bv = m(b.ticker).current_price ?? -1; break;
        case 'roce':    av = m(a.ticker).roce_pct ?? -999; bv = m(b.ticker).roce_pct ?? -999; break;
        case 'pe':      av = m(a.ticker).pe_ratio ?? 99999; bv = m(b.ticker).pe_ratio ?? 99999; break;
        case 'days':    av = getDaysOld(a.analysisDate || a.savedAt); bv = getDaysOld(b.analysisDate || b.savedAt); break;
        default:        av = 0; bv = 0;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return result;
  }, [analyses, search, verdictFilter, smartFilter, sortKey, sortDir, metricsMap]);

  const handleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  // Stats
  const stats = useMemo(() => ({
    total: analyses.length,
    buy: analyses.filter(a => a.overallVerdict === 'BUY').length,
    watch: analyses.filter(a => a.overallVerdict === 'WATCH').length,
    avoid: analyses.filter(a => a.overallVerdict === 'AVOID').length,
    undervalued: analyses.filter(a => {
      const v = { g1: a.gate1Verdict, g2a: a.gate2aVerdict, g2b: a.gate2bVerdict, g2c: a.gate2cVerdict, g3: a.gate3Verdict };
      return v.g1 === 'PASS' && v.g2a === 'PASS' && v.g2b === 'PASS' && v.g2c === 'PASS' &&
             ['SCREAMING_BUY', 'VALUE_BUY'].includes(v.g3);
    }).length,
    stale: analyses.filter(a => getDaysOld(a.analysisDate || a.savedAt) >= 90).length,
  }), [analyses]);

  const exportCSV = () => {
    const headers = ['Ticker','Company','Verdict','G1','G2a','G2b','G2c','G3','CMP','ROCE','P/E','EntryZone','AnalysisDate'];
    const lines = [headers.join(',')];
    filtered.forEach(a => {
      const m = metricsMap[a.ticker] || {};
      lines.push([
        a.ticker, `"${(a.company || '').replace(/"/g, '""')}"`, a.overallVerdict,
        a.gate1Verdict || '', a.gate2aVerdict || '', a.gate2bVerdict || '', a.gate2cVerdict || '', a.gate3Verdict || '',
        m.current_price ?? '', m.roce_pct ?? '', m.pe_ratio ?? '',
        `"${(a.targetEntryPrice || '').replace(/"/g, '""')}"`, a.analysisDate || ''
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `valuesight-analyses-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Fundamental Dashboard</div>
          <div className="page-subtitle">
            Marshall's 4-gate value investing framework · Indian Equity
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={onNewAnalysis}>
            + Analyse New Stock
          </button>
        )}
      </div>

      {loading ? (
        <div>
          <div style={{ color: '#5e5c58', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>◌</span>
            {serverStatus || 'Loading analyses…'}
          </div>
          <div className="skeleton" style={{ height: 240 }} />
        </div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚡</div>
          <div style={{ color: '#f87171', fontSize: 15, marginBottom: 8 }}>{loadError}</div>
          <div style={{ color: '#5e5c58', fontSize: 13, marginBottom: 24 }}>
            The server on Render's free tier sleeps after inactivity.<br />
            It takes up to 60 seconds to wake up on first visit.
          </div>
          <button onClick={onRetry} style={{ background: '#c9a84c', color: '#0d0f11', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            ↻ Retry Now
          </button>
        </div>
      ) : analyses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◈</div>
          <div className="empty-title">No analyses yet</div>
          <div className="empty-sub">Run your first analysis to see results here</div>
          {isAdmin && (
            <button className="btn btn-primary mt-16" onClick={onNewAnalysis}>
              Analyse a Stock
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="stats-bar">
            <button className={`stat-chip ${verdictFilter === 'ALL' && smartFilter === 'ALL' ? 'active' : ''}`} onClick={() => { setVerdict('ALL'); setSmart('ALL'); }}>
              <span className="stat-num">{stats.total}</span>
              <span className="stat-lbl">Total</span>
            </button>
            <button className={`stat-chip stat-buy ${verdictFilter === 'BUY' ? 'active' : ''}`} onClick={() => { setVerdict(v => v === 'BUY' ? 'ALL' : 'BUY'); setSmart('ALL'); }}>
              <span className="stat-num">{stats.buy}</span>
              <span className="stat-lbl">Buy</span>
            </button>
            <button className={`stat-chip stat-watch ${verdictFilter === 'WATCH' ? 'active' : ''}`} onClick={() => { setVerdict(v => v === 'WATCH' ? 'ALL' : 'WATCH'); setSmart('ALL'); }}>
              <span className="stat-num">{stats.watch}</span>
              <span className="stat-lbl">Watch</span>
            </button>
            <button className={`stat-chip stat-avoid ${verdictFilter === 'AVOID' ? 'active' : ''}`} onClick={() => { setVerdict(v => v === 'AVOID' ? 'ALL' : 'AVOID'); setSmart('ALL'); }}>
              <span className="stat-num">{stats.avoid}</span>
              <span className="stat-lbl">Avoid</span>
            </button>
            <button className={`stat-chip stat-undervalued ${smartFilter === 'UNDERVALUED' ? 'active' : ''}`} title="Passes all quality gates + Gate 3 is Value Buy or Screaming Buy" onClick={() => { setSmart(s => s === 'UNDERVALUED' ? 'ALL' : 'UNDERVALUED'); setVerdict('ALL'); }}>
              <span className="stat-num">{stats.undervalued}</span>
              <span className="stat-lbl">★ Undervalued</span>
            </button>
            <button className={`stat-chip stat-stale ${smartFilter === 'STALE' ? 'active' : ''}`} onClick={() => { setSmart(s => s === 'STALE' ? 'ALL' : 'STALE'); setVerdict('ALL'); }}>
              <span className="stat-num">{stats.stale}</span>
              <span className="stat-lbl">Stale (90d+)</span>
            </button>
          </div>

          {/* Controls bar */}
          <div className="controls-bar">
            <input
              className="input-field controls-search"
              placeholder="🔍  Search ticker or company name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="controls-select" value={smartFilter} onChange={e => { setSmart(e.target.value); setVerdict('ALL'); }}>
              <option value="ALL">Smart filter: All</option>
              <option value="UNDERVALUED">★ Undervalued (Marshall criteria)</option>
              <option value="QUALITY">Quality only (gates 1+2 PASS)</option>
              <option value="STALE">Stale (need refresh)</option>
            </select>
            <div className="view-toggle">
              <button className={`view-btn ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')} title="Table view">⊞ Table</button>
              <button className={`view-btn ${view === 'cards' ? 'active' : ''}`} onClick={() => setView('cards')} title="Card view">▦ Cards</button>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={exportCSV} title="Export filtered list as CSV">⤓ CSV</button>
          </div>

          <FrameworkLegend />

          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-icon" style={{ fontSize: 28 }}>○</div>
              <div className="empty-title" style={{ fontSize: 16 }}>No matches</div>
              <div className="empty-sub">Try adjusting filters or clearing the search</div>
            </div>
          ) : view === 'table' ? (
            <StockTable
              rows={filtered}
              metricsMap={metricsMap}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onSelect={onSelect}
              onUpdate={onUpdate}
            />
          ) : (
            <div className="section-cards">
              {filtered.map(a => (
                <StockCard
                  key={a.ticker}
                  analysis={a}
                  metrics={metricsMap[a.ticker]}
                  onClick={() => onSelect(a.ticker)}
                  onUpdate={onUpdate}
                />
              ))}
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
            Showing {filtered.length} of {analyses.length} analyses
          </div>
        </>
      )}

      <style>{`
        /* ─── Stats bar ─── */
        .stats-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }
        .stat-chip {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 8px 14px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          cursor: pointer;
          transition: all 0.15s;
          min-width: 80px;
        }
        .stat-chip:hover { background: var(--surface2); border-color: var(--border2); }
        .stat-chip.active { background: var(--surface2); border-color: var(--accent); }
        .stat-num { font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: var(--text); line-height: 1.1; }
        .stat-lbl { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
        .stat-chip.stat-buy.active { border-color: var(--pass); }
        .stat-chip.stat-buy.active .stat-num { color: var(--pass); }
        .stat-chip.stat-watch.active { border-color: var(--warn); }
        .stat-chip.stat-watch.active .stat-num { color: var(--warn); }
        .stat-chip.stat-avoid.active { border-color: var(--fail); }
        .stat-chip.stat-avoid.active .stat-num { color: var(--fail); }
        .stat-chip.stat-undervalued.active { border-color: #c9a84c; }
        .stat-chip.stat-undervalued .stat-lbl { color: #c9a84c; font-weight: 600; }
        .stat-chip.stat-undervalued.active .stat-num { color: #c9a84c; }

        /* ─── Controls bar ─── */
        .controls-bar {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }
        .controls-search {
          flex: 1;
          min-width: 240px;
        }
        .controls-select {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 8px 12px;
          color: var(--text);
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
        }
        .view-toggle {
          display: flex;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .view-btn {
          background: transparent;
          border: none;
          padding: 7px 12px;
          color: var(--text-3);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .view-btn.active { background: var(--surface2); color: var(--accent); }
        .view-btn:hover:not(.active) { color: var(--text-2); }

        /* ─── Table ─── */
        .table-wrap {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow-x: auto;
        }
        .stock-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .stock-table th {
          padding: 10px 12px;
          text-align: left;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-3);
          font-weight: 600;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .stock-table th.th-sort { cursor: pointer; user-select: none; }
        .stock-table th.th-sort:hover { color: var(--accent); }
        .stock-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          vertical-align: middle;
        }
        .stock-table tbody tr {
          cursor: pointer;
          transition: background 0.1s;
        }
        .stock-table tbody tr:hover { background: var(--surface2); }
        .stock-table tbody tr.stale-row td.td-ticker { color: #f59e0b; }
        .td-ticker { font-weight: 600; color: var(--accent); }
        .td-company { color: var(--text); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .td-num { font-family: var(--font-mono); color: var(--text-2); text-align: right; }
        .td-gate { text-align: center; }
        .td-entry { color: var(--pass); font-size: 12px; }
        .td-age { text-align: center; }
        .td-action { text-align: center; }
        .td-gate .gate-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }

        /* ─── Card styles (kept) ─── */
        .stock-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 18px 20px;
          cursor: pointer;
          transition: border-color 0.15s, transform 0.1s;
        }
        .stock-card:hover { border-color: var(--border2); transform: translateY(-1px); }
        .stock-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
        .stock-ticker { font-family: var(--font-mono); font-size: 16px; font-weight: 600; color: var(--accent); margin-bottom: 2px; }
        .stock-name { font-size: 13px; color: var(--text-2); }
        .stock-gates-row {
          display: flex; gap: 10px; margin-bottom: 12px; padding: 10px 12px;
          background: var(--surface2); border-radius: var(--radius);
        }
        .gate-indicator-item { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
        .gate-dot { width: 10px; height: 10px; border-radius: 50%; display: block; }
        .gate-dot.pass { background: var(--pass); }
        .gate-dot.fail { background: var(--fail); }
        .gate-dot.warn { background: var(--warn); }
        .gate-dot.empty { background: var(--surface3); }
        .gate-indicator-label {
          font-size: 9px; color: var(--text-3);
          font-family: var(--font-mono); text-transform: uppercase;
        }
        .stock-metrics-row {
          display: flex; gap: 12px; margin-bottom: 10px; font-size: 11px;
          color: var(--text-3); padding: 6px 0; border-top: 1px dashed var(--border);
        }
        .stock-metrics-row b { color: var(--text-2); font-weight: 600; }
        .stock-entry { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
        .stock-entry-label {
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3);
        }
        .stock-entry-value { font-size: 13px; color: var(--pass); }
        .stock-card-stale { border-color: rgba(245, 158, 11, 0.3); }
        .stock-card-footer { display: flex; align-items: center; justify-content: space-between; }
        .stock-date { font-size: 11px; color: var(--text-3); }
        .age-badge { font-size: 10px; padding: 2px 7px; border-radius: 20px; font-weight: 500; }
        .age-fresh { background: rgba(16,185,129,0.12); color: var(--pass); }
        .age-aging { background: rgba(245,158,11,0.12); color: var(--warn); }
        .age-stale { background: rgba(245,158,11,0.18); color: #f59e0b; }
        .btn-update-small {
          font-size: 11px; padding: 3px 10px; border-radius: 6px;
          border: 1px solid rgba(245,158,11,0.4); background: rgba(245,158,11,0.08);
          color: #f59e0b; cursor: pointer; transition: background 0.15s;
        }
        .btn-update-small:hover { background: rgba(245,158,11,0.18); }
        .section-cards {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px;
        }
        .framework-legend {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: 12px 18px;
          margin-bottom: 16px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
        }
        .legend-label {
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-3); margin-right: 6px;
        }
        .legend-item {
          display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-2);
        }
        .empty-state { text-align: center; padding: 80px 20px; }
        .empty-icon { font-size: 40px; color: var(--text-3); margin-bottom: 12px; }
        .empty-title { font-family: var(--font-serif); font-size: 20px; color: var(--text); margin-bottom: 6px; }
        .empty-sub { color: var(--text-2); font-size: 14px; }

        @media (max-width: 768px) {
          .stat-chip { min-width: 70px; padding: 6px 10px; }
          .stat-num { font-size: 16px; }
          .controls-search { width: 100%; }
          .stock-table { font-size: 12px; }
          .stock-table th, .stock-table td { padding: 8px 6px; }
        }
      `}</style>
    </div>
  );
}

function FrameworkLegend() {
  const items = [
    { dot: 'pass', label: 'Pass' },
    { dot: 'warn', label: 'Conditional' },
    { dot: 'fail', label: 'Fail' },
    { dot: 'empty', label: 'N/A' },
  ];
  const gates = ['G1: Understand', 'G2a: Quantitative', 'G2b: Moat', 'G2c: Governance', 'G3: Valuation'];
  return (
    <div className="framework-legend">
      <span className="legend-label">Status</span>
      {items.map(i => (
        <div key={i.label} className="legend-item">
          <span className="gate-dot" style={{
            width: 8, height: 8, borderRadius: '50%', display: 'block',
            background: i.dot==='pass'?'var(--pass)':i.dot==='fail'?'var(--fail)':i.dot==='warn'?'var(--warn)':'var(--surface3)'
          }} />
          {i.label}
        </div>
      ))}
      <span className="legend-label" style={{marginLeft:'auto'}}>Gates</span>
      {gates.map(g => <div key={g} className="legend-item">{g}</div>)}
    </div>
  );
}
