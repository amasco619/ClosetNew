# Missing wardrobe photos after sign-in

## Verified cause

Read-only checks against the configured Supabase project confirmed that the
reported test account exists and has two wardrobe rows. Both rows reference
owner-prefixed JPEG paths absent from `storage.objects`; no wardrobe photo
objects remain under that owner's prefix.

The warning originates in signed-in wardrobe hydration, not password validation.
`getSignedWardrobeUrl` cannot sign an object that no longer exists.
Previously the catch logged a warning and did not add these rows to the
existing missing-photo recovery interface.

The empty Storage prefix with surviving wardrobe rows is consistent with the
earlier account-deletion regression: bucket cleanup preceded a failed table
delete. Historical logs do not identify the caller, so this causal association
is not proven for the particular account. No further account data was deleted
or modified during this investigation.

## Correction

- `lib/storage.ts`: classify the explicit Storage `Object not found` response
  as a missing-photo error. Signing/upload failure behavior remains fail-closed.
- `lib/wardrobePhotoHydration.ts`: preserve garment details and the durable path,
  clear the unusable display URI, and signal missing-photo recovery. Other
  errors still throw; they are not silently treated as missing objects.
- `contexts/AppContext.tsx`: during the signed-in initial wardrobe read, add
  missing photos to the existing recovery state after the account/startup
  freshness check. Existing garment IDs are deduplicated. No cloud writes.
- `app/(tabs)/index.tsx`: make the existing recovery message accurate for both
  interrupted saves and photos removed later. Existing re-photograph/remove
  actions remain unchanged.
- `__tests__/wardrobePhotoHydration.test.ts`: focused regression coverage.
- `TECHNICAL.md`: document the recovery behavior.

This does not recover erased image bytes. Re-photograph the affected garments
through the Home recovery card to replace their photos, or explicitly remove
them. Neither action runs automatically.

## Checks run

- `npm test`: **115 test files passed, 0 failed**, including the new focused test.
- Focused coverage: missing object, preserved ID/details/path, blank display
  URI, restored object, local guest photo unchanged, real Storage response
  classification using a stubbed client, network/permission errors propagated,
  account/startup publication guard and no cloud mutations in recovery hydration.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npx tsx __tests__/recommendation-golden-set.ts`: **35 passed, 0 failed**.
- `node scripts/validate-benchmark-fixtures.mjs`: passed, including 53 frozen
  checksums and 100 benchmark cases.
- `git diff --check`: passed, including documentation.
- Frontend workflow restarted and confirmed ready on port 8081. The Expo QR
  landing page renders; its browser logs include an unspecified resource 404.
  This landing-page check is not evidence of a signed-in recovery journey.

## Limits

No password was requested or used, and no live sign-in, physical-device
re-photograph or successful photo replacement was performed. Tests use fixtures;
live checks were read-only metadata checks. Missing-photo recovery here covers
the initial signed-in wardrobe hydration; existing pagination, foreground and
entitlement-refresh photo handling is unchanged. No auth, RLS, schema, quota,
billing, consent, classifier or Recommendation Engine logic was changed.
No new dependencies, publication or deployment.
