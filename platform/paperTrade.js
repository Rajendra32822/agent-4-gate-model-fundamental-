/**
 * Pure paper trading logic engine. No I/O.
 * Decoupled from the database to enable TDD patterns.
 */

const { scoreRow } = require('../ranking');

/**
 * Evaluates open positions and decides which ones should exit because their thesis broke.
 *
 * @param {Array} openPositions       currently open trades in this strategy
 * @param {Object} freshRowsByTicker  map of ticker -> fresh fundamentals row
 * @param {Object} sectorBenchmarks   sector-specific benchmarks for scoring
 * @param {Object} pricesByTicker     map of ticker -> price on tickDate
 * @param {string} tickDate           the date of the simulation tick (YYYY-MM-DD)
 * @returns {Array}                   closed trades (with status = 'CLOSED')
 */
function decideExits(openPositions, freshRowsByTicker, sectorBenchmarks, pricesByTicker, tickDate) {
  const exits = [];

  for (const pos of openPositions) {
    const row = freshRowsByTicker[pos.ticker];
    let shouldExit = false;
    let exitReason = '';

    if (!row) {
      shouldExit = true;
      exitReason = 'Data missing / Deactivated';
    } else {
      const scoreRes = scoreRow(pos.strategy_key, row, sectorBenchmarks);
      if (!scoreRes.passes) {
        shouldExit = true;
        exitReason = scoreRes.reasons?.join(', ') || 'Thesis broke';
      }
    }

    if (shouldExit) {
      const exitPrice = pricesByTicker[pos.ticker] ?? row?.current_price ?? pos.current_price;
      const entryPrice = Number(pos.entry_price);
      const returnPct = entryPrice > 0 ? (exitPrice / entryPrice) - 1 : 0;

      exits.push({
        ...pos,
        status: 'CLOSED',
        exit_date: tickDate,
        exit_price: Number(exitPrice),
        exit_reason: exitReason,
        return_pct: Number(returnPct.toFixed(4)),
        last_updated: new Date().toISOString()
      });
    }
  }

  return exits;
}

/**
 * Selects new qualifying stocks to fill empty slots in the strategy.
 *
 * @param {string} strategyKey        the strategy key
 * @param {Array} rankedRows          top-N ranked qualifying stocks that passed the gate
 * @param {Set|Array} openTickers     tickers currently held in the portfolio
 * @param {number} freeSlots          number of slots that can be filled
 * @param {Object} pricesByTicker     map of ticker -> price on tickDate
 * @param {string} tickDate           the date of the simulation tick (YYYY-MM-DD)
 * @returns {Array}                   new open trades to create
 */
function decideEntries(strategyKey, rankedRows, openTickers, freeSlots, pricesByTicker, tickDate) {
  const newEntries = [];
  if (freeSlots <= 0) return newEntries;

  const openSet = new Set(openTickers);

  for (const row of rankedRows) {
    if (newEntries.length >= freeSlots) break;
    if (openSet.has(row.ticker)) continue;

    const entryPrice = pricesByTicker[row.ticker] ?? row.current_price;
    if (entryPrice == null || entryPrice <= 0) continue;

    const shares = 100000 / entryPrice;

    newEntries.push({
      strategy_key: strategyKey,
      ticker: row.ticker,
      company: row.company_name,
      entry_date: tickDate,
      entry_price: Number(entryPrice),
      entry_rank: row.rank,
      entry_reasons: row.reasons || [],
      exit_date: null,
      exit_price: null,
      exit_reason: null,
      status: 'OPEN',
      shares: Number(shares.toFixed(6)),
      current_price: Number(entryPrice),
      return_pct: 0,
      last_updated: new Date().toISOString()
    });
  }

  return newEntries;
}

/**
 * Updates prices and return % for open trades, and computes overall book value.
 *
 * @param {Array} openTrades       currently open positions (excluding exited ones, including new entries)
 * @param {number} cash            current book cash balance
 * @param {Object} todaysPrices    map of ticker -> current price
 * @param {string} tickDate        the date of the simulation tick (YYYY-MM-DD)
 * @returns {Object}               { updatedTrades: Array, bookValue: number }
 */
function applyTick(openTrades, cash, todaysPrices, tickDate) {
  const updatedTrades = openTrades.map(trade => {
    const price = todaysPrices[trade.ticker] ?? trade.current_price;
    const entryPrice = Number(trade.entry_price);
    const returnPct = entryPrice > 0 ? (price / entryPrice) - 1 : 0;

    return {
      ...trade,
      current_price: Number(price),
      return_pct: Number(returnPct.toFixed(4)),
      last_updated: new Date().toISOString()
    };
  });

  const portfolioVal = updatedTrades.reduce((sum, trade) => {
    return sum + (trade.shares * trade.current_price);
  }, 0);

  const bookValue = Number((cash + portfolioVal).toFixed(2));

  return {
    updatedTrades,
    bookValue
  };
}

/**
 * Calculates portfolio statistics.
 *
 * @param {Array} closedTrades     all historical closed trades for the strategy
 * @param {Array} equityCurve      daily book logs [{ date, book_value, book_return_pct }]
 * @param {Object} benchmarkInfo   { inception_benchmark_price, latest_benchmark_price }
 * @returns {Object}               calculated metrics
 */
function computeBookMetrics(closedTrades, equityCurve, benchmarkInfo) {
  const metrics = {
    cumulativeReturnPct: 0,
    winRatePct: 0,
    maxDrawdownPct: 0,
    alphaPct: 0,
    totalTrades: closedTrades.length
  };

  // Cumulative Return
  if (equityCurve && equityCurve.length > 0) {
    const latest = equityCurve[equityCurve.length - 1];
    metrics.cumulativeReturnPct = latest.book_return_pct;
  }

  // Win Rate (closed trades with return > 0)
  if (closedTrades.length > 0) {
    const wins = closedTrades.filter(t => t.return_pct > 0).length;
    metrics.winRatePct = Number(((wins / closedTrades.length) * 100).toFixed(2));
  }

  // Max Drawdown
  if (equityCurve && equityCurve.length > 0) {
    let peak = -Infinity;
    let maxDd = 0;
    for (const pt of equityCurve) {
      const val = Number(pt.book_value);
      if (val > peak) peak = val;
      if (peak > 0) {
        const dd = (peak - val) / peak;
        if (dd > maxDd) maxDd = dd;
      }
    }
    metrics.maxDrawdownPct = Number((maxDd * 100).toFixed(2));
  }

  // Alpha vs Benchmark
  if (benchmarkInfo && benchmarkInfo.inception_benchmark_price > 0 && benchmarkInfo.latest_benchmark_price > 0) {
    const benchmarkReturn = (benchmarkInfo.latest_benchmark_price / benchmarkInfo.inception_benchmark_price) - 1;
    metrics.alphaPct = Number(((metrics.cumulativeReturnPct - benchmarkReturn) * 100).toFixed(2));
  }

  return metrics;
}

module.exports = {
  decideExits,
  decideEntries,
  applyTick,
  computeBookMetrics
};
