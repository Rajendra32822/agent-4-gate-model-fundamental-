const { createClient } = require('@supabase/supabase-js');
const { SECTOR_SEED } = require('./sectorSeed');
const { TICKER_KEYED_TABLES, parseCorporateActionFromText, resolveChain } = require('./corporateActions');

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

async function checkConnection() {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { data, error } = await db.from('companies').select('ticker').limit(1);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Database connection check failed:', err.message);
    return false;
  }
}

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
    ticker = await resolveTicker(ticker);
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

// ─── Fundamental Metrics ──────────────────────────────────────────────────────

function parseMetricNum(str) {
  if (str === null || str === undefined) return null;
  const cleaned = String(str).replace(/[₹,×%\sCr]/g, '').replace(/[^0-9.-]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

async function saveFundamentalMetrics(analysis) {
  try {
    const db = getAdminClient();
    if (!db) return;

    const g2a = analysis.gate2a?.metrics || {};
    const g2c = analysis.gate2c?.indicators || {};
    const g3  = analysis.gate3?.metrics || {};
    const g3s = analysis.gate3?.valuationScenarios || {};

    const row = {
      ticker:               analysis.ticker?.toUpperCase(),
      analysis_date:        analysis.analysisDate || new Date().toISOString().split('T')[0],
      company:              analysis.company,
      sector:               analysis.gate1?.parameters?.industry || null,
      overall_verdict:      analysis.overallVerdict,
      gate3_verdict:        analysis.gate3?.verdict,
      financials_type:      analysis.gate2a?.financialsType || 'UNKNOWN',
      data_confidence:      analysis.gate2a?.dataConfidence || 'MEDIUM',
      data_sources_count:   analysis.rawDataSources || null,

      // Gate 2a quantitative metrics
      roce_pct:             parseMetricNum(g2a.roce5yr?.value),
      roce_confidence:      g2a.roce5yr?.confidence || null,
      roce_years_of_data:   g2a.roce5yr?.yearsOfData || null,
      roce_fiscal_year:     g2a.roce5yr?.fiscalYear || null,
      roe_pct:              parseMetricNum(g2a.roeLast?.value),
      revenue_cagr_pct:     parseMetricNum(g2a.revenueCAGR5yr?.value),
      pat_cagr_pct:         parseMetricNum(g2a.patCAGR5yr?.value),
      debt_equity:          parseMetricNum(g2a.debtEquity?.value),
      promoter_pledge_pct:  parseMetricNum(g2a.promoterPledge?.value),
      ocf_quality_pct:      parseMetricNum(g2a.ocfQuality?.value),

      // Gate 2c
      promoter_holding_pct: parseMetricNum(g2c.promoterHolding?.value),

      // Gate 3 valuation
      current_price:        parseMetricNum(g3.currentPrice),
      market_cap_cr:        parseMetricNum(g3.marketCap),
      ev_oi_x:              parseMetricNum(g3.evOI?.value),
      mcap_fcf_x:           parseMetricNum(g3.mcapFCF?.value),
      price_book:           parseMetricNum(g3.priceBook?.value),
      pe_ratio:             parseMetricNum(g3.peRatio?.value),
      dividend_yield_pct:   parseMetricNum(g3.dividendYield?.value),
      net_cash_cr:          parseMetricNum(g3.netCash?.value),

      // Valuation scenarios
      bear_case_price:      parseMetricNum(g3s.bearCase?.price),
      base_case_price:      parseMetricNum(g3s.baseCase?.price),
      bull_case_price:      parseMetricNum(g3s.bullCase?.price),

      // Entry zone
      entry_zone_low:       null,
      entry_zone_high:      null,

      // Data quality confidence (added 2026-05-17)
      confidence_score:     analysis.confidence?.score ?? null,
      confidence_band:      analysis.confidence?.band  ?? null,
    };

    // Parse entry zone "₹1,200–1,500" → low=1200, high=1500
    if (analysis.gate3?.entryZone) {
      const m = analysis.gate3.entryZone.replace(/,/g, '').match(/(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)/);
      if (m) { row.entry_zone_low = parseFloat(m[1]); row.entry_zone_high = parseFloat(m[2]); }
    }

    const { error } = await db.from('fundamental_metrics')
      .upsert(row, { onConflict: 'ticker,analysis_date' });
    if (error) throw error;
    console.log(`📊 Saved fundamental metrics for ${analysis.ticker}`);
  } catch (err) {
    console.error('Save fundamental metrics error:', err.message);
  }
}

async function getMetricsHistory(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('fundamental_metrics')
      .select('*').eq('ticker', ticker.toUpperCase())
      .order('analysis_date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Get metrics history error:', err.message);
    return [];
  }
}

async function getAllMetricsLatest() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('fundamental_metrics')
      .select('*').order('analysis_date', { ascending: false });
    if (error) throw error;
    // deduplicate: latest per ticker
    const seen = new Set();
    return (data || []).filter(r => { if (seen.has(r.ticker)) return false; seen.add(r.ticker); return true; });
  } catch (err) {
    console.error('Get all metrics error:', err.message);
    return [];
  }
}

