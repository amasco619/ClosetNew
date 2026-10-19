# Guest data rules, pending wardrobe, and bulk manual handoff

## Scope

Implemented the bounded guest-data, pending-card, manual bulk handoff, AI
disclosure dismissal, and wardrobe-count changes. No database migration,
dependency change, or server-side consent change was made.

## Item-by-item findings and changes

### 1. Guest-to-account decision

**Cause.** The previous auth-transition path could claim guest rows before
loading the authenticated account's profile and exact wardrobe count. Its
“blank account” test also missed saved profile values such as a name,
undertone, goals, and non-default lifestyle/constraint answers. That allowed
guest onboarding data to replace an existing account profile.

**Change.** The decision now follows the authenticated owner-scoped reads and
is written to the existing `@amodka_guest_wardrobe_migration` journal before
any guest claim or profile write:

- Any existing wardrobe row or saved profile/onboarding/personalization value
  selects `discard`. The remote profile is hydrated as-is; guest wardrobe,
  profile, journal rows, and guest-managed photos are cleared using the
  existing local cleanup path.
- An account with no wardrobe rows and no saved profile/personalization selects
  `absorb`. Only that decision permits stable-ID guest row claims and the
  existing guest-profile migration.
- The owner-bound decision cannot be changed by a later call. It remains while
  absorbed rows are pending and is released after the migration completes, so
  a later, separate guest session gets a fresh decision.
- A failed authoritative read exits before a decision or guest-data cleanup;
  the guest/pending data remains available for retry.
- Sign-in and sign-up show a brief notice when guest pieces exist. No extra
  confirmation screen was added.

**Tests.** `guestAccountDisposition.test.ts`, `guestWardrobeMigration.test.ts`,
and `profilePersonalization.test.ts` cover the new/existing profile matrix,
existing-profile preservation, decision idempotence, blocking claims for
existing accounts, cleanup of guest-owned photos, retention while migration
is pending, completed-decision release, and stale-account guards. The static
hydration contract checks that server reads precede disposition and that
disposition precedes claims/profile writes. No live account or Supabase service
was used by these tests.

### 2. Pending pieces in Wardrobe

**Cause.** Pending migration rows existed only in the local sync journal, while
the Wardrobe list was built from confirmed account rows. A signed-in user could
therefore see an empty or incomplete list and a lower count during an
offline/capacity-limited migration.

**Change.** The account-scoped context now exposes pending journal items to the
Wardrobe screen. It shows their existing photo and a “Waiting to sync” label,
prevents opening item details until confirmation, deduplicates stable IDs
against loaded server rows and within the journal, and clears/replaces this
state on account changes. Header counts include the visible pending items and
use singular/plural wording. Guest copy shows the existing 8-piece allowance;
free-account copy shows 30; Premium does not show a free allowance. Pending
items are presentation-only: they do not enter active wardrobe, quota,
recommendation, or rotation state.

**Tests.** `guestAccountDisposition.test.ts` covers owner filtering, duplicate
IDs, synced rows, signed-out isolation, and count wording. Existing migration
tests continue to cover retry, capacity, stable IDs, and row confirmation.

### 3. Guest bulk upload “Add details”

**Finding.** The existing guest state mapping already selected manual review,
and its route helper carried the opaque selection ID and photo index into Add
Item. The card's body was a single large press target, however, and “Add
details” did not have a separate press target. The reported physical-device
no-op could not be reproduced from the repository or attributed to a broken
route.

**Change.** The guest card now exposes two independent manual press targets:
the photo tile and a dedicated, accessible “Add details” action. Both call the
same manual handoff and preserve the staged selection ID/photo index; no
classification or AI request is introduced.

**Tests.** `guestBulkUpload.test.ts` verifies the guest-to-manual state and
selection route parameters. `guestAccountDisposition.test.ts` checks the
photo/action wiring and `manualOnly` flag. These are code/test-fixture checks,
not a physical-device reproduction.

### 4. Profile AI-processing “Not now”

**Cause.** Dismissal already made no preference write, but it only hid the
disclosure. An older Profile-focus refresh could still fail afterward and
publish its offline error behind the closed disclosure.

**Change.** Dismissal now invalidates an outstanding refresh and clears its
transient loading/unavailable/error state. It starts no request. If a preference
save is already in flight, dismissal does not invalidate that save or alter its
server outcome.

**Tests.** `aiPreferenceLifecycle.test.ts` verifies that “Not now” issues no
request, closes the disclosure, and ignores a late offline refresh failure.
Existing preference enforcement and provider-consent behavior were not changed.

### 5. Wardrobe count wording

**Cause.** The header always said “items,” including a count of one.

