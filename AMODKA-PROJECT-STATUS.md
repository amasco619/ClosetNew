# AMODKA — CURRENT PROJECT STATUS & ENGINEERING SOURCE OF TRUTH

## wardrobe_items RLS tidy-up — approved production migration verified

Applied exactly the approved transaction as **20261022130922**, mirrored in
`supabase/migrations/20261022130922_wardrobe_items_rls_policy_tidy_up.sql`.
Live metadata confirms one PUBLIC ALL owner policy with explicit WITH CHECK,
RLS enabled/not forced, unchanged role/table/column privileges and all **82**
other table policies unchanged. No live rollback or replay variant executed.
Authenticated direct INSERT remains denied; guarded RPCs/functions are unchanged.
Disposable PostgreSQL 17.6 tests pass 321 command checks across
current/proposed/rollback.
Current gates: **124 test files passed**, typecheck/lint, golden **35/35** and
both benchmark validators including **53 frozen checksums** pass.
**Fresh replay is not ready:** the base app schema is missing from the ordered
history, and the earlier wardrobe RLS migration supplies four policies rather
than the guard's nine. Tests prove the guard safely refuses that history.
A replay-safe fresh-install transition is proposed in the report, not applied.
See [`docs/reports/wardrobe-items-rls-preflight.md`](docs/reports/wardrobe-items-rls-preflight.md).

## Dependency Phase 3 — production startup and remaining gates resolved

The PNG/p-limit CommonJS calls now use ESM-compatible imports. The same installed
p-limit 3.1.0 is explicitly declared for production. The production-only server
smoke test passes before and after moving tsx to devDependencies; `pg`, `tsx`
and `esbuild` are absent from the production tree. The smoke test is now a
mandatory pre-publish check.

That dependency checkpoint's suite was **123 passed / 0 failed**. Typecheck, lint, the 35-case
golden set, both benchmark validators (including 53 frozen checksums), and
Android export pass. The three mounted-test bundlers now share explicit mock
resolution context; all existing assertions remain unchanged.
Audit remains **30 records (0 critical, 23 high, 6 moderate, 1 low)**.
No package versions changed in this follow-up.

No publication or live-service journey was performed. Exact diagnosis,
history, production smoke evidence, deviations and record-level lockfile table:
[`docs/reports/production-server-runtime-fix.md`](docs/reports/production-server-runtime-fix.md).

## Dependency Phase 2 and security-test isolation

Limiter/lockout fixtures now fail before live Supabase access in test mode when
an injected store is missing. Route fixtures use isolated stores and deterministic
documentation IPs. The final tree passed three consecutive full suites (123 test
files each), typecheck/lint, golden set 35/35, both benchmark validators including
53 frozen checksums, Expo compatibility check and Android export.

Approved compatible leaf updates reduced the root audit from 41 records before
Step 3 to 35, then http-proxy-middleware removal reduced it to 34. In Dependency
Phase 3, shell-quote was fixed at 1.12.0 with a parent-scoped override because
react-devtools-core's 8.x major is incompatible with the pinned React Native
range. The unreferenced Drizzle packages and db:push script were removed. `pg`
is now development-only, with no production dependency path.

The earlier Expo install did change extra transitive entries: Android release
source maps include changed Radix react-slot and nested compose-refs, not Vaul.
Earlier nested worklets removal and xcode changes are also recorded deviations;
do not claim the entire protected installed graph was unchanged. No publication
or device validation. See
[`docs/reports/dependency-phase2-isolation-and-updates.md`](docs/reports/dependency-phase2-isolation-and-updates.md)
for exact versions, remaining advisories, database read evidence and limitations.

## Account-deletion readiness and legacy Replit-table removal

Authenticated in-app deletion now has a 60/hour IP ceiling before `requireAuth`
and a 5/hour fixed-window authenticated-user budget after it. The OTP-confirm
path remains 5/hour per IP, and the existing 429 body/Retry-After behavior is
preserved. Owner-table deletion order, memory fallback, billing and consent
logic are unchanged.

`node scripts/check-deletion-readiness.mjs` passed 41/41 connected-Supabase
API probes: zero-row SELECT/DELETE access for all 14 owner-scoped tables,
two safe no-op RPCs, and denied publishable-key SELECTs on all ten server-only
tables. It prints the manual RLS/privilege SQL query for a human operator; that
query and a complete published-app deletion smoke test remain unperformed.
See `docs/release-checklist-deletion.md`.

