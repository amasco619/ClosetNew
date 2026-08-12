# PHASE 3.3B — RECOMMENDATION QUALITY INTELLIGENCE

You are continuing AuraCloset recommendation-engine development following:

- Phase 2 — Gemini / Classification Audit
- Phase 2.1 — Classification and data-quality improvements
- Phase 3 — Outfit Intelligence & Recommendation Engine Forensic Audit
- Phase 3.1 — Controlled P0 Recommendation Improvements
- Phase 3.2 — Recommendation Quality Benchmark
- Phase 3.3A — Candidate Generation Robustness

Phase 3.3A is now complete.

Its objective was:

> **Can AuraCloset find a viable outfit when one genuinely exists?**

That track is closed.

Phase 3.3B addresses the next problem:

> **When AuraCloset has several viable outfits, can it recognise the one that looks genuinely exceptional?**

---

# 1. CURRENT STATE

The Phase 3.2 benchmark established that AuraCloset is generally strong at producing **wearable and contextually valid** outfits.

However, the benchmark also identified a gap between:

### Technical compatibility

and

### Styling excellence.

The current engine can often determine:

> "These garments work together."

But it is less reliable at determining:

> "This is the most intentional, sophisticated and beautifully executed combination available."

The Phase 3.2 benchmark also showed substantial divergence between:

- internal recommendation score;
- external stylistic-quality evaluation.

Therefore, this phase must focus on improving the engine's ability to recognise **outfit-level quality**, not simply adding more garment-level bonuses.

---

# 2. CRITICAL OBJECTIVE

Improve the recommendation engine's ability to distinguish:

### A
Technically compatible outfit

from

### B
Good outfit

from

### C
Excellent outfit

from

### D
Exceptional outfit

The target is NOT to make the scoring system more complicated for its own sake.

The target is:

> **better decisions.**

---

# 3. ABSOLUTE RULES

This is a controlled recommendation-quality phase.

Do NOT:

- add Gemini;
- call an LLM;
- introduce a second AI recommendation layer;
- add fabric-price assumptions;
- treat expensive materials as inherently superior;
- create arbitrary one-off garment-pair rules;
- create benchmark-specific rules;
- hard-code individual scenario fixes;
- change candidate generation;
- change the Phase 3.3A fallback architecture;
- change freshness;
- change rise scoring;
- change weather gates;
- change safety gates;
- change hard formality gates;
- redesign the entire scoring system;
- broadly rebalance every existing weight.

Do not implement:

> silk = +2

or:

> cashmere = +2

or:

> synthetic = -1

without demonstrating why the rule represents an outfit-level quality principle rather than a crude material preference.

---

# 4. FIRST PRINCIPLE

Before making any change, distinguish between:

## Garment attributes

Examples:

- fabric;
- colour;
- pattern;
- silhouette;
- rise;
- formality;
- texture.

and:

## Outfit relationships

Examples:

- tonal relationship;
- contrast;
- visual hierarchy;
- material contrast;
- proportion balance;
- focal-point management;
- silhouette interaction;
- intentionality;
- contextual sophistication.

Phase 3.3B should primarily improve the second category.

---

# 5. FIRST — REPRODUCE THE PHASE 3.2 QUALITY GAPS

Before modifying production scoring, reproduce the most important Phase 3.2 examples.

At minimum investigate:

- QL1
- QL2
- QL3
- QL4
- QL5
- QL6
- FP4
- FP6
- AD6
- SC1
- W2
- C6

Use the current post-3.3A codebase.

For each example capture:

- candidate outfit;
- internal score;
- score breakdown;
- external benchmark score;
- why the internal engine ranked it highly/poorly;
- which styling concept appears missing.

Do not change code during this diagnostic stage.

---

# 6. BUILD A QUALITY GAP TAXONOMY

Before implementing anything, classify the observed quality failures into concepts.

At minimum investigate:

### A. Material sophistication

Does the engine understand how materials interact?

### B. Visual hierarchy

Does the outfit have a clear focal point?

### C. Intentionality

Does the combination look deliberately styled?

