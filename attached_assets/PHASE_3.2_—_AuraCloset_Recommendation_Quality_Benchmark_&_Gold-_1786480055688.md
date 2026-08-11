# PHASE 3.2 — AuraCloset Recommendation Quality Benchmark & Gold-Standard Evaluation

You are continuing the AuraCloset recommendation-engine work following the completed:

- Phase 2 — Gemini/Classication Audit
- Phase 2.1 — GCV cleanup and classification improvements
- Phase 3 — Outfit Intelligence & Recommendation Engine Forensic Audit
- Phase 3.1 — Controlled P0 Recommendation Improvements

The objective of Phase 3.2 is fundamentally different from the previous phases.

We are now going to **measure the quality of AuraCloset's actual outfit recommendations before making further recommendation-engine changes.**

---

# CRITICAL RULE

## DO NOT MODIFY PRODUCTION RECOMMENDATION LOGIC

This phase is a:

**MEASURE → TEST → BENCHMARK → ANALYSE → REPORT**

phase.

Do NOT:

- change scoring weights;
- change scoring formulas;
- change thresholds;
- add recommendation rules;
- remove recommendation rules;
- change candidate generation;
- change hero selection;
- change rotation;
- change freshness;
- change rise scoring;
- add Gemini;
- add LLM-based ranking;
- change colour logic;
- change texture logic;
- change formality logic;
- change body-type logic;
- change weather logic;
- change premium/free behaviour.

The current Phase 3.1 recommendation engine is the **baseline under evaluation**.

If you discover a weakness, **record it rather than fixing it**.

---

# 1. FIRST — VERIFY THE BASELINE

Before constructing the benchmark, inspect the current codebase and confirm the actual state of the recommendation engine.

Verify:

- Phase 3.1 freshness implementation is present.
- Phase 3.1 rise implementation is present.
- Task #390 status.
- Task #389 status.
- Task #391 status.
- Current test suite status.

If Task #390 has already been implemented, verify its tests.

If Task #390 has NOT been implemented, do NOT implement it as part of Phase 3.2. Report it as a prerequisite/status item.

For #389 and #391:

**Do not implement behavioural changes.**

They remain investigation items.

Record the exact baseline state before benchmarking.

---

# 2. DEFINE WHAT WE ARE MEASURING

The central question is:

> **When AuraCloset recommends an outfit, how often would a highly capable professional stylist consider that recommendation an excellent choice for this specific user and context?**

Do NOT judge the engine based merely on:

- whether the outfit is technically valid;
- whether every garment is compatible;
- whether the score is high;
- whether the code is sophisticated;
- whether the outfit satisfies hard constraints.

We are measuring **styling quality**.

---

# 3. BUILD A GOLD-STANDARD EVALUATION FRAMEWORK

Create an external evaluation framework specifically for benchmarking AuraCloset.

Do NOT replace the application's existing scoring system.

This is an **independent evaluation rubric**.

Use a 0–10 score for each dimension.

Evaluate each generated outfit across:

### A. Colour Harmony — 10

Does the palette work aesthetically?

Consider:

- hue relationships;
- temperature;
- saturation;
- value;
- contrast;
- tonal dressing;
- accent colours;
- intentional colour restraint.

Do not assume more colour is better.

---

### B. Silhouette & Proportion — 10

Evaluate:

- top/bottom volume;
- rise;
- waist definition;
- length relationships;
- silhouette balance;
- body proportions where relevant;
- visual elongation;
- intentional oversized/fitted relationships.

A conventionally unusual combination should not automatically be penalised if it creates a coherent silhouette.

---

### C. Occasion Appropriateness — 10

Evaluate whether the outfit genuinely suits the context.

Examples:

- office;
- business meeting;
- date;
- dinner;
- wedding;
- casual weekend;
- travel;
- school run;
- event;
- formal occasion.

Do not confuse "technically within the formal range" with genuinely appropriate.

---

### D. Formality — 10

Evaluate whether the outfit is:

- appropriately dressed;
- underdressed;
- overdressed;
- appropriately polished.

Consider contextual nuance.

---

### E. Visual Coherence — 10

Does the outfit look like an intentional outfit rather than a collection of individually compatible garments?

Evaluate:

- overall unity;
- visual hierarchy;
- focal point;
- balance;
- consistency.

---

### F. Texture & Material — 10

Evaluate:

- texture harmony;
- intentional contrast;
- material relationships;
- visual richness;
- whether multiple statement textures compete.

Do not automatically penalise combinations such as leather + silk.

Determine whether the relationship is intentional and coherent.

