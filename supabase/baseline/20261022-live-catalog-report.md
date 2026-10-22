# Amodka schema baseline — capture, generated SQL and local replay

## Current revision: hosted Supabase sectioning

**This section supersedes the original single-transaction procedure and local results below.**
The original snapshot/provenance is unchanged. No hosted connection, SQL query, migration,
credential access, purchase, or deployment was used for this revision.

### Generated files and execution order

`scripts/generate-supabase-baseline.py` deterministically writes both `baseline.sql` and
`operator-only.sql`; `--check` verifies both files. Neither SQL header contains a project ref.
The manifest retains its original provenance.

`baseline.sql` contains these independently selectable sections, in order:

| Section | Contents / prerequisite |
|---|---|
| `01-tables` | Empty-public-table guard, non-managed extension setup, 23 tables/163 columns, identity sequences, ownership. RLS enabled and all captured client/server-role table/sequence grants revoked before commit. |
| `02-functions` | Full 24 public function definitions/ownership, after tables. PUBLIC/anon/authenticated/service_role EXECUTE revoked before commit. |
| `03-constraints` | Primary/unique/check constraints, standalone indexes, then foreign keys. Requires tables and functions; the semantic check depends on its function. |
| `04-policies` | Final public RLS flags, 68 public policies and seven public table triggers. Requires preceding sections. |
| `05-acls` | Captured public table, column, function and sequence grants; **postgres-only** creator defaults. Requires the complete public schema above. |
| `06-storage` | **HOSTED PERMISSIONS UNVERIFIED** standalone section: two bucket upserts and 15 storage.objects policies. Requires platform Storage schema/functions/columns. No platform schema/object ACL changes. |

Each section has its own `BEGIN`, `SET LOCAL` and `COMMIT`. Run on a fresh connection
with `ON_ERROR_STOP=1`; do not wrap the file in another transaction or use `psql -1`.
Example extraction for a separately reviewed, authorised future execution:

```sh
python3 scripts/generate-supabase-baseline.py --section 01-tables > /tmp/amodka-01-tables.sql
# Review the extracted file and independently verify the intended EMPTY DEV target first.
# Future operator command only; not executed in this task:
psql 'service=amodka_dev' -X -v ON_ERROR_STOP=1 -f /tmp/amodka-01-tables.sql
```

Repeat in numeric order using the corresponding section name. Do not select operator
sections as part of routine bootstrap. `06-storage` can be reviewed/applied independently
only after its hosted permissions are established. There is no claim here that hosted
postgres can perform its bucket upserts or create its policies.

**Atomicity boundary:** a failed section rolls back completely, but earlier committed
sections remain. Independent transactions cannot also provide whole-project rollback.
Do not connect/release the app or admit users until all required sections and verification
have succeeded. Explicit table/sequence/function grants to the four captured principals
are absent through section 04 in the local checks; inherited/effective hosted privileges
remain unverified. Section 05 restores the intended ACLs. After any
failure, inspect the result and resume the failed section only—do not blindly rerun the
full file (the first section rejects existing public tables). These are bootstrap
sections, not routine update/replay scripts.

### Manual/operator-only separation

`operator-only.sql` is **optional historical snapshot restoration**, not a requirement
to overwrite a new project's platform defaults. Its header requires explicit approval
and Supabase-authorised authority over each relevant owner/role. Broad captured grants
are preserved as evidence, not recommended new defaults.

| Operator section | Statements removed from ordinary baseline |
|---|---|
| `operator-01-admin-defaults` | All ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" revokes/grants, including dynamically guarded MAINTAIN. Postgres creator defaults remain in baseline. |
| `operator-02-public-schema-acls` | Public-schema REVOKE/GRANT statements; snapshot grantor is pg_database_owner and hosted authority has not been proven. |
| `operator-03-storage-acls` | All REVOKE/GRANT on SCHEMA storage and TABLE storage.objects. |
| `operator-04-event-trigger` | CREATE EVENT TRIGGER ensure_rls and ALTER EVENT TRIGGER OWNER TO postgres. Hosted event-trigger authority is not proven. The function definition remains in the public-functions section. |

