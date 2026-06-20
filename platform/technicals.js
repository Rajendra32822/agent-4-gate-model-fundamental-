/**
 * Pure technical indicators calculation engine. No I/O.
 * Calculates standard swing trading metrics: SMA, EMA, RSI, and MACD.
 */

/**
 * Calculates Simple Moving Average (SMA).
 */
function calculateSMA(values, period) {
  const sma = new Array(values.length).fill(null);
  
  // Find first non-null index
  let startIdx = 0;
  while (startIdx < values.length && values[startIdx] === null) {
    startIdx++;
  }

  if (values.length - startIdx < period) return sma;

  let sum = 0;
  for (let i = startIdx; i < startIdx + period; i++) {
    sum += values[i];
  }
  sma[startIdx + period - 1] = Number((sum / period).toFixed(4));

  for (let i = startIdx + period; i < values.length; i++) {
    sum = sum - values[i - period] + values[i];
    sma[i] = Number((sum / period).toFixed(4));
  }
  return sma;
}

/**
 * Calculates Exponential Moving Average (EMA).
 * Handles leading null values in input gracefully.
 */
function calculateEMA(values, period) {
  const ema = new Array(values.length).fill(null);
  
  // Find first non-null index
  let startIdx = 0;
  while (startIdx < values.length && values[startIdx] === null) {
    startIdx++;
  }

  if (values.length - startIdx < period) return ema;

  let sum = 0;
  for (let i = startIdx; i < startIdx + period; i++) {
    sum += values[i];
  }
  let prevEma = sum / period;
  ema[startIdx + period - 1] = Number(prevEma.toFixed(4));

  const multiplier = 2 / (period + 1);
  for (let i = startIdx + period; i < values.length; i++) {
    const currentEma = (values[i] - prevEma) * multiplier + prevEma;
    ema[i] = Number(currentEma.toFixed(4));
    prevEma = currentEma;
  }
  return ema;
}

/**
 * Calculates Relative Strength Index (RSI) using Wilder's smoothing method.
 */
function calculateRSI(prices, period = 14) {
  const rsi = new Array(prices.length).fill(null);
  
  // Find first non-null price index
  let startIdx = 0;
  while (startIdx < prices.length && prices[startIdx] === null) {
    startIdx++;
  }

  if (prices.length - startIdx < period + 1) return rsi;

  const gains = new Array(prices.length).fill(0);
  const losses = new Array(prices.length).fill(0);

  for (let i = startIdx + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? -diff : 0;
  }

  // Initial average gain and loss (SMA for first 'period' values)
  let sumGain = 0;
  let sumLoss = 0;
  for (let i = startIdx + 1; i <= startIdx + period; i++) {
    sumGain += gains[i];
    sumLoss += losses[i];
  }

  let avgGain = sumGain / period;
  let avgLoss = sumLoss / period;

  let rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
  rsi[startIdx + period] = avgLoss === 0 ? 100 : Number((100 - (100 / (1 + rs))).toFixed(4));

  for (let i = startIdx + period + 1; i < prices.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      rs = avgGain / avgLoss;
      rsi[i] = Number((100 - (100 / (1 + rs))).toFixed(4));
    }
  }
  return rsi;
}

/**
 * Calculates MACD (Moving Average Convergence Divergence) Line, Signal Line, and Histogram.
 */
function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const macd = new Array(prices.length).fill(null);
  const signal = new Array(prices.length).fill(null);
  const hist = new Array(prices.length).fill(null);

  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);

  // MACD line = EMA(fast) - EMA(slow)
  const macdLine = new Array(prices.length).fill(null);
  let firstMacdIdx = -1;
  for (let i = 0; i < prices.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine[i] = Number((emaFast[i] - emaSlow[i]).toFixed(4));
      if (firstMacdIdx === -1) firstMacdIdx = i;
    }
  }

  if (firstMacdIdx === -1) return { macd, signal, hist };

  // Signal line = EMA of MACD line
  const signalLine = calculateEMA(macdLine, signalPeriod);

  for (let i = 0; i < prices.length; i++) {
    if (macdLine[i] !== null) {
      macd[i] = macdLine[i];
    }
    if (signalLine[i] !== null) {
      signal[i] = signalLine[i];
    }
    if (macd[i] !== null && signal[i] !== null) {
      hist[i] = Number((macd[i] - signal[i]).toFixed(4));
    }
  }

  return { macd, signal, hist };
}

function calculateBollingerBands(values, period = 20, multiplier = 2) {
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);

  let startIdx = 0;
  while (startIdx < values.length && values[startIdx] === null) {
    startIdx++;
  }

  if (values.length - startIdx < period) return { upper, lower };

  for (let i = startIdx + period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, v) => sum + v, 0) / period;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    upper[i] = Number((mean + multiplier * stdDev).toFixed(4));
    lower[i] = Number((mean - multiplier * stdDev).toFixed(4));
  }

  return { upper, lower };
}

function calculateOBV(closes, volumes) {
  const obv = new Array(closes.length).fill(null);

  let startIdx = 0;
  while (startIdx < closes.length && closes[startIdx] === null) {
    startIdx++;
  }

  if (startIdx >= closes.length) return obv;

  let currentObv = volumes[startIdx] || 0;
  obv[startIdx] = currentObv;

  for (let i = startIdx + 1; i < closes.length; i++) {
    const todayClose = closes[i];
    const yesterdayClose = closes[i - 1];
    const todayVolume = volumes[i] || 0;

    if (todayClose > yesterdayClose) {
      currentObv += todayVolume;
    } else if (todayClose < yesterdayClose) {
      currentObv -= todayVolume;
    }

    obv[i] = currentObv;
  }

  return obv;
}

/**
 * Calculates a complete set of technical indicators for a historical series.
 *
 * @param {Array} dailyPrices   ordered daily price objects: [{ date, close, volume }]
 * @returns {Array}             list of technical metrics per date: [{ date, rsi, ema_20, ... }]
 */
function calculateTechnicalsForSeries(dailyPrices) {
  if (!dailyPrices || dailyPrices.length === 0) return [];

  const closes = dailyPrices.map(d => d.close);
  const volumes = dailyPrices.map(d => d.volume || 0);
  
  const rsi = calculateRSI(closes, 14);
  const ema20 = calculateEMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const { macd, signal, hist } = calculateMACD(closes, 12, 26, 9);
  const { upper: bbUpper, lower: bbLower } = calculateBollingerBands(closes, 20, 2);
  const obv = calculateOBV(closes, volumes);

  return dailyPrices.map((d, i) => ({
    date: d.date,
    close: d.close,
    volume: d.volume || 0,
    rsi: rsi[i],
    ema_20: ema20[i],
    sma_50: sma50[i],
    sma_200: sma200[i],
    macd: macd[i],
    macd_signal: signal[i],
    macd_hist: hist[i],
    bb_upper: bbUpper[i],
    bb_lower: bbLower[i],
    obv: obv[i]
  }));
}

module.exports = {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateOBV,
  calculateTechnicalsForSeries
};
