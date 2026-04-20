const { createClient } = require('@supabase/supabase-js');

let supabase = null;
let supabaseAdmin = null;

function getClient() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) { console.error('❌ SUPABASE_URL or SUPABASE_ANON_KEY not configured'); return null; }
  supabase = createClient(url, key);
  console.log('✅ Supabase client ready');
  return supabase;
}

function getAdminClient() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return getClient();
  supabaseAdmin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return supabaseAdmin;
}

async function connectDB() { return getClient(); }

async function saveAnalysis(analysis) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const quarter = getCurrentQuarter();
    const { error } = await db.from('analyses').upsert(
      { ticker: analysis.ticker.toUpperCase(), quarter, data: analysis, saved_at: new Date().toISOString() },
      { onConflict: 'ticker,quarter' }
    );
    if (error) throw error;
    console.log(`💾 Saved analysis for ${analysis.ticker} (${quarter})`);
    return true;
  } catch (err) {
    console.error('Save analysis error:', err.message);
    return false;
  }
}

async function getAnalysis(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db
      .from('analyses').select('data, saved_at')
      .eq('ticker', ticker.toUpperCase())
      .order('saved_at', { ascending: false })
      .limit(1).single();
    if (error || !data) return null;
    return { ...data.data, savedAt: data.saved_at };
  } catch (err) {
    console.error('Get analysis error:', err.message);
    return null;
  }
}

async function getAllAnalyses() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db
      .from('analyses').select('ticker, quarter, saved_at, data')
      .order('saved_at', { ascending: false });
    if (error) throw error;
    const seen = new Set();
    return (data || []).filter(row => {
      if (seen.has(row.ticker)) return false;
      seen.add(row.ticker);
      return true;
    }).map(row => ({
      ticker: row.ticker, quarter: row.quarter, savedAt: row.saved_at,
      company: row.data?.company, analysisDate: row.data?.analysisDate,
      overallVerdict: row.data?.overallVerdict, targetEntryPrice: row.data?.targetEntryPrice,
      gate1Verdict: row.data?.gate1?.verdict, gate2aVerdict: row.data?.gate2a?.verdict,
      gate2bVerdict: row.data?.gate2b?.verdict, gate2cVerdict: row.data?.gate2c?.verdict,
      gate3Verdict: row.data?.gate3?.verdict,
    }));
  } catch (err) {
    console.error('Get all analyses error:', err.message);
    return [];
  }
}

async function getAnalysisHistory(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db
      .from('analyses').select('data, saved_at, quarter')
      .eq('ticker', ticker.toUpperCase())
      .order('saved_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(row => ({ ...row.data, savedAt: row.saved_at, quarter: row.quarter }));
  } catch (err) {
    console.error('Get history error:', err.message);
    return [];
  }
}

async function deleteAnalysis(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('analyses').delete().eq('ticker', ticker.toUpperCase());
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Delete error:', err.message);
    return false;
  }
}

// ─── Profile functions ────────────────────────────────────────────────────────
async function getProfile(userId) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db.from('profiles').select('*').eq('id', userId).single();
    if (error) return null;
    return data;
  } catch (err) {
    console.error('Get profile error:', err.message);
    return null;
  }
}

async function updateProfile(userId, updates) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db.from('profiles')
      .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Update profile error:', err.message);
    return null;
  }
}

// ─── Watchlist functions ──────────────────────────────────────────────────────
async function getWatchlist(userId) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('watchlist')
      .select('*').eq('user_id', userId).order('added_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Get watchlist error:', err.message);
    return [];
  }
}

async function addToWatchlist(userId, ticker, company) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db.from('watchlist')
      .upsert({ user_id: userId, ticker: ticker.toUpperCase(), company }, { onConflict: 'user_id,ticker' })
      .select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Add to watchlist error:', err.message);
    return null;
  }
}

async function removeFromWatchlist(userId, ticker) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('watchlist')
      .delete().eq('user_id', userId).eq('ticker', ticker.toUpperCase());
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Remove from watchlist error:', err.message);
    return false;
  }
}

function getCurrentQuarter() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 4 && month <= 6)  return `Q1FY${String(year + 1).slice(2)}`;
  if (month >= 7 && month <= 9)  return `Q2FY${String(year + 1).slice(2)}`;
  if (month >= 10 && month <= 12) return `Q3FY${String(year + 1).slice(2)}`;
  return `Q4FY${String(year).slice(2)}`;
}

// ─── Watches ──────────────────────────────────────────────────────────────────

async function upsertWatch(watchData) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db.from('watches')
      .upsert({ ...watchData, updated_at: new Date().toISOString() }, { onConflict: 'ticker' })
      .select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Upsert watch error:', err.message);
    return null;
  }
}

async function getActiveWatches() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('watches').select('*').eq('status', 'ACTIVE').order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Get active watches error:', err.message);
    return [];
  }
}

async function getAllWatches() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('watches').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Get all watches error:', err.message);
    return [];
  }
}

