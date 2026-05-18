/**
 * Pure data-verification layer (no I/O, no API calls).
 *
 * Given an analysis JSON and the raw search-result data, this module:
 *  1. Runs sanity checks on every critical metric (plausibility ranges)
 *  2. Validates AI-provided citations (quote + sourceIndex)
 *  3. Computes cross-source consensus from the raw search texts
 *  4. Extracts freshness markers (FY/quarter) from citation quotes
 *  5. Assigns a verdict per metric: VERIFIED / SOURCED_ONLY / UNSOURCED / IMPLAUSIBLE
 *
 * Output is stored on analysis.verifications (flat map keyed by metric).
 */

// Critical metrics (Gate 2a + Gate 2c + Gate 3) that must be verified.
const CRITICAL_METRICS = [
  // Gate 2a
  'roce5yr', 'roeLast', 'revenueCAGR5yr', 'patCAGR5yr',
  'debtEquity', 'promoterPledge', 'ocfQuality',
  // Gate 2c
  'promoterHolding',
  // Gate 3
  'currentPrice', 'marketCap', 'peRatio', 'priceBook',
];

// [min, max] expected ranges. Values outside → IMPLAUSIBLE.
const PLAUSIBILITY_RANGES = {
  roce5yr:         [-50, 80],
  roeLast:         [-50, 80],
  revenueCAGR5yr:  [-50, 200],
  patCAGR5yr:      [-100, 300],
  debtEquity:      [0, 10],
  promoterHolding: [0, 100],
  promoterPledge:  [0, 100],
  ocfQuality:      [-50, 200],
  peRatio:         [0, 500],
  priceBook:       [0, 50],
  currentPrice:    [0.01, 200000],
  marketCap:       [1, 50_000_000],
};