### D. Tonal sophistication

Can the engine recognise sophisticated tonal dressing?

### E. Visual interest

Can the engine distinguish:

- interesting neutral;
- boring neutral;
- intentional minimalist;
- rich monochrome;
- over-coordinated?

### F. Contrast management

Can the engine recognise useful contrast in:

- colour;
- value;
- texture;
- silhouette;
- material?

### G. Silhouette coherence

Do the garments create a deliberate overall shape?

### H. Contextual sophistication

Does the outfit achieve the intended aesthetic for the occasion rather than merely satisfying formality?

### I. Focal-point competition

Does the outfit contain too many visually dominant elements?

### J. Excessive sameness

Does everything match so closely that the outfit becomes visually flat?

Do not assume all ten concepts require implementation.

Determine which are actually responsible for observed failures.

---

# 7. DO NOT IMPLEMENT FABRIC QUALITY AS A SIMPLE TIER

The Phase 3.2 report proposed a possible fabric-quality tier.

Do NOT implement:

```text
silk = premium
cashmere = premium
wool = premium
synthetic = inferior
```

That is explicitly prohibited.

The same material can produce very different styling outcomes depending on:

- garment type;
- colour;
- silhouette;
- occasion;
- surrounding materials;
- pattern;
- proportion.

For example:

> silk blouse + tailored trousers

may be elevated.

But:

> silk blouse + distressed casual pieces

may intentionally be relaxed.

Likewise:

> polyester garment

is not automatically inferior stylistically.

The system must judge the **relationship**, not the assumed price or prestige of the material.

---

# 8. DESIGN AN OUTFIT-LEVEL QUALITY MODEL

Before changing production scoring, propose a conceptual model for outfit-level quality.

At minimum consider:

## 8.1 Visual Hierarchy

Questions:

- Is there a clear focal element?
- Are secondary elements subordinate?
- Are there competing focal points?
- Is there no focal point when one is needed?

## 8.2 Intentionality

Questions:

- Do the pieces reinforce one another?
- Does the outfit feel deliberately composed?
- Are there accidental-looking conflicts?

## 8.3 Material Relationship

Questions:

- Do materials harmonise?
- Is contrast intentional?
- Are multiple statement materials competing?
- Does the material combination suit the occasion?

## 8.4 Tonal / Colour Relationship

Questions:

- Is the tonal variation sufficient?
- Is the contrast intentional?
- Is the palette too flat?
- Is it excessively coordinated?
- Is there a controlled accent?

## 8.5 Silhouette Relationship

Questions:

- Does volume balance?
- Does length balance?
- Does rise support the silhouette?
- Does the outfit create a coherent visual shape?

## 8.6 Contextual Sophistication

Questions:

- Is the styling appropriate for the scenario?
- Does it achieve the user's style goal?
- Does it look intentional rather than merely acceptable?

---

# 9. USE RELATIONSHIPS, NOT JUST BONUSES

Where appropriate, favour relationship scores such as:

```text
materialContrast(top, bottom)
tonalVariation(outfit)
visualHierarchy(outfit)
silhouetteBalance(outfit)
focalPointBalance(outfit)
```

over isolated:

```text
fabricQuality(item)
colourPremium(item)
luxuryItemBonus(item)
```

The goal is to evaluate the **outfit as a composition**.

---

# 10. AVOID DOUBLE COUNTING

This is critical.

The current engine already evaluates:

- colour;
- proportion;
- formality;
- texture;
- pattern;
- body type;
- rise;
- scenario;
- weather;
- affinity;
- reactions.

Do not create a new "quality" score that simply counts the same signals again.

For every proposed new signal identify:

### Existing signal

What already measures this?

### New information

What does the new signal add?

### Overlap risk

Could the same quality be rewarded twice?

### Interaction

Should the new signal replace, complement, or remain independent of the existing signal?

If the new concept duplicates an existing signal, do not implement it until the overlap is resolved.

---

# 11. KEEP THE EFFECT CONTROLLED

Any new outfit-quality mechanism must initially be **bounded**.

Do not allow a new quality component to overwhelm:

