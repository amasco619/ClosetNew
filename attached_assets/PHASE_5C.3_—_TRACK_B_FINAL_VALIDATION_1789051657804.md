PHASE 5C.3 — TRACK B FINAL VALIDATION → TRACK C READINESS

Mission



We are preparing Amodka v1, a women-focused luxury wardrobe/stylist application.



Our initial market is Nigeria/Africa, followed by the UK and then global expansion.



The production Recommendation Engine v3.7 is currently frozen.



The purpose of this task is to perform the final integrity and provenance validation of the Nigerian/African fashion benchmark and prepare the project for Track C.



IMPORTANT



Do NOT modify Recommendation Engine v3.7.



Do NOT modify:



recommendation scoring;

ranking weights;

candidate generation;

constraint logic;

recommendation taxonomy;

recommendation version;

production recommendation behaviour;

existing v3.7 golden regression set;

Supabase schema;

RLS;

Storage;

authentication;

entitlements;

payments;

telemetry;

FASH API;

production configuration.



Do NOT deploy anything.



Do NOT tune the engine.



Do NOT execute Track C in this task.



This task is benchmark validation and freeze preparation only.



1\. AUTHORITATIVE BENCHMARK CONTEXT



Track A — Nigeria/Africa Fashion Intelligence Capability Audit — identified that v3.7 already has meaningful foundations for Nigerian/African fashion but that we did not yet have sufficient empirical evidence to claim that it performs well for this market.



The benchmark was therefore created to test this independently.



The benchmark contains:



40 garment-understanding cases;

30 competitive outfit-ranking cases;

20 occasion/context cases;

10 weather/context cases;

100 cases total.



The benchmark intentionally covers areas including:



Ankara / African wax print;

lace;

aso-ebi;

aso-oke;

buba;

iro/wrapper;

kaftan;

boubou;

gele;

Adire;

Kente where relevant;

African-Western fusion;

weddings;

church;

naming ceremonies;

cultural events;

business;

casual;

Nigerian weather;

rain;

heat;

harmattan;

diaspora/UK transition scenarios.



The benchmark was specifically designed so that the independent reviewer sees no engine predictions, developer opinions, or internal engine rules.



2\. AMODKA V1 SCOPE — WOMEN ONLY



Amodka v1 is explicitly women-focused.



Therefore:



Active v1 benchmark



Only women's Nigerian/African fashion cases are part of the v1 evaluation.



If the repository still contains the previously created men's cases GU-33–GU-40:



do NOT delete them;

do NOT include them in the v1 Track C evaluation;

move/quarantine them clearly as a future men's-fashion benchmark;

ensure the Track C runner cannot accidentally include them.



Do not modify production functionality to accomplish this.



3\. AUTHORITATIVE IMAGE PACKAGE



A synthetic image package has now been supplied separately:



generated-images.zip



It contains the benchmark garment images.



The supplied package establishes that:



GU-01 through GU-40 are synthetic images;

they were purpose-created for this benchmark;

they contain no people/faces/hands/identifying features;

they contain no visible logos/brands/text;

the package contains an image audit contact sheet;

it contains a synthetic image provenance register;

the provenance register identifies the images as synthetic and records their generation/provenance information;

the images were shared with the independent reviewer.

IMPORTANT



Do NOT regenerate these images.



Do NOT replace them with internet images.



Do NOT scrape Google Images.



Do NOT alter the reviewer labels because of the image package.



4\. PROVENANCE RECONCILIATION



Inspect the existing benchmark provenance documentation and reconcile it against the supplied synthetic image package.



Specifically verify:

GU-01 → correct image

GU-02 → correct image

...

GU-40 → correct image



Verify that each benchmark garment case has the correct image reference.



Verify that the image IDs in:



benchmark fixture files;

reviewer package;

runner fixtures;

gold-label package;

provenance register



are consistent.



Where an older document still says image provenance is PENDING, determine whether that status has been superseded by the supplied synthetic-image provenance register.



Do not silently erase historical information.



Instead, preserve an auditable record showing that the supplied synthetic provenance register is now the authoritative provenance record for these images.



Important qualification



Do NOT claim that the external image-generation platform's legal licence terms have been independently verified unless there is actual evidence in the repository.



Distinguish:



image is synthetic;

provenance is documented;

internal benchmark/reviewer use is recorded;

external platform licence terms independently verified.



Do not conflate these.



5\. REVIEWER GOLD-LABEL INTEGRITY



The reviewer has already supplied the benchmark labels.



Treat the reviewer's labels as the gold-label authority for the benchmark.



Do NOT modify their substantive judgements.



Do NOT "correct" the reviewer using Amodka's taxonomy.



Do NOT change their ranking because the engine would prefer something else.



Do NOT generate replacement gold labels.



The benchmark is a single-expert gold-label set.



The reviewer package currently indicates that inter-rater reliability was not performed.



Therefore describe the evidence accurately as:



Expert-reviewed gold benchmark — single reviewer; IRR not performed.



Do not describe it as consensus ground truth or statistically validated multi-rater ground truth.



6\. RUN A COMPLETE DETERMINISTIC BENCHMARK INTEGRITY AUDIT



Create or execute an automated validation that verifies all of the following.



Case structure



Confirm:



exactly 100 active v1 cases;

40 garment cases;

30 outfit-ranking cases;

20 occasion cases;

10 weather/context cases.

IDs



Confirm:



no duplicate case IDs;

every referenced case exists;

every candidate ID exists;

every image ID exists;

every fixture fingerprint resolves.

Gold labels



Confirm:



every case has the required reviewer fields;

rankings contain valid candidate IDs;

no candidate appears twice in a ranking;

preferred candidate exists in the candidate set;

acceptable candidates exist;

unacceptable candidates exist where required;

no impossible or contradictory references exist.

Pairwise cases



Confirm:



both candidates exist;

pairwise direction is valid;

no self-comparison exists;

pairwise metadata references valid candidates.

Reviewer/runner separation



Confirm that reviewer-owned gold labels do NOT contain:



Amodka predictions;

engine scores;

developer predictions;

engine ranking;

internal scoring weights;

case-design intent;

hidden taxonomy assumptions.



The runner may retain internal mapping information, but it must remain separate from the reviewer-owned gold data.



7\. CHECK FOR THE PREVIOUSLY QUARANTINED MATERIAL



There are older internally-authored benchmark drafts in the repository.



They must remain clearly marked:



NON-GOLD / QUARANTINED



Confirm that:



they cannot be accidentally loaded by Track C;

they are not included in benchmark metrics;

they cannot overwrite reviewer gold labels;

they are not treated as ground truth.



Do not delete them unless there is a compelling repository-safety reason.



8\. CHECK THE REVIEWER PACKAGE FOR BIAS LEAKAGE



Perform one final audit for language that could steer the reviewer.



Look specifically for terms such as:



"Adversarial";

"coordination test";

"pattern overload";

"expected winner";

"should win";

"engine weakness";

"engine failure";

"v3.7";

"Amodka score";

"recommended answer".



If such wording exists in the reviewer-facing material, remove or neutralise it.



Internal case-design intent may remain in:

internal/case-design-intent.md



but must not appear in reviewer-facing materials.



9\. VALIDATE THE NIGERIAN/AFRICAN COVERAGE



Produce a coverage matrix.



At minimum report the number of cases testing:



Garments / fashion

Ankara;

wax print;

lace;

aso-ebi;

aso-oke;

Adire;

buba;

iro/wrapper;

kaftan;

boubou;

gele;

contemporary African fashion;

African-Western fusion.

Occasions

traditional wedding;

white wedding;

reception;

aso-ebi participation;

church;

naming ceremony;

cultural ceremony;

corporate/business;

casual/social;

high-end event.

Environment

hot/humid;

extreme heat;

rain;

rainy season;

harmattan;

evening;

air-conditioned indoor environment;

UK/diaspora transition.



Do not invent coverage where none exists.



Report actual counts.



10\. PARTICULARLY VALIDATE ANKARA TEST COVERAGE



Report whether the benchmark contains meaningful tests of:



Ankara + neutral;

Ankara + competing print;

different print scales;

coordinated Ankara set;

non-matching Ankara separates;

Ankara in formal contexts;

Ankara in casual contexts;

Ankara under different weather conditions.



This matters because the question we eventually need to answer is not:



"Can Amodka recognise Ankara?"



It is:



"Can Amodka style Ankara appropriately?"



11\. VALIDATE CULTURAL-CONTEXT TESTING



Confirm that the benchmark genuinely distinguishes:



traditional Nigerian event

vs

Western formal event

vs

church

vs

business

vs

casual

vs

diaspora/UK context



The objective is to determine whether Amodka understands cultural context rather than simply rewarding garments containing African visual cues.



12\. VALIDATE WEATHER TESTING



Confirm that weather cases genuinely test contextual suitability.



Do not alter the benchmark to make the engine look better.



Report actual coverage.



Particularly identify cases testing:



extreme Nigerian heat;

heavy rain;

humid conditions;

harmattan;

cooler evening;

indoor air conditioning;

Nigerian-to-UK transition.



13\. CREATE A FORMAL BENCHMARK MANIFEST



Create a machine-readable benchmark manifest containing at minimum:



benchmark\_version

benchmark\_scope

product\_scope

case\_count

case\_distribution

gold\_label\_version

image\_package\_version

provenance\_register\_version

reviewer\_id

reviewer\_date

irr\_status

engine\_version\_under\_test



For the current benchmark:



product\_scope = women

market\_scope = Nigeria/Africa

engine\_version\_under\_test = 3.7

irr\_status = not\_performed



Do not put private reviewer information beyond what is already authorised in source-controlled files.



14\. FREEZE THE BENCHMARK



If all integrity checks pass, create a clear immutable/frozen benchmark snapshot.



