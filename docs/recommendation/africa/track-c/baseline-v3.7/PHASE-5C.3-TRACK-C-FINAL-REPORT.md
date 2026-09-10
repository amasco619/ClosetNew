# Phase 5C.3 — Track C Baseline Report

## 1. Executive Summary

Track C executed all 100 frozen Nigerian/African benchmark cases against unchanged Recommendation Engine v3.7. Ninety-four cases completed successfully; six culturally salient GU inputs returned production classifier failures/guardrails. Across 60 outfit/context cases, top-1 was 50.0%, top-3 95.0%, pairwise agreement 66.3%, mean regret 7.4, and mean Kendall's tau 0.315.

**Final recommendation: C — Material recommendation gaps require remediation before Nigerian/African launch.** The evidence is not one arbitrary threshold: six unusable classifications, nine clearly inappropriate top-ranked outfits, weak weather top-1 (30.0%), sparse production generation coverage, and systematic cultural taxonomy gaps coexist with meaningful Ankara and top-3 strengths.

## 2. Execution Environment

Node v22.22.0, npm 10.9.4, commit `8fd970d6a0267096bac89ebb5d38673b2d340bc2`, execution date 2026-09-10, Africa/Lagos. GU used the real production classifier; OR/OC/WX used unchanged production scoring and the unchanged full generator.

## 3. Benchmark Integrity Confirmation

Only `frozen-v1/` benchmark inputs were used. All 53 frozen checksums passed. Gold was inaccessible during execution. One hundred case outputs and `summary.json` were written, hashed, sealed, verified, and made read-only before the evaluator opened gold. Reviewer materials contained no predictions or developer steering metadata. The independent-reviewer attestation was verified without modifying frozen labels.

## 4. Case Execution Summary

| Family | Attempted | Successful | Failed | Skipped |
|---|---:|---:|---:|---:|
| GU | 40 | 34 | 6 | 0 |
| OR | 30 | 30 | 0 | 0 |
| OC | 20 | 20 | 0 | 0 |
| WX | 10 | 10 | 0 | 0 |
| **Total** | **100** | **94** | **6** | **0** |

## 5. Overall Results

| Metric | Result |
|---|---:|
| Context top-1 | 50.0% |
| Context top-3 | 95.0% |
| Supported pairwise agreement | 66.3% |
| Mean regret / max regret | 7.4 / 25 |
| Mean Kendall's tau | 0.315 |
| Mean acceptable-candidate generation recall | 15.7% |
| Mean not-acceptable exclusion | 97.5% |
| Exact candidate generation | 29/232 (12.5%) |
| Cases with any exact generated candidate | 21/60 |
| Empty production pools | 17/60 |
| Fallback activated | 0/60 |

## 6. Garment Classification Results

Thirty-four of 40 calls succeeded. Broad category was 87.5% on 32 inferable cases; garment-type semantic agreement 37.5%; fabric 65.0%; pattern 47.5%; scale 27.5%; colour 47.5%. Generic subtype labels preserved useful visual fields in many cases but did not preserve cultural identity.

## 7. Outfit Ranking Results

OR top-1 53.3%, top-3 96.7%, mean regret 6.5. OR-13–20 Ankara pairing was stronger than the OR aggregate, but OR-17 was a material matching-set miss.

## 8. Occasion Results

OC top-1 55.0%, top-3 95.0%, mean regret 6.2. High-impact misses included church thanksgiving, Yoruba funeral dress code, and fine-dining date.

## 9. Weather Results

WX top-1 30.0%, top-3 90.0%, mean regret 12.7. WX-01, WX-03, WX-04, and WX-09 were P1. Weather applies in full generation, not the fixed candidate scoring functions, and exact generated-candidate coverage was sparse; both limitations are explicit.

## 10. Ankara/Wax-Print Results

The focused OR-13–20 slice achieved 62.5% top-1 and 100.0% top-3. GU-01–11 had 10/11 successful calls and 71.5% mean dimension agreement. See `ankara-analysis.md`.

## 11. Cultural-Context Results

The defined 16-case cultural slice achieved 56.3% top-1, 100.0% top-3, mean regret 6.0. Strong top-3 coverage contrasts with serious top-1 misses. See `cultural-context-analysis.md`.

