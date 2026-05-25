/**
 * screener.in scraper. Two surfaces:
 *   fetchScreenerHtml(ticker)   — async, HTTP GET screener.in/company/{ticker}/consolidated/
 *   parseScreenerHtml(ticker, html) — pure, returns { annual_pl, annual_bs, annual_cf, quarterly_pl }
 *
 * The parser is the testable core. Network is isolated for easy mocking.
 *
 * IMPORTANT: screener.in HTML structure may change. The selectors here assume
 * the four canonical sections #quarters, #profit-loss, #balance-sheet, #cash-flow,
 * each containing a single table.data-table whose first <thead> row has period
 * column headers like "Mar 2024" and whose <tbody> rows are line items.
 */

const https = require('https');
const cheerio = require('cheerio');

const MONTHS = {
  Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6,
  Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12,
};

const LAST_DAY = { 1:31, 2:28, 3:31, 4:30, 5:31, 6:30, 7:31, 8:31, 9:30, 10:31, 11:30, 12:31 };

function parseNumber(str) {
  if (str == null) return null;
  const cleaned = String(str).replace(/[,\s%₹]/g, '').trim();
  if (!cleaned || /^N\/?A$/i.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

function normalizePeriod(label, forceKind) {
  const m = String(label).trim().match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  const year  = parseInt(m[2], 10);
  const day   = LAST_DAY[month];
  const date  = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

  // When forceKind is 'quarter', treat ALL months as quarter ends.
  // Mar → Q4 of the fiscal year ending that March (e.g. Mar 2024 → Q4FY24).
  if (forceKind === 'quarter') {
    const qMap = { 3:'Q4', 6:'Q1', 9:'Q2', 12:'Q3' };
    const q = qMap[month];
    if (!q) return null;
    const fy = month === 3 ? year : year + 1;
    return { date, label: `${q}FY${String(fy).slice(2)}`, kind: 'quarter' };
  }

  // Default: Mar = annual fiscal-year end. Other months not allowed in annual context.
  if (month === 3) {
    return { date, label: `FY${String(year).slice(2)}`, kind: 'annual' };
  }
  const qMap = { 6:'Q1', 9:'Q2', 12:'Q3' };
  const q = qMap[month];
  if (!q) return null;
  const fy = year + 1;
  return { date, label: `${q}FY${String(fy).slice(2)}`, kind: 'quarter' };
}

function rowLabel(text) {
  return String(text || '').replace(/\s*\+\s*$/, '').trim().toLowerCase();
}

function extractTable($, sectionSelector) {
  const tbl = $(sectionSelector).find('table.data-table').first();
  if (!tbl.length) return { headers: [], rows: [] };
  const headers = tbl.find('thead tr th').slice(1).map((_, el) => $(el).text().trim()).get();
  const rows = [];
  tbl.find('tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 2) return;
    const label = rowLabel(cells.eq(0).text());
    const values = cells.slice(1).map((_, td) => $(td).text().trim()).get();
    rows.push({ label, values });
  });
  return { headers, rows };
}

function findRow(rows, ...needles) {
  for (const r of rows) {
    for (const n of needles) {
      if (r.label.includes(n)) return r.values;
    }
  }
  return null;
}

function parsePlSection($, sectionSelector, kind) {
  const { headers, rows } = extractTable($, sectionSelector);
  if (!headers.length || !rows.length) return [];
  const v = {
    sales:        findRow(rows, 'sales'),
    expenses:     findRow(rows, 'expenses'),
    op:           findRow(rows, 'operating profit'),
    opm:          findRow(rows, 'opm'),
    other_income: findRow(rows, 'other income'),
    interest:     findRow(rows, 'interest'),
    depreciation: findRow(rows, 'depreciation'),
    pbt:          findRow(rows, 'profit before tax'),
    tax:          findRow(rows, 'tax %'),
    net_profit:   findRow(rows, 'net profit'),
    eps:          findRow(rows, 'eps'),
  };
  const out = [];
  headers.forEach((h, i) => {
    // Force kind based on which section we're parsing — the #quarters section
    // has Mar columns that mean Q4 (not annual FY)
    const p = normalizePeriod(h, kind);
    if (!p || p.kind !== kind) return;
    const isAnnual = p.kind === 'annual';
    out.push({
      [isAnnual ? 'fy_end'   : 'q_end']:   p.date,
      [isAnnual ? 'fy_label' : 'q_label']: p.label,
      sales_cr:            parseNumber(v.sales?.[i]),
      expenses_cr:         parseNumber(v.expenses?.[i]),
      operating_profit_cr: parseNumber(v.op?.[i]),
      opm_pct:             parseNumber(v.opm?.[i]),
      other_income_cr:     parseNumber(v.other_income?.[i]),
      interest_cr:         parseNumber(v.interest?.[i]),
      depreciation_cr:     parseNumber(v.depreciation?.[i]),
      pbt_cr:              parseNumber(v.pbt?.[i]),
      tax_pct:             parseNumber(v.tax?.[i]),
      net_profit_cr:       parseNumber(v.net_profit?.[i]),
      eps_rs:              parseNumber(v.eps?.[i]),
    });
  });
  return out;
}

function parseBsSection($, sectionSelector) {
  const { headers, rows } = extractTable($, sectionSelector);
  if (!headers.length || !rows.length) return [];
  const v = {
    equity:        findRow(rows, 'equity capital'),
    reserves:      findRow(rows, 'reserves'),
    borrowings:    findRow(rows, 'borrowings'),
    other_liab:    findRow(rows, 'other liabilities'),
    total_liab:    findRow(rows, 'total liabilities'),
    fixed_assets:  findRow(rows, 'fixed assets'),
    cwip:          findRow(rows, 'cwip'),
    investments:   findRow(rows, 'investments'),
    other_assets:  findRow(rows, 'other assets'),
    total_assets:  findRow(rows, 'total assets'),
  };
  const out = [];
  headers.forEach((h, i) => {
    const p = normalizePeriod(h);
    if (!p || p.kind !== 'annual') return;
    const equity   = parseNumber(v.equity?.[i]);
    const reserves = parseNumber(v.reserves?.[i]);
    out.push({
      fy_end:   p.date,
      fy_label: p.label,
      equity_share_capital_cr: equity,
      reserves_cr:             reserves,
      total_equity_cr:         (equity != null && reserves != null) ? equity + reserves : null,
      long_term_borrowings_cr:  null,
      short_term_borrowings_cr: null,
      total_debt_cr:           parseNumber(v.borrowings?.[i]),
      trade_payables_cr:       null,
      other_current_liab_cr:   parseNumber(v.other_liab?.[i]),
      fixed_assets_cr:         parseNumber(v.fixed_assets?.[i]),
      cwip_cr:                 parseNumber(v.cwip?.[i]),
      investments_cr:          parseNumber(v.investments?.[i]),
      inventories_cr:          null,
      trade_receivables_cr:    null,
      cash_cr:                 null,
      other_current_assets_cr: parseNumber(v.other_assets?.[i]),
      total_assets_cr:         parseNumber(v.total_assets?.[i]),
      book_value_per_share:    null,
    });
  });
  return out;
}

function parseCfSection($, sectionSelector) {
  const { headers, rows } = extractTable($, sectionSelector);
  if (!headers.length || !rows.length) return [];
  const v = {
    ocf:   findRow(rows, 'cash from operating'),
    icf:   findRow(rows, 'cash from investing'),
    ffc:   findRow(rows, 'cash from financing'),
    net:   findRow(rows, 'net cash flow'),
  };
  const out = [];
  headers.forEach((h, i) => {
    const p = normalizePeriod(h);
    if (!p || p.kind !== 'annual') return;
    out.push({
      fy_end:   p.date,
      fy_label: p.label,
      ocf_cr:             parseNumber(v.ocf?.[i]),
      icf_cr:             parseNumber(v.icf?.[i]),
      ffc_cr:             parseNumber(v.ffc?.[i]),
      net_change_cash_cr: parseNumber(v.net?.[i]),
      capex_cr:           null,
      free_cash_flow_cr:  null,
      dividends_paid_cr:  null,
      debt_raised_cr:     null,
      debt_repaid_cr:     null,
    });
  });
  return out;
}

// Convert "Mar 2025" → { date: '2025-03-31', label: 'Mar 2025' } (calendar quarter-end).
function shareholdingPeriod(label) {
  const m = String(label).trim().match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  const year  = parseInt(m[2], 10);
  const day   = LAST_DAY[month];
  return {
    date: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
    label: `${m[1]} ${year}`,
  };
}

function parseShareholdingSection($) {
  const { headers, rows } = extractTable($, '#shareholding');
  if (!headers.length || !rows.length) return [];
  const v = {
    promoter:     findRow(rows, 'promoter'),
    fii:          findRow(rows, 'fii'),
    dii:          findRow(rows, 'dii'),
    government:   findRow(rows, 'government'),
    public:       findRow(rows, 'public'),
    shareholders: findRow(rows, 'no. of shareholders', 'shareholders'),
    pledge:       findRow(rows, 'pledged'),
  };
  const out = [];
  headers.forEach((h, i) => {
    const p = shareholdingPeriod(h);
    if (!p) return;
    const shCount = parseNumber(v.shareholders?.[i]);
    out.push({
      period_end:     p.date,
      period_label:   p.label,
      promoter_pct:   parseNumber(v.promoter?.[i]),
      fii_pct:        parseNumber(v.fii?.[i]),
      dii_pct:        parseNumber(v.dii?.[i]),
      government_pct: parseNumber(v.government?.[i]),
      public_pct:     parseNumber(v.public?.[i]),
      pledge_pct:     parseNumber(v.pledge?.[i]),
      shareholders:   shCount != null ? Math.round(shCount) : null,
    });
  });
  return out;
}

/**
 * Parse screener.in's "Result date" string into ISO YYYY-MM-DD.
 * Returns null for unparseable, N/A, or dates >5 days in the past.
 * @param {string|null} str  e.g. "Jun 2025" or "30 Jun 2025"
 */
function parseResultDate(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  if (!s || /^n\/?a$/i.test(s)) return null;
  const m = s.match(/(?:(\d{1,2})\s+)?([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return null;
  const day  = m[1] ? parseInt(m[1], 10) : 1;
  const key  = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
  const mon  = MONTHS[key];
  const year = parseInt(m[3], 10);
  if (!mon || year < 2000 || year > 2100) return null;
  const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date  = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if ((today - date) / 86400000 > 5) return null;
  return dateStr;
}

// Parse screener.in's top-of-page quick ratios box (ul#top-ratios).
// Each <li> has a name span and a value span. Returns a single object or null.
function parseTopRatios($) {
  const items = $('#top-ratios li, ul#top-ratios li');
  if (!items.length) return null;
  const map = {};
  items.each((_, li) => {
    const name = $(li).find('.name').text().trim().toLowerCase();
    // Use the .value span only — it already contains the .number child.
    // (Selecting both .value AND .number double-counts and concatenates digits.)
    const valueText = $(li).find('.value').text().replace(/\s+/g, ' ').trim();
    if (name) map[name] = valueText;
  });
  if (Object.keys(map).length === 0) return null;

  const get = (...needles) => {
    for (const key of Object.keys(map)) {
      for (const n of needles) {
        if (key.includes(n)) return map[key];
      }
    }
    return null;
  };

  // "High / Low" value looks like "1,234 / 567"
  const hl = get('high / low', 'high/low');
  let high52 = null, low52 = null;
  if (hl) {
    const parts = hl.split('/').map(s => parseNumber(s));
    high52 = parts[0] ?? null;
    low52  = parts[1] ?? null;
  }

  const current_price = parseNumber(get('current price'));
  const book_value    = parseNumber(get('book value'));
  const pe            = parseNumber(get('stock p/e', 'p/e'));
  const pb            = (current_price != null && book_value) ? Number((current_price / book_value).toFixed(2)) : null;

  return {
    current_price,
    market_cap_cr:  parseNumber(get('market cap')),
    pe,
    pb,
    book_value,
    dividend_yield: parseNumber(get('dividend yield')),
    roce_ttm:       parseNumber(get('roce', 'return on capital')),
    roe_ttm:        parseNumber(get('roe', 'return on equity')),
    face_value:     parseNumber(get('face value')),
    high_52w:       high52,
    low_52w:        low52,
    resultDate:     parseResultDate(get('result date', 'result')),
  };
}

function parseScreenerHtml(ticker, html) {
  const T = ticker.toUpperCase();
  const $ = cheerio.load(html);
  const annualPl  = parsePlSection($, '#profit-loss', 'annual').map(r => ({ ticker: T, ...r }));
  const quartPl   = parsePlSection($, '#quarters',    'quarter').map(r => ({ ticker: T, ...r }));
  const annualBs  = parseBsSection($, '#balance-sheet').map(r => ({ ticker: T, ...r }));
  const annualCf  = parseCfSection($, '#cash-flow').map(r => ({ ticker: T, ...r }));
  const sharehold = parseShareholdingSection($).map(r => ({ ticker: T, ...r }));
  const ratiosObj = parseTopRatios($);
  const ratios    = ratiosObj ? { ticker: T, ...ratiosObj } : null;
  return {
    annual_pl:    annualPl,
    annual_bs:    annualBs,
    annual_cf:    annualCf,
    quarterly_pl: quartPl,
    shareholding: sharehold,
    ratios,
  };
}

function fetchScreenerHtml(ticker, opts = {}) {
  const T = ticker.toUpperCase();
  const path = opts.standalone
    ? `/company/${T}/`
    : `/company/${T}/consolidated/`;
  return new Promise((resolve, reject) => {
    https.get(`https://www.screener.in${path}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode === 302 && !opts.standalone) {
        return fetchScreenerHtml(ticker, { standalone: true }).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`screener.in returned ${res.statusCode}`));
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = { fetchScreenerHtml, parseScreenerHtml, normalizePeriod, parseNumber, parseResultDate };
