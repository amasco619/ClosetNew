# Amodka bulk photo staging and decode-failure report

**Status:** Implementation and repository checks pass. Physical iOS/Android validation remains required. The exact native `Loading bitmap failed` cause is not proven; the fix removes the fragile picker-URI-through-navigation handoff.

## Phase 0 — SDK and URI forensics

The SDK 57 upgrade was commit `281de9b` at **2026-10-15 21:49:12 UTC**. The last reported good bulk run was approximately **2026-10-16 20:30 UTC**, on the SDK 57 build, before `f900c18` (2026-10-16 21:17:56 UTC). The SDK change therefore did **not** happen after the good run. Lockfile versions remained identical from `8c3be6f` (2026-10-16 19:48:46 UTC), across `f900c18`, through the current workspace.

| Package | Before SDK 57 (`281de9b^`) | SDK 57 (`281de9b` and failing builds) |
|---|---:|---:|
| `expo` | 54.0.37 | 57.0.30 |
| `expo-image-picker` | 17.0.11 | 57.0.20 |
| `expo-image-manipulator` | 14.0.8 | 57.0.21 |
| `expo-file-system` (transitive lock entry) | 19.0.24 | 57.0.7 |

The SDK 57 image-picker changelog at 57.0.20 says there are no user-facing changes; recent listed picker fixes are iOS-only. No SDK 57 changelog entry found an Android picker-URI/cache-copy regression. SDK 57 picker documentation describes local/cache file URIs for selected assets. The image-manipulator 57.0.21 changelog lists two iOS fixes (10-bit HDR context loss and scaled-image pixel resolution). SDK 57 supports the app’s existing `manipulateAsync` call, now deprecated in favor of the context `renderAsync` API; the existing resize options remain unchanged. The file-system 57.0.7 changelog has no user-facing change. The app uses `expo-file-system/legacy` and continues using that API consistently; no newer `File`/`Directory` API was mixed in.

The signed-in Android diagnostic failed at image resize in 12–17 ms with native `Context.renderAsync` “Loading bitmap failed” for local JPEG URIs. The same two photos worked in single Add Item; the serial queue already passed its tests. A pre-fix whole-app search found no cache sweep or `deleteAsync` of picker cache files between selection and bulk resize. Guest-photo cleanup only deletes URIs under `documentDirectory`; weather cache clearing is unrelated. The bulk route did carry temporary photo URIs through Expo Router params, and its one-photo redirect also passed `initialUri`.

**Conclusion:** SDK chronology and changelogs do not identify a version regression. The URI handoff is the notable bulk/single difference, but there is not enough native evidence to claim it was the exact decoder root cause.

## Changes

- **Temporary diagnostics, development only:** before navigation, each successful staged selection records hashed picker/staged URI identity, filename length, MIME type, dimensions, and source/staged file existence and size in the in-memory selection store. Resize failures add current file information, string equality against the pick-time staged URI, and time since pick to the existing error card and `[bulk:prepare]` console log. No full paths, image bytes, or credentials are logged.
- **App-owned staging:** multi-select now awaits copies into `FileSystem.cacheDirectory/amodka/bulk-staging/<uuid>.<ext>` before navigation. A failed copy is omitted and disclosed inline; if all copies fail, Add Item stays open. `/bulk-review` and the one-photo redirect pass only an opaque selection ID, never photo URIs. A missing or expired in-memory selection shows a calm recovery message.
- **Cleanup:** remove/cancel/back and acknowledged saves delete unreferenced staged files. Confirmed single-item saves do the same. Failed/ambiguous saves retain files for retry. `local-only`/pending-upload and current wardrobe references are protected. Startup best-effort sweeps only unreferenced staging files older than 24 hours. Development cancel logs show only cleanup counts.
- **Unchanged:** resize dimensions/quality/format, serial queue, PhotoRoom, classifier request/behavior, direct single-photo selection flow, and unrelated app behavior. No dependency, schema, provider, or engine changes.

**Current development build stamp:** `8ac0cf0-dirty-20261017T104645Z` (printed by the restarted Start Frontend workflow and displayed in the Batch Review footer).

## Files changed

- App flow: `app/add-item.tsx`, `app/bulk-review.tsx`, `app/_layout.tsx`, `components/SwipeToDismiss.tsx`, `lib/bulkClassifyCore.ts`, and new `lib/bulkPhotoStaging.ts`.
- Tests: new `__tests__/bulkPhotoStaging.test.ts`; updated `__tests__/bulkReviewMountedGuard.test.ts`, `__tests__/photoPrepareDiagnostic.test.ts`, `__tests__/imagePickerSelection.test.ts`, `__tests__/addItemReplacementContract.test.ts`, `__tests__/b28RemediationContract.test.ts`, and `__tests__/swipeDismiss.test.ts`.
- Project records: `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`, `.agents/memory/MEMORY.md`, and `.agents/memory/image-upload-flow.md`.

## Verification

- `npm test`: **100 passed, 0 failed**.
- Final focused rerun — `npm test -- bulkPhotoStaging.test.ts photoPrepareDiagnostic.test.ts bulkReviewMountedGuard.test.ts imagePickerSelection.test.ts addItemReplacementContract.test.ts b28RemediationContract.test.ts swipeDismiss.test.ts`: **7 passed, 0 failed**.
- `npx tsx __tests__/recommendation-golden-set.ts`: **35 passed, 0 failed** (Engine v3.7).
- The full suite also passed `outfitGenerator.test.ts`, `outfitRotation.test.ts`, and `stylingWardrobe.test.ts`.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- The first full run found three static assertions still expecting the pre-staging route/wrapper/save sequence. Those assertions were updated to verify the new ID-only route, staged cleanup, and dismiss callback; the subsequent full run passed. The bulk save mounted-test fixture was also corrected to resolve its deferred resize so all later assertions execute.
- Existing test output still includes React Test Renderer deprecation notices. Lint and typecheck emitted no warnings.
- Protected Recommendation Engine v3.7, Phase A schema/security, P1.3, and benchmark files were not changed.

## Physical-device test script

Use SDK 57 Expo Go, sign into the test account, and ensure the existing AI-processing preference permits analysis.

1. **Repeat the original two-photo case:** select the same two photos together. Pass: both cards show their photos and reach a settled/reviewable state without “Could not prepare photo”; no card disappears. If classification itself fails, Retry should start another attempt.
2. **Test 5–6 photos:** select a larger batch. Pass: every successfully staged photo appears exactly once, classification settles/retries independently, and no native bitmap preparation error appears.
3. **Cancel/back cleanup:** select multiple photos, then use Cancel, the back arrow, or Android back. Pass for a batch with no retained local-only/pending item: Start Frontend logs `[bulk:staging] cancel-cleanup` with `retainedCount: 0` and `remainingFileCount: 0`. Protected local-only/pending items may remain by design.
4. **Save All:** select and classify a batch, then save it. Pass: every committed item appears once in the wardrobe with its photo; the batch leaves review only after the acknowledged save.

If a card still fails, capture the failed card with its development diagnostic text **and the visible build stamp** in one screenshot; also copy the matching `[bulk:prepare]` line from Start Frontend. Do not send the photo, full URI, or credentials.

**Not verified here:** physical iOS/Android execution, actual on-device picker file metadata, native decoder recovery, screen-reader behavior, and successful Save All on a real account. The browser screenshot of Metro’s root is not a native-app screen. Its preview logs contained the pre-existing React Native `shadow*` deprecation and RevenueCat web-preview messages.
