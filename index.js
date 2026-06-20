require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { runMarshallAnalysis, runUpdateAnalysis, lookupCompany, matchCompanyInUniverse } = require('./agent');
const { extractWatchFromAnalysis, runDailyPriceCheck } = require('./priceCheck');
const { computeConfidenceScore } = require('./confidence');
const { verifyAnalysis } = require('./verification');
const { computeHoldings, computePortfolioSummary } = require('./portfolio');
const { computeOutcome } = require('./outcomes');
const { fetchYahooPrice } = require('./priceCheck');
const { ingestCompany } = require('./ingestion/orchestrator');
const { runBulkIngestion, getBulkState } = require('./ingestion/bulkRunner');
const { runDailyPricesIngestion, getDailyPricesState } = require('./ingestion/dailyPricesRunner');
const { runCorporateActionsProposal, getCorporateActionsProposalState } = require('./ingestion/corporateActionsRunner');
const fsPromises = require('fs').promises;
const pathMod = require('path');
const {
  connectDB, checkConnection, saveAnalysis, getAnalysis,
  getAllAnalyses, getAnalysisHistory, deleteAnalysis,
  getProfile, updateProfile, getWatchlist, addToWatchlist, removeFromWatchlist,
  upsertWatch, getActiveWatches, getAllWatches, updateWatchStatus,
  savePriceCheck, getLatestPrices,
  openVirtualTrade, closeVirtualTrade, updateOpenTrades, getAllTrades,
  createAlert, getAlerts, getUnreadAlertCount, markAllAlertsRead,
  saveFundamentalMetrics, getMetricsHistory, getAllMetricsLatest,
  addPortfolioTransaction, listPortfolioTransactions, updatePortfolioTransaction,
  deletePortfolioTransaction, setTransactionStatus,
  upsertOutcome, getAllOutcomes, getOutcomesByTicker,
  upsertCompany, getCompany,
  upsertAnnualPl, upsertAnnualBs, upsertAnnualCf, upsertQuarterlyPl,
  upsertDerivedAnnual, upsertDerivedQuarterly, upsertAggregates,
  getCompanyBundle,
  upsertShareholding, seedCompanies, listCompanies, getStaleCompanies,
  markIngested, updateCompany, deleteCompany, renameTickerCascade, getCoverage,
  upsertRatios, getRankingDataset,
  listSectors, updateSector, seedSectors,
  createCorporateAction, getCorporateAction, listCorporateActions, listCorporateActionsByStatus,
  updateCorporateAction, setCorporateActionStatus, applyTickerChange, updateCompanyName,
  captureCorporateActionFromAnalysis, corporateActionExists,
  getLastPriceDate, getPriceOnDate, upsertDailyPrices, getActiveTickersInUniverse,
  getPaperBookMeta, savePaperBookMeta, getPaperTrades, savePaperTrades, savePaperBookDaily, getPaperBookDaily,
} = require('./db');
const { rankUniverse, STRATEGY_LIST, toSectorMap } = require('./ranking');
const { sendAlert } = require('./platform/alerting');
const { decideExits, decideEntries, applyTick, computeBookMetrics } = require('./platform/paperTrade');
const { validateConfirm, EVENT_TYPES } = require('./corporateActions');

// Shared db-helpers bundle passed to the ingestion orchestrator/bulk runner
const INGEST_DB_HELPERS = {
  upsertAnnualPl, upsertAnnualBs, upsertAnnualCf, upsertQuarterlyPl,
  upsertDerivedAnnual, upsertDerivedQuarterly, upsertAggregates,
  upsertShareholding, upsertRatios, markIngested, upsertCompany,
};

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'rajendraamilineni@gmail.com';

// ─── Supabase admin client ────────────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './client/build')));

// ─── Auth middleware ──────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20,
  message: { error: 'Too many analysis requests. Please wait.' }
});

connectDB().then(() => console.log('📦 Database ready'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const dbAlive = await checkConnection();
  if (!dbAlive) {
    await sendAlert('🚨 *Uptime Alert*\nDatabase connection is DOWN or unreachable!');
    return res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
    });
  }
  res.json({
    status: 'ok',
    message: 'Fundamental Agent API running',
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    dbConfigured: !!process.env.SUPABASE_URL,
    authConfigured: !!process.env.SUPABASE_SERVICE_KEY,
  });
});

// ─── Company lookup ───────────────────────────────────────────────────────────
app.get('/api/lookup', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

  // Local-first: resolve from the universe master (free, instant, no AI).
  try {
    const match = matchCompanyInUniverse(await listCompanies(), q);
    if (match) {
      return res.json({
        ticker: match.ticker,
        name: match.company_name || match.ticker,
        exchange: 'NSE',
        sector: match.sector || null,
        source: 'universe',
      });
    }
  } catch (e) {
    console.error('Local lookup failed, falling back to AI:', e.message);
  }

  // Fallback: free-model AI lookup (no paid web search).
  const result = await lookupCompany(q);
  res.json(result);
});