// ─── Portfolio transactions (per-user) ────────────────────────────────────────

async function addPortfolioTransaction(userId, tx) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const row = {
      user_id: userId,
      ticker: tx.ticker?.toUpperCase(),
      company: tx.company ?? null,
      type: tx.type,
      quantity: tx.quantity != null ? Number(tx.quantity) : null,
      price:    tx.price    != null ? Number(tx.price)    : null,
      amount:   tx.amount   != null ? Number(tx.amount)   :
                (tx.quantity != null && tx.price != null
                  ? Number(tx.quantity) * Number(tx.price)
                  : null),
      ratio: tx.ratio ?? null,
      transaction_date: tx.transaction_date,
      notes: tx.notes ?? null,
      source: tx.source || 'manual',
      status: tx.status || 'confirmed',
    };
    const { data, error } = await db.from('portfolio_transactions').insert(row).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('addPortfolioTransaction error:', err.message);
    return null;
  }
}

async function listPortfolioTransactions(userId, filters = {}) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    let q = db.from('portfolio_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false });
    if (filters.ticker) q = q.eq('ticker', filters.ticker.toUpperCase());
    if (filters.type)   q = q.eq('type', filters.type);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.from)   q = q.gte('transaction_date', filters.from);
    if (filters.to)     q = q.lte('transaction_date', filters.to);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listPortfolioTransactions error:', err.message);
    return [];
  }
}

async function updatePortfolioTransaction(userId, id, updates) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const allowed = ['ticker','company','type','quantity','price','amount','ratio','transaction_date','notes','status'];
    const row = {};
    for (const k of allowed) if (k in updates) row[k] = updates[k];
    const { data, error } = await db.from('portfolio_transactions')
      .update(row).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('updatePortfolioTransaction error:', err.message);
    return null;
  }
}

async function deletePortfolioTransaction(userId, id) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('portfolio_transactions')
      .delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('deletePortfolioTransaction error:', err.message);
    return false;
  }
}

async function setTransactionStatus(userId, id, status) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('portfolio_transactions')
      .update({ status }).eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('setTransactionStatus error:', err.message);
    return false;
  }
}

// ─── Analysis outcomes (shared) ───────────────────────────────────────────────

async function upsertOutcome(record) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('analysis_outcomes')
      .upsert(record, { onConflict: 'ticker,analysis_date' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertOutcome error:', err.message);
    return false;
  }
}

async function getAllOutcomes() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('analysis_outcomes')
      .select('*')
      .order('analysis_date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('getAllOutcomes error:', err.message);
    return [];
  }
}

async function getOutcomesByTicker(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('analysis_outcomes')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .order('analysis_date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('getOutcomesByTicker error:', err.message);
    return [];
  }
}

// ─── Phase 5: structured-data tables (companies, financial periods, derived, aggregates) ──

async function upsertCompany(row) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db.from('companies').upsert(
      { ...row, ticker: row.ticker.toUpperCase(), updated_at: new Date().toISOString() },
      { onConflict: 'ticker' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertCompany error:', err.message);
    return false;
  }
}

async function getCompany(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db.from('companies')
      .select('*').eq('ticker', ticker.toUpperCase()).single();
    if (error) return null;
    return data;
  } catch (err) {
    console.error('getCompany error:', err.message);
    return null;
  }
}

async function _upsertRows(table, conflictCols, rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from(table).upsert(
      rows.map(r => ({ ...r, ticker: r.ticker.toUpperCase(), fetched_at: new Date().toISOString() })),
      { onConflict: conflictCols }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`upsert ${table} error:`, err.message);
    return false;
  }
}