---

### G. Visual Interest & Styling Sophistication — 10

This is NOT the same as "colourfulness."

Evaluate whether the outfit is:

- interesting;
- intentional;
- sophisticated;
- restrained;
- visually balanced.

For neutral outfits specifically distinguish:

- boring neutral;
- sophisticated neutral;
- intentional minimalist;
- rich monochromatic;
- over-coordinated.

---

### H. Practicality & Context — 10

Evaluate:

- weather;
- temperature;
- rain;
- activity;
- mobility;
- season;
- layering;
- practicality.

A beautiful outfit that is completely inappropriate for the conditions should lose points.

---

### I. Personalisation — 10

Evaluate whether the outfit actually reflects the user's:

- style goals;
- body profile;
- preferences;
- wardrobe;
- affinity;
- reaction history;
- previous wear;
- stated context.

Ask:

> Could this recommendation have been given to almost any user?

If yes, personalisation should score lower.

---

### J. Quiet-Luxury / Premium Styling Quality — 10

Evaluate whether the outfit feels:

- polished;
- intentional;
- refined;
- restrained;
- modern;
- sophisticated;
- effortless.

Do NOT equate luxury with expensive brands.

---

## Overall score

Each outfit receives:

**0–100**

with the ten dimensions above contributing equally to the external benchmark.

Do not alter the application's internal score.

---

# 4. CREATE THE BENCHMARK SCENARIOS

Create a rigorous benchmark of at least:

## 50 distinct scenarios

Each scenario should define:

### User profile

Include appropriate combinations of:

- body type;
- height category;
- style goal;
- colour preferences;
- relevant personalisation signals.

### Wardrobe

Construct realistic wardrobes containing approximately:

**12–30 garments/accessories**

depending on scenario complexity.

Do not create unrealistic wardrobes containing hundreds of items.

### Context

Include:

- occasion;
- weather;
- temperature;
- season;
- mood/style objective where supported.

### Wear history

Where relevant, include:

- recently worn items;
- frequently worn items;
- rarely worn items;
- liked combinations;
- disliked combinations.

### Expected styling challenge

Explain what makes the scenario difficult.

---

# 5. REQUIRED SCENARIO CATEGORIES

The 50+ scenarios MUST include difficult cases from all of these categories.

## Category 1 — Colour

At least 5 scenarios covering:

- complementary colours;
- analogous colours;
- tonal dressing;
- neutral palettes;
- accent colour;
- warm/cool tension.

---

## Category 2 — Proportion

At least 5 scenarios covering:

- petite;
- tall;
- pear;
- apple;
- hourglass;
- rectangle;
- inverted triangle;
- high-rise;
- low-rise;
- oversized/fitted relationships.

---

## Category 3 — Quiet Luxury

At least 5 scenarios covering:

- neutral sophisticated;
- neutral boring;
- monochromatic rich;
- restrained luxury;
- tonal dressing;
- texture-led luxury.

These are particularly important because they directly test AuraCloset's intended positioning.

---

## Category 4 — Formality & Occasion

At least 5 scenarios covering:

- business formal;
- business casual;
- date night;
- dinner;
- wedding/event;
- casual;
- smart casual.

---

## Category 5 — Weather & Practicality

At least 5 scenarios covering:

- cold;
- mild;
- hot;
- rain;
- transitional weather;
- layering.

---

## Category 6 — Pattern & Texture

At least 5 scenarios covering:

- pattern mixing;
- patterned hero piece;
- leather + silk;
- multiple textures;
- texture contrast;
- visually competing patterns.

---

## Category 7 — Personalisation

At least 5 scenarios covering:

- strong user colour preference;
- strong garment affinity;
- disliked combination;
- recently worn favourite;
- repeated style preference;
- preference conflict with current context.

---

## Category 8 — Scarcity & Edge Cases

At least 5 scenarios covering:

- very small wardrobe;
- no ideal garment;
- missing footwear;
- missing outerwear;
- incomplete outfit;
- multiple duplicate garments.

---

## Category 9 — Adversarial / "Looks Technically Correct But Wrong"

At least 5 scenarios designed specifically to trick the algorithm.

Examples:

- everything matches too closely;
- mathematically harmonious but visually boring;
- technically formal but socially inappropriate;
- excellent colours but poor proportions;
- excellent individual garments but incoherent overall;
- neutral wardrobe where the most expensive-looking combination is not the most colourful;
- recently worn favourite versus fresh but weaker outfit.

---

# 6. RUN THE ACTUAL ENGINE

