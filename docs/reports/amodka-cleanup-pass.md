# AMODKA — phased cleanup pass

**Date:** 2026-10-18  
**Scope:** Six bounded phases from the supplied cleanup specification. No publish,
deployment, migration, provider request change, or Recommendation Engine v3.7
change was made.

## Phase results

### 1. Upload diagnostics and repository hygiene

The opt-in diagnostic gate, allowlisted `reportUploadError({stage,code})`,
headless Expo configuration, configurable `GEMINI_PRIMARY_MODEL`, and report
organization were already present. This pass removed the unused shared
diagnostic formatter; the two screens now format diagnostic text only inside
their dev-and-flag-gated render branches. This avoids retaining a callable
formatter in release code.

**Changed in the Phase 1 commit:** `lib/bulkClassifyCore.ts`,
`app/add-item.tsx`, `app/bulk-review.tsx`,
`__tests__/photoPrepareDiagnostic.test.ts`, `TECHNICAL.md`.

Validation recorded for the phase: focused upload/refusal/diagnostic tests
passed (3 suites); `npm test` **109 passed, 0 failed**; typecheck and lint
passed; Recommendation Engine v3.7 golden set **35/35 passed**; Android
production export passed. Searches of the exported JS bundle returned zero
matches for `pickerHash`, `stagedAtPick`, `sincePick`, and
`formatPhotoPrepareDiagnostic` (and the `Loading bitmap failed` diagnostic
string). `.replit` headless configuration and model defaults were not changed.

### 2. Photo preparation, fallback, and quota copy

Already implemented before this pass; no source changes were needed. Successful
transparent cutouts remain PNG. If a cached cutout is missing, preparation
falls back to the original rather than rejecting the photo. Single and bulk
classification share the 1024-pixel longest-edge, no-upscale, JPEG quality
0.8 preparation policy. Lifetime allowance wording is retained; quota
semantics are unchanged.

The documented dimension comparison in
`docs/reports/upload-pipeline-cleanup.md` is:

| Input | Previous single | Previous bulk | Current shared result |
|---|---:|---:|---:|
| 3000×4000 portrait | 768×1024 | 1024×1365 | 768×1024 |
| 4000×3000 landscape | 1024×768 | 1024×768 | 1024×768 |
| 2048×2048 square | 1024×1024 | 1024×1024 | 1024×1024 |
| 768×1024 portrait | 768×1024 | 1024×1365 | 768×1024 |
| 240×320 portrait | 240×320 | 1024×1365 | 240×320 |

These are preparation outputs recorded by the existing report/tests, not
physical-device captures.

### 3. Upload failure UX

Already implemented before this pass; no source changes were needed. Bulk
retry/refusal/manual-entry behavior and the serial retry flow remain as
documented in the upload report. Current full-suite verification covers the
existing regression tests.

Fresh Android production bundle export completed. B2 diagnostic searches:
`pickerHash` **0**, `stagedAtPick` **0**, `sincePick` **0**,
`formatPhotoPrepareDiagnostic` **0**. E6 search: `withDeadline` **0**;
`ApiRequestError` occurs **3** times in internal bundled implementation, but
is absent from the reviewed rendered error-string sources (`app/add-item.tsx`,
`app/bulk-review.tsx`, `components/PhotoRefusalNotice.tsx`). No raw stack or
`error.name` rendering was found in those paths. Thus the bundle is not
globally free of the internal class identifier; the evidence is that it is not
used as rendered error copy in the checked paths.

### 4. AI-consent close semantics

The sheet now receives `context="upload"` or `context="profile"`. Only the
explicit upload **Decline** action persists `declined`. Profile **Not now**,
hardware back, backdrop press, and drag-handle swipe dismiss without writing a
choice. Upload dismissals route the current photo to manual entry without
calling AI. Bulk Review also makes the remaining selected photos individually
available for manual entry. **Allow** and server-side consent enforcement are
unchanged.

**Changed in the Phase 4 commit:** `components/AiProcessingConsent.tsx`,
`lib/aiConsentFlow.ts`, `__tests__/aiConsentFlow.test.ts`,
`app/add-item.tsx`, `app/bulk-review.tsx`, `app/multi-item-review.tsx`,
`app/(tabs)/profile.tsx`.

The prior close-method behavior was: the sheet’s Cancel button and hardware
back called the same caller-provided cancel handler; hardware back first
collapsed the expanded Learn more text. No backdrop or swipe-to-dismiss handler
was present. In Profile, Cancel attempted to save `declined`; single and bulk
upload Cancel also used the decline path; multi-item Cancel paused the flow
without the same persistent write.

The focused consent command
`npm test -- aiConsentFlow.test.ts aiProcessingConsent.test.ts aiProcessingPreference.test.ts multiItemUploadWiring.test.ts`
passed **4 suites, 0 failed** (106 unrelated tests skipped by the filter).
The new pure tests cover explicit upload decline versus Profile Not now and
back/backdrop/swipe dismissal. Existing tests cover consent preference and
multi-item wiring.

**H1 — Close-method audit:** verified from the old component/caller code and
the new context-aware callbacks; the before/after semantics are stated above.
**H5 — Policy-link audit:** Learn more expands the approved disclosure inline.
The “View Privacy Policy” action remains disabled because no URL is passed or
configured. Profile contains no Privacy Policy or Terms row, and no published
policy destination was found, so no rows were added. The app has no Settings
route; the disclosure’s “Profile” wording is therefore appropriate.

### 5. Account deletion and secondary text contrast

Both requested follow-ups were already implemented; no source change was
needed. The account-deletion inventory in `TECHNICAL.md` lists all 13 removed
user-owned tables:

