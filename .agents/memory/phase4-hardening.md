---
name: Phase 4 production hardening
description: Key decisions and fixes from Phase 4 — what was changed and why, so future sessions don't re-investigate.
---

## Engine freeze
Recommendation Engine v3.7 is frozen. No scoring/ranking changes without: hypothesis + benchmark + regression comparison + approval.

## Production resilience fixes (behaviour-preserving)
1. `passesConstraints` in `constants/outfitScoring.ts` — added `if (!profile.constraints) return true;` at the top. Crashes at runtime if Supabase returns a profile with null constraints (can happen with partial onboarding).
2. `scoreItemForProfile` in `constants/outfitScoring.ts` — changed `STYLE_PREFERRED_COLORS[styleGoalPrimary]` to `(STYLE_PREFERRED_COLORS[styleGoalPrimary] ?? [])`. Crashes if Supabase stores an unknown styleGoalPrimary value.

**Why:** Both are null guards only. They do not change recommendation output for valid inputs.

## New infrastructure files
- `constants/recommendationVersion.ts` — `RECOMMENDATION_ENGINE_VERSION = '3.7'`. Increment only after new benchmark run.
- `lib/telemetry.ts` — structured `[TELEMETRY]` JSON events to stdout. No-op in test env. Events: recommendation_requested, recommendation_generated, recommendation_empty, user_reaction.

## Test files added
- `__tests__/recommendation-golden-set.ts` — 35 assertions, all 17 engine dimensions. IMMUTABLE. Must pass before any future engine change.
- `__tests__/phase4-resilience.test.ts` — 29 assertions for resilience, performance, idempotency. Included in npm test runner.

## TypeScript type gotchas (test files only)
- `AffinityState` and `EMPTY_AFFINITY` live in `constants/affinity.ts`, NOT `constants/types.ts`.
- `Season` type lives in `constants/outfitScoring.ts`, NOT `constants/types.ts`. Valid values: 'winter'|'spring'|'summer'|'fall' (NOT 'autumn').
- `OutfitComponent` requires `subType: string` and `owned: boolean` — older test code was missing these.
- `UserProfile` has no `id`, `colorPalette`, or `isPremium` fields at top level.
- `Constraints` has `noSleeveless`, `noShortSkirts`, `maxHeelHeight`, `colorAversions?` — NOT `excludedColors`.
- `WeatherSnapshot` has `fetchedAt`, `lat`, `lon`, `currentTempC`, `highC`, `lowC`, `precipProbability`, `source` — NOT `tempC`/`feelsLikeC`/`condition`.
- `WearEntry` requires `id`, `date`, `occasion`, `outfitFingerprint`, `itemIds`, `loggedAt`.
- `applyDailyRotation` returns `{ outfits, newState }` — NOT `{ todayOutfits, nextState }`.

## Final baseline
- npm test: 45/45 (Phase 4 adds phase4-resilience.test.ts = 1 test)
- npm run typecheck: 0 errors
- E2E benchmark: 45/45 (unchanged)
- Golden set: 35/35
- Performance: 100-item wardrobe = 43ms
