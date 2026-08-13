PHASE 3.7 — FINAL TARGETED CALIBRATION & LAUNCH HARDENING

You are continuing AuraCloset recommendation-engine development following:

Phase 3 — Recommendation Engine Forensic Audit
Phase 3.1 — Controlled P0 Improvements
Phase 3.2 — Recommendation Quality Benchmark
Phase 3.3A — Candidate Generation Robustness
Phase 3.3B — Recommendation Quality Intelligence
Phase 3.4 — Ranking Calibration & Gold-Standard Benchmark V2
Phase 3.5 — Targeted Ranking Calibration
Phase 3.6 — End-to-End Production Readiness Benchmark

Phase 3.6 is complete.

The system was classified:

PASS — PRODUCTION READY WITH MONITORING

The Phase 3.6 E2E benchmark produced:

45 scenarios
41/45 passed
42/45 generated a recommendation
Mean external quality: 88.5/100
Median external quality: 91/100
Mean regret: 2.0
Median regret: 1
Maximum regret: 14
No catastrophic >20-point regret
Personalisation confirmed
Context sensitivity confirmed
Freshness confirmed
43/43 unit tests passing
No regressions in Layer A

The purpose of Phase 3.7 is NOT to continue broad optimisation.

The purpose is:

Validate the remaining evidence-backed weaknesses, fix only those that reproduce through the real production pipeline, and then freeze the recommendation engine for production.

1. ABSOLUTE OBJECTIVE

Phase 3.7 has five controlled tracks:

3.7A — Candidate Generation & Fallback Validation
3.7B — Weather Suitability Hardening
3.7C — FP-1 E2E Validation
3.7D — FP-2 Multicolour Representation Validation
3.7E — FE-4 Material Quality Architecture Decision

These tracks must be handled independently.

Do not combine speculative changes.

Do not implement a recommendation simply because the Phase 3.6 report suggested it.

Every production-code change requires evidence from a reproducible test.

2. MOST IMPORTANT RULE
Phase 3.7 is NOT an invitation to keep adding scoring rules.

Do NOT:

rewrite the scoring engine;
redesign candidate generation;
introduce broad fashion heuristics;
add arbitrary bonuses;
add arbitrary penalties;
increase existing signal weights without evidence;
implement every recommendation in the Phase 3.6 report;
integrate Gemini into ranking;
add benchmark-specific rules;
hard-code scenario IDs;
optimise against individual benchmark outputs;
weaken hard gates merely to reduce empty pools.

The goal is launch hardening, not another open-ended R&D cycle.

3. FREEZE THE PHASE 3.6 BASELINE

Before any production-code change:

Run:

all existing unit tests;
Phase 3.4 benchmark;
Phase 3.5 benchmark;
Phase 3.6 benchmark.

Record the actual results.

Use these as the baseline:

Metric	Phase 3.6
Scenarios	45
Passed	41/45
Recommendation generated	42/45
Empty-pool rate	3/45 = 7%
Mean external quality	88.5
Median external quality	91
Mean regret	2.0
Median regret	1
Maximum regret	14
Top-3 capture using Phase 3.6's regret ≤5 definition	39/45
Personalisation	Confirmed
Context sensitivity	Confirmed
Freshness	Confirmed
Unit tests	43/43

Do not silently redefine these metrics.

Important:

Phase 3.6's "Top-3 capture" metric is defined as regret ≤5, whereas Phase 3.4/3.5 Top-3 capture used a different methodology.

Do not present them as directly comparable.

4. METRIC TERMINOLOGY CORRECTION

Phase 3.6 referred to:

3/45 empty pools as a "false-empty rate."

Do not automatically use that terminology.

For Phase 3.7 distinguish:

Empty-pool rate

The percentage of scenarios where the production pipeline produced zero candidates.

False-empty

An empty pool where an independently verified valid outfit does exist in the supplied wardrobe and should have been constructible under the applicable constraints.

Do not classify a legitimate empty result as a false-empty.

This distinction is critical.

