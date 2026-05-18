# Data Verification Layer — Design

**Date:** 2026-05-17
**Status:** Approved (awaiting written-spec review)
**Project:** ValueSight (Indian stock fundamental analysis)

## Problem

The Marshall 4-gate analysis depends on numbers extracted by an LLM from raw
web-search results. The confidence-score feature shipped earlier today
measures **completeness** ("is the field filled in?") but not **correctness**
("is the number right?"). Three failure modes remain unaddressed:

- **Incorrect** values — model hallucinates or misreads a number (e.g. "25%"
  becomes "2.5%")
- **Wrong entity** — search returns data for a similarly-named company
  (e.g. Tata Motors data shown for Tata Power)
- **Stale** historical values — extracted ROCE is from FY22 even though
  FY25 is available

Without verification, the user has no way to know whether a particular
metric should be trusted.

## Goal

Add a unified verification layer that runs after AI extraction and:

1. Forces the AI to **cite the source** for every metric (snippet + which
   of the 5 search results it came from)
2. Runs **plausibility** checks on every numeric metric (cheap, in JS,
   no API calls)
3. Cross-checks the **same metric across multiple sources** when found
   (free, uses the 5 search results we already have)
4. Tags every metric with a **freshness** marker (FY/quarter detected
   from the citation text)
5. On suspicious-but-plausible metrics, fires **one focused re-fetch**
   (Tier 2, only when warranted, capped at 3 per analysis)
6. Surfaces per-metric verification status as a small badge in the UI
7. Extends the existing confidence score with three new signals so the
   overall trust number reflects correctness, not just completeness

## Non-Goals

