PHASE 5B.1 — NIGERIA/AFRICA READINESS + PRE-LAUNCH SECURITY HARDENING



You have completed Phase 5B.



The Phase 5B report is accepted as the baseline, but Phase 5B is not yet closed.



The launch strategy has now been formally updated to:



Nigeria/Africa → UK → Global



Nigeria/Africa is the initial commercial beachhead, not a permanent restriction on the product.



Amodka must therefore remain globally capable while being demonstrably capable of handling Nigerian/African fashion, climate, privacy and compliance requirements.



PART 1 — DO NOT MODIFY RECOMMENDATION ENGINE V3.7



The recommendation engine remains frozen.



Do not modify:



scoring;

ranking;

candidate generation;

ranking weights;

constraints;

fallback logic;

weather scoring;

silhouette scoring;

pattern scoring;

material scoring;

personalisation;

thresholds.



If the Nigerian/African benchmark identifies a recommendation-quality deficiency:



document it; do not fix it in this phase.



TRACK A — FIX THE CRITICAL TECHNICAL FINDINGS

A1 — PRIVATE WARDROBE STORAGE



The Phase 5B report confirms:



wardrobe-images is still PUBLIC.



This must be resolved before real user onboarding.



However:



DO NOT simply switch the bucket to private yet.



First create a safe, repeatable migration process for legacy public URLs.



A2 — LEGACY URL MIGRATION



Create a migration utility/script that:



identifies all existing wardrobe\_items.image\_url values containing public Supabase URLs;

identifies all existing cleaned\_image\_url values containing public Supabase URLs;

extracts the underlying Storage object path;

validates that the object actually exists;

writes the correct storage path;

does not delete the original object;

is idempotent;

produces a dry-run report before making changes.



Required output:



Total rows:

Rows requiring migration:

Rows successfully resolved:

Rows already migrated:

Rows with missing objects:

Rows requiring manual investigation:

CRITICAL



Do not create a migration that silently converts an invalid URL into an invalid path.



If an object cannot be resolved:



leave it untouched and report it.



A3 — RLS MIGRATION



Review:



supabase/migrations/20260814000000\_rls\_all\_tables.sql



before asking the operator to apply it.



Verify:



all eight application tables;

SELECT;

INSERT;

UPDATE;

DELETE;

storage policies;

ownership checks;

no policy accidentally allows cross-user access.



Also verify that authenticated users cannot access another user's data by manipulating:



user\_id;

wardrobe item ID;

storage path;

recommendation ID;

saved-look ID.

A4 — TWO-USER SECURITY TEST



Create a reproducible test procedure using:



USER A

USER B



Test:



database SELECT;

INSERT;

UPDATE;

DELETE;

Storage SELECT;

Storage upload;

Storage delete.



The expected result is:



User A can access only User A's resources.



Do not claim this has been tested if it has only been inferred from the SQL.



A5 — TRY-ON STORAGE



The report identifies:



tryon-photos as potentially public.



Because try-on photographs may contain images of people, treat this as higher sensitivity than garment photographs.



Audit the current usage.



If the bucket is genuinely used:



prepare it for private storage and signed URLs.



Do not implement Virtual Try-On itself.



If the bucket is unused:



document that fact and recommend disabling/removing the bucket rather than leaving an unnecessary public asset store.



A6 — ACCOUNT DELETION



Implement the remaining technical deletion fix:



AsyncStorage.multiRemove(...)



after successful server-side account deletion.



It must clear all user-owned local caches.



Do not clear local data before the server deletion succeeds.



If server deletion fails:



preserve enough local state to allow retry and clearly tell the user that deletion did not complete.



A7 — SIGNED URL COLD-START



Resolve the identified R-17 issue.



On:



application launch;

application foreground;

wardrobe hydration;



ensure expired signed URLs are refreshed from storage paths.



Do not store signed URLs permanently.



The database must continue storing:



storage path



not:



signed URL.



TRACK B — NIGERIA/AFRICA COMPLIANCE LOCALISATION



Create:



docs/compliance/nigeria-market-readiness.md



The launch strategy is:



Nigeria/Africa → UK → Global.



The document must distinguish:



Nigeria launch requirements

Future UK requirements

Future global requirements



Do not treat Nigeria as the only jurisdiction.



B1 — NIGERIA DATA PROTECTION



Update the compliance analysis to explicitly consider:



Nigeria Data Protection Act 2023

Nigeria Data Protection Commission

GAID 2025



The NDPC's current materials state that the NDP Act can apply to organisations outside Nigeria that process or target Nigerian data subjects.



Document:



applicability;

controller/processor roles;

data-subject rights;

lawful bases;

sensitive/potentially sensitive data;

children's data;

international transfers;

retention;

security;

breach management;

registration/compliance obligations where applicable.



Do not make legal conclusions that require a solicitor.



Mark them:



LEGAL REVIEW REQUIRED



B2 — CROSS-BORDER TRANSFERS



Explicitly map:



Nigerian user

&#x20;     ↓

Amodka

&#x20;     ↓

Supabase

&#x20;     ↓

Google Gemini

&#x20;     ↓

PhotoRoom

&#x20;     ↓

other providers



Identify where data leaves Nigeria.



The NDPC's current materials explicitly address cross-border transfers and mechanisms including adequacy decisions, approved transfer instruments and specified lawful grounds.



For each provider record:



Provider	Country/region	Data	Transfer mechanism	Verified?	Legal review



Do not assume a transfer mechanism exists.



B3 — PRIVACY DOCUMENTS



Update:



privacy-policy-source.md

terms-source.md

store-compliance-matrix.md

business-risk-register.md



to reflect:



Nigeria/Africa-first launch + UK/global expansion.



Do not produce final legal prose.



Maintain factual source documents.



B4 — CONSUMER PROTECTION



Add a Nigeria commercial/legal section addressing:



clear pricing;

subscription disclosures;

cancellation;

refunds;

complaint handling;

consumer communications;

misleading marketing;

plain-language terms.



The FCCPC states that businesses should provide understandable information and full price disclosure, and its e-commerce guidance calls for clear terms, privacy policies, prominent disclosures and accessible complaint/redress mechanisms.



Do not draft final legal language.



B5 — AGE / CHILDREN



Reassess the age issue specifically for:



Nigerian users + UK users + global users.



Do not assume the same age requirement applies everywhere.



Document:



current behaviour;

likely exposure;

whether Amodka is likely to be accessed by children;

implications of profiling;

implications of appearance data;

recommended age strategy.



Do not implement an age gate until the legal/product decision is made.



B6 — SKIN TONE



Do not assume that skin tone is:



definitely special-category data



or:



definitely ordinary preference data.



Instead:



document exactly how it is collected;

document why it is used;

document whether it is inferred or self-declared;

document whether it is combined with other profile attributes;

assess Nigeria;

assess UK;

identify the legal question requiring professional determination.



Do not change recommendation behaviour.



TRACK C — NIGERIAN/AFRICAN FASHION READINESS



Create:



docs/recommendation/nigeria-fashion-readiness.md



The objective is NOT:



"Create an Ankara engine."



The objective is:



Determine whether the existing globally-oriented recommendation engine can correctly understand and rank Nigerian/African fashion as part of a mixed global wardrobe.



C1 — TAXONOMY AUDIT



Audit whether the current garment schema can adequately represent:



Ankara;

African wax print;

statement print;

co-ord;

two-piece;

three-piece;

agbada;

kaftan;

boubou;

aso-oke;

lace;

traditional/event wear;

wrapper/skirt combinations;

native tops;

embellished garments;

mixed print/solid combinations.



Do not automatically add all these values.



Determine:



which are genuinely necessary for the existing recommendation architecture.



C2 — MIXED WARDROBE