Do NOT manually invent what the algorithm "would probably do."

Use the actual recommendation implementation.

For every benchmark scenario:

1. Construct the test wardrobe/profile/context.
2. Run the real candidate-generation pipeline.
3. Run the real scoring system.
4. Run the real ranking.
5. Run the relevant rotation logic where appropriate.
6. Capture the top recommendations.
7. Record the actual internal scores and relevant score breakdowns.

Do not modify production logic to make the scenarios easier to run.

If the existing architecture makes a scenario impossible to execute realistically, document that limitation.

---

# 7. CAPTURE THE TOP RECOMMENDATIONS

For each scenario capture at least:

### Top 5 outfits

For each:

- garment IDs;
- garment categories;
- relevant attributes;
- internal score;
- score breakdown;
- scenario;
- wear history influence;
- freshness influence;
- relevant affinity signals.

Do not only inspect the #1 outfit.

We need to understand whether the engine has good alternatives that are being ranked incorrectly.

---

# 8. EXPERT-STYLE EVALUATION

Evaluate every top recommendation using the external 0–100 rubric.

For each outfit provide:

| Dimension | Score /10 | Reason |
|---|---:|---|
| Colour | | |
| Proportion | | |
| Occasion | | |
| Formality | | |
| Coherence | | |
| Texture | | |
| Visual interest | | |
| Practicality | | |
| Personalisation | | |
| Quiet luxury | | |
| **Total** | **/100** | |

Be specific.

Do not give generic explanations such as:

> "The colours work well."

Explain WHY.

---

# 9. IMPORTANT — DISTINGUISH ENGINE SCORE FROM QUALITY SCORE

This is critical.

The application has its own internal score.

Our benchmark has a separate expert-quality score.

Do NOT assume:

**higher internal score = better outfit.**

Instead calculate:

### Internal score

versus

### External quality score

and identify cases where they diverge.

---

# 10. IDENTIFY "FALSE POSITIVES"

A false positive is:

> **The engine ranks an outfit highly, but the external styling evaluation considers it mediocre or poor.**

Find at least the most important 10 examples.

For each:

- scenario;
- outfit;
- internal score;
- external score;
- why the engine liked it;
- why a stylist would reject/deprioritise it;
- missing concept responsible.

Classify the root cause:

- candidate generation;
- hard constraint;
- scoring;
- weighting;
- data;
- personalisation;
- context;
- rotation;
- missing fashion concept.

---

# 11. IDENTIFY "FALSE NEGATIVES"

A false negative is:

> **An excellent outfit exists in the candidate pool but is ranked substantially below weaker alternatives.**

Find the most important examples.

For each:

- scenario;
- excellent outfit;
- internal ranking;
- external quality score;
- stronger/weaker competing outfit;
- why the engine under-ranked it;
- root cause.

This is particularly important because it tells us whether the problem is:

**"the engine chooses bad outfits"**

or:

**"the engine generates good outfits but ranks them incorrectly."**

---

# 12. IDENTIFY CANDIDATE-GENERATION FAILURES

Determine whether any excellent outfit never reaches scoring because it is eliminated earlier.

For each important example:

- desired outfit;
- why it should be excellent;
- where it was eliminated;
- exact rule/filter responsible;
- whether that rule is justified.

This should be kept separate from scoring failures.

---

# 13. EVALUATE THE PHASE 3.1 CHANGES

Specifically measure whether Phase 3.1 appears to improve recommendation quality.

### Freshness

Evaluate:

- recently worn favourite;
- equally good fresh outfit;
- weak fresh alternative;
- excellent recently worn outfit.

Determine whether the current freshness behaviour creates the desired trade-off.

### Rise

Evaluate:

- high-rise + fitted;
- high-rise + oversized;
- low-rise + fitted;
- low-rise + oversized;
- missing rise.

Determine whether the ±1 signal improves recommendations without becoming dominant.

Do not modify either mechanism.

---

# 14. INVESTIGATE TASK #389

Do not fix it.

Use the benchmark to determine whether the reported potential inconsistency actually occurs.

Test:

- same wear history at pool-generation and rotation;
- changed history;
- multiple scenarios;
- repeated generation;
- overlapping scenario pools.

Determine whether:

**#389 is theoretical**

or

**#389 can materially affect recommendations.**

---

# 15. INVESTIGATE TASK #391

Do not fix it.

Test the same outfit across:

- Work;
- Casual;
- Date;
- Other relevant scenarios.

Determine:

