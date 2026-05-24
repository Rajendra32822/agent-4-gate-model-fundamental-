# Free AI by Default — Analysis Routing

**Date:** 2026-05-25
**Status:** Approved (awaiting written-spec review)
**Type:** Bug fix / behavior change (implements strategic decision Q4)
**Related:** Q4 ("Free OpenRouter by default; Anthropic only on user-flagged 'Deep Analysis'"), Tier model (Tier A/B free, Tier C deep). Phase 5 structured data layer (relied on here).

## 1. Problem

OpenRouter / Anthropic credits are draining on every analysis because `agent.js` is wired backwards from decision Q4:

- `callAnalysisModel` calls **Anthropic `claude-sonnet-4-5` first** (paid), with OpenRouter only as an error fallback.
- `callSearchModel` calls **Anthropic `claude-haiku-4-5` first** (paid) with **Perplexity Sonar** (paid) as fallback — and `fetchCompanyData` fires **5 of these per analysis**.
- The OpenRouter fallback default `OPENROUTER_MODEL = 'google/gemma-4-31b-it'` has **no `:free` suffix**, so even the fallback is paid.

Net: standard analyses run entirely on paid models + 5 paid web searches.

## 2. Goal

Make the **default** analysis path free (OpenRouter free model + structured data + Yahoo), reserving paid Anthropic + web search for an explicit, user-flagged **Deep Analysis**. Stop the credit drain on the next deploy without breaking the analysis pipeline.

## 3. Locked decisions (brainstorm 2026-05-25)

| # | Decision |
| --- | --- |
| Standard-path data | **A — Ingest-on-demand**: if the structured bundle is empty, run the free Phase 5 screener scraper first, then analyze from structured data + Yahoo. No paid web searches on the standard path. |
| Token cap | **A — Cap at 8,192** on the free path + keep the existing truncation guard; one prompt line asking the free model to be concise. No schema change. |
| Deep trigger | **A — API flag now** (`deepAnalysis`, default `false`); real UI button is an immediate **follow-up** (separate spec/change). |
| Default free model | `meta-llama/llama-3.3-70b-instruct:free`, overridable via existing `OPENROUTER_MODEL` env var. |

## 4. Design

### 4.1 The `deepAnalysis` flag

`POST /api/analyse` body gains `deepAnalysis: boolean` (default `false`). Threaded as `opts.deepAnalysis` into `runMarshallAnalysis(ticker, companyName, onProgress, opts)`. Default-false is what stops the drain.

### 4.2 Two paths in `runMarshallAnalysis`

| Aspect | Standard (free, default) | Deep (paid, `deepAnalysis: true`) |
| --- | --- | --- |
| Structured data | DB bundle; **ingest-on-demand** if empty (route-level) | DB bundle |
| Web searches (`fetchCompanyData`) | **skipped** | 5 searches (current behavior) |
| Analysis model | OpenRouter free (`meta-llama/llama-3.3-70b-instruct:free`), `maxTokens 8192` | Anthropic `claude-sonnet-4-5`, `maxTokens 16000`, OpenRouter fallback on error (current behavior) |
| Live price | Yahoo Finance | Yahoo Finance |
| Tier-2 selective re-fetch | **skipped** (search-based) | runs (current behavior) |
| Auto-retry w/ expanded queries | **skipped** (search-based) | runs (current behavior) |
| Cost | ~₹0 | paid |

### 4.3 Model routing — `callAnalysisModel`

Add a `deepAnalysis` argument:

- **deep** → existing logic unchanged: Anthropic Sonnet first, OpenRouter fallback on credit/network error, `maxTokens 16000`.
- **standard** → call the OpenRouter **free** model directly (no Anthropic call), `maxTokens 8192`, keep the existing `finish_reason === 'length'` truncation guard.
- **standard with no `OPENROUTER_API_KEY`** → throw a clear configuration error ("Set OPENROUTER_API_KEY to run free analysis, or pass deepAnalysis: true"). Do **not** silently fall back to paid Anthropic — that would defeat the fix.

### 4.4 Search routing

`fetchCompanyData` (the 5 web searches) runs **only on the deep path**. The standard path never calls it. `callSearchModel` itself is unchanged; it's simply not invoked on standard.