const upsertAnnualPl    = (rows) => _upsertRows('company_annual_pl',    'ticker,fy_end', rows);
const upsertAnnualBs    = (rows) => _upsertRows('company_annual_bs',    'ticker,fy_end', rows);
const upsertAnnualCf    = (rows) => _upsertRows('company_annual_cf',    'ticker,fy_end', rows);
const upsertQuarterlyPl = (rows) => _upsertRows('company_quarterly_pl', 'ticker,q_end',  rows);

async function _upsertComputed(table, conflictCols, rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from(table).upsert(
      rows.map(r => ({ ...r, ticker: r.ticker.toUpperCase(), computed_at: new Date().toISOString() })),
      { onConflict: conflictCols }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`upsert ${table} error:`, err.message);
    return false;
  }
}

const upsertDerivedAnnual    = (rows) => _upsertComputed('company_derived_annual',    'ticker,fy_end', rows);
const upsertDerivedQuarterly = (rows) => _upsertComputed('company_derived_quarterly', 'ticker,q_end',  rows);

async function upsertAggregates(row) {
  try {
    const db = getAdminClient();
    if (!db || !row?.ticker) return false;
    const { error } = await db.from('company_aggregates').upsert(
      { ...row, ticker: row.ticker.toUpperCase(), computed_at: new Date().toISOString() },
      { onConflict: 'ticker' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertAggregates error:', err.message);
    return false;
  }
}

async function getCompanyBundle(ticker) {
  const db = getAdminClient();
  if (!db) return null;
  const T = (await resolveTicker(ticker)).toUpperCase();
  try {
    const [companyRes, plRes, bsRes, cfRes, qRes, dAnnualRes, dQRes, aggRes, shRes] = await Promise.all([
      db.from('companies').select('*').eq('ticker', T).maybeSingle(),
      db.from('company_annual_pl').select('*').eq('ticker', T).order('fy_end', { ascending: false }),
      db.from('company_annual_bs').select('*').eq('ticker', T).order('fy_end', { ascending: false }),
      db.from('company_annual_cf').select('*').eq('ticker', T).order('fy_end', { ascending: false }),
      db.from('company_quarterly_pl').select('*').eq('ticker', T).order('q_end', { ascending: false }),
      db.from('company_derived_annual').select('*').eq('ticker', T).order('fy_end', { ascending: false }),
      db.from('company_derived_quarterly').select('*').eq('ticker', T).order('q_end', { ascending: false }),
      db.from('company_aggregates').select('*').eq('ticker', T).maybeSingle(),
      db.from('company_shareholding').select('*').eq('ticker', T).order('period_end', { ascending: false }),
    ]);
    return {
      ticker: T,
      company: companyRes.data || null,
      annual_pl: plRes.data || [],
      annual_bs: bsRes.data || [],
      annual_cf: cfRes.data || [],
      quarterly_pl: qRes.data || [],
      derived_annual: dAnnualRes.data || [],
      derived_quarterly: dQRes.data || [],
      aggregates: aggRes.data || null,
      shareholding: shRes.data || [],
    };
  } catch (err) {
    console.error('getCompanyBundle error:', err.message);
    return null;
  }
}

// ─── Phase 5.2: shareholding, coverage, universe CRUD ─────────────────────────

const upsertShareholding = (rows) => _upsertRows('company_shareholding', 'ticker,period_end', rows);

// Seed/insert companies (no overwrite of existing ingested data)
async function seedCompanies(rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return { added: 0 };
    const payload = rows.map(r => ({
      ticker: r.ticker.toUpperCase(),
      company_name: r.company_name ?? null,
      sector: r.sector ?? null,
      ingest_status: 'pending',
      updated_at: new Date().toISOString(),
    }));
    // ignoreDuplicates so we don't clobber already-ingested companies' metadata
    const { error } = await db.from('companies').upsert(payload, { onConflict: 'ticker', ignoreDuplicates: true });
    if (error) throw error;
    return { added: payload.length };
  } catch (err) {
    console.error('seedCompanies error:', err.message);
    return { added: 0, error: err.message };
  }
}

async function listCompanies() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('companies').select('*').order('ticker', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listCompanies error:', err.message);
    return [];
  }
}

// ── Phase 7: sector microtheory benchmarks ──
async function listSectors() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('sectors')
      .select('sector, primary_metric, roce_benchmark, roe_benchmark, notes')
      .order('sector', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listSectors error:', err.message);
    return [];
  }
}

