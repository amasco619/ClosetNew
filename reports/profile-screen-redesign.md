# Amodka Profile Redesign — Implementation Report

## Result

Implemented the quiet-luxury Profile hub and separate Refinements and Personal
Intelligence screens in the existing mobile app. Existing account/profile data,
authentication, Premium, AI-consent, weather, wear-history, and deletion paths
were retained. No schema, provider, dependency, or recommendation-engine change
was made.

## Audit findings

- Profile edits use the existing `updateProfile` flow; weather preference uses
  `setWeatherEnabled`. Refinement fields retain their existing immediate-save
  behavior.
- Refinement totals remain Physical 3, Style 6, Lifestyle 4. Missing lifestyle
  allocations still resolve to the established defaults before the changed
  allocation count is computed.
- AI preference remains account-scoped as `not_asked | allowed | declined`.
  The switch remains off for `not_asked` and `declined`; the approved
  first-photo disclosure appears only for `not_asked`. Consent copy, recording,
  and server enforcement were not changed.
- Account deletion confirmation and deletion execution were preserved.
  **Separate deletion gap found during the read-only audit:** `bg_removal_usage`
  is not explicitly deleted by the account-deletion handler. The global
  image-hash-keyed `bg_removal_cache` is retained until its existing cleanup.
  This was not changed as it is outside the redesign scope.
- Existing named accessibility labels remain: `AI Processing`, `Sign out of
  Amodka`, and `Delete your Amodka account`.

Full audit details are in `reports/profile-screen-redesign-audit.md`.

## Changed files

| File | Change |
|---|---|
| `app/(tabs)/profile.tsx` | Replaced the long in-place settings screen with the Profile hub; preserved account actions and handlers. |
| `app/refinements.tsx` | Added the three-group, one-open-at-a-time Refinements screen using the existing profile values and save path. |
| `app/personal-intelligence.tsx` | Added the separate Personal Intelligence screen using existing affinity data and Premium gating. |
| `app/_layout.tsx` | Registered both pushed routes in the existing Expo Router stack. |
| `lib/profilePresentation.ts` | Added pure helpers for the existing counts, summaries, plan state, empty-wardrobe invitation, Personal Intelligence status, and AI-row state. |
| `lib/profileStyleLabels.ts` | Kept existing profile label mappings available to the new hub. |
| `__tests__/profilePresentation.test.ts` | Added focused presentation/helper tests. |
| `TECHNICAL.md` | Added Section 43 for the new screen structure and preserved behavior. |
| `reports/profile-screen-redesign-audit.md` | Recorded the pre-implementation read-only audit. |

## Pressable and behavior parity

| Area | Before | After |
|---|---|---|
| Name editing | Avatar badge and name/pencil both opened the same editor. | One visible avatar edit affordance opens the existing editor; Save and Cancel remain. |
| Refinements | Physical, style, and lifestyle controls were inline on Profile; each field updated immediately. | The same controls, values, counts, haptics, and immediate `updateProfile` saves are on `/refinements`. Three accordion headers are available; only one group's content is mounted at a time, and the first incomplete group opens initially. |
| Personal Intelligence | Expand/collapse section on Profile. | Profile row opens `/personal-intelligence`; existing signal data, empty states, Premium pair display, and non-interactive Premium lock row are retained. |
| Wardrobe summary | Item/category/worn counts on Profile. | Same counts remain; a zero-item user sees the existing Add Item route through “Begin your wardrobe.” |
| Free/Premium | Free upgrade and Premium manage/Diagnostics/Blueprint actions on Profile. | Free upgrade card is near the identity header; Premium manage, Diagnostics, and Blueprint remain in Account. Guest sign-in prompt before upgrading is retained. |
| Preferences and privacy | Weather, temperature, AI-processing switch, and disclosure. | Same handlers and account state. The AI description remains visible; the no-choice first-photo prompt is explicitly shown only for `not_asked`. |
| Account | Sign out and confirmed account deletion. | Same sign-out and deletion actions. Sign out has no chevron or icon tile; Delete account is plain destructive text below the card. |

