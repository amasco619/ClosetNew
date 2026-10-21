# Background-removal Supabase cutover

## Applied SQL and live verification

Approved SQL was applied through the Supabase migration tool as
`20261020231945_move_bg_removal_store_to_supabase`. The identical SQL is saved
in `supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql`;
comparison with both the approved script and stored migration history passed.
No rows were copied. Both tables were confirmed empty through the existing
server client's read-only table API at migration time. The old Replit tables
were not changed or dropped, and no secret or dependency was added.

Live metadata confirms:

| Object | RLS / policies | Client access | service_role access |
|---|---|---|---|
| bg_removal_cache | Enabled / zero | No anon/authenticated privileges | SELECT, INSERT, DELETE |
| bg_removal_usage | Enabled / zero | No anon/authenticated privileges | SELECT, INSERT, UPDATE, DELETE |
| bg_removal_increment_usage(uuid) | SECURITY INVOKER, empty search_path | No anon/authenticated EXECUTE | EXECUTE |
| bg_removal_reset_usage(uuid) | SECURITY INVOKER, empty search_path | No anon/authenticated EXECUTE | EXECUTE |

CRUD grants, RLS settings and policy definitions on the 19 previously existing
public tables matched the pre-change snapshot.

## Authorized live device verification (2026-10-21)

With explicit approval, a newly created disposable email account was used for
the Expo Go journey and the necessary PhotoRoom/Gemini calls. No customer
account was used. The first account launch exposed an unrelated signup
bootstrap defect: email signup had no provider display name, so `AppContext`
skipped creating its missing `user_profiles` row; the later entitlement
endpoint's `.single()` read returned HTTP 500. This was not caused by table
hardening. The hardening migration revoked only `TRUNCATE`, `REFERENCES`,
`TRIGGER`, and `MAINTAIN`; live ACL checks confirmed authenticated profile
SELECT and `id`/`name` INSERT remain allowed, while premium INSERT/UPDATE
remain denied. Hydration now creates the minimal profile row without a name.
After reopening, the profile row existed and entitlement retrieval returned
HTTP 200.

The device then completed the requested photo journey:

- First removal succeeded and displayed **19 of 20** remaining. Read-only
  Supabase verification showed usage count `1` and a newly created shared-cache
  row.
- Repeating the same original photo succeeded with usage still `1`.
- After restarting the backend (clearing its in-memory cache), repeating the
  same photo again succeeded. Usage remained `1`, and the same Supabase cache
  row remained, verifying the persistent shared-cache hit.
- The user force-closed Expo Go, toggled Airplane mode off/on, reopened Amodka,
  and signed in to the same test account. The entitlement endpoint returned
  HTTP 200; read-only Supabase verification still showed usage count `1`.
- In-app account deletion immediately signed the user out. The delete endpoint
  returned HTTP 200; every deletion step, including `bg_removal_usage`,
  `user_profiles`, and Auth deletion, logged success. A final scoped read found
  zero usage rows and zero profile rows for the account, while the exact
  test-created shared-cache row remained.

## Behavior and scope

The store uses the existing Supabase server client: table API for cache reads,
insert-ignore, 30-day prune and quota reads; RPC for atomic increment/reset.
The in-memory 200-entry cache and best-effort cache failure behavior remain.
Quota read/increment/reset failures reject rather than silently allowing work.
Usage deletion now follows the normal owner-filtered Supabase deletion loop,
at its original inventory position, with failure stopping Auth deletion.
The obsolete Postgres-specific deletion helper and test override were removed.

The old upsert had no cap predicate. The existing TypeScript free-tier
read-before-increment admission and uncapped Premium counting are preserved.
Concurrent increments are atomic; admission is still not an atomic SQL cap.
No new guarantee against simultaneous near-limit free admissions is claimed.

Other database pools, rate limiting, lockout, billing, consent enforcement,
Recommendation Engine v3.7 and frozen benchmark files were not changed.
Rollback and future migration rules are documented in TECHNICAL.md.

## Files changed

- `server/bgRemovalStore.ts`
- `server/accountDeletionInventory.ts`
- `server/routes.ts` (remove the obsolete deletion branch/import/override only)
- `supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql`
- `__tests__/bgRemovalStore.test.ts` (new)
- `__tests__/bgRemovalMigration.test.ts` (new)
- `__tests__/accountDeletion.test.ts`
- `__tests__/removeBackground.test.ts`
- `contexts/AppContext.tsx` (create minimal profiles for email accounts without a name)
- `__tests__/profilePersonalization.test.ts`
- `__tests__/guestAccountDisposition.test.ts`
- `TECHNICAL.md`
- `AMODKA-PROJECT-STATUS.md`
- This report

## Checks run

- Focused quota/cache/migration/deletion/provider tests: 4 test files passed.
- `npm test`: 119 passed, zero failed (re-run after the profile-bootstrap fix).
- `npm run typecheck`: passed.
- `npm run lint`: passed, no lint warnings.
- `tsx __tests__/recommendation-golden-set.ts`: 35 passed, zero failed.
- `node scripts/validate-benchmark-fixtures.mjs`: passed, including all 53
  frozen-file checksums, 100 cases and 84 fixtures.
- `git diff --check`: passed.
- Backend restarted and serves on port 5000 without background-store errors.
- Focused profile/disposition tests passed; the personalization suite reports
  19 groups.
- The live signed-in journey was operated in Expo Go by the user and verified
  with backend request logs plus scoped read-only Supabase queries; the browser
  landing-page snapshot is not used as evidence for that journey.

The new migration test uses a disposable local PostgreSQL instance, never the
connected Supabase database. It checks permissive inherited defaults are
removed, real role denials, concurrent increments without lost updates, reset,
insert-ignore, prune and idempotent usage deletion. Store fixtures cover
permission/network failures, invalid counts, free admission at 20, uncapped
increment at 21, reset, memory cache and daily pruning. Deletion tests exercise
a 42501 failure at usage deletion through the normal handler and retry path.
Provider tests now stub cache writes independently of the provider fetch.

## Deviations, warnings and unverified behavior

The verification required a small app-side prerequisite fix for new email
accounts without provider name metadata; no Supabase grant or migration change
was needed. Reset now propagates failures as required by the requested
fail-closed write contract; previously it swallowed failures. Table-API pruning
uses a server-clock UTC cutoff rather than database NOW().

Existing react-test-renderer deprecation warnings remain in the suite. The
pre-existing frontend workflow reports port 8081 occupied and cannot start a
second Metro instance; it was not altered. The landing-page capture logged
one unspecified resource 404; it does not establish native app behavior.

No live quota reset or permission-failure injection was performed. Mutation
concurrency remains validated only in the isolated database, not under live
concurrent load. Other operational Postgres stores remain unchanged, so this
is not a claim that every app table has been consolidated. No publishing or
deployment occurred.