5. TRACK 3.7A — CANDIDATE GENERATION & FALLBACK VALIDATION
Objective

Determine whether:

B03;
B24;
C09

represent genuine wardrobe insufficiency or candidate-generation defects.

Also validate the fallback path properly.

5.1 Reproduce B03

Recreate the Phase 3.6 B03 scenario exactly.

Record:

wardrobe;
target occasion;
user profile;
eligible items;
heroes attempted;
cores attempted;
rejected candidates;
rejection reasons;
generation path;
final pool.

Then independently determine:

Does the wardrobe contain at least one valid brunch outfit according to the production constraints?

If YES:

classify as false-empty / candidate-generation defect.

If NO:

classify as legitimate empty.

Do not change code until this has been established.

5.2 Reproduce B24

Repeat the same investigation for B24.

Pay particular attention to:

inverted-triangle profile;
A-line bottoms;
blazers;
hero selection;
core assembly;
formality requirements.

Determine whether the combination:

A-line bottom + appropriate top + appropriate footwear + appropriate supporting item

is actually constructible.

If a valid outfit exists but hero-seeding fails to discover it, this is a genuine candidate-generation problem.

5.3 Reproduce C09

Investigate the six-item premium event wardrobe.

Determine:

Is there objectively a valid event outfit?

If not:

Do not weaken the event formality gate.

If yes:

identify exactly why the valid combination is rejected.

6. FALLBACK STRESS TEST

Create dedicated fallback scenarios with:

4-item wardrobe;
5-item wardrobe;
6-item wardrobe;
7-item wardrobe;
8-item wardrobe.

Test:

Case A

Strict generation succeeds.

Case B

Strict generation fails but a sensible relaxed recommendation exists.

Case C

Neither strict nor relaxed generation should produce a recommendation.

The expected behaviour is:

Do not fabricate an outfit merely to avoid an empty state.

7. FALLBACK SUCCESS CRITERIA

The fallback must:

activate only when appropriate;
never bypass genuine hard constraints;
never create impossible outfit combinations;
produce a sensible recommendation when a relaxed candidate genuinely exists;
remain empty when no legitimate outfit exists.

Do not optimise for:

"never show empty."

Optimise for:

"never show an unjustifiably empty result."

8. DO NOT MODIFY CANDIDATE GENERATION YET

Complete the investigation first.

Only if B03 or B24 is proven to be a genuine false-empty should you propose a candidate-generation correction.

If a correction is justified:

implement the smallest generalisable fix;
create regression tests;
rerun the complete Phase 3.6 benchmark;
compare against baseline.

If the problem is not reproduced as a genuine false-empty:

make no production change.

9. TRACK 3.7B — WEATHER SUITABILITY HARDENING
Objective

Investigate Phase 3.6 B15.

Known scenario:

Rain probability approximately 85%.

The production pipeline generated a valid pool but the top-ranked outfit contained a rain-inappropriate item while rain-appropriate alternatives existed lower in the pool.

The report classified this as a moderate weather-context ranking issue.

10. REPRODUCE B15 EXACTLY

Capture:

all nine candidates;
their weather-relevant items;
external quality;
internal scores;
weather suitability;
ranking order.

Determine:

Why does the rain-inappropriate candidate outrank the rain-appropriate alternatives?

Do not assume the answer is simply:

"Add a −X penalty."

Identify which existing signal is overpowering weather suitability.

11. WEATHER LOGIC DESIGN PRINCIPLE

Separate:

Hard weather incompatibility

Example:

−2°C with no required outerwear.

from:

Weather suboptimality

Example:

85% rain with suede footwear.

The first can remain a hard gate.

The second may be:

a contextual score adjustment;
an item-level suitability signal;
a soft ranking penalty.

Do not turn every weather preference into a hard gate.

12. REQUIRED WEATHER TEST MATRIX

Test at minimum:

Heavy rain

85%+ precipitation.

Moderate rain

50–84%.

Light rain

Below 50%.

Dry weather

No precipitation.