The live `wardrobe_free_selections` service-role SELECT/DELETE grant is present
but absent from recorded migration GRANT statements. The exact repository
mirror `20261021115252_grant_service_role_wardrobe_free_selections.sql` is
intentionally unapplied. Every Supabase environment must have the grant.

No active server/script Replit PostgreSQL pool or runtime DDL remains. Unused
direct Keyv dependencies were removed; `pg` stays for four disposable local
database tests. After explicit approval, the four old Replit development
tables were dropped using the exact statements recorded in
`docs/reports/deletion-hardening-readiness-and-removal.md`, without CASCADE.
`to_regclass` returned NULL for all four relations. The backend restarted on
port 5000: Supabase lockout and rate-limit readiness was logged, and the awaited
background-removal initialisation completed without a prune error. The module,
`DATABASE_URL`, `.replit`, and published database are untouched.

Final checks: 121 test files passed; typecheck/lint passed; golden set 35/35;
all 53 frozen checksums passed. Initial improperly invoked tests incremented
short-lived synthetic Supabase rate-limit counters but did not delete accounts;
test-mode guards and the stale consent-test fixture were corrected. Backend
restart initialized the current Supabase stores successfully. No deployment.

## Rate-limit and lockout store Supabase cutover

Migration `20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql`
is applied to the connected Amodka Supabase project. Live metadata confirms
both tables have RLS enabled, zero policies, no anon/authenticated table
privileges, and service-role CRUD only. The four `ratelimit_*` functions are
SECURITY INVOKER with an empty search path; anon/authenticated lack EXECUTE and
service_role has EXECUTE. Prefix reset is literal and rejects empty/NULL input.

The existing limiter budgets, 429 copy, and account-lockout thresholds are
unchanged. The server now uses Supabase RPC/table APIs with a 1.5-second
abortable timeout and in-memory fallback. Both tables are pruned at startup and
hourly after success, with exponential retry backoff capped at eight hours.
No rows were copied and the old Replit tables were not changed or dropped;
existing persisted counters and lockouts therefore did not transfer to the
empty Supabase tables. No deployment was performed.

Full test suite: 120 test files passed; typecheck and lint passed; Recommendation
Engine v3.7 golden set 35/35 and benchmark validation including all 53 frozen
checksums passed. No live rate-limit request or account-lockout flow was run.
Backend restart completed on port 5000; startup pruned 12 expired counter rows,
pruned 0 expired lockout rows, and loaded 0 active lockouts.
See `docs/reports/ratelimit-lockout-supabase-cutover.md`.

## Background-removal store cutover

Migration `20261020231945_move_bg_removal_store_to_supabase.sql` creates the
server-only cache/usage tables and atomic increment/reset RPCs in Supabase.
Live metadata confirms RLS, zero policies, no anon/authenticated access and
least-privilege service-role grants. No rows were copied and no old Replit
tables were changed or dropped. The store now uses the existing Supabase
server client; account deletion retains its inventory order and uses the
normal owner-filtered Supabase DELETE. Quota operations fail closed; cache
maintenance remains best effort. Free allowance admission remains the existing
TypeScript check, not an atomic SQL cap. Rate-limit/lockout pools, billing,
consent and frozen recommendation artifacts remain outside this change.
Rollback constraints are recorded in TECHNICAL.md §9's Photoroom
background-removal data-store description. Validation: 119 test files passed,
typecheck/lint passed, golden set 35/35 and all 53 frozen checksums passed.
No live provider call, live quota write, live account deletion or physical
device journey was performed for this cutover.
Report: `docs/reports/bg-removal-supabase-cutover.md`.

## Guest-to-account data boundary and pending wardrobe

Before any guest data write, signed-in server state decides the one-time claim:
an account with any wardrobe row or saved profile/onboarding/personalization
keeps its profile and discards guest-local wardrobe, photos and onboarding;
a truly blank account absorbs the existing guest wardrobe/profile migration.
The decision is owner-bound in the existing device journal and is retained
until discard cleanup/hydration completes or absorbed rows finish syncing.
Server-read failure leaves guest and pending data untouched. Sign-in and
sign-up screens disclose the respective outcome without an extra confirmation.

Pending absorbed garments remain visible in the signed-in Wardrobe with their
photos and a “Waiting to sync” label until acknowledged; they are not inserted
into active wardrobe, quota, rotation or recommendation state. Counts use
singular/plural wording and the correct guest/free allowance. Guest bulk review
has separate tappable photo and “Add details” actions that retain the staged
selection ID and open manual Add Item. Profile “Not now” remains a no-write,
offline dismissal and ignores stale preference refresh errors.

