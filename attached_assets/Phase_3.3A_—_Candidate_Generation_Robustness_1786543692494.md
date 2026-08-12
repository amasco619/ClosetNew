# PHASE 3.3A — CANDIDATE GENERATION ROBUSTNESS

You are continuing AuraCloset recommendation-engine development following:

- Phase 3 — Recommendation Engine Forensic Audit
- Phase 3.1 — Controlled P0 Improvements
- Phase 3.2 — Recommendation Quality Benchmark

The Phase 3.2 benchmark established:

- 55 scenarios tested.
- 14/55 scenarios returned zero candidates.
- Some zero-candidate outcomes are correct and must remain zero.
- A meaningful subset of failures appears to come from overly restrictive candidate generation for small wardrobes and certain occasions, particularly brunch.
- Candidate-generation failures are structurally different from scoring-quality failures.
- The current benchmark mean is 77.3/100.
- Phase 3.1 freshness and rise behaviour is working correctly.

Phase 3.3A addresses **candidate generation only**.

---

# CRITICAL OBJECTIVE

Improve AuraCloset's ability to produce a viable outfit when one genuinely exists in the user's wardrobe.

Do NOT attempt to make the engine produce an outfit at all costs.

The correct outcome can still be:

> No suitable outfit exists.

We are specifically trying to eliminate:

> **false empty states**

where suitable wardrobe items exist but the candidate-generation pipeline rejects them because of unnecessarily strict generation rules.

---

# ABSOLUTE RULES

During Phase 3.3A:

## DO NOT MODIFY

- `scoreOutfitCombo` scoring weights;
- `confidenceScore` formulas;
- freshness scoring;
- rise scoring;
- colour scoring;
- texture scoring;
- formality scoring;
- body-type scoring;
- personalisation scoring;
- reaction scoring;
- hero scoring except where strictly necessary to diagnose the candidate-generation issue;
- Gemini integration;
- display confidence;
- score normalisation;
- recommendation-quality intelligence;
- UI.

Do not implement the proposed Fabric Quality Tier from Phase 3.2.

Do not implement the proposed contextual score normalisation from Phase 3.2.

Do not integrate Gemini.

This track is strictly about:

> **candidate discovery and safe fallback behaviour.**

---

# 1. REPRODUCE THE PHASE 3.2 FAILURES FIRST

Before changing anything, run the Phase 3.2 benchmark.

Confirm the current behaviour for at least these scenarios:

- C2
- C3
- P2
- P6
- P8
- F1
- F4
- F5
- SC2
- SC3
- SC4
- AD1
- AD4
- AD5

Record:

- candidate count;
- candidate-generation stage where candidates disappear;
- relevant hard gates;
- hero-selection failures;
- formality failures;
- volume failures;
- footwear/completeness failures;
- occasion filtering;
- any other rejection reason.

Do not infer the root cause solely from the previous report.

Trace the actual current code path.

---

# 2. CLASSIFY EVERY ZERO-CANDIDATE RESULT

Every zero-candidate scenario must be classified as one of:

### A. Correct empty state

No valid outfit should exist.

Example:

- no footwear;
- no appropriate garments;
- impossible weather constraints;
- genuinely incompatible formality.

### B. False empty state

A viable outfit exists, but the generation pipeline rejects it unnecessarily.

### C. Ambiguous

The current rules make it unclear whether an outfit should be considered viable.

Do not modify ambiguous cases without documenting the uncertainty.

---

# 3. DO NOT SOLVE ZERO-CANDIDATES WITH A BLIND FALLBACK

Do NOT implement:

> "If zero candidates, simply return the highest-scoring outfit from another occasion."

Do NOT automatically map:

- wedding → event;
- interview → work;
- brunch → casual;
- formal → smart casual.

That could turn an empty state into a misleading recommendation.

A recommendation that is confidently wrong is worse than an honest empty state.

---

# 4. IMPLEMENT A CONTROLLED RELAXATION STRATEGY

Where a false empty state is confirmed, use a controlled relaxation ladder.

The conceptual structure should be:

### Level 0 — Strict

Use the existing candidate-generation rules.

↓

If candidates exist:

**STOP.**

Do not relax anything.

↓

### Level 1 — Relax non-essential generation constraints