async function updateSector(sector, patch) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const allowed = ['primary_metric', 'roce_benchmark', 'roe_benchmark', 'notes'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  clean.updated_at = new Date().toISOString();
  const { data, error } = await db.from('sectors').update(clean).eq('sector', sector).select().maybeSingle();
  if (error) return { error: error.message };
  return { sector: data };
}

async function seedSectors() {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const rows = SECTOR_SEED.map(r => ({ ...r, updated_at: new Date().toISOString() }));
  const { error } = await db.from('sectors').upsert(rows, { onConflict: 'sector' });
  if (error) return { error: error.message };
  return { seeded: rows.length };
}

async function getStaleCompanies(limit = 50) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    // nulls first (never ingested), then oldest last_ingested_at
    const { data, error } = await db.from('companies')
      .select('ticker, last_ingested_at')
      .eq('is_active', true)
      .order('last_ingested_at', { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(r => r.ticker);
  } catch (err) {
    console.error('getStaleCompanies error:', err.message);
    return [];
  }
}

async function markIngested(ticker, status, error) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error: e } = await db.from('companies').update({
      last_ingested_at: new Date().toISOString(),
      ingest_status: status,
      ingest_error: error || null,
    }).eq('ticker', ticker.toUpperCase());
    if (e) throw e;
    return true;
  } catch (err) {
    console.error('markIngested error:', err.message);
    return false;
  }
}

async function updateCompany(ticker, updates) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const allowed = ['company_name', 'sector', 'sub_sector', 'market_cap_tier', 'is_active'];
    const row = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in updates) row[k] = updates[k];
    const { data, error } = await db.from('companies')
      .update(row).eq('ticker', ticker.toUpperCase()).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('updateCompany error:', err.message);
    return null;
  }
}

async function deleteCompany(ticker, hard = false) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const T = ticker.toUpperCase();
    if (hard) {
      const { error } = await db.from('companies').delete().eq('ticker', T);
      if (error) throw error;
    } else {
      const { error } = await db.from('companies')
        .update({ is_active: false, updated_at: new Date().toISOString() }).eq('ticker', T);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error('deleteCompany error:', err.message);
    return false;
  }
}

// Rename a ticker across companies + all financial child tables (best-effort).
// ── Phase 9: corporate actions ledger ──
async function createCorporateAction(row) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const { data, error } = await db.from('corporate_actions')
    .insert({ ...row, ticker: String(row.ticker).toUpperCase(), updated_at: new Date().toISOString() })
    .select().maybeSingle();
  if (error) return { error: error.message };
  return { action: data };
}

async function getCorporateAction(id) {
  const db = getAdminClient();
  if (!db) return null;
  const { data, error } = await db.from('corporate_actions').select('*').eq('id', id).maybeSingle();
  if (error) return null;
  return data;
}

async function listCorporateActions(ticker, status) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    let q = db.from('corporate_actions').select('*').eq('ticker', String(ticker).toUpperCase());
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listCorporateActions error:', err.message);
    return [];
  }
}

async function listCorporateActionsByStatus(status) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('corporate_actions').select('*')
      .eq('status', status).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listCorporateActionsByStatus error:', err.message);
    return [];
  }
}

async function updateCorporateAction(id, patch) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const allowed = ['event_type', 'ratio', 'ex_date', 'announcement_date', 'record_date',
                   'new_ticker', 'new_name', 'linked_ticker', 'amount', 'notes'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  clean.updated_at = new Date().toISOString();
  const { data, error } = await db.from('corporate_actions').update(clean).eq('id', id).select().maybeSingle();
  if (error) return { error: error.message };
  return { action: data };
}

async function setCorporateActionStatus(id, status, extra = {}) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const { data, error } = await db.from('corporate_actions')
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', id).select().maybeSingle();
  if (error) return { error: error.message };
  return { action: data };
}

async function renameTickerCascade(oldTicker, newTicker) {
  const db = getAdminClient();
  if (!db) return { ok: false, error: 'no db' };
  const OLD = oldTicker.toUpperCase();
  const NEW = newTicker.toUpperCase();
  const tables = TICKER_KEYED_TABLES;
  const result = { ok: true, updated: [], errors: [] };
  for (const t of tables) {
    try {
      const { error } = await db.from(t).update({ ticker: NEW }).eq('ticker', OLD);
      if (error) throw error;
      result.updated.push(t);
    } catch (err) {
      result.ok = false;
      result.errors.push({ table: t, error: err.message });
    }
  }
  return result;
}