Validation results, item-by-item causes/fixes/tests, known limitations and
device-verification status: `docs/reports/guest-data-rules-pending-bulk-fixes.md`.
User-reported Android checks on 2026-10-19 confirmed existing-account guest
separation, pending guest-photo retention and sync after reconnect, manual guest
bulk actions, and offline AI-disclosure dismissal. Offline receipt lookup,
photo removal and acknowledgement keep cleanup pending without logging known
network/DNS failures; missing-table, permission and other unexpected failures
remain warnings. The user subsequently retried on a physical Android device and
confirmed the warning no longer appeared. iOS and VoiceOver/TalkBack checks
remain outstanding.
The approved durable photo-cleanup migration is now applied to the connected
Amodka Supabase project; table, RLS, trigger, acknowledgement function and
service grants were verified, and the PostgREST schema cache was refreshed. No
existing wardrobe rows were changed. No other schema/RLS, quota, auth API, AI
consent enforcement, billing, Recommendation Engine v3.7, Phase A, P1.3 or
frozen benchmark changes; no deployment.

## AI preference save failure correction

Observed preference-write 429s were traced to the five-per-hour account
mutation limiter. Preference writes now have a separate authenticated-user
30/minute budget; reads, sign-in limits and provider consent enforcement are
unchanged. Client preference operations include JSON parsing in a ten-second
deadline, re-read after writes, reconcile failures, refresh on Profile focus,
and reject superseded account responses. Profile "Not now" closes without
writing, errors are visible inside the disclosure, and waiting bulk cards no
longer imply active analysis. No consent wording, schema, provider setting,
engine, billing, or auth flow changed.

Focused tests 5/5, full suite 113/113, TypeScript, lint, golden set 35/35,
Track C 100 cases and 53 frozen-file checksums passed. Historical logs lack
per-request timestamps; physical-device/offline-screen-reader behavior remains
unverified. See `docs/reports/ai-preference-save-failure.md` for full evidence,
limitations and the remaining device checklist. Not published or deployed.

## Guest bulk upload parity

Guest bulk photo selection now uses the existing local-only manual Add Item
path: the first photos fitting the remaining guest cap are staged in selection
order, shown from their originals with “Add details,” and opened through the
existing opaque selection-ID handoff. No classifier, PhotoRoom, AI preference
lookup, or AI-consent prompt runs for a guest-origin selection. The existing
guest save path stores each completed item on-device. A calm sign-in banner
links to the existing sign-in route; it does not promise to migrate a guest
wardrobe. Signed-in bulk behavior is unchanged.

Focused guest bulk tests, related bulk regressions, TypeScript, lint, full suite,
and the frozen recommendation golden set were run for this change; exact
results and limitations are in `docs/reports/guest-bulk-upload.md`. No device
test, schema change, new dependency, or deployment was performed.

## Bounded personalization consistency update

The five requested consistency fixes are implemented: account-neutral profile
hydration, guest face-shape migration through the existing constraints format,
Classic as the completed primary-goal skip default, face shape in the rotation
input hash, and isolated eye-colour/skin-tone scoring tests. Guest snapshots are
restricted to guest transitions and consumed after successful hydration; failed
or superseded migration writes cannot publish late profile data.

Verification: 106/106 test files, focused 6/6 (17 new personalization groups),
typecheck, lint, golden 35/35, benchmark validator, 53 frozen checksums and 101 raw
seals passed. The Track C `case-results.csv` was later restored to its original
100-case snapshot after later commits had appended duplicate case records. Its
100 unique case IDs and Track C validator now pass; raw sealed outputs remain
unchanged. Live-account/device behavior was not verified. Full report:
`reports/personalization-consistency-fix.html`. No schema/dependency change or
deployment; frozen engine calculations and protected fixtures remain unchanged.

**Date:** 2026-09-11  
**Purpose:** Short, current briefing for coding-agent work. This document supersedes older phase narratives where they conflict with the current source tree.

## 1. Product direction

Amodka is a premium women-focused wardrobe/stylist application.

Launch sequence:
1. Nigeria/Africa
2. UK
3. Global

Positioning:
- Luxury personal stylist / wardrobe concierge
- Premium, restrained, high-trust UX
- Nigerian/African fashion is first-class launch scope

Men's fashion is NOT v1 scope.

