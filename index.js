require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { runMarshallAnalysis, runUpdateAnalysis, lookupCompany } = require('./agent');
const { extractWatchFromAnalysis, runDailyPriceCheck } = require('./priceCheck');
const {
  connectDB, saveAnalysis, getAnalysis,
  getAllAnalyses, getAnalysisHistory, deleteAnalysis,
  getProfile, updateProfile, getWatchlist, addToWatchlist, removeFromWatchlist,
  upsertWatch, getActiveWatches, getAllWatches, updateWatchStatus,
  savePriceCheck, getLatestPrices,
  openVirtualTrade, closeVirtualTrade, updateOpenTrades, getAllTrades,
  createAlert, getAlerts, getUnreadAlertCount, markAllAlertsRead,
} = require('./db');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'rajendra.amil@gmail.com';

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
app.get('/api/health', (req, res) => {
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
  const { ticker, companyName, forceRefresh } = req.body;
  if (!ticker || !companyName) return res.status(400).json({ error: 'ticker and companyName are required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

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
    sendProgress({ stage: 'starting', message: `Starting analysis for ${companyName}...`, progress: 5 });
    const result = await runMarshallAnalysis(ticker, companyName, sendProgress);
    if (result.success) {
      await saveAnalysis(result.analysis);
      cache.set(`analysis_${ticker.toUpperCase()}`, result.analysis);
      // Auto-create/update watch with entry zone from this analysis
      try {
        const watch = extractWatchFromAnalysis(result.analysis);
        if (watch.ticker) await upsertWatch(watch);
      } catch (e) { console.error('Auto-watch error:', e.message); }
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
  const { companyName } = req.body;
  if (!companyName) return res.status(400).json({ error: 'companyName is required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

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
    const result = await runUpdateAnalysis(ticker, companyName, existing, sendProgress);
    if (result.success) {
      await saveAnalysis(result.analysis);
      cache.set(`analysis_${ticker}`, result.analysis);
      // Update watch with fresh prices from quarterly update
      try {
        const watch = extractWatchFromAnalysis(result.analysis);
        if (watch.ticker) await upsertWatch(watch);
      } catch (e) { console.error('Auto-watch update error:', e.message); }
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
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[cron] Price check failed:', err.message);
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