async function writeTickerHistory(oldTicker, newTicker, reason, actionId, changeDate) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const { error } = await db.from('ticker_history').insert({
    old_ticker: String(oldTicker).toUpperCase(),
    new_ticker: String(newTicker).toUpperCase(),
    change_date: changeDate || new Date().toISOString().split('T')[0],
    reason: reason || null,
    action_id: actionId || null,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

async function applyTickerChange(oldTicker, newTicker, actionId, changeDate) {
  const cascade = await renameTickerCascade(oldTicker, newTicker);
  const hist = await writeTickerHistory(oldTicker, newTicker, 'TICKER_CHANGE', actionId, changeDate);
  return { ...cascade, ticker_history: hist };
}

async function updateCompanyName(ticker, newName) {
  const db = getAdminClient();
  if (!db) return { error: 'no db' };
  const { error } = await db.from('companies')
    .update({ company_name: newName, updated_at: new Date().toISOString() })
    .eq('ticker', String(ticker).toUpperCase());
  if (error) return { error: error.message };
  return { ok: true };
}

// Redirect an old symbol to its current one. Fail-safe: any error → return input.
async function resolveTicker(ticker) {
  try {
    const db = getAdminClient();
    if (!db || !ticker) return ticker;
    const { data, error } = await db.from('ticker_history').select('old_ticker, new_ticker');
    if (error || !data || !data.length) return ticker;
    return resolveChain(data, ticker);
  } catch {
    return ticker;
  }
}

// Best-effort: drop a PROPOSED row from an analysis's corporateActions text.
// Fail-safe + deduped. Never mutates anything.
async function captureCorporateActionFromAnalysis(analysis) {
  try {
    const parsed = parseCorporateActionFromText(analysis?.corporateActions);
    if (!parsed) return { skipped: 'no action' };
    const db = getAdminClient();
    if (!db || !analysis?.ticker) return { skipped: 'no db/ticker' };
    const ticker = String(analysis.ticker).toUpperCase();
    const { data: existing } = await db.from('corporate_actions').select('id')
      .eq('ticker', ticker).eq('event_type', parsed.event_type)
      .in('status', ['proposed', 'confirmed']).limit(1);
    if (existing && existing.length) return { skipped: 'duplicate' };
    const { error } = await db.from('corporate_actions').insert({
      ticker, event_type: parsed.event_type, ratio: parsed.ratio,
      status: 'proposed', source: 'analysis',
      notes: String(analysis.corporateActions).slice(0, 500),
    });
    if (error) return { error: error.message };
    return { proposed: parsed.event_type };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Phase 8: ratios + ranking dataset ───────────────────────────────────────

async function upsertRatios(row) {
  try {
    const db = getAdminClient();
    if (!db || !row?.ticker) return false;
    const { error } = await db.from('company_ratios').upsert(
      { ...row, ticker: row.ticker.toUpperCase(), fetched_at: new Date().toISOString() },
      { onConflict: 'ticker' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertRatios error:', err.message);
    return false;
  }
}

// Merged per-ticker dataset for the ranking engine.
async function getRankingDataset() {
  const db = getAdminClient();
  if (!db) return [];
  try {
    const [companiesRes, aggRes, ratiosRes, derivedRes] = await Promise.all([
      db.from('companies').select('ticker, company_name, sector, is_active'),
      db.from('company_aggregates').select('*'),
      db.from('company_ratios').select('*'),
      db.from('company_derived_annual').select('ticker, fy_end, debt_to_equity').order('fy_end', { ascending: false }),
    ]);
    const companies = companiesRes.data || [];
    const aggByT  = Object.fromEntries((aggRes.data || []).map(r => [r.ticker, r]));
    const ratByT  = Object.fromEntries((ratiosRes.data || []).map(r => [r.ticker, r]));
    // latest debt_to_equity per ticker (derived is date-desc; take first seen)
    const deByT = {};
    for (const r of (derivedRes.data || [])) {
      if (!(r.ticker in deByT) && r.debt_to_equity != null) deByT[r.ticker] = r.debt_to_equity;
    }
    const rows = [];
    for (const c of companies) {
      if (c.is_active === false) continue;
      const agg = aggByT[c.ticker];
      if (!agg) continue; // only rank companies with computed aggregates
      const rat = ratByT[c.ticker] || {};
      rows.push({
        ticker: c.ticker,
        company_name: c.company_name,
        sector: c.sector,
        roce_5y_avg:         agg.roce_5y_avg,
        roe_5y_avg:          agg.roe_5y_avg,
        revenue_cagr_5y_pct: agg.revenue_cagr_5y_pct,
        pat_cagr_5y_pct:     agg.pat_cagr_5y_pct,
        ebitda_margin_5y_avg: agg.ebitda_margin_5y_avg,
        debt_to_equity:      deByT[c.ticker] ?? null,
        pe:                  rat.pe ?? null,
        pb:                  rat.pb ?? null,
        roe_ttm:             rat.roe_ttm ?? null,
        roce_ttm:            rat.roce_ttm ?? null,
        current_price:       rat.current_price ?? null,
        market_cap_cr:       rat.market_cap_cr ?? null,
        dividend_yield:      rat.dividend_yield ?? null,
      });
    }
    return rows;
  } catch (err) {
    console.error('getRankingDataset error:', err.message);
    return [];
  }
}

async function getCoverage() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db.from('companies')
      .select('ticker, company_name, sector, is_active, last_ingested_at, ingest_status, ingest_error')
      .order('last_ingested_at', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('getCoverage error:', err.message);
    return [];
  }
}

async function corporateActionExists(ticker, eventType, exDate) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { data, error } = await db
      .from('corporate_actions')
      .select('id')
      .eq('ticker', ticker.toUpperCase())
      .eq('event_type', eventType)
      .eq('ex_date', exDate)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data != null;
  } catch (err) {
    console.error('corporateActionExists error:', err.message);
    return false;
  }
}

// ─── Daily prices ─────────────────────────────────────────────────────────────

async function getLastPriceDate(ticker) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db
      .from('daily_prices')
      .select('date')
      .eq('ticker', ticker.toUpperCase())
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.date ?? null;
  } catch (err) {
    console.error('getLastPriceDate error:', err.message);
    return null;
  }
}

async function getPriceOnDate(ticker, date) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db
      .from('daily_prices')
      .select('close')
      .eq('ticker', ticker.toUpperCase())
      .eq('date', date)
      .maybeSingle();
    if (error) throw error;
    if (data) return Number(data.close);

    // Fallback to closest price on or before date
    const { data: closest, error: err2 } = await db
      .from('daily_prices')
      .select('close')
      .eq('ticker', ticker.toUpperCase())
      .lte('date', date)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (err2) throw err2;
    return closest?.close ? Number(closest.close) : null;
  } catch (err) {
    console.error('getPriceOnDate error:', err.message);
    return null;
  }
}

