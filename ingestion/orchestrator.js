/**
 * Orchestrator: end-to-end ingestion for one ticker.
 *
 * ingestCompany(ticker, db) →
 *   1. Fetch screener.in HTML
 *   2. Parse to source-table rows
 *   3. Upsert source tables
 *   4. Derive per-period ratios → upsert derived tables
 *   5. Aggregate → upsert company_aggregates
 *   6. Return summary { ticker, periods_added, errors }
 */

const { fetchScreenerHtml, parseScreenerHtml } = require('./screenerScraper');
const { deriveAnnual, deriveQuarterly } = require('../derive');
const { aggregate } = require('../aggregate');

async function ingestCompany(ticker, db) {
  const T = ticker.toUpperCase();
  const summary = { ticker: T, periods_added: 0, errors: [] };

  let html;
  try {
    html = await fetchScreenerHtml(T);
  } catch (e) {
    summary.errors.push({ stage: 'fetch', error: e.message });
    return summary;
  }

  let parsed;
  try {
    parsed = parseScreenerHtml(T, html);
  } catch (e) {
    summary.errors.push({ stage: 'parse', error: e.message });
    return summary;
  }

  try {
    if (parsed.annual_pl.length)    await db.upsertAnnualPl(parsed.annual_pl);
    if (parsed.annual_bs.length)    await db.upsertAnnualBs(parsed.annual_bs);
    if (parsed.annual_cf.length)    await db.upsertAnnualCf(parsed.annual_cf);
    if (parsed.quarterly_pl.length) await db.upsertQuarterlyPl(parsed.quarterly_pl);
    if (parsed.shareholding?.length && db.upsertShareholding) await db.upsertShareholding(parsed.shareholding);
    if (parsed.ratios && db.upsertRatios) await db.upsertRatios(parsed.ratios);
    summary.periods_added = parsed.annual_pl.length + parsed.quarterly_pl.length;
    summary.shareholding_periods = parsed.shareholding?.length || 0;
    summary.ratios = parsed.ratios ? 'ok' : 'missing';
  } catch (e) {
    summary.errors.push({ stage: 'upsert_source', error: e.message });
    return summary;
  }

  try {
    const sortedPl = [...parsed.annual_pl].sort((a,b) => b.fy_end.localeCompare(a.fy_end));
    const bsByFy   = Object.fromEntries(parsed.annual_bs.map(r => [r.fy_end, r]));
    const cfByFy   = Object.fromEntries(parsed.annual_cf.map(r => [r.fy_end, r]));

    const annualDerived = [];
    for (let i = 0; i < sortedPl.length; i++) {
      const pl = sortedPl[i];
      const priorPl = sortedPl[i + 1] || null;
      const dr = deriveAnnual({ pl, bs: bsByFy[pl.fy_end], cf: cfByFy[pl.fy_end], priorPl });
      annualDerived.push({ ticker: T, fy_end: pl.fy_end, fy_label: pl.fy_label, ...dr });
    }
    if (annualDerived.length) await db.upsertDerivedAnnual(annualDerived);

    const sortedQ = [...parsed.quarterly_pl].sort((a,b) => b.q_end.localeCompare(a.q_end));
    const quarterDerived = [];
    for (let i = 0; i < sortedQ.length; i++) {
      const current       = sortedQ[i];
      const priorQuarter  = sortedQ[i + 1] || null;
      const samePriorYear = sortedQ[i + 4] || null;
      const dr = deriveQuarterly({ current, samePriorYear, priorQuarter });
      quarterDerived.push({ ticker: T, q_end: current.q_end, q_label: current.q_label, ...dr });
    }
    if (quarterDerived.length) await db.upsertDerivedQuarterly(quarterDerived);

    const agg = aggregate(T, parsed.annual_pl, annualDerived, parsed.quarterly_pl);
    await db.upsertAggregates(agg);
  } catch (e) {
    summary.errors.push({ stage: 'derive_aggregate', error: e.message });
  }

  return summary;
}

module.exports = { ingestCompany };
