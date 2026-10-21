# Rate-limit and lockout Supabase cutover

## Migration and scope

The approved migration was applied to the connected Amodka Supabase project as
`20261021091241_move_ratelimit_and_lockout_stores_to_supabase`. The repository
copy is
`supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql`.
It matches the applied SQL after normalizing the final newline.

The migration creates `public.ratelimit_store` and `public.lockout_store`, enables
RLS, creates four `ratelimit_*` RPCs, revokes table/function access from
`PUBLIC`, `anon`, `authenticated`, and initially from `service_role`, then grants
only server-required CRUD and RPC execution to `service_role`. It does not copy
data or drop/change the former Replit tables.

## Live metadata verification

Read-only catalog checks after application confirmed:

| Object | RLS | Policies | anon/authenticated access | service_role |
|---|---:|---:|---|---|
| `ratelimit_store` | on | 0 | no SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER | SELECT/INSERT/UPDATE/DELETE |
| `lockout_store` | on | 0 | no SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER | SELECT/INSERT/UPDATE/DELETE |
| `ratelimit_increment(text,bigint)` | n/a | n/a | no EXECUTE; no PUBLIC EXECUTE | EXECUTE |
| `ratelimit_decrement(text)` | n/a | n/a | no EXECUTE; no PUBLIC EXECUTE | EXECUTE |
| `ratelimit_delete_key(text)` | n/a | n/a | no EXECUTE; no PUBLIC EXECUTE | EXECUTE |
| `ratelimit_delete_prefix(text)` | n/a | n/a | no EXECUTE; no PUBLIC EXECUTE | EXECUTE |

The function catalog also confirms all four are SECURITY INVOKER, have an empty
`search_path`, and the installed prefix function contains both the non-empty
guard and literal `pg_catalog.starts_with` matching.

## Runtime behavior and the requested confirmations

- Existing limiter thresholds, windows, response copy, and lockout limits are
  unchanged. The server uses the existing Supabase service client, with a
  1.5-second abortable deadline and the existing in-memory fallback on store
  errors.
- **Decrement arithmetic:** yes. The SQL
  `CASE WHEN hits > 1 THEN hits - 1 ELSE 0 END` is equivalent to flooring
  `hits - 1` at zero. The `reset_time > pg_catalog.now()` predicate means an
  expired window is not decremented.
- **Pruning:** startup calls prune both stores. After success, each prune is
  scheduled hourly. Failure backs off exponentially (2, 4, then up to 8 hours);
  success restores the hourly schedule. Rate rows are deleted when
  `reset_time` has passed. Lockout rows are deleted when non-NULL epoch-ms
  `expires` has passed; NULL expiry remains non-expiring. The direct table API
  prune calls use `DELETE`, which is included in the service-role table grants.
- Prefix reset passes a literal prefix ending in `:`. SQL rejects NULL and
  empty values and uses `starts_with`, so underscores and percent signs are
  not wildcards. The TypeScript store rejects an empty prefix before it can
  call the RPC.
- No rows were copied. Rate-limit windows and lockout entries previously held
  in Replit Postgres were not transferred; those old tables remain untouched.
  The new stores started empty, so existing persisted counters/lockouts were
  reset at cutover. This is a state discontinuity, not a change to the configured
  thresholds.

## Tests and checks

- `npm test`: **120 passed, 0 failed**.
- `npm test -- rateLimiterSupabase.test.ts`: passed; covers fixed-window RPC
  semantics, active reset-time stability, decrement, key/prefix isolation,
  literal underscore matching, empty/NULL prefix no-op behavior, TypeScript
  prefix validation, 429 plus `Retry-After`, per-user isolation, lockout
  persistence/reload, timeout and memory fallback.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Recommendation Engine v3.7 golden set: **35 passed, 0 failed**.
- `node scripts/validate-benchmark-fixtures.mjs`: passed; 100 cases, 84
  fixtures, and all 53 frozen-file checksums verified.
- `git diff --check`: passed.

The tests use isolated fake Supabase clients for rate-limit and lockout
behavior. After migration, the backend restarted successfully on port 5000;
startup pruning removed 12 expired rate-limit rows, removed 0 expired lockout
rows, and loaded 0 active lockouts. This exercised the service-role table API
prune/read paths without displaying row keys. No live rate-limited application
request or account-lockout attempt was made.

## Files changed and limitations

- Server store and rate-limiter integration: `server/middleware/supabaseSecurityStore.ts`,
  `server/middleware/rateLimiter.ts`.
- Focused and isolated regression tests: `__tests__/rateLimiter.test.ts`,
  `__tests__/rateLimiterDbFallback.test.ts`, `__tests__/rateLimiterSupabase.test.ts`,
  `__tests__/accountLockout.test.ts`, `__tests__/accountDeletion.test.ts`,
  `__tests__/auth2Routes.test.ts`, `__tests__/classifyMultiItem.test.ts`.
- Applied migration: `supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql`.
- Documentation: `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`, and this report.

The running server startup was checked after the migration, but no live
rate-limited application request, account-lockout attempt, physical-device
journey, measured network latency, or deployment was performed. No
Recommendation Engine v3.7 or frozen benchmark file was modified.
**Deviations: none.**