- occasion;
- formality;
- weather;
- safety;
- personalisation;
- colour compatibility;
- proportion.

The new quality intelligence should refine the ranking of already-valid outfits.

It should NOT make an objectively inappropriate outfit win merely because it looks aesthetically interesting.

---

# 12. QUIET-LUXURY REQUIREMENT

AuraCloset's intended positioning is:

> **"Your quiet-luxury stylist in your pocket."**

Therefore explicitly test:

### Neutral sophistication

Examples:

- cream + camel + ivory;
- charcoal + black + grey;
- navy + white + taupe;
- beige + cream + brown.

Determine whether the engine can distinguish:

**sophisticated neutral**

from

**boring neutral**.

Do NOT assume colourfulness is visual interest.

Visual interest may come from:

- texture;
- silhouette;
- tonal variation;
- material contrast;
- proportion;
- focal hierarchy;
- controlled accessories.

---

# 13. MATERIAL-CONTRAST TESTS

Create controlled comparisons including:

### Leather + silk

Determine whether the engine understands intentional contrast rather than simply counting statement textures.

### Cashmere + leather

### Wool + silk

### Suede + knit

### Cotton + linen

### Multiple synthetic materials

Do not assume one answer is universally correct.

The context and outfit composition must matter.

---

# 14. VISUAL-HIERARCHY TESTS

Create controlled wardrobes containing:

### One obvious hero

versus

### Multiple competing statement pieces

versus

### No obvious hero

Determine whether the engine can prefer:

> one strong focal point + supporting elements

when appropriate.

However, do NOT assume every outfit requires a dramatic hero garment.

A quiet-luxury outfit may derive its quality from:

- proportion;
- tailoring;
- tonal variation;
- material;
- restraint.

---

# 15. INTENTIONALITY TESTS

Construct pairs where individual garments are all compatible but:

### Outfit A

looks deliberately composed.

### Outfit B

uses equally compatible garments but produces a visually incoherent or accidental combination.

Determine whether the current engine can distinguish them.

If it cannot, document exactly which missing relationship causes the failure.

---

# 16. DO NOT CREATE A "BORING NEUTRAL PENALTY"

Explicitly prohibit:

```text
allNeutral → -2
```

or similar simplistic rules.

A neutral outfit may be:

- boring;
- minimalist;
- sophisticated;
- luxurious;
- editorial;
- intentionally monochromatic.

The engine must eventually distinguish these states through composition, not colour count.

---

# 17. SCORE-SENSITIVITY ANALYSIS

For every proposed new quality component determine:

- minimum effect;
- maximum effect;
- typical effect.

Compare its influence against:

- colour;
- proportion;
- occasion;
- formality;
- weather;
- affinity;
- freshness.

No new quality component may dominate the existing recommendation engine without explicit evidence.

---

# 18. CONTROLLED A/B EVALUATION

For every implemented change, compare:

### Baseline

Current Phase 3.3A engine.

versus

### Modified

Phase 3.3B engine.

Use the Phase 3.2 benchmark unchanged.

Do not modify the benchmark scenarios.

Measure:

- mean external quality;
- median;
- Excellent count;
- Strong count;
- Acceptable count;
- false positives;
- false negatives;
- quiet-luxury score;
- visual-interest score;
- proportion;
- colour;
- coherence.

---

# 19. REQUIREMENT FOR IMPROVEMENT

Do not consider a change successful simply because the mean score increases.

A proposed change should demonstrate:

1. improvement in the target failure category;
2. no meaningful degradation elsewhere;
3. no significant increase in inappropriate recommendations;
4. no major regression in personalisation;
5. no major regression in occasion/formality;
6. no major increase in scoring complexity without measurable benefit.

If a change improves one category but damages another, report the trade-off instead of hiding it.

---

# 20. BENCHMARK THE HIGH-VALUE COMPARISONS

Pay particular attention to the Phase 3.2 findings:

### QL1

High internal score / strong external quality.

### QL2

High internal score / comparatively weaker external quality.

### QL6

Low internal score / strong external quality.

