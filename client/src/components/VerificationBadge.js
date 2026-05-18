import React, { useState, useRef, useEffect } from 'react';

const STYLES = {
  VERIFIED:     { icon: '✓', colour: '#10b981', label: 'VERIFIED' },
  SOURCED_ONLY: { icon: 'ⓘ', colour: '#c9a84c', label: 'SOURCED_ONLY' },
  IMPLAUSIBLE:  { icon: '⚠', colour: '#ef4444', label: 'IMPLAUSIBLE' },
  UNSOURCED:    { icon: '?', colour: '#7a7a7a', label: 'UNSOURCED' },
  NONE:         { icon: '—', colour: '#5e5c58', label: 'NO DATA' },
};

export default function VerificationBadge({ verification, metricLabel }) {
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

  if (!verification) {
    return (
      <span
        title="Verification data not available (pre-2026-05). Re-run analysis for full verification."
        style={{
          fontSize: 10, color: STYLES.NONE.colour, marginLeft: 6, opacity: 0.6,
          cursor: 'help', fontFamily: 'var(--font-mono)',
        }}
      >
        {STYLES.NONE.icon}
      </span>
    );
  }

  const s = STYLES[verification.verdict] || STYLES.NONE;
  const cit = verification.citation;

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block', marginLeft: 6 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          fontSize: 11, fontWeight: 700, color: s.colour,
          background: 'transparent', border: `1px solid ${s.colour}`,
          padding: '0 5px', borderRadius: 6, cursor: 'pointer',
          fontFamily: 'var(--font-mono)', lineHeight: '14px',
        }}
        title={`Verification: ${s.label}`}
      >
        {s.icon}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 12px', minWidth: 340, maxWidth: 420,
          zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          fontSize: 12, color: 'var(--text-2)', textAlign: 'left',
          fontFamily: 'var(--font-sans)',
        }}>
          <div style={{ fontWeight: 700, color: s.colour, marginBottom: 8 }}>
            {metricLabel || 'Metric'} · {s.label}
          </div>
          {cit?.quote && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Source quote (Data Source {cit.sourceIndex})
              </div>
              <div style={{ fontStyle: 'italic', borderLeft: '2px solid var(--border)', paddingLeft: 8, marginTop: 4 }}>
                "{cit.quote}"
              </div>
            </div>
          )}
          {!cit?.quote && verification.verdict === 'UNSOURCED' && (
            <div style={{ marginBottom: 8, color: 'var(--text-3)' }}>
              No citation provided by the AI for this metric.
            </div>
          )}
          {verification.sanity && (
            <Row
              ok={verification.sanity.passed}
              label="Plausibility"
              detail={verification.sanity.passed
                ? `${verification.sanity.parsedValue} within ${verification.sanity.expectedRange}`
                : `${verification.sanity.parsedValue} OUTSIDE ${verification.sanity.expectedRange}`}
            />
          )}
          {verification.consensus && verification.consensus.agreementBand !== 'NOT_FOUND_IN_SOURCES' && (
            <Row
              ok={verification.consensus.agreementBand === 'HIGH' || verification.consensus.agreementBand === 'MEDIUM' || verification.consensus.agreementBand === 'SINGLE_SOURCE'}
              label="Cross-source"
              detail={`${verification.consensus.agreementBand} (${verification.consensus.valuesSeen?.length || 0} mentions)`}
            />
          )}
          {verification.freshness?.asOf && (
            <Row
              ok={!verification.freshness.stale}
              label="Freshness"
              detail={`${verification.freshness.asOf} · ${verification.freshness.ageMonths} months old`}
            />
          )}
          {verification.refetched && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>
              ↻ Value was re-fetched via Tier 2 verification.
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function Row({ ok, label, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 0' }}>
      <span style={{ color: ok ? '#10b981' : '#ef4444', fontWeight: 700, width: 12 }}>
        {ok ? '✓' : '✕'}
      </span>
      <span style={{ color: 'var(--text-3)', minWidth: 92 }}>{label}</span>
      <span style={{ color: ok ? 'var(--text-2)' : '#ef4444' }}>{detail}</span>
    </div>
  );
}
