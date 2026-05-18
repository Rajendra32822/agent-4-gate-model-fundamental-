/**
 * Pure outcome computation. Given a Yahoo Finance daily price series
 * (array of { date: 'YYYY-MM-DD', close: number }) and an analysis date,
 * computes returns at 1w/1m/3m/6m/1y horizons and whether the price ever
 * hit the entry zone, bull case, or bear case.
 */

function findClosestPrice(priceSeries, targetDate) {
  if (!Array.isArray(priceSeries) || priceSeries.length === 0) return null;
  const target = new Date(targetDate).getTime();
  if (!isFinite(target)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const p of priceSeries) {
    if (!p?.date || p.close == null) continue;
    const pd = new Date(p.date).getTime();
    if (!isFinite(pd) || pd > target) continue;
    const diff = target - pd;
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return best ? best.close : null;
}

function priceAtOffset(priceSeries, baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return findClosestPrice(priceSeries, d.toISOString().split('T')[0]);
}

function parsePriceString(str) {
  if (str == null) return null;
  const m = String(str).replace(/[₹,\s]/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parseRangeString(str) {
  if (!str) return [null, null];
  const cleaned = String(str).replace(/[₹,\s]/g, '');
  const m = cleaned.match(/(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [null, null];
}

function pctChange(p, p0) {
  if (p == null || p0 == null || p0 === 0) return null;
  return Number((((p - p0) / p0) * 100).toFixed(2));
}

function computeOutcome(ticker, analysisDate, priceSeries, gate3) {
  const price0 = findClosestPrice(priceSeries, analysisDate);
  if (price0 == null) {
    return {
      ticker,
      analysis_date: analysisDate,
      price_at_analysis: null,
      price_1w: null, price_1m: null, price_3m: null, price_6m: null, price_1y: null,
      return_1m_pct: null, return_3m_pct: null, return_6m_pct: null, return_1y_pct: null,
      hit_entry_zone: false, hit_bull_case: false, hit_bear_case: false,
    };
  }

  const price_1w = priceAtOffset(priceSeries, analysisDate, 7);
  const price_1m = priceAtOffset(priceSeries, analysisDate, 30);
  const price_3m = priceAtOffset(priceSeries, analysisDate, 90);
  const price_6m = priceAtOffset(priceSeries, analysisDate, 180);
  const price_1y = priceAtOffset(priceSeries, analysisDate, 365);

  const analysisTime = new Date(analysisDate).getTime();
  const futurePrices = (priceSeries || [])
    .filter(p => p?.date && p.close != null && new Date(p.date).getTime() >= analysisTime)
    .map(p => p.close);

  const [entryLow, entryHigh] = parseRangeString(gate3?.entryZone);
  const bull = parsePriceString(gate3?.valuationScenarios?.bullCase?.price);
  const bear = parsePriceString(gate3?.valuationScenarios?.bearCase?.price);

  const hit_entry_zone = (entryLow != null && entryHigh != null)
    ? futurePrices.some(p => p >= entryLow * 0.98 && p <= entryHigh)
    : false;
  const hit_bull_case  = bull != null ? futurePrices.some(p => p >= bull) : false;
  const hit_bear_case  = bear != null ? futurePrices.some(p => p <= bear) : false;

  return {
    ticker,
    analysis_date: analysisDate,
    price_at_analysis: price0,
    price_1w, price_1m, price_3m, price_6m, price_1y,
    return_1m_pct: pctChange(price_1m, price0),
    return_3m_pct: pctChange(price_3m, price0),
    return_6m_pct: pctChange(price_6m, price0),
    return_1y_pct: pctChange(price_1y, price0),
    hit_entry_zone, hit_bull_case, hit_bear_case,
  };
}

module.exports = { findClosestPrice, priceAtOffset, computeOutcome, parsePriceString, parseRangeString };