## 2. FROZEN / DO NOT MODIFY WITHOUT EXPLICIT APPROVAL

### Recommendation Engine v3.7
- Frozen.
- Do not change scoring, ranking, generator behaviour, weights, or core recommendation logic casually.
- Any proposed engine change requires:
  1. explicit hypothesis
  2. targeted benchmark
  3. controlled experiment
  4. regression comparison
  5. Product Owner approval

### African Benchmark v1
- Frozen benchmark package.
- Track C baseline has been run.
- Do not alter gold labels, benchmark images, or benchmark structure to improve scores.

## 3. SECURITY BASELINE ALREADY COMPLETED

Do NOT recreate these as new projects unless a regression is found:

- `wardrobe-images` is private.
- Legacy public wardrobe URLs were migrated.
- Production wardrobe hydration uses signed URLs.
- No production `getPublicUrl()` usage for wardrobe images.
- RLS/storage isolation was live-tested.
- Service-role deletion privileges were reconciled.
- Account deletion cleans application state/storage/database paths.
- Client-side premium granting was removed.
- `/api/user/upgrade-premium` was removed.
- Server-authoritative entitlement resolution exists.
- Expired premium fails closed.
- PhotoRoom quota enforcement uses the entitlement resolver.

Historical audit documents may still describe some of these as vulnerabilities. Verify current source before treating those statements as current defects.

## 4. ALREADY IMPLEMENTED — DO NOT REBUILD

### Authentication
Google OAuth is already implemented, including:
- Supabase OAuth
- PKCE
- Expo/browser flows
- callback/deep-link handling
- cold-start recovery
- provider error handling

Email/password signup/sign-in use the rate-limited server proxy and publishable
Auth key. Unstructured provider errors now fail as retryable service errors
instead of being acknowledged as successful signup and later shown as invalid
credentials. A development canary completed signup and sign-in on 2026-10-16;
the installed production build and physical-device flow still need verification.
Typed auth errors now use a shared catalogue-backed notice on the sign-in/sign-up
screen. Sign-in stays non-enumerating; only explicit Supabase duplicate codes
return the approved `account_exists` response, behind the existing auth limiter.
The Production provider returned `user_already_exists` (422) for a disposable
confirmed test account, which was deleted after the probe. The installed build
and physical-device/error-state flow still need verification. Remaining work is
configuration/native-build/real-device/store validation, not a new auth system.

### Entitlements
Existing server boundary:
- `GET /api/user/entitlements`
- server-only verified entitlement mutation

Do not restore a client-callable premium upgrade endpoint.

### Error handling
Existing components include:
- `ErrorBoundary`
- `ErrorFallback`
- `AmodkaErrorState`

Remaining work: audit coverage/consistency, not a new error architecture.

### Wardrobe-gap intelligence
Existing implementation includes:
- `lib/wardrobeGapDiagnosis.ts`
- `components/WardrobeGapCard.tsx`

Remaining work: targeted correctness fixes and UX validation.

### Weather
Weather integration already exists.

### Personalisation / wardrobe intelligence
Existing systems include:
- wear logs
- affinity signals
- pair affinity
- rotation
- wardrobe blueprint/diagnostics
- outfit generation/scoring
- weather-aware recommendation flow

Reuse these systems rather than creating parallel ones.

## 5. TRACK C — CURRENT INTERPRETATION

Track C exposed real issues but does NOT justify a broad v3.7 rewrite.

Reported results include:
- context top-1: 50.0%
- context top-3: 95.0%
- pairwise agreement: 66.3%
- mean regret: 7.4
- max regret: 25
- exact candidate generation: 12.5%
- 17/60 context cases had empty production pools
- weather top-1 diagnostic: 30.0%
- weather top-3 diagnostic: 90.0%
- Ankara focused top-1: 62.5%
- Ankara focused top-3: 100%

Important interpretation:
- Track C fixed-candidate diagnostics and production full-generation behaviour are not identical.
- Do NOT describe the weather/context percentages as simple production accuracy percentages.
- Six P0 garment-classification failures are genuine evidence of representation/taxonomy gaps.

Preferred next step:
- targeted taxonomy/representation experiment
- no broad recommendation-engine rewrite
- preserve v3.7 baseline

## 6. HIGH-VALUE CURRENT ISSUES

### A. Classification taxonomy
Current garment categories are too restrictive for some African/Nigerian items.

Evidence includes failures around:
- gele
- traditional headwear/headpieces
- Kente/stoles/textile accessories
- multi-piece Ankara/co-ords

