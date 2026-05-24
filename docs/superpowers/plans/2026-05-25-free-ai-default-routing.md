# Free AI by Default — Routing Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make standard stock analysis run free by default (OpenRouter free model + Phase 5 structured data + Yahoo, ingest-on-demand if needed, no paid web searches), reserving paid Anthropic Sonnet + web search for an explicit `deepAnalysis` flag — stopping the credit drain.

**Architecture:** A pure `resolveAnalysisPlan(deepAnalysis, env)` helper centralizes the routing decision. `callAnalysisModel` branches on it (standard → OpenRouter free only; deep → current Anthropic-first behavior). `runMarshallAnalysis` skips the 3 search-dependent steps (web search, Tier-2 re-fetch, auto-retry) on the standard path. The `/api/analyse` route threads the `deepAnalysis` flag (default false) and ingests-on-demand via the existing free scraper when the bundle is empty.

**Tech Stack:** Node.js (CommonJS), `node --test` (run with the glob form `node --test test/*.test.js` — the local Node is v24, where `node --test test/` fails), Anthropic SDK, OpenAI SDK (for OpenRouter), existing `ingestion/orchestrator.js`.

**Spec:** `docs/superpowers/specs/2026-05-25-free-ai-default-routing-design.md`

> **⚠️ Status note (added during execution):** Tasks 1–3 of this plan turned out to be **already implemented** in commit `4825bbb` (which landed externally mid-session) — `callAnalysisModel` branching, `deepAnalysis` threading, and web-search/Tier-2/auto-retry gating are all done in the current code, with the routing logic inlined rather than via a `resolveAnalysisPlan` helper. Only **Task 4's ingest-on-demand** was a real gap; it was implemented in commit `e5cfb0c`. The `resolveAnalysisPlan` refactor (Task 1) was deliberately skipped. Treat Tasks 1–3 below as historical/superseded.

> **Note on test command:** the local Node is **v24.11.0**. Use `node --test test/*.test.js` (glob). `node --test test/` errors with "Cannot find module .../test" on Node 24.

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `agent.js` | Modify | Add+export `resolveAnalysisPlan`; branch `callAnalysisModel` and `runMarshallAnalysis` on `deepAnalysis`; add log + standard-mode prompt note. |
| `test/agentRouting.test.js` | Create | Unit-test `resolveAnalysisPlan`. |
| `index.js` | Modify | Accept `deepAnalysis` in `/api/analyse`; ingest-on-demand on the standard path; pass the flag to `runMarshallAnalysis`. |

---

## Task 1: Add and export `resolveAnalysisPlan` (pure, TDD)

**Files:**
- Modify: `agent.js`
- Test: `test/agentRouting.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/agentRouting.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { resolveAnalysisPlan } = require('../agent');

test('standard (default) routes to free OpenRouter, 8192, no web search', () => {
  const p = resolveAnalysisPlan(false, {}); // empty env → built-in free default
  assert.equal(p.tier, 'standard');
  assert.equal(p.provider, 'openrouter');
  assert.equal(p.model, 'meta-llama/llama-3.3-70b-instruct:free');
  assert.equal(p.maxTokens, 8192);
  assert.equal(p.useWebSearch, false);
});

test('deep routes to Anthropic Sonnet, 16000, with web search', () => {
  const p = resolveAnalysisPlan(true, {});
  assert.equal(p.tier, 'deep');
  assert.equal(p.provider, 'anthropic');
  assert.equal(p.model, 'claude-sonnet-4-5');
  assert.equal(p.maxTokens, 16000);
  assert.equal(p.useWebSearch, true);
});

test('standard honors OPENROUTER_MODEL override', () => {
  const p = resolveAnalysisPlan(false, { OPENROUTER_MODEL: 'google/gemma-2-9b-it:free' });
  assert.equal(p.model, 'google/gemma-2-9b-it:free');
});

test('falsy deepAnalysis values default to standard', () => {
  assert.equal(resolveAnalysisPlan(undefined, {}).tier, 'standard');
  assert.equal(resolveAnalysisPlan(0, {}).tier, 'standard');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/agentRouting.test.js`
Expected: FAIL — `resolveAnalysisPlan` is not exported (`undefined is not a function`).

- [ ] **Step 3: Add the helper to `agent.js`**

In `agent.js`, immediately after the `FALLBACK_SEARCH_MODEL` const (around line 24, before `function shouldUseFallback`), add:

```js
/**
 * Pure routing decision. deepAnalysis=true → paid Anthropic + web search;
 * otherwise → free OpenRouter model, smaller token budget, no web search.
 */
function resolveAnalysisPlan(deepAnalysis, env = process.env) {
  if (deepAnalysis === true) {
    return { tier: 'deep', provider: 'anthropic', model: 'claude-sonnet-4-5', maxTokens: 16000, useWebSearch: true };
  }
  return {
    tier: 'standard',
    provider: 'openrouter',
    model: env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    maxTokens: 8192,
    useWebSearch: false,
  };
}
```

- [ ] **Step 4: Export it**

At the bottom of `agent.js`, change:

```js
module.exports = { runMarshallAnalysis, runUpdateAnalysis, lookupCompany };
```
to:
```js
module.exports = { runMarshallAnalysis, runUpdateAnalysis, lookupCompany, resolveAnalysisPlan };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/agentRouting.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add agent.js test/agentRouting.test.js
git commit -m "Add resolveAnalysisPlan routing helper (free-AI Task 1)"
```

---

## Task 2: Branch `callAnalysisModel` on the plan

**Files:**
- Modify: `agent.js` (the `callAnalysisModel` function)

Standard path calls OpenRouter free directly (no Anthropic). Deep path keeps the current Anthropic-first + OpenRouter-fallback behavior. The default for `OPENROUTER_MODEL` referenced here is now a free model.

- [ ] **Step 1: Update the `FALLBACK_MODEL` default to a free model**

In `agent.js`, change:

```js
const FALLBACK_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it';
```
to:
```js
const FALLBACK_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
```

- [ ] **Step 2: Replace the `callAnalysisModel` function**

Replace the entire existing function:

```js
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
    const choice = response.choices?.[0];
    if (choice?.finish_reason === 'length') {
      // Output truncated — JSON will be invalid; surface a clear error instead of a parse failure
      throw new Error(`Fallback model ${FALLBACK_MODEL} truncated output at ${Math.min(maxTokens, 8192)} tokens. Try a model with a larger output window (e.g. openai/gpt-4o-mini, anthropic/claude-haiku).`);
    }
    return choice?.message?.content || '';
  }
}
```

with:

```js
async function callAnalysisModel({ system, userContent, deepAnalysis = false, onFallback }) {
  const plan = resolveAnalysisPlan(deepAnalysis);

  // ── Standard (free) path: OpenRouter free model only, never Anthropic ──
  if (plan.provider === 'openrouter') {
    if (!openRouterClient) {
      throw new Error('OPENROUTER_API_KEY not set — required for free standard analysis. Set it, or pass deepAnalysis: true.');
    }
    const response = await openRouterClient.chat.completions.create({
      model: plan.model,
      max_tokens: plan.maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    });
    const choice = response.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new Error(`Free model ${plan.model} truncated output at ${plan.maxTokens} tokens. Try Deep Analysis for the full report.`);
    }
    return choice?.message?.content || '';
  }

  // ── Deep (paid) path: Anthropic first, OpenRouter fallback on credit/network error ──
  try {
    const response = await client.messages.create({
      model: plan.model,
      max_tokens: plan.maxTokens,
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
      max_tokens: Math.min(plan.maxTokens, 8192), // most OpenRouter models cap at 8192
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    });
    const choice = response.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new Error(`Fallback model ${FALLBACK_MODEL} truncated output at ${Math.min(plan.maxTokens, 8192)} tokens. Try a model with a larger output window.`);
    }
    return choice?.message?.content || '';
  }
}
```

- [ ] **Step 3: Verify the module still loads**

Run: `node -e "const a=require('./agent'); console.log(typeof a.resolveAnalysisPlan === 'function' ? 'OK' : 'BAD');"`
Expected: `OK`.

- [ ] **Step 4: Run the full suite**

Run: `node --test test/*.test.js`
Expected: PASS — counts unchanged from before this task plus the 4 routing tests; no regressions.

- [ ] **Step 5: Commit**

```bash
git add agent.js
git commit -m "Branch callAnalysisModel: free OpenRouter on standard, Anthropic on deep (free-AI Task 2)"
```

---

## Task 3: Thread `deepAnalysis` through `runMarshallAnalysis`

**Files:**
- Modify: `agent.js` (the `runMarshallAnalysis` function)

Skip the 3 search-dependent steps on standard; pass `deepAnalysis` to `callAnalysisModel`; add a tier log line and a standard-mode prompt note.

- [ ] **Step 1: Add the tier decision + log at the top of the `try` block**

In `runMarshallAnalysis`, change:

```js
  try {
    onProgress?.({ stage: 'fetching', message: `Fetching financial data for ${companyName}...`, progress: 10 });
```
to:
```js
  try {
    const deepAnalysis = opts.deepAnalysis === true;
    const plan = resolveAnalysisPlan(deepAnalysis);
    console.log(deepAnalysis ? `💎 Deep analysis via ${plan.model}` : `🆓 Standard (free) analysis via ${plan.model}`);

    onProgress?.({ stage: 'fetching', message: `Fetching financial data for ${companyName}...`, progress: 10 });
```

