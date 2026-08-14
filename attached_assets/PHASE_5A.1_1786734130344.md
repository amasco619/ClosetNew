PHASE 5A.1 — AMODKA PREMIUM EXPERIENCE RELEASE HARDENING



Phase 5A is substantially approved, but do not proceed to Phase 5B yet.



Your Phase 5A implementation is strong overall. The recommendation engine remains correctly frozen at v3.7, and the regression suites remain green. However, the review identified several corrections that must be completed before Phase 5A can be formally closed.



This is a targeted hardening phase, not a redesign or rewrite.



CRITICAL RULE — DO NOT MODIFY RECOMMENDATION ENGINE V3.7



The recommendation engine remains frozen.



Do not modify:



scoring weights;

scoring formulas;

ranking;

candidate generation;

candidate ordering;

hard constraints;

fallback semantics;

weather scoring;

silhouette scoring;

colour scoring;

pattern scoring;

material scoring;

formality scoring;

freshness;

personalisation;

thresholds.



Do not modify the recommendation engine merely to make any test or UI behaviour pass.



If a requirement appears to require recommendation-engine changes:



STOP, document it, and report it.



The objective is to improve the product interpretation and presentation layer, not the recommendation engine.



CORRECTION 1 — FIX THE WARDROBE GAP SEMANTICS



This is the most important correction.



The current implementation detects a wardrobe gap primarily from:



weather conditions; and

absence of an outerwear item.



That is not sufficiently precise.



The product requirement is:



When the recommendation engine genuinely cannot construct a valid outfit, AuraCloset/Amodka should explain the likely wardrobe capability that is missing rather than presenting the situation as a generic failure.



Therefore:



Required architecture



The logical flow should be:



Current user/context/weather

&#x20;         ↓

Existing recommendation engine

&#x20;         ↓

Can a valid outfit be constructed?

&#x20;      /           \\

&#x20;    YES            NO

&#x20;     ↓              ↓

Normal outfit    Diagnose likely

&#x20;                wardrobe gap

&#x20;                     ↓

&#x20;             WardrobeGapCard



The recommendation engine itself must remain unchanged.



The UI/product layer should interpret its output.



Important distinction



Do NOT make this logic:



rain/cold

\+

no outerwear

=

no valid outfit



That is an invalid assumption.



For example, the user may possess another garment that legitimately satisfies the weather requirements even if its category metadata is not outerwear.



Likewise, the absence of an item classified as outerwear does not by itself prove that no valid outfit exists.



Required behaviour



When the existing recommendation engine returns no valid outfit under the current context:



determine whether the failure appears to be caused by weather/context/wardrobe capability;

inspect the available wardrobe metadata;

identify the most defensible missing capability;

display the appropriate WardrobeGapCard.



For example:



Your wardrobe is missing one piece for today's conditions.



Today is cold and wet — your wardrobe doesn't currently include a suitable warm, waterproof outer layer.



Missing: Warm waterproof outerwear



Only present this explanation when the available evidence supports it.



Do NOT fabricate a diagnosis



If the system cannot confidently determine why no valid outfit exists, use the generic recommendation error state:



We couldn't curate a look right now.



Your wardrobe is safe. Please try again.



Do not claim:



"You're missing waterproof outerwear"



unless the system has sufficient evidence for that conclusion.



Test cases required



Add or update tests covering at least:



Test A — genuine cold/rain gap



Cold/rain context + no valid outfit + no suitable weatherproof layer.



Expected:



WardrobeGapCard



Test B — valid outfit despite rain



Rain context + wardrobe contains a valid weather-appropriate combination.



Expected:



normal recommendation.



No WardrobeGapCard.



Test C — no valid outfit, but cause is not weather



Example:



occasion/formality incompatibility.



Expected:



generic recommendation failure or appropriate non-weather explanation.



Do not incorrectly report missing waterproof outerwear.



Test D — unconventional valid weather solution



Where a garment does not simply satisfy:



category === 'outerwear'



but its metadata is sufficient to satisfy the actual weather requirements.



Expected:



normal recommendation.



This test is specifically intended to prevent the UI from equating category labels with actual capability.



CORRECTION 2 — RECLASSIFY THE PHOTOROOM/GEMINI BENCHMARK EVIDENCE



The Phase 5A report currently describes the PhotoRoom → Gemini result as an adopted, validated improvement.



The architectural decision is reasonable and the existing production pipeline is already:



Original image

&#x20;     ↓

PhotoRoom

&#x20;     ↓

Clean garment image

&#x20;     ↓

Gemini



However, the evidence presented does not constitute a rigorous quantitative benchmark of classification accuracy.



Therefore:



Do NOT manufacture numerical accuracy claims.



Do not claim:



"X% more accurate";

"Y% improvement";

"statistically significant improvement";



unless those numbers were actually measured against labelled data.



Correct classification



Document the current conclusion as:



PhotoRoom → Gemini is the adopted production architecture based on engineering analysis and existing evidence. A controlled quantitative accuracy benchmark remains future validation work.



The report may state that the cleaned garment image is expected to reduce:



background noise;

colour bleed;

pattern confusion;

irrelevant visual information.



But clearly distinguish:



Engineering rationale



from:



Empirical benchmark evidence.

Benchmark documentation



Review scripts/benchmark-pipeline.ts.



Ensure that it does not imply that a proxy/descriptive dataset constitutes a real classification-accuracy benchmark.



If the script is not performing actual labelled-image comparisons, label it accordingly.



Do not delete the script if it is useful.



Instead make its purpose explicit:



Benchmark framework / methodology — quantitative validation pending.



