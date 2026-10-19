# Missing wardrobe photo recovery verification

Verified on 2026-10-19 against the development Expo web app and its configured
Supabase project. This is not production-deployment or physical-device evidence.

## Safety and setup

- Created one new, explicitly disposable account and generated a synthetic
  512×512 garment image. No existing user account or personal photo was used.
- Signed in using the public-key client; seeded 30 wardrobe rows through the
  real `insert_wardrobe_items` RPC. All 30 were selected in the free wardrobe.
- One synthetic blouse referenced a nonexistent object in that account's
  `wardrobe-images` prefix. This exercised real missing-object detection rather
  than injecting an orphan into application state.
- Captured complete owner-scoped `wardrobe_items` and
  `wardrobe_free_selections` snapshots before interacting with the app.

## Live browser and Supabase results

| Check | Observed result |
| --- | --- |
| Home entry point | The unavailable-photo card appeared. **Edit & re-photograph** opened `/add-item` with the original `replaceItemId`, `preClassified=true`, no `initialUri`, and the Choose Photo step. |
| Cancel without choosing a photo | Returning Home retained the recovery card. Complete row and free-selection snapshots were unchanged. |
| Choose a replacement | The real browser gallery/file chooser accepted the synthetic image. Existing blouse/top, navy, description, cotton, regular fit, solid/small pattern, work/fall, white accent, collared neckline, long sleeves, formality 6, and price 75 remained present. No multi-piece option appeared. |
| AI processing | No `classify-garment` or `remove-background` requests were observed during recovery. |
| Failed upload | A Playwright route returned a test-only HTTP 503 for the disposable account's Storage upload POST. The app displayed the photo-safe error dialog and remained on Add Item. Complete database row and free-selection snapshots still matched the originals. This failure was injected, not a real provider outage. |
| Retry successfully | Removed only the injected failure route and saved the same draft. A real Storage POST succeeded, **Changes saved** appeared, Home opened, and the recovery card cleared. |
| Garment identity and metadata | The original row ID, owner, creation time and all garment metadata, including `recommendation_semantics`, were unchanged. Only `image_url` and the database-maintained `updated_at` changed. |
| Capacity and duplicates | Exactly 30 rows and the same 30 selected garment IDs remained throughout. No extra row or selected-item slot was consumed. |
| Image durability | A signed read of the new object returned HTTP 200 with a nonempty JPEG. Reloading Home retained 30 items and no recovery card. |

Browser screenshots captured the initial recovery card, Choose Photo step,
cancelled return, populated replacement form, injected-failure dialog,
successful retry toast and post-reload Home.

An HTTP 400/aborted wardrobe-items request appeared during startup/auth
hydration. It did not block this journey or the owner-scoped snapshot checks;
this verification does not claim to diagnose that separate startup observation.

## Fixture checks

`__tests__/addItemReplacementContract.test.ts` executes the actual Home route,
Add Item initialization, picker and save callbacks with controlled external
I/O. It covers:

- Route identity and initialization without an initial photo.
- Saved semantic metadata and purchase-price initialization.
- Cancelled picker and single-photo replacement options.
- Failed upload without persistence or navigation; retrying the retained draft.
- Replacement of the original ID rather than invoking the insert path.
- Equality of the saved semantic payload and original metadata.

These are source-executed fixtures, not mounted native screens or live database
tests. The old `applyRePhotographSave` helper tests exercise a legacy add/remove
utility that the current screen does not call; they are not evidence of the
current replacement behavior.

TypeScript and lint passed. The full automated run initially passed 113 suites
and exposed two fixture/contract assertion failures; those two suites passed
after correcting their fixtures and the single-selection expectation.

## Cleanup and limits

The tester verified the disposable account identity and ownership before
cleanup, removed its one uploaded synthetic object, deleted only that
disposable account, and confirmed no remaining profile, wardrobe rows or free
selections for it. Temporary credentials/state and the generated image were
removed from `/tmp`; no credentials or signed URLs are included here.

This verifies the real web gallery path with live Supabase reads/writes. Native
iOS/Android camera permissions, camera capture, OS photo-picker cancellation,
and device lifecycle behavior were **not** exercised.