async function upsertDailyPrices(rows) {
  try {
    const db = getAdminClient();
    if (!db || !rows?.length) return false;
    const { error } = await db.from('daily_prices').upsert(
      rows.map(r => ({
        ticker:     r.ticker.toUpperCase(),
        date:       r.date,
        open:       r.open,
        high:       r.high,
        low:        r.low,
        close:      r.close,
        adj_close:  r.adjClose,
        volume:     r.volume,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: 'ticker,date' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('upsertDailyPrices error:', err.message);
    return false;
  }
}

async function getActiveTickersInUniverse() {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db
      .from('companies')
      .select('ticker')
      .eq('is_active', true)
      .order('ticker');
    if (error) throw error;
    return (data || []).map(r => r.ticker);
  } catch (err) {
    console.error('getActiveTickersInUniverse error:', err.message);
    return [];
  }
}

// ─── Paper Trading ────────────────────────────────────────────────────────────

async function getPaperBookMeta(strategyKey) {
  try {
    const db = getAdminClient();
    if (!db) return null;
    const { data, error } = await db
      .from('paper_book_meta')
      .select('*')
      .eq('strategy_key', strategyKey)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('getPaperBookMeta error:', err.message);
    return null;
  }
}

async function savePaperBookMeta(meta) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db
      .from('paper_book_meta')
      .upsert({
        strategy_key: meta.strategy_key,
        inception_date: meta.inception_date,
        initial_capital: meta.initial_capital ?? 1500000
      }, { onConflict: 'strategy_key' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('savePaperBookMeta error:', err.message);
    return false;
  }
}

async function getPaperTrades(strategyKey, status) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    let query = db
      .from('paper_trades')
      .select('*')
      .eq('strategy_key', strategyKey);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query.order('entry_date', { ascending: false }).order('id', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('getPaperTrades error:', err.message);
    return [];
  }
}

async function savePaperTrades(trades) {
  try {
    const db = getAdminClient();
    if (!db || !trades?.length) return false;
    const rows = trades.map(t => ({
      id: t.id, // will be undefined for inserts, populated for updates
      strategy_key: t.strategy_key,
      ticker: t.ticker.toUpperCase(),
      company: t.company,
      entry_date: t.entry_date,
      entry_price: t.entry_price,
      entry_rank: t.entry_rank,
      entry_reasons: t.entry_reasons,
      exit_date: t.exit_date,
      exit_price: t.exit_price,
      exit_reason: t.exit_reason,
      status: t.status,
      shares: t.shares,
      current_price: t.current_price,
      return_pct: t.return_pct,
      last_updated: new Date().toISOString()
    }));

    const { error } = await db.from('paper_trades').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('savePaperTrades error:', err.message);
    return false;
  }
}

async function savePaperBookDaily(snapshot) {
  try {
    const db = getAdminClient();
    if (!db) return false;
    const { error } = await db
      .from('paper_book_daily')
      .upsert({
        strategy_key: snapshot.strategy_key,
        date: snapshot.date,
        book_value: snapshot.book_value,
        book_return_pct: snapshot.book_return_pct,
        nifty50_return_pct: snapshot.nifty50_return_pct,
        open_positions: snapshot.open_positions
      }, { onConflict: 'strategy_key,date' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('savePaperBookDaily error:', err.message);
    return false;
  }
}

async function getPaperBookDaily(strategyKey) {
  try {
    const db = getAdminClient();
    if (!db) return [];
    const { data, error } = await db
      .from('paper_book_daily')
      .select('*')
      .eq('strategy_key', strategyKey)
      .order('date', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('getPaperBookDaily error:', err.message);
    return [];
  }
}

module.exports = {
  connectDB, checkConnection, saveAnalysis, getAnalysis, getAllAnalyses, getAnalysisHistory, deleteAnalysis,
  getProfile, updateProfile, getWatchlist, addToWatchlist, removeFromWatchlist, getCurrentQuarter,
  // tracking
  upsertWatch, getActiveWatches, getAllWatches, updateWatchStatus,
  savePriceCheck, getLatestPrices,
  openVirtualTrade, closeVirtualTrade, updateOpenTrades, getAllTrades,
  createAlert, getAlerts, getUnreadAlertCount, markAllAlertsRead,
  // fundamental metrics
  saveFundamentalMetrics, getMetricsHistory, getAllMetricsLatest,
  // portfolio + outcomes (added 2026-05-17)
  addPortfolioTransaction, listPortfolioTransactions, updatePortfolioTransaction,
  deletePortfolioTransaction, setTransactionStatus,
  upsertOutcome, getAllOutcomes, getOutcomesByTicker,
  // Phase 5: structured data layer
  upsertCompany, getCompany,
  upsertAnnualPl, upsertAnnualBs, upsertAnnualCf, upsertQuarterlyPl,
  upsertDerivedAnnual, upsertDerivedQuarterly, upsertAggregates,
  getCompanyBundle,
  // Phase 5.2: shareholding, coverage, universe CRUD
  upsertShareholding, seedCompanies, listCompanies, getStaleCompanies,
  markIngested, updateCompany, deleteCompany, renameTickerCascade, getCoverage,
  // Phase 8: ratios + ranking
  upsertRatios, getRankingDataset,
  // Phase 7: sector microtheories
  listSectors, updateSector, seedSectors,
  // Phase 9: corporate actions
  createCorporateAction, getCorporateAction, listCorporateActions, listCorporateActionsByStatus,
  updateCorporateAction, setCorporateActionStatus,
  applyTickerChange, writeTickerHistory, updateCompanyName, resolveTicker, captureCorporateActionFromAnalysis,
  corporateActionExists,
  // Daily prices
  getLastPriceDate, getPriceOnDate, upsertDailyPrices, getActiveTickersInUniverse,
  // Paper Trading (Phase 2)
  getPaperBookMeta, savePaperBookMeta, getPaperTrades, savePaperTrades, savePaperBookDaily, getPaperBookDaily,
};