Moving the public-schema ACLs and event-trigger DDL too is a conservative extension of
the same permission separation: neither should block the ordinary bootstrap based on
an unverified hosted-role assumption. Managed event/storage triggers and Vault remain
omitted, as before.

### Re-run results and fingerprint changes

Run locally:

```sh
python3 scripts/generate-supabase-baseline.py
python3 scripts/generate-supabase-baseline.py --check
python3 scripts/test-supabase-baseline.py
```

The current toolchain provides **PostgreSQL 17.6**, matching the captured server version.
`20261022-local-parity-result.json` now distinguishes baseline-only fingerprints from
an additional **local-superuser-only** operator-file verification.

- Baseline only: **17 exact / 7 explained / 0 unexplained** classes.
- Including operator file locally: **21 exact / 3 explained / 0 unexplained** classes.
- All six baseline sections apply independently and pass injected-division-by-zero
  rollback tests; all 24 catalog fingerprints remain unchanged after each failed attempt.
- Fail-closed table/sequence/function boundaries before ACL restoration pass.
- `--section` extraction, non-empty-target refusal and both generated-file checks pass.
- Temporary cluster stopped and removed. No customer data; minimal local Auth/Storage stubs only.

| Baseline-only non-exact class | Local / captured | Explanation |
|---|---:|---|
| public_default_acl | 16 / 64 | Only captured postgres defaults installed; 48 supabase_admin default entries intentionally left to the platform/operator. |
| public_schema_acl | 1 / 4 | PostgreSQL's local PUBLIC USAGE remains; three explicit named-role grants moved to operator file. No live hosted defaults inferred. |
| storage_schema_acl | 0 / 3 | Local stub has no named-role grants; platform schema ACL restoration moved to operator file. |
| storage_objects_acl | 0 / 16 | Local stub has no captured-principal grants; platform object ACL restoration moved to operator file. |
| event_triggers | 0 / 7 | ensure_rls moved to operator file; six platform-managed triggers still omitted. |
| extensions | 4 / 5 | Vault remains platform-managed/omitted. All remaining versions now match on PG17.6. |
| storage_objects_triggers | 0 / 2 | Both managed Storage triggers remain deliberately omitted. |

Compared with the prior PG16 monolithic replay: public table ACLs are now exactly
177/177 rather than 160/177 because PG17 supports MAINTAIN; postgres defaults include
all 16 entries rather than omitting its two MAINTAIN entries. pg_stat_statements now
matches live 1.11 instead of local PG16's 1.10. The other changed raw hashes/counts
come from the explicitly listed operator separation. The JSON includes every missing
catalog row and raw fingerprint; unexpected differences still fail the test.

### Statements NOT verified on hosted Supabase

**No SQL statement was executed or permission-tested on hosted Supabase.** Specifically:

1. The complete `operator-01-admin-defaults` section requires authority for
   supabase_admin; ordinary postgres is not assumed able to alter it.
2. Public-schema and Storage-schema ACL statements require owner/grant authority;
   storage.objects ACL statements require its owner's/grant authority.
3. The two `INSERT ... ON CONFLICT DO UPDATE` bucket statements and all 15
   `CREATE POLICY ... ON storage.objects` statements need hosted permission and Storage
   schema-version verification. They are isolated in `06-storage`.
4. `CREATE EVENT TRIGGER ensure_rls` and its owner change need superuser or equivalent
   platform-authorised capability; moved to the operator file.
5. Extension/schema creation (`extensions`, pg_stat_statements, pgcrypto, uuid-ossp),
   public object ownership/DDL/ACL statements, and postgres creator defaults have only
   been tested with a disposable local superuser—not a hosted postgres session.

Real hosted platform defaults, Auth/Storage behaviour, effective role membership
permissions and device behaviour remain unverified. The manual Auth checklist in the
original capture below still applies; no settings were changed.

**Files changed in this revision:** generator, local test script, both generated SQL
files, local parity-result JSON, and this baseline report. No application, migrations,
frozen artifacts, billing/consent implementation, environment configuration or other
files changed.

**Deviations:** no live or unrelated work. Per-section atomicity—not impossible
cross-section all-or-nothing rollback—is provided and explicitly documented. Public
schema ACL and event-trigger statements were also conservatively moved operator-side.