// ─── Get all analyses ─────────────────────────────────────────────────────────
app.get('/api/analyses', requireAuth, async (req, res) => {
  try {
    let analyses = await getAllAnalyses();
    if (!analyses || analyses.length === 0) {
      const keys = cache.keys().filter(k => k.startsWith('analysis_'));
      analyses = keys.map(k => {
        const data = cache.get(k);
        if (!data) return null;
        return {
          ticker: data.ticker, company: data.company, analysisDate: data.analysisDate,
          overallVerdict: data.overallVerdict, targetEntryPrice: data.targetEntryPrice,
          gate1Verdict: data.gate1?.verdict, gate2aVerdict: data.gate2a?.verdict,
          gate2bVerdict: data.gate2b?.verdict, gate2cVerdict: data.gate2c?.verdict,
          gate3Verdict: data.gate3?.verdict,
        };
      }).filter(Boolean);
    }
    res.json(analyses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get single analysis ──────────────────────────────────────────────────────
app.get('/api/analysis/:ticker', requireAuth, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const cached = cache.get(`analysis_${ticker}`);
  if (cached) return res.json(cached);
  const stored = await getAnalysis(ticker);
  if (stored) {
    // Lazy-compute confidence for analyses created before this feature shipped.
    // Not persisted; run /api/admin/backfill-confidence to make it permanent.
    if (!stored.confidence) {
      stored.confidence = computeConfidenceScore(stored);
    }
    cache.set(`analysis_${ticker}`, stored);
    return res.json(stored);
  }
  res.status(404).json({ error: 'Analysis not found' });
});

// ─── Analysis history ─────────────────────────────────────────────────────────
app.get('/api/analysis/:ticker/history', requireAuth, async (req, res) => {
  const history = await getAnalysisHistory(req.params.ticker);
  res.json(history);
});

// ─── Run new analysis (admin only) ───────────────────────────────────────────
app.post('/api/analyse', requireAdmin, analysisLimiter, async (req, res) => {
  const { ticker, companyName, forceRefresh, deepAnalysis } = req.body;
  if (!ticker || !companyName) return res.status(400).json({ error: 'ticker and companyName are required' });
  if (!process.env.OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  if (deepAnalysis && !process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured for Deep Analysis' });

  if (!forceRefresh) {
    const cacheKey = `analysis_${ticker.toUpperCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'result', analysis: cached, cached: true })}\n\n`);
      return res.end();
    }
    const stored = await getAnalysis(ticker);
    if (stored) {
      const age = Date.now() - new Date(stored.savedAt).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) {
        cache.set(cacheKey, stored);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ type: 'result', analysis: stored, cached: true })}\n\n`);
        return res.end();
      }
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendProgress = (data) => res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
  const sendResult = (data) => { res.write(`data: ${JSON.stringify({ type: 'result', ...data })}\n\n`); res.end(); };
  const sendError = (error) => { res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`); res.end(); };

  try {
    sendProgress({ stage: 'starting', message: `Starting ${deepAnalysis ? 'deep' : 'standard'} analysis for ${companyName}...`, progress: 5 });

    // Standard (free) analysis relies on structured data + Yahoo (it skips web search).
    // If this ticker was never ingested, pull it from screener.in on demand (free scraper)
    // so the free model has real financials to work with.
    if (!deepAnalysis) {
      const existing = await getCompanyBundle(ticker).catch(() => null);
      const hasData = !!(existing && Array.isArray(existing.annual_pl) && existing.annual_pl.length > 0);
      if (!hasData) {
        sendProgress({ stage: 'ingesting', message: `Fetching ${ticker} fundamentals from screener.in...`, progress: 8 });
        try {
          await ingestCompany(ticker, INGEST_DB_HELPERS);
        } catch (e) {
          return sendError(`Couldn't fetch data for ${ticker} from screener.in — try Deep Analysis. (${e.message})`);
        }
        const after = await getCompanyBundle(ticker).catch(() => null);
        if (!after || !Array.isArray(after.annual_pl) || after.annual_pl.length === 0) {
          return sendError(`No structured data available for ${ticker} after ingestion — try Deep Analysis.`);
        }
      }
    }

    const result = await runMarshallAnalysis(ticker, companyName, sendProgress, { deepAnalysis: !!deepAnalysis });
    if (result.success) {
      await saveAnalysis(result.analysis);
      cache.set(`analysis_${ticker.toUpperCase()}`, result.analysis);
      // Auto-create/update watch with entry zone from this analysis
      try {
        const watch = extractWatchFromAnalysis(result.analysis);
        if (watch.ticker) await upsertWatch(watch);
      } catch (e) { console.error('Auto-watch error:', e.message); }
      // Save structured fundamental metrics for cross-company querying
      saveFundamentalMetrics(result.analysis).catch(e => console.error('Metrics save error:', e.message));
      captureCorporateActionFromAnalysis(result.analysis).catch(e => console.error('Corp-action capture error:', e.message));
      sendResult({ analysis: result.analysis });
    } else {
      sendError(result.error);
    }
  } catch (err) {
    sendError(err.message);
  }
});

