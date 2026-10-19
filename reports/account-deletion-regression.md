# Account-deletion regression — diagnosis and bounded code correction

## Outcome

**Known permission blocker repaired; end-to-end live deletion remains unverified.**
Code corrections and regression checks pass. Following explicit user approval,
SELECT and DELETE were granted on `public.wardrobe_free_selections` to
`service_role` only. A subsequent live metadata query returned
`can_select: true` and `can_delete: true`. No live user was deleted. Schema,
RLS policies, billing logic and consent enforcement were not changed.
No publication/deployment occurred.

## Evidence before editing

Current backend workflow logs, captured on 2026-10-19, contain five
`DELETE /api/user/delete-account` responses with HTTP 500. Each has:

- operation: `account_deletion_table_wardrobe_free_selections`
- category/code: `external_dependency` / `EXTERNAL_DEPENDENCY_ERROR`
- dependency: `supabase`, retryable: true

These are followed by one HTTP 429. The old logs do not retain the upstream
Postgres error code, owner identity, or success records for each preceding step.
Thus the failed step for the observed app attempts is confirmed, but their
association with a particular test account cannot be established from these
privacy-preserving logs. I did not assume an account identity or delete an
existing user's account to reproduce it.

Read-only live Supabase metadata queries verified:

1. `service_role` has **neither SELECT nor DELETE** on
   `public.wardrobe_free_selections`. Every other inventoried Supabase deletion
   table has both privileges. RLS bypass alone does not grant table privileges.
2. There is **no Supabase `bg_removal_usage` table**.
3. All current public user-keyed tables/FKs are inventoried. Child-before-parent
   deletion order matches current FKs. `wardrobe_free_selections` references both
   `user_profiles` and `(user_id, id)` in `wardrobe_items`, with cascading deletes.
4. The six billing tables follow the existing retained/quarantined billing policy,
   rather than being directly deleted.

Read-only Replit Postgres metadata queries verified `bg_removal_usage`,
`bg_removal_cache`, `lockout_store`, and `ratelimit_store` exist; only the first
has a `user_id` column. No account rows or objects were inspected or mutated.
`REVENUECAT_BILLING_ENABLED` is unset in the inspected workspace environment,
so the existing billing predicate is false here; published environment not checked.

### Step-by-step disposition

| Step | Observed evidence / failure semantics |
|---|---|
| Billing tombstone | Disabled in inspected workspace. When enabled, existing idempotent RPC must succeed before any cleanup. Injected failure blocks everything afterwards. |
| `wardrobe-images`: list/remove/verify | Awaited before table deletes. Owner-prefix flat listing includes migration paths `<owner>/<item>.jpg` and `.png` without extension filtering. Pages of 100 are collected **before** deletion; removals are batched by 100; final list verifies empty. No total-page cap. Folder entries, provider errors or remaining objects block deletion. Historical successes are inferred from awaited control flow, not separately logged. |
| `tryon-photos`: list/remove/verify | Same ordering, pagination and fail-closed behavior as wardrobe images. No live individual bucket contents inspected. |
| `affinity_signals` | Precedes observed failing step; checked errors block Auth. |
| `pair_affinity_signals` | Same. |
| `rotation_cursors` | Same. |
| `wear_logs` | Same. |
| `slot_statuses` | Same. |
| `tryon_profiles` | Same. |
| `saved_looks` | Same. |
| `garment_group_members` | Same; precedes group/item parents. |
| `garment_groups` | Same. |
| `wardrobe_free_selections` | **Observed failure** in five app requests; verified missing service-role privileges. No skipping or permission bypass added. |
| `wardrobe_items` | Not reached in those failed requests. Existing checked deletion retained. |
| `bg_removal_usage` | Not reached. Independently found wrong-database defect; now routed to Replit Postgres. Missing pool/table or connection/DELETE failure stops Auth deletion. Zero rows succeeds. |
| `user_profiles` | Not reached. Existing checked deletion retained. |
| Auth user | Not reached in those 500s; intentionally remains until owned-data cleanup succeeds. |