## Original capture and previous single-transaction replay (historical)

**Captured:** 2026-10-22
**Connected project ref:** `garppyocfgdamdgfyfbr` (the Development/Production label was not established)
**Database:** 17.6
**Snapshot artifact timestamp:** `2026-10-22T14:18:48Z`, from the original file's filesystem mtime. The exact catalog-query timestamp was not recorded and cannot be recovered from this snapshot. This is not a new live capture.

## Scope and safety

The original capture was catalog-only. No customer records, auth-user rows, storage object data, or secret values were read. No live SQL mutation, migration, permission change, or other live mutation was executed. The JSON manifest remains a reference snapshot. A deterministic generator now produces `baseline.sql` for an **empty, Supabase-initialized non-production project**, with the platform prerequisites and permission limits below. It does not recreate Supabase-managed Auth/Storage relation definitions or service implementations.

An initial combined catalog request was blocked by the connector. Per the approved approach, I moved to separate, narrow catalog reads; all requested narrow classes completed. One first attempt to sort the storage ACL query failed because a collation was applied to an OID; the corrected narrow query succeeded. **No final catalog class is blocked or only partially captured** within the requested scope.

## Live object counts and stable fingerprints

The SQL file contains the exact read-only query shape used for each class; run each SELECT independently. MD5 is a drift checksum, not a cryptographic signature.

| Class | Count | MD5 |
|---|---:|---|
| auth_users_triggers | 0 | `d751713988987e9331980363e24189ce` |
| event_triggers | 7 | `56994d19618fc789f5c46cb07cc6fd18` |
| extensions | 5 | `2845b261f5cffdb8733da4f6f30af401` |
| public_column_acl | 28 | `eb8571532c41cde47d0845bb3bc05923` |
| public_columns | 163 | `167d679d270108cbbba3b086c501302c` |
| public_constraints | 69 | `2e55c8e60adecc11c642b2d923a5c454` |
| public_default_acl | 64 | `8510ffb3d156d847b1423e4e86b27935` |
| public_function_acl | 21 | `4ae767080a9e2dd1e11682326eab86f9` |
| public_function_definitions | 24 | `493bd24c4bd462d455522f9355f6f0f7` |
| public_indexes | 37 | `b9188356fc7a373250fb381350c3cf69` |
| public_policies | 68 | `35dfe694049a3fffa540e8571a61c072` |
| public_rls_flags | 23 | `f93da09ff6c2378c3aa265e5b4c3b213` |
| public_schema_acl | 4 | `56d6f2198e77ecebc92c60796cffea6a` |
| public_sequence_acl | 4 | `f9237e2da111fdb6b1680faec6bbd693` |
| public_sequences | 2 | `c53f64e20e53bdf6570a4ebc48505371` |
| public_table_acl | 177 | `3f1b49a72bd84c3b70a74eee9bd44356` |
| public_tables | 23 | `7441d4c4ff738f13edcfd352d7cbfbe2` |
| public_triggers | 7 | `3b5a860709f99a2c25c71020d7e6ee0d` |
| public_views | 0 | `d751713988987e9331980363e24189ce` |
| storage_buckets | 2 | `92db97a3ffbb95c25e82f8bddfb55642` |
| storage_objects_acl | 16 | `584b699829d7deea48566936ae7f3577` |
| storage_objects_policies | 15 | `4a2afe61ac903982bfda1bce55fbeebd` |
| storage_objects_triggers | 2 | `83a2a10efcbc3d745c0332fac28e2e29` |
| storage_schema_acl | 3 | `c24cf8db39bc65e1f11c09992c2aa7c5` |

## Schema and permission findings