1. whether its score legitimately changes with context;
2. whether the difference is desirable;
3. whether first-occurrence-wins produces an incorrect final result;
4. whether the problem is score inconsistency or deduplication architecture.

Do NOT conclude that all scenarios should produce identical scores simply because the outfit is identical.

Contextual scoring may legitimately differ.

---

# 16. MEASURE RECOMMENDATION DIVERSITY

Measure:

- repeated outfits;
- repeated hero garments;
- repeated colour palettes;
- repeated silhouettes;
- repeated outfit structures.

Determine whether AuraCloset produces:

### Healthy consistency

or

### Excessive repetition.

Do not assume diversity is always better.

A personal stylist should preserve a user's preferred aesthetic while still offering meaningful variation.

---

# 17. MEASURE PERSONALISATION

Run controlled comparisons.

For the same wardrobe/context:

### User A
Minimalist / neutral preference.

### User B
Bold / colour-forward preference.

### User C
Classic / formal preference.

### User D
Relaxed / casual preference.

Determine whether the recommendations actually change meaningfully.

Then perform controlled changes to:

- body type;
- height;
- style goal;
- affinity;
- reactions;
- wear history.

Determine whether the resulting recommendations respond appropriately.

This is essential.

We need to know whether AuraCloset is genuinely personalised or simply applying mostly wardrobe-level rules.

---

# 18. MEASURE "QUIET LUXURY" SPECIFICALLY

Create at least 10 scenarios where the best outfit is primarily distinguished by:

- tailoring;
- proportion;
- tonal variation;
- texture;
- material quality;
- restraint;
- silhouette;

rather than bright colours or obvious statement pieces.

Determine whether the engine correctly recognises these as strong outfits.

Pay particular attention to the Phase 3 finding that neutral wardrobes can be disadvantaged by hero-selection logic.

Do not change the hero system.

Measure the problem.

---

# 19. ESTABLISH THE BASELINE METRICS

Calculate:

### Overall

- mean external quality score;
- median;
- minimum;
- maximum.

### By dimension

Mean score for:

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

### By scenario category

Calculate quality for:

- colour;
- proportion;
- quiet luxury;
- occasion;
- weather;
- pattern/texture;
- personalisation;
- scarcity;
- adversarial scenarios.

---

# 20. CREATE A RECOMMENDATION-QUALITY DISTRIBUTION

Classify each top recommendation:

### 90–100
Exceptional

### 80–89
Excellent

### 70–79
Strong

### 60–69
Acceptable

### 50–59
Weak

### <50
Poor

Report the distribution.

The objective is not merely to maximise the average.

We need to know:

> **How often does AuraCloset produce something genuinely excellent?**

---

# 21. FIND THE THREE BIGGEST QUALITY GAPS

After the entire benchmark, identify only the:

## Top 3 recommendation-quality problems

For each:

- evidence;
- affected scenarios;
- severity;
- frequency;
- user impact;
- likely root cause.

Do NOT produce a list of 30 improvements.

---

# 22. DETERMINE WHETHER THE CURRENT ENGINE IS READY

Use these definitions:

### EXCEPTIONAL
Most recommendations would satisfy a highly capable stylist.

### STRONG
Generally excellent, with identifiable weaknesses.

### COMPETENT
Technically sophisticated but stylistically inconsistent.

### WEAK
Frequently produces questionable outfits.

### FUNDAMENTALLY FLAWED
Architecture prevents consistently good recommendations.

Give the engine a rating based on the benchmark evidence.

Do not simply repeat the Phase 3 "STRONG" assessment.

This is now an empirical evaluation.

---

# 23. DETERMINE THE HIGHEST-LEVERAGE NEXT IMPROVEMENT

Based on actual benchmark results, identify the **three highest-leverage improvements**.

For each:

- problem;
- evidence;
- affected scenarios;
- expected improvement;
- complexity;
- risk;
- whether it requires new data;
- whether it requires scoring changes;
- whether it requires candidate-generation changes;
- whether it could be solved without Gemini.

Do NOT implement them.

---

# 24. EVALUATE WHETHER GEMINI IS WARRANTED

Only after completing the benchmark, evaluate whether Gemini would materially improve the system.

Compare:

### Baseline
Deterministic engine.

### Hypothetical Gemini critic
Deterministic engine → shortlist → Gemini evaluates.

### Hypothetical Gemini veto
Deterministic engine → shortlist → Gemini only rejects obvious stylistic failures.

Do NOT actually integrate Gemini.

Instead determine:

> **What specific benchmark failures would Gemini need to solve for its additional cost and latency to be justified?**

For example:

