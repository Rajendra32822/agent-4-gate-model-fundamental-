/**
 * Pure rules-based data-quality confidence scoring.
 * No I/O, no external calls. Takes an analysis JSON object and returns
 * { score, band, breakdown, computedAt }.
 *
 * Score starts at 100 and subtracts a penalty for each failing signal.
 * Final score is clamped to [0, 100].
 *
 * To add or remove a signal, edit the SIGNALS object below.
 */

// Critical metric keys whose `confidence: LOW` flags count toward the
// `critical_metrics_high_confidence` signal.
const CRITICAL_METRIC_KEYS = [
  'roce5yr', 'roeLast', 'revenueCAGR5yr', 'patCAGR5yr',
  'debtEquity', 'promoterPledge', 'ocfQuality', 'promoterHolding',
];

const SIGNALS = {
  live_price: (a) => ({
    passed: a?.liveQuote?.price != null && a.liveQuote.price > 0,
    penalty: 25,
  }),

  live_market_cap: (a) => ({
    passed: a?.liveQuote?.marketCap != null && a.liveQuote.marketCap > 0,
    penalty: 15,
  }),

  roce_years_of_data_gte_3: (a) => {
    const y = a?.gate2a?.metrics?.roce5yr?.yearsOfData;
    return { passed: typeof y === 'number' && y >= 3, penalty: 20 };
  },

  consolidated_financials: (a) => ({
    passed: a?.gate2a?.financialsType === 'CONSOLIDATED',
    penalty: 15,
  }),

  gate2a_confidence_high: (a) => {
    const dc = a?.gate2a?.dataConfidence;
    return { passed: dc === 'HIGH' || dc === 'MEDIUM', penalty: 15 };
  },

  // Passes when fewer than 3 critical metrics carry the AI's `confidence: 'LOW'` flag.
  // Note: passes VACUOUSLY when no metrics are present (an empty analysis has 0
  // LOW metrics, which is < 3). That is semantically correct — the signal is
  // about poorly-extracted values, not missing ones; missing values are covered
  // by other signals (live_price, roce_years_of_data_gte_3, etc.).
  critical_metrics_high_confidence: (a) => {
    const pool = {
      ...(a?.gate2a?.metrics    || {}),
      ...(a?.gate2c?.indicators || {}),
    };
    const lowCount = CRITICAL_METRIC_KEYS
      .map(k => pool[k])
      .filter(m => m && typeof m === 'object' && m.confidence === 'LOW')
      .length;
    return { passed: lowCount < 3, penalty: 10 };
  },

  search_queries_returned: (a) => ({
    passed: (a?.rawDataSources ?? 0) >= 4,
    penalty: 10,
  }),

  data_freshness_18_months: (a) => {
    if (!a?.analysisDate) return { passed: false, penalty: 10 };
    const ageMs = Date.now() - new Date(a.analysisDate).getTime();
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44);
    return { passed: ageMonths <= 18, penalty: 10 };
  },

  // ─── Verification-derived signals (added 2026-05-17 with verification layer) ──

  // ≥ 80% of critical metrics with a value have a citation (i.e. verdict !== 'UNSOURCED').
  // Vacuous-pass when verifications field is entirely absent (older analyses).
  metrics_have_citations: (a) => {
    const v = a?.verifications;
    if (!v) return { passed: true, penalty: 10 };
    const total = Object.keys(v).length;
    if (total === 0) return { passed: true, penalty: 10 };
    const cited = Object.values(v).filter(x => x.verdict !== 'UNSOURCED').length;
    return { passed: (cited / total) >= 0.8, penalty: 10 };
  },

  // No critical metric is IMPLAUSIBLE.
  // Vacuous-pass when verifications field is entirely absent.
  metrics_pass_sanity: (a) => {
    const v = a?.verifications;
    if (!v) return { passed: true, penalty: 15 };
    const anyImplausible = Object.values(v).some(x => x.verdict === 'IMPLAUSIBLE');
    return { passed: !anyImplausible, penalty: 15 };
  },

  // ≥ 50% of metrics with consensus data show HIGH/MEDIUM agreement.
  // Vacuous-pass when verifications absent or none have consensus data.
  cross_source_consensus: (a) => {
    const v = a?.verifications;
    if (!v) return { passed: true, penalty: 10 };
    const withConsensus = Object.values(v).filter(x =>
      x.consensus &&
      x.consensus.agreementBand !== 'NOT_FOUND_IN_SOURCES' &&
      x.consensus.agreementBand !== 'SINGLE_SOURCE'
    );
    if (withConsensus.length === 0) return { passed: true, penalty: 10 };
    const good = withConsensus.filter(x =>
      x.consensus.agreementBand === 'HIGH' || x.consensus.agreementBand === 'MEDIUM'
    ).length;
    return { passed: (good / withConsensus.length) >= 0.5, penalty: 10 };
  },
};

function bandForScore(score) {
  if (score >= 80) return 'HIGH';
  if (score >= 60) return 'MEDIUM';
  return 'LOW';
}

function computeConfidenceScore(analysis) {
  const breakdown = [];
  let totalPenalty = 0;

  for (const [name, fn] of Object.entries(SIGNALS)) {
    const result = fn(analysis);
    breakdown.push({
      signal: name,
      passed: result.passed,
      penalty: result.passed ? 0 : result.penalty,
    });
    if (!result.passed) totalPenalty += result.penalty;
  }

  const score = Math.max(0, 100 - totalPenalty);
  return {
    score,
    band: bandForScore(score),
    breakdown,
    computedAt: new Date().toISOString(),
  };
}

module.exports = {
  computeConfidenceScore,
  bandForScore,
  SIGNALS,
  CRITICAL_METRIC_KEYS,
};
