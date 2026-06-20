/**
 * Pure signal generation engine.
 * Combines fundamental rankings with technical timing triggers (RSI, SMA, MACD).
 */

/**
 * Checks signal triggers for a ticker.
 * 
 * @param {string} ticker                Ticker symbol
 * @param {object[]} technicals          Historical technical indicators (ordered by date DESC: [0] = today, [1] = yesterday)
 * @param {string[]} rankedStrategies    Strategies where the ticker is in the top-15 ranked list
 * @param {string[]} openStrategies      Strategies where the ticker is currently held/watched
 * @returns {object[]}                   Array of generated signal objects
 */
function checkSignalsForTicker(ticker, technicals, rankedStrategies = [], openStrategies = []) {
  if (!technicals || technicals.length === 0) return [];
  
  const today = technicals[0];
  const yesterday = technicals[1] || null;
  const signals = [];

  const close = today.close ?? today.price ?? null;
  if (close === null) return [];

  // Helper to safely check numeric values
  const isNum = (v) => typeof v === 'number' && !isNaN(v);

  // ─── BUY Signals ────────────────────────────────────────────────────────────
  for (const strategyKey of rankedStrategies) {
    // A BUY signal is only generated if we do not already have an open position in this strategy
    if (openStrategies.includes(strategyKey)) continue;

    if (!isNum(today.sma_200)) continue;

    // Bulletproof: Price must be above SMA 200
    const isBullishFilter = close > today.sma_200;
    if (!isBullishFilter) continue;

    let buyTriggered = false;
    let desc = '';

    // Trigger 1: RSI Oversold
    if (isNum(today.rsi) && today.rsi <= 35) {
      buyTriggered = true;
      desc = `Price above 200 SMA (Close: ${close} > SMA 200: ${today.sma_200}) and RSI is oversold (RSI: ${today.rsi.toFixed(2)} <= 35)`;
    }

    // Trigger 2: MACD Bullish Crossover
    if (!buyTriggered && today.macd_hist !== null && yesterday && yesterday.macd_hist !== null) {
      if (today.macd_hist > 0 && yesterday.macd_hist <= 0) {
        buyTriggered = true;
        desc = `Price above 200 SMA (Close: ${close} > SMA 200: ${today.sma_200}) and MACD Bullish Crossover detected`;
      }
    }

    if (buyTriggered) {
      signals.push({
        ticker,
        signal_type: 'BUY',
        strategy_key: strategyKey,
        price: close,
        date: today.date,
        reasons: {
          description: desc,
          rsi: today.rsi,
          close,
          sma_50: today.sma_50,
          sma_200: today.sma_200,
          macd: today.macd,
          macd_signal: today.macd_signal,
          macd_hist: today.macd_hist,
          prior_macd_hist: yesterday ? yesterday.macd_hist : null
        }
      });
    }
  }

  // ─── SELL Signals ───────────────────────────────────────────────────────────
  for (const strategyKey of openStrategies) {
    let sellTriggered = false;
    let desc = '';

    // Trigger 1: Price drops below 50 SMA
    if (isNum(today.sma_50) && close < today.sma_50) {
      sellTriggered = true;
      desc = `Price broke below 50 SMA (Close: ${close} < SMA 50: ${today.sma_50})`;
    }

    // Trigger 2: RSI Overbought
    if (!sellTriggered && isNum(today.rsi) && today.rsi >= 70) {
      sellTriggered = true;
      desc = `RSI is overbought (RSI: ${today.rsi.toFixed(2)} >= 70)`;
    }

    // Trigger 3: MACD Bearish Crossover
    if (!sellTriggered && today.macd_hist !== null && yesterday && yesterday.macd_hist !== null) {
      if (today.macd_hist < 0 && yesterday.macd_hist >= 0) {
        sellTriggered = true;
        desc = `MACD Bearish Crossover detected`;
      }
    }

    if (sellTriggered) {
      signals.push({
        ticker,
        signal_type: 'SELL',
        strategy_key: strategyKey,
        price: close,
        date: today.date,
        reasons: {
          description: desc,
          rsi: today.rsi,
          close,
          sma_50: today.sma_50,
          sma_200: today.sma_200,
          macd: today.macd,
          macd_signal: today.macd_signal,
          macd_hist: today.macd_hist,
          prior_macd_hist: yesterday ? yesterday.macd_hist : null
        }
      });
    }
  }

  return signals;
}

module.exports = { checkSignalsForTicker };