- [ ] **Step 2: Gate web search on the deep path**

Change:

```js
    const rawData = await fetchCompanyData(ticker, companyName, opts.extraQueries || []);
```
to:
```js
    // Web search is paid — only on the deep path. Standard relies on structured data + Yahoo.
    const rawData = deepAnalysis
      ? await fetchCompanyData(ticker, companyName, opts.extraQueries || [])
      : [];
```

- [ ] **Step 3: Add a standard-mode note to the analysis prompt**

The prompt interpolates `${structuredContext ? structuredContext + '\n\n' : ''}${dataContext}`. Add a mode note right after it. Change:

```js
${structuredContext ? structuredContext + '\n\n' : ''}${dataContext}

Today's date: ${new Date().toISOString().split('T')[0]}
```
to:
```js
${structuredContext ? structuredContext + '\n\n' : ''}${dataContext}${deepAnalysis ? '' : '\n\nNOTE: No web search was performed (free analysis). Base ALL numbers on the AUTHORITATIVE STRUCTURED FINANCIAL DATA above; do not invent news, guidance, or qualitative claims you cannot derive from it. Keep narratives concise.\n'}

Today's date: ${new Date().toISOString().split('T')[0]}
```

- [ ] **Step 4: Pass `deepAnalysis` to `callAnalysisModel`**

Change:

```js
    const responseText = await callAnalysisModel({
      system: MARSHALL_SYSTEM_PROMPT,
      userContent: analysisPrompt,
      maxTokens: 16000,
      onFallback: () => onProgress?.({ stage: 'gates', message: 'Switched to fallback AI — continuing analysis...', progress: 65 }),
    });
```
to:
```js
    const responseText = await callAnalysisModel({
      system: MARSHALL_SYSTEM_PROMPT,
      userContent: analysisPrompt,
      deepAnalysis,
      onFallback: () => onProgress?.({ stage: 'gates', message: 'Switched to fallback AI — continuing analysis...', progress: 65 }),
    });
```

- [ ] **Step 5: Gate Tier-2 re-fetch on the deep path**

Change:

```js
    if (process.env.ENABLE_TIER2_REFETCH !== 'false') {
      const needsRefetch = Object.values(analysisResult.verifications || {})
        .some(v => v.verdict === 'IMPLAUSIBLE' || v.verdict === 'UNSOURCED' || v.consensus?.agreementBand === 'LOW');
      if (needsRefetch) {
        onProgress?.({ stage: 'processing', message: 'Re-fetching unverified metrics...', progress: 93 });
        await runTier2Refetch(analysisResult, ticker, companyName);
      }
    }
```
to:
```js
    if (deepAnalysis && process.env.ENABLE_TIER2_REFETCH !== 'false') {
      const needsRefetch = Object.values(analysisResult.verifications || {})
        .some(v => v.verdict === 'IMPLAUSIBLE' || v.verdict === 'UNSOURCED' || v.consensus?.agreementBand === 'LOW');
      if (needsRefetch) {
        onProgress?.({ stage: 'processing', message: 'Re-fetching unverified metrics...', progress: 93 });
        await runTier2Refetch(analysisResult, ticker, companyName);
      }
    }
```

- [ ] **Step 6: Gate auto-retry on the deep path and pass the flag into the retry**

Change:

```js
    const attempt = opts.attempt || 1;
    if (analysisResult.confidence.band === 'LOW' && attempt === 1) {
```
to:
```js
    const attempt = opts.attempt || 1;
    if (deepAnalysis && analysisResult.confidence.band === 'LOW' && attempt === 1) {
```

And in the recursive retry call, change:

```js
      const retry = await runMarshallAnalysis(ticker, companyName, onProgress, {
        attempt: 2,
        extraQueries,
      });
```
to:
```js
      const retry = await runMarshallAnalysis(ticker, companyName, onProgress, {
        attempt: 2,
        extraQueries,
        deepAnalysis: true,
      });
```

- [ ] **Step 7: Run the full suite**

