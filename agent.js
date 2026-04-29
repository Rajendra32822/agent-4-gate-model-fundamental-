const Anthropic = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');
const { MARSHALL_SYSTEM_PROMPT } = require('./marshallPrompt');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// OpenRouter fallback client — only active if OPENROUTER_API_KEY is set
const openRouterClient = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: { 'HTTP-Referer': 'https://agent-4-gate-model-fundamental.onrender.com' },
    })
  : null;

const FALLBACK_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it';

// Returns true for any error where switching to OpenRouter makes sense:
// credits exhausted, network failures, timeouts, or Anthropic being unreachable
function shouldUseFallback(err) {
  // HTTP-level credit/billing errors
  if (err?.status === 402) return true;
  const msg = (err?.message || err?.error?.message || '').toLowerCase();
  if (msg.includes('credit') || msg.includes('billing') || msg.includes('quota') || msg.includes('insufficient_quota')) return true;
  // Network-level failures (ETIMEDOUT, ECONNREFUSED, ENOTFOUND, etc.)
  const cause = err?.cause || err;
  const code = cause?.code || cause?.errno || '';
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') return true;
  // status undefined = never got an HTTP response (network/TLS failure)
  if (err?.status === undefined && err?.cause) return true;
  return false;
}

/**
 * Calls the main analysis model (Sonnet).
 * On credit exhaustion, automatically retries via OpenRouter using the configured fallback model.
 */
async function callAnalysisModel({ system, userContent, maxTokens = 16000, onFallback }) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
    });
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  } catch (err) {
    if (!openRouterClient || !shouldUseFallback(err)) throw err;

    console.warn(`⚠️  Anthropic credits exhausted — switching to OpenRouter (${FALLBACK_MODEL})`);
    onFallback?.();

    const response = await openRouterClient.chat.completions.create({
      model: FALLBACK_MODEL,
      max_tokens: Math.min(maxTokens, 8192), // most OpenRouter models cap at 8192
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    });
    return response.choices[0].message.content || '';
  }
}

/**
 * Calls Haiku with the web_search tool.
 * On credit exhaustion, falls back to OpenRouter without web search (uses model training data).
 */
async function callSearchModel({ userContent, maxTokens = 1500 }) {
  const searchClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const response = await searchClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: userContent }],
    });
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  } catch (err) {
    if (!openRouterClient || !shouldUseFallback(err)) throw err;

    console.warn(`⚠️  Anthropic credits exhausted for search — using OpenRouter (${FALLBACK_MODEL}) without web search`);

    const response = await openRouterClient.chat.completions.create({
      model: FALLBACK_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userContent }],
    });
    return response.choices[0].message.content || '';
  }
}