Cold + rain
Warm + rain
Cold + dry
Hot + dry

Test:

footwear;
outerwear;
accessories;
fabrics where metadata supports it.

The objective is:

weather-aware ranking without allowing weather to overwhelm outfit quality unnecessarily.

13. WEATHER SUCCESS CRITERIA

If rain-appropriate and rain-inappropriate candidates are otherwise comparable:

rain-appropriate should rank higher.

But do NOT allow weather to overpower:

severe occasion mismatch;
major colour mismatch;
major silhouette problems;
clearly inferior overall outfits.

The signal must remain proportionate.

14. TRACK 3.7C — FP-1 E2E VALIDATION
Objective

Validate whether the previously identified FP-1 issue actually survives the complete production pipeline.

FP-1:

Formality cohesion hero exemption.

The known isolated-scorer problem involved intentional high-low contrast such as:

leather jacket + jeans + heels.

The concern is that formalityCohesion interprets deliberate contrast as incoherence.

15. BUILD AN E2E FP-1 TEST

Do NOT simply call scoreOutfitCombo().

Create a realistic user + wardrobe + context scenario where:

Candidate A

Contains:

one genuinely elevated hero;
deliberately casual supporting pieces;
coherent colour/material relationship.
Candidate B

Is more uniformly formal but visually less sophisticated.

The production pipeline must generate both candidates.

Then determine whether the current engine incorrectly prefers B.

16. FP-1 DECISION RULE
If FP-1 reproduces E2E:

Implement the smallest generalisable correction.

If FP-1 does NOT reproduce E2E:

Do not implement FP-1.

The old isolated benchmark alone is insufficient justification for another production scoring rule.

17. IF FP-1 IS IMPLEMENTED

Do NOT implement:

if one item is formal:
    ignore formality cohesion

That is too broad.

The correction must require evidence of:

one dominant hero;
intentional casual support;
appropriate occasion;
otherwise coherent outfit.

Bound the adjustment.

Create regression tests for:

intentional high-low contrast;
genuinely incoherent formality mixing;
normal smart-casual;
formal outfits;
casual outfits.
18. TRACK 3.7D — FP-2 MULTICOLOUR REPRESENTATION
Objective

Determine whether the multicolour representation causes meaningful production ranking problems.

Known issue:

HSL centroid can make multicolour garments appear effectively achromatic to colour signals.

19. DO NOT START WITH GEMINI

First investigate whether dominantHue can be determined from existing image-processing/classification infrastructure.

Determine whether the system already has sufficient information to derive:

dominantHue:
    warm
    cool
    neutral

or an equivalent representation.

Prefer deterministic extraction if reliable.

20. REQUIRED FP-2 TEST MATRIX

Create at least:

A

Floral hero + solid neutral support.

B

Floral hero + competing pattern.

C

Multicolour hero + tonal support.

D

Multicolour hero + clashing support.

E

Solid + solid baseline.

F

Printed accent rather than printed hero.

G

Warm-dominant multicolour.

H

Cool-dominant multicolour.

The objective is not:

"make patterns score higher."

It is:

allow the engine to understand the dominant colour character of a multicolour garment when that information is genuinely useful.

21. FP-2 DECISION RULE

If deterministic dominant-hue representation:

improves the intended scenarios;
does not damage pattern safety;
does not create regressions;

then implement it.

If existing data cannot support it reliably:

document the gap.

Do not immediately introduce Gemini.

22. TRACK 3.7E — FE-4 MATERIAL QUALITY ARCHITECTURE DECISION
Objective

Determine whether AuraCloset should add material-quality perception.

Known issue:

cashmere and cotton may share the same subtype and therefore be insufficiently distinguishable by deterministic metadata.

Phase 3.6 found this to be a moderate quality issue, not a catastrophic recommendation failure.

23. DO NOT IMPLEMENT FE-4 AUTOMATICALLY

First determine whether the product actually needs:

qualityTier:
    premium
    standard
    budget

Ask:

Is quality-tier information sufficiently important and sufficiently reliable to become part of the canonical WardrobeItem representation?