CORRECTION 3 — COMPLETE THE AMODKA NATIVE BRANDING



The report identifies this as the remaining release-hardening item.



The native icon/splash assets still contain AuraCloset branding.



Resolve this now.



Required:



assets/images/icon.png

assets/images/splash-icon.png

any other production-visible native launch assets



must use the new Amodka identity.



There must be no visible AuraCloset branding in:



native splash;

application icon;

app metadata;

launch experience;

authentication;

onboarding;

Home;

Outfit;

Wardrobe;

Profile;

Premium.



Do not create an elaborate new logo as part of this task.



Use the currently approved Amodka wordmark/brand treatment consistently.



CORRECTION 4 — AUDIT REMAINING USER-FACING ERROR STRINGS



The report identifies remaining bare error strings as task #405.



Do not blindly replace every technical error message.



Perform an audit.



Create a table:



Location	Current message	User-visible?	Technical/internal?	Action



For every user-visible error:



use AmodkaErrorState where appropriate;

maintain the premium tone;

provide an actionable recovery path where possible;

never expose stack traces;

never expose API keys;

never expose raw database errors;

never expose internal service names unnecessarily.



For internal/debug/telemetry messages:



leave them technical where appropriate.



Do not sacrifice useful diagnostics merely to make logs sound premium.



CORRECTION 5 — LOCAL STORAGE / REBRAND MIGRATION AUDIT



The rebrand changed storage keys such as:



@auracloset\_\*



to:



@amodka\_\*



The Phase 5 report states that the wardrobe-view key does not require migration because it stores only a UI preference.



Verify this assumption across all renamed AsyncStorage/local-storage keys.



Create a table:



Old key	New key	Data type	User-critical?	Migration required?	Reason



If a renamed key contains:



authentication state;

onboarding state;

user preferences;

cached wardrobe data;

subscription information;

any other user-critical state;



do not simply discard it.



Implement a safe migration if required.



If no migration is required, document why.



CORRECTION 6 — PRODUCTION IDENTIFIER CHECK



The rebrand changed:



scheme → amodka

bundle identifier → com.amodka

Android package → com.amodka



Verify that the changes are internally consistent.



Audit:



Expo configuration;

deep-link scheme;

OAuth redirect construction;

authentication callback handling;

intent filters;

iOS configuration;

Android configuration;

environment configuration;

any hard-coded auracloset:// references.



Do not modify external production credentials or provider configuration as part of this task unless absolutely necessary.



Simply identify any external configuration that Phase 5B/native setup will need to update.



Return a list:



External configuration changes required later



This is preparation, not implementation.



DO NOT IMPLEMENT THESE ITEMS



Do not implement:



Google authentication changes;

Apple authentication;

Apple IAP;

Google Play Billing;

subscription entitlement architecture;

push notifications;

Admin panel;

private Supabase storage migration;

Travel Concierge;

virtual try-on;

Android production pipeline;

Terms of Use;

Privacy Policy;

Data Inventory/ROPA.



These belong to subsequent controlled phases.



You may identify dependencies or risks, but do not implement them.



REGRESSION REQUIREMENTS



Before making changes:



npm test

npm run typecheck



Record the baseline.



After implementation, run:



npm test

npm run typecheck



Also explicitly verify:



Phase 3.6 benchmark;

Phase 3.7 suite;

golden regression set;

resilience suite;

weather matrix;

Phase 5A fallback test.



Expected:



Recommendation engine behaviour: unchanged



Any unexpected recommendation-result change is a STOP condition.



REQUIRED FINAL REPORT



Return:



PHASE 5A.1 — RELEASE HARDENING REPORT

1\. Executive Summary



State whether all requested corrections were completed.



2\. Wardrobe Gap Logic



Show the final decision flow.



Include results for:



cold/rain gap;

valid rainy-weather outfit;

non-weather failure;

unconventional weather-compatible garment.

3\. PhotoRoom → Gemini Evidence Classification



Clearly separate:



What is empirically demonstrated



from:



What is engineering inference.



State whether quantitative benchmark validation remains outstanding.



Do not overstate the evidence.



4\. Native Branding



List every native asset inspected and its final state.



Explicitly confirm:



No AuraCloset branding remains in production-visible native assets.



5\. Error Audit



Provide the user-visible error inventory.



Identify anything still requiring future work.



6\. Storage-Key Migration Audit



Provide the complete old-key → new-key table and migration decision.



7\. Production Identifier Audit



Report:



iOS bundle identifier;

Android package;

URL scheme;

OAuth scheme references;

remaining legacy references;

external configuration required for later native/authentication phases.

8\. Regression Results

Suite	Before	After

Unit		

TypeScript		

Phase 3.6		

Phase 3.7		

Golden		

Resilience		

Weather		

Phase 5A fallback		

9\. Recommendation Engine Integrity



Explicitly state:



Recommendation Engine v3.7 remains behaviourally unchanged.



If this is not true:



STOP — DO NOT MARK PHASE 5A.1 COMPLETE.



DECISION



At the end, choose exactly one:



✅ GO — Phase 5A can now be formally closed

⚠️ GO WITH MINOR HARDENING

❌ NO-GO

FINAL INSTRUCTION



This is a targeted correction phase.



Do not use it as an opportunity to introduce additional features, redesign unrelated screens, change recommendation behaviour, or "improve" the architecture beyond the issues explicitly identified above.



The objective is:



Correct the identified weaknesses, preserve the successful Phase 5A work, prove that the recommendation engine remains untouched, and leave the codebase ready to enter Phase 5B — Trust, Privacy \& Business Risk.



Do not proceed to Phase 5B implementation during this task.

