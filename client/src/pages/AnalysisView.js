import React, { useState, useEffect } from 'react';
import authFetch from '../lib/api';

const statusColor = s =>
  s === 'PASS' ? 'var(--pass)' : s === 'FAIL' ? 'var(--fail)' : s === 'WARN' ? 'var(--warn)' : 'var(--text-3)';

function MetricRow({ label, value, benchmark, status }) {
  return (
    <div className="metric-row">
      <span className="metric-row-label">{label}</span>
      <span className="metric-row-value font-mono" style={{ color: statusColor(status) }}>{value || '—'}</span>
      {benchmark && <span className="metric-row-bench">{benchmark}</span>}
      {status && <span className={`status-pill status-${status}`}>{status}</span>}
    </div>
  );
}

function GateSection({ number, title, verdict, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="gate-section">
      <div className="gate-header" onClick={() => setOpen(o => !o)}>
        <span className="gate-number">{number}</span>
        <span className="gate-title">{title}</span>
        {verdict && <span className={`verdict-badge verdict-${verdict}`}>{verdict}</span>}
        <span className={`gate-toggle ${open ? 'open' : ''}`}>▼</span>
      </div>
      {open && <div className="gate-body">{children}</div>}
    </div>
  );
}

function Narrative({ text }) {
  if (!text) return null;
  const paras = text.split(/\n+/).filter(Boolean);
  return (
    <div className="narrative">
      {paras.map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}

function ForceIndicator({ label, value }) {
  const color = value === 'WEAK' || value === 'LOW' ? 'var(--pass)'
    : value === 'STRONG' || value === 'HIGH' ? 'var(--fail)' : 'var(--warn)';
  return (
    <div className="force-item">
      <span className="force-label">{label}</span>
      <span className="force-value" style={{ color }}>{value}</span>
    </div>
  );
}

export default function AnalysisView({ ticker, onBack, onAnalysisComplete, isAdmin }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({ stage: '', message: '', progress: 0 });
  const [watchlisted, setWatchlisted] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  useEffect(() => {
    authFetch(`/api/analysis/${ticker}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setAnalysis(data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker]);

  const toggleWatchlist = async () => {
    if (!analysis) return;
    setWatchlistLoading(true);
    try {
      if (watchlisted) {
        await authFetch(`/api/watchlist/${ticker}`, { method: 'DELETE' });
        setWatchlisted(false);
      } else {
        await authFetch('/api/watchlist', { method: 'POST', body: JSON.stringify({ ticker, company: analysis.company }) });
        setWatchlisted(true);
      }
    } catch (e) { console.error(e); }
    setWatchlistLoading(false);
  };

  const handleUpdate = () => {
    if (!analysis?.company) return;
    setUpdating(true);
    setUpdateProgress({ stage: 'starting', message: 'Starting update...', progress: 5 });

    authFetch(`/api/analysis/${ticker}/update`, {
      method: 'POST',
      body: JSON.stringify({ companyName: analysis.company })
    }).then(async res => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const event = JSON.parse(line.slice(5).trim());
            if (event.type === 'progress') {
              setUpdateProgress({ stage: event.stage, message: event.message, progress: event.progress });
            } else if (event.type === 'result') {
              setAnalysis(event.analysis);
              setUpdating(false);
              if (onAnalysisComplete) onAnalysisComplete(ticker);
            } else if (event.type === 'error') {
              setError(event.error);
              setUpdating(false);
            }
          } catch {}
        }
      }
    }).catch(e => { setError(e.message); setUpdating(false); });
  };

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} onBack={onBack} />;
  if (!analysis) return null;

  const { gate1, gate2a, gate2b, gate2c, gate3 } = analysis;

  return (
    <div className="analysis-view">
      {/* Update progress overlay */}
      {updating && (
        <div className="update-overlay">
          <div className="update-modal">
            <div className="update-modal-title">Updating Analysis</div>
            <div className="update-modal-sub">{updateProgress.message}</div>
            <div className="update-progress-bar">
              <div className="update-progress-fill" style={{ width: `${updateProgress.progress}%` }} />
            </div>
            <div className="update-progress-pct">{updateProgress.progress}%</div>
          </div>
        </div>
      )}

      {/* Back */}
      <button className="btn btn-secondary btn-sm" style={{ marginTop: 24 }} onClick={onBack}>
        ← Dashboard
      </button>

      {/* Hero */}
      <div className="analysis-hero">
        <div className="analysis-hero-left">
          <div className="analysis-ticker">{analysis.ticker}</div>
          <div className="analysis-company">{analysis.company}</div>
          <div className="analysis-date">
            Analysed {analysis.analysisDate}
            {analysis.isUpdate && analysis.previousAnalysisDate && (
              <span className="update-tag"> · Updated from {analysis.previousAnalysisDate}</span>
            )}
          </div>
        </div>
        <div className="analysis-hero-right">
          <span className={`verdict-badge verdict-${analysis.overallVerdict}`} style={{ fontSize: 14, padding: '6px 16px' }}>
            {analysis.overallVerdict}
          </span>
          <div className="analysis-entry">
            <div className="analysis-entry-label">Entry zone</div>
            <div className="analysis-entry-value font-mono">{analysis.targetEntryPrice}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button
              className="btn-update"
              onClick={toggleWatchlist}
              disabled={watchlistLoading}
              style={{ borderColor: watchlisted ? 'rgba(46,204,122,0.4)' : undefined, color: watchlisted ? 'var(--pass)' : undefined }}
            >
              {watchlisted ? '★ Watchlisted' : '☆ Watchlist'}
            </button>
            {isAdmin && (
              <button className="btn-update" onClick={handleUpdate} disabled={updating}>
                ↻ Update Analysis
              </button>
            )}
          </div>
        </div>
      </div>

      {/* What Changed banner */}
      {analysis.changesSinceLastAnalysis && (
        <div className="changes-banner">
          <div className="changes-banner-header">
            <span className="changes-icon">↻</span>
            <span className="changes-title">What Changed</span>
            <span className="changes-trigger">{analysis.changesSinceLastAnalysis.triggerEvent}</span>
            {analysis.changesSinceLastAnalysis.verdictChanged && (
              <span className="verdict-change-pill">
                {analysis.changesSinceLastAnalysis.previousVerdict} → {analysis.overallVerdict}
              </span>
            )}
          </div>
          <p className="changes-summary">{analysis.changesSinceLastAnalysis.summary}</p>
          {analysis.changesSinceLastAnalysis.changes?.length > 0 && (
            <div className="changes-list">
              {analysis.changesSinceLastAnalysis.changes.map((c, i) => (
                <div key={i} className="change-item">
                  <span className="change-gate">{c.gate}</span>
                  <span className="change-metric">{c.metric}</span>
                  <span className="change-arrow">
                    {c.previous} → <strong>{c.updated}</strong>
                  </span>
                  <span className={`change-dir ${c.direction === 'improved' ? 'dir-up' : c.direction === 'deteriorated' ? 'dir-down' : 'dir-neutral'}`}>
                    {c.direction === 'improved' ? '▲' : c.direction === 'deteriorated' ? '▼' : '●'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Verdict summary */}
      <div className="verdict-summary-box">
        <div className="section-label">Executive Summary</div>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text-2)' }}>
          {analysis.verdictSummary}
        </p>
      </div>

      {/* Gate overview row */}
      <div className="gate-overview-row">
        {[
          { key: 'gate1', label: 'Gate 1 · Understand', verdict: gate1?.verdict },
          { key: 'gate2a', label: 'Gate 2a · Quantitative', verdict: gate2a?.verdict },
          { key: 'gate2b', label: 'Gate 2b · Qualitative', verdict: gate2b?.verdict },
          { key: 'gate2c', label: 'Gate 2c · Governance', verdict: gate2c?.verdict },
          { key: 'gate3', label: 'Gate 3 · Valuation', verdict: gate3?.verdict },
        ].map(g => (
          <div key={g.key} className="gate-overview-card">
            <div className="gate-overview-label">{g.label}</div>
            {g.verdict
              ? <span className={`verdict-badge verdict-${g.verdict}`}>{g.verdict}</span>
              : <span className="text-dim text-xs">—</span>
            }
          </div>
        ))}
      </div>

      {/* ─── Gate 1 ─── */}
      {gate1 && (
        <GateSection number="Gate 1" title="Understanding the Business" verdict={gate1.verdict}>
          <div className="understanding-statement">
            <div className="section-label">Understanding Statement</div>
            <p style={{ fontSize: 14, color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.7 }}>
              "{gate1.understandingStatement}"
            </p>
          </div>

          {gate1.parameters && (
            <div style={{ marginTop: 16 }}>
              <div className="section-label">6 Parameters</div>
              <div className="param-grid">
                {Object.entries(gate1.parameters).map(([k, v]) => (
                  <div key={k} className="param-item">
                    <div className="param-key">{k}</div>
                    <div className="param-val">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <IndiaFlags flags={gate1.indiaFlags} />
          <Narrative text={gate1.narrative} />
        </GateSection>
      )}

      {/* ─── Gate 2a ─── */}
      {gate2a && (
        <GateSection number="Gate 2a" title="Historical Performance — Quantitative" verdict={gate2a.verdict}>
          {gate2a.metrics && (
            <div>
              <div className="section-label">Key Metrics</div>
              <div className="metrics-table">
                {Object.entries(gate2a.metrics).map(([k, m]) => (
                  <MetricRow
                    key={k}
                    label={formatMetricLabel(k)}
                    value={m.value}
                    benchmark={m.benchmark}
                    status={m.status}
                  />
                ))}
              </div>
            </div>
          )}
          <IndiaFlags flags={gate2a.indiaFlags} />
          <Narrative text={gate2a.narrative} />
        </GateSection>
      )}

      {/* ─── Gate 2b ─── */}
      {gate2b && (
        <GateSection number="Gate 2b" title="Future Performance — Qualitative" verdict={gate2b.verdict}>
          <div className="qual-grid">
            {/* Breadth */}
            {gate2b.breadthAnalysis && (
              <div className="qual-card">
                <div className="section-label">Breadth Analysis</div>
                <div className="metrics-table">
                  <MetricRow label="Customer breadth" value={gate2b.breadthAnalysis.customerBreadthNote} status={gate2b.breadthAnalysis.customerBreadth} />
                  <MetricRow label="Supplier breadth" value={gate2b.breadthAnalysis.supplierBreadthNote} status={gate2b.breadthAnalysis.supplierBreadth} />
                </div>
              </div>
            )}

            {/* Forces */}
            {gate2b.forcesAnalysis && (
              <div className="qual-card">
                <div className="section-label">Porter's Forces</div>
                <div className="forces-grid">
                  <ForceIndicator label="Customer power" value={gate2b.forcesAnalysis.customerBargainingPower} />
                  <ForceIndicator label="Supplier power" value={gate2b.forcesAnalysis.supplierBargainingPower} />
                  <ForceIndicator label="Substitutes" value={gate2b.forcesAnalysis.threatSubstitutes} />
                  <ForceIndicator label="New entrants" value={gate2b.forcesAnalysis.threatNewEntrants} />
                </div>
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  Overall: <span style={{ color: gate2b.forcesAnalysis.overallForces === 'FAVOURABLE' ? 'var(--pass)' : gate2b.forcesAnalysis.overallForces === 'UNFAVOURABLE' ? 'var(--fail)' : 'var(--warn)' }}>
                    {gate2b.forcesAnalysis.overallForces}
                  </span>
                </div>
              </div>
            )}

            {/* Moat */}
            {gate2b.moat && (
              <div className="qual-card">
                <div className="section-label">Moat</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span className={`verdict-badge ${gate2b.moat.exists ? 'verdict-PASS' : 'verdict-FAIL'}`}>
                    {gate2b.moat.exists ? 'Moat exists' : 'No moat'}
                  </span>
                  {gate2b.moat.type && gate2b.moat.type !== 'NONE' && (
                    <span className="verdict-badge verdict-CONDITIONAL">{gate2b.moat.type}</span>
                  )}
                  {gate2b.moat.durabilityRating && (
                    <span className="verdict-badge verdict-CONDITIONAL">{gate2b.moat.durabilityRating}</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{gate2b.moat.description}</p>
              </div>
            )}

            {/* Market growth */}
            {gate2b.marketGrowth && (
              <div className="qual-card">
                <div className="section-label">Market Growth</div>
                <div style={{ marginBottom: 6 }}>
                  <span className={`verdict-badge verdict-${gate2b.marketGrowth.rating === 'STRONG' ? 'PASS' : gate2b.marketGrowth.rating === 'DECLINING' ? 'FAIL' : 'CONDITIONAL'}`}>
                    {gate2b.marketGrowth.rating}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{gate2b.marketGrowth.description}</p>
              </div>
            )}
          </div>

          <IndiaFlags flags={gate2b.indiaFlags} />
          <Narrative text={gate2b.narrative} />
        </GateSection>
      )}

      {/* ─── Gate 2c ─── */}
      {gate2c && (
        <GateSection number="Gate 2c" title="Shareholder-Friendliness" verdict={gate2c.verdict}>
          {gate2c.indicators && (
            <div>
              <div className="section-label">Governance Indicators</div>
              <div className="metrics-table">
                {Object.entries(gate2c.indicators).map(([k, m]) => (
                  <MetricRow key={k} label={formatMetricLabel(k)} value={m.value} status={m.status} />
                ))}
              </div>
            </div>
          )}
          <IndiaFlags flags={gate2c.indiaFlags} />
          <Narrative text={gate2c.narrative} />
        </GateSection>
      )}

      {/* ─── Gate 3 ─── */}
      {gate3 && (
        <GateSection number="Gate 3" title="Inexpensiveness — Valuation" verdict={gate3.verdict}>
          {gate3.metrics && (
            <div>
              <div className="section-label">Valuation Metrics</div>
              <div className="metrics-table">
                {Object.entries(gate3.metrics).map(([k, m]) => {
                  // currentPrice and marketCap are plain strings in the schema; others are {value, benchmark, status} objects
                  const isString = typeof m === 'string' || typeof m === 'number';
                  return (
                    <MetricRow
                      key={k}
                      label={formatMetricLabel(k)}
                      value={isString ? m : m?.value}
                      benchmark={isString ? null : m?.benchmark}
                      status={isString ? null : m?.status}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {gate3.valuationScenarios && (
            <div style={{ marginTop: 16 }}>
              <div className="section-label">Valuation Scenarios</div>
              <div className="scenarios-row">
                {Object.entries(gate3.valuationScenarios).map(([k, s]) => (
                  <div key={k} className={`scenario-card scenario-${k}`}>
                    <div className="scenario-label">{k.replace('Case', ' case').replace(/^\w/, c => c.toUpperCase())}</div>
                    <div className="scenario-price font-mono">{s.price}</div>
                    <div className="scenario-assumption">{s.assumption}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {gate3.entryZone && (
            <div className="entry-zone-banner">
              <span className="entry-zone-label">Value Entry Zone</span>
              <span className="entry-zone-value font-mono">{gate3.entryZone}</span>
            </div>
          )}

          <IndiaFlags flags={gate3.indiaFlags} />
          <Narrative text={gate3.narrative} />
        </GateSection>
      )}

      {/* Risks & Catalysts */}
      <div className="risks-catalysts-grid">
        {analysis.keyRisks?.length > 0 && (
          <div className="rc-section">
            <div className="section-label">Key Risks</div>
            <ul className="rc-list risk-list">
              {analysis.keyRisks.map((r, i) => <li key={i}><span>▼</span>{r}</li>)}
            </ul>
          </div>
        )}
        {analysis.catalysts?.length > 0 && (
          <div className="rc-section">
            <div className="section-label">Re-rating Catalysts</div>
            <ul className="rc-list catalyst-list">
              {analysis.catalysts.map((c, i) => <li key={i}><span>▲</span>{c}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Peers */}
      {analysis.comparablePeers?.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="section-label">Comparable Peers</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {analysis.comparablePeers.map(p => (
              <span key={p} className="peer-badge font-mono">{p}</span>
            ))}
          </div>
        </div>
      )}

      {analysis.dataQualityNote && (
        <div className="data-quality-note">
          <span style={{ color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Data note</span>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{analysis.dataQualityNote}</p>
        </div>
      )}

      <style>{`
        .analysis-view { padding-bottom: 60px; position: relative; }
        .update-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .update-modal {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: 32px 40px;
          min-width: 320px; text-align: center;
        }
        .update-modal-title { font-family: var(--font-serif); font-size: 18px; color: var(--text); margin-bottom: 8px; }
        .update-modal-sub { font-size: 13px; color: var(--text-2); margin-bottom: 20px; }
        .update-progress-bar {
          background: var(--surface2); border-radius: 99px; height: 6px; overflow: hidden; margin-bottom: 8px;
        }
        .update-progress-fill {
          background: var(--accent); height: 100%; border-radius: 99px; transition: width 0.4s ease;
        }
        .update-progress-pct { font-size: 12px; color: var(--text-3); font-family: var(--font-mono); }
        .btn-update {
          font-size: 12px; padding: 6px 14px; border-radius: 8px;
          border: 1px solid var(--border2); background: var(--surface2);
          color: var(--text-2); cursor: pointer; transition: all 0.15s;
        }
        .btn-update:hover { border-color: var(--accent); color: var(--accent); }
        .btn-update:disabled { opacity: 0.5; cursor: not-allowed; }
        .update-tag { color: var(--accent); font-size: 11px; }
        .changes-banner {
          background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.2);
          border-radius: var(--radius-lg); padding: 16px 20px; margin-bottom: 20px;
        }
        .changes-banner-header {
          display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;
        }
        .changes-icon { font-size: 16px; color: var(--pass); }
        .changes-title { font-weight: 600; font-size: 14px; color: var(--text); }
        .changes-trigger {
          font-size: 11px; padding: 2px 8px; background: var(--surface2);
          border-radius: 20px; color: var(--text-2); border: 1px solid var(--border);
        }
        .verdict-change-pill {
          font-size: 11px; padding: 2px 8px; background: rgba(16,185,129,0.15);
          border-radius: 20px; color: var(--pass); font-weight: 600;
        }
        .changes-summary { font-size: 13px; color: var(--text-2); line-height: 1.6; margin-bottom: 12px; }
        .changes-list { display: flex; flex-direction: column; gap: 6px; }
        .change-item {
          display: flex; align-items: center; gap: 10px; font-size: 12px;
          padding: 6px 10px; background: var(--surface); border-radius: var(--radius);
          border: 1px solid var(--border);
        }
        .change-gate { font-size: 10px; color: var(--text-3); background: var(--surface2); padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
        .change-metric { color: var(--text-2); flex: 1; }
        .change-arrow { font-family: var(--font-mono); font-size: 12px; color: var(--text); }
        .change-dir { font-size: 12px; }
        .dir-up { color: var(--pass); }
        .dir-down { color: var(--fail); }
        .dir-neutral { color: var(--text-3); }
        .analysis-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 28px 0 20px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 20px;
        }
        .analysis-ticker {
          font-family: var(--font-mono);
          font-size: 28px;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 4px;
        }
        .analysis-company {
          font-family: var(--font-serif);
          font-size: 18px;
          color: var(--text);
          margin-bottom: 4px;
        }
        .analysis-date { font-size: 12px; color: var(--text-3); }
        .analysis-hero-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
        }
        .analysis-entry-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-3);
        }
        .analysis-entry-value { font-size: 14px; color: var(--pass); }
        .verdict-summary-box {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 16px 20px;
          margin-bottom: 20px;
        }
        .gate-overview-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-bottom: 20px;
        }
        .gate-overview-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 12px;
        }
        .gate-overview-label {
          font-size: 10px;
          color: var(--text-3);
          margin-bottom: 6px;
          line-height: 1.3;
        }
        .metrics-table {
          display: flex;
          flex-direction: column;
          gap: 0;
          background: var(--surface2);
          border-radius: var(--radius);
          overflow: hidden;
          border: 1px solid var(--border);
        }
        .metric-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
        }
        .metric-row:last-child { border-bottom: none; }
        .metric-row-label { color: var(--text-2); flex: 1; }
        .metric-row-value { font-size: 12px; }
        .metric-row-bench {
          font-size: 10px;
          color: var(--text-3);
          font-family: var(--font-mono);
        }
        .understanding-statement {
          background: var(--surface2);
          border-radius: var(--radius);
          padding: 14px 16px;
          border-left: 3px solid var(--accent);
        }
        .param-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .param-item {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 8px 10px;
        }
        .param-key {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-3);
          margin-bottom: 3px;
        }
        .param-val { font-size: 11px; color: var(--text-2); line-height: 1.4; }
        .qual-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .qual-card {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px 14px;
        }
        .forces-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .force-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          padding: 4px 0;
          border-bottom: 1px solid var(--border);
        }
        .force-label { color: var(--text-2); }
        .force-value { font-weight: 600; font-size: 11px; }
        .scenarios-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 8px;
        }
        .scenario-card {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px;
          text-align: center;
        }
        .scenario-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-3);
          margin-bottom: 6px;
        }
        .scenario-bearCase .scenario-price { color: var(--fail); }
        .scenario-baseCase .scenario-price { color: var(--warn); }
        .scenario-bullCase .scenario-price { color: var(--pass); }
        .scenario-price { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
        .scenario-assumption { font-size: 10px; color: var(--text-3); line-height: 1.4; }
        .entry-zone-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--pass-bg);
          border: 1px solid var(--pass-border);
          border-radius: var(--radius);
          padding: 12px 16px;
          margin-top: 16px;
        }
        .entry-zone-label { font-size: 12px; color: var(--pass); }
        .entry-zone-value { font-size: 18px; color: var(--pass); font-weight: 600; }
        .risks-catalysts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 20px;
        }
        .rc-section {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 16px 18px;
        }
        .rc-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .rc-list li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: var(--text-2);
          line-height: 1.5;
        }
        .risk-list li span { color: var(--fail); flex-shrink: 0; }
        .catalyst-list li span { color: var(--pass); flex-shrink: 0; }
        .peer-badge {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 4px 10px;
          font-size: 12px;
          color: var(--accent);
        }
        .data-quality-note {
          margin-top: 20px;
          padding: 10px 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
        }
        @media (max-width: 768px) {
          .gate-overview-row { grid-template-columns: repeat(3, 1fr); }
          .qual-grid { grid-template-columns: 1fr; }
          .scenarios-row { grid-template-columns: 1fr; }
          .risks-catalysts-grid { grid-template-columns: 1fr; }
          .param-grid { grid-template-columns: repeat(2, 1fr); }
          .analysis-hero { flex-direction: column; gap: 16px; }
        }
      `}</style>
    </div>
  );
}

function IndiaFlags({ flags }) {
  if (!flags?.length) return null;
  return (
    <ul className="flag-list" style={{ marginTop: 12 }}>
      {flags.map((f, i) => (
        <li key={i} className="flag-item">
          <span className="flag-icon">⚑</span>
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: '24px 0' }}>
      <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 100, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 60, marginBottom: 12 }} />
      {[1,2,3,4].map(i => (
        <div key={i} className="skeleton" style={{ height: 120, marginBottom: 12 }} />
      ))}
    </div>
  );
}

function ErrorState({ error, onBack }) {
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>⚠</div>
      <div style={{ fontSize: 16, fontFamily: 'var(--font-serif)', marginBottom: 8 }}>Analysis not found</div>
      <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 20 }}>{error}</div>
      <button className="btn btn-secondary" onClick={onBack}>← Back to Dashboard</button>
    </div>
  );
}

function formatMetricLabel(key) {
  const map = {
    roce5yr: 'ROCE (5yr avg)', roeLast: 'ROE (last year)',
    revenueCAGR5yr: 'Revenue CAGR (5yr)', patCAGR5yr: 'PAT CAGR (5yr)',
    debtEquity: 'Debt / Equity', promoterPledge: 'Promoter pledge',
    ocfQuality: 'OCF quality', promoterHolding: 'Promoter holding',
    dividendPayout: 'Dividend payout', rptConcerns: 'Related party transactions',
    auditQuality: 'Audit quality', currentPrice: 'Current price',
    marketCap: 'Market cap', evOI: 'EV / OI', mcapFCF: 'MCAP / FCF',
    priceBook: 'Price / Book', peRatio: 'P/E ratio', netCash: 'Net cash',
    dividendYield: 'Dividend yield',
  };
  return map[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}