A future taxonomy hardening change may require a genuine `accessory` representation (e.g. headwrap/gele/stole/scarf/headpiece), but do NOT wire new categories into recommendation scoring until benchmark evidence supports it.

### B. Windbreaker taxonomy inconsistency
`windbreaker` appears in conflicting category/subtype contexts.

Resolve the representation inconsistency without changing v3.7 scoring.

### C. Cold + rain wardrobe-gap logic
Current diagnosis separately checks warm-layer and rain-layer capability.

A warm coat + separate rain jacket can incorrectly satisfy both conditions even when no single suitable warm/rain-capable outer layer exists.

Use a capability concept equivalent to:
`hasWarmRainCapableLayer()`

Do not redesign the entire gap system.

### D. UK temperature units
UK (`GB`) is currently treated as Fahrenheit in one weather utility. UK should use Celsius.

This is a small targeted fix.

### E. AI processing disclosure
The existing account-scoped consent flow remains authoritative: absent choice is `not_asked`, and PhotoRoom/Gemini are blocked until the user accepts the first-use disclosure. Profile displays OFF when no choice is saved; only an explicit saved `allowed` state displays ON. Explicit OFF remains saved in Auth app metadata. Preference display/toggle changes do not trigger or replay photo processing. Privacy-policy/provider legal review items remain open in `docs/compliance/privacy-policy-source.md`.

### F. Account deletion hardening
Deletion exists, including external web deletion support. Review:
- complete DB deletion
- complete Storage deletion
- partial-failure handling
- object listing/pagination
- verification before final account removal

Do not build a second deletion architecture.

## 7. PAYMENTS — GENUINELY NOT IMPLEMENTED

Current entitlement architecture should be reused.

Preferred architecture to evaluate:
- Apple App Store subscription
- Google Play subscription
- RevenueCat as cross-platform subscription infrastructure
- verified purchase state
- RevenueCat/server webhook
- server-authoritative entitlement write
- existing entitlement resolver
- cancellation retains access through paid period
- expiry/refund revokes access
- restore purchases

Do not implement payments as a client-side premium flag.

## 8. GOOGLE / APPLE LOGIN DECISION — OPEN PRODUCT/POLICY ISSUE

Product preference is Google Sign-In.

However, before iOS submission, verify Apple's current login policy because apps using third-party/social login for the primary account may need an equivalent privacy-preserving login service.

Do NOT delete existing Apple Sign-In implementation until this decision is resolved.

## 9. NOTIFICATIONS

Push notification infrastructure is not currently implemented.

Prefer the lowest-complexity architecture that satisfies the product requirement.

Initial concept:
- user opts into daily styling reminder
- schedule morning notification
- notification opens today's outfit
- avoid building server-side recommendation generation unless actually required

Do not turn notifications into a second recommendation engine.

## 10. PACKING CONCIERGE

P1.4 constrained session-only planner is implemented in Outfits.
Signed-in Premium users may assign currently selected public looks to ordinal
day/activity slots and explicitly reuse a look, then review an owned-item-ID
deduplicated checklist. Unsupported/unavailable slots remain unfilled, not gaps.

Generic choices use exact scenario matches from public `outfitSets`; Traditional
uses the dedicated existing service. Authoritative owner-scoped groups supply
confirmed-set/partial-use disclosures, not inferred visual relationships.
Fresh Premium verification, full wardrobe readiness and stale-request guards
protect choices. Group reads failing pause the planner with retry.
The lifecycle correction preserves drafts through temporary entitlement outages,
keeps protected review hidden, and revalidates all assignments on recovery.
Old-account/request wardrobe retry success and failure are ignored. Both
regressions are covered by the mounted travel suite; focused travel and relevant
entitlement/wardrobe checks, TypeScript and changed-file lint passed.

Drafts are local component state only and discarded on dismissal/tab exit or
account changes. No destination/date collection, destination forecasts,
future-day generation, optimisation, full-coverage guarantee or saved trip.
Engine v3.7, Phase A and P1.3 styling behaviour remain unchanged.
See TECHNICAL.md §37 and reports/p14-travel-capsule.html for checks/limitations.

## 11. VISUAL / BRAND

Current design system is already substantially coherent.

Remaining work should be targeted:
- final Amodka branding
- icon
- splash
- Premium screen
- profile polish
- store assets/screenshots

Do not redesign the entire app unless evidence shows a problem.

## 12. NATIVE RELEASE

