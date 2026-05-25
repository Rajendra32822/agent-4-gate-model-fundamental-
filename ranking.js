/**
 * Pure ranking engine. No I/O.
 *
 * scoreRow(strategyKey, row) → { passes, score, reasons }
 * rankUniverse(strategyKey, rows, limit=20) → sorted top-N with rank + score
 *
 * A `row` is a merged per-ticker record:
 *   { ticker, company_name, sector,
 *     roce_5y_avg, roe_5y_avg, revenue_cagr_5y_pct, pat_cagr_5y_pct,
 *     debt_to_equity, pe, pb, roe_ttm, current_price, market_cap_cr, dividend_yield }
 *
 * Global benchmarks for v1; Phase 7 microtheories will make them sector-aware.
 */

const ontology = require('./ontology');

const num = (v) => (v == null || !isFinite(v)) ? null : Number(v);

// Build a { [sector]: benchmarkRow } lookup from sector rows.
function toSectorMap(rows) {
  const map = {};
  for (const r of rows || []) {
    if (r && r.sector) map[r.sector] = r;
  }
  return map;
}

// Pick the quality gate for a row's sector. ROE-primary sectors (banks, realty,
// construction) gate on ROE; everyone else on ROCE at their sector threshold.
// Unknown/missing sector → ROCE at the ontology default (15).
function resolveQualityGate(row, sectorBenchmarks) {
  const s = sectorBenchmarks?.[row.sector];
  if (s && s.primary_metric === 'roe') {
    return { metric: 'ROE', value: num(row.roe_5y_avg), benchmark: s.roe_benchmark };
  }
  return { metric: 'ROCE', value: num(row.roce_5y_avg), benchmark: s?.roce_benchmark ?? ontology.benchmark('roce') };
}

const STRATEGIES = {
  marshall_undervalued: {
    label: 'Marshall Undervalued',
    description: 'Quality businesses (ROCE ≥ 15%, low debt, growing profits) trading cheap (P/E ≤ 35).',
    score(r, sectorBenchmarks) {
      const gate = resolveQualityGate(r, sectorBenchmarks);
      const de = num(r.debt_to_equity);
      const patCagr = num(r.pat_cagr_5y_pct), pe = num(r.pe);
      const revCagr = num(r.revenue_cagr_5y_pct) ?? 0;
      if (gate.value == null || gate.value < gate.benchmark) return fail(`${gate.metric} 5y < ${gate.benchmark}%`);
      if (de == null || de > 0.5)    return fail('Debt/Equity > 0.5');
      if (patCagr == null || patCagr <= 0) return fail('PAT not growing');
      if (pe == null || pe <= 0 || pe > 35) return fail('P/E out of range (0-35]');
      const reasons = [`${gate.metric} ${gate.value}%`, `D/E ${de}`, `P/E ${pe}`, `Rev CAGR ${revCagr}%`];
      return ok(((gate.value + revCagr) / pe), reasons);
    },
  },
  quality_compounders: {
    label: 'Quality Compounders',
    description: 'Highest return-on-capital businesses with strong growth and low debt — regardless of price.',
    score(r, sectorBenchmarks) {
      const gate = resolveQualityGate(r, sectorBenchmarks);
      if (gate.value == null || gate.value < gate.benchmark) return fail(`${gate.metric} 5y < ${gate.benchmark}%`);
      const revCagr = num(r.revenue_cagr_5y_pct) ?? 0;
      const patCagr = num(r.pat_cagr_5y_pct) ?? 0;
      const de = num(r.debt_to_equity) ?? 0;
      const s = gate.value * 0.5 + revCagr * 0.3 + patCagr * 0.3 - de * 5;
      return ok(s, [`${gate.metric} ${gate.value}%`, `Rev CAGR ${revCagr}%`, `PAT CAGR ${patCagr}%`]);
    },
  },
  deep_value: {
    label: 'Deep Value',
    description: 'Cheap on both earnings and book (P/E ≤ 15, P/B ≤ 2) with positive returns.',
    score(r) {
      const pe = num(r.pe), pb = num(r.pb), roe = num(r.roe_ttm);
      if (pe == null || pe <= 0 || pe > 15) return fail('P/E out of range (0-15]');
      if (pb == null || pb <= 0 || pb > 2)  return fail('P/B out of range (0-2]');
      if (roe == null || roe <= 0)          return fail('ROE not positive');
      return ok(roe / (pe * pb), [`P/E ${pe}`, `P/B ${pb}`, `ROE ${roe}%`]);
    },
  },
  high_growth: {
    label: 'High Growth',
    description: 'Fastest revenue and profit compounders over the last 5 years.',
    score(r) {
      const revCagr = num(r.revenue_cagr_5y_pct);
      if (revCagr == null || revCagr <= 10) return fail('Revenue CAGR ≤ 10%');
      const patCagr = num(r.pat_cagr_5y_pct) ?? 0;
      return ok(revCagr * 0.5 + patCagr * 0.5, [`Rev CAGR ${revCagr}%`, `PAT CAGR ${patCagr}%`]);
    },
  },
};

function ok(score, reasons) {
  return { passes: true, score: Number(score.toFixed(2)), reasons };
}
function fail(reason) {
  return { passes: false, score: 0, reasons: [reason] };
}

function scoreRow(strategyKey, row, sectorBenchmarks) {
  const strat = STRATEGIES[strategyKey];
  if (!strat) return { passes: false, score: 0, reasons: ['unknown strategy'] };
  return strat.score(row, sectorBenchmarks);
}

function rankUniverse(strategyKey, rows, sectorBenchmarks = {}, limit = 20) {
  const strat = STRATEGIES[strategyKey];
  if (!strat || !Array.isArray(rows)) return [];
  const scored = [];
  for (const r of rows) {
    const res = strat.score(r, sectorBenchmarks);
    if (res.passes) scored.push({ ...r, score: res.score, reasons: res.reasons });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}

const STRATEGY_LIST = Object.entries(STRATEGIES).map(([key, s]) => ({
  key, label: s.label, description: s.description,
}));

module.exports = { scoreRow, rankUniverse, STRATEGY_LIST, STRATEGIES, toSectorMap, resolveQualityGate };
