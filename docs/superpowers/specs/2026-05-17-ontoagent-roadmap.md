# ValueSight → OntoAgent Roadmap

**Date:** 2026-05-17
**Status:** Approved — execution sequence locked
**Inspiration:** McShane, Nirenburg & English, *Agents in the Long Game of AI* (MIT Press, 2024)

## Vision

Evolve ValueSight from "stock analyser" into a trustworthy, content-centric
**fundamental equity research and ranking agent** built on the OntoAgent
methodology: explicit ontology, sector-specific microtheories, episodic
memory, ranked deliberation, full reasoning trace, optional dialog.

## Already shipped (foundations)

| Component | OntoAgent mapping |
| --- | --- |
| Marshall 4-gate framework | Implicit script (Ch. 3.2.4 ontological scripts) |
| Search pipeline (5 queries → AI extraction) | Perception Recognition + Interpretation (Ch. 2.1.1–2.1.2) |
| Yahoo Finance enrichment | Hybrid data-driven layer (Ch. 2.2) |
| `confidence.js` + `verification.js` | Sanity / consensus / freshness / explainability (Ch. 8) |
| Smart filter "Undervalued" | Partial deliberation (Ch. 2.1.3) |

## Six-phase execution plan

Each phase produces working, shipped software on its own.

### Phase 4 — Episodic Memory + Portfolio Tracking (next)
Track positions the user owns + automatically capture every past analysis's
outcome (1m/3m/6m/1y returns vs verdict). Foundation for phases 3 and 5.

### Phase 3 — Ranking module
Cross-stock composite scoring: "rank top 10 BUY candidates today". Uses
episodic-memory historical accuracy to weight signals.

### Phase 1 — Financial Ontology layer
Refactor implicit concepts (`Company`, `Sector`, `Metric`, `Moat`, `Risk`)
into a formal ontology that all other modules reference.

### Phase 2 — Sector-specific microtheories
Replace one-size-fits-all Marshall rules with per-sector micromodels
(IT vs Bank vs FMCG benchmarks already partially differ — formalize).

### Phase 5 — Reasoning trace / deep explainability
Click any verdict → see full decision tree linking it to specific data,
rules, and historical evidence.

### Phase 6 — Dialog interface
"Why AVOID?" "What if ROCE improves to 20%?" — interactive what-if refinement.

## Execution order rationale

- **Phase 4 first**: highest immediate user value (was originally requested
  as Feature A). Provides historical-outcome data that phases 3 and 5 need.
- **Phase 3 second**: depends on phase 4's historical accuracy data to
  weight composite scores.
- **Phase 1 third**: pure refactor — visible benefit comes via phase 2.
- **Phase 2 fourth**: per-sector microtheories ride on top of the ontology.
- **Phase 5 fifth**: explainability gets richer once historical data and
  formal ontology exist to reference.
- **Phase 6 last**: dialog is most useful once all the underlying structure
  is in place.

Each phase will get its own brainstorm → spec → plan → implementation cycle.
