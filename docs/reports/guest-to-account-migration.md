# Amodka — guest-to-account wardrobe migration

## Step 0: audit and root cause

- Guest rows live in AsyncStorage `@amodka_wardrobe`; the explicit guest flag
  lives in `@amodka_profile`. New saves use UUID item IDs and ISO `createdAt`
  values. Photos are copied into app documents as `wardrobe_<id>.jpg|png`.
  Existing path rebasing accommodates a changed documents directory.
- Both email signup and password signin establish the same Supabase session.
  `AppContext` handles `SIGNED_IN`; startup also restores an existing session.
  Account identity/generation guards intentionally clear the visible wardrobe
  before loading owner-scoped database rows. That protects account switches,
  but there was no wardrobe transfer before that clear. Existing migration
  covered guest profile/onboarding answers, not garment rows/photos.
- Authenticated saves already upload into private `wardrobe-images`, keep the
  durable `<owner>/<item>.jpg|png` path in the row, and generate signed URLs for
  display. Existing `insert_wardrobe_items` accepts stable IDs and normalized
  garment metadata, enforces the authenticated owner, and serializes admission
  under the existing per-user lock.
- There was no durable guest-to-account upload queue to reuse. Bulk review's
  local-only/transient cards are not such a queue. The existing pending-photo
  mechanism retries **deletion**, not wardrobe upload. Therefore this change
  adds one small local journal, not a new provider or database structure.

## Implementation

1. Before auth hydration replaces an explicitly guest profile, persist an
   owner-bound claim for the proven guest-only wardrobe cache. The same capture
   runs on startup recovery with a session and an explicitly guest local profile.
   In-memory account snapshots are deliberately ineligible. Non-guest caches
   cannot be imported.
2. `@amodka_guest_wardrobe_migration` retains owner ID, original garment,
   stable migration ID, confirmed upload path, synced flag and notice flag.
   Existing UUIDs are reused; legacy non-UUID IDs receive a UUID once at claim.
   Short serialized local writes prevent competing claims losing records.
   Synced tombstones prevent a surviving legacy cache being recopied or claimed
   by a different account.
3. After signed-in hydration, run sync without blocking the UI; retry on app
   open/session restoration and foreground. Read authoritative entitlement,
   exact wardrobe count, free-selection count, and matching owned rows before
   deciding admission. Failed reads retain pending work, not a fabricated
   empty account or fabricated Premium entitlement.
4. Process oldest-created first (ID breaks ties). Free admission uses remaining
   **30 active-selection slots**, exactly like the existing RPC; retained
   inactive rows do not invent a new storage cap. Premium admission retains the
   existing 2,000-row ceiling. Existing account rows are merged, not replaced.
   The server still makes the final capacity decision if another save races.
5. Read managed original files locally, upload directly with the existing
   Storage helper, then insert successful uploads through the existing batch
   RPC. A bad photo does not discard other prepared photos. Normalized garment
   and recommendation metadata use the existing serializer/save fields.
   Source creation order controls admission; database creation timestamps
   continue to be assigned by the unchanged RPC.
6. Only a confirmed insert acknowledgement, or a later owner-scoped row whose
   stable ID **and storage path** match the claim, marks a garment synced.
   Remove its legacy-cache row only after this confirmation. A lost response
   leaves it pending; the next attempt reconciles the row instead of inserting
   twice. Never delete an upload after an ambiguous insert response.
7. Each network stage has a 20-second waiting deadline. A timeout does not
   cancel an already-sent request or prove failure. Stable IDs, later
   reconciliation, owner-scoped server operations and account-generation guards
   handle late completion. Supabase session owner is rechecked at adapter
   boundaries; old-account completions cannot publish into a new account.
8. Successful transfers use the existing guarded wardrobe refresh and update
   the free-selection IDs without a restart. The Wardrobe screen shows quiet
   “Syncing your wardrobe”, pending/capacity explanations and the persisted,
   at-most-once “Your N pieces are now in your account” note. Account changes
   clear visible sync state. Work belonging to another account remains hidden
   and pending until that account returns.
