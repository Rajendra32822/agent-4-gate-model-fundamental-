# Data Quality Confidence Score — Design

**Date:** 2026-05-17
**Status:** Approved (awaiting written-spec review)
**Project:** ValueSight (Indian stock fundamental analysis)

## Problem

The 4-gate analysis output is only as good as the data the AI extracts from web
search results. For mid- and small-cap stocks, search results are noisy and the
model frequently produces:

- Missing live price and market cap
- Standalone financials when consolidated were unavailable
- Fewer than 5 years of historical data
- High proportion of `confidence: LOW` per-metric flags

There is no way for the user to know — at a glance — whether a given analysis
is solidly grounded or shaky. The Yahoo Finance enrichment added in the previous
sprint helps with price/market cap specifically, but does not signal the broader
data quality across all gates.

## Goal

Produce a single, deterministic 0-100 **confidence score** computed from
objective signals after each analysis. Use that score to:

1. **Auto-retry** newly created analyses that score below the threshold,
   once, before saving — so flaky first attempts self-heal at creation time.
2. **Warn** the user on existing analyses with low confidence and offer a
   manual "re-run with fresh data" button.
3. **Filter** the dashboard so the "Undervalued" smart filter can optionally
   require HIGH confidence — keeping investment decisions on the strongest
   data only.

## Non-Goals

- The score is not a verdict. A LOW-confidence analysis can still be correct;
  the user is informed, not blocked.
- No new database tables. Score lives on the existing analysis JSON.
- No machine-learning calibration — purely rules-based, transparent, auditable.
- No retries beyond one per creation attempt; no infinite loops.

## Scoring Rubric

Score starts at 100. Each failing signal subtracts a fixed penalty.

| Signal | Penalty | Source field(s) checked |
| --- | --- | --- |
| Live price missing (Yahoo did not return a price) | -25 | `analysis.liveQuote.price` |
| Live market cap missing | -15 | `analysis.liveQuote.marketCap` |
| Fewer than 3 years of ROCE history | -20 | `gate2a.metrics.roce5yr.yearsOfData` |
| Financials are standalone, not consolidated | -15 | `gate2a.financialsType === 'STANDALONE'` |
| AI's self-reported Gate 2a confidence is LOW | -15 | `gate2a.dataConfidence === 'LOW'` |
| Three or more critical metrics have `confidence: LOW` | -10 | Among: `roce5yr`, `roeLast`, `revenueCAGR5yr`, `patCAGR5yr`, `debtEquity`, `promoterPledge`, `ocfQuality`, `promoterHolding` |
| Fewer than 4 of 5 search queries returned data | -10 | `analysis.rawDataSources < 4` |
| Latest analysis data older than 18 months | -10 | `analysis.analysisDate` vs current date |

Maximum possible penalty (all signals failing): 120 — score is clamped to 0.

### Bands

| Band | Range | UI treatment | Behaviour |
| --- | --- | --- | --- |
| HIGH | 80-100 | Green shield | No action |
| MEDIUM | 60-79 | Amber shield | Informational warning |
| LOW | 0-59 | Red shield | Auto-retry on creation; manual button on existing |

## Auto-Retry Flow

Triggered only for **newly created** analyses. Existing analyses must be
re-run manually via the button.

```
runMarshallAnalysis(ticker, companyName)
  -> fetch + AI + parse        (existing)
  -> enrichWithLiveMarketData  (existing)
  -> computeConfidenceScore    (new)

If score < 60 AND attempt === 1:
  log "Confidence {score} - auto-retrying with deeper search"
  runMarshallAnalysis(ticker, companyName, { attempt: 2, expandedSearch: true })
    -> on attempt 2 the search layer uses extra queries
       (alternate exchange, screener.in direct, moneycontrol)

  Keep whichever attempt has the higher score.
  Mark the saved analysis with confidence.retryUsed = true.

Save final result.
```

The `attempt` flag prevents recursive retries. The "expanded search" on
attempt 2 is concrete and signal-driven:

- If `liveQuote.price` is missing on attempt 1, prepend a focused query:
  `"site:moneycontrol.com {ticker} current share price live"`
- If `yearsOfData < 3` for ROCE, prepend a focused query:
  `"site:screener.in {ticker} 10 years financials profit loss"`
- If `financialsType === 'STANDALONE'`, prepend a focused query:
  `"{companyName} consolidated annual report FY{currentYear} subsidiary"`

Each focused query is added as a prefix to the existing 5-query list. Search
order matters — adding to the front means the AI sees the most-relevant data
first in the prompt. The retry is a single end-to-end pass; no incremental
patching of fields.

## Manual Re-Run Flow

On any saved analysis where `confidence.band === 'LOW'`, the Gate 3 panel
shows a button (admin-only, since it consumes API tokens):

```
Re-run analysis (current confidence: LOW 42/100)
```

Clicking it calls the existing `POST /api/analyse` endpoint with
`forceRefresh: true`. Treated like a fresh creation — eligible for one
auto-retry if it again scores LOW.

## Data Model

Confidence is stored as a single object on the analysis JSON. No new tables,
no schema migrations.

