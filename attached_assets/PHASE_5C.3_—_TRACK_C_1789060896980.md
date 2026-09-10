PHASE 5C.3 — TRACK C
Nigerian/African Fashion Intelligence — Frozen v3.7 Baseline Evaluation
AUTHORIZATION

The Product Owner explicitly authorizes execution of Track C against the frozen Nigerian/African Fashion Benchmark v1.

This is an evaluation-only task.

The purpose is to establish an empirical baseline for the existing frozen Recommendation Engine v3.7 for Amodka v1's initial Nigerian/African market.



1. ABSOLUTE ENGINE FREEZE

Recommendation Engine v3.7 must remain completely unchanged during this task.

Do NOT modify:

scoring weights;
ranking logic;
candidate generation;
constraints;
outfit generation;
taxonomy;
weather logic;
recommendation version;
existing recommendation golden set;
production recommendation behaviour.

Do not fix a problem discovered during the benchmark.

Do not tune anything.

Do not add Nigeria-specific logic.

Do not add Ankara-specific weights.

Do not add African occasion rules.

Do not modify production code to improve benchmark performance.

If the benchmark exposes a weakness, record the weakness. Do not fix it.

Any future engine change must happen only after this baseline has been recorded and a separate hypothesis/experiment has been approved.



2. BENCHMARK AUTHORITY

Use only the frozen snapshot:

docs/recommendation/africa/benchmark-v1/frozen-v1/

The benchmark version is:

1.0.0-frozen

The engine under test is:

Recommendation Engine v3.7

The active product scope is:

Amodka v1
Women-focused
Initial market: Nigeria/Africa

The benchmark contains:

40 garment cases;
30 outfit-ranking cases;
20 occasion cases;
10 weather/context cases;
100 total cases.

Do not add, remove, reorder, rewrite, or substitute benchmark cases.

Do not modify the frozen snapshot.



3. GOLD DATA MUST REMAIN HIDDEN DURING ENGINE EXECUTION

The evaluation must enforce this sequence:

FROZEN BENCHMARK INPUT
↓
RECOMMENDATION ENGINE v3.7
↓
CAPTURE RAW ENGINE OUTPUT
↓
LOCK ENGINE OUTPUT
↓
LOAD GOLD LABELS
↓
EVALUATE

The engine must not receive:

gold ranking;
preferred candidate;
reviewer scores;
reviewer rationale;
expected winner;
gold classification;
gold occasion answer;
gold weather answer.

Do not allow gold data to enter the engine's prompt/context/input.

If technically necessary, create a separate execution process that cannot access the gold directory until engine outputs have been written and sealed.



4. DO NOT USE QUARANTINED MATERIAL

Do not load:

internal/non-gold-drafts/
internal/future-v2-mens-fashion/
internal/case-design-intent.md
internal/gu-taxonomy-analysis.md

as benchmark inputs.

The men's benchmark material is not part of Amodka v1.

The active benchmark must remain women-focused.



5. EXECUTE ALL 100 CASES

Run the frozen v3.7 engine against all active cases.

Do not silently skip a case.

If a case cannot execute:

record the case ID;
record the exact error;
classify the failure;
continue where safe;
do not modify the engine to make it execute.

At the end report:

Cases attempted
Cases successfully executed
Cases failed to execute
Cases skipped

The target is:

100/100 executed

but do not fabricate completion if any fail.



6. CAPTURE RAW ENGINE OUTPUT

For every case preserve the actual v3.7 output before evaluation.

Record at minimum:

case ID;
engine version;
timestamp;
input fingerprint;
engine output;
candidate ranking;
scores where available;
selected/preferred result where applicable;
execution status.

Do not overwrite outputs.

Do not edit outputs after generation.

Create a separate Track C results directory.

The frozen benchmark must remain read-only.



7. GARMENT CLASSIFICATION EVALUATION

For GU-01 through GU-40, compare the engine output against the locked reviewer labels.

Measure, where the engine exposes the corresponding information:

Category

Exact agreement.

Subtype

Exact agreement.

Pattern

Exact agreement.

Relevant cultural attributes

