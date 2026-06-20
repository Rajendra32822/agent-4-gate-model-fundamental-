/**
 * Historical Backtester Simulator for swing trading strategies.
 */
const { calculateTechnicalsForSeries } = require('./technicals');

/**
 * Runs a historical backtest for a strategy over the price series of its top ranked stocks.
 * 
 * @param {string[]} tickers      List of tickers to backtest
 * @param {object} db             Database helper with getDailyPricesHistory function
 * @param {number} allocation     Notional allocation per position (default ₹100,000)
 * @returns {object}              Backtest results report
 */
async function runStrategyBacktest(tickers, db, allocation = 100000) {
  const closedTrades = [];
  const openPositions = [];
  const reportsByTicker = {};

  for (const ticker of tickers) {
    const history = await db.getDailyPricesHistory(ticker, 500); // trailing 2 years daily bars
    if (!history || history.length < 50) continue;

    const technicals = calculateTechnicalsForSeries(history);
    if (technicals.length < 2) continue;

    let position = null;
    const tickerTrades = [];

    for (let i = 1; i < technicals.length; i++) {
      const today = technicals[i];
      const yesterday = technicals[i - 1];
      const close = today.close;

      if (close === null || close === undefined) continue;

      // ─── BUY Trigger ────────────────────────────────────────────────────────
      if (!position) {
        const isBullishFilter = today.sma_200 && close > today.sma_200;
        if (isBullishFilter) {
          let buyTriggered = false;
          let reason = '';

          if (today.rsi && today.rsi <= 35) {
            buyTriggered = true;
            reason = `RSI oversold (${today.rsi.toFixed(1)})`;
          } else if (today.macd_hist !== null && yesterday.macd_hist !== null && today.macd_hist > 0 && yesterday.macd_hist <= 0) {
            buyTriggered = true;
            reason = 'MACD Bullish Crossover';
          }

          if (buyTriggered) {
            position = {
              ticker,
              entry_date: today.date,
              entry_price: close,
              shares: allocation / close,
              reason
            };
          }
        }
      } 
      // ─── SELL Trigger ───────────────────────────────────────────────────────
      else {
        let sellTriggered = false;
        let reason = '';

        if (today.sma_50 && close < today.sma_50) {
          sellTriggered = true;
          reason = `Broke below 50 SMA (${today.sma_50})`;
        } else if (today.rsi && today.rsi >= 70) {
          sellTriggered = true;
          reason = `RSI overbought (${today.rsi.toFixed(1)})`;
        } else if (today.macd_hist !== null && yesterday.macd_hist !== null && today.macd_hist < 0 && yesterday.macd_hist >= 0) {
          sellTriggered = true;
          reason = 'MACD Bearish Crossover';
        }

        if (sellTriggered) {
          const pnl = (close - position.entry_price) * position.shares;
          const returnPct = (close / position.entry_price) - 1;
          
          const trade = {
            ticker,
            entry_date: position.entry_date,
            entry_price: position.entry_price,
            exit_date: today.date,
            exit_price: close,
            shares: position.shares,
            pnl: Number(pnl.toFixed(2)),
            return_pct: Number((returnPct * 100).toFixed(2)),
            entry_reason: position.reason,
            exit_reason: reason
          };
          
          closedTrades.push(trade);
          tickerTrades.push(trade);
          position = null;
        }
      }
    }

    if (position) {
      const lastTech = technicals[technicals.length - 1];
      openPositions.push({
        ticker,
        entry_date: position.entry_date,
        entry_price: position.entry_price,
        current_price: lastTech.close,
        shares: position.shares,
        return_pct: Number(((lastTech.close / position.entry_price - 1) * 100).toFixed(2)),
        entry_reason: position.reason
      });
    }

    // Ticker specific performance summary
    if (tickerTrades.length > 0) {
      const wins = tickerTrades.filter(t => t.pnl >= 0).length;
      reportsByTicker[ticker] = {
        totalTrades: tickerTrades.length,
        winRate: (wins / tickerTrades.length) * 100,
        netPnl: tickerTrades.reduce((sum, t) => sum + t.pnl, 0)
      };
    }
  }

  // Calculate global summary stats
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter(t => t.pnl >= 0).length;
  const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const netPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);

  // Compute maximum drawdown of closed trades sequence (historical peak-to-trough drop)
  let peak = allocation * tickers.length; // start notional capital
  let capital = peak + netPnl;
  
  let currentBalance = peak;
  let maxEquity = peak;
  let maxDrawdownPct = 0;

  // Chronologically sort trades to build return path
  const sortedTrades = [...closedTrades].sort((a, b) => a.exit_date.localeCompare(b.exit_date));
  const equityCurve = [{ date: 'Inception', balance: peak, returnPct: 0 }];

  sortedTrades.forEach(t => {
    currentBalance += t.pnl;
    equityCurve.push({
      date: t.exit_date,
      balance: currentBalance,
      returnPct: ((currentBalance - peak) / peak) * 100
    });
    if (currentBalance > maxEquity) {
      maxEquity = currentBalance;
    }
    const dd = ((maxEquity - currentBalance) / maxEquity) * 100;
    if (dd > maxDrawdownPct) {
      maxDrawdownPct = dd;
    }
  });

  return {
    summary: {
      totalTrades,
      winningTrades,
      winRatePct: Number(winRatePct.toFixed(2)),
      netPnl: Number(netPnl.toFixed(2)),
      returnPct: Number(((currentBalance - peak) / peak * 100).toFixed(2)),
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2))
    },
    equityCurve,
    closedTrades: sortedTrades,
    openPositions,
    reportsByTicker
  };
}

module.exports = { runStrategyBacktest };