// ─── Update analysis (admin only) ────────────────────────────────────────────
app.post('/api/analysis/:ticker/update', requireAdmin, analysisLimiter, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const { companyName, deepAnalysis } = req.body;
  if (!companyName) return res.status(400).json({ error: 'companyName is required' });
  if (!process.env.OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  if (deepAnalysis && !process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured for Deep Analysis' });

  const existing = cache.get(`analysis_${ticker}`) || await getAnalysis(ticker);
  if (!existing) return res.status(404).json({ error: 'No existing analysis found. Run a full analysis first.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendProgress = (data) => res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
  const sendResult = (data) => { res.write(`data: ${JSON.stringify({ type: 'result', ...data })}\n\n`); res.end(); };
  const sendError = (error) => { res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`); res.end(); };

  try {
    sendProgress({ stage: 'starting', message: `Checking latest data for ${companyName}...`, progress: 5 });
    const result = await runUpdateAnalysis(ticker, companyName, existing, sendProgress, { deepAnalysis: !!deepAnalysis });
    if (result.success) {
      await saveAnalysis(result.analysis);
      cache.set(`analysis_${ticker}`, result.analysis);
      // Update watch with fresh prices from quarterly update
      try {
        const watch = extractWatchFromAnalysis(result.analysis);
        if (watch.ticker) await upsertWatch(watch);
      } catch (e) { console.error('Auto-watch update error:', e.message); }
      // Save structured fundamental metrics
      saveFundamentalMetrics(result.analysis).catch(e => console.error('Metrics save error:', e.message));
      captureCorporateActionFromAnalysis(result.analysis).catch(e => console.error('Corp-action capture error:', e.message));
      sendResult({ analysis: result.analysis });
    } else {
      sendError(result.error);
    }
  } catch (err) {
    sendError(err.message);
  }
});

// ─── Delete analysis (admin only) ────────────────────────────────────────────
app.delete('/api/analysis/:ticker', requireAdmin, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  cache.del(`analysis_${ticker}`);
  await deleteAnalysis(ticker);
  res.json({ success: true, message: `Analysis for ${ticker} deleted` });
});

// ─── Profile endpoints ────────────────────────────────────────────────────────
app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    res.json(profile || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const result = await updateProfile(req.user.id, { email: req.user.email, ...req.body });
    if (!result) return res.status(500).json({ error: 'Failed to save profile' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Watchlist endpoints ──────────────────────────────────────────────────────
app.get('/api/watchlist', requireAuth, async (req, res) => {
  const items = await getWatchlist(req.user.id);
  res.json(items);
});

app.post('/api/watchlist', requireAuth, async (req, res) => {
  const { ticker, company } = req.body;
  if (!ticker) return res.status(400).json({ error: 'ticker is required' });
  const result = await addToWatchlist(req.user.id, ticker, company);
  res.json(result);
});

app.delete('/api/watchlist/:ticker', requireAuth, async (req, res) => {
  await removeFromWatchlist(req.user.id, req.params.ticker);
  res.json({ success: true });
});

// ─── Set password via service role (more reliable than client-side updateUser) ─
app.post('/api/auth/set-password', async (req, res) => {
  const { password } = req.body;
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Invalid session. Please use a fresh invite link.' });
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: invite user ───────────────────────────────────────────────────────
app.post('/api/admin/invite', requireAdmin, async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });
  try {
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { name: name || '' },
      redirectTo: `${process.env.SITE_URL || 'https://agent-4-gate-model-fundamental.onrender.com'}/`
    });
    if (error) throw error;
    res.json({ success: true, message: `Invite sent to ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: list users ────────────────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;
    const { data: profiles } = await supabaseAdmin.from('profiles').select('*');
    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
    const merged = users.map(u => ({
      id: u.id,
      email: u.email,
      name: profileMap[u.id]?.name || '',
      investment_style: profileMap[u.id]?.investment_style || '',
      preferred_sectors: profileMap[u.id]?.preferred_sectors || [],
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }));
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: remove user ───────────────────────────────────────────────────────
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
    if (user?.email === ADMIN_EMAIL) return res.status(403).json({ error: 'Cannot remove admin account' });
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Fundamental Metrics endpoints ───────────────────────────────────────────
app.get('/api/metrics', requireAuth, async (req, res) => {
  try {
    const metrics = await getAllMetricsLatest();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/metrics/:ticker', requireAuth, async (req, res) => {
  try {
    const history = await getMetricsHistory(req.params.ticker);
    if (!history.length) return res.status(404).json({ error: 'No metrics found for ticker' });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Watches endpoints ────────────────────────────────────────────────────────
app.get('/api/watches', requireAuth, async (req, res) => {
  try {
    const [watches, prices, trades] = await Promise.all([getAllWatches(), getLatestPrices(), getAllTrades()]);
    const priceMap = {};
    prices.forEach(p => { priceMap[p.ticker] = { price: p.price, checked_at: p.checked_at }; });
    const enriched = watches.map(w => ({
      ...w,
      latest_price: priceMap[w.ticker]?.price ?? null,
      price_updated_at: priceMap[w.ticker]?.checked_at ?? null,
      open_trade: trades.find(t => t.ticker === w.ticker && t.status === 'HOLDING') ?? null,
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/watches/:ticker/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['ACTIVE', 'PAUSED', 'CANCELLED'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  await updateWatchStatus(req.params.ticker, status);
  res.json({ success: true });
});

// ─── Virtual trades endpoints ─────────────────────────────────────────────────
app.get('/api/trades', requireAuth, async (req, res) => {
  try {
    const trades = await getAllTrades();
    res.json(trades);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/trades/:ticker/close', requireAdmin, async (req, res) => {
  const { sellPrice, exitReason } = req.body;
  if (!sellPrice) return res.status(400).json({ error: 'sellPrice is required' });
  try {
    await closeVirtualTrade(req.params.ticker.toUpperCase(), sellPrice, exitReason || 'MANUAL');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Alerts endpoints ─────────────────────────────────────────────────────────
app.get('/api/alerts', requireAuth, async (req, res) => {
  try {
    const alerts = await getAlerts(100);
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/alerts/unread-count', requireAuth, async (req, res) => {
  try {
    const count = await getUnreadAlertCount();
    res.json({ count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alerts/mark-read', requireAuth, async (req, res) => {
  try {
    await markAllAlertsRead();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Portfolio endpoints (per-user) ───────────────────────────────────────────
app.get('/api/portfolio/transactions', requireAuth, async (req, res) => {
  try {
    const txs = await listPortfolioTransactions(req.user.id, {
      ticker: req.query.ticker,
      type:   req.query.type,
      status: req.query.status,
      from:   req.query.from,
      to:     req.query.to,
    });
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/portfolio/transactions', requireAuth, async (req, res) => {
  const tx = req.body || {};
  if (!tx.ticker || !tx.type || !tx.transaction_date) {
    return res.status(400).json({ error: 'ticker, type and transaction_date are required' });
  }
  const allowedTypes = ['BUY','SELL','DIVIDEND','SPLIT','BONUS'];
  if (!allowedTypes.includes(tx.type)) {
    return res.status(400).json({ error: `type must be one of ${allowedTypes.join(', ')}` });
  }
  const saved = await addPortfolioTransaction(req.user.id, tx);
  if (!saved) return res.status(500).json({ error: 'Failed to save transaction' });
  res.json(saved);
});

app.put('/api/portfolio/transactions/:id', requireAuth, async (req, res) => {
  const updated = await updatePortfolioTransaction(req.user.id, req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Transaction not found' });
  res.json(updated);
});

app.delete('/api/portfolio/transactions/:id', requireAuth, async (req, res) => {
  const ok = await deletePortfolioTransaction(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ success: true });
});

app.post('/api/portfolio/transactions/:id/confirm', requireAuth, async (req, res) => {
  const ok = await setTransactionStatus(req.user.id, req.params.id, 'confirmed');
  if (!ok) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ success: true });
});

app.post('/api/portfolio/transactions/:id/dismiss', requireAuth, async (req, res) => {
  const ok = await setTransactionStatus(req.user.id, req.params.id, 'dismissed');
  if (!ok) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ success: true });
});

app.get('/api/portfolio/holdings', requireAuth, async (req, res) => {
  try {
    const txs = await listPortfolioTransactions(req.user.id, { status: 'confirmed' });
    const tickers = [...new Set(txs.map(t => t.ticker))];
    const cmpMap = {};
    await Promise.all(tickers.map(async (t) => {
      try { cmpMap[t] = await fetchYahooPrice(t); } catch { cmpMap[t] = 0; }
    }));
    const holdings = computeHoldings(txs, cmpMap);
    const summary  = computePortfolioSummary(txs, cmpMap);
    res.json({ holdings, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Outcomes endpoints (shared data) ─────────────────────────────────────────
app.get('/api/outcomes', requireAuth, async (req, res) => {
  try { res.json(await getAllOutcomes()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/outcomes/:ticker', requireAuth, async (req, res) => {
  try { res.json(await getOutcomesByTicker(req.params.ticker)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Daily price check cron (call from cron-job.org at 4:30pm IST) ────────────
app.post('/api/cron/price-check', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const dbFns = {
      getActiveWatches, savePriceCheck,
      createAlert, openVirtualTrade, closeVirtualTrade, updateOpenTrades,
    };
    const results = await runDailyPriceCheck(dbFns);
    console.log(`[cron] Price check done: ${results.checked} tickers, ${results.alerts.length} alerts`);
    await sendAlert(`✅ *Daily Price Check Heartbeat*\nChecked: ${results.checked} tickers\nAlerts triggered: ${results.alerts.length}`);
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[cron] Price check failed:', err.message);
    await sendAlert(`❌ *Daily Price Check Failed*\nError: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: backfill watches from all saved analyses (run once) ──────────────
app.post('/api/admin/backfill-watches', requireAdmin, async (req, res) => {
  try {
    const analyses = await getAllAnalyses();
    const results = { created: 0, skipped: 0, errors: [] };
    for (const row of analyses) {
      try {
        const full = await getAnalysis(row.ticker);
        if (!full) { results.skipped++; continue; }
        const watch = extractWatchFromAnalysis(full);
        if (!watch.ticker) { results.skipped++; continue; }
        await upsertWatch(watch);
        results.created++;
      } catch (e) {
        results.errors.push({ ticker: row.ticker, error: e.message });
      }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Phase 5: structured-data endpoints ──────────────────────────────────────

app.get('/api/company/:ticker/financials', requireAuth, async (req, res) => {
  try {
    const bundle = await getCompanyBundle(req.params.ticker);
    if (!bundle) return res.status(404).json({ error: 'No data for ticker' });
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/ingest/:ticker', requireAdmin, async (req, res) => {
  try {
    const result = await ingestCompany(req.params.ticker, INGEST_DB_HELPERS);
    if (markIngested) {
      const ok = !result.errors || result.errors.length === 0;
      await markIngested(req.params.ticker, ok ? 'ok' : 'failed',
        ok ? null : JSON.stringify(result.errors).slice(0, 500));
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Phase 8: rankings ────────────────────────────────────────────────────────

app.get('/api/rankings', requireAuth, async (req, res) => {
  res.json(STRATEGY_LIST);
});

app.get('/api/rankings/:strategy', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const dataset = await getRankingDataset();
    const sectorMap = toSectorMap(await listSectors());
    const results = rankUniverse(req.params.strategy, dataset, sectorMap, limit);
    res.json({
      strategy: req.params.strategy,
      generatedAt: new Date().toISOString(),
      universeSize: dataset.length,
      count: results.length,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Phase 7: sector microtheory benchmarks (admin) ───────────────────────────
app.get('/api/admin/sectors', requireAdmin, async (req, res) => {
  res.json(await listSectors());
});

app.put('/api/admin/sectors/:sector', requireAdmin, async (req, res) => {
  const { primary_metric, roce_benchmark, roe_benchmark, notes } = req.body || {};
  if (primary_metric != null && !['roce', 'roe'].includes(primary_metric)) {
    return res.status(400).json({ error: "primary_metric must be 'roce' or 'roe'" });
  }
  for (const [k, v] of [['roce_benchmark', roce_benchmark], ['roe_benchmark', roe_benchmark]]) {
    if (v != null && (typeof v !== 'number' || v < 0 || !isFinite(v))) {
      return res.status(400).json({ error: `${k} must be a number >= 0` });
    }
  }
  const result = await updateSector(req.params.sector, { primary_metric, roce_benchmark, roe_benchmark, notes });
  if (result.error) return res.status(500).json(result);
  res.json(result);
});

app.post('/api/admin/sectors/seed', requireAdmin, async (req, res) => {
  const result = await seedSectors();
  if (result.error) return res.status(500).json(result);
  res.json(result);
});

// ─── Phase 9: corporate actions ───────────────────────────────────────────────
app.get('/api/corporate-actions/:ticker', requireAuth, async (req, res) => {
  res.json(await listCorporateActions(req.params.ticker, 'confirmed'));
});

app.get('/api/admin/corporate-actions', requireAdmin, async (req, res) => {
  const status = req.query.status || 'proposed';
  res.json(await listCorporateActionsByStatus(status));
});

app.post('/api/admin/corporate-actions', requireAdmin, async (req, res) => {
  const { ticker, event_type } = req.body || {};
  if (!ticker || !event_type) return res.status(400).json({ error: 'ticker and event_type required' });
  if (!EVENT_TYPES.includes(event_type)) return res.status(400).json({ error: 'invalid event_type' });
  const result = await createCorporateAction({ ...req.body, status: 'proposed', source: 'manual' });
  if (result.error) return res.status(500).json(result);
  res.json(result);
});

app.put('/api/admin/corporate-actions/:id', requireAdmin, async (req, res) => {
  const existing = await getCorporateAction(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.status !== 'proposed') return res.status(400).json({ error: 'can only edit proposed actions' });
  const result = await updateCorporateAction(req.params.id, req.body || {});
  if (result.error) return res.status(500).json(result);
  res.json(result);
});

app.post('/api/admin/corporate-actions/:id/confirm', requireAdmin, async (req, res) => {
  const action = await getCorporateAction(req.params.id);
  if (!action) return res.status(404).json({ error: 'not found' });
  if (action.status !== 'proposed') return res.status(400).json({ error: `already ${action.status}` });
  const v = validateConfirm(action);
  if (!v.ok) return res.status(400).json({ error: v.error });

  let applied = null;
  if (action.event_type === 'TICKER_CHANGE') {
    applied = await applyTickerChange(action.ticker, action.new_ticker, action.id, action.ex_date);
  } else if (action.event_type === 'NAME_CHANGE') {
    applied = await updateCompanyName(action.ticker, action.new_name);
  }
  await setCorporateActionStatus(req.params.id, 'confirmed', { applied_at: new Date().toISOString() });
  res.json({ confirmed: true, applied });
});

app.post('/api/admin/corporate-actions/:id/dismiss', requireAdmin, async (req, res) => {
  const result = await setCorporateActionStatus(req.params.id, 'dismissed');
  if (result.error) return res.status(500).json(result);
  res.json({ dismissed: true });
});

// ─── Phase 5.2: universe master CRUD ─────────────────────────────────────────

app.post('/api/admin/universe/load-nifty500', requireAdmin, async (req, res) => {
  try {
    const csvPath = pathMod.join(__dirname, 'data', 'nifty500.csv');
    const text = await fsPromises.readFile(csvPath, 'utf8');
    const lines = text.split(/\r?\n/).slice(1).filter(Boolean); // skip header
    const rows = [];
    for (const line of lines) {
      // CSV: Company Name,Industry,Symbol  (company names may contain commas → split from the right)
      const lastComma = line.lastIndexOf(',');
      const firstComma = line.indexOf(',');
      if (lastComma === -1 || firstComma === lastComma) continue;
      const company_name = line.slice(0, firstComma).trim();
      const sector       = line.slice(firstComma + 1, lastComma).trim();
      const symbol       = line.slice(lastComma + 1).trim();
      if (!symbol || /^DUMMY/i.test(symbol)) continue; // skip dummy rows
      rows.push({ ticker: symbol, company_name, sector });
    }
    const result = await seedCompanies(rows);
    res.json({ success: true, parsed: rows.length, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/universe/seed', requireAdmin, async (req, res) => {
  try {
    const raw = req.body?.tickers || '';
    const tickers = raw.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
    if (!tickers.length) return res.status(400).json({ error: 'No tickers provided' });
    const result = await seedCompanies(tickers.map(t => ({ ticker: t })));
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/universe', requireAdmin, async (req, res) => {
  try { res.json(await listCompanies()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/universe/company', requireAdmin, async (req, res) => {
  const { ticker, company_name, sector } = req.body || {};
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  const result = await seedCompanies([{ ticker, company_name, sector }]);
  res.json({ success: true, ...result });
});

app.put('/api/admin/universe/company/:ticker', requireAdmin, async (req, res) => {
  const updated = await updateCompany(req.params.ticker, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Company not found' });
  res.json(updated);
});

app.delete('/api/admin/universe/company/:ticker', requireAdmin, async (req, res) => {
  const ok = await deleteCompany(req.params.ticker, req.query.hard === 'true');
  if (!ok) return res.status(404).json({ error: 'Company not found' });
  res.json({ success: true });
});

app.post('/api/admin/universe/company/:ticker/rename', requireAdmin, async (req, res) => {
  const newTicker = req.body?.newTicker;
  if (!newTicker) return res.status(400).json({ error: 'newTicker required' });
  const result = await renameTickerCascade(req.params.ticker, newTicker);
  res.json(result);
});

// ─── Phase 5.2: bulk ingestion + coverage ────────────────────────────────────

app.post('/api/admin/ingest/bulk', requireAdmin, async (req, res) => {
  if (getBulkState().running) {
    return res.status(409).json({ error: 'A bulk run is already in progress', state: getBulkState() });
  }
  let tickers = req.body?.tickers;
  if (!Array.isArray(tickers) || tickers.length === 0) {
    // default: all stale, capped
    const limit = Number(req.body?.limit) || 50;
    tickers = await getStaleCompanies(limit);
  } else {
    tickers = tickers.map(t => String(t).toUpperCase());
  }
  // fire-and-forget: start in background, respond immediately
  runBulkIngestion(tickers, INGEST_DB_HELPERS).catch(e => console.error('bulk run error:', e.message));
  res.json({ started: true, count: tickers.length });
});

app.get('/api/admin/ingest/status', requireAdmin, async (req, res) => {
  res.json(getBulkState());
});

app.get('/api/admin/coverage', requireAdmin, async (req, res) => {
  try {
    const coverage = await getCoverage();
    const summary = {
      total: coverage.length,
      ok: coverage.filter(c => c.ingest_status === 'ok').length,
      failed: coverage.filter(c => c.ingest_status === 'failed').length,
      pending: coverage.filter(c => c.ingest_status === 'pending' || !c.ingest_status).length,
    };
    res.json({ summary, coverage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cron/ingest-universe', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (getBulkState().running) {
    return res.json({ skipped: true, reason: 'already running' });
  }
  const batch = Number(process.env.INGEST_BATCH_SIZE) || 50;
  const tickers = await getStaleCompanies(batch);
  
  runBulkIngestion(tickers, INGEST_DB_HELPERS)
    .then(async (state) => {
      const coverage = await getCoverage();
      const total = coverage.length;
      const ok = coverage.filter(c => c.ingest_status === 'ok').length;
      const failed = coverage.filter(c => c.ingest_status === 'failed').length;
      const okPct = total > 0 ? (ok / total) * 100 : 100;
      
      let msg = `✅ *Universe Ingestion Heartbeat*\nTickers processed in this batch: ${state.done}\nFailed in this batch: ${state.failed}\nOverall coverage: ${ok}/${total} (${okPct.toFixed(1)}% OK)`;
      
      if (okPct < 85) {
        msg = `⚠️ *Scrape Coverage Alert*\nOverall coverage has dropped to *${okPct.toFixed(1)}%* (${ok} OK, ${failed} failed out of ${total} total active companies).\n` + msg;
      }
      await sendAlert(msg);
    })
    .catch(async (e) => {
      console.error('cron bulk error:', e.message);
      await sendAlert(`❌ *Universe Ingestion Failed*\nError: ${e.message}`);
    });

  res.json({ started: true, batch: tickers.length });
});

app.post('/api/cron/ingest-daily-prices', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (getDailyPricesState().running) {
    return res.status(409).json({ error: 'Already running' });
  }
  const tickers = await getActiveTickersInUniverse();
  if (!tickers.includes('^NSEI')) {
    tickers.push('^NSEI');
  }
  
  runDailyPricesIngestion(tickers, { getLastPriceDate, upsertDailyPrices })
    .then(async (result) => {
      await sendAlert(`✅ *Daily Prices Ingestion Heartbeat*\nTickers processed: ${result.done}\nFailed: ${result.failed}\nSkipped: ${result.skipped}`);
    })
    .catch(async (e) => {
      console.error('[cron] daily prices error:', e.message);
      await sendAlert(`❌ *Daily Prices Ingestion Failed*\nError: ${e.message}`);
    });

  res.status(202).json({ started: true, tickers: tickers.length });
});

app.post('/api/cron/paper-trade-tick', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const tickDate = req.body?.date || new Date().toISOString().split('T')[0];
  const summaryAlerts = [];

  try {
    // 1. Fetch ranking dataset and construct maps
    const rankingDataset = await getRankingDataset();
    const freshRowsByTicker = {};
    const pricesByTicker = {};
    for (const r of rankingDataset) {
      freshRowsByTicker[r.ticker] = r;
      pricesByTicker[r.ticker] = r.current_price;
    }

    // 2. Fetch Nifty 50 close price for tickDate
    const nifty50Price = await getPriceOnDate('^NSEI', tickDate);
    pricesByTicker['^NSEI'] = nifty50Price;

    // 3. Fetch sector benchmarks
    const sectorRows = await listSectors();
    const sectorBenchmarks = toSectorMap(sectorRows);

    // 4. Run tick for each strategy key
    const strategies = ['marshall_undervalued', 'quality_compounders', 'deep_value', 'high_growth'];
    for (const strategyKey of strategies) {
      // Load meta or auto-initialize
      let meta = await getPaperBookMeta(strategyKey);
      if (!meta) {
        meta = { strategy_key: strategyKey, inception_date: tickDate, initial_capital: 1500000 };
        await savePaperBookMeta(meta);
      }

      const initialCapital = Number(meta.initial_capital);

      // Load transactions
      const openTrades = await getPaperTrades(strategyKey, 'OPEN');
      const closedTrades = await getPaperTrades(strategyKey, 'CLOSED');

      // Decide exits
      const exits = decideExits(openTrades, freshRowsByTicker, sectorBenchmarks, pricesByTicker, tickDate);

      // Remaining open positions
      const remainingOpenTrades = openTrades.filter(t => !exits.some(e => e.id === t.id));

      // Calculate cash balance (including today's newly closed trades)
      const allClosedTrades = closedTrades.concat(exits);
      const openCost = remainingOpenTrades.length * 100000;
      const realizedPnL = allClosedTrades.reduce((sum, t) => sum + (t.exit_price * t.shares - 100000), 0);
      const cash = initialCapital - openCost + realizedPnL;

      // Free slots
      const freeSlots = Math.min(15 - remainingOpenTrades.length, Math.floor(cash / 100000));

      // Fetch top ranked rows
      const rankedRows = rankUniverse(strategyKey, rankingDataset, sectorBenchmarks, 15);

      // Decide entries
      const entries = decideEntries(strategyKey, rankedRows, remainingOpenTrades.map(t => t.ticker), freeSlots, pricesByTicker, tickDate);

      // Apply tick to get current book value & updated open trades (re-allocating cash for entries)
      const finalOpenTrades = remainingOpenTrades.concat(entries);
      const cashForTick = cash - (entries.length * 100000);
      const { updatedTrades, bookValue } = applyTick(finalOpenTrades, cashForTick, pricesByTicker, tickDate);

      // Benchmark Return
      const inceptionNifty = await getPriceOnDate('^NSEI', meta.inception_date);
      const benchmarkReturnPct = (inceptionNifty > 0 && nifty50Price > 0) ? (nifty50Price / inceptionNifty) - 1 : 0;
      const bookReturnPct = (bookValue / initialCapital) - 1;

      // Prepare daily log snapshot
      const snapshot = {
        strategy_key: strategyKey,
        date: tickDate,
        book_value: bookValue,
        book_return_pct: Number(bookReturnPct.toFixed(4)),
        nifty50_return_pct: Number(benchmarkReturnPct.toFixed(4)),
        open_positions: updatedTrades.length
      };

      // Save transactions & snapshot to database
      if (exits.length > 0) {
        await savePaperTrades(exits);
      }
      if (updatedTrades.length > 0) {
        await savePaperTrades(updatedTrades);
      }
      await savePaperBookDaily(snapshot);

      // Format summary alert details
      const changePct = bookReturnPct * 100;
      const benchChangePct = benchmarkReturnPct * 100;
      const label = STRATEGY_LIST.find(s => s.key === strategyKey)?.label || strategyKey;

      const boughtList = entries.map(e => e.ticker).join(', ') || 'None';
      const soldList = exits.map(e => `${e.ticker} (${e.exit_reason})`).join(', ') || 'None';

      summaryAlerts.push(
        `📈 *${label}*\n` +
        `• Value: ₹${(bookValue / 100000).toFixed(2)}L (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% vs Nifty ${benchChangePct >= 0 ? '+' : ''}${benchChangePct.toFixed(2)}%)\n` +
        `• Active positions: ${updatedTrades.length}/15 (Cash: ₹${(cashForTick / 100000).toFixed(2)}L)\n` +
        `• Bought: ${boughtList}\n` +
        `• Sold: ${soldList}`
      );
    }

    // Send Telegram alert
    const alertMsg = `🏁 *Daily Paper-Trade Simulation Tick (${tickDate})*\n\n` + summaryAlerts.join('\n\n');
    await sendAlert(alertMsg);

    res.json({ success: true, date: tickDate, message: 'Paper trading tick executed' });
  } catch (err) {
    console.error('[cron] paper-trade-tick error:', err.message);
    await sendAlert(`❌ *Paper-Trade Tick Failed*\nDate: ${tickDate}\nError: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/cron/propose-corporate-actions', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (getCorporateActionsProposalState().running) {
    return res.status(409).json({ error: 'Already running' });
  }
  const tickers = await getActiveTickersInUniverse();
  
  runCorporateActionsProposal(tickers, { corporateActionExists, createCorporateAction })
    .then(async (result) => {
      await sendAlert(`✅ *Corporate Actions Proposal Heartbeat*\nTickers processed: ${result.done}\nFailed: ${result.failed}\nSkipped: ${result.skipped}`);
    })
    .catch(async (e) => {
      console.error('[cron] corporate actions proposal error:', e.message);
      await sendAlert(`❌ *Corporate Actions Proposal Failed*\nError: ${e.message}`);
    });

  res.status(202).json({ started: true, tickers: tickers.length });
});

// ─── Admin: backfill analysis outcomes (historical returns) ──────────────────
app.post('/api/admin/backfill-outcomes', requireAdmin, async (req, res) => {
  try {
    const https = require('https');
    const analyses = await getAllAnalyses();
    const results = { computed: 0, skipped: 0, errors: [] };

    const chartCache = {};
    const fetchChart5y = (ticker) => new Promise((resolve, reject) => {
      if (chartCache[ticker]) return resolve(chartCache[ticker]);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.toUpperCase()}.NS?interval=1d&range=5y`;
      https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        timeout: 15000,
      }, (rs) => {
        let data = '';
        rs.on('data', c => data += c);
        rs.on('end', () => {
          try {
            const j = JSON.parse(data);
            const r = j?.chart?.result?.[0];
            const ts = r?.timestamp || [];
            const closes = r?.indicators?.quote?.[0]?.close || [];
            const seriesArr = ts.map((t, i) => ({
              date: new Date(t * 1000).toISOString().split('T')[0],
              close: closes[i],
            })).filter(p => p.close != null);
            chartCache[ticker] = seriesArr;
            resolve(seriesArr);
          } catch (e) { reject(e); }
        });
      }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
    });

    for (const row of analyses) {
      try {
        const full = await getAnalysis(row.ticker);
        if (!full) { results.skipped++; continue; }
        const seriesArr = await fetchChart5y(full.ticker);
        const out = computeOutcome(full.ticker, full.analysisDate, seriesArr, full.gate3);
        const er = (full.gate3?.entryZone || '').replace(/[₹,\s]/g, '').match(/(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)/);
        out.verdict    = full.overallVerdict || null;
        out.entry_low  = er ? parseFloat(er[1]) : null;
        out.entry_high = er ? parseFloat(er[2]) : null;
        const saved = await upsertOutcome(out);
        if (saved) results.computed++;
      } catch (e) {
        results.errors.push({ ticker: row.ticker, error: e.message });
      }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: backfill confidence scores onto all existing analyses ────────────
app.post('/api/admin/backfill-confidence', requireAdmin, async (req, res) => {
  try {
    const analyses = await getAllAnalyses();
    const results = { updated: 0, errors: [], bands: { HIGH: 0, MEDIUM: 0, LOW: 0 } };
    for (const row of analyses) {
      try {
        const full = await getAnalysis(row.ticker);
        if (!full) continue;
        // Run sanity verification on saved values (no API calls). Older analyses
        // won't have citations or rawData, so consensus/freshness/citation will
        // be empty — but sanity still works on saved numbers.
        verifyAnalysis(full, []);
        const confidence = computeConfidenceScore(full);
        full.confidence = confidence;
        await saveAnalysis(full);
        await saveFundamentalMetrics(full);
        cache.del(`analysis_${row.ticker}`);
        results.updated++;
        results.bands[confidence.band]++;
      } catch (e) {
        results.errors.push({ ticker: row.ticker, error: e.message });
      }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: backfill fundamental_metrics from all saved analyses ──────────────
app.post('/api/admin/backfill-metrics', requireAdmin, async (req, res) => {
  try {
    const analyses = await getAllAnalyses();
    const results = { saved: 0, skipped: 0, errors: [] };
    for (const row of analyses) {
      try {
        const full = await getAnalysis(row.ticker);
        if (!full) { results.skipped++; continue; }
        await saveFundamentalMetrics(full);
        results.saved++;
      } catch (e) {
        results.errors.push({ ticker: row.ticker, error: e.message });
      }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/paper-trading/stats', requireAuth, async (req, res) => {
  try {
    const strategies = ['marshall_undervalued', 'quality_compounders', 'deep_value', 'high_growth'];
    const results = {};

    for (const strategyKey of strategies) {
      const meta = await getPaperBookMeta(strategyKey);
      if (!meta) {
        results[strategyKey] = { initialized: false };
        continue;
      }

      const openTrades = await getPaperTrades(strategyKey, 'OPEN');
      const closedTrades = await getPaperTrades(strategyKey, 'CLOSED');
      const equityCurve = await getPaperBookDaily(strategyKey);

      // Get benchmark info
      let benchmarkInfo = null;
      if (equityCurve.length > 0) {
        const inceptionNifty = await getPriceOnDate('^NSEI', meta.inception_date);
        const latestNifty = await getPriceOnDate('^NSEI', equityCurve[equityCurve.length - 1].date);
        benchmarkInfo = {
          inception_benchmark_price: inceptionNifty,
          latest_benchmark_price: latestNifty
        };
      }

      const metrics = computeBookMetrics(closedTrades, equityCurve, benchmarkInfo);

      results[strategyKey] = {
        initialized: true,
        meta,
        openPositions: openTrades,
        closedTrades,
        equityCurve,
        metrics
      };
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Load demo analyses on startup ───────────────────────────────────────────
const DEMO_ANALYSES = require('./demoAnalyses');
async function loadDemoAnalyses() {
  for (const [ticker, analysis] of Object.entries(DEMO_ANALYSES)) {
    cache.set(`analysis_${ticker}`, analysis);
    const existing = await getAnalysis(ticker);
    if (!existing) {
      await saveAnalysis(analysis);
      console.log(`  📥 Saved demo: ${ticker}`);
    }
  }
  console.log(`✅ ${Object.keys(DEMO_ANALYSES).length} demo analyses ready`);
}
loadDemoAnalyses();

// ─── Catch-all: serve React app ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, './client/build/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🟢 Fundamental Agent API on http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${process.env.ANTHROPIC_API_KEY ? '✅' : '❌ Missing'}`);
  console.log(`📦 Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌ Missing'}`);
  console.log(`🔐 Auth: ${process.env.SUPABASE_SERVICE_KEY ? '✅' : '❌ Missing'}\n`);
});