Current configuration is already substantially prepared:
- Amodka app identity
- `com.amodka.app` package/bundle identifiers
- Expo SDK 57 / React Native 0.86 (upgraded to match the installed Expo Go SDK)

Do not upgrade Expo merely for Android API compliance without evidence requiring it.

Remaining work:
- EAS configuration/credentials
- Google/Apple provider configuration
- production environment/secrets
- real iOS/Android Expo Go device validation with VoiceOver/TalkBack
- TestFlight validation
- real Android device/Play internal testing
- signing/release pipeline

## 13. LEGAL / COMPLIANCE

Source material exists, but final legal documents are not yet final/published.

Remaining decisions include:
- legal entity/controller details
- Privacy Policy
- Terms
- DPIA
- data inventory finalisation
- third-party processor/DPA review
- international transfer mechanisms
- skin-tone processing legal basis
- age policy
- retention/deletion wording
- incident response
- store privacy/data-safety forms
- Nigeria/UK compliance review

Do not represent source/legal drafts as completed legal advice.

## 14. CURRENT CODE/DOCUMENTATION DRIFT

Known examples:
- `replit.md` contains stale AuraCloset/older-version information.
- `package.json` still uses an old generic package name (`expo-app`) while app identity is Amodka.
- historical Phase 5C documents contain findings that have since been fixed.
- some comments/reference text still mentions the removed premium-upgrade endpoint.

Do one consolidated documentation/configuration cleanup rather than many separate cleanup tasks.

## 15. ENGINEERING RULE FOR FUTURE CODING-AGENT TASKS

Do NOT issue broad prompts such as:
- "review the whole application"
- "implement Phase 5C.4"
- "understand the architecture and fix everything"
- "audit all security"

unless a genuine milestone audit requires it.

Preferred task structure:

1. Objective
2. Existing implementation to reuse
3. Exact change
4. Explicitly protected/frozen areas
5. Targeted validation
6. Stop condition
7. Changed files + tests + blockers

The coding agent should not perform repository-wide discovery when the task can be completed from this status document and the named files.

## 16. LAUNCH PRIORITY

Recommended order:

1. Resolve iOS login-policy decision.
2. Create/maintain this project-status source of truth.
3. Targeted classification/taxonomy hardening.
4. Cold+rain capability fix.
5. UK Celsius fix.
6. AI-processing disclosure.
7. Account-deletion hardening.
8. Subscription implementation using existing entitlement architecture.
9. Notification MVP.
10. Packing Concierge.
11. Brand/store visual polish.
12. Native build + device/store testing.
13. Final legal/compliance verification.
14. Final full regression/release audit.

## 17. COST CONTROL PRINCIPLE

Prefer:
- reuse over rebuild
- targeted inspection over repository-wide inspection
- targeted tests for small changes
- full regression only at milestones
- one consolidated cleanup pass
- one final comprehensive release audit

Never reduce safety/security/payment correctness merely to save agent cost.

The goal is:
**minimum engineering-agent cost consistent with a genuinely premium, secure, compliant launch.**

## 18. GARMENT IMAGE PRESENTATION

Shared `GarmentTile` now presents user-owned garment photos on a neutral studio
surface across add, bulk review, wardrobe list/grid and other owned-image
surfaces. PhotoRoom cutouts remain transparent PNGs for display and storage;
the classifier server composites them onto the neutral matte before Gemini.
No schema, quota, auth, taxonomy or recommendation-engine changes were made.
The matte is covered by synthetic-pixel tests, but real Gemini label quality
and the requested physical-device visual matrix remain unverified. Details and
the full not-verified matrix are in
`reports/garment-image-presentation.md`.

## 19. SCROLL-AWARE SHEET DISMISSAL

Add Item, Premium and Item Detail now allow a downward dismiss drag only when
their vertical content is at `scrollTop === 0`. The scroll position is checked
on gesture capture, every drag move and release; scrolling from any positive
offset stays with the content. At the top, drags over 120 px animate the sheet
off-screen with a fade; shorter drags spring back. Each route retains a working,
accessible close control. Premium’s existing feature-card list is the long-scroll
test case. The focused gesture-policy tests, full suite (97/97), typecheck and
lint pass. The user subsequently confirmed the scrolled-versus-top gesture
cases on a physical phone; OS-specific and VoiceOver/TalkBack testing remain
unverified.

## 20. BULK CLASSIFICATION / AUTHENTICATED API RETRIES

