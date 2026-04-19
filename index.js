require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { runMarshallAnalysis, runUpdateAnalysis, lookupCompany } = require('./agent');
const {
  connectDB, saveAnalysis, getAnalysis,
  getAllAnalyses, getAnalysisHistory, deleteAnalysis,
  getProfile, updateProfile, getWatchlist, addToWatchlist, removeFromWatchlist
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
  const profile = await getProfile(req.user.id);
  res.json(profile || {});
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const result = await updateProfile(req.user.id, req.body);
  res.json(result);
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
