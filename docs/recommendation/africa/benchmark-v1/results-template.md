# Results Template — African/Nigerian Fashion Benchmark v1

**Phase:** 5C.3 Track B / Track C (execution)  
**Version:** 1.0  
**Date:** 2026-08-19  

> This template is completed during Track C (benchmark execution), not during Track B.
> Track B constructs the benchmark and stops. This file exists so the structure is
> pre-agreed before the engine is run.
>
> **Do not fill in this template until:**
> 1. Gold labels are independently signed and locked (`gold-standard/` directory exists)
> 2. Product Owner has approved engine execution
> 3. Engine v3.7 is run without receiving gold labels

---

## Section A — Engine run metadata

| Field | Value |
|---|---|
| Engine version | v3.7 (frozen — must not change) |
| Run date | |
| Runner script | `scripts/run-africa-benchmark.ts` (Track C deliverable) |
| Gold-label version | gold-labels-v1.0 |
| Reviewer identifier(s) | [stored in private external document — not here] |
| Gold-label lock date | |
| Golden regression suite (v3.7) — run before | [ ] Pass / [ ] Fail |
| Golden regression suite (v3.7) — run after | [ ] Pass / [ ] Fail |
| Any regression vs pre-run baseline | [ ] None / [ ] Yes — describe: |

---

## Section B — Overall benchmark metrics

| Metric | GU (n=40) | OR (n=30) | OC (n=20) | WX (n=10) | All (n=100) |
|---|---|---|---|---|---|
| Top-1 accuracy | | | | | |
| Top-3 accuracy | | | | | |
| Pairwise accuracy | | | | | |
| Mean regret | | | | | |
| Median regret | | | | | |
| Max regret | | | | | |
| Hard-constraint violations | | | | | |
| Fallback-activation rate | | | | | |
| Kendall's τ (mean) | | | | | |
| Representation-gap rate (GU only) | | — | — | — | |
| Disputed cases excluded | | | | | |

---

## Section C — Category-level breakdown

### C1 — Capability-tag breakdown (fill after run)

| Capability tag | Cases | Top-1 | Top-3 | Mean regret | Notes |
|---|---|---|---|---|---|
| Ankara / wax-print | GU-01…11, OR-13…18, OR-20 | | | | |
| Lace | GU-12…15, OR-23 | | | | |
| Aso-ebi coordination | GU-16, GU-17, OR-02, OR-04, OC-04 | | | | |
| Aso-oke | GU-16, GU-17, GU-22 | | | | |
| Agbada (classification) | GU-33 | | | | |
| Senator (classification) | GU-34, GU-35 | | | | |
| Kaftan | GU-25…27, OR-01, OR-04 | | | | |
| Boubou | GU-26, GU-37 | | | | |
| Church | OR-04, OC-05…07 | | | | |
| Wedding — traditional | OR-01, OR-02, OC-01 | | | | |
| Wedding — Western | OC-02 | | | | |
| Naming ceremony | OR-05, OC-08 | | | | |
| Business / corporate | OR-06, OR-07, OR-08, OC-12…14 | | | | |
| Hot / humid | WX-01, WX-03, WX-05 | | | | |
| Rain | WX-02, WX-04, WX-10 | | | | |
| African-Western fusion | GU-28…32, OR-06, OR-07, OR-30 | | | | |
| Co-ordinated set identity | OR-17, OR-18, OR-28 | | | | |
| Adversarial | OR-19…30 | | | | |
| Diaspora | OR-30, OC-20, WX-09 | | | | |

---

## Section D — Per-case results (to be populated by runner script)

One row per case. Runner script outputs this table as JSON/CSV; this is the human-readable form.

| Case ID | Category | Gold preferred | Engine top-1 | Match? | Engine top-3 | Match? | Regret | Kendall τ | Fallback? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| GU-01 | | | | | | | | | | |
| GU-02 | | | | | | | | | | |
| … | | | | | | | | | | |
| WX-10 | | | | | | | | | | |

---

## Section E — Finding classification

After the run, classify each finding into one of the following categories:

| Category | Code | Description |
|---|---|---|
| No material gap | A | Engine output matches or is within acceptable range of gold label |
| Taxonomy / data representation | B | Engine cannot represent the cultural concept; gap is in the schema, not the algorithm |
| Candidate generation | C | Correct outfit could not be generated because of a hard constraint or season gate |
| Constraint | D | A hard constraint (rain, season, formality) blocked a valid outfit |
| Ranking | E | Correct outfit was generated but scored lower than inferior alternatives |
| Classification | F | Gemini misclassified the garment at upload; scoring received wrong inputs |
| External AI limitation | G | Gap is in the Gemini classification capability, not the recommendation engine |
| Legitimate disagreement | H | Reviewer flagged as disputed; no single correct answer |

### E1 — Finding distribution (fill after analysis)

| Category | Count | Cases |
|---|---|---|
| A — No material gap | | |
| B — Taxonomy / data representation | | |
| C — Candidate generation | | |
| D — Constraint | | |
| E — Ranking | | |
| F — Classification | | |
| G — External AI limitation | | |
| H — Legitimate disagreement | | |

---

## Section F — Hypotheses and proposed experiments

For each E / G finding, record a hypothesis and a proposed experiment. Do not implement
fixes during Track C — record them for Product Owner consideration.

| Finding ID | Hypothesis | Proposed experiment | Priority | Estimated effort |
|---|---|---|---|---|
| | | | | |

---

## Section G — Inter-rater reliability (if second reviewer was used)

| Statistic | Value |
|---|---|
| Cases covered by second reviewer | |
| Full agreement (top-1 match) | |
| Partial agreement (top-1 differs; top-3 matches) | |
| Material disagreement (top-3 differs) | |
| Cases flagged as disputed | |

---

## Section H — Attestation

| Statement | Confirmed by | Date |
|---|---|---|
| Engine v3.7 was not modified during or before this run | | |
| Gold labels were not modified after being locked | | |
| Engine did not receive gold labels before its output was recorded | | |
| `__tests__/recommendation-golden-set.ts` passed before and after run | | |
| No production data, secrets, or configuration was changed | | |
| No deployment was performed | | |
