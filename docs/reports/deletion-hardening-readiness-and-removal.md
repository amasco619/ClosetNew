# Account-deletion hardening, readiness, and legacy-store removal

**Date:** 2026-10-21  
**Scope:** Bounded account-deletion readiness, rate-limit, operational-storage
inventory, and a proposed removal of four unused Replit development tables.
No Supabase DDL, account deletion, or Replit table drop was executed.

## Findings and implementation

- The connected Supabase project currently grants `service_role` both SELECT
  and DELETE on `public.wardrobe_free_selections`. This was verified with
  `has_table_privilege`.
- The connected project's migration history contains no grant-specific entry.
  No previously checked-in migration contained the explicit grant either,
  consistent with its earlier manual application. The exact one-statement repo
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
**Result:** _Fill after the live readiness command runs._ The script does not
print credential values. It reports per-table service-role SELECT/DELETE
results, two no-op RPC results, and publishable-key denial for the six
`billing_*` tables plus `bg_removal_usage`, `bg_removal_cache`,
`ratelimit_store`, and `lockout_store`.

The script prints read-only SQL to inspect RLS, policy counts, and effective
anon/authenticated TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN privileges. The
query is provided by the script for a human operator; it is not executed by the
script. Live SQL output: **not run as part of this code task**.

## Replit Postgres inventory

| Area | Current use |
|---|---|
| `server/` | No active `DATABASE_URL`, `pg`, `pg.Pool`, Keyv Postgres adapter, Replit Postgres connection, or runtime table DDL remains. Background-removal, rate-limit, lockout, and account-deletion operational stores use Supabase. |
| `scripts/` | No `DATABASE_URL`, `pg`, pool, Keyv adapter, Replit Postgres connection, or runtime DDL reference remains. |
| `__tests__/bgRemovalMigration.test.ts` | Uses `pg` to connect to a disposable local PostgreSQL cluster for background-removal migration tests. |
| `__tests__/profileEntitlementAcl.test.ts` | Uses `pg` with a disposable local cluster for profile entitlement ACL tests. |
| `__tests__/freeWardrobeSelectionDb.test.ts` | Uses `pg` with a disposable local cluster for free-wardrobe and deletion database tests. |
| `__tests__/billingMigration.test.ts` | Uses `pg` with a disposable local cluster for billing migration tests. |
| `__tests__/aiProcessingConsent.test.ts` | Temporarily removes and restores `DATABASE_URL` so its mounted route test exercises the no-database persistence fallback; it does not connect to that URL. |
| `__tests__/accountLockout.test.ts` | Documents that its unit test does not query a live project or `DATABASE_URL`; current persistence is fixture-based. |
| Historical reports | `docs/phase-4-report.md`, `docs/PHASE-5C-PRODUCTION-AUDIT.md`, `docs/payments-entitlements-readiness-audit.md`, `reports/account-deletion-regression.md`, and `docs/reports/bg-removal-supabase-cutover.md` describe pre-cutover states; each now has a dated supersession note. `docs/compliance/data-inventory.md` was updated to the current Supabase rate-limit/lockout stores. |
| Dependencies/configuration | Removed unused direct `keyv` and `@keyv/postgres` dependencies. Kept `pg` because the four isolated database tests import it. Kept the `postgresql-16` `.replit` module and `DATABASE_URL` secret exactly as instructed. Drizzle packages and `db:push` were not changed. |

The Replit development database currently contains all four legacy tables:
`bg_removal_cache`, `bg_removal_usage`, `ratelimit_store`, and `lockout_store`.
Only table names were queried; no rows were read or changed. No active server or
script code still uses those Replit tables. The published Replit-managed
database is separate from the development database; it was not queried or
changed. The published app's Supabase target is separately controlled by its
Supabase environment and was not altered here.

## Development-only DROP statements — approval required

These statements are shown for review and **have not been executed**. They
target the four tables verified in the Replit development database only. They
do not use `CASCADE` and will fail rather than remove dependent objects.

```sql
DROP TABLE public.bg_removal_usage;
DROP TABLE public.bg_removal_cache;
DROP TABLE public.ratelimit_store;
DROP TABLE public.lockout_store;
```

No table drop or other destructive database operation may run until the user
explicitly approves these exact statements. After approval, verify all four
relations are absent and restart the backend; confirm startup and that current
Supabase rate-limit and background-removal stores still initialize. Do not
remove the `.replit` PostgreSQL module or `DATABASE_URL` secret.

## Validation and limits

- Focused rate-limit/deletion tests: _fill after execution._
- Full test suite, TypeScript, lint, frozen benchmark/golden checks: _fill after execution._
- Live Supabase readiness API probe: _fill after execution._
- Manual Supabase metadata SQL: not run by this code task.
- No complete deletion of a disposable published account, no object deletion
  from either bucket, and no RevenueCat tombstone path was exercised.
- Staging grant state was unavailable for verification.
- `npm uninstall` reported dependency advisories; no broad audit or remediation
  was performed.

**Protected areas unchanged:** Recommendation Engine v3.7, frozen benchmark
files, Phase A schema/security, existing RLS policies, existing CRUD grants,
billing logic, consent enforcement, production data, and published deployment.