function parseJsonFromText(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                    text.match(/```\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text.trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start !== -1 && end > start) return JSON.parse(text.slice(start, end));
    throw new Error('Could not parse response as JSON');
  }
}

/**
 * Fetches financial data for a company using web search
 */
async function fetchCompanyData(ticker, companyName) {
  const searchQueries = [
    `site:screener.in ${ticker} consolidated profit loss balance sheet ROCE ROE revenue`,
    `${companyName} ${ticker} NSE promoter holding pledge shareholding FY2025 debt equity`,
    `${companyName} ${ticker} business model moat competitive advantage latest quarterly results`,
    // CRITICAL: always fetch live price + corporate actions so split-adjusted prices are used
    `${companyName} ${ticker} NSE current share price today 2025 2026 stock split bonus issue rights issue ex-date`,
    // Management guidance, concall Q&A, capital allocation intent — critical for Gate 2b
    `${companyName} ${ticker} management concall earnings call Q3FY25 Q4FY25 guidance outlook capex expansion debt repayment`,
  ];

  const dataGathered = [];

  for (const query of searchQueries) {
    try {
      const text = await callSearchModel({
        userContent: `Search and return ALL financial data found: "${query}".
          Include exact numbers: revenue, profit, ROCE, ROE, debt ratios, promoter holding %, promoter pledge %, P/E, P/B, EV/EBITDA across multiple years.`,
      });
      if (text.trim()) dataGathered.push({ query, data: text });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`Search failed for query: ${query}`, err.message);
    }
  }

  return dataGathered;
}

/**
 * Runs the full Marshall 4-gate analysis
 */
async function runMarshallAnalysis(ticker, companyName, onProgress) {
  try {
    onProgress?.({ stage: 'fetching', message: `Fetching financial data for ${companyName}...`, progress: 10 });

    const rawData = await fetchCompanyData(ticker, companyName);

    onProgress?.({ stage: 'analysing', message: "Applying Marshall's 4-gate framework...", progress: 40 });

    const dataContext = rawData.map((item, i) =>
      `--- Data Source ${i + 1} ---\n${item.data}`
    ).join('\n\n');

    onProgress?.({ stage: 'gates', message: 'Running all 4 gates...', progress: 55 });

    const analysisPrompt = `
Analyse ${companyName} (${ticker}, listed on NSE/BSE India) using Marshall's complete 4-gate value investing framework.

Financial and business data gathered:

${dataContext}

Today's date: ${new Date().toISOString().split('T')[0]}

CRITICAL — CORPORATE ACTIONS CHECK (do this FIRST before any price calculation):
1. Search the data above for any stock split, bonus issue, or rights issue in the last 3 years.
2. Identify the ratio (e.g., 1:5 split means ₹6,200 pre-split = ₹1,240 post-split) and the ex-date.
3. ALL price figures — including entry zone, bear/base/bull case, and currentPrice — MUST reflect the post-split / post-bonus adjusted price.
4. Historical per-share metrics (EPS, book value per share) sourced from databases may still show pre-split numbers; adjust them before using.
5. In the "corporateActions" field of the JSON, clearly state what actions were found and what adjustment was applied.
6. If you find no corporate actions, explicitly state "None found" in that field.
7. Cross-check: if the current market price shown in the data is 3×–10× lower than the EPS/book-value history suggests, a split or bonus has almost certainly occurred — adjust accordingly.

Instructions:
1. Use ALL the data provided to conduct the analysis
2. Apply Marshall's framework strictly as defined in your system prompt
3. Make India-specific adjustments where relevant
4. Note any missing data in the dataQualityNote field
5. Calculate all metrics from the raw data provided
6. Produce SPECIFIC price ranges for the entry zone — ALWAYS in post-split adjusted prices
7. Apply special scrutiny to: promoter pledge, ROCE trend, debt growth, RPTs

Return ONLY a valid JSON object matching the exact schema. No preamble or explanation outside the JSON.
`;

    onProgress?.({ stage: 'gates', message: 'AI is analysing all gates...', progress: 65 });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const responseText = await callAnalysisModel({
      system: MARSHALL_SYSTEM_PROMPT,
      userContent: analysisPrompt,
      maxTokens: 16000,
      onFallback: () => onProgress?.({ stage: 'gates', message: 'Switched to fallback AI — continuing analysis...', progress: 65 }),
    });

    onProgress?.({ stage: 'processing', message: 'Processing analysis results...', progress: 85 });

    const analysisResult = parseJsonFromText(responseText);
    analysisResult.analysisDate = new Date().toISOString().split('T')[0];
    analysisResult.ticker = ticker.toUpperCase();
    analysisResult.rawDataSources = rawData.length;

    onProgress?.({ stage: 'complete', message: 'Analysis complete!', progress: 100 });

    return { success: true, analysis: analysisResult };

  } catch (error) {
    console.error('Analysis error:', error);
    return { success: false, error: error.message, details: error.stack };
  }
}

/**
 * Quick company lookup — uses Haiku model to avoid rate limits
 */
async function lookupCompany(query) {
  try {
    const text = await callSearchModel({
      userContent: `Find the NSE ticker symbol and full company name for: "${query}" (Indian stock market).
        Return ONLY a JSON object: {"ticker": "SYMBOL", "name": "Full Company Name", "exchange": "NSE", "sector": "sector name"}
        If not found return: {"error": "Company not found"}`,
      maxTokens: 300,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { error: 'Could not identify company' };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Fetches only fresh update data — quarterly results, announcements, press releases
 */
async function fetchUpdateData(ticker, companyName) {
  const quarter = getCurrentUpdateQuarter();
  const searchQueries = [
    `${companyName} ${ticker} quarterly results ${quarter} revenue profit EBITDA ROCE`,
    `${companyName} BSE NSE corporate announcement board meeting dividend buyback 2025 2026`,
    `${companyName} ${ticker} latest news analyst rating price target earnings outlook`,
  ];

  const dataGathered = [];

  for (const query of searchQueries) {
    try {
      const text = await callSearchModel({
        userContent: `Search and extract ALL new financial data: "${query}". Focus on data published in last 90 days. Include exact numbers.`,
      });
      if (text.trim()) dataGathered.push({ query, data: text });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`Update search failed: ${query}`, err.message);
    }
  }

  return dataGathered;
}

function getCurrentUpdateQuarter() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 4 && month <= 6)  return `Q4FY${String(year).slice(2)}`;
  if (month >= 7 && month <= 9)  return `Q1FY${String(year + 1).slice(2)}`;
  if (month >= 10 && month <= 12) return `Q2FY${String(year + 1).slice(2)}`;
  return `Q3FY${String(year).slice(2)}`;
}

/**
 * Runs an incremental update — uses old analysis + fresh data to produce updated analysis
 */
async function runUpdateAnalysis(ticker, companyName, oldAnalysis, onProgress) {
  try {
    onProgress?.({ stage: 'fetching', message: `Fetching latest quarterly data for ${companyName}...`, progress: 10 });

    const freshData = await fetchUpdateData(ticker, companyName);

    onProgress?.({ stage: 'analysing', message: 'Comparing with previous analysis...', progress: 40 });

    const freshContext = freshData.map((item, i) =>
      `--- Fresh Data Source ${i + 1} ---\n${item.data}`
    ).join('\n\n');

    const oldSummary = JSON.stringify({
      analysisDate: oldAnalysis.analysisDate,
      overallVerdict: oldAnalysis.overallVerdict,
      targetEntryPrice: oldAnalysis.targetEntryPrice,
      gate1: { verdict: oldAnalysis.gate1?.verdict },
      gate2a: { verdict: oldAnalysis.gate2a?.verdict, metrics: oldAnalysis.gate2a?.metrics },
      gate2b: { verdict: oldAnalysis.gate2b?.verdict },
      gate2c: { verdict: oldAnalysis.gate2c?.verdict },
      gate3: { verdict: oldAnalysis.gate3?.verdict, metrics: oldAnalysis.gate3?.metrics, entryZone: oldAnalysis.gate3?.entryZone },
    });

    onProgress?.({ stage: 'gates', message: 'Updating all gates with new data...', progress: 60 });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const updatePrompt = `UPDATE the existing Marshall 4-gate analysis for ${companyName} (${ticker}) using fresh data.

PREVIOUS ANALYSIS (dated ${oldAnalysis.analysisDate}):
${oldSummary}

FRESH DATA GATHERED TODAY (${new Date().toISOString().split('T')[0]}):
${freshContext}

Instructions:
1. Produce a COMPLETE updated analysis JSON (same schema as before)
2. Update metrics/verdicts in any gate where fresh data changes the picture
3. Recalculate the valuation (Gate 3) with latest price data
4. Add a "changesSinceLastAnalysis" field with this structure:
   {
     "triggerEvent": "e.g. Q3FY25 results",
     "summary": "one paragraph summary of what changed",
     "verdictChanged": true/false,
     "previousVerdict": "WATCH",
     "changes": [{ "gate": "Gate 2a", "metric": "ROCE", "previous": "18%", "updated": "22%", "direction": "improved" }]
   }
5. Return ONLY valid JSON. No preamble.`;

    const responseText = await callAnalysisModel({
      system: MARSHALL_SYSTEM_PROMPT,
      userContent: updatePrompt,
      maxTokens: 16000,
      onFallback: () => onProgress?.({ stage: 'gates', message: 'Switched to fallback AI — continuing update...', progress: 60 }),
    });

    onProgress?.({ stage: 'processing', message: 'Processing updated analysis...', progress: 85 });

    const analysisResult = parseJsonFromText(responseText);
    analysisResult.analysisDate = new Date().toISOString().split('T')[0];
    analysisResult.ticker = ticker.toUpperCase();
    analysisResult.rawDataSources = freshData.length;
    analysisResult.isUpdate = true;
    analysisResult.previousAnalysisDate = oldAnalysis.analysisDate;

    onProgress?.({ stage: 'complete', message: 'Update complete!', progress: 100 });

    return { success: true, analysis: analysisResult };
  } catch (error) {
    console.error('Update analysis error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { runMarshallAnalysis, runUpdateAnalysis, lookupCompany };