Run: `node --test test/*.test.js`
Expected: PASS — no regressions (these changes are guarded branches; existing tests don't exercise the network path).

- [ ] **Step 8: Commit**

```bash
git add agent.js
git commit -m "Skip web search/Tier-2/auto-retry on standard analysis path (free-AI Task 3)"
```

---

## Task 4: `deepAnalysis` flag + ingest-on-demand in the `/api/analyse` route

**Files:**
- Modify: `index.js` (the `POST /api/analyse` handler)

- [ ] **Step 1: Read `deepAnalysis` from the request body**

In `index.js`, change:

```js
app.post('/api/analyse', requireAdmin, analysisLimiter, async (req, res) => {
  const { ticker, companyName, forceRefresh } = req.body;
```
to:
```js
app.post('/api/analyse', requireAdmin, analysisLimiter, async (req, res) => {
  const { ticker, companyName, forceRefresh, deepAnalysis } = req.body;
```

- [ ] **Step 2: Ingest-on-demand + pass the flag (inside the try block)**

Change:

```js
  try {
    sendProgress({ stage: 'starting', message: `Starting analysis for ${companyName}...`, progress: 5 });
    const result = await runMarshallAnalysis(ticker, companyName, sendProgress);
```
to:
```js
  try {
    sendProgress({ stage: 'starting', message: `Starting analysis for ${companyName}...`, progress: 5 });

    // Standard (free) path needs structured data. Ingest on demand if the bundle is empty.
    if (deepAnalysis !== true) {
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

    const result = await runMarshallAnalysis(ticker, companyName, sendProgress, { deepAnalysis: deepAnalysis === true });
```

(`getCompanyBundle`, `ingestCompany`, and `INGEST_DB_HELPERS` are already imported/defined at the top of `index.js` — no new imports needed.)

- [ ] **Step 3: Verify the server module loads**

Run: `node -e "require('dotenv').config(); process.env.SUPABASE_URL='http://x'; process.env.SUPABASE_SERVICE_KEY='x'; try { require('./index'); } catch(e) { console.log('load error:', e.message); process.exit(1);} setTimeout(()=>{console.log('index.js loaded OK'); process.exit(0);}, 500);"`
Expected: `index.js loaded OK` (it may also print startup logs). If it errors on bind/port, that's fine — we only care that the module parses; if needed, re-run focusing on syntax via `node --check index.js`.

- [ ] **Step 4: Syntax-check both files**

Run: `node --check index.js && node --check agent.js && echo "SYNTAX OK"`
Expected: `SYNTAX OK`.

- [ ] **Step 5: Run the full suite**

Run: `node --test test/*.test.js`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add index.js
git commit -m "Add deepAnalysis flag + ingest-on-demand to /api/analyse (free-AI Task 4)"
```

---

## Task 5: Push & post-deploy validation

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```
Render auto-deploys in ~3-5 min.

- [ ] **Step 2: Confirm full suite green locally**

Run: `node --test test/*.test.js`
Expected: all prior tests + 4 new routing tests PASS.

- [ ] **Step 3: Post-deploy validation (manual, per spec §6/§7)**

In production (admin):
- Analyse an **un-ingested** ticker (standard, no flag). Render logs should show: `🆓 Standard (free) analysis via meta-llama/llama-3.3-70b-instruct:free`, an "ingesting" progress step, and **no** Anthropic call. OpenRouter dashboard shows usage on the `:free` model only.
- Analyse with `deepAnalysis: true` (e.g. via curl/admin). Logs should show `💎 Deep analysis via claude-sonnet-4-5` and the 5 web searches.
- Confirm credit consumption on the standard path is ~₹0.

---

## Follow-up (immediate, separate change — per spec §9)

After this plan is deployed and validated, add a **Deep Analysis** button/checkbox to the React analysis trigger (`client/src/`) that posts `deepAnalysis: true` to `/api/analyse`. Backend already supports it. This is its own small change (frontend + build + manual smoke test), kept out of this backend plan deliberately.

---

## Self-Review Notes

- **Spec coverage:** §4.1 flag → Task 4; §4.2 two paths → Tasks 2-3; §4.3 model routing → Task 2; §4.4 search routing → Task 3 Step 2; §4.5 ingest-on-demand → Task 4 Step 2; §4.6 observability → Task 3 Step 1; §4.7 resolveAnalysisPlan → Task 1; §5 error handling → Task 2 (no-key + truncation), Task 4 (no-data); §6 testing → Task 1 + Task 5 Step 3; §9 follow-up → noted, separate.
- **Placeholder scan:** every code step shows complete old/new code.
- **Type consistency:** `resolveAnalysisPlan(deepAnalysis, env)` returns `{ tier, provider, model, maxTokens, useWebSearch }` in Task 1 and is consumed with those exact fields in Tasks 2-3. `callAnalysisModel({ system, userContent, deepAnalysis, onFallback })` defined in Task 2, called with that shape in Task 3 Step 4. `deepAnalysis` boolean threaded route → runMarshallAnalysis → callAnalysisModel consistently.