9. Successful account deletion removes only that owner's journal records and
   includes their managed source files in existing local cleanup. Another
   owner's pending journal survives. After Storage and row confirmation, synced
   source files enter the existing owner-scoped cleanup retry queue. Active
   Add Item reviews protect their managed photo URI until unmount; failed
   deletion remains retryable. The account-owned tombstone remains after the
   source file is reclaimed, preventing a surviving guest cache from being
   claimed by another account.

### Side-effect and protection boundaries

No classification, PhotoRoom, Gemini, background removal, AI-consent lookup,
consent prompt or AI-quota debit is part of migration. AI preference OFF does
not prevent this first-party, already-owned photo transfer and is not changed.
The adapter writes only the migration journal/legacy guest cache, existing
wardrobe Storage objects, and existing wardrobe batch RPC.

Recommendation Engine v3.7, benchmark/golden artifacts, database schema/RLS,
Phase A relationships, billing/RevenueCat, quota enforcement, consent logic and
server enforcement, auth API/signin policy, and dependencies are unchanged.
Only the existing auth-event/startup integration receives the pre-clear capture.
No rotation/wear/mood/reaction/saved-look/profile migration writes were added.
Normal existing wardrobe-change observers still run as before.

## Files changed

- `lib/guestWardrobeMigration.ts`: pure admission plan and injected durable
  coordinator, ownership, idempotency, retries and persisted notices.
- `lib/guestWardrobeSync.ts`: existing storage/database/filesystem adapter.
- `contexts/AppContext.tsx`: capture before hydration, nonblocking startup/
  foreground sync, guarded refresh, visible state and deletion cleanup.
- `app/(tabs)/wardrobe.tsx`: quiet sync/pending/success note.
- `__tests__/guestWardrobeMigration.test.ts`: focused proofs and production
  adapter with stubbed I/O.
- `lib/managedPhotoReferences.ts`: tracks active review references so cleanup
  waits until their managed source files are no longer in use.
- `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`: current behavior/source of truth.
- `.agents/memory/MEMORY.md`, `.agents/memory/guest-mode.md`: update the superseded no-transfer product
  decision to the explicitly approved account-bound, non-AI transfer.
- This report.

## Automated evidence

- `npm test -- guestWardrobeMigration.test.ts guestBulkUpload.test.ts accountDeletionLocalCleanup.test.ts guestPhotoCleanup.test.ts profilePersonalization.test.ts wardrobeDatabaseContract.test.ts`:
  **6 passed, 0 failed**, 108 unselected files.