If the deterministic engine's failures are primarily:

- missing metadata;
- candidate elimination;
- poor deterministic scoring;

then Gemini may not be the right solution.

If the failures are primarily:

- nuanced visual hierarchy;
- contextual styling judgement;
- unusual but valid combinations;
- sophisticated aesthetic trade-offs;

then Gemini may have a stronger justification.

---

# 25. PRODUCE A GOLD-STANDARD TEST SPECIFICATION

At the end of the phase, convert the benchmark into a reusable specification.

Document:

- scenario format;
- wardrobe format;
- user profile format;
- context format;
- evaluation rubric;
- expected outputs;
- scoring methodology;
- false-positive definition;
- false-negative definition;
- regression criteria.

The goal is for future recommendation-engine changes to be evaluated against the **same benchmark**.

This becomes AuraCloset's:

> **Recommendation Quality Regression Suite**

---

# 26. DO NOT CREATE A FALSE SENSE OF OBJECTIVITY

This is important.

The 0–100 external score is a structured evaluation framework, not scientifically validated ground truth.

Clearly distinguish:

### Observed

What the actual engine produced.

### Evaluated

Our structured stylistic assessment.

### Inferred

Likely causes of recommendation failures.

### Proposed

Potential future improvements.

Do not claim that a benchmark score proves objective fashion truth.

---

# 27. CODE CHANGES

Production recommendation code:

**NONE.**

You may create:

- test fixtures;
- benchmark data;
- evaluation scripts;
- analysis tooling;
- documentation;

ONLY if these are isolated from production recommendation behaviour.

Do not modify the application's actual recommendation algorithm.

If creating benchmark tooling requires changes to production code, STOP and report the blocker instead.

---

# 28. FINAL REPORT FORMAT

Return the report in this exact structure:

# PHASE 3.2 — RECOMMENDATION QUALITY BENCHMARK

## 1. Executive Summary

Maximum 15 bullets.

## 2. Baseline State

- Phase 3.1 status
- Task #390
- Task #389
- Task #391
- current test status

## 3. Benchmark Methodology

Explain exactly how the benchmark was constructed and executed.

## 4. Scenario Catalogue

Provide the full list of benchmark scenarios.

## 5. Overall Results

| Metric | Result |
|---|---:|
| Scenarios | |
| Outfits evaluated | |
| Mean quality | |
| Median quality | |
| Exceptional | |
| Excellent | |
| Strong | |
| Acceptable | |
| Weak | |
| Poor | |

## 6. Dimension Results

| Dimension | Mean /10 | Weakest Scenario | Strongest Scenario |
|---|---:|---|---|
| Colour | | | |
| Proportion | | | |
| Occasion | | | |
| Formality | | | |
| Coherence | | | |
| Texture | | | |
| Visual Interest | | | |
| Practicality | | | |
| Personalisation | | | |
| Quiet Luxury | | | |

## 7. Category Results

Provide results by scenario category.

## 8. Top 10 False Positives

## 9. Top 10 False Negatives

## 10. Candidate-Generation Failures

## 11. Phase 3.1 Evaluation

Freshness and rise.

## 12. Task #389 Investigation

Evidence-based conclusion.

## 13. Task #391 Investigation

Evidence-based conclusion.

## 14. Personalisation Evaluation

## 15. Quiet-Luxury Evaluation

## 16. Top Three Recommendation-Quality Gaps

Only three.

## 17. Recommended Next Improvements

Prioritised but NOT implemented.

## 18. Gemini Assessment

Evidence-based recommendation on whether Gemini is warranted.

## 19. Gold-Standard Regression Specification

Reusable future benchmark.

## 20. Final Verdict

Choose exactly one:

**EXCEPTIONAL**

**STRONG**

**COMPETENT**

**WEAK**

**FUNDAMENTALLY FLAWED**

Then provide:

**PHASE 3.2 STATUS: COMPLETE**

**PRODUCTION CODE CHANGES: NONE**

**RECOMMENDATION ENGINE CHANGES: NOT AUTHORISED**

---

# FINAL INSTRUCTION

Do not optimise the benchmark to make AuraCloset look good.

Do not select only easy scenarios.

Do not suppress poor recommendations.

Do not change the scoring system because an output looks wrong.

**We are explicitly trying to discover where the current engine fails.**

If the benchmark exposes serious weaknesses, that is a successful outcome.

The purpose of Phase 3.2 is not to prove that AuraCloset is already excellent.

The purpose is to establish an honest baseline from which we can make evidence-based improvements.

**Measure the truth first. Change the engine later.**