### 4.5 Ingest-on-demand — lives in the route (`index.js`), not `agent.js`

Keeps `agent.js` decoupled from the ingestion subsystem. In `POST /api/analyse`, on the standard path:

1. Fetch the bundle (`getCompanyBundle(ticker)`).
2. If empty/missing, call `ingestCompany(ticker, INGEST_DB_HELPERS)` (free: HTTP GET screener.in + parse + derive + aggregate; no AI). Both are already imported in `index.js`.
3. Re-check; if still no usable data, return a clear error: "Couldn't fetch data for {ticker} from screener.in — try Deep Analysis." (Deep doesn't depend on the bundle.)
4. Proceed to `runMarshallAnalysis`, which reads the now-populated bundle.

Deep path skips this (it has web search as its data source).

### 4.6 Observability

One log line per run so the drain can be confirmed stopped from Render logs:
- Standard: `🆓 Standard (free) analysis via meta-llama/llama-3.3-70b-instruct:free`
- Deep: `💎 Deep analysis via claude-sonnet-4-5`

### 4.7 Pure decision helper (for testability)

Extract the routing decision into a pure function **defined and exported from `agent.js`** (added to its `module.exports`), so the test can `require('./agent')` and call it without triggering any network/DB (the module already loads side-effect-free). Signature:

```js
// resolveAnalysisPlan(deepAnalysis, env) → routing plan
function resolveAnalysisPlan(deepAnalysis, env = process.env) {
  if (deepAnalysis) {
    return { tier: 'deep', provider: 'anthropic', model: 'claude-sonnet-4-5', maxTokens: 16000, useWebSearch: true };
  }
  return {
    tier: 'standard', provider: 'openrouter',
    model: env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    maxTokens: 8192, useWebSearch: false,
  };
}
```

`runMarshallAnalysis` and `callAnalysisModel` consume this plan.

## 5. Error handling

| Case | Behavior |
| --- | --- |
| Standard, no `OPENROUTER_API_KEY` | Throw clear config error (no silent paid fallback) |
| Standard, ingest-on-demand yields no data | Clear error: "try Deep Analysis" |
| Standard, free model truncates (`finish_reason: length`) | Existing guard throws a clear "truncated — try Deep Analysis" message |
| Deep, Anthropic credit/network error | Existing OpenRouter fallback (unchanged) |

## 6. Testing

- **Unit (TDD):** `resolveAnalysisPlan(deepAnalysis, env)` — standard returns OpenRouter free + 8192 + no search; deep returns Anthropic + 16000 + search; honors `OPENROUTER_MODEL` override. New `test/agentRouting.test.js`.
- **Manual post-deploy:** run a standard analysis on an un-ingested ticker → Render logs show `🆓 Standard (free) via …`, an ingest-on-demand line, and **no** Anthropic call; OpenRouter usage shows the `:free` model. Run one with `deepAnalysis: true` → logs show `💎 Deep …` and the 5 searches.
- Full suite stays green (this change is additive to existing tested pure modules; `agent.js`/`index.js` are I/O and covered by the routing unit test + manual checks per the master plan's testing approach).

## 7. Acceptance criteria

1. A standard analysis makes **zero** Anthropic calls and **zero** paid web searches; uses the OpenRouter `:free` model + structured data + Yahoo.
2. An un-ingested ticker still produces a standard analysis (ingest-on-demand populated the bundle).
3. `deepAnalysis: true` reproduces today's full behavior (Anthropic Sonnet + 5 searches + Tier-2 + auto-retry).
4. Missing `OPENROUTER_API_KEY` on the standard path errors clearly instead of spending on Anthropic.
5. `resolveAnalysisPlan` unit tests pass; full suite green.
6. Render logs clearly show which tier each analysis used.

## 8. Out of scope

- **Deep Analysis UI button** — immediate follow-up, separate change (per Q3 decision A).
- Per-user token budgets / cost meter (master plan M9, later).
- Changing the deep path's search models or the Marshall schema.
- Removing the AI-extraction fallback entirely (master plan Phase 5.3, deferred).

## 9. Follow-up (immediate, separate)

Add a "Deep Analysis" button/checkbox to the React analysis trigger that posts `deepAnalysis: true`. Backend already supports it after this change.
