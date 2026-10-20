# Background-removal Supabase cutover

## Applied SQL and live verification

Approved SQL was applied through the Supabase migration tool as
`20261020231945_move_bg_removal_store_to_supabase`. The identical SQL is saved
in `supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql`;
comparison with both the approved script and stored migration history passed.
No rows were copied. Both tables were confirmed empty through the existing
server client's read-only table API. The old Replit tables were not changed
or dropped, and no secret or dependency was added.

Live metadata confirms:

| Object | RLS / policies | Client access | service_role access |
|---|---|---|---|
| bg_removal_cache | Enabled / zero | No anon/authenticated privileges | SELECT, INSERT, DELETE |
| bg_removal_usage | Enabled / zero | No anon/authenticated privileges | SELECT, INSERT, UPDATE, DELETE |
| bg_removal_increment_usage(uuid) | SECURITY INVOKER, empty search_path | No anon/authenticated EXECUTE | EXECUTE |
| bg_removal_reset_usage(uuid) | SECURITY INVOKER, empty search_path | No anon/authenticated EXECUTE | EXECUTE |

CRUD grants, RLS settings and policy definitions on the 19 previously existing
public tables matched the pre-change snapshot.

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
- `TECHNICAL.md`
- `AMODKA-PROJECT-STATUS.md`
- This report

## Checks run

- Focused quota/cache/migration/deletion/provider tests: 4 test files passed.
- `npm test`: 119 test files passed, zero failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed, no lint warnings.
- `tsx __tests__/recommendation-golden-set.ts`: 35 passed, zero failed.
- `node scripts/validate-benchmark-fixtures.mjs`: passed, including all 53
  frozen-file checksums, 100 cases and 84 fixtures.
- `git diff --check`: passed.
- Backend restarted and serves on port 5000 without background-store errors.
- Browser snapshot renders the Expo phone-preview landing page, not a
  signed-in native journey.

The new migration test uses a disposable local PostgreSQL instance, never the
connected Supabase database. It checks permissive inherited defaults are
removed, real role denials, concurrent increments without lost updates, reset,
insert-ignore, prune and idempotent usage deletion. Store fixtures cover
permission/network failures, invalid counts, free admission at 20, uncapped
increment at 21, reset, memory cache and daily pruning. Deletion tests exercise
a 42501 failure at usage deletion through the normal handler and retry path.
Provider tests now stub cache writes independently of the provider fetch.

## Deviations, warnings and unverified behavior

No scope deviation. Reset now propagates failures as required by the requested
fail-closed write contract; previously it swallowed failures. Table-API pruning
uses a server-clock UTC cutoff rather than database NOW().

Existing react-test-renderer deprecation warnings remain in the suite. The
pre-existing frontend workflow reports port 8081 occupied and cannot start a
second Metro instance; it was not altered. The landing-page capture logged
one unspecified resource 404; it does not establish native app behavior.

No live provider call, live quota write/reset, live account deletion or
physical-device journey was performed. Mutation/concurrency behavior was
validated only in the isolated database, not against Supabase. Other
operational Postgres stores remain unchanged, so this is not a claim that
every app table has been consolidated. No publishing or deployment occurred.
