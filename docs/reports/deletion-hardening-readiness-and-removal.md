# Account-deletion hardening, readiness, and legacy-store removal

**Date:** 2026-10-21

**Scope:** Bounded account-deletion readiness, rate-limit, operational-storage
inventory, and the approved removal of four unused Replit development tables.
No Supabase DDL or account deletion was executed. Only the four explicitly
approved Replit development table drops were executed.

## Findings and implementation

- The connected Supabase project currently grants `service_role` both SELECT
  and DELETE on `public.wardrobe_free_selections`. This was verified with
  `has_table_privilege`.
- The recorded migration SQL contains only
  `GRANT SELECT ON TABLE public.wardrobe_free_selections TO authenticated;`
  (recorded version `20260928172333`), not the service-role grant. No previously
  checked-in migration contained the explicit grant either, consistent with its
  earlier manual application. The exact one-statement repo
  mirror is `supabase/migrations/20261021115252_grant_service_role_wardrobe_free_selections.sql`.
  It is intentionally **unapplied**; staging could not be inspected. This grant
  must exist on each Supabase project (staging and production), and all live
  DDL must be mirrored by a repository migration file.
- Authenticated app deletion now has a 60-per-hour IP limit before
  `requireAuth`, followed by a 5-per-hour fixed-window limit keyed by the
  authenticated user. The existing `rate_limit` 429 response and
  `Retry-After` header are shared by both. The OTP-confirm route retains its
  existing 5-per-IP/hour `accountLimiter`.
- Account-deletion error telemetry now labels `bg_removal_usage` as Supabase,
  matching the current store. The account-deletion table order and delete
  semantics are unchanged.
- `scripts/check-deletion-readiness.mjs` performs safe API-level probes using
  the existing Supabase URL, service key, and publishable key. It dynamically
  reads the authoritative owner-table list from
  `server/accountDeletionInventory.ts`; emits the required manual metadata SQL;
  and exits nonzero for errors or inconclusive access results.

## Readiness probes

**Command:** `node scripts/check-deletion-readiness.mjs`

**Result:** **41 passed, 0 failed; exit 0.** This includes inventory parsing,
28 service-role SELECT/zero-row DELETE probes across 14 tables, two no-op RPCs,
and denied publishable-key SELECTs on all ten server-only tables. No credential
values were printed and every DELETE affected zero rows.

The script prints read-only SQL to inspect RLS, policy counts, and effective
anon/authenticated TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN privileges. The
query is provided by the script for a human operator; it is not executed by the
script. Live SQL output: **not run as part of this code task**.

The manual query printed by the script is:

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*)::integer
     FROM pg_catalog.pg_policies p
    WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policy_count,
  has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_truncate,
  has_table_privilege('anon', c.oid, 'REFERENCES') AS anon_references,
  has_table_privilege('anon', c.oid, 'TRIGGER') AS anon_trigger,
  has_table_privilege('anon', c.oid, 'MAINTAIN') AS anon_maintain,
  has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS authenticated_truncate,
  has_table_privilege('authenticated', c.oid, 'REFERENCES') AS authenticated_references,
  has_table_privilege('authenticated', c.oid, 'TRIGGER') AS authenticated_trigger,
  has_table_privilege('authenticated', c.oid, 'MAINTAIN') AS authenticated_maintain
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
```

## Replit Postgres inventory

| Area | Current use |
|---|---|
| `server/` | No active `DATABASE_URL`, `pg`, `pg.Pool`, Keyv Postgres adapter, Replit Postgres connection, or runtime table DDL remains. Background-removal, rate-limit, lockout, and account-deletion operational stores use Supabase. |
| `scripts/` | No `DATABASE_URL`, `pg`, pool, Keyv adapter, Replit Postgres connection, or runtime DDL reference remains. |
| `__tests__/bgRemovalMigration.test.ts` | Uses `pg` to connect to a disposable local PostgreSQL cluster for background-removal migration tests. |
| `__tests__/profileEntitlementAcl.test.ts` | Uses `pg` with a disposable local cluster for profile entitlement ACL tests. |
| `__tests__/freeWardrobeSelectionDb.test.ts` | Uses `pg` with a disposable local cluster for free-wardrobe and deletion database tests. |
| `__tests__/billingMigration.test.ts` | Uses `pg` with a disposable local cluster for billing migration tests. |
| `__tests__/aiProcessingConsent.test.ts` | Removed obsolete `DATABASE_URL` removal/restoration, which no longer isolated Supabase persistence. The test now injects a fake Supabase counter client; consent logic is unchanged. |
| `__tests__/accountLockout.test.ts` | Documents that its unit test does not query a live project or `DATABASE_URL`; current persistence is fixture-based. |
| Historical reports | `docs/phase-4-report.md`, `docs/PHASE-5C-PRODUCTION-AUDIT.md`, `docs/payments-entitlements-readiness-audit.md`, `reports/account-deletion-regression.md`, and `docs/reports/bg-removal-supabase-cutover.md` describe pre-cutover states; each now has a dated supersession note. `docs/compliance/data-inventory.md` was updated to the current Supabase rate-limit/lockout stores. |
| Dependencies/configuration | Removed unused direct `keyv` and `@keyv/postgres` dependencies. Kept `pg` because the four isolated database tests import it. Their `initdb`/`pg_ctl` commands resolve to the configured PostgreSQL 16 binaries. Kept the `postgresql-16` `.replit` module and `DATABASE_URL` secret exactly as instructed. Drizzle packages and `db:push` remain in `package.json` without source imports/configuration found; they were not changed, leaving that separate tooling decision to the user. |

The pre-drop read-only inventory found all four legacy tables in the Replit
development database (all were subsequently removed as verified below):
`bg_removal_cache`, `bg_removal_usage`, `ratelimit_store`, and `lockout_store`.
Only table names were queried; no rows were read or changed. No active server or
script code still uses those Replit tables. The published Replit-managed
database is separate from the development database; it was not queried or
changed. The published app's Supabase target is separately controlled by its
Supabase environment and was not altered here.

## Development-only DROP statements — approved and executed

After explicit chat approval, exactly these statements were executed with
`executeSql`, target `replit_database`, environment `development`. They
targeted the four tables verified in the Replit development database only. They
permanently remove their old cache, usage, rate-limit, and lockout rows. No rows
will be copied. They do not use `CASCADE` and will fail rather than remove
dependent objects.

```sql
DROP TABLE public.bg_removal_usage;
DROP TABLE public.bg_removal_cache;
DROP TABLE public.ratelimit_store;
DROP TABLE public.lockout_store;
```

The operation returned four `DROP TABLE` results and exit code 0.
Post-drop verification used:

```sql
SELECT
  to_regclass('public.bg_removal_usage') AS bg_removal_usage,
  to_regclass('public.bg_removal_cache') AS bg_removal_cache,
  to_regclass('public.ratelimit_store') AS ratelimit_store,
  to_regclass('public.lockout_store') AS lockout_store;
