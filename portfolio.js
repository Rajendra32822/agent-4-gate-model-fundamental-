/**
 * Pure portfolio derivation. No I/O. Given a transaction array and a
 * CMP map, computes per-ticker holdings and a portfolio summary.
 *
 * Only `status: 'confirmed'` transactions contribute. Proposed and
 * dismissed rows are ignored.
 *
 * Holdings use FIFO for realised P&L (Indian LTCG convention).
 */

function parseSplitRatio(type, ratio) {
  if (!ratio) return 1;
  const m = String(ratio).match(/(\d+)[:\s]+(\d+)/);
  if (!m) return 1;
  const from = parseInt(m[1], 10);
  const to   = parseInt(m[2], 10);
  if (!from || !to) return 1;
  if (type === 'SPLIT') return to / from;
  if (type === 'BONUS') return (from + to) / from;
  return 1;
}

function computeHoldings(transactions, cmpMap = {}) {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const byTicker = {};
  for (const t of transactions) {
    if (!t || t.status !== 'confirmed') continue;
    if (!byTicker[t.ticker]) byTicker[t.ticker] = [];
    byTicker[t.ticker].push(t);
  }

  const holdings = [];
  for (const [ticker, txs] of Object.entries(byTicker)) {
    const sorted = [...txs].sort((a, b) =>
      String(a.transaction_date).localeCompare(String(b.transaction_date)));

    const lots = [];
    let realisedPl = 0;
    let totalDividends = 0;
    let company = null;

    for (const t of sorted) {
      if (!company && t.company) company = t.company;
      const qty   = Number(t.quantity);
      const price = Number(t.price);

      if (t.type === 'BUY') {
        if (qty > 0 && price >= 0) lots.push({ qty, price, date: t.transaction_date });
      } else if (t.type === 'SELL') {
        let remaining = qty;
        const sellPrice = price;
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(remaining, lot.qty);
          realisedPl += (sellPrice - lot.price) * take;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 1e-9) lots.shift();
        }
      } else if (t.type === 'DIVIDEND') {
        totalDividends += Number(t.amount || 0);
      } else if (t.type === 'SPLIT' || t.type === 'BONUS') {
        const mult = parseSplitRatio(t.type, t.ratio);
        if (mult !== 1) {
          for (const lot of lots) {
            lot.qty   *= mult;
            lot.price /= mult;
          }
        }
      }
    }

    const currentQty   = lots.reduce((s, l) => s + l.qty, 0);
    const totalCost    = lots.reduce((s, l) => s + l.qty * l.price, 0);
    const avgBuyPrice  = currentQty > 0 ? totalCost / currentQty : 0;
    const cmp          = Number(cmpMap[ticker] ?? 0);
    const unrealisedPl = currentQty > 0 ? (cmp - avgBuyPrice) * currentQty : 0;
    const unrealisedPct = avgBuyPrice ? ((cmp - avgBuyPrice) / avgBuyPrice) * 100 : 0;

    holdings.push({
      ticker,
      company,
      quantity:       round(currentQty),
      avgBuyPrice:    round(avgBuyPrice),
      cmp,
      unrealisedPl:   round(unrealisedPl),
      unrealisedPlPct: round(unrealisedPct),
      realisedPl:     round(realisedPl),
      totalDividends: round(totalDividends),
      totalReturn:    round(realisedPl + unrealisedPl + totalDividends),
      lots: lots.map(l => ({ qty: round(l.qty), price: round(l.price), date: l.date })),
    });
  }
  return holdings;
}

function computePortfolioSummary(transactions, cmpMap = {}) {
  const holdings = computeHoldings(transactions, cmpMap);
  let totalValue = 0, totalInvested = 0;
  let totalUnrealised = 0, totalRealised = 0, totalDividends = 0;
  let positionsCount = 0;
  for (const h of holdings) {
    if (h.quantity > 0) positionsCount++;
    totalValue      += h.quantity * h.cmp;
    totalInvested   += h.quantity * h.avgBuyPrice;
    totalUnrealised += h.unrealisedPl;
    totalRealised   += h.realisedPl;
    totalDividends  += h.totalDividends;
  }
  const totalReturn = totalUnrealised + totalRealised + totalDividends;
  const returnPct   = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
  return {
    positionsCount,
    totalValue:      round(totalValue),
    totalInvested:   round(totalInvested),
    totalUnrealised: round(totalUnrealised),
    totalRealised:   round(totalRealised),
    totalDividends:  round(totalDividends),
    totalReturn:     round(totalReturn),
    returnPct:       round(returnPct),
  };
}

function round(n) {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

module.exports = { computeHoldings, computePortfolioSummary, parseSplitRatio };
