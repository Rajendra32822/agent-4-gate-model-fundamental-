const https = require('https');

// ─── Yahoo Finance helpers ────────────────────────────────────────────────────

function toYahooSymbol(ticker) {
  return `${ticker.toUpperCase()}.NS`;
}

function fetchYahooPrice(ticker) {
  return new Promise((resolve, reject) => {
    const symbol = toYahooSymbol(ticker);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 10000,
    };
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (price && price > 0) {
            resolve(Number(price.toFixed(2)));
          } else {
            reject(new Error(`No price for ${ticker} — may not be listed as ${symbol}`));
          }
        } catch (e) {
          reject(new Error(`Parse error for ${ticker}: ${e.message}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${ticker}`)); });
    req.on('error', reject);
  });
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

module.exports = { fetchYahooPrice, extractWatchFromAnalysis, runDailyPriceCheck, parseEntryZone, parsePrice };