Current backend logs showed authenticated `GET /api/user/entitlements`,
`/api/user/ai-processing`, and billing-readiness calls returning 304, while
`authenticatedApiRequest()` rejects every non-2xx response. This directly
explains the screenshot's retryable `entitlement_refresh` error. API responses
now use `Cache-Control: no-store`, and incoming conditional validators are
removed before Express can produce bodyless 304 responses.

The Supabase `TOKEN_REFRESHED` listener also previously awaited that
authenticated request inside the auth callback, even though the request reads
the session again. It now defers the entitlement refresh until after the auth
callback returns, retaining stale-account/startup guards. The corresponding
cache-policy and listener contracts pass; the full suite was 97/97. Logs
available at that point showed at least one successful classification request,
but the two failed physical-device items had not been reproduced after that fix.

## 21. BULK REVIEW RETRY AND OPTIONAL PHOTO PROCESSING

The user reproduced the failure on Android. Backend logs for that reproduction
showed the authenticated preference/readiness GETs succeeding but no
`POST /api/remove-background` or `POST /api/classify-garment`. The client helper
previously swallowed preparation/classification errors into an undifferentiated
red card, so the exact device-side failure stage was not available.

The retry action is now a standalone accessible button rather than a nested
Pressable inside the whole-card edit target. Optional background removal and
cutout-cache failures now fall back to the resized original JPEG and continue
classification; session lookup errors in `removeBackground()` return its
documented `failed` result instead of throwing. The review distinguishes failed
items from successful analysis, records a coarse failure stage, and no longer
labels an empty save action “Saving items...”.

Focused tests cover failed-item retry state, background/session/cache fallback,
and the existing save and unmount guards. Physical Android re-testing of the
revised review and retry flow remains outstanding.

## 22. BULK PHOTO-PREPARATION FAILURE ON ANDROID

The signed-in Android diagnostic showed every bulk card failing before
background removal/classification with native `Context.renderAsync` “Loading
bitmap failed” for local JPEG files; the same photos worked in single Add Item.
The serial resize queue is retained. The SDK 57 upgrade (`281de9b`, 2026-10-15
21:49 UTC) predates the last reported good bulk run (~2026-10-16 20:30 UTC), and
locked Expo/image-picker/manipulator/file-system versions were unchanged across
the good and failing builds. A pre-fix whole-app search found no cache deletion
or cleanup between the picker callback and resize. The bulk path did, however,
carry picker file URIs through Expo Router route params. The exact native decode
root cause is not proven.

The multi-select path now copies each chosen image into the app-owned cache
staging directory before routing, stores staged URIs and dev-only metadata in a
transient in-memory selection keyed by an opaque ID, and passes only that ID
through `/bulk-review` and its one-photo redirect. Partial copy failures are
shown inline; total failure leaves the user on Add Item. Confirmed saves and
explicit exits clean unreferenced files, local-only/pending references are
preserved, and app startup best-effort sweeps unreferenced files older than 24
hours. Picker/resize diagnostics are development-only and omit full paths.

Final verification: `npm test` — 100 passed, 0 failed; `npm run typecheck` and
`npm run lint` pass. Recommendation Engine v3.7, Phase A, P1.3, classifier,
queue, resize arguments, and provider behavior were not changed. The native
Android journey is still outstanding; use the four-step script in
`docs/reports/BULK_PREPARE_DIAGNOSTIC_REPORT.md` with opt-in development diagnostics.

## 23. MATCHING PAIRS AND CALM CLASSIFIER REFUSALS

The user confirmed bulk photo preparation is fixed. The subsequent sneaker-pair
failure is a real classifier HTTP 422: four identical PNG payloads were refused
by resolved `gemini-3.5-flash-lite`, not the fallback model. A prompt rule added
2026-09-29 conflated multiple garments with valid pairs/coordinated sets.

Only classifier guardrail wording changed: matching pairs and coordinated sets
worn as one unit are valid single items; unrelated piles/full outfit flat-lays
without a dominant item may be refused. Other guardrails, schema, fields,
temperature, models and post-processing are unchanged.

Bulk and single entry now show fixed calm refusal copy, never raw provider
reasons. Bulk refusals have Add manually/Remove, no retry, and “needs attention”
counts. Manual entry preserves the surrounding batch and skips classification.
Transient network/timeout/429/5xx failures retain Retry. Staging/copy/resize,
provider image preparation, frozen engine, Phase A and P1.3 were not changed.