`affinity_signals`, `pair_affinity_signals`, `rotation_cursors`, `wear_logs`,
`slot_statuses`, `tryon_profiles`, `saved_looks`, `garment_group_members`,
`garment_groups`, `wardrobe_free_selections`, `wardrobe_items`,
`bg_removal_usage`, and `user_profiles`.

`bg_removal_cache` remains excluded because it is shared and hash-keyed. The
existing account-deletion test covers failure at each table stage, including
`bg_removal_usage`, with the same fail-closed handling. The final full test run
passed this test.

The Profile local override was removed and the shared token is `#626A73`.
Measured contrast is **5.49:1 on white `#FFFFFF`** and **4.95:1 on warm
`#F5F3F0`**. A static source review also found the token on these tinted
secondary-text surfaces; the listed contrast uses the composited surface color:

| Surface / location | Composited background | Contrast |
|---|---:|---:|
| Onboarding selected option/eye/undertone/style cards | `#FEFDFC` | 5.40:1 |
| Occasion Planner selected option details | `#FBF9F6` | 5.22:1 |
| Travel Planner selected slot card | `#FDFBF9` | 5.31:1 |
| Outfits traditional notice | `#F3F0EB` | 4.83:1 |
| Outfits traditional context notice | `#F3EDE8` | 4.73:1 |
| Outfits traditional error panel | `#F4EDEA` | 4.74:1 |
| Outfit Ideas completed card | `#FBFDFC` | 5.37:1 |
| Outfit Ideas Undo wear pill | `#F1F7F3` | 5.05:1 |

These backgrounds come from the current RGBA accent fills composited over
their white card or warm-screen base. No below-4.5:1 secondary-text surface was
identified in this static review. Text-rendering and alpha compositing were
not checked on a physical device.

**Screens using the global token** (source paths):

- `app/add-item.tsx`, `app/blueprint.tsx`, `app/bulk-review.tsx`,
  `app/choose-30.tsx`, `app/diagnostics.tsx`, `app/index.tsx`,
  `app/item-detail.tsx`, `app/multi-item-review.tsx`, `app/onboarding.tsx`,
  `app/outfit-ideas.tsx`, `app/personal-intelligence.tsx`, `app/premium.tsx`,
  `app/refinements.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/outfits.tsx`,
  `app/(tabs)/profile.tsx`, `app/(tabs)/wardrobe.tsx`, `app/wear-log.tsx`.
- Shared components: `components/AiProcessingConsent.tsx`,
  `components/AmodkaErrorState.tsx`, `components/BulkItemEditPanel.tsx`,
  `components/LuxuryDialog.tsx`, `components/OccasionPlanner.tsx`,
  `components/OOTDStoryCard.tsx`, `components/PhotoRefusalNotice.tsx`,
  `components/TravelPlannerView.tsx`, `components/WardrobeGapCard.tsx`.

### 6. Language audit and source-of-truth updates

The user-facing mixed US/UK spellings found and left unchanged (this phase is
documentation-only) are:

- **Add Item — `app/add-item.tsx`:** “Choose a colour” (line 968) and “Check the
  piece and colour” (line 1462) use UK spelling; “Pick the dominant color
  family” (line 1523) uses US spelling.
- **Onboarding — `app/onboarding.tsx`:** “Eye Color” (line 383) uses US
  spelling; “colour recommendations” (line 405) uses UK spelling.

Other isolated copy found: Consent uses UK “digitisation”/“analyse”;
Bulk Review uses “analyse”; Diagnostics uses “Colour Palette”; these do not
mix variants within the same screen in the audited strings.

`TECHNICAL.md` and `AMODKA-PROJECT-STATUS.md` now describe current source-URI
retention rather than full-resolution base64 state, the current consent
contexts, and the removed release formatter. The previous upload report’s B2
statement was corrected. Older route-parameter and refusal notes remain only
where explicitly describing the former behavior or a distinct current
multi-item route; no false current claim is made for the bulk staging path.

## Final validation

After the Phase 4 implementation and final documentation edits:

- `npm test` — **110 passed, 0 failed**.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx tsx __tests__/recommendation-golden-set.ts` — **35 passed, 0 failed**.
- `npx expo export --platform android --no-bytecode --output-dir /tmp/amodka-cleanup-final-release --max-workers 2` — passed.
- `git diff --check` — passed before the Phase 4 commit; final docs-only diff is
  included in the final validation/commit.

The suite prints the existing `react-test-renderer` deprecation warnings in
mounted tests; they did not fail the run. No test/type/lint/golden failure
remains.

## Deviations and limitations

- Phases 2, 3, and 5 were already implemented and documented before this pass;
  they required no source edits and therefore no empty commits. Their
  regression coverage passed in the combined full-suite/typecheck/lint/golden
  run.
- The attached source spec remains untracked and was not committed.
- No physical iOS or Android device, Expo Go session, VoiceOver, or TalkBack
  verification was performed. The Android export checks build output, not
  interactive native behavior.
- No production AI provider, policy destination, Supabase production data, or
  real consent recording was exercised.

## Commit groups

- Phase 1: `509ae65` — Keep upload diagnostics out of release bundles.
- Phase 4: `b6a1096` — Separate AI consent decline from dismissal.
- Phase 6: documentation/report update (separate commit).

No deploy or publish was performed. No changes were made to Recommendation
Engine v3.7, Phase A schema/RLS, billing/RevenueCat, auth, quota semantics,
classifier schema/post-processing, PhotoRoom request logic, or server-side AI
consent enforcement.
