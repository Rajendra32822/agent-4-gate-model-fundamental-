import React, { useState, useRef } from 'react';
import authFetch from '../lib/api';
import supabase from '../lib/supabase';

const POPULAR_STOCKS = [
  { ticker: 'HDFCBANK', name: 'HDFC Bank' },
  { ticker: 'TCS', name: 'Tata Consultancy Services' },
  { ticker: 'RELIANCE', name: 'Reliance Industries' },
  { ticker: 'INFY', name: 'Infosys' },
  { ticker: 'BAJFINANCE', name: 'Bajaj Finance' },
  { ticker: 'TITAN', name: 'Titan Company' },
  { ticker: 'PIDILITIND', name: 'Pidilite Industries' },
  { ticker: 'ASIANPAINT', name: 'Asian Paints' },
  { ticker: 'DRREDDY', name: 'Dr Reddy\'s Laboratories' },
  { ticker: 'SUPREMEIND', name: 'Supreme Industries' },
  { ticker: 'POLYCAB', name: 'Polycab India' },
  { ticker: 'DMART', name: 'Avenue Supermarts (DMart)' },
];

const STAGES = [
  { key: 'fetching', label: 'Fetching financial data', icon: '⟳' },
  { key: 'analysing', label: 'Applying Marshall framework', icon: '◈' },
  { key: 'gates', label: 'Running 4-gate analysis', icon: '▣' },
  { key: 'processing', label: 'Processing results', icon: '⟴' },
  { key: 'complete', label: 'Analysis complete', icon: '✓' },
];