```json
{
  "ticker": "TEJASNET",
  "company": "Tejas Networks Limited",
  ...,
  "confidence": {
    "score": 78,
    "band": "MEDIUM",
    "breakdown": [
      { "signal": "live_price",              "passed": true,  "penalty": 0  },
      { "signal": "live_market_cap",         "passed": false, "penalty": 15 },
      { "signal": "roce_years_of_data_gte_3", "passed": true, "penalty": 0  },
      { "signal": "consolidated_financials", "passed": true,  "penalty": 0  },
      { "signal": "gate2a_confidence_high",  "passed": true,  "penalty": 0  },
      { "signal": "critical_metrics_high_confidence", "passed": false, "penalty": 10 },
      { "signal": "search_queries_returned", "passed": true,  "penalty": 0  },
      { "signal": "data_freshness_18_months", "passed": true, "penalty": 0  }
    ],
    "retryUsed": false,
    "computedAt": "2026-05-17T14:23:00Z"
  }
}
```

Persisted via the existing `data` JSONB column in the `analyses` table.

The `fundamental_metrics` table also gains two columns for SQL queryability
of the smart filter:

```sql
ALTER TABLE fundamental_metrics
  ADD COLUMN confidence_score INTEGER,
  ADD COLUMN confidence_band  TEXT;
```

These are populated by `saveFundamentalMetrics()` from
`analysis.confidence.score` and `analysis.confidence.band`.

## Backfill for Existing Analyses

Run-once admin endpoint:

```
POST /api/admin/backfill-confidence
```

Iterates all rows in `analyses`, computes the score from the already-saved
JSON (no fresh Yahoo or AI calls), writes the updated JSON back, and refreshes
`fundamental_metrics.confidence_*` for each row.

Signals that depend on fields not present on older analyses
(e.g. `liveQuote.price` predates the Yahoo enrichment) are treated as failing
and penalised — owners can use the manual re-run button to refresh data.

## UI Surface

### Analysis view

A shield badge appears next to the verdict at the top of the analysis:

```
TEJASNET                            AVOID
Tejas Networks Limited     [SHIELD] MEDIUM 78/100
Analysed 2026-05-17
```

Hovering the shield shows the breakdown — each signal with check or cross
and the penalty applied. Clicking on a LOW shield reveals the re-run button.

### Dashboard

- New column "Conf" in the table view between Verdict and CMP, showing a
  small coloured shield with the numeric score.
- Smart-filter dropdown gets a new option:
  `Undervalued + HIGH confidence only`
- New stat chip on the stats bar: `★ N High-Confidence Buys` showing the
  count of analyses passing all gates AND with `confidence.band === 'HIGH'`.
- CSV export gains two new columns: `Confidence`, `ConfidenceScore`.

## Implementation Components

### 1. `confidence.js` (new file)

Pure function module — no I/O, no AI calls. Easy to unit test.

```
computeConfidenceScore(analysis) -> { score, band, breakdown, computedAt }
```

Each signal is a small function: `(analysis) -> { passed, penalty }`.
Add or remove signals by editing one array.

### 2. `agent.js` modifications

- After `enrichWithLiveMarketData`, call `computeConfidenceScore`
- If `score < 60` and `attempt === 1`, run one more attempt with
  expanded search queries; keep the higher-scoring result
- Attach the final score object to the analysis before returning

### 3. `db.js` modifications

- `saveFundamentalMetrics` writes `confidence_score`, `confidence_band`
- No change to `saveAnalysis` (confidence is in the JSON blob)

### 4. `index.js` modifications

- New endpoint `POST /api/admin/backfill-confidence`
- Existing analysis endpoint unchanged

### 5. Migration

Single SQL migration the user runs once in the Supabase SQL editor:

```sql
ALTER TABLE fundamental_metrics
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS confidence_band  TEXT;
```

### 6. Frontend changes

- `AnalysisView.js`: shield badge + breakdown popover + admin re-run button
- `Dashboard.js`: confidence column, stat chip, filter option, CSV export
- Shared `ConfidenceShield.js` component for the badge

## Testing & Edge Cases

- **Missing `liveQuote` on older analyses** — those signals fail; score reflects
  reality. Backfill leaves them low until manually re-run.
- **AI returns the score field itself** — defensive: always overwrite with the
  deterministic computation, never trust AI to score itself.
- **Retry returns lower score** — keep the original, log it, do not save the
  worse result.
- **Yahoo returns price but not market cap** — common (v7 endpoint blocked);
  only the market-cap signal fails; analysis still scores above the threshold
  if other signals are healthy.
- **Re-run button rate-limiting** — already gated by `analysisLimiter`
  (20 requests/hour per IP); no new limiter needed.
- **AI's self-reported confidence is HIGH but data is sparse** — multiple
  independent signals (years of data, search queries returned) provide
  redundancy; one over-confident AI claim cannot push the score above the
  threshold on its own.

## Out of Scope

- Calibrating penalty weights from real data (rules-based for v1; can be
  tuned later)
- Differentiating per-gate confidence (one overall score for v1)
- Confidence-aware AI prompting (e.g. asking the model to focus on weak
  signals during retry) — deferred
- Push notifications when a low-confidence analysis is refreshed — deferred

## Acceptance Criteria

1. A confidence shield (HIGH/MEDIUM/LOW + numeric score) is visible on the
   analysis page and dashboard table for every analysis, old or new.
2. When a new analysis scores below 60 on first attempt, the system silently
   re-runs once. The final saved analysis is the better of the two attempts.
3. The "Undervalued" smart filter can optionally require HIGH confidence.
4. CSV export includes the confidence band and score.
5. An admin can run the backfill endpoint once and have every existing
   analysis scored in under 60 seconds total.
6. Computing the score adds less than 10 ms per analysis (pure local function,
   no I/O).