- **Public schema:** 23 ordinary tables; all owned by `postgres`; RLS enabled on all 23 and FORCE RLS on none. There are 163 columns, 69 constraints, 37 indexes, 68 policies, 24 public functions, 7 public table triggers, 2 identity sequences, and no public views/materialized views or custom public types.
- **Public schema USAGE:** present for PUBLIC, anon, authenticated and service_role; no CREATE grant was observed in the captured ACL rows.
- **Public table ACL:** 177 expanded direct grants to the four requested principals. No direct table ACL entry for anon or PUBLIC was present. Authenticated table grants and the 14 user_profiles column-level INSERT/UPDATE grants are recorded exactly in the manifest. The manifest also records service_role table grants and the per-object privilege strings.
- **ACL interpretation:** PostgreSQL catalogs expose current grants and grant options, not the historical GRANT/REVOKE statements that produced them. Absence from the captured ACL rows means no matching stored grant entry; it does not identify which REVOKE statement was run. Role-membership-derived effective privileges were not evaluated.
- **Public function ACL:** 21 EXECUTE entries including the default PUBLIC EXECUTE entries where the function ACL is implicit. The exact grantee/grantor/GRANT OPTION rows are in the manifest.
- **Public sequences:** two identity sequences; service_role has SELECT and USAGE on both; no anon/authenticated/PUBLIC sequence grant was captured.
- **Default privileges in public:** 64 ACL entries across the table-creating roles postgres and supabase_admin. The supabase_admin defaults grant all table privileges (DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE) to anon, authenticated, postgres and service_role; sequence defaults grant SELECT/UPDATE/USAGE and function defaults grant EXECUTE to those roles. The postgres defaults grant the owner the table/sequence/function defaults and additionally grant service_role MAINTAIN, REFERENCES, TRIGGER and TRUNCATE on future tables. This is a live role-level default snapshot, not a repo migration.
- **Storage:** two private STANDARD buckets, tryon-photos and wardrobe-images; both are private, AVIF autodetection is false, versioning is DISABLED, size/MIME limits are NULL, and lifecycle configuration is NULL. There are 15 policies on storage.objects. The storage.objects ACL has anon and authenticated CRUD; service_role has CRUD plus MAINTAIN, REFERENCES, TRIGGER and TRUNCATE; no PUBLIC entry was returned. The storage schema grants USAGE to anon, authenticated and service_role, with no PUBLIC entry. Two storage-object triggers are Supabase-managed. No bucket objects were inspected.
- **Auth:** no non-internal triggers were found on auth.users. The app signup route calls Supabase Auth; profile persistence is performed by the app through user_profiles upsert, not by an auth.users trigger.

## Origin reconciliation against repository migrations

Compared the 19 SQL files currently under supabase/migrations by matching table/function/policy/trigger/index definitions and names. Objects lacking a matching creation definition are marked `manual/unknown` in the manifest; managed Supabase objects are marked separately.

- **Public tables (9):** affinity_signals, pair_affinity_signals, rotation_cursors, saved_looks, slot_statuses, tryon_profiles, user_profiles, wardrobe_items, wear_logs.
- **Public constraints (29):** see exact table/name list in the manifest; includes constraints on the nine untracked core tables and the wardrobe-item affinity check.
- **Public indexes (12):** see exact table/name list in the manifest; primary indexes on core tables are not attributable to a reviewed table-creation migration.
- **Public policies (21):** see exact table/name list in the manifest. The current wardrobe_items policy was altered by the repo tidy-up migration, but its original creation is not in the reviewed migration set.
- **Public functions (1):** rls_auto_enable().
- **Public table triggers (4):** rotation_cursors.trg_rotation_cursors_updated_at, slot_statuses.trg_slot_statuses_updated_at, user_profiles.trg_user_profiles_updated_at, wardrobe_items.trg_wardrobe_items_updated_at.
- **Event triggers:** `ensure_rls` is not created by a reviewed migration; `issue_graphql_placeholder`, `issue_pg_cron_access`, `issue_pg_graphql_access`, `issue_pg_net_access`, `pgrst_ddl_watch` and `pgrst_drop_watch` are owned by `supabase_admin` and marked Supabase-managed.
- **Storage policies (8):** Delete own tryon photos, Delete own wardrobe images, Read own tryon photos, Read own wardrobe images, Upload own tryon photos, Upload own wardrobe images, Users manage own tryon photos, Users manage own wardrobe images.
- **Extensions (5) and buckets (2):** present live, but no creation/configuration source was found in repo migrations; origin remains platform/manual unknown.
- **ACL rows:** current state is captured completely for the requested principals, but exact migration attribution was not established for each grant. The manifest marks these rows as source-unknown or Supabase/platform-managed as appropriate.