export default function NewAnalysis({ onComplete, onBack }) {
  const [query, setQuery] = useState('');
  const [ticker, setTicker] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const esRef = useRef(null);

  const handleLookup = async (searchQuery) => {
    if (!searchQuery.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    setError(null);
    try {
      const res = await authFetch(`/api/lookup?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setLookupResult(data);
        setTicker(data.ticker);
        setCompanyName(data.name);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleQuickSelect = (t, n) => {
    setQuery(n);
    setTicker(t);
    setCompanyName(n);
    setLookupResult({ ticker: t, name: n });
    setError(null);
  };

  const handleAnalyse = () => {
    if (!ticker || !companyName) return;
    setAnalysing(true);
    setProgress(0);
    setStage('starting');
    setMessage('Initialising analysis...');
    setError(null);

    // Use fetch with streaming
    authFetch('/api/analyse', {
      method: 'POST',
      body: JSON.stringify({ ticker, companyName })
    }).then(response => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const read = () => {
        reader.read().then(({ done, value }) => {
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'progress') {
                  setProgress(data.progress || 0);
                  setStage(data.stage || '');
                  setMessage(data.message || '');
                } else if (data.type === 'result') {
                  setProgress(100);
                  setStage('complete');
                  setMessage('Analysis complete!');
                  setTimeout(() => onComplete(ticker), 800);
                  return;
                } else if (data.type === 'error') {
                  setError(data.error);
                  setAnalysing(false);
                }
              } catch (e) {}
            }
          }
          read();
        });
      };
      read();
    }).catch(err => {
      setError(err.message);
      setAnalysing(false);
    });
  };

  if (analysing) {
    return (
      <div className="new-analysis-page">
        <div className="analysis-progress-view">
          <div className="progress-company">{companyName}</div>
          <div className="progress-ticker font-mono">{ticker}</div>

          <div style={{ margin: '32px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
              <span>{message}</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-track" style={{ height: 4 }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="stages-list">
            {STAGES.map(s => {
              const isActive = s.key === stage;
              const stageOrder = STAGES.findIndex(st => st.key === stage);
              const thisOrder = STAGES.findIndex(st => st.key === s.key);
              const isDone = thisOrder < stageOrder || stage === 'complete';
              return (
                <div key={s.key} className={`stage-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                  <span className="stage-icon">{isDone ? '✓' : isActive ? '◉' : s.icon}</span>
                  <span className="stage-label">{s.label}</span>
                </div>
              );
            })}
          </div>

          <div className="progress-note">
            This analysis uses web search to gather financial data from Screener.in, BSE, and news sources,
            then applies Marshall's complete 4-gate framework. Typically takes 2–4 minutes.
          </div>
        </div>

        <style>{`
          .analysis-progress-view {
            max-width: 480px; margin: 60px auto; text-align: center;
          }
          .progress-company {
            font-family: var(--font-serif); font-size: 22px; color: var(--text); margin-bottom: 4px;
          }
          .progress-ticker { font-size: 14px; color: var(--accent); margin-bottom: 0; }
          .stages-list {
            text-align: left; display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px;
          }
          .stage-item {
            display: flex; align-items: center; gap: 10px; padding: 10px 14px;
            background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
            font-size: 13px; color: var(--text-3); transition: all 0.2s;
          }
          .stage-item.active {
            border-color: var(--accent); color: var(--text); background: var(--surface2);
          }
          .stage-item.done { color: var(--pass); border-color: var(--pass-border); background: var(--pass-bg); }
          .stage-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
          .progress-note {
            font-size: 11px; color: var(--text-3); line-height: 1.6;
            background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 10px 14px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="new-analysis-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">New Analysis</div>
          <div className="page-subtitle">Analyse any NSE/BSE listed company through Marshall's 4-gate framework</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
      </div>

      <div className="new-analysis-content">
        {/* Search */}
        <div className="search-section">
          <div className="section-label">Search company</div>
          <div className="search-row">
            <input
              className="input-field"
              placeholder="Type company name or NSE ticker (e.g. HDFC Bank, TCS, INFY...)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLookup(query)}
              disabled={lookupLoading}
              autoFocus
            />
            <button
              className="btn btn-secondary"
              onClick={() => handleLookup(query)}
              disabled={!query.trim() || lookupLoading}
            >
              {lookupLoading ? '...' : 'Find'}
            </button>
          </div>

          {error && (
            <div className="lookup-error">{error}</div>
          )}

          {lookupResult && (
            <div className="lookup-result">
              <div>
                <span className="font-mono" style={{ color: 'var(--accent)', fontSize: 15 }}>{lookupResult.ticker}</span>
                {' · '}
                <span style={{ fontSize: 14 }}>{lookupResult.name}</span>
                {lookupResult.sector && (
                  <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>({lookupResult.sector})</span>
                )}
              </div>
              <span className="verdict-badge verdict-PASS" style={{ fontSize: 11 }}>Found</span>
            </div>
          )}
        </div>

        {/* PRIMARY CTA — appears immediately when ticker selected, no scrolling needed */}
        {(ticker && companyName) && (
          <div className="analyse-cta-top">
            <div className="analyse-cta-top-info">
              <div className="cta-top-label">Ready to analyse</div>
              <div className="cta-top-name">
                <span className="font-mono" style={{ color: 'var(--accent)' }}>{ticker}</span>
                <span style={{ color: 'var(--text-3)', margin: '0 8px' }}>·</span>
                <span>{companyName}</span>
              </div>
            </div>
            <button className="btn btn-primary btn-analyse-top" onClick={handleAnalyse}>
              ▶  Analyse {ticker}
            </button>
          </div>
        )}

        <div className="divider" />

        {/* Popular stocks */}
        <div className="popular-section">
          <div className="section-label">Or pick from popular stocks</div>
          <div className="popular-grid">
            {POPULAR_STOCKS.map(s => (
              <button
                key={s.ticker}
                className={`popular-card ${ticker === s.ticker ? 'selected' : ''}`}
                onClick={() => handleQuickSelect(s.ticker, s.name)}
              >
                <span className="popular-ticker font-mono">{s.ticker}</span>
                <span className="popular-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="divider" />

        {/* Framework info */}
        <div className="framework-info">
          <div className="section-label">What will be analysed</div>
          <div className="gates-preview">
            {[
              { num: 'Gate 1', title: 'Understand', desc: 'Business model, 6 parameters, India flags' },
              { num: 'Gate 2a', title: 'Quantitative', desc: 'ROCE, FCF, revenue growth, debt, promoter pledge' },
              { num: 'Gate 2b', title: 'Qualitative', desc: 'Moat, Porter\'s forces, market growth, breadth' },
              { num: 'Gate 2c', title: 'Governance', desc: 'Promoter holding, RPTs, dividends, audit quality' },
              { num: 'Gate 3', title: 'Valuation', desc: 'EV/OI, MCAP/FCF, P/B, entry zone with scenarios' },
            ].map(g => (
              <div key={g.num} className="gate-preview-item">
                <div className="gate-preview-num">{g.num}</div>
                <div className="gate-preview-title">{g.title}</div>
                <div className="gate-preview-desc">{g.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Secondary CTA at bottom for users who scroll through */}
        {(ticker && companyName) && (
          <div className="analyse-cta">
            <button className="btn btn-primary" style={{ fontSize: 16, padding: '12px 32px' }} onClick={handleAnalyse}>
              ▶  Analyse {ticker}
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
              Takes 2–4 minutes · Uses live web search · AI-powered
            </div>
          </div>
        )}
      </div>

      <style>{`
        .new-analysis-content { max-width: 760px; }
        .search-row { display: flex; gap: 8px; }
        .search-section, .popular-section, .framework-info { margin-bottom: 4px; }
        .lookup-error {
          margin-top: 8px; font-size: 12px; color: var(--fail);
          background: var(--fail-bg); border: 1px solid var(--fail-border);
          border-radius: var(--radius); padding: 7px 10px;
        }
        .lookup-result {
          margin-top: 8px; display: flex; align-items: center; justify-content: space-between;
          background: var(--pass-bg); border: 1px solid var(--pass-border);
          border-radius: var(--radius); padding: 8px 12px;
        }
        .popular-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 8px;
          margin-top: 10px;
        }
        .popular-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 12px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s;
        }
        .popular-card:hover { border-color: var(--border2); background: var(--surface2); }
        .popular-card.selected { border-color: var(--accent); background: rgba(201,168,76,0.08); }
        .popular-ticker { display: block; font-size: 13px; color: var(--accent); margin-bottom: 2px; }
        .popular-name { font-size: 11px; color: var(--text-2); }
        .gates-preview {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-top: 10px;
        }
        .gate-preview-item {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 12px;
        }
        .gate-preview-num { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); }
        .gate-preview-title { font-size: 13px; color: var(--text); margin: 3px 0; font-weight: 600; }
        .gate-preview-desc { font-size: 10px; color: var(--text-3); line-height: 1.4; }
        .analyse-cta { text-align: center; padding: 24px 0; }
        .analyse-cta-top {
          margin-top: 16px;
          margin-bottom: 18px;
          padding: 16px 20px;
          background: linear-gradient(90deg, rgba(201,168,76,0.10), rgba(201,168,76,0.04));
          border: 1px solid rgba(201,168,76,0.35);
          border-radius: var(--radius-lg);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cta-top-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-3);
          margin-bottom: 4px;
        }
        .cta-top-name { font-size: 15px; color: var(--text); }
        .btn-analyse-top {
          font-size: 15px !important;
          padding: 12px 28px !important;
          font-weight: 700 !important;
          flex-shrink: 0;
        }
        @media (max-width: 600px) {
          .analyse-cta-top { flex-direction: column; align-items: stretch; text-align: center; }
          .btn-analyse-top { width: 100%; }
        }
        @media (max-width: 768px) {
          .gates-preview { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}