- Tier 3 (full second-model consensus pass) — too expensive for v1
- Manual override UI ("admin says trust this anyway") — deferred
- Cross-analysis trend detection ("this stock keeps getting wrong ROCE
  extracted") — deferred
- ML-based plausibility — pure rule-based v1

## Architecture

```
runMarshallAnalysis()
  -> fetchCompanyData()                (existing — 5 queries)
  -> callAnalysisModel()               (existing — AI extracts numbers + NOW citations)
  -> enrichWithLiveMarketData()        (existing — Yahoo override)
  -> verifyAnalysis()                  (new — Tier 1, free)
       - plausibility checks
       - cross-source consensus from raw search results
       - freshness extraction from citation text
  -> selectiveRefetch()                (new — Tier 2, costs tokens when triggered)
       - only for metrics that failed verification
       - capped at 3 calls per analysis
  -> computeConfidenceScore()          (existing — now reads verification flags)
```

The AI's analysis prompt is updated to require a `verification.citation`
object on every critical metric. Existing schema fields are preserved
for backward compatibility.

## Data Model

Each critical metric (in `gate2a.metrics`, `gate2c.indicators`,
`gate3.metrics`) gains a `verification` sub-object:

```json
"roce5yr": {
  "value": "18%",
  "status": "PASS",
  "confidence": "HIGH",
  "verification": {
    "citation": {
      "quote": "ROCE has averaged 18.2% over the last 5 years",
      "sourceIndex": 2,
      "sourceQuery": "site:screener.in TEJASNET consolidated profit loss..."
    },
    "sanity": {
      "passed": true,
      "expectedRange": "-50% to 80%",
      "parsedValue": 18
    },
    "consensus": {
      "agreementBand": "HIGH",
      "valuesSeen": [18, 18.2, 17.5],
      "spreadPct": 4.0
    },
    "freshness": {
      "asOf": "FY24",
      "ageMonths": 8,
      "stale": false
    },
    "refetched": false,
    "verdict": "VERIFIED"
  }
}
```

`verdict` is one of:

- `VERIFIED` — cited, plausible, consistent, fresh
- `SOURCED_ONLY` — cited but one of: sanity / consensus / freshness flagged
- `UNSOURCED` — AI did not provide a citation (e.g. older analysis)
- `IMPLAUSIBLE` — sanity-check failed (value outside expected range)

## Section 1 — Source Citations

The analysis prompt gains this mandatory section:

> For each metric you populate in gate2a.metrics, gate2c.indicators, and
> gate3.metrics, you MUST include a `verification.citation` object with:
> - `quote`: the exact sentence (≤ 200 chars) from a Data Source that
>   supports your number
> - `sourceIndex`: which Data Source (1-5) the quote came from
> - `sourceQuery`: the search query (provided in the prompt) for that source
>
> Do NOT fabricate citations. If no source supports a value, omit the
> citation field — the verification layer will mark it UNSOURCED.

Critical metrics for which citations are required (i.e. missing citation
counts as a failure):

- `gate2a.metrics`: `roce5yr`, `roeLast`, `revenueCAGR5yr`, `patCAGR5yr`,
  `debtEquity`, `promoterPledge`, `ocfQuality`
- `gate2c.indicators`: `promoterHolding`
- `gate3.metrics`: `currentPrice`, `marketCap`, `peRatio`, `priceBook`

## Section 2 — Plausibility Ranges

Pure JS, no API calls. Lives in `verification.js`. Per-metric rules:

| Metric key | Expected range (numeric) | Notes |
| --- | --- | --- |
| roce5yr | -50 to 80 | percent |
| roeLast | -50 to 80 | percent |
| revenueCAGR5yr | -50 to 200 | percent |
| patCAGR5yr | -100 to 300 | percent (volatile) |
| debtEquity | 0 to 10 | ratio |
| promoterHolding | 0 to 100 | percent |
| promoterPledge | 0 to 100 | percent |
| ocfQuality | -50 to 200 | percent |
| peRatio | 0 to 500 | ratio (allow extreme for loss-makers) |
| priceBook | 0 to 50 | ratio |
| currentPrice | 0.01 to 200000 | rupees |
| marketCap | 1 to 50000000 | crore |

A value outside the range sets `verification.sanity.passed = false` and
the metric's `verdict` becomes `IMPLAUSIBLE`. The number is **not**
auto-replaced — kept visible so the user sees what was extracted.

## Section 3 — Cross-Source Consensus

After AI extraction, `verification.js` scans the raw `rawData[i].data`
strings for each critical metric and extracts all numeric mentions
(simple regex per metric pattern, e.g. `/ROCE[^.]{0,30}?(\d+(?:\.\d+)?)\s*%/gi`
for ROCE).

If 2+ sources mention the metric:

| Spread (max - min) / mean | Agreement band |
| --- | --- |
| ≤ 5% | HIGH |
| 5–15% | MEDIUM |
| > 15% | LOW |

If only one source mentions it: `agreementBand: "SINGLE_SOURCE"`.
If no source mentions it: `agreementBand: "NOT_FOUND_IN_SOURCES"`.

LOW agreement on a critical metric → flag, prefer screener.in value
if available, otherwise mark `verdict: "SOURCED_ONLY"`.

## Section 4 — Freshness Extraction

For each metric's citation quote, scan for date markers:

- Fiscal year: `FY(2[0-9])` or `FY20(2[0-9])` (e.g. `FY24`, `FY2024`)
- Quarter: `Q[1-4]FY(2[0-9])` (e.g. `Q3FY25`)
- Month/year: `(January|February|...|December)\s+20(2[0-9])`
- "as of" patterns: `(as of|reported|last)\s+(...)`

Convert detected date to age in months from today. If `ageMonths > 12`
for current-quarter metrics (`currentPrice`, `peRatio`, `marketCap`,
quarterly results), `stale: true`. For 5-year metrics (`roce5yr`,
`patCAGR5yr` etc.), `stale: true` only if `ageMonths > 24`.

If no date found in citation: `asOf: null`, `stale: false` (no
information — do not penalise).

## Section 5 — Tier 2 Selective Re-Fetch

Triggered after Tier 1 completes. A metric qualifies for re-fetch if **all**
of these are true:

- Metric is in the **critical** list (Section 1)
- One or more of: `sanity.passed === false`, `verdict === "UNSOURCED"`,
  `consensus.agreementBand === "LOW"`
- The analysis has not yet exceeded the per-analysis re-fetch cap (3)

Re-fetch behaviour:

```
for each qualifying metric, in priority order (Gate 3 > Gate 2a > Gate 2c):
  if refetchCount >= 3: break
  query = buildFocusedQuery(metric, ticker, companyName)
  result = await callSearchModel({ userContent: instruction })
  extracted = extractNumberFromText(result, metric)
  if extracted is plausible:
    replace metric.value with the new value
    set verification.refetched = true
    set verification.refetchSource = "single-query verification"
    re-run sanity check on the new value
  refetchCount += 1
```

Focused queries (defined in `verification.js`):

| Metric | Focused query template |
| --- | --- |
| roce5yr | `site:screener.in {ticker} ROCE 5 year average consolidated` |
| currentPrice | `{companyName} {ticker} NSE current share price today` |
| marketCap | `{companyName} {ticker} market capitalisation NSE Cr` |
| promoterPledge | `{companyName} {ticker} promoter pledge shareholding pattern` |
| peRatio | `site:screener.in {ticker} P/E ratio TTM` |

Re-fetch is admin-rate-limited via the existing `analysisLimiter`.

## Section 6 — UI Surface

### Per-metric badge

A small badge appears next to each metric value in Gate 2a, Gate 2c, Gate 3:

| Badge | Colour | Meaning | Trigger |
| --- | --- | --- | --- |
| ✓ | var(--pass) | VERIFIED | All Tier-1 checks pass |
| ⓘ | var(--warn) | SOURCED_ONLY | One concern (stale OR low consensus OR unsourced) |
| ⚠ | var(--fail) | IMPLAUSIBLE | Sanity check failed |
| — | var(--text-3) | No verification data | Older analyses pre-feature |

Hovering the badge opens a small popover:

```
ROCE 5yr · ✓ VERIFIED

Source: Data Source 2 (site:screener.in TEJASNET...)
Quote: "ROCE has averaged 18.2% over the last 5 years"

Sanity:    ✓ 18% within expected range (-50% to 80%)
Consensus: ✓ HIGH agreement (3 sources: 18%, 18.2%, 17.5%)
Freshness: ✓ FY24 (8 months old)
```

For IMPLAUSIBLE metrics, popover shows:

```
ROCE 5yr · ⚠ IMPLAUSIBLE

Extracted value: 245% (outside plausible range -50% to 80%)
Likely cause: misread or hallucinated value
Recommendation: Re-run this analysis
```

### Analysis-level summary

At the top of Gate 2a (where the existing `dataQualityNote` lives),
add a one-line verification summary if any issues exist:

```
⚠ Verification: 2 metrics IMPLAUSIBLE · 1 metric UNSOURCED · 1 stale.
   Re-run recommended.
```

If all VERIFIED: line is omitted (clean UI for the common case).

## Section 7 — Confidence Score Integration

Three new signals join the existing 8 in `confidence.js`:

| New signal | Penalty | Passes when |
| --- | --- | --- |
| `metrics_have_citations` | -10 | ≥ 80% of critical metrics have a citation |
| `metrics_pass_sanity` | -15 | No critical metric is IMPLAUSIBLE |
| `cross_source_consensus` | -10 | ≥ 50% of critical metrics with multiple sources show HIGH/MEDIUM agreement |

Max possible penalty rises from 120 to 155, still clamped to score 0.
Band thresholds (80 / 60) unchanged.

## Section 8 — Backfill

The existing `POST /api/admin/backfill-confidence` endpoint is extended:

For each analysis:

1. Run sanity checks on all critical metric values (always possible
   even on old data)
2. Set `verification.sanity` for each metric
3. For older analyses that pre-date this feature: leave `citation`,
   `consensus`, and `freshness` empty; verdict becomes `UNSOURCED`
4. Recompute confidence score with the 11 signals
5. Save back

No new API calls during backfill — only JS rules.

The Admin Panel "Backfill Confidence Scores" button label changes to
"Backfill Verification + Confidence" with an updated subtitle.

## Section 9 — Backward Compatibility

- Older analyses without `verification` blocks: UI renders the grey "—"
  badge. Hover popover says "Verification data not available (pre-2026-05).
  Re-run for full verification."
- The `fundamental_metrics` table needs no new columns — verification
  detail lives only on the analysis JSON. Confidence score continues to
  feed `confidence_score` / `confidence_band`.
- AI output without `verification.citation` is gracefully handled
  (treated as UNSOURCED), not crashed.

## Section 10 — Acceptance Criteria

1. Every new analysis has a `verification.citation` (or explicit
   absence) on every critical metric.
2. Implausible values display a red ⚠ badge in the UI.
3. Tier 2 re-fetch fires at most 3 times per analysis and only when a
   critical metric fails verification.
4. The Admin Panel "Backfill" button correctly populates sanity
   verification on all existing analyses.
5. Per-metric hover popover shows citation quote + source index + sanity
   range + consensus values + freshness.
6. The three new confidence signals show in the `ConfidenceShield`
   breakdown popover with the same UX as the existing 8.
7. Verification adds < 200 ms median latency per analysis (Tier 1 only;
   Tier 2 adds 3-20s per fired re-fetch).

## Implementation Notes

- New file `verification.js` mirrors `confidence.js` — pure, testable,
  no I/O. Exports `verifyAnalysis(analysis, rawData)`.
- Tier 2 lives in `agent.js`, gated by feature flag
  `process.env.ENABLE_TIER2_REFETCH !== 'false'` (default on).
- The analysis prompt extension is added in `agent.js`'s
  `runMarshallAnalysis` (the prompt template string).
- `ConfidenceShield` is reused for the new signals; a new `VerificationBadge`
  component renders the per-metric ✓ / ⓘ / ⚠ / — pill.