- `npm test`: **114 test files passed, 0 failed**.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npx tsx __tests__/recommendation-golden-set.ts`: **35 passed, 0 failed**;
  Recommendation Engine version 3.7.
- `node scripts/validate-benchmark-fixtures.mjs`: passed; **100 cases** and
  **53 frozen-file checksums**.
- `node scripts/validate-africa-track-c.mjs`: passed; **100 sealed raw cases**.
- `git diff --check`: passed. Protected-path diff check also passed for existing
  outfit modules, version constant, migrations, server, package manifests,
  recommendation reports/artifacts and the golden-set source.
- Focused migration tests cover created order, free/Premium ceilings, retained
  rows versus active allowance, stable IDs across controller recreation,
  cross-account claim rejection, partial upload failure, ambiguous committed
  insert recovery, no cleanup before confirmation, persisted once-only notices,
  account switch after upload, owner-specific deletion, service outage and local
  journal-write failure. The actual adapter runs with stubbed I/O and proves
  owner rechecks, durable path/ID payload and no AI dependency/call or unrelated
  local-setting writes. Real auth-capture helper execution proves that only an
  explicitly guest cache qualifies; both event/startup call sites are checked.
- Source reclamation tests prove pending/ambiguous transfers remain untouched,
  open review references defer deletion, cleanup is owner-bound across account
  switches, failed file deletion retries, and deletion preserves other owners'
  migration work.

### Browser fixture journey (390 × 844)

One focused browser session used intercepted auth/backend/Supabase requests and
localStorage fixtures only; it created no live account and touched no live data.
Signing in through the actual form produced one captured batch insert with the
stable migration ID and account-A Storage path, retained the fixture account's
pre-existing row, cleared the confirmed legacy guest row, and persisted
`synced:true, announced:true`. Subsequent reload/navigation did not insert again.
The corrected actual free-wardrobe picker rendered both the existing and
migrated garments.

The first fixture run displayed an empty closet. Investigation established two
mock deficiencies: its cross-origin exact-count response did not expose
`Content-Range`, and the simulated insert omitted the database-generated
`created_at`. Only fixture responses were corrected, then the same failed UI
flow was continued. Empty free-selection fixture rows also meant this journey
opened the chooser rather than verifying automatic active selection. This is
not evidence of a production defect, nor a full live-service pass.

Visible once-only notice, account-B UI isolation and capacity-30 banner were
**not exercised** by the browser session. No classify/background-removal
endpoint was observed. Ordinary affinity reads still occurred in the existing
app hydration. Trace evidence is transient:
`/tmp/guest-wardrobe-rest-fixture-trace-corrected.json`.

Existing full-suite output includes react-test-renderer deprecation and expected
error logs from deliberate failure fixtures. No check is described here as
evidence of live Supabase or native filesystem success.

## Scope choices and remaining verification

- New durable local journal was necessary because no guest-upload retry
  mechanism existed. No migration/schema change, provider or dependency added.
- Local images remain available for pending work and active reviews. Confirmed
  sources are reclaimed through the managed-photo cleanup retry path after all
  active review references are released; owner-bound tombstones remain.
- Pending work is device-local, not cross-device. An app uninstall or clearing
  app storage can destroy still-unsynced work. Confirmed cloud rows are durable.
- Failed/missing original files remain pending; reopening cannot recreate a
  physically missing original. No classification or guessed photo substitution
  is attempted.
- Twenty-second timeouts do not cancel already-sent requests; repeated retries
  can reattempt an unconfirmed upload under the same owner/item object path.
  The row is not falsely marked confirmed or duplicated.
- The success flag is persisted before publishing the note. A process exit in
  that narrow interval can suppress the note, but cannot lose the garment.
- Still required on physical iOS/Android with a real test account: save three
  guest garments, signup and signin separately; verify photos/metadata without
  restarting; force offline/background/process death before and after upload/
  insert acknowledgement; return online/foreground and confirm one row per
  stable ID; test existing free accounts at 28/30 with three guest pieces, then
  free room and foreground; verify account A/B/A isolation; confirm there is
  never an AI prompt/provider request; check screen-reader announcement/dismiss
  behavior. Live Storage/RLS/RPC behavior is not established by fixture tests.
- Guest file saving is the existing native documents-based path. Browser
  fixtures cannot certify physical filesystem access, OS process killing, or
  actual cloud transfer.
- No publish or deployment performed.

## Deferred source cleanup follow-up — 2026-10-19

Confirmed migration sources are now added to the existing local-photo retry
queue only for the owning account and only after the migration journal marks
their Storage/row result synced. `AddItemScreen` protects a managed source URI
while its review is mounted. A successful deletion marks `sourceReclaimed` on
the still-retained owner-bound tombstone; account deletion removes the owner's
tombstone and includes its rebased managed source paths in existing local
cleanup.

Verification: focused guest migration/photo cleanup/account deletion tests
passed; full `npm test` passed with 114 test files, and `npm run typecheck` and
`npm run lint` passed. File deletion was tested through injected filesystem
stubs, not on a physical device.