Objects created inline by a repo migration inherit that migration attribution for their constraints/indexes; the manifest retains each object's captured SQL definition. The snapshot does not assert that the repo migrations reproduce the complete live schema.

## Manual Auth settings checklist (not available from this catalog query)

These are items for an authorised operator to inspect in the intended Supabase dashboard; no live value is asserted here.

1. **Email/password and confirmation:** verify the provider is enabled and confirm the email-confirmation setting matches the app's current flow. `lib/emailSignUp.ts` documents that it expects Supabase confirmation disabled; if confirmation is enabled, the current immediate sign-in flow needs deliberate validation. Supabase's [Password-based Auth guide](https://supabase.com/docs/guides/auth/passwords) says email/password is enabled by default and hosted projects default to requiring confirmation.
2. **Google and Apple:** verify each provider's enabled state and callback configuration; the app exposes both providers in `lib/auth.ts`. Do not copy provider secrets into the repo or report them.
3. **Site URL and redirect allow-list:** verify the current site URL and every deployed/native redirect. `app.json` sets the `amodka` scheme; source code defines `amodka://auth/callback`, `amodka://auth/confirm` and `amodka://auth/update-password`. Confirm actual Expo Go relay and deployment domains rather than assuming the code comments reflect current dashboard state. See Supabase's [redirectTo troubleshooting guide](https://supabase.com/kb/troubleshooting/why-am-i-being-redirected-to-the-wrong-url-when-using-auth-redirectto-option-_vqieo).
4. **Email templates and SMTP:** inspect confirmation, recovery and invite templates and link destinations; verify the authorised SMTP provider/sender and delivery. The [custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) describes the dashboard configuration. Do not expose SMTP credentials.
5. **Password rules:** the app server validates 8–128 characters in `server/routes.ts`; compare this with the live Supabase password-strength and leaked-password settings, which were not captured by SQL.
6. **Signup/profile behaviour:** confirm a newly authenticated account is followed by the client profile upsert (`lib/database.ts`); no auth.users trigger exists in this snapshot.

## Generated baseline and local replay

Commands, from the repository root:

```sh
python3 scripts/generate-supabase-baseline.py
python3 scripts/generate-supabase-baseline.py --check
python3 scripts/test-supabase-baseline.py
```

The generator uses Python's standard library, the checked-in JSON only, stable object sorting, and no clock, network, environment connection, or external service. The file header records snapshot provenance and says **schema only; NEVER APPLY TO PRODUCTION**. A transaction and an empty-public-table guard prevent partial installation and ordinary replay over an existing application schema. The guard does **not** determine whether a project is Production; operator verification is still mandatory.

Order follows actual dependencies: extensions; tables/columns and identity sequences; full public function definitions; primary/unique/check constraints; standalone indexes; foreign keys; RLS/policies; captured ACLs; bucket configuration and Storage ACL/policies; table triggers; the non-managed event trigger. Functions precede the semantic check constraint, and standalone unique indexes precede foreign keys that reference them. Constraint-backed indexes are created by constraints, with their provenance noted in comments.

The snapshot's function bodies, owners, security modes and search paths are preserved, including existing billing definitions; no billing logic was altered. All manual/unknown-origin objects are annotated. Captured-principal grants are explicitly revoked first and then restored, including column, sequence, function, schema and creator-default ACLs. The ACL scope is exactly what was captured: public/schema/storage ACLs for PUBLIC, anon, authenticated and service_role, plus captured creator defaults for postgres/supabase_admin. Owner rights and uncaptured role memberships/other principals are not a claim of a complete role-security dump.

### Local result

`scripts/test-supabase-baseline.py` creates a fresh PostgreSQL cluster under a temporary directory with `initdb --username=postgres`, TCP disabled and a private Unix socket. It accepts no connection URL and removes the cluster in `finally`. Minimal local roles, `auth.uid()`, `auth.users`, Storage relation/type/function stubs are loaded first; no customer rows are inserted. The stubs only validate schema parsing/catalog state, not Supabase service behaviour.

**PostgreSQL 16.10: successful empty-database application; all 24 original fingerprint queries ran; 18 exact classes, 6 explained difference classes, zero unexplained differences.** The non-empty-target refusal test also passed. The full result, raw MD5s, file SHA-256s, and individual missing/local-only catalog rows are in `20261022-local-parity-result.json`.

Exact classes: public tables (23), columns (163), constraints (69), indexes (37), policies (68), RLS flags (23), column ACL (28), full function definitions (24), function ACL (21), table triggers (7), views (0), sequences (2), sequence ACL (4), public schema ACL (4), Storage schema ACL (3), buckets/settings (2), Storage policies (15), and auth.users triggers (0).

| Different class | Local / live count | Exact reason |
|---|---:|---|
| public_table_acl | 160 / 177 | PostgreSQL 16 lacks MAINTAIN. Seventeen service_role MAINTAIN grants are conditional PG17+ SQL. |
| public_default_acl | 58 / 64 | Six default MAINTAIN grants are conditional PG17+ SQL. |
| storage_objects_acl | 15 / 16 | One service_role MAINTAIN grant is conditional PG17+ SQL. All remaining grants and grantors match. |
| event_triggers | 1 / 7 | The six Supabase-managed event triggers are omitted. The manual/unknown `ensure_rls` trigger matches. |
| extensions | 4 / 5 | Supabase-managed `supabase_vault` 0.3.1 is omitted; local PG16 supplies `pg_stat_statements` 1.10 instead of live PG17's 1.11. pgcrypto, plpgsql and uuid-ossp match. |
| storage_objects_triggers | 0 / 2 | Supabase-managed `protect_objects_delete` and `update_objects_updated_at` and their service implementations are omitted. |

The seventeen public-table MAINTAIN differences are: affinity_signals, billing_accounts, billing_deletion_tombstones, billing_event_journal, billing_reconciliations, billing_subscriptions, billing_transactions, pair_affinity_signals, rotation_cursors, saved_looks, slot_statuses, tryon_profiles, user_profiles, wardrobe_free_selections, wardrobe_items, wardrobe_photo_cleanup_receipts, wear_logs.

The six default MAINTAIN differences are creator/grantee pairs: postgres/postgres, postgres/service_role, supabase_admin/anon, supabase_admin/authenticated, supabase_admin/postgres, supabase_admin/service_role.

Skipped managed event triggers: issue_graphql_placeholder, issue_pg_cron_access, issue_pg_graphql_access, issue_pg_net_access, pgrst_ddl_watch, pgrst_drop_watch. Supabase's platform must supply their non-public function implementations. Managed plpgsql is supplied by PostgreSQL initialization; Vault is a hosted-platform prerequisite. Storage schema/relation definitions and auth.users are not generated; only the requested app bucket configuration, policies and captured ACLs are restored on platform-provided relations.

Every non-exact class is also compared row-for-row after **only** the listed omissions/version substitutions. The test fails if any additional difference appears. No unexplained mismatch was accepted. During development, the replay caught dependency-order errors and a search_path binding to pgcrypto's UUID wrapper; these were corrected rather than normalized away.

## Procedure: build a new empty Dev Supabase project

This is a documented future operator procedure only; **none of it was executed against Supabase in this task**.

1. Provision a new, empty **Development** Supabase project. Independently verify its project ref and environment label in the dashboard. Do not use the snapshot source project merely because its ref is recorded here; its environment label remains unestablished. Do not copy customer data, users, Storage objects or credentials.
2. Let Supabase provision its roles, Auth/Storage schemas, service functions, managed triggers and extensions. Confirm PostgreSQL 17 compatibility; the closest comparison target is 17.6. Check that the target Storage API/schema includes `buckettype`, `versioning_status`, `lifecycle_configuration`, and the other captured bucket columns. Do not create the local test stubs in a real Supabase project.
3. Arrange a credential-free-to-the-repository local `psql` service entry named `amodka_dev` through the approved secret/connection process. It must connect only to that verified Dev project. Do not paste a password or connection string into a command/report/repository.
4. Perform metadata-only preflight using that service: inspect `current_user`, `server_version`, the existence of the required roles, `auth.users`, `auth.uid()`, `storage.objects`, `storage.buckets`, `storage.foldername(text)`, extension versions, and zero ordinary/partitioned tables in public. Verify the current role can create/own public objects, manage Storage policies/ACLs, create the `ensure_rls` event trigger, and alter default privileges for **both postgres and supabase_admin**.
   **Permission blocker:** ordinary project `postgres` access must not be assumed to have supabase_admin authority. Prior inspection established that changing supabase_admin defaults needs Supabase-authorized role access. A platform-authorized administrator must resolve this before a full hosted application is attempted. Local superuser success does not establish hosted permission availability. Do not bypass the failing statements or silently install a partial ACL baseline.
5. Review the generated SQL and the captured broad creator defaults with that administrator. They are reproduced for snapshot fidelity, not endorsed as a new security policy. In particular, supabase_admin's captured defaults include broad anon/authenticated privileges. All new public-table migrations must still follow the documented explicit revoke/minimal-grant rule. No default-privilege hardening change is included in this task.
6. Regenerate and validate locally with the three commands above; inspect the SHA-256 in the result. After the separate operator approval, install the exact file:

   ```sh
   psql 'service=amodka_dev' -X -v ON_ERROR_STOP=1 \
     -f supabase/baseline/baseline.sql
   ```

   The transaction must commit completely. Any precondition/permission error means stop and investigate; the transaction rolls back. Never run on Production.
7. Run each SELECT in `supabase/baseline/fingerprint.sql` on Dev (or `psql 'service=amodka_dev' -X -v ON_ERROR_STOP=1 -f supabase/baseline/fingerprint.sql`). Compare **all 24 classes**, not just counts, with the snapshot. On PG17 the MAINTAIN rows should be present. Review platform-managed and extension-version differences individually; do not reuse the local PG16 normalization as automatic approval of hosted differences. Capture Dev provenance and metadata-only results separately.
8. Complete the manual Auth checklist above: email/password enabled; confirmation setting deliberately matches the current immediate-sign-in flow; Google/Apple provider/callback setup; real native/Expo/deployed redirect allow-list and Site URL; recovery/invite/confirmation templates and SMTP; password rules; client profile creation without an auth.users trigger. No Auth provider credentials or SMTP secrets belong in these files.
9. This is a baseline install, **not** an instruction to replay `supabase/migrations/` over it. The snapshot already contains the historical schema outcomes and may include manual origins. Establish the approved migration-history/baseline registration procedure before using migration tooling for subsequent reviewed migrations; do not mark historical migrations applied or run them automatically based on this report.

## Verification boundary

This baseline has been replayed only in the disposable local PostgreSQL 16.10 stub environment. It has **not** been applied to any Supabase project, tested locally on PG17, or validated against real Supabase Auth/Storage services or dashboard settings. It therefore does not prove hosted Supabase parity, end-to-end Auth/Storage behaviour, effective membership-derived permissions, or historical migration replay parity. The preserved snapshot is not a fresh live inspection. No app suite, typecheck, lint, device test, purchase, deployment, application change or migration-file change was performed for this schema-file/local-test-only task.

## Deviations

- Exact catalog-query time was absent from the original capture. The original snapshot file timestamp is recorded with that limitation instead of inventing a query timestamp.
- No other scope deviation. The six local comparison differences are the explicit platform/version limits described above, not unexplained drift. The baseline is not claimed deployable with an ordinary hosted role until its admin-only permission prerequisite is resolved.

### Files

- `supabase/baseline/20261022-live-catalog.json` — complete captured schema/catalog snapshot and per-object origin annotations.
- `supabase/baseline/fingerprint.sql` — read-only per-class fingerprint SELECTs.
- `supabase/baseline/20261022-live-catalog-report.md` — findings, manual checklist, unknown origins and limitations.
- `scripts/generate-supabase-baseline.py` — deterministic snapshot-to-SQL generator and `--check`.
- `supabase/baseline/baseline.sql` — generated schema-only file, with dependency order, provenance, ACL reset/restore and non-empty-target guard.
- `scripts/test-supabase-baseline.py` — local-only disposable PostgreSQL replay and 24-class comparison.
- `supabase/baseline/20261022-local-parity-result.json` — raw local/live hashes, exact row-level differences and test provenance.
- `TECHNICAL.md` §51 — build procedure, limits and manual Auth checklist reference.