**Change.** Singular/plural wording is now generated in one presentation helper
and shows the existing guest/free allowance only in the relevant account state.

**Tests.** `guestAccountDisposition.test.ts` covers one item, multiple guest
items, free-account allowance, and Premium wording.

## Files changed

- `contexts/AppContext.tsx`
- `app/(tabs)/wardrobe.tsx`
- `app/sign-in.tsx`
- `app/bulk-review.tsx`
- `lib/guestWardrobeMigration.ts`
- `lib/guestWardrobeSync.ts`
- `lib/guestWardrobePresentation.ts` (new)
- `shared/guest-account-disposition.ts` (new)
- `lib/useAiProcessingPreference.ts`
- `__tests__/guestAccountDisposition.test.ts` (new)
- `__tests__/guestWardrobeMigration.test.ts`
- `__tests__/profilePersonalization.test.ts`
- `__tests__/aiPreferenceLifecycle.test.ts`
- `AMODKA-PROJECT-STATUS.md`
- `TECHNICAL.md`
- `.agents/memory/guest-mode.md`

## Verification

- `npm test -- guestWardrobeMigration.test.ts guestAccountDisposition.test.ts aiPreferenceLifecycle.test.ts guestBulkUpload.test.ts`: **4 passed, 0 failed**.
- `npm test -- profilePersonalization.test.ts`: **1 passed, 0 failed**; 18 test groups within that file passed.
- `npm test`: **117 passed, 0 failed**.
- `npm run typecheck`: **passed**.
- `npm run lint`: **passed**.
- `node scripts/validate-benchmark-fixtures.mjs`: **passed**, including all 53 frozen-file checksums.
- `node scripts/validate-africa-track-c.mjs`: **passed**, validating the 100-case Track C package.
- `git diff --check`: **passed**.

The test output contains existing `react-test-renderer` deprecation notices and
intentional synthetic failure logs from resilience tests; they did not fail the
suite. The public `/welcome` preview rendered, with an existing React Native Web
`shadow*` style deprecation warning and expected RevenueCat browser-mode logs.
No new runtime dependency or schema change was introduced.

## Protected scope, deviations, and limits

Recommendation Engine v3.7, its golden expectations, Phase A schema/security,
P1.3, server consent enforcement, billing/RevenueCat, auth APIs, quota rules,
and benchmark fixtures were not changed. The benchmark validators passed.
Nothing was published or deployed.

The physical-device report that tapping the guest bulk tile did nothing was not
reproduced. The pre-existing route configuration was intact; this patch adds
explicit, independent hit targets, but an iOS/Android interactive confirmation
is still required. The first root-route preview capture timed out; a later
public `/welcome` capture loaded, but no signed-in visual flow was available.
Live Supabase read outages, photo cleanup on a real filesystem, account
switching with real accounts, and VoiceOver/TalkBack were not exercised.

## Follow-up: durable photo-cleanup table (2026-10-19)

After a physical-device sign-in showed that
`public.wardrobe_photo_cleanup_receipts` was missing from the connected
Supabase project, the user approved applying the existing
`20261019000000_durable_wardrobe_photo_cleanup.sql` migration. It was applied to
the connected Amodka project; the migration record, table, RLS enablement,
wardrobe-delete trigger, acknowledgement function, and service-role
SELECT/DELETE grants were verified. Authenticated users do not have INSERT
privilege. A PostgREST schema reload notification was issued. No existing
wardrobe rows were changed. The phone build's target project and a physical
receipt-backed delete/recovery journey remain unverified.

## Physical Android follow-up: offline receipt lookup (2026-10-19)

The user reported that signing into an existing account correctly left guest
pieces behind, while a blank new account retained two guest photos as “Waiting
to sync” and synced them after the phone reconnected and the app was reopened.
Guest bulk photo and “Add details” actions opened manual Add Item, and offline
AI-processing “Not Now” closed without an error.

The warning shown during offline account creation was a DNS/network failure
(`UnknownHostException: Unable to resolve host`), not a missing receipt table.
The retry still treats receipt loading or photo removal as incomplete, but known
fetch, transport and DNS errors no longer emit console warnings. Schema-cache,
permission and other unexpected receipt errors remain visible. A focused
integration test checks quiet offline lookup/removal, successful later receipt
cleanup, and continued warning visibility for a missing-table error.

Verification: focused Undo integration test, full `npm test` (117 passed, 0
failed), `npm run typecheck`, and `npm run lint` passed. The test suite emits
expected simulated cleanup-error logs and React test-renderer deprecation
notices; no check failed. Expo frontend restarted and remained running. The user
subsequently retried on a physical Android device and confirmed the warning no
longer appeared. iOS and VoiceOver/TalkBack remain unverified.
