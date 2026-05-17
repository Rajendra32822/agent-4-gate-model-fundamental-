const https = require('https');

// ─── Yahoo Finance helpers ────────────────────────────────────────────────────

function toYahooSymbol(ticker, exchange = 'NS') {
  return `${ticker.toUpperCase()}.${exchange}`;
}

// Generic HTTPS GET that returns parsed JSON
function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// Existing simple price-only fetcher — preserved for the daily price-check cron.
async function fetchYahooPrice(ticker) {
  for (const ex of ['NS', 'BO']) {
    const symbol = toYahooSymbol(ticker, ex);
    try {
      const { json } = await httpsGetJson(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`);
      const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) return Number(price.toFixed(2));
    } catch { /* try next exchange */ }
  }
  throw new Error(`No price for ${ticker} on NSE or BSE`);
}

/**
 * Deterministic market-data fetcher used to enrich AI analyses.
 * Returns the freshest live numbers from Yahoo Finance — far more reliable
 * than asking an LLM to extract price from search results.
 *
 * Returns: { price, previousClose, marketCap, peRatio, priceBook, dividendYield,
 *            fiftyTwoWeekHigh, fiftyTwoWeekLow, currency, exchange }
 *
 * All numeric fields are nullable. Caller should only override AI-extracted
 * values when this method returns a non-null replacement.
 */
async function fetchYahooQuote(ticker) {
  // Try v7 quote endpoint first — returns the most fields in one call.
  // Falls back to chart endpoint (price only) if v7 is blocked.
  for (const ex of ['NS', 'BO']) {
    const symbol = toYahooSymbol(ticker, ex);

    // Attempt 1: v7 quote endpoint (returns marketCap, peRatio, priceBook, etc.)
    try {
      const { status, json } = await httpsGetJson(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`);
      const r = json?.quoteResponse?.result?.[0];
      if (status === 200 && r && (r.regularMarketPrice || r.regularMarketPreviousClose)) {
        return {
          price:             r.regularMarketPrice ?? r.regularMarketPreviousClose ?? null,
          previousClose:     r.regularMarketPreviousClose ?? null,
          marketCap:         r.marketCap ?? null,
          peRatio:           r.trailingPE ?? null,
          priceBook:         r.priceToBook ?? null,
          dividendYield:     r.trailingAnnualDividendYield != null ? r.trailingAnnualDividendYield * 100 : null,
          fiftyTwoWeekHigh:  r.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow:   r.fiftyTwoWeekLow ?? null,
          currency:          r.currency || 'INR',
          exchange:          ex,
          source:            'yahoo-v7',
        };
      }
    } catch { /* fall through to chart endpoint */ }

    // Attempt 2: v8 chart endpoint (price + 52w only, no marketCap)
    try {
      const { json } = await httpsGetJson(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`);
      const meta = json?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
        return {
          price:             meta.regularMarketPrice,
          previousClose:     meta.previousClose ?? meta.chartPreviousClose ?? null,
          marketCap:         null,
          peRatio:           null,
          priceBook:         null,
          dividendYield:     null,
          fiftyTwoWeekHigh:  meta.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow:   meta.fiftyTwoWeekLow ?? null,
          currency:          meta.currency || 'INR',
          exchange:          ex,
          source:            'yahoo-chart',
        };
      }
    } catch { /* try next exchange */ }
  }
  throw new Error(`No Yahoo data for ${ticker} on NSE or BSE`);
}

// Format helpers for converting raw numbers into the display strings
// the analysis schema expects (e.g. "₹1,23,456 Cr").
function formatInrPrice(n) {
  if (n == null || isNaN(n)) return null;
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatInrCrore(rupees) {
  if (rupees == null || isNaN(rupees)) return null;
  const cr = rupees / 1e7; // 1 crore = 10 million
  return `₹${Number(cr.toFixed(0)).toLocaleString('en-IN')} Cr`;
}

// ─── Parse entry zone / price strings from analysis JSON ─────────────────────

function parseEntryZone(str) {
  if (!str) return null;
  const cleaned = str.replace(/[₹,\s]/g, '');
  // Matches "2800–3200" or "2800-3200"
  const match = cleaned.match(/(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)/);
  if (match) return { low: parseFloat(match[1]), high: parseFloat(match[2]) };
  return null;
}

function parsePrice(str) {
  if (!str) return null;
  const cleaned = str.replace(/[₹,\s]/g, '');
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

// Build a watch record from a saved analysis object
function extractWatchFromAnalysis(analysis) {
  const zone = parseEntryZone(analysis.gate3?.entryZone || analysis.targetEntryPrice || '');
  const bullCase = parsePrice(analysis.gate3?.valuationScenarios?.bullCase?.price);
  const bearCase = parsePrice(analysis.gate3?.valuationScenarios?.bearCase?.price);

  return {
    ticker: analysis.ticker?.toUpperCase(),
    company: analysis.company || '',
    entry_low: zone?.low ?? null,
    entry_high: zone?.high ?? null,
    bull_case: bullCase ?? null,
    bear_case: bearCase ?? null,
    analysis_date: analysis.analysisDate ?? null,
    overall_verdict: analysis.overallVerdict ?? null,
    status: 'ACTIVE',
  };
}

// ─── Main daily price-check runner ───────────────────────────────────────────

async function runDailyPriceCheck(db) {
  const {
    getActiveWatches, savePriceCheck,
    createAlert, openVirtualTrade, closeVirtualTrade, updateOpenTrades,
  } = db;

  const watches = await getActiveWatches();
  const results = { checked: 0, alerts: [], errors: [] };

  for (const watch of watches) {
    try {
      const price = await fetchYahooPrice(watch.ticker);
      await savePriceCheck(watch.ticker, price);
      results.checked++;

      // Keep open trade P&L current
      await updateOpenTrades(watch.ticker, price);

      // ── BUY ZONE: price entered entry range ──────────────────────────────
      if (watch.entry_high && watch.entry_low &&
          price >= watch.entry_low * 0.98 && price <= watch.entry_high) {
        const alerted = await createAlert(
          watch.ticker, watch.company, 'BUY_ZONE',
          `${watch.company} (${watch.ticker}) has entered the entry zone at ₹${price.toFixed(0)}. ` +
          `Target range: ₹${watch.entry_low}–${watch.entry_high}. Consider buying.`,
          price
        );
        if (alerted) {
          await openVirtualTrade(watch.ticker, watch.company, price);
          results.alerts.push({ type: 'BUY_ZONE', ticker: watch.ticker, price });
        }
      }

      // ── PROFIT TARGET: price hit bull case ───────────────────────────────
      if (watch.bull_case && price >= watch.bull_case) {
        const alerted = await createAlert(
          watch.ticker, watch.company, 'PROFIT_TARGET',
          `${watch.company} (${watch.ticker}) has reached the bull case target ₹${watch.bull_case}. ` +
          `Current price ₹${price.toFixed(0)} — consider booking profits.`,
          price
        );
        if (alerted) {
          await closeVirtualTrade(watch.ticker, price, 'PROFIT_TARGET');
          results.alerts.push({ type: 'PROFIT_TARGET', ticker: watch.ticker, price });
        }
      }

      // ── STOP LOSS: price fell to/below bear case ─────────────────────────
      if (watch.bear_case && price <= watch.bear_case) {
        await createAlert(
          watch.ticker, watch.company, 'STOP_LOSS',
          `${watch.company} (${watch.ticker}) has fallen to ₹${price.toFixed(0)}, at or below the ` +
          `bear case ₹${watch.bear_case}. Review your position.`,
          price
        );
        results.alerts.push({ type: 'STOP_LOSS', ticker: watch.ticker, price });
      }

      // Polite delay between Yahoo calls
      await new Promise(r => setTimeout(r, 1200));

    } catch (err) {
      console.error(`[priceCheck] ${watch.ticker}: ${err.message}`);
      results.errors.push({ ticker: watch.ticker, error: err.message });
    }
  }

  return results;
}

module.exports = {
  fetchYahooPrice, fetchYahooQuote, formatInrPrice, formatInrCrore,
  extractWatchFromAnalysis, runDailyPriceCheck, parseEntryZone, parsePrice,
};