Only relax constraints that are demonstrably responsible for false empty states.

Examples may include:

- hero distinctiveness;
- excessive minimum hero requirements;
- unnecessarily strict diversity requirements;
- non-essential candidate-count requirements.

Do NOT relax hard safety/context constraints merely to produce an outfit.

↓

### Level 2 — Closest-context fallback

Only if Level 1 still produces zero candidates.

Search for the closest valid contextual alternative.

The fallback must still satisfy hard constraints for:

- weather;
- safety;
- basic outfit completeness;
- clearly inappropriate formality;
- impossible garment combinations.

Do not silently substitute an unrelated occasion.

↓

### Level 3 — Honest no-recommendation state

If no outfit satisfies the hard constraints:

return no recommendation.

This is the correct behaviour.

---

# 5. FALLBACKS MUST BE EXPLICIT

If a recommendation comes from a relaxed/fallback path, mark it explicitly in the data model.

For example, use an appropriately named metadata field if one already exists or introduce the smallest isolated metadata addition necessary:

```typescript
isFallback: true
```

If the architecture supports richer metadata, distinguish:

```text
strict
relaxed
best_available
```

Do not expose technical terminology to users unless the existing UI requires it.

The important point is that the system must know:

> this was not a normal strict recommendation.

---

# 6. PRESERVE OCCASION SEMANTICS

The target occasion remains important.

A brunch recommendation should still feel like brunch.

A wedding recommendation should still feel like a wedding.

An interview recommendation should still feel like an interview.

If no ideal outfit exists, the engine may identify a "best available" option only if it remains contextually defensible.

Do not sacrifice occasion appropriateness merely to eliminate a zero-candidate result.

---

# 7. SPECIFIC INVESTIGATION: BRUNCH

The Phase 3.2 benchmark identified repeated brunch failures.

Investigate:

- C2
- C3
- P2
- P6
- F5
- AD1
- AD4

Determine whether the common root cause is actually:

- hero selection;
- minimum candidate requirements;
- occasion-specific logic;
- wardrobe-size assumptions;
- volume constraints;
- accessory requirements;
- some combination.

Do not assume the previous Phase 3.2 diagnosis is automatically correct.

If several failures share one root cause, prefer one principled fix over multiple scenario-specific exceptions.

Absolutely do NOT add:

```text
if scenario === C2 ...
if brunch && wardrobe.length < X ...
```

or equivalent hard-coded benchmark-specific logic.

---

# 8. SMALL-WARDROBE PRINCIPLE

AuraCloset must work reasonably well when users have only digitised a small subset of their wardrobe.

However:

> Small wardrobe ≠ permission to lower quality standards arbitrarily.

The system should prefer:

> "This is the best valid outfit I can make from what you own"

over:

> "Here is a bad outfit because I needed to return something."

Candidate-generation robustness must therefore distinguish:

### Insufficient wardrobe

from

### Overly restrictive algorithm.

---

# 9. P8 — HIGH-RISE + OVERSIZED

Investigate P8 carefully.

Phase 3.2 reported:

> the volume hard gate eliminates the combination before `riseHarmony` can fire.

Do not automatically change this.

Determine whether:

- the volume gate is correctly rejecting an objectively poor proportion;
- the combination can sometimes be stylistically valid;
- riseHarmony should ever influence a combination already rejected by a hard gate.

If the existing hard gate is correct, leave it untouched.

Do not weaken hard proportion constraints merely to make the rise test execute.

---

# 10. DO NOT MODIFY SCORING

A key requirement:

The output of candidate generation should be a different candidate set only where justified.

Do not change the ranking of candidates that already exist.

If a new candidate reaches scoring because a generation restriction was relaxed, the existing Phase 3.1 scoring engine must determine its ranking.

This lets us measure the isolated effect of candidate-generation changes.

---

# 11. TESTING REQUIREMENTS

Create regression tests for every genuine false-empty scenario corrected.

At minimum, test:

### Previously empty → now viable

Confirm:

- candidate count > 0;
- candidate satisfies hard constraints;
- target occasion remains appropriate;
- no malformed combinations;
- existing scoring remains unchanged.

### Correct empty states remain empty

Confirm that:

- no footwear remains empty;
- no appropriate work items remains empty;
- no outerwear under conditions requiring it remains empty;
- genuinely incompatible formality remains rejected;
- genuinely unsafe weather combinations remain rejected.

This is critical.

We are not measuring success by:

> fewer zero-candidate scenarios.

We are measuring success by:

> fewer **incorrect** zero-candidate scenarios.

---

# 12. RUN THE FULL PHASE 3.2 BENCHMARK

After implementation:

Run the complete Phase 3.2 benchmark unchanged.

Do not modify the benchmark scenarios.

Compare:

### Baseline

77.3 external mean.

### Phase 3.3A

New external mean.

Also compare:

- number of zero-candidate scenarios;
- number of genuinely correct zero-candidate scenarios;
- number of false empty states;
- number of fallback recommendations;
- mean quality of fallback recommendations;
- occasion appropriateness;
- formality;
- practicality;
- personalisation;
- quiet luxury.

---

# 13. SUCCESS CRITERIA

Phase 3.3A is successful only if:

1. False empty states decrease.
2. Correct empty states remain correct.
3. No new unsafe/inappropriate recommendations appear.
4. Mean external quality does not fall by ≥2 points.
5. Formality does not materially regress.
6. Weather/practicality does not materially regress.
7. Existing Phase 3.1 tests remain green.
8. Candidate generation becomes more robust for small wardrobes.

Do not declare success simply because candidate count increased.

---

# 14. REGRESSION PROTECTION

The following must remain unchanged unless a candidate-generation change necessarily affects them:

- Phase 3.1 freshness;
- Phase 3.1 rise;
- reaction signals;
- weather gating;
- formality hard gates;
- body-type scoring;
- personalisation;
- existing ranking behaviour.

Run:

- full test suite;
- TypeScript;
- lint;
- Phase 3.2 benchmark.

Report all results.

---

# 15. STOP CONDITIONS

STOP and report instead of implementing if you discover:

- candidate generation and scoring are tightly coupled in a way that prevents isolated modification;
- fixing the empty state requires weakening a hard safety/formality/weather constraint;
- multiple conflicting candidate-generation architectures are plausible;
- the correct behaviour cannot be determined from current requirements;
- a change would materially alter scoring or ranking.

Do not make an architectural decision silently.

---

# 16. REPORT FORMAT

Return:

# PHASE 3.3A — CANDIDATE GENERATION ROBUSTNESS REPORT

## 1. Executive Summary

## 2. Baseline Reproduction

## 3. Zero-Candidate Classification

Table:

| Scenario | Baseline | Classification | Root Cause |
|---|---:|---|---|

## 4. Changes Made

For every production change:

- file;
- function;
- exact purpose;
- why necessary.

## 5. Candidate-Generation Architecture

Explain the new strict/relaxed/fallback path.

## 6. Regression Tests

## 7. Full Test Results

## 8. Phase 3.2 Benchmark Comparison

| Metric | Phase 3.2 | Phase 3.3A | Change |
|---|---:|---:|---:|
| Mean quality | 77.3 | | |
| Median | 78 | | |
| Zero candidates | 14 | | |
| Correct zero candidates | | | |
| False empty states | | | |
| Excellent | 16 | | |
| Strong | 35 | | |
| Acceptable | 3 | | |

## 9. Quality Impact

## 10. Remaining Candidate-Generation Problems

## 11. Recommendation

Choose:

- PASS
- PASS WITH CONCERNS
- REVISE
- FAIL

## 12. Explicitly State

- Gemini: NOT IMPLEMENTED
- Fabric quality scoring: NOT IMPLEMENTED
- Score normalisation: NOT IMPLEMENTED
- Recommendation-quality intelligence: NOT IMPLEMENTED

---

# FINAL RULE

Once Phase 3.3A is complete:

**STOP.**

Do not begin Phase 3.3B.

Do not implement fabric-quality scoring.

Do not implement visual-interest scoring.

Do not implement quiet-luxury scoring.

Do not integrate Gemini.

Do not normalise confidence scores.

We will review the Phase 3.3A report first and separately authorise Phase 3.3B.

The purpose of this track is to answer one question:

> **Can AuraCloset reliably find a viable outfit when one genuinely exists?**

Do not solve a different problem.