New step logs contain only operation name, ok/fail and application status (200 or
500), plus a fixed record type. These are **not claimed upstream HTTP statuses**.
Failures still produce the existing sanitised observability code. No email,
owner ID, object name, key, token or provider message is added to logs. Revised
steps were exercised with fixtures, not a destructive live-account reproduction.

## Root causes and correction

### Live permissions — repaired after approval

`server/accountDeletionInventory.ts:16` requests deletion of
`wardrobe_free_selections`; `server/routes.ts:149` executes the checked inventory.
The selected Supabase project lacks the necessary privileges. The creation
migration `20260928000000_free_wardrobe_selection.sql` grants authenticated reads,
but does not grant service-role reads/deletes.

The approved operational correction applied was:

```sql
GRANT SELECT, DELETE ON TABLE public.wardrobe_free_selections TO service_role;
```

**Executed after explicit approval.** A subsequent live privilege query confirmed
both privileges are now true for `service_role`. This adds no client privileges
and changes no RLS policies or schema. No table has been removed from deletion
to conceal the failure. No migration was added.

### Wrong-database deletion — corrected in code

`server/accountDeletionInventory.ts:18` now identifies the usage table as Replit
Postgres data. Previously every inventory entry was sent to Supabase.
`server/bgRemovalStore.ts:212` performs a parameterised owner-keyed DELETE using
the existing pool; `server/routes.ts:149` routes that single entry accordingly.
All other table ordering and error semantics stay checked/fail-closed.
Quota reads, increments and resets are unchanged. `bg_removal_cache` is untouched.

### Client failure classification — corrected in code

| Failure | Previous behavior | Current behavior |
|---|---|---|
| HTTP 429 | Generic deletion-not-confirmed with support suggestion | “Please try again in a little while.” |
| HTTP 5xx, including partial cleanup | Same generic warning | “Deletion incomplete”; some data may already have been removed; retry. |
| HTTP 401 | Generic warning | Sign in again before retrying deletion. |
| Timeout/network/other unconfirmed response | Generic warning | “Deletion not confirmed”; check connection and retry; no claim of rollback. |
| Successful HTTP response without `success: true`, malformed JSON | Generic warning | Unconfirmed-deletion message; no local wipe. |
| Local cleanup throws **after** confirmed server deletion | Could misleadingly say server deletion was not confirmed | Return incomplete-device-cleanup result; still attempt sign-out. |
| Migration journal removal throws | Aborted remaining context cleanup | Record incomplete local cleanup, continue remaining cache/state cleanup. |
| Local file/AsyncStorage cleanup fails | Local cleanup failure result | Existing all-settled behavior retained; separate device-cleanup warning. |
| Sign-out fails after confirmed deletion | Separate device-cleanup warning | Retained; no false return to a protected account. |

Server cleanup is not transactional. Retrying an existing partially deleted
account repeats safe empty-row/empty-object operations. Billing remains quarantined
if its earlier tombstone succeeded. A timeout does not imply server cancellation.
If Auth deletion completed but the response was lost, a later authenticated retry
may receive 401; the client does not infer success from that 401.

### Rate limit

The unchanged `accountLimiter` is 5 requests/IP per fixed 60-minute window, shared
by in-app deletion and OTP-confirm deletion. SQL increments preserve the initial
reset time while the window is active; further attempts do not extend it. The
next request after expiry starts a new window. It uses persistent
`ratelimit_store`, with existing in-memory fallback on connection failure.
Rejected/failed requests count too, including unauthenticated requests because the
limiter precedes authentication. AI-preference calls have their separate limiter.
The observed 429 proves exhaustion occurred; logs cannot establish whether all
hits came from the same person behind a shared IP. No counters were reset.

### Migration and deletion inventory

Guest transfer inserts normal owner-scoped wardrobe rows through the existing
batch insertion RPC; free selections are normal dependent rows. There is no new
server migration-journal table. Its journal is owner-bound local storage and its
managed source files are handled by local cleanup. Migration uploads use the
same flat owner prefixes already covered by Storage cleanup.