The edit affordance is the only removed duplicate action. Existing profile
controls were moved, not dropped. Rows and primary controls have at least 44
points of height; the three preference switches also use 8-point hit slop.
Pressing uses opacity `0.72` without scale. Back buttons, accordion headers,
switches, chips, and rows have accessible roles/state and labels where
applicable. No `testID` values existed on the original Profile.

## Contrast measurements

Ratios were calculated from the rendered hex foreground/background colors using
the WCAG relative-luminance formula. Text colors used on small body text exceed
4.5:1. Decorative gold icons/borders are not text.

| Text color | Surface | Contrast |
|---|---|---:|
| Primary `#101826` | White card `#FFFFFF` | 17.79:1 |
| Primary `#101826` | Warm background `#F5F3F0` | 16.06:1 |
| Primary `#101826` | Premium pill tint `#F8F5EF` | 16.35:1 |
| Previous secondary text `#6B7280` | White card `#FFFFFF` | 4.83:1 |
| Previous secondary text `#6B7280` | Warm background `#F5F3F0` | 4.37:1 |
| Current theme token `#626A73` | White card `#FFFFFF` | 5.49:1 |
| Current theme token `#626A73` | Warm background `#F5F3F0` | 4.95:1 |
| Destructive text `#B3433D` | White card `#FFFFFF` | 5.55:1 |
| Destructive text `#B3433D` | Warm background `#F5F3F0` | 5.01:1 |
| White `#FFFFFF` | Primary selected-chip/button fill `#101826` | 17.79:1 |
| Warm white `#F5F3F0` | Primary upgrade-button fill `#101826` | 16.06:1 |

The original `#6B7280` token measured only 4.37:1 on the warm screen background.
A later follow-up changed the shared `textSecondary` token to `#626A73` and
removed the local Profile/Refinements overrides, so the improved contrast now
applies consistently across the app.

## Verification

| Check | Result |
|---|---|
| `npm test -- profilePresentation.test.ts` | Passed: 3/3 focused tests. |
| `npm test` | Passed: 108 test files, 0 failed. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed with no lint errors or warnings. |
| `npx tsx __tests__/recommendation-golden-set.ts` | Passed: 35/35 Engine v3.7 golden assertions. |
| `node scripts/validate-benchmark-fixtures.mjs` | Passed: all 100 cases and 53 frozen-file checksums. |
| `node scripts/validate-africa-track-c.mjs` | Passed: 100 sealed raw cases and complete Track C report validation. |
| Protected-file `git diff --exit-code` | Passed: no diffs in the checked recommendation, migration, and benchmark paths. |
| Frontend workflow restart | Running after restart; Metro reported `Waiting on http://localhost:8081`. Backend also remained running on port 5000. |

The first lint run found one React Hooks warning-as-error around the async
wardrobe load. The effect was adjusted to update state from the request's
success/failure callbacks; the final full lint run passed. Existing test output
includes non-failing `react-test-renderer` deprecation notices and intentional
simulated dependency-failure logs from failure-path tests.

## Limitations and remaining checks

- I did not run this change on a physical iOS or Android device or with
  VoiceOver/TalkBack. Those checks remain necessary for final accessibility
  and responsive sign-off.
- The browser preview's port 5000 shows the Expo Go QR landing page, not a web
  rendering of the native Profile. Directly requesting the Profile route there
  returns `Cannot GET`; the Metro browser preview at port 8081 is blank in this
  environment. The signed-in Profile and its two new screens were therefore not
  visually verified in an authenticated browser session.
- A non-fatal React Native Web `shadow*` deprecation warning appeared in the
  Metro browser preview; no shadow style was added by the changed Profile
  components. It is not addressed as part of this native screen redesign.
- The later account-deletion follow-up adds the user-keyed `bg_removal_usage`
  row to the explicit deletion inventory; the shared, hash-keyed
  `bg_removal_cache` remains retained.
- The app was not published or deployed.