The goal is to reduce these internal/external ranking divergences.

Do not optimise specifically for these scenarios.

Use them as diagnostic examples, then verify the improvement across the broader benchmark.

---

# 21. CROSS-SCENARIO CONSISTENCY

Do not modify Task #391 unless this phase independently demonstrates that it materially affects recommendation quality.

If the same outfit receives different scores in different scenarios:

determine whether that difference is:

- intentional contextual scoring;
- accidental scoring contamination;
- first-occurrence-wins behaviour;
- another architectural issue.

Do not assume identical outfits must have identical scores.

---

# 22. FRESHNESS AND RISE

Phase 3.1 and 3.3A already established these mechanisms.

Do not redesign them.

Confirm that any new quality intelligence does not accidentally overpower:

- freshness;
- rise;
- affinity;
- reactions.

---

# 23. DO NOT NORMALISE USER-FACING CONFIDENCE YET

Do not implement the Phase 3.2 score-normalisation proposal during this phase.

The focus is:

> **Improve recommendation quality first.**

Confidence presentation can be addressed after the underlying score becomes more meaningful.

---

# 24. GEMINI

Do NOT integrate Gemini.

Do not add:

- Gemini ranking;
- Gemini critique;
- Gemini veto;
- Gemini rationale;
- Gemini second-stage evaluation.

We will revisit Gemini only after the deterministic quality model has been benchmarked.

---

# 25. IMPLEMENTATION STRATEGY

This phase has two stages.

## Stage A — Design and controlled experiment

First:

1. reproduce the identified quality gaps;
2. identify root causes;
3. propose the smallest viable outfit-level quality model;
4. identify overlap with existing scoring;
5. implement the minimum isolated experiment.

Do not rewrite the scoring engine.

## Stage B — Benchmark

Run the complete Phase 3.2 benchmark against:

**Phase 3.3A baseline**

and

**Phase 3.3B candidate implementation**

Compare results.

If the experiment does not show a meaningful improvement:

**do not force the feature into production.**

---

# 26. PREFERRED IMPLEMENTATION ARCHITECTURE

Where possible, keep the new quality logic isolated.

Prefer something conceptually like:

```text
existingScore
      +
boundedOutfitQualityAdjustment
      =
finalRecommendationScore
```

rather than rewriting every existing score component.

However, this is a design preference, not permission to create a redundant additive score.

If the existing architecture makes this inappropriate, explain why before proceeding.

---

# 27. PRODUCTION SAFETY

Do not modify:

- candidate generation;
- fallback-cores;
- hard constraints;
- weather gates;
- safety;
- formality gates;
- Phase 3.1 freshness;
- Phase 3.1 rise;
- premium/free functionality.

If the new intelligence requires changing any of these:

**STOP and report the dependency.**

---

# 28. REQUIRED TESTS

Add focused tests for every new quality concept.

At minimum include:

### Material relationships

- leather + silk;
- cashmere + leather;
- wool + silk;
- neutral synthetic;
- mixed materials.

### Visual hierarchy

- one hero;
- multiple heroes;
- no hero;
- quiet-luxury tonal outfit.

### Tonal sophistication

- sophisticated neutral;
- boring neutral;
- rich monochrome;
- over-coordinated monochrome.

### Silhouette

- balanced volume;
- oversized + tailored;
- oversized + oversized;
- rise interaction.

### Context

- elevated casual;
- business;
- date;
- evening;
- weekend.

### Regression

- weather;
- formality;
- freshness;
- rise;
- affinity;
- reactions.

---

# 29. FULL REGRESSION REQUIREMENTS

Run:

- all existing tests;
- all Phase 3.3A tests;
- all Phase 3.2 benchmark scenarios;
- new Phase 3.3B tests;
- TypeScript;
- lint.

Do not claim success without actually running the tests.

---

# 30. REPORT INTERNAL VS EXTERNAL SCORE ALIGNMENT

For the Phase 3.2 benchmark, calculate whether the modified engine improves the relationship between:

### Internal score ranking

and

### External stylistic-quality ranking.

Do not claim statistical significance unless the benchmark is actually large enough to support such a claim.