24. INVESTIGATE THREE OPTIONS
Option A — Existing deterministic metadata

Can current garment data reliably infer quality?

Option B — User-assisted metadata

Can the user optionally provide a quality/material attribute without creating unacceptable onboarding friction?

Option C — Gemini perception

Can Gemini infer useful quality/material information from the garment image?

Do not choose C merely because it is technically possible.

25. GEMINI DESIGN PRINCIPLE

If Gemini is eventually introduced:

Gemini must be a perception service.

Preferred architecture:

Garment image
      ↓
Gemini / vision inference
      ↓
Structured garment metadata
      ↓
qualityTier / material attributes / confidence
      ↓
Deterministic recommendation engine
      ↓
Ranked outfits

Do NOT allow:

Garment image
      ↓
Gemini
      ↓
"Gemini says this outfit is best"

Gemini should enrich the representation.

AuraCloset's deterministic recommendation engine should remain responsible for the final recommendation.

26. QUALITY-TIER CONFIDENCE

If Gemini is investigated, require confidence.

For example:

qualityTier: premium
confidence: 0.87

Do not inject low-confidence AI classifications as strong deterministic signals.

If confidence is insufficient:

fall back to existing metadata.

27. COST / LATENCY MUST BE CONSIDERED

If Gemini becomes part of the upload pipeline, evaluate:

inference cost per garment;
latency;
failure handling;
retry behaviour;
rate limits;
offline behaviour;
caching;
whether the result needs to be recomputed.

Do not add an AI dependency merely for a marginal benchmark improvement.

28. IMPORTANT — DO NOT ADD GEMINI TO RANKING

Even if FE-4 is approved:

Gemini should NOT be called:

every time an outfit is ranked.

Preferred:

infer structured garment metadata once at upload/digitisation.

Then reuse that metadata.

This protects:

latency;
cost;
determinism;
reproducibility;
ranking stability.
29. CHANGE CONTROL

For every proposed production change:

Step 1

Reproduce the problem.

Step 2

Explain the root cause.

Step 3

Propose the smallest generalisable correction.

Step 4

Implement only if evidence supports it.

Step 5

Add regression tests.

Step 6

Run Phase 3.4.

Step 7

Run Phase 3.5.

Step 8

Run Phase 3.6.

Step 9

Compare all metrics.

No change is considered successful merely because its target scenario improved.

30. REQUIRED REGRESSION MATRIX

Maintain:

Metric	Phase 3.6	After 3.7A	After 3.7B	After 3.7C	After 3.7D	Final
E2E passed	41/45					
Recommendation generated	42/45					
Empty-pool rate	7%					
Mean quality	88.5					
Median quality	91					
Mean regret	2.0					
Median regret	1					
Max regret	14					
Unit tests	43/43					

Do not compare incompatible metrics as though they are identical.

31. REQUIRED FAILURE MATRIX

For each previously known failure:

Failure	Reproduced E2E?	Root Cause	Fix Required?	Fix Implemented?
B03				
B24				
C09				
B15				
B20				
CS26/AP14 / FP-1				
CS05 / FP-2				
FE-4				
32. B20 RULE

Do not automatically increase the A-line bonus.

The Phase 3.6 B20 failure was:

77 vs 91 external quality.

The identified issue is that the A-line signal is being overwhelmed by colour harmony and accessory cohesion.

Before changing anything determine whether:

the silhouette signal is genuinely too weak;
colour harmony is too strong;
accessory cohesion is too strong;
the competing outfit is genuinely better on other dimensions;
the external evaluator is over-weighting silhouette relative to the engine's intended priorities.

Only implement a change if a generalised root cause is established.

33. DO NOT IMPLEMENT A B20-SPECIFIC FIX

Never create:

if pear && A-line:
    +X

merely to improve B20.

The correction must generalise across:

pear;
A-line;
slim tops;
different colours;
different occasions.
34. PHASE 3.7 SUCCESS CRITERIA

The phase is successful if:

Candidate generation