Checks: full suite 101 passed; Engine v3.7 golden set 35 passed; typecheck and
lint pass. A production Android JS export succeeded; the stamp and diagnostic
render calls were removed in release mode. At that stage, formatter utility
strings still remained without UI callers; the later bounded cleanup removed
the unused formatter and verified its markers absent from a fresh release
bundle. Physical device/model-accuracy validation is not claimed.
See `docs/reports/classifier-pairs-refusal.md` for the pre-change evidence, caveats,
release verification and four-step device script.

## 24. SINGLE/BULK CLASSIFICATION PREPARATION PARITY

The same joggers photo was reported as lavender in bulk versus grey in single
entry. Both used the same classifier endpoint, but bulk resized by width while
single entry capped the longest edge. That is a verified input-policy difference,
not proof of the cause of those exact model responses.

Both now use one shared preparation helper: native decoded dimensions,
aspect-preserving longest-edge cap of 1024 px, no upscaling, one JPEG encoding
at quality 0.8 before the existing background-removal step. This retains the
successful single-entry size/quality baseline without increasing model payload
or changing colour values. It uses the existing Expo package and releases native
resources on every path. Bulk's serial queue and staging/copy behaviour remain.

Checks: focused suites 5 passed; full suite 102 passed; golden engine set
35 passed; typecheck/lint and Android production-JS export passed. No prompt,
model, colour-family rules, engine, schema, quota, billing or dependencies changed.
No live-provider accuracy experiment or physical-device test was performed.
The old Metro port owner was stopped and the existing frontend workflow restarted.
See `reports/classification-preparation-parity.md` for exact evidence/limitations.

## 25. Upload cleanup and explicit recovery

The bounded A1–E6 cleanup is implemented. Single/cloud and bulk/guest saves recover
an unavailable cutout cache from the retained original; real upload failures stay
failed/pending rather than claiming a database save. Shared preparation from §24
is unchanged. Free background-removal copy now explicitly means 20 lifetime uses.

Classification errors now use shared, code-first copy distinguishing connection
failure, provider busy, app rate limiting, session expiry and generic failure.
Both classification endpoints refresh/retry once on 401 before showing Sign in.
Consent errors retain the existing consent flow, and confirmed content refusals
retain their existing manual-only handling. Multi-item errors are no longer
discarded or described as a garment-count problem. Photos remain
visible. Two or more transient batch errors expose an explicit serial “Try all
again,” with local 10/min start-window pacing and no repeated successful PhotoRoom
work. No automatic retry loop or NetInfo dependency was added.

Preparation/staging logs, card diagnostics and the batch stamp now require both
development mode and `EXPO_PUBLIC_UPLOAD_DIAGNOSTICS=1` (default OFF). Release
formatter strings are absent; sanitized stage/code reporting is a release no-op.
The primary model is configurable with `GEMINI_PRIMARY_MODEL`, retaining the
current default and existing 429-only fallback. Headless Expo stays documented.

Validation: focused 4 suites passed; full 103 suites passed; engine golden set
35 passed; typecheck and final lint passed without warnings; Android release-JS
export passed even with the diagnostics flag ON. Protected source paths were
unchanged. Native cache-eviction/offline interaction still needs device testing.
Audit, diagnostic and refusal reports are now under `docs/reports/`.
See `docs/reports/upload-pipeline-cleanup.md` for the pixel table, exact commands,
release-string counts, changed files and limitations. Not published or deployed.

## 26. Bounded cleanup pass — current verification

The unused upload-diagnostic formatter was removed from the shared helper; the
diagnostic text is now inline in the development-only screen branches. An
Android release export completed with zero `pickerHash`, `stagedAtPick`,
`sincePick`, and formatter-name occurrences. The current bundle has three
internal `ApiRequestError` references and no `withDeadline`; neither appears in
the reviewed rendered error-string paths.

AI consent dismissal is context-aware. Upload “Decline” persists `declined`;
backdrop, hardware back, and swipe do not write a choice and route the current
photo to manual entry without AI processing. Profile “Not now” and passive
dismissals close without changing the preference or switch. Bulk Review exposes
manual-entry actions for remaining photos. The server-side consent gate is
unchanged.

Verified in the final workspace: `npm test` 110 passed, `npm run typecheck`,
`npm run lint`, and the Recommendation Engine v3.7 golden set 35/35 passed.
Physical-device and screen-reader interaction were not verified. Full phase
evidence and spelling findings: `docs/reports/amodka-cleanup-pass.md`.