## 12. Western-Default Bias Analysis

Evidence is targeted: generic Western subtype substitutions, unsupported gele/headwear/stole guardrails, OR-17's conventional office combination, and WX-09's jeans selection. Counter-evidence includes strong Ankara pairings and correct traditional rain cases. See `western-default-bias-analysis.md`.

## 13. Weather/Culture Trade-Off Analysis

WX-09 missed both warmth and cultural identity, whereas WX-10 correctly preserved traditional-event identity with rain-safe accessories. See `weather-culture-tradeoff-analysis.md`.

## 14. Failure Taxonomy

Engine failures, representation gaps, and benchmark ambiguity are separate. Runtime refusals and unsuitable selections are engine outcomes; inability to name/accept cultural forms is a representation gap; subjective close ordering is benchmark ambiguity and receives P3 treatment rather than being presented as fact.

## 15. Case-Level Failures

Six P0 GU failures: GU-11, GU-16, GU-17, GU-29, GU-39, GU-40. The 20 highest-regret ranking misses are documented in `failure-analysis.md`; all 100 rows are in `case-results.csv`.

## 16. Severity Distribution

P0 6; P1 11; P2 23; P3 15; pass 45. Severity uses qualitative case review plus acceptability/utility evidence, not a single numerical cutoff.

## 17. Representation Gaps

Gele/headwrap, aso-oke wrapper/iro, buba, grand boubou, Kente stole, coordinated multi-piece Ankara, and culturally meaningful matching-fabric identity are underrepresented or unsupported. These gaps should not be conflated with generic visual classification: fabric/category fields were often partially correct.

## 18. Nigerian/African Strengths

Top-3 context accuracy was 95.0%. Ankara pairing top-3 was 100%. The system handled several traditional events and rain-safe Ankara combinations correctly. Broad category and fabric recognition were materially stronger than cultural subtype naming.

## 19. Nigerian/African Weaknesses

Weather top-1, cultural terminology/guardrails, coordinated-set identity, diaspora context, and exact candidate generation coverage are the main evidence-based weaknesses.

## 20. Existing v3.7 Regression Comparison

The unchanged existing golden regression suite passed while Track C exposed separate Nigerian/African gaps. No direct accuracy delta is claimed because the datasets and purposes differ. See `regression-comparison.md`.

## 21. Candidate Hypotheses for Future Work

1. Cultural coordination identity may be missing from the scoring representation.
2. Classifier guardrails and subtypes may exclude common cultural accessories and multi-piece sets.
3. Candidate scoring without weather context may produce severe heat/rain errors.
4. Scenario tags may be too coarse for funeral dress codes, thanksgiving, diaspora, and aso-ebi.

These are hypotheses only.

## 22. Recommended Experiments

Run controlled, isolated experiments for: taxonomy coverage; matching-set identity; weather-aware fixed-candidate ranking; richer cultural-context signals; and exact generator coverage. Every experiment must compare Track C and the unchanged existing v3.7 regression suite. None was implemented here.

## 23. Reproducibility Information

Hashes, versions, defaults, scenario mapping, model aliases, input/output fingerprints, and access boundaries are in `execution-manifest.json`, `RAW-SHA256SUMS`, and `reproducibility.md`.

## 24. Tests

Pre-run tests, typecheck, lint, benchmark validator, frozen checksums, and frozen-diff gate passed. Post-evaluation checks are recorded in `TEST-RESULTS.md`. Lint has 0 errors and 31 pre-existing warnings.

## 25. Production-Safety Confirmation

Every required no-change condition is confirmed in `PRODUCTION-SAFETY-CONFIRMATION.md`. No production data, Supabase, auth, payment, entitlement, FASH, deployment, or user-data operation occurred.

## 26. Final Recommendation

**C — Material recommendation gaps require remediation before Nigerian/African launch.**

The benchmark is conclusive enough to identify material launch risks despite its single-reviewer limitation: critical classification exclusions, clearly inappropriate weather/occasion top choices, cultural identity loss, and low exact candidate-generation coverage. v3.7 also has real strengths, especially top-3 coverage and focused Ankara pairings. The next action should be a separate Product Owner-approved hypothesis → controlled experiment → regression → approval cycle. Track C stops here; v3.7 remains frozen.