The system must not assume:



Nigerian user = Nigerian clothing only.



Design the benchmark around mixed wardrobes containing:



Ankara;

Western clothing;

sportswear;

designer pieces;

casualwear;

formalwear;

traditional garments.



The desired behaviour is:



best outfit for the person and occasion



not:



most culturally obvious outfit.



C3 — ANKARA VISUAL-WEIGHT TESTING



Specifically test:



Statement Ankara + restrained solids



against:



Statement Ankara + competing patterns.



This is important because Phase 3 identified weaknesses around visual-weight competition and hero-pattern handling.



Do not modify the engine.



Measure the problem.



C4 — OCCASION BENCHMARK



Create structured scenarios covering, at minimum:



wedding guest;

traditional wedding;

church;

office;

business meeting;

dinner;

date;

birthday;

casual weekend;

formal event.

C5 — CLIMATE BENCHMARK



Create scenarios for:



hot/humid;

hot/dry;

heavy rain;

cooler evening;

harmattan-like dry conditions.



Do not hard-code Nigeria into the engine.



The objective is to verify that weather-aware recommendations remain sensible for Nigerian conditions.



C6 — BENCHMARK DISCIPLINE



Do not claim:



"Nigeria-ready"



based solely on structured synthetic objects.



Separate:



Taxonomy readiness

Algorithmic readiness

Visual/classification readiness

Human stylist validation



If actual labelled garment images are required to validate classification, document the dataset requirement.



TRACK D — PAYMENT PREPARATION



Do not implement payments.



However, update the Phase 5C requirements so that the payment architecture considers:



Nigeria;

UK;

international users;

currency;

App Store billing;

Google Play billing;

subscription entitlements;

refunds;

cancellation;

grace periods;

payment verification;

server-authoritative Premium status.



The existing Phase 5B findings R-05, R-06 and R-07 remain Phase 5C priorities.



TRACK E — DO NOT IMPLEMENT



Do not implement:



Apple IAP;

Google Play Billing;

Google OAuth;

Apple Sign-In;

push notifications;

Admin panel;

Virtual Try-On;

Travel Concierge;

production native builds.



Those remain later phases.



REQUIRED MANUAL-ACTION PREPARATION



Before asking the operator to change anything in Supabase, provide a separate section:



OPERATOR ACTIONS REQUIRED



For each action provide:



What to do.

Where to do it.

What to click.

What value to enter.

What NOT to change.

How to verify success.

What could go wrong.

Whether it is reversible.



Do not assume the operator is a developer.



IMPORTANT



Do not tell the operator to make wardrobe-images private until:



the legacy URL migration tool exists;

it has been dry-run;

the dry-run confirms that existing images can be resolved;

the RLS migration has been reviewed;

the application code is ready;

a rollback/recovery plan exists.

REQUIRED FINAL REPORT

PHASE 5B.1 — NIGERIA/AFRICA READINESS \& PRE-LAUNCH HARDENING REPORT



Include:



1\. Executive Summary

2\. Technical Security Fixes

3\. Supabase Migration Readiness

4\. Data Protection Localisation



Nigeria + UK + Global.



5\. Cross-Border Processing

6\. Consumer Protection

7\. Age/Children Assessment

8\. Skin-Tone Assessment

9\. Nigerian/African Fashion Taxonomy

10\. Ankara Benchmark

11\. Nigerian Climate Benchmark

12\. Mixed-Wardrobe Benchmark

13\. Payment Architecture Requirements for Phase 5C

14\. Updated Business Risk Register

15\. Operator Actions

16\. Legal/Professional Actions

17\. Regression Results

18\. Recommendation Engine Integrity



Explicitly state:



Recommendation Engine v3.7 remains behaviourally unchanged.



FINAL DECISION



Choose one:



🟢 GO — Phase 5B.1 complete

🟠 GO WITH PRE-LAUNCH HARDENING

🔴 NO-GO

