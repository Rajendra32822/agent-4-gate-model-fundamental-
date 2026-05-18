import React, { useState, useRef, useEffect } from 'react';

const COLOURS = {
  HIGH:   { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#10b981' },
  MEDIUM: { bg: 'rgba(201,168,76,0.14)', border: '#c9a84c', text: '#c9a84c' },
  LOW:    { bg: 'rgba(239,68,68,0.14)',  border: '#ef4444', text: '#ef4444' },
};

const SIGNAL_LABELS = {
  live_price:                       'Live market price available',
  live_market_cap:                  'Market cap available',
  roce_years_of_data_gte_3:         'At least 3 years of ROCE history',
  consolidated_financials:          'Consolidated (not standalone) financials',
  gate2a_confidence_high:           'AI confidence on quantitative data',
  critical_metrics_high_confidence: 'Critical metrics not marked LOW',
  search_queries_returned:          'At least 4 of 5 searches returned data',
  data_freshness_18_months:         'Data within 18 months',
};

const SIZE_MAP = {
  sm: { pad: '2px 8px',  fs: 10, ic: 11 },
  md: { pad: '4px 10px', fs: 11, ic: 13 },
  lg: { pad: '6px 14px', fs: 13, ic: 15 },
};

export default function ConfidenceShield({ confidence, size = 'md', showBreakdown = true }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!confidence || typeof confidence.score !== 'number') return null;
  const c = COLOURS[confidence.band] || COLOURS.LOW;
  const s = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (showBreakdown) setOpen(o => !o); }}
        style={{
          padding: s.pad, fontSize: s.fs, fontWeight: 600,
          background: c.bg, border: `1px solid ${c.border}`,
          color: c.text, borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          cursor: showBreakdown ? 'pointer' : 'default',
          fontFamily: 'var(--font-mono)',
        }}
        title={showBreakdown ? 'Click for breakdown' : `Confidence: ${confidence.band}`}
      >
        <span style={{ fontSize: s.ic }}>🛡</span>
        <span>{confidence.band}</span>
        <span style={{ opacity: 0.7 }}>{confidence.score}</span>
      </button>

      {open && showBreakdown && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 14px', minWidth: 320,
          zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          textAlign: 'left',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Confidence Breakdown · {confidence.score}/100
          </div>
          {confidence.breakdown?.map(b => (
            <div key={b.signal} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, padding: '4px 0',
              color: b.passed ? 'var(--text-2)' : 'var(--fail)',
            }}>
              <span>
                <span style={{ marginRight: 6, fontWeight: 700 }}>{b.passed ? '✓' : '✕'}</span>
                {SIGNAL_LABELS[b.signal] || b.signal}
              </span>
              {!b.passed && (
                <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.75 }}>−{b.penalty}</span>
              )}
            </div>
          ))}
          {confidence.retryUsed && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>
              {confidence.retryNotImproved
                ? 'Auto-retry attempted but did not improve the score.'
                : 'Score improved after one auto-retry.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