Agreement where represented.

Overall classification

Report both:

exact agreement;
dimension-level agreement.

Do not penalise the engine for a distinction that the current production taxonomy genuinely cannot represent without first identifying it as a representation gap.

This distinction is critical.



A failure can be:

Engine recognised the concept incorrectly



or:

Engine had no production representation for the concept



Those are different engineering problems.



8. OUTFIT-RANKING EVALUATION

For OR-01 through OR-30, compare v3.7's ranking against the reviewer gold ranking.

Calculate where supported:

Top-1 agreement;
ranking agreement;
pairwise agreement;
acceptable-candidate recall;
rejection of not-acceptable candidates;
regret;
candidate-level agreement.

Do not manufacture a metric if the data does not support it.

Clearly document the formula used for every metric.



9. OCCASION EVALUATION

For OC-01 through OC-20 evaluate whether v3.7 selects/ranks clothing appropriately for the specified context.

Pay particular attention to:

traditional wedding;
Western/white wedding;
reception;
aso-ebi;
church;
naming ceremony;
cultural ceremony;
funeral/burial;
corporate/business;
casual/social;
diaspora/UK transition.

Report failures individually.



10. WEATHER/CONTEXT EVALUATION

For WX-01 through WX-10 evaluate:

weather suitability;
heat suitability;
rain suitability;
harmattan suitability;
evening suitability;
indoor air-conditioning suitability;
UK/diaspora climate transition.

Do not change weather logic during the test.



11. ANKARA / WAX-PRINT ANALYSIS

Produce a dedicated Ankara analysis.

Measure performance on:

Ankara + neutral ground;
Ankara + competing print;
different print scales;
coordinated Ankara sets;
non-matching separates;
formal Ankara;
casual Ankara;
Ankara under different weather conditions.

We particularly want to determine whether v3.7 understands:

Ankara as a fashion/styling context, rather than merely a pattern.

Do not assume that an Ankara failure means the engine needs an "Ankara score."

Diagnose the actual failure mechanism.



12. CULTURAL-CONTEXT ANALYSIS

Create a dedicated cultural-context report.

Identify whether failures arise from:

incorrect garment recognition;
incorrect occasion interpretation;
incorrect formality;
pattern/visual-weight reasoning;
silhouette/proportion;
cultural-context representation;
candidate-generation limitations;
weather interaction;
taxonomy limitations;
other.

Do not infer a causal explanation unless the evidence supports it.



Use:

Observed result
→ Evidence
→ Failure classification



rather than:

Observed result
→ Assumed cause


13. WESTERN-DEFAULT BIAS ANALYSIS

Explicitly investigate whether v3.7 systematically prefers Western styling when a Nigerian/African option is more appropriate.

Do not call something Western-default bias merely because the winning outfit is Western.

The question is:

Did the engine select the less culturally/contextually appropriate option despite the scenario supporting the Nigerian/African option?

Provide the actual case IDs and evidence.



14. WEATHER VS CULTURAL TRADE-OFFS

Identify cases where cultural appropriateness and environmental practicality conflict.

For example:

Nigerian cultural identity
+
UK cold/rain

Determine whether v3.7 balances the two appropriately.

Do not modify the engine.



15. FAILURE SEVERITY

Classify failures:

P0 — Critical

Fundamentally unusable recommendation/classification.

P1 — Major

Clearly inappropriate recommendation for the stated scenario.

P2 — Moderate

Acceptable but materially inferior recommendation.

P3 — Minor

Stylistic disagreement or low-impact deviation.

Do not use severity to hide disagreement.

Where reviewer judgement is genuinely subjective, identify it.



16. GOLD-SET LIMITATION

The benchmark is:

Expert-reviewed gold benchmark — single reviewer; IRR not performed.

Do not represent it as multi-rater consensus.

Do not claim statistical generalisation to all Nigerian women.

This is an internal product benchmark designed to identify meaningful capability gaps.



17. COMPARE AGAINST EXISTING V3.7 PERFORMANCE

Do not modify the existing v3.7 golden regression set.

Report Nigerian/African results separately.

