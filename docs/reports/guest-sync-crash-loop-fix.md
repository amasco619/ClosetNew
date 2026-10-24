# Amodka — Guest sync crash-loop fix

## Scope and behavior

- Added an owner-bound per-entry preparation marker to the existing local journal, written and awaited before native preparation.
- Remote row reconciliation runs before marker recovery. A confirmed row is marked synced and clears the marker without counting a crash.
- The first surviving marker increments a persisted interruption count and permits one automatic retry. The second consecutive survival pauses the entry in the existing **Upload failed** / **Retry failed uploads** flow.
- Successful uploads and caught failures clear the marker in their outcome write. Caught offline, timeout and known HTTP failures do not count as crashes. Account-change aborts also clear the marker.
- Manual retry resets the crash count, existing failure counters, marker and local high-risk flag.
- Guest single-item save now prepares a managed file through the same 1600 px / 6,000,000-byte codec as authenticated uploads. PNG cutouts stay PNG. On preparation failure, the previous local-copy fallback remains available and is marked manual-only for sync; original inputs are never deleted by a failed preparation or fallback copy.
- Existing journal entries without dimensions/markers remain valid. Absorb/discard rules are unchanged.

## Dimension API and first-render ordering

`lib/imageDimensions.ts` uses the existing React Native `Image.getSize(uri)` Promise API, or retained dimensions for new local guest files. In the installed RN 0.86 Android implementation, `ImageLoaderModule.kt:82–96` requests `fetchEncodedImage`, and `:122–149` reads `EncodedImage` dimensions and EXIF orientation. It does not request a decoded bitmap. For managed local files, the iOS `RCTImageLoader.mm:1071–1123` NSData branch also reads image metadata.

Both `storageUploadImage.ts` and `prepareClassificationImage.ts` queue the appropriate single-axis longest-edge resize before their first `renderAsync()`. The previous unresized `ImageRef` used only to discover dimensions is gone. Small sources are not upscaled.

Guest save receives picker dimensions for original sources and persists dimensions of the actual managed output; if it has to retain the original, it retains its picker dimensions instead. A PNG cutout probes its own dimensions, not the original photo's. Legacy entries use the native metadata probe.

This avoids an explicit full-resolution bitmap render just to get dimensions. It does **not** prove that the native encoder's final render has bounded peak memory: encoded bytes can still be buffered, and the encoder/decoder may have internal allocations. Android process-kill/OOM evidence was not available. Browser behavior is not equivalent evidence for the native metadata path.

## Wardrobe grid — report only

Pending Wardrobe list/grid items still pass their saved URI to `GarmentTile` (`app/(tabs)/wardrobe.tsx:112–127,165–181`). `components/GarmentTile.tsx:52–60` passes `source={{ uri }}` to Expo Image; no separate thumbnail file is generated.

Expo Image provides `allowDownscaling` (`node_modules/expo-image/src/Image.types.ts:411–419`), documented with default `true`; it is disabled only for `contentFit="none"`/`"fill"`. The tile uses `contain` or `cover`, not those modes. The installed Android native wrapper defaults it to true (`ExpoImageViewWrapper.kt:153`) and supplies its target-size downsample strategy to the image request (`:567–586`). The application does not override it. The grid was not changed, and its actual peak memory was not measured on a physical device.

## Tests

New:

- `__tests__/guestSyncCrashRecovery.test.ts`: marker persisted before preparation; simulated process-death/recreated journal; first survival retries; second pauses; successful recovery resets; confirmed-row reconciliation wins; manual reset is owner-bound; caught offline/429/503 failures do not become crashes; local source survives.
- `__tests__/guestPhotoSave.test.ts`: actual shared codec/save helper with mocked native I/O; 1600 px and byte-bound output; no original copy on successful save; persisted dimensions; PNG preservation; retained-original fallback starts manual-only; fallback failure does not delete the source; screen wiring.

Updated:

- `classificationPreparation.test.ts`: metadata boundary and fail-fast assertion if an oversized image is rendered before resize; exact resource cleanup expectations now exclude the removed unresized ImageRef; single/bulk payload parity retained.
- `storageUploadBounds.test.ts`: metadata mock, rejection of an unresized first render and stronger call-site assertion requiring persisted guest dimensions.
- `guestPhotoSyncFailures.test.ts`: caught HTTP/offline failures clear the marker and reset the crash sequence; existing failure-policy assertions retained.

One initial focused run failed only on the old formatting-sensitive call-site regex after the helper call became multiline. It was updated to allow whitespace and additionally require `entry.item.localPhotoDimensions`; no behavior assertion was removed to hide a failure.

## Validation

| Gate | Result |
| --- | --- |
| Full `npm test` | **132 files passed, 0 failed** |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no diagnostics |
| Engine v3.7 golden regression | **35 passed, 0 failed** |
| Benchmark fixture validator | Passed: 100 cases and all 53 frozen-file checksums |
| Track C validator | Passed: 100 sealed raw cases, metrics/CSVs and 26 report sections |
| Android export | Passed; Hermes bundle exported to ignored `generated-artifacts/guest-sync-crash-loop-android` |
| Frontend refresh/preview | Passed: `Start Frontend` restarted; fresh build stamp, Metro listening on 8081 and Android bundle completed; `/welcome` rendered at 402×874 |

Journal/process-death tests simulate an interrupted JS process using an unresolved native-preparation promise and a new migration instance sharing persisted test state. Codec tests use synthetic output and native-module mocks, not a real phone image or live Supabase.

The initial cold `/` screenshot captured a blank hydration view; the direct `/welcome` capture rendered the complete screen. No JavaScript exception appeared in either capture. The existing web `shadow*` deprecation warning remains; it was not part of this bounded change. The backend was not restarted.

## Files changed

Application: `app/add-item.tsx`, `constants/types.ts`, `lib/guestWardrobeMigration.ts`, `lib/guestWardrobeSync.ts`, `lib/storageUploadImage.ts`, `lib/prepareClassificationImage.ts`; new `lib/imageDimensions.ts` and `lib/saveGuestPhoto.ts`.

Tests: the five files listed above.

Documentation: `TECHNICAL.md`, this report, and the existing guest-mode memory policy note. Export housekeeping: `.gitignore`, `.replitignore`.

## Deviations

No functional scope deviations. The only supporting housekeeping is ignoring generated Android exports so they are neither checkpointed nor deployed.

No server, database, bucket settings, consent, limiter, classifier prompt/vocabulary, Recommendation Engine source/frozen artifacts, billing, migration or guest-account disposition rule was changed. No package or environment change, live SQL, provider request or publish was performed.

## Not verified on a device

- Real Android OS termination/OOM during preparation of the reported 27 MB original.
- Peak native memory and decoder sampling on Android/iOS, including Expo Go after repeated launches.
- Real picker/EXIF orientation combinations and a physical-device PNG transparency check.
- The physical device's existing journal and whether its reportedly missing photo is still present. This change does not alter discard rules or reconstruct an already removed photo.
- Device-side refresh receipt. The workspace frontend/preview can be checked here; the phone must receive the refreshed bundle.

The existing local preparation step still has no cancellation/watchdog; the crash marker protects relaunch recovery, not an indefinitely unresolved native promise in a process that remains alive.

Outside this brief, `app/bulk-review.tsx:913–924` also retains its separate pre-save no-op source render before resize. It was not changed by the requested shared-helper/single-guest-save fix.
