/**
 * Pure logic for the corporate-actions subsystem. No I/O.
 */

// Every table keyed by `ticker` that must move when a ticker changes.
const TICKER_KEYED_TABLES = [
  'companies', 'company_annual_pl', 'company_annual_bs', 'company_annual_cf',
  'company_quarterly_pl', 'company_derived_annual', 'company_derived_quarterly',
  'company_aggregates', 'company_shareholding', 'company_ratios',
  'analyses', 'fundamental_metrics', 'analysis_outcomes',
  'portfolio_transactions', 'watchlist', 'watches', 'virtual_trades', 'price_checks',
  'corporate_actions',
];

const EVENT_TYPES = ['SPLIT', 'BONUS', 'RIGHTS', 'BUYBACK', 'DIVIDEND', 'MERGER', 'DEMERGER', 'NAME_CHANGE', 'TICKER_CHANGE'];

// Best-effort parse of the analysis free-text `corporateActions` field → a proposed
// event, or null when nothing recognizable (so we never create junk rows).
function parseCorporateActionFromText(text) {
  if (text == null) return null;
  const raw = String(text);
  const t = raw.toLowerCase().trim();
  if (!t || /none found|no corporate action|not found|^n\/?a$|^none$/.test(t)) return null;
  const m = raw.match(/\b(\d+)\s*:\s*(\d+)\b/);
  const ratio = m ? `${m[1]}:${m[2]}` : null;
  let event_type = null;
  if (/demerg/.test(t)) event_type = 'DEMERGER';
  else if (/merg|amalgamat/.test(t)) event_type = 'MERGER';
  else if (/split/.test(t)) event_type = 'SPLIT';
  else if (/bonus/.test(t)) event_type = 'BONUS';
  else if (/rights\s+(issue|entitlement)|rights\b/.test(t)) event_type = 'RIGHTS';
  else if (/buy\s?back/.test(t)) event_type = 'BUYBACK';
  else if (/ticker change|symbol change|new symbol|symbol changed/.test(t)) event_type = 'TICKER_CHANGE';
  else if (/renamed|name change|name changed|changed its name/.test(t)) event_type = 'NAME_CHANGE';
  else if (/dividend/.test(t)) event_type = 'DIVIDEND';
  if (!event_type) return null;
  return { event_type, ratio };
}

// Required-field check before confirming/applying an action.
function validateConfirm(action) {
  if (!action) return { ok: false, error: 'action not found' };
  if (action.event_type === 'TICKER_CHANGE' && !action.new_ticker) {
    return { ok: false, error: 'TICKER_CHANGE requires new_ticker' };
  }
  if (action.event_type === 'NAME_CHANGE' && !action.new_name) {
    return { ok: false, error: 'NAME_CHANGE requires new_name' };
  }
  return { ok: true };
}

// Follow old→new through ticker_history rows to the latest symbol. Cycle-guarded.
function resolveChain(historyRows, ticker) {
  if (!ticker) return ticker;
  const byOld = {};
  for (const r of historyRows || []) {
    if (r && r.old_ticker) byOld[String(r.old_ticker).toUpperCase()] = String(r.new_ticker || '').toUpperCase();
  }
  let cur = String(ticker).toUpperCase();
  const seen = new Set([cur]);
  while (byOld[cur]) {
    const next = byOld[cur];
    if (!next || seen.has(next)) break;
    cur = next;
    seen.add(cur);
  }
  return cur;
}

module.exports = { TICKER_KEYED_TABLES, EVENT_TYPES, parseCorporateActionFromText, validateConfirm, resolveChain };