False-empty cases are either:

eliminated through a justified generalised fix;

or:

demonstrated to be legitimate empty states.
Weather

The B15 class of failure is resolved or appropriately bounded.

FP-1

Either:

fixed based on E2E evidence;

or:

proven unnecessary for production.
FP-2

Either:

improved through reliable structured colour representation;

or:

proven sufficiently rare to defer.
FE-4

A clear architectural decision is made.

Regression

No material degradation in:

candidate generation;
quiet luxury;
material;
minimalism;
tonal;
pattern safety;
silhouette;
personalisation;
freshness;
context;
fallback.
35. PRODUCTION FREEZE CRITERIA

After Phase 3.7, do NOT automatically continue tuning.

The recommendation engine should be considered frozen for launch if:

no catastrophic ranking failures;
no material hard-constraint failures;
empty results are explainable;
weather suitability is acceptable;
personalisation works;
context works;
freshness works;
fallback is understood;
all regression tests pass;
E2E quality remains strong;
remaining weaknesses are bounded and documented.

At that point the next step is:

Production Release Candidate / Launch Hardening

not another open-ended recommendation-engine phase.

36. REQUIRED FINAL REPORT

Return:

PHASE 3.7 — FINAL TARGETED CALIBRATION & LAUNCH HARDENING REPORT
1. Executive Summary

Maximum 15 bullets.

2. Baseline

Verify Phase 3.6.

3. 3.7A — Candidate Generation & Fallback
B03
B24
C09
Fallback stress test
Root causes
Changes
Results
4. 3.7B — Weather Suitability
B15 reproduction
Root cause
Weather matrix
Change
Regression results
5. 3.7C — FP-1
E2E reproduction
Result
Root cause
Decision
Implementation, if justified
6. 3.7D — FP-2
Multicolour test matrix
Representation analysis
Deterministic solution
Gemini requirement, if any
Decision
7. 3.7E — FE-4
Evidence
Frequency
Severity
Deterministic option
Gemini option
Cost/latency considerations
Final architecture decision
8. B20 Assessment

Explain whether another silhouette/ranking adjustment is justified.

9. Final Regression Matrix

Use the required table.

10. Final E2E Benchmark

Run the complete Phase 3.6 benchmark again after all authorised changes.

Report:

passed scenarios;
generated recommendations;
empty-pool rate;
mean quality;
median quality;
mean regret;
median regret;
maximum regret;
hard-constraint violations;
personalisation;
context;
freshness;
fallback.
11. Remaining Known Limitations

Only include genuine remaining issues.

12. Gemini Decision

Choose:

NOT REQUIRED

POST-UPLOAD PERCEPTION ONLY

REQUIRED BEFORE LAUNCH

Do not recommend Gemini as a ranking model.

13. Production Freeze Decision

Choose exactly one:

FREEZE — READY FOR PRODUCTION RELEASE CANDIDATE
FREEZE WITH MONITORING — READY FOR PRODUCTION RELEASE CANDIDATE
ONE FINAL CALIBRATION REQUIRED
DO NOT FREEZE — MATERIAL ISSUES REMAIN
37. FINAL NON-NEGOTIABLE PRINCIPLE

AuraCloset has now reached the point where restraint is more important than adding intelligence.

Do not assume every known benchmark weakness deserves a production-code change.

A problem should be fixed only when:

It is reproducible → materially affects users → has a generalisable root cause → has a low-regression-risk solution.

Otherwise:

document it, instrument it, and move on.

The objective of Phase 3.7 is not to achieve a perfect benchmark.

The objective is to determine whether the recommendation engine is good enough, robust enough, and predictable enough to freeze for production.

At the end of this phase, we should be able to say one of two things with confidence:

"The remaining imperfections are bounded. Freeze the engine and launch."

or:

"This specific, evidence-backed problem genuinely needs one final correction."

There should be no automatic Phase 3.8 merely because Phase 3.7 exists.

Do not make any production recommendation-engine changes until each track has first reproduced and diagnosed its target problem.