```

All four results were NULL: all four relations are absent.
`Start Backend` was then restarted successfully on port 5000. Logs recorded
zero expired lockouts pruned, zero active lockouts loaded from Supabase, and
the Supabase rate-limit store ready with two expired rows pruned. Startup
awaits `initBgRemovalStore` before listening; it completed with no
`[bgRemovalStore] prune failed` error. Zero-row successful background-removal
prunes are intentionally silent. This verifies startup, not a PhotoRoom
request, quota increment, or a complete upload journey.

The `.replit` PostgreSQL module, `DATABASE_URL` secret, and published database
were not changed or queried.

## Validation and limits

| Command/check | Actual result |
|---|---|
| `npm test -- accountDeletionRateLimit.test.ts accountDeletion.test.ts` | 2 test files passed |
| Final `npm test` | 121 test files passed, 0 failed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings reported |
| `node --check scripts/check-deletion-readiness.mjs` | Passed |
| `node scripts/check-deletion-readiness.mjs` | 41 passed, 0 failed |
| `NODE_ENV=test node_modules/.bin/tsx __tests__/recommendation-golden-set.ts` | 35 passed, 0 failed |
| `node scripts/validate-benchmark-fixtures.mjs` | Passed: 100 cases, 84 fixtures, all 53 frozen-file checksums |
| Backend restart | Passed on port 5000; Supabase rate-limit/lockout initialization succeeded |

The new limiter test covers actual middleware with controlled Supabase RPC
fixtures: same-IP user isolation, sixth-attempt blocking, fixed-window
Retry-After, failed-attempt counting, and the 60/hour shared IP ceiling. The
existing deletion test still injects failures at all cleanup stages. The
deletion tests now fail fast outside test mode. The final full suite includes
the corrected consent-test persistence fixture.

- Manual Supabase metadata SQL: not run by this code task.
- No complete deletion of a disposable published account, no object deletion
  from either bucket, and no RevenueCat tombstone path was exercised.
- Staging grant state was unavailable for verification.
- `npm uninstall` reported 55 unreviewed dependency advisories (1 low, 19
  moderate, 33 high, 2 critical); no broad audit or remediation was performed.
- The backend's Expo landing page rendered in preview; that does not verify the
  native app. The frontend and mockup workflows remain failed and were not
  repaired as part of this bounded backend task. A preview resource returned
  404; no native journey or physical-device test was performed.

## Files changed

- Runtime: `server/middleware/rateLimiter.ts`, `server/routes.ts`.
- Tests: `__tests__/accountDeletionRateLimit.test.ts`,
  `__tests__/accountDeletion.test.ts`, `__tests__/aiProcessingConsent.test.ts`.
- Tooling: `scripts/check-deletion-readiness.mjs`, `package.json`,
  `package-lock.json`.
- Unapplied migration:
  `supabase/migrations/20261021115252_grant_service_role_wardrobe_free_selections.sql`.
- Current docs: `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`,
  `docs/release-checklist-deletion.md`, this report,
  `docs/compliance/data-inventory.md`.
- Historical clarification notes: `docs/phase-4-report.md`,
  `docs/PHASE-5C-PRODUCTION-AUDIT.md`,
  `docs/payments-entitlements-readiness-audit.md`,
  `reports/account-deletion-regression.md`,
  `docs/reports/bg-removal-supabase-cutover.md`.
- Agent guidance correction:
  `.agents/memory/persistent-rate-limiter-tests.md`.

## Deviations

Two initial focused tests were invoked directly without `NODE_ENV=test`.
Their guarded fixture overrides were inactive, causing short-lived synthetic
rate-limit increments in connected Supabase. They failed before any actual
account deletion. The existing consent test's obsolete `DATABASE_URL`
isolation also did not isolate the new Supabase store; its fixture is now
corrected. Synthetic counters expire under the unchanged store policy; no
manual cleanup was performed. All final tests used the repository runner.

No customer account, wardrobe, consent, or billing data was deleted or modified.
Readiness DELETE probes affected zero rows. The four development DROP statements
were subsequently approved and executed, and post-drop absence and backend
startup were verified as documented above. There was no runtime Replit pool/DDL left to remove;
only unused direct Keyv dependencies and stale test/docs references needed
cleanup.

**Protected areas unchanged:** Recommendation Engine v3.7, frozen benchmark
files, Phase A schema/security, existing RLS policies, existing CRUD grants,
billing logic, consent enforcement, the existing limiter memory-fallback
implementation, `.replit`, secret configuration, and published deployment.