Use descriptive language such as:

- improved;
- worsened;
- unchanged;
- materially improved;
- minor movement.

---

# 31. SUCCESS CRITERIA

Phase 3.3B should be considered successful only if the evidence demonstrates:

### Primary

Improved ranking of genuinely high-quality outfits.

### Secondary

Reduced number of:

> technically compatible but stylistically mediocre

outfits being ranked above stronger alternatives.

### No major regression in:

- occasion;
- formality;
- weather;
- personalisation;
- freshness;
- proportion;
- colour;
- candidate availability.

---

# 32. STOP CONDITIONS

STOP implementation and report if:

- the proposed model requires arbitrary material prestige assumptions;
- the new scoring duplicates existing signals;
- the new logic requires large-scale architectural changes;
- quality improvement cannot be demonstrated;
- the new model creates contradictory scoring incentives;
- benchmark results become worse;
- Gemini appears necessary to solve the problem.

Do not introduce Gemini as a workaround.

---

# 33. FINAL REPORT FORMAT

Return:

# PHASE 3.3B — RECOMMENDATION QUALITY INTELLIGENCE REPORT

## 1. Executive Summary

Maximum 15 bullets.

## 2. Phase 3.2 Quality Gaps Reproduced

| Scenario | Current Internal Score | External Score | Gap | Root Cause |
|---|---:|---:|---:|---|

## 3. Quality-Gap Taxonomy

Identify which concepts were actually responsible for failures.

## 4. Proposed Quality Model

Explain the conceptual model before implementation.

## 5. Implementation

List every production file changed and why.

## 6. New Scoring Signals

For each:

- purpose;
- formula;
- range;
- interaction with existing signals;
- double-counting analysis.

## 7. Test Results

## 8. Benchmark Comparison

| Metric | Phase 3.3A | Phase 3.3B | Change |
|---|---:|---:|---:|
| Mean quality | 77.4 | | |
| Median | 78 | | |
| Excellent | 21 | | |
| Strong | 41 | | |
| Acceptable | 3 | | |
| Poor | 0 | | |

## 9. Dimension Comparison

Compare:

- colour;
- proportion;
- occasion;
- formality;
- coherence;
- texture;
- visual interest;
- practicality;
- personalisation;
- quiet luxury.

## 10. Internal vs External Alignment

Explain whether the engine's rankings now better correspond to stylistic-quality evaluations.

## 11. False Positives / False Negatives

Explain the most important remaining examples.

## 12. Regression Analysis

Explicitly verify:

- candidate generation unchanged;
- fallback unchanged;
- freshness unchanged;
- rise unchanged;
- weather unchanged;
- formality unchanged;
- personalisation preserved.

## 13. Remaining Quality Gaps

Only the most important issues.

## 14. Gemini Assessment

Do NOT implement Gemini.

State whether the remaining gaps appear solvable deterministically or whether they suggest a future need for visual/LLM judgement.

## 15. Recommendation

Choose:

**PASS — QUALITY IMPROVED**

**PASS WITH CONCERNS**

**NO MEANINGFUL IMPROVEMENT**

**REGRESSION — REVERT**

**BLOCKED — ARCHITECTURAL ISSUE**

## 16. Final Status

State:

**PHASE 3.3B STATUS: COMPLETE**

and:

**GEMINI: NOT IMPLEMENTED**

---

# FINAL NON-NEGOTIABLE PRINCIPLE

Do not optimise for complexity.

Do not optimise for the benchmark scenarios individually.

Do not optimise for "luxury" by rewarding expensive-sounding fabrics.

Do not optimise for colourful outfits.

Do not optimise for neutral outfits.

Do not optimise for higher numerical scores.

Optimise for one thing:

> **When several outfits are valid, AuraCloset should increasingly rank the outfit that a highly capable stylist would consider the most intentional, coherent, sophisticated and contextually appropriate choice.**

If the evidence shows the proposed quality model does not achieve that:

**do not force it into production.**

A failed experiment is preferable to a more complicated recommendation engine that does not actually make better decisions.