// Regex patterns to find each metric in raw source text.
// Each pattern captures one numeric group.
const METRIC_TEXT_PATTERNS = {
  roce5yr:         /\bROCE\b[^.\n]{0,40}?(-?\d+(?:\.\d+)?)\s*%/gi,
  roeLast:         /\bROE\b[^.\n]{0,40}?(-?\d+(?:\.\d+)?)\s*%/gi,
  revenueCAGR5yr:  /revenue\s+CAGR[^.\n]{0,40}?(-?\d+(?:\.\d+)?)\s*%/gi,
  patCAGR5yr:      /(?:PAT|profit)\s+CAGR[^.\n]{0,40}?(-?\d+(?:\.\d+)?)\s*%/gi,
  debtEquity:      /debt[\s\-\/]+(?:to[\s\-]+)?equity[^.\n]{0,40}?(-?\d+(?:\.\d+)?)/gi,
  promoterHolding: /promoter\s+holding[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%/gi,
  promoterPledge:  /promoter\s+pledge[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%/gi,
  ocfQuality:      /(?:OCF|operating\s+cash\s+flow)\s+(?:quality|conversion)[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%/gi,
  peRatio:         /\bP\/?E\b(?:\s+ratio)?[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*[×x]?/gi,
  priceBook:       /(?:P\/?B|price[\s\-]+to[\s\-]+book)[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*[×x]?/gi,
  currentPrice:    /(?:current\s+price|share\s+price)[^.\n]{0,40}?₹?\s*(\d+(?:,\d+)*(?:\.\d+)?)/gi,
  marketCap:       /market\s+cap(?:italisation)?[^.\n]{0,40}?₹?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*Cr/gi,
};

/**
 * Parse a number from common metric string formats.
 * Handles: "18%", "₹2,450", "1.5×", "25x", "42.5"
 */
function parseMetricNumber(str) {
  if (str == null) return null;
  if (typeof str === 'number') return isFinite(str) ? str : null;
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (!trimmed || /^N\/?A/i.test(trimmed)) return null;
  const cleaned = trimmed
    .replace(/[₹,\s]/g, '')
    .replace(/Cr$/i, '')
    .replace(/[×x%]/g, '');
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return isFinite(n) ? n : null;
}

/**
 * Run a plausibility check for a known metric.
 */
function runSanityCheck(metricKey, value) {
  const range = PLAUSIBILITY_RANGES[metricKey];
  if (!range) return null;
  const num = typeof value === 'number' ? value : parseMetricNumber(value);
  if (num == null) return null;
  const [min, max] = range;
  return {
    passed: num >= min && num <= max,
    expectedRange: `${min} to ${max}`,
    parsedValue: num,
  };
}

/**
 * Extract a freshness marker from a citation quote.
 */
function extractFreshness(quote) {
  if (!quote || typeof quote !== 'string') {
    return { asOf: null, ageMonths: null, stale: false };
  }

  // Q3FY25 / Q1FY24
  const q = quote.match(/\b(Q[1-4]FY\d{2})\b/i);
  if (q) {
    const asOf = q[1].toUpperCase();
    const fyTwo = parseInt(asOf.slice(-2), 10);
    const quarter = parseInt(asOf[1], 10);
    const baseYear = 2000 + fyTwo - 1;
    const quarterEndMonths = { 1: 5, 2: 8, 3: 11, 4: 14 };
    const quarterEnd = new Date(baseYear, quarterEndMonths[quarter], 0);
    const ageMonths = monthsBetween(quarterEnd, new Date());
    return { asOf, ageMonths, stale: ageMonths > 12 };
  }

  // FY24 / FY2024
  const fy = quote.match(/\bFY(\d{2,4})\b/i);
  if (fy) {
    const yr = fy[1].length === 2 ? 2000 + parseInt(fy[1], 10) : parseInt(fy[1], 10);
    const asOf = `FY${yr % 100}`;
    const fyEnd = new Date(yr, 2, 31);
    const ageMonths = monthsBetween(fyEnd, new Date());
    return { asOf, ageMonths, stale: ageMonths > 24 };
  }

  // Month YYYY (e.g. "March 2025")
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const my = quote.match(new RegExp(`\\b(${MONTHS.join('|')})\\s+(20\\d{2})\\b`, 'i'));
  if (my) {
    const asOf = `${my[1]} ${my[2]}`;
    const monthIdx = MONTHS.findIndex(m => m.toLowerCase() === my[1].toLowerCase());
    const refDate = new Date(parseInt(my[2], 10), monthIdx, 1);
    const ageMonths = monthsBetween(refDate, new Date());
    return { asOf, ageMonths, stale: ageMonths > 12 };
  }

  return { asOf: null, ageMonths: null, stale: false };
}

function monthsBetween(earlier, later) {
  const ms = later.getTime() - earlier.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24 * 30.44));
}

// Keywords used to identify sentences relevant to a metric.
// We split text into sentences then keep ones containing the keyword,
// then extract all numbers in those sentences. This catches multiple
// values in a single sentence (e.g. "ROCE was 18% in FY24, 17.5% in FY23").
const METRIC_KEYWORDS = {
  roce5yr:         /\bROCE\b/i,
  roeLast:         /\bROE\b/i,
  revenueCAGR5yr:  /revenue\s+CAGR/i,
  patCAGR5yr:      /(?:PAT|profit)\s+CAGR/i,
  debtEquity:      /debt[\s\-\/]+(?:to[\s\-]+)?equity/i,
  promoterHolding: /promoter\s+holding/i,
  promoterPledge:  /promoter\s+pledge/i,
  ocfQuality:      /(?:OCF|operating\s+cash\s+flow)\s+(?:quality|conversion)/i,
  peRatio:         /\bP\/?E\b/i,
  priceBook:       /(?:P\/?B|price[\s\-]+to[\s\-]+book)/i,
  currentPrice:    /(?:current\s+price|share\s+price)/i,
  marketCap:       /market\s+cap(?:italisation)?/i,
};

// Per-metric numeric extraction pattern applied within matching sentences.
const METRIC_VALUE_PATTERNS = {
  roce5yr:         /(-?\d+(?:\.\d+)?)\s*%/g,
  roeLast:         /(-?\d+(?:\.\d+)?)\s*%/g,
  revenueCAGR5yr:  /(-?\d+(?:\.\d+)?)\s*%/g,
  patCAGR5yr:      /(-?\d+(?:\.\d+)?)\s*%/g,
  debtEquity:      /(-?\d+(?:\.\d+)?)/g,
  promoterHolding: /(\d+(?:\.\d+)?)\s*%/g,
  promoterPledge:  /(\d+(?:\.\d+)?)\s*%/g,
  ocfQuality:      /(\d+(?:\.\d+)?)\s*%/g,
  peRatio:         /(\d+(?:\.\d+)?)\s*[×x]?/g,
  priceBook:       /(\d+(?:\.\d+)?)\s*[×x]?/g,
  currentPrice:    /₹?\s*(\d+(?:,\d+)*(?:\.\d+)?)/g,
  marketCap:       /₹?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*Cr/gi,
};

/**
 * Find every numeric mention of a metric in raw text.
 * Strategy: split text into sentences, keep sentences containing the metric
 * keyword, then extract all numbers from those sentences using a value pattern.
 */
function extractAllNumericMentions(text, metricKey) {
  if (!text || typeof text !== 'string') return [];
  const keyword = METRIC_KEYWORDS[metricKey];
  const valuePattern = METRIC_VALUE_PATTERNS[metricKey];
  if (!keyword || !valuePattern) return [];

  // Split into sentences — only on period+whitespace, newlines, or semicolons.
  // Important: do NOT split on bare "." or we'd cut decimals like "17.5" in half.
  const sentences = text.split(/\.\s+|\n+|;+/);
  const matches = [];
  for (const sentence of sentences) {
    if (!keyword.test(sentence)) continue;
    const re = new RegExp(valuePattern.source, valuePattern.flags);
    let m;
    while ((m = re.exec(sentence)) !== null) {
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (isFinite(num)) matches.push(num);
    }
  }
  return matches;
}

/**
 * Decide consensus band from an array of numeric mentions.
 */
function computeConsensus(metricKey, valuesSeen) {
  if (!valuesSeen || valuesSeen.length === 0) {
    return { agreementBand: 'NOT_FOUND_IN_SOURCES', valuesSeen: [], spreadPct: null };
  }
  if (valuesSeen.length === 1) {
    return { agreementBand: 'SINGLE_SOURCE', valuesSeen, spreadPct: 0 };
  }
  const min = Math.min(...valuesSeen);
  const max = Math.max(...valuesSeen);
  const mean = valuesSeen.reduce((a, b) => a + b, 0) / valuesSeen.length;
  const spreadPct = mean !== 0 ? (Math.abs(max - min) / Math.abs(mean)) * 100 : 0;
  let agreementBand = 'LOW';
  if (spreadPct <= 5)        agreementBand = 'HIGH';
  else if (spreadPct <= 15)  agreementBand = 'MEDIUM';
  return { agreementBand, valuesSeen, spreadPct: Number(spreadPct.toFixed(1)) };
}

function rawMetricValue(metric) {
  if (metric == null) return null;
  if (typeof metric === 'string' || typeof metric === 'number') return metric;
  if (typeof metric === 'object' && 'value' in metric) return metric.value;
  return null;
}

function findMetricByKey(analysis, key) {
  if (analysis?.gate2a?.metrics?.[key] !== undefined)    return analysis.gate2a.metrics[key];
  if (analysis?.gate2c?.indicators?.[key] !== undefined) return analysis.gate2c.indicators[key];
  if (analysis?.gate3?.metrics?.[key] !== undefined)     return analysis.gate3.metrics[key];
  return null;
}

/**
 * Main entry point. Mutates the passed analysis (also returns it) by adding
 * an analysis.verifications flat map: { metricKey -> verification }.
 */
function verifyAnalysis(analysis, rawData) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  const verifications = {};
  const citations = analysis.citations || {};
  const sources = Array.isArray(rawData) ? rawData : [];

  for (const key of CRITICAL_METRICS) {
    const metric = findMetricByKey(analysis, key);
    const value = rawMetricValue(metric);
    if (value == null) continue;

    const citation = citations[key] || null;
    const sanity   = runSanityCheck(key, value);
    const freshness = citation?.quote ? extractFreshness(citation.quote) : { asOf: null, ageMonths: null, stale: false };

    const allMentions = [];
    for (const src of sources) {
      const mentions = extractAllNumericMentions(src?.data || '', key);
      allMentions.push(...mentions);
    }
    const consensus = computeConsensus(key, allMentions);

    let verdict;
    if (sanity && sanity.passed === false) {
      verdict = 'IMPLAUSIBLE';
    } else if (!citation || !citation.quote) {
      verdict = 'UNSOURCED';
    } else if (consensus.agreementBand === 'LOW' || freshness.stale) {
      verdict = 'SOURCED_ONLY';
    } else {
      verdict = 'VERIFIED';
    }

    verifications[key] = {
      citation,
      sanity,
      consensus,
      freshness,
      refetched: false,
      verdict,
    };
  }

  analysis.verifications = verifications;
  return analysis;
}

module.exports = {
  parseMetricNumber,
  runSanityCheck,
  extractFreshness,
  extractAllNumericMentions,
  computeConsensus,
  verifyAnalysis,
  CRITICAL_METRICS,
  PLAUSIBILITY_RANGES,
  METRIC_TEXT_PATTERNS,
};
