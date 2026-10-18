# Amodka guest bulk upload — implementation and audit report

## Decision and path

**Implemented local-only parity; no pre-picker gate was needed.** The existing
bulk staging flow already keeps photo paths behind an in-memory opaque selection
ID, and the Add Item screen already has a manual form and a guest local-save
path. Guest bulk cards now use that handoff rather than classification. This
avoids a second guest flow and avoids changing the shared staging helper.

## Audit of the existing guest single-item path

- A guest can manually add a garment through the existing Add Item form. Its
  validation requires a photo, subtype, and color. Saving copies the source
  photo into app document storage and adds the wardrobe row through the existing
  local guest store; it does not upload that photo to Supabase.
- The normal single-photo picker has an AI-preference check before starting
  classification. A guest cannot use the authenticated preference endpoint,
  and a failed check leaves the photo available for manual entry; photo bytes
  are not sent to Gemini or PhotoRoom unless AI processing is allowed.
- `removeBackground` itself rejects unauthenticated use, but guest bulk now
  avoids calling it entirely. The classifier and PhotoRoom calls are part of
  the gated signed-in pipeline.
- The guest item-cap value is supplied by the existing AppContext (`itemCap`);
  current saved count is `wardrobeTotalCount`. The bulk picker keeps only the
  first `max(0, itemCap - wardrobeTotalCount)` selected photos. It reports
  over-cap selections and does not stage anything if no capacity remains.
- The existing Add Item “Get Started”/guest path is local. Successful sign-in
  does not automatically transfer guest wardrobe rows or photos in the
  hydration path inspected for this task. The new sign-in banner therefore
  does not promise wardrobe transfer.

## Exact behavior implemented

- Guest-selected cards display their original staged photos and a calm “Add
  details” action. Tapping a card opens the existing manual Add Item form with
  the opaque selection ID and photo index; no URI is placed in route params.
- Guest-origin selections skip AI-preference lookup, AI consent, staggered
  classification, background removal, and classifier requests. The guard wraps
  the actual callback containing the full pipeline. This remains true if the
  user signs in while the review is open; no previously selected photo is
  silently processed.
- Each completed manual form uses the existing guest local save path, including
  its existing validation. Save All remains disabled for incomplete/manual
  guest cards; each photo must be completed through that form.
- The Bulk Review banner reads exactly: “Sign in to let Amodka identify and
  prepare these photos for you.” Its button uses the existing `/sign-in` route.
- A full guest wardrobe produces a “Guest wardrobe is full” dialog with “Not
  now” and “Sign in.” Partial over-selection keeps the first eligible photos
  in picker order and reports how many were left out. Existing staging-failure
  notices continue to report photos that could not be staged.
- Signed-in bulk behavior and existing shared staging, cleanup, and manual
  single-item behavior remain in place.

## Files changed

- `app/add-item.tsx` — guest cap enforcement before staging, count disclosure
  through safe numeric route params, and suppression of the AI-paused panel for
  the guest-origin manual handoff.
- `app/bulk-review.tsx` — manual-only card state and original-photo affordance,
  sign-in and cap notices, guest-source AI guard, and manual route integration.
- `lib/bulkClassifyCore.ts` — optional `manualOnly` route marker for this handoff.
- `lib/guestBulkUpload.ts` — pure cap/status helpers and the testable AI callback
  gate.
- `__tests__/guestBulkUpload.test.ts` — cap arithmetic, card-state mapping,
  injected classification/PhotoRoom spies, opaque manual route, and integration
  source contracts.
- `__tests__/imagePickerSelection.test.ts` — asserts that staging receives the
  capped asset list and the existing opaque selection route.
- `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`, `.agents/memory/MEMORY.md`,
  `.agents/memory/guest-mode.md` — implementation/source-of-truth updates.

## Validation

Focused checks:

- `npm test -- guestBulkUpload.test.ts imagePickerSelection.test.ts bulkReviewMountedGuard.test.ts classifierRefusal.test.ts bulkPhotoStaging.test.ts` — 5 selected test files passed, 0 failed.
- `npm run typecheck` — passed.
- `git diff --check` — passed.

Full verification:

- `npm test` — 111 test files passed, 0 failed. Test output includes existing
  `react-test-renderer is deprecated` notices and expected error logs from
  failure-path fixtures; neither caused a test failure.
- `npm run lint` — passed; no lint diagnostics were emitted.
- `npx tsx __tests__/recommendation-golden-set.ts` — Recommendation Engine v3.7
  golden set passed, 35/35.
- `node scripts/validate-africa-track-c.mjs` — passed: 100 sealed raw cases,
  complete metrics/CSVs, 26 report sections.
- `node scripts/validate-benchmark-fixtures.mjs` — passed: 100 cases, 84
  fixtures, and 53 frozen-file checksums.
- `git diff --check` — passed. No Track C data, golden-set fixture, frozen
  benchmark file, or recommendation-engine file appears in the change set.

## Scope and limitations

No database/schema/RLS change, dependency addition, quota change, classifier
change, consent-system change, PhotoRoom change, Recommendation Engine v3.7
change, Profile layout change, or authenticated-flow change was made. The
shared bulk staging helper was not modified.

No physical iOS or Android device test was performed. The UI, guest save,
account-transition behavior, local-file survival after app restart, and screen
reader announcements still require device validation. Automated checks exercise
the pure rules and source contracts, not a live signed-in or guest app journey.