The snapshot must include:



active 100-case fixture set;

reviewer gold labels;

benchmark manifest;

synthetic image references;

provenance register;

schema version;

benchmark version.



Record hashes/checksums where appropriate so that the Track C evaluation cannot accidentally run against a modified benchmark.



15\. DO NOT RUN TRACK C YET



This is extremely important.



Even if all checks pass:



DO NOT execute Recommendation Engine v3.7 against the benchmark in this task.



The next task will be:



PHASE 5C.3 — TRACK C: Execute Frozen Recommendation Engine v3.7 Against Nigerian/African Gold Benchmark



Track C must begin from the untouched v3.7 engine.



16\. PREPARE THE TRACK C RUNNER



You may prepare the runner/configuration, but do not execute it.



The runner must guarantee:



Frozen Gold Labels

&#x20;       ↓

Frozen Benchmark Inputs

&#x20;       ↓

Recommendation Engine v3.7

&#x20;       ↓

Engine Output

&#x20;       ↓

Independent Evaluation



The engine must not receive:



gold ranking;

preferred candidate;

reviewer score;

reviewer rationale;

expected answer.



The evaluator may see both engine output and gold labels only after engine output has been captured.



17\. TRACK C METRICS TO PREPARE



Prepare the runner to calculate, where applicable:



Garment classification

exact accuracy;

category accuracy;

subtype accuracy;

pattern accuracy;

relevant cultural-context accuracy.



Outfit ranking

preferred-candidate accuracy;

Top-1 agreement;

pairwise agreement;

ranking correlation where statistically appropriate;

acceptable-candidate recall;

unacceptable-candidate rejection;

regret.



Context

occasion agreement;

weather suitability;

cultural appropriateness.



Aggregate

overall benchmark score;

category-level scores;

failure counts;

failure severity.



Do not invent metrics where the benchmark structure doesn't support them.



18\. PREPARE AN ERROR TAXONOMY



Track C should eventually classify failures into categories such as:



garment recognition;

fabric recognition;

pattern recognition;

cultural-context failure;

occasion failure;

weather failure;

visual-weight/pattern failure;

silhouette/proportion failure;

coordination failure;

over-formality;

under-formality;

Western-default bias;

other.



This taxonomy must be used for diagnosis only.



It must not influence v3.7 during the baseline run.



19\. PRESERVE THE EXISTING V3.7 GOLDEN SET



The existing v3.7 golden regression set must remain untouched.



The future Track C analysis must compare:



A



Nigerian/African benchmark performance



against



B



existing v3.7 regression performance.



The purpose is to determine whether a future Nigeria/Africa improvement causes regressions elsewhere.



20\. TESTING



Run:

npm test

npm run typecheck



If benchmark tooling has dedicated tests, run those too.



Report:



test count;

failures;

typecheck result;

benchmark-validator result.



Do not modify production code merely to make benchmark tooling pass.



21\. PRODUCTION-SAFETY CHECK



Before finishing, confirm:



Recommendation Engine v3.7 unchanged;

existing v3.7 golden set unchanged;

no production database changes;

no Supabase migrations;

no RLS changes;

no Storage changes;

no authentication changes;

no entitlement changes;

no payment changes;

no FASH API changes;

no production secrets changed;

no deployment performed.

22\. REQUIRED FINAL REPORT



Return the report under these headings:



1\. Executive Summary

2\. Benchmark Version

3\. Product Scope



Explicitly state that Amodka v1 is women-focused.



4\. Case Distribution

5\. Gold-Label Integrity

6\. Reviewer Independence



State:



reviewer count;

reviewer ID/reference if already authorised;

reviewer date;

whether IRR was performed.

7\. Image Provenance



Clearly distinguish:



synthetic status;

provenance documentation;

internal-use status;

platform licence verification status.

8\. Image-to-Case Mapping



Report GU-01 through GU-40 verification.



9\. Nigerian/African Coverage Matrix



Provide actual case counts.



10\. Ankara/Wax-Print Coverage

11\. Cultural-Context Coverage

12\. Weather/Climate Coverage

13\. Reviewer/Runner Separation Audit

14\. Quarantined Historical Material

15\. Benchmark Validator

16\. Benchmark Freeze / Hash

17\. Track C Runner Readiness

18\. Tests

19\. Production-Safety Confirmation

20\. Issues / Exceptions



Do not hide unresolved issues.



21\. Recommended Next Action



If everything passes, state:



TRACK B COMPLETE — READY FOR TRACK C



But do not execute Track C.



ABSOLUTE STOP CONDITION



Stop after this validation.



Do not:



modify v3.7;

tune recommendation weights;

change taxonomy;

change production code;

run the Nigerian/African benchmark;

declare Nigeria/Africa readiness;

claim the engine is good or bad for Nigerian users.



We need the actual Track C baseline results before making any engine decision.



END PHASE 5C.3 — TRACK B FINAL VALIDATION