async function updateWatchStatus(ticker, status) {
  try {
    const db = getAdminClient();
    if (!db) return;
    await db.from('watches').update({ status, updated_at: new Date().toISOString() }).eq('ticker', ticker.toUpperCase());
  } catch (err) {
    console.error('Update watch status error:', err.message);
  }
}

// ─── Price checks ─────────────────────────────────────────────────────────────

async function savePriceCheck(ticker, price) {
  try {
    const db = getAdminClient();
    if (!db) return;
    await db.from('price_checks').insert({ ticker: ticker.toUpperCase(), price, checked_at: new Date().toISOString() });
  } catch (err) {
    console.error('Save price check error:', err.message);
  }
}

async function getLatestPrices() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data } = await db.from('price_checks').select('ticker, price, checked_at').order('checked_at', { ascending: false });
    const seen = new Set();
    return (data || []).filter(r => { if (seen.has(r.ticker)) return false; seen.add(r.ticker); return true; });
  } catch (err) {
    console.error('Get latest prices error:', err.message);
    return [];
  }
}

// ─── Virtual trades ───────────────────────────────────────────────────────────

async function openVirtualTrade(ticker, company, buyPrice) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data: existing } = await db.from('virtual_trades').select('id').eq('ticker', ticker.toUpperCase()).eq('status', 'HOLDING');
    if (existing?.length > 0) return null; // already have open position
    const { data, error } = await db.from('virtual_trades').insert({
      ticker: ticker.toUpperCase(), company,
      buy_price: buyPrice, buy_date: new Date().toISOString().split('T')[0],
      current_price: buyPrice, pnl_pct: 0,
    }).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Open virtual trade error:', err.message);
    return null;
  }
}

async function closeVirtualTrade(ticker, sellPrice, exitReason) {
  try {
    const db = getAdminClient();
    if (!db) return;
    const { data: trades } = await db.from('virtual_trades').select('*').eq('ticker', ticker.toUpperCase()).eq('status', 'HOLDING');
    for (const trade of (trades || [])) {
      const pnl = ((sellPrice - trade.buy_price) / trade.buy_price) * 100;
      await db.from('virtual_trades').update({
        sell_price: sellPrice, sell_date: new Date().toISOString().split('T')[0],
        exit_reason: exitReason, status: 'SOLD',
        current_price: sellPrice, pnl_pct: parseFloat(pnl.toFixed(2)),
        last_updated: new Date().toISOString(),
      }).eq('id', trade.id);
    }
  } catch (err) {
    console.error('Close virtual trade error:', err.message);
  }
}

async function updateOpenTrades(ticker, currentPrice) {
  try {
    const db = getAdminClient();
    if (!db) return;
    const { data: trades } = await db.from('virtual_trades').select('*').eq('ticker', ticker.toUpperCase()).eq('status', 'HOLDING');
    for (const trade of (trades || [])) {
      const pnl = ((currentPrice - trade.buy_price) / trade.buy_price) * 100;
      await db.from('virtual_trades').update({
        current_price: currentPrice, pnl_pct: parseFloat(pnl.toFixed(2)),
        last_updated: new Date().toISOString(),
      }).eq('id', trade.id);
    }
  } catch (err) {
    console.error('Update open trades error:', err.message);
  }
}

async function getAllTrades() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('virtual_trades').select('*').order('buy_date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Get all trades error:', err.message);
    return [];
  }
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

async function createAlert(ticker, company, alertType, message, triggeredPrice) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    // Deduplicate: no same ticker+type alert on same calendar day
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await db.from('alerts')
      .select('id').eq('ticker', ticker.toUpperCase()).eq('alert_type', alertType)
      .gte('created_at', today + 'T00:00:00Z');
    if (existing?.length > 0) return null;
    const { data, error } = await db.from('alerts').insert({
      ticker: ticker.toUpperCase(), company, alert_type: alertType,
      message, triggered_price: triggeredPrice,
    }).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Create alert error:', err.message);
    return null;
  }
}

async function getAlerts(limit = 100) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('alerts').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Get alerts error:', err.message);
    return [];
  }
}

async function getUnreadAlertCount() {
  try {
    const db = getAdminClient();
    if (!db) return 0;
    const { count } = await db.from('alerts').select('id', { count: 'exact', head: true }).eq('is_read', false);
    return count || 0;
  } catch (err) {
    return 0;
  }
}

async function markAllAlertsRead() {
  try {
    const db = getAdminClient();
    if (!db) return;
    await db.from('alerts').update({ is_read: true }).eq('is_read', false);
  } catch (err) {
    console.error('Mark alerts read error:', err.message);
  }
}

module.exports = {
  connectDB, saveAnalysis, getAnalysis, getAllAnalyses, getAnalysisHistory, deleteAnalysis,
  getProfile, updateProfile, getWatchlist, addToWatchlist, removeFromWatchlist, getCurrentQuarter,
  // tracking
  upsertWatch, getActiveWatches, getAllWatches, updateWatchStatus,
  savePriceCheck, getLatestPrices,
  openVirtualTrade, closeVirtualTrade, updateOpenTrades, getAllTrades,
  createAlert, getAlerts, getUnreadAlertCount, markAllAlertsRead,
};