No missing table or FK-ordering defect was found in live public metadata or
checked-in SQL/server table creation. The full direct-delete table list is in
TECHNICAL.md §26. Billing retention and shared operational/cache policies are
unchanged. This is an inventory check, not a claim of row-by-row live deletion.

## Tests and checks actually run

- `npm test`: **114 test files passed, 0 failed**, including the focused deletion
  files and existing billing regression tests. Re-run after final code/test edits.
- `__tests__/accountDeletion.test.ts`: existing authentication, owner checks,
  bucket pagination (205 objects), no-op removal detection, both app/web routes;
  now includes billing tombstone failure, each Storage list/remove/verify failure,
  each table including usage, Auth failure, and successful one-shot-failure retry
  at **every** stage. Stateful table fixtures assert all owned tables cleared
  before Auth; quota cleanup must not use the Supabase table API.
- Same file tests real usage-helper SQL with a disconnected stub pool:
  parameterised owner ID, zero-row retries, absent connection, missing-table and
  connection exceptions. These are fixture tests, not live database deletes.
- Same file exercises unchanged real rate-limit middleware: sixth same-IP
  request returns 429 with Retry-After and never starts deletion. Random test IPs
  isolate persistent limiter counters from actual device attempts.
- `__tests__/accountDeletionLocalCleanup.test.ts`: confirmed deletion/local cleanup,
  server failure preserving data, cleanup exception after server success,
  file cleanup failure, 429/500/401/timeout/network messages.
- `npm run typecheck`: **passed**.
- `npm run lint`: **passed**.
- `npx tsx __tests__/recommendation-golden-set.ts`: **35 passed, 0 failed**.
- `node scripts/validate-benchmark-fixtures.mjs`: **passed**, 100 cases and
  all 53 frozen-file checksums. No protected source was subsequently edited.
- `git diff --check`: **passed**, including documentation additions.
- Backend workflow restarted after code changes; startup logs confirm port 5000
  serving cleanly and background-removal tables ready.
- Preview screenshot: Amodka Expo QR landing page renders. Browser reports one
  unspecified resource 404; this is not a signed-in account-deletion check.

Non-failing suite output includes existing React test-renderer deprecation
warnings and deliberate fault-injection logs. Unrelated mockup-sandbox workflow
already fails because port 23636 is occupied; it was not changed/restarted.

## Files changed

- `server/accountDeletionInventory.ts` — retain complete inventory, mark correct usage store.
- `server/bgRemovalStore.ts` — fail-closed owner-keyed usage deletion only.
- `server/routes.ts` — usage-store routing and sanitised per-step observations;
  remove unnecessary support escalation from retryable web failure copy.
- `constants/accountDeletionCleanup.ts` — failure-copy mapping and separate local-cleanup result.
- `app/(tabs)/profile.tsx` — use failure-copy mapping; layout unchanged.
- `contexts/AppContext.tsx` — journal failure no longer aborts remaining local cleanup.
- `__tests__/accountDeletion.test.ts`, `__tests__/accountDeletionLocalCleanup.test.ts`.
- `TECHNICAL.md`, this report; project memory notes the live permission prerequisite.

## Deviations and unverified behavior

- The precise service-role permission repair above was approved, applied and
  verified through live metadata. No schema/RLS migration was created.
- No destructive attempt against the user's existing test account was made.
  Its exact ID/current remaining rows and Storage contents were not inspected.
  The logged failed step is known, but account attribution is not.
- The read-only Replit SQL tool automatically added a PostgreSQL module entry
  to `.replit`; that incidental configuration change was removed. No dependency
  or configuration change is retained.
- No physical Android/iOS deletion, screen-reader journey or signed-in browser
  deletion was performed. Fixture coverage and a verified permission repair
  must not be presented as evidence of successful live account deletion.
- Remaining live check, requiring separate approval to delete a test account:
  use an explicitly disposable account with migrated garments and both bucket paths, delete it,
  verify absence of owned rows/objects and Auth identity, and verify sign-in
  return plus device cleanup. Existing exhausted-IP windows must expire normally.
- Concurrent new uploads during deletion and lost-response-after-Auth-delete
  recovery are not newly guaranteed by this bounded patch.
