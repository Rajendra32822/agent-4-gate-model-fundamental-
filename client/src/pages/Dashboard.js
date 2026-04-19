import React, { useState } from 'react';

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

function StockCard({ analysis, onClick, onUpdate }) {
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

export default function Dashboard({ analyses, loading, onSelect, onNewAnalysis, onUpdate }) {
  const buyList  = analyses.filter(a => a.overallVerdict === 'BUY');
  const watchList = analyses.filter(a => a.overallVerdict === 'WATCH');
  const avoidList = analyses.filter(a => a.overallVerdict === 'AVOID');

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Fundamental Dashboard</div>
          <div className="page-subtitle">
            Marshall's 4-gate value investing framework · Indian Equity
          </div>
        </div>
        <button className="btn btn-primary" onClick={onNewAnalysis}>
          + Analyse New Stock
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} className="skeleton" style={{ height: 180 }} />
          ))}
        </div>
      ) : (
        <>
          <FrameworkLegend />

          {buyList.length > 0 && (
            <Section title="Buy Zone" subtitle="Passes all 4 gates · Value entry confirmed" color="var(--pass)">
              {buyList.map(a => <StockCard key={a.ticker} analysis={a} onClick={() => onSelect(a.ticker)} onUpdate={onUpdate} />)}
            </Section>
          )}

          {watchList.length > 0 && (
            <Section title="Watchlist" subtitle="Quality business · Not yet at value entry" color="var(--warn)">
              {watchList.map(a => <StockCard key={a.ticker} analysis={a} onClick={() => onSelect(a.ticker)} onUpdate={onUpdate} />)}
            </Section>
          )}

          {avoidList.length > 0 && (
            <Section title="Avoid" subtitle="Fails one or more critical gates" color="var(--fail)">
              {avoidList.map(a => <StockCard key={a.ticker} analysis={a} onClick={() => onSelect(a.ticker)} onUpdate={onUpdate} />)}
            </Section>
          )}

          {analyses.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <div className="empty-title">No analyses yet</div>
              <div className="empty-sub">Run your first analysis to see results here</div>
              <button className="btn btn-primary mt-16" onClick={onNewAnalysis}>
                Analyse a Stock
              </button>
            </div>
          )}
        </>
      )}

      <style>{`
        .stock-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 18px 20px;
          cursor: pointer;
          transition: border-color 0.15s, transform 0.1s;
        }
        .stock-card:hover {
          border-color: var(--border2);
          transform: translateY(-1px);
        }
        .stock-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .stock-ticker {
          font-family: var(--font-mono);
          font-size: 16px;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 2px;
        }
        .stock-name {
          font-size: 13px;
          color: var(--text-2);
        }
        .stock-gates-row {
          display: flex;
          gap: 10px;
          margin-bottom: 12px;
          padding: 10px 12px;
          background: var(--surface2);
          border-radius: var(--radius);
        }
        .gate-indicator-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          flex: 1;
        }
        .gate-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: block;
        }
        .gate-dot.pass { background: var(--pass); }
        .gate-dot.fail { background: var(--fail); }
        .gate-dot.warn { background: var(--warn); }
        .gate-dot.empty { background: var(--surface3); }
        .gate-indicator-label {
          font-size: 9px;
          color: var(--text-3);
          font-family: var(--font-mono);
          text-transform: uppercase;
        }
        .stock-entry {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: 10px;
        }
        .stock-entry-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-3);
        }
        .stock-entry-value {
          font-size: 13px;
          color: var(--pass);
        }
        .stock-card-stale {
          border-color: rgba(245, 158, 11, 0.3);
        }
        .stock-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .stock-date {
          font-size: 11px;
          color: var(--text-3);
        }
        .age-badge {
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 20px;
          font-weight: 500;
        }
        .age-fresh { background: rgba(16,185,129,0.12); color: var(--pass); }
        .age-aging { background: rgba(245,158,11,0.12); color: var(--warn); }
        .age-stale { background: rgba(245,158,11,0.18); color: #f59e0b; }
        .btn-update-small {
          font-size: 11px;
          padding: 3px 10px;
          border-radius: 6px;
          border: 1px solid rgba(245,158,11,0.4);
          background: rgba(245,158,11,0.08);
          color: #f59e0b;
          cursor: pointer;
          transition: background 0.15s;
        }
        .btn-update-small:hover { background: rgba(245,158,11,0.18); }
        .section-wrap { margin-bottom: 36px; }
        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }
        .section-dot {
          width: 8px; height: 8px; border-radius: 50%;
        }
        .section-head-title {
          font-family: var(--font-serif);
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
        }
        .section-head-sub {
          font-size: 12px;
          color: var(--text-3);
        }
        .section-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 14px;
        }
        .framework-legend {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 14px 18px;
          margin-bottom: 28px;
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .legend-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-3);
          margin-right: 8px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--text-2);
        }
        .empty-state {
          text-align: center;
          padding: 80px 20px;
        }
        .empty-icon { font-size: 40px; color: var(--text-3); margin-bottom: 12px; }
        .empty-title { font-family: var(--font-serif); font-size: 20px; color: var(--text); margin-bottom: 6px; }
        .empty-sub { color: var(--text-2); font-size: 14px; }
      `}</style>
    </div>
  );
}

function Section({ title, subtitle, color, children }) {
  return (
    <div className="section-wrap">
      <div className="section-header">
        <div className="section-dot" style={{ background: color }} />
        <div>
          <div className="section-head-title">{title}</div>
          <div className="section-head-sub">{subtitle}</div>
        </div>
      </div>
      <div className="section-cards">{children}</div>
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
  const gates = ['G1: Understand', 'G2a: ROCE/Quantitative', 'G2b: Moat/Qualitative', 'G2c: Governance', 'G3: Valuation'];
  return (
    <div className="framework-legend">
      <span className="legend-label">Gate status</span>
      {items.map(i => (
        <div key={i.label} className="legend-item">
          <span className={`gate-dot ${i.dot}`} style={{width:8,height:8,borderRadius:'50%',display:'block',
            background: i.dot==='pass'?'var(--pass)':i.dot==='fail'?'var(--fail)':i.dot==='warn'?'var(--warn)':'var(--surface3)'}} />
          {i.label}
        </div>
      ))}
      <span className="legend-label" style={{marginLeft:'auto'}}>Gates</span>
      {gates.map(g => <div key={g} className="legend-item">{g}</div>)}
    </div>
  );
}
