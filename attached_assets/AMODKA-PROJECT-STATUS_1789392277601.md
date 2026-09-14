# AMODKA — CURRENT PROJECT STATUS & ENGINEERING SOURCE OF TRUTH

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

Remaining work is configuration/native-build/real-device/store validation, not a new authentication system.

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
Garment images are processed by third-party AI services including Gemini and PhotoRoom. Add clear first-use disclosure/consent UX before upload processing, with Privacy Policy access.

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

Not implemented.

Build as orchestration over existing capabilities:
- wardrobe
- profile/style
- weather
- occasion
- wear history
- rotation
- existing outfit generation
- wardrobe gaps

Do NOT create Recommendation Engine v4 merely for packing.

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
- Expo SDK 54 / React Native 0.81

Do not upgrade Expo merely for Android API compliance without evidence requiring it.

Remaining work:
- EAS configuration/credentials
- Google/Apple provider configuration
- production environment/secrets
- real iOS device/TestFlight validation
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
