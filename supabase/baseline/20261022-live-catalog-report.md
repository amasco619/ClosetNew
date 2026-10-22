# Amodka live schema baseline — read-only inspection

**Captured:** 2026-10-22
**Connected project ref:** `garppyocfgdamdgfyfbr` (the Development/Production label was not established)
**Database:** 17.6

## Scope and safety

This is a catalog-only snapshot. No customer records, auth-user rows, storage object data, or secret values were read. No SQL, migration, permission change, or other mutation was executed. The JSON manifest is a **reference snapshot, not an apply-ready migration**. It intentionally does not attempt to recreate Supabase-managed schemas or objects.

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

## Verification boundary

This baseline has **not** been replayed into an empty Supabase project or compared with a fresh rebuild. Therefore it does not prove migration replay parity. The catalog output contains full public function definitions and schema metadata, but not non-public function definitions for Supabase-managed event/storage triggers, not role-membership-derived effective privileges, and not dashboard Auth configuration. No device test, app test suite, typecheck or lint was run for this documentation/catalog-only deliverable.

## Deviations

None. The initial combined catalog request was replaced with the approved
narrow read-only queries; no project mutations or migration-file changes were
made.

### Files

- `supabase/baseline/20261022-live-catalog.json` — complete captured schema/catalog snapshot and per-object origin annotations.
- `supabase/baseline/fingerprint.sql` — read-only per-class fingerprint SELECTs.
- `supabase/baseline/20261022-live-catalog-report.md` — findings, manual checklist, unknown origins and limitations.