Then compare them conceptually against the existing v3.7 baseline.

The purpose is to establish whether future Nigeria-specific changes can improve African performance without degrading existing capabilities.

Do not run experimental changes in this task.



18. IMPORTANT — NO ENGINE CHANGES AFTER FAILURES

If you find:

"Ankara is underweighted"

or:

"traditional-event isn't represented sufficiently"

or:

"lace is being misclassified"

or:

"rain recommendations are weak"

do NOT fix it.

Instead report:

Finding
Evidence
Affected cases
Likely mechanism
Confidence
Potential hypothesis

The potential hypothesis is for the next experiment, not an instruction to modify v3.7 now.



19. CREATE A TRACK C BASELINE ARTIFACT

Create:

docs/recommendation/africa/track-c/



with a structure similar to:

baseline-v3.7/
README.md
execution-manifest.json
raw-engine-output/
metrics.json
case-results.csv
garment-results.csv
outfit-results.csv
occasion-results.csv
weather-results.csv
ankara-analysis.md
cultural-context-analysis.md
failure-analysis.md
regression-comparison.md

Do not store secrets.

Do not store unnecessary personal information.

Do not commit raw authentication tokens, user IDs, API keys, or private production data.



20. REPRODUCIBILITY

Record:

benchmark version;
benchmark hash;
engine version;
code commit/version if available;
execution date;
configuration;
model/API versions if relevant and available;
input fingerprints;
output fingerprints.

The objective is that another engineer can reproduce the baseline.



21. TESTING

Run after the evaluation:

npm test
npm run typecheck
npm run lint

If dedicated Track C tests exist, run them.

Report:

test result;
typecheck;
lint;
benchmark execution status.

Do not modify production code merely to make these checks pass.



22. PRODUCTION-SAFETY REQUIREMENTS

Confirm explicitly:

no production recommendation logic changed;
no recommendation weights changed;
no taxonomy changed;
no production database changed;
no Supabase migration;
no RLS change;
no Storage change;
no authentication change;
no entitlement change;
no payment change;
no FASH integration;
no production deployment;
no production user data modified;
frozen benchmark snapshot unchanged;
existing v3.7 golden set unchanged.


23. FINAL REPORT

Return a comprehensive report containing:

1. Executive Summary
2. Execution Environment
3. Benchmark Integrity Confirmation
4. Case Execution Summary
5. Overall Results
6. Garment Classification Results
7. Outfit Ranking Results
8. Occasion Results
9. Weather Results
10. Ankara/Wax-Print Results
11. Cultural-Context Results
12. Western-Default Bias Analysis
13. Weather/Culture Trade-Off Analysis
14. Failure Taxonomy
15. Case-Level Failures
16. Severity Distribution
17. Representation Gaps

Clearly distinguish:

engine failure
vs
taxonomy/representation gap
vs
benchmark ambiguity
18. Nigerian/African Strengths

Identify what v3.7 already does well.

Do not manufacture weaknesses simply because this is a diagnostic exercise.

19. Nigerian/African Weaknesses

Evidence-based only.

20. Existing v3.7 Regression Comparison
21. Candidate Hypotheses for Future Work

These are hypotheses only.

22. Recommended Experiments

Do not implement them.

23. Reproducibility Information
24. Tests
25. Production-Safety Confirmation
26. Final Recommendation

Use one of:

A — Ready for Nigerian/African launch from recommendation perspective
B — Minor recommendation improvements advisable before launch
C — Material recommendation gaps require remediation before Nigerian/African launch
D — Benchmark execution inconclusive

Do not select the category based purely on an arbitrary numerical threshold. Explain the evidence supporting the conclusion.



ABSOLUTE STOP CONDITION

After producing the Track C baseline report:

STOP.

Do not:

modify v3.7;
implement recommendations;
tune weights;
add Nigerian-specific rules;
alter the benchmark;
rerun cases after modifications;
declare a new engine version;
deploy.

The Product Owner will review the baseline and decide whether a separate hypothesis → controlled experiment → regression → approval cycle is warranted.

END PHASE 5C.3 — TRACK C

