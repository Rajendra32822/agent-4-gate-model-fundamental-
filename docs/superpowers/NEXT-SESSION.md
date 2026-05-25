# ValueSight — Next-Session Handoff

_Last updated: 2026-05-25._

Paste the prompt below into a fresh session. Everything factual here is also in
`memory/project_fundamental_agent.md` (the source of truth) — this file is just a quick on-ramp.

---

## Kickoff prompt

```
Continue work on ValueSight — my Indian-stock fundamental equity-research & ranking agent.

PROJECT
- Local path: C:/agent-4-gate-model-fundamental--main/agent-4-gate-model-fundamental--main/
- Node/Express + React + Supabase, deployed on Render (auto-deploys from GitHub main).
- Repo: https://github.com/Rajendra32822/agent-4-gate-model-fundamental-.git
- IMPORTANT: my GitHub token has no PR scope — commit + push directly to main (no PRs). Render rebuilds in ~3-5 min.
- SQL migrations live in db_migrations/ — I run them manually in the Supabase SQL editor.
- Tests: `node --test test/*.test.js`. Node is v24 locally, so the bare `node --test test/` form fails — always use the glob. 158 tests currently pass.
- client/ has NO node_modules locally, so frontend changes can't be built/browser-tested here — Render's build is the gate; verify UI in prod after deploy.

READ MEMORY FIRST
- memory/project_fundamental_agent.md — North Star, locked Q1–Q10 decisions, tier model, full phasing, dated "SHIPPED" notes.
- memory/feedback_step_by_step.md — work one step at a time; don't batch.
- Skim docs/superpowers/specs/ and docs/superpowers/plans/ — every phase has a dated spec + plan.

WORKFLOW I LIKE
1. /brainstorming to align scope — focused multiple-choice questions, one batch at a time, recommend defaults.
2. Write spec to docs/superpowers/specs/, commit.
3. Write plan to docs/superpowers/plans/, commit.
4. Execute INLINE (not subagents — rate limits). TDD: failing test → implement → pass → commit each task. Push at end.
5. Validate scraper/data work against LIVE screener.in before declaring done.

SHIPPED LAST SESSION (2026-05-24/25), all on main:
- Phase 6 — Financial ontology (ontology.js, 65 metrics).
- Free-AI-by-default: standard analysis = free OpenRouter model; Anthropic + web search gated behind a deepAnalysis flag. Plus ingest-on-demand, /api/lookup local-first/free, Deep Analysis UI button. Stopped the credit drain.
- Gate-3 valuation anchor fix (inject live price before AI + consistency guard).
- Phase 7 — Sector microtheories (sectors table + primary_metric; sector-aware ranking + AI prompt + admin panel).
- Phase 9 Slice 1 — Corporate actions ledger + ticker/name-change resolution.

PENDING ON MY SIDE — ASK ME WHAT I'VE DONE (these gate the new features):
- Run migrations in Supabase: 2026-05-25-phase7-sector-microtheories.sql and 2026-05-25-phase9-corporate-actions.sql (plus older phase5/5.2/8 if not already run).
- Phase 7: Admin page → "Seed / reset defaults" to populate the 20 sectors.
- Verify a standard analysis logs the free Llama model (NOT Gemma). If OpenRouter rejects `meta-llama/llama-3.3-70b-instruct:free`, standard analysis ERRORS by design (no paid fallback) — swap the id.
- Smoke-test new UI: Deep Analysis button, Sector Benchmarks panel, Corporate Actions panel, valuation-warning suppression.

WHAT'S NEXT — ask me which before starting:
- Phase 9 Slice 2 — a plan ALREADY EXISTS at docs/superpowers/plans/2026-05-25-phase9-slice2.md (Yahoo/NSE auto-fetcher + quarterly result dates). Review it with me, then execute.
- A daily_prices table foundation — unblocks Phase 9 Slice 3 (split/bonus price-adjust) AND Phase 10.
- Phase 9 Slice 4 — merger/demerger appliers.
- Phase 10 — technical analysis (RSI/MACD/MAs); also needs daily_prices.

Ask me which direction, and whether I've finished the pending production steps, before you start building.
```

---

## Repo hygiene note
`node_modules/` shows as untracked (not gitignored). Never `git add -A`/`git add .` — always add specific files so it isn't committed. Consider adding `node_modules/` to `.gitignore`.
