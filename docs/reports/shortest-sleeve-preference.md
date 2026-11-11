# Standing shortest-sleeve preference

## Read-only preflight

The connected Amodka project's live catalog was inspected using SELECT queries
only, without reading customer rows.

- `user_profiles` has a primary key and an `id` foreign key to `auth.users`
  with `ON DELETE CASCADE`. No CHECK constraint restricts its constraints JSON.
- Its only non-internal trigger, `trg_user_profiles_updated_at`, calls
  `update_updated_at()` before updates and sets `new.updated_at = now()`.
  There is no JSON-key validator or sync-version trigger on this table.
- `profileJudgeConstraints` previously used a non-strict Zod object: unknown
  keys were stripped, not rejected. The new key is explicitly allowlisted.
- No SQL change was necessary. No migration file, backfill or live write was made.

## Design and behaviour

The existing JSON column holds an optional `minimumSleeveLength` enum:
`none`, `short`, `three-quarter`, `long`. Refinements shows No preference,
Short sleeves, Three-quarter sleeves and Long sleeves.

`shared/sleevePreference.ts` derives the effective choice when read. A missing
enum with `noSleeveless: true` means Short sleeves; false or absent means
No preference. An explicit enum takes precedence. Account hydration, guest and
device-cache parsing preserve the original stored shape. Merely viewing the
setting or saving an unrelated field does not add the new key.

Only an explicit chip edit adds the enum to the existing profile constraints.
The same edit sets `noSleeveless` to false for none and true otherwise.
Existing profile persistence saves that JSON to the device and, for an
authenticated account, `user_profiles.constraints`. No new table or column.

The separate guard checks tops, dresses and outerwear against
`sleeveless < short < three-quarter < long`. Shorter sleeves raise
`Sleeve shorter than your preference`. Missing/unrecognised sleeve length is
reported as missing when a minimum is required. No preference requires no sleeve
fact. Bottoms, shoes, bags and jewellery are ignored by this preference rule.

The server parser exports both the effective closed enum and compatibility
boolean to the text adapter. The judge flag was not changed and no Gemini calls
were made.

## Files

- `shared/sleevePreference.ts`: read-time compatibility selector and explicit edit.
- `app/refinements.tsx`: replaces the old switch with four chips.
- `lib/checkLookGuard.ts`: deterministic minimum-sleeve check.
- `server/checkLookJudgeInput.ts`: closed constraint allowlist and export.
- `scripts/check-deletion-readiness.mjs`: asserts profile ownership coverage.
- `docs/compliance/{data-inventory,privacy-policy-source,privacy-policy-page,page-update-checklist}.md`:
  optional persisted preference, retention/deletion and disabled judge facts.
- `constants/complianceDocumentMeta.ts`: draft version 0.2 and change log.
- `TECHNICAL.md`: storage, compatibility and preflight documentation.
- `__tests__/sleevePreference.test.ts`, `__tests__/sleevePreferenceUi.test.ts`:
  new behaviour coverage.
- `__tests__/checkLookGuard.test.ts`: existing failure assertion updated to the
  requested exact copy.
- `__tests__/legalPages.test.ts`: expected draft version updated and new disclosure
  assertions added.

## Verification

- Focused profile, guard, exporter, mounted Refinements and existing judge tests
  passed. The mounted screen confirms no write on opening, legacy selected-chip
  state and all four explicit edits.
- Full suite: 154 files passed; one legal-page test expected the previous draft
  version. Its exact expectation was updated to 0.2 and the file then passed.
  All 155 test files passed across that full run and the focused correction.
- Typecheck and lint passed.
- Golden set: 35 passed, 0 failed.
- Benchmark validator passed, including all 53 frozen-file checksums.
- Android export passed to ignored `generated-artifacts/shortest-sleeve-android`.
- Backend restarted successfully and listened on port 5000. Frontend changes use
  Metro hot refresh.

## Not verified

No live preference save or account deletion was performed. The deletion readiness
script itself was not executed against Supabase; its new assertion was tested
without running its live probes. No physical-device persistence or interaction
test was performed. The unauthenticated web screenshot did not expose the
Refinements UI, so it is not visual verification of that screen. No model
generation, under-load or enabled-judge test was performed.

## Deviations

None from the amended code-only scope. No migration/backfill, provider call,
judge flag change, v3.7 edit, frozen-file edit or `constants/types.ts` edit.
The legacy failure assertion's expected copy and the legal-page version
assertion were updated to match the requested behaviour; neither was removed.
