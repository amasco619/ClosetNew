# wardrobe_items RLS tidy-up — preflight and approved application

**Status: APPLIED after explicit chat approval, 2026-10-22.** The exact reviewed
transaction below was applied to the Amodka production project
`garppyocfgdamdgfyfbr` through the migration tool. Its recorded version is
**20261022130922**, mirrored verbatim in
`supabase/migrations/20261022130922_wardrobe_items_rls_policy_tidy_up.sql`.
No live rollback, replay variant, other policy DDL or grant change was executed.
Local tests use a disposable PostgreSQL cluster, never Supabase or DATABASE_URL.

## Post-application live metadata verification

Fresh before/after SELECT-only catalog snapshots confirmed:

| Check | Before | After |
|---|---|---|
| wardrobe policy count | 9 | **1** |
| Policy fingerprint | `75a210bc2427210063fc7ed617411ddb` | `c8a2d8c51969cf0c602ee7be99aad586` |
| RLS enabled / forced | true / false | **true / false** |
| Owner | postgres | postgres |
| Raw table ACL | `{postgres=arwdDxtm/postgres,authenticated=rwd/postgres,service_role=rwdDxtm/postgres}` | **Identical** |
| Column ACLs | none | **None** |
| All other tables' policies, including other schemas | 82 | **82; identical fingerprint** |

The remaining policy is exactly **Users manage own wardrobe items**,
PERMISSIVE, FOR ALL, TO PUBLIC, USING `(auth.uid() = user_id)`,
WITH CHECK `(auth.uid() = user_id)`. The other-policy fingerprint stayed
`22449eb66b909a1e42b7ce10e0b62b01`; its input includes schema/table, policy name,
command, roles, permissiveness and both expressions for every other policy.

Effective `has_table_privilege` was compared for **all eight privileges** for
anon, authenticated and service_role, not only CRUD. Results are identical:

| Role | S/I/U/D | TRUNCATE / REFERENCES / TRIGGER / MAINTAIN | BYPASSRLS |
|---|---|---|---|
| anon | no / no / no / no | all no | false |
| authenticated | yes / no / yes / yes | all no | false |
| service_role | yes / no / yes / yes | all yes, unchanged | true |

No customer rows or live data-access operations were used for verification.

## Pre-application live inventory and effective access

Snapshot: 2026-10-22, connected **Amodka** project. Live PostgreSQL 17.6;
table owner postgres; RLS enabled, FORCE RLS false; no column ACLs.
Let **O = `(auth.uid() = user_id)`**. Every policy is PERMISSIVE:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can delete own wardrobe | DELETE | authenticated | O | NULL |
| Users can delete own wardrobe items | DELETE | authenticated | O | NULL |
| Users can insert own wardrobe | INSERT | authenticated | NULL | O |
| Users can insert own wardrobe items | INSERT | authenticated | NULL | O |
| Users can read own wardrobe items | SELECT | authenticated | O | NULL |
| Users can update own wardrobe | UPDATE | authenticated | O | O |
| Users can update own wardrobe items | UPDATE | authenticated | O | O |
| Users can view own wardrobe | SELECT | authenticated | O | NULL |
| Users manage own wardrobe items | ALL | PUBLIC | O | NULL (implicitly O) |

Four command pairs are exact duplicates apart from name. The PUBLIC ALL policy
overlaps each authenticated pair. Permissive OR is `O OR O OR O = O`;
NULL does not become true. For ALL, omitted WITH CHECK falls back to USING
for INSERT/UPDATE, so the current ownership-reassignment check is already O.

**Actual direct-table matrix, unchanged by the applied migration:**

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| authenticated, user A or B | Own rows only | **Denied by ACL**, including column INSERT | Own rows only; new user_id must remain own | Own rows only |
| anon | Denied by ACL | Denied by ACL | Denied by ACL | Denied by ACL |
| PUBLIC pseudo-role | No table/column privileges granted | None | None | None |
| service_role (context) | All rows, BYPASSRLS | Denied by ACL | All rows, BYPASSRLS | All rows, BYPASSRLS |

PUBLIC is a policy/grant target inherited by all roles, not a login role that
can be SET ROLE. The table has no PUBLIC grant. Anon's real denial is SQLSTATE
42501, not a successful SELECT returning zero rows. With hypothetical local-only
CRUD grants, a NULL auth.uid() still sees no rows.

**Smallest equivalent set:** retain the existing PUBLIC ALL policy, make its
implicit WITH CHECK explicit, and drop the eight authenticated duplicates.
This preserves PUBLIC applicability, including roles other than authenticated;
changing TO PUBLIC to TO authenticated would not be an exact policy equivalent.
No grant, function, owner, RLS flag, RPC, quota or application code changes.

**Narrowing candidates — NOT proposed/applied:** restrict PUBLIC applicability
to authenticated; remove latent INSERT policy coverage now that direct INSERT
is revoked. Neither is necessary for deduplication and both change policy scope.

## Access paths inspected

The app uses the publishable Supabase client plus the user's session
(`lib/supabase.ts`). All literal wardrobe table calls in app/components/contexts/
lib/shared/server resolve to `lib/database.ts`, except the server's dynamic
account-deletion inventory:

| Path | Operation and evidence |
|---|---|
| `lib/database.ts:200–219,231–248` | Direct SELECT: paginated wardrobe + total count; selected-item reads; explicit user_id filters |
| `lib/database.ts:142–187,301–313` | Direct UPDATE: replacement photo/item details, semantic corrections, affinity; explicit id/user_id filters |
| `lib/database.ts:256–270` | Direct DELETE with returned image_url; explicit id/user_id filters |
| `lib/database.ts:53–105` | `insert_wardrobe_item`, `insert_wardrobe_items`, `insert_wardrobe_group_items` RPCs; no direct client INSERT |
| `lib/database.ts:251–254,326–337` | `set_free_wardrobe_selection` and `create_garment_group`: validate/reference owned wardrobe rows |
| `contexts/AppContext.tsx` | Load/pagination, save, bulk save, pending sync/guest transfer, correction/replacement and delete route through those helpers; guest-only rows stay local |
| `server/routes.ts:93–157`, `server/accountDeletionInventory.ts:18` | Server secret-key client removes Storage objects by user prefix, then directly DELETEs wardrobe rows by user_id; no wardrobe SELECT in this handler |

Read-only live pg_proc inspection confirms: the three insert RPCs and
set_free_wardrobe_selection are SECURITY DEFINER owned by postgres, executable
by authenticated but not PUBLIC/anon; create_garment_group is SECURITY INVOKER.
The delete trigger's record_wardrobe_photo_cleanup is a postgres-owned SECURITY
DEFINER function. Repository migrations show the insert RPC's auth.uid(),
payload ownership and allowance checks. Those functions/triggers and service
privileges are unchanged. The app needs direct S/U/D and authenticated RPC
execution, **not** a new direct INSERT grant.

Operator-only paths, not app permission requirements: the legacy-storage URL
migration script uses service-key wardrobe reads/updates; deletion-readiness
uses the same inventory for service SELECT limit 0 and unused-UUID DELETE
probes; `scripts/test-rls-409-2.ts` contains explicit user-client wardrobe probes.
None of those operator scripts was executed in this review.

## Exact approved migration SQL — applied

The explicit lock makes the snapshot check and policy edits atomic against
concurrent policy DDL; it briefly queues table access until COMMIT. The digest
covers all policy names, roles, commands, permissiveness, USING and WITH CHECK.
Unexpected live policy drift aborts rather than silently tidying a different set.
The repo file uses the actual version returned by migration history, not a
predicted timestamp. The test asserts it exactly matches this approved block.

<!-- proposed-sql -->
```sql
BEGIN;
LOCK TABLE public.wardrobe_items IN ACCESS EXCLUSIVE MODE;
DO $gate$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.wardrobe_items'::regclass
      AND relrowsecurity AND NOT relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'wardrobe_items RLS flags changed; stop and re-inspect';
  END IF;
  IF (
    SELECT md5(jsonb_agg(jsonb_build_object(
      'policyname', policyname, 'cmd', cmd, 'roles', roles,
      'permissive', permissive, 'qual', qual, 'with_check', with_check
    ) ORDER BY policyname COLLATE "C")::text)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'wardrobe_items'
  ) IS DISTINCT FROM '75a210bc2427210063fc7ed617411ddb' THEN
    RAISE EXCEPTION 'wardrobe_items policy snapshot changed; stop and re-inspect';
  END IF;
END
$gate$;
DROP POLICY "Users can delete own wardrobe" ON public.wardrobe_items;
DROP POLICY "Users can delete own wardrobe items" ON public.wardrobe_items;
DROP POLICY "Users can insert own wardrobe" ON public.wardrobe_items;
DROP POLICY "Users can insert own wardrobe items" ON public.wardrobe_items;
DROP POLICY "Users can read own wardrobe items" ON public.wardrobe_items;
DROP POLICY "Users can update own wardrobe" ON public.wardrobe_items;
DROP POLICY "Users can update own wardrobe items" ON public.wardrobe_items;
DROP POLICY "Users can view own wardrobe" ON public.wardrobe_items;
ALTER POLICY "Users manage own wardrobe items" ON public.wardrobe_items
  WITH CHECK ((auth.uid() = user_id));
COMMIT;
```

## Exact rollback SQL — not applied

PostgreSQL stores parsed policy definitions, not original CREATE statement
formatting. These reproduce **every live catalog field**, including expressions
copied verbatim and the original NULL WITH CHECK on ALL. Rollback drops the
altered remaining policy before recreating the nine originals.

<!-- rollback-sql -->
```sql
BEGIN;
LOCK TABLE public.wardrobe_items IN ACCESS EXCLUSIVE MODE;
DO $gate$
BEGIN
  IF (
    SELECT md5(jsonb_agg(jsonb_build_object(
      'policyname', policyname, 'cmd', cmd, 'roles', roles,
      'permissive', permissive, 'qual', qual, 'with_check', with_check
    ) ORDER BY policyname COLLATE "C")::text)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'wardrobe_items'
  ) IS DISTINCT FROM 'c8a2d8c51969cf0c602ee7be99aad586' THEN
    RAISE EXCEPTION 'wardrobe_items rollback snapshot changed; stop and re-inspect';
  END IF;
END
$gate$;
DROP POLICY "Users manage own wardrobe items" ON public.wardrobe_items;
CREATE POLICY "Users can delete own wardrobe" ON public.wardrobe_items AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can delete own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own wardrobe" ON public.wardrobe_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can insert own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own wardrobe" ON public.wardrobe_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own wardrobe" ON public.wardrobe_items AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id));
COMMIT;
```

## Empty-database replay: NO — prerequisite and policy drift

The repo's ordered migrations do **not** reconstruct the nine-policy snapshot:

1. `20260610000000_user_profiles_rls.sql:2` starts with
   `ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY`; it assumes a base
   app schema. No earlier repo migration creates user_profiles or wardrobe_items.
   A genuinely empty app schema therefore fails before reaching this migration.
   Supabase Auth/Storage schemas and roles are also external prerequisites.
2. With the assumed app tables supplied, the wardrobe section of
   `20260814000000_rls_all_tables.sql:25–61` creates only four authenticated
   policies: read/insert/update/delete **own wardrobe items**. Its snapshot hash
   is **dd4334ee95abac6fa64e3a0658cec198**, not the approved guard's nine-policy hash.
3. No intervening repo migration creates the five additional pre-application
   live policies: **Users can delete own wardrobe**, **Users can insert own
   wardrobe**, **Users can update own wardrobe**, **Users can view own wardrobe**,
   and **Users manage own wardrobe items**. Their historical source is not
   established by the repository. The free-selection and hardening migrations
   change privileges/functions but do not supply these missing policy definitions.
4. Consequently the approved guard correctly **aborts** a four-policy replay,
   before any DROP. The local test executes the actual historical wardrobe
   section, confirms four policies, and proves that refusal leaves them intact.
   It also reproduces the earliest migration's missing-user_profiles failure.
   This is not a claim to have executed the entire production schema history.

### Proposed replay-safe alternative — documentation only, NOT executed

Keep the applied migration **immutable**. A fresh-install path first needs a
reviewed complete base schema and explicit ACL baseline. Then use the guarded
transition below as a **fresh-install alternative/checkpoint**, not an unreviewed
edit to the recorded migration or an extra migration run on production. A
complete fresh-install baseline could instead directly contain the final policy
and baseline the historical chain. Either approach needs separate approval.

This candidate accepts only the exact historical four-policy set, exact live
nine-policy set or exact final one-policy set; anything else aborts. Its final
catalog definition is identical to the applied live result. For the four-policy
case, TO PUBLIC intentionally matches the live target rather than preserving
that older set's narrower role applicability, so the fresh ACL baseline must
be reviewed too. This variant has **not** been executed or behavior-tested.

```sql
BEGIN;
LOCK TABLE public.wardrobe_items IN ACCESS EXCLUSIVE MODE;
DO $replay$
DECLARE
  snapshot_hash text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.wardrobe_items'::regclass
      AND relrowsecurity AND NOT relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'Unexpected wardrobe_items RLS flags';
  END IF;
  SELECT md5(jsonb_agg(jsonb_build_object(
    'policyname', policyname, 'cmd', cmd, 'roles', roles,
    'permissive', permissive, 'qual', qual, 'with_check', with_check
  ) ORDER BY policyname COLLATE "C")::text)
  INTO snapshot_hash
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'wardrobe_items';
  IF snapshot_hash = 'c8a2d8c51969cf0c602ee7be99aad586' THEN
    RETURN;
  END IF;
  IF snapshot_hash IS NULL OR snapshot_hash NOT IN (
    '75a210bc2427210063fc7ed617411ddb',
    'dd4334ee95abac6fa64e3a0658cec198'
  ) THEN
    RAISE EXCEPTION 'Unexpected wardrobe_items policy snapshot';
  END IF;
  DROP POLICY IF EXISTS "Users can delete own wardrobe" ON public.wardrobe_items;
  DROP POLICY IF EXISTS "Users can delete own wardrobe items" ON public.wardrobe_items;
  DROP POLICY IF EXISTS "Users can insert own wardrobe" ON public.wardrobe_items;
  DROP POLICY IF EXISTS "Users can insert own wardrobe items" ON public.wardrobe_items;
  DROP POLICY IF EXISTS "Users can read own wardrobe items" ON public.wardrobe_items;
  DROP POLICY IF EXISTS "Users can update own wardrobe" ON public.wardrobe_items;
  DROP POLICY IF EXISTS "Users can update own wardrobe items" ON public.wardrobe_items;
  DROP POLICY IF EXISTS "Users can view own wardrobe" ON public.wardrobe_items;
  IF snapshot_hash = 'dd4334ee95abac6fa64e3a0658cec198' THEN
    CREATE POLICY "Users manage own wardrobe items"
      ON public.wardrobe_items AS PERMISSIVE FOR ALL TO PUBLIC
      USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
  ELSE
    ALTER POLICY "Users manage own wardrobe items" ON public.wardrobe_items
      WITH CHECK ((auth.uid() = user_id));
  END IF;
END
$replay$;
COMMIT;
```

## Other tables — report only

Same roles, permissiveness and expressions were checked, not names alone.
No other policy was changed, and no equivalence proposal for these tables is
authorised by this report.

| Table (count) | Obvious duplicates/overlap |
|---|---|
| wear_logs (6) | SELECT: “Users can read own wear logs” = “Users can view own wear logs”. “Users manage own wear logs” PUBLIC ALL overlaps authenticated S/I/U/D. |
| rotation_cursors (9) | DELETE/INSERT/UPDATE: “Users can [command] own rotation” = “… own rotation cursors”; SELECT: “Users can read own rotation cursors” = “Users can view own rotation”. PUBLIC ALL “Users manage own rotation cursors” overlaps all four. |
| slot_statuses (9) | DELETE/INSERT/UPDATE: “Users can [command] own slots” = “… own slot statuses”; SELECT: “Users can read own slot statuses” = “Users can view own slots”. PUBLIC ALL “Users manage own slot statuses” overlaps all four. |
| tryon_profiles (9) | DELETE/INSERT/UPDATE: “Users can [command] own tryon” = “… own tryon profiles”; SELECT: “Users can read own tryon profiles” = “Users can view own tryon”. PUBLIC ALL “Users manage own tryon profiles” overlaps all four. |
| affinity_signals (7) | DELETE/INSERT: “Users can [command] own affinity” = “… own affinity signals”; SELECT: “Users can read own affinity signals” = “Users can view own affinity”. PUBLIC ALL “Users manage own affinity signals” also supplies UPDATE, which has no command-specific counterpart. |
| pair_affinity_signals (7) | DELETE/INSERT: “Users can [command] own pair affinity” = “… own pair affinity signals”; SELECT: “Users can read own pair affinity signals” = “Users can view own pair affinity”. PUBLIC ALL “Users manage own pair affinity signals” also supplies UPDATE. |
| user_profiles (5) | No exact command-specific pair. PUBLIC ALL “Users manage own profile” overlaps the four authenticated policies (owner expression uses id). |
| saved_looks (5) | SELECT: “Users can read own saved looks” = “Users can view own saved looks”. Other commands are distinct. |
| garment_groups (4) | No obvious duplicates: one authenticated policy per S/I/U/D command. |
| garment_group_members (4) | No obvious duplicates: one authenticated policy per S/I/U/D command. |

## Tests, deviations and remaining live verification

`__tests__/wardrobeItemsRls.test.ts` executes the **exact proposed and rollback
SQL blocks from this report** in disposable PostgreSQL 17.6. It asserts the
server major version before applying any fixture SQL. An independent
nine-policy baseline must match the live catalog fingerprint. It tests:

- Two fake users, own/foreign rows, broad reads/updates/deletes, insertion,
  ownership reassignment/row theft, NULL uid, and JWT JSON-claim fallback.
- Mirrored live **CRUD** grants: authenticated/service S/U/D, no direct I,
  no anon privileges. A second, local-only CRUD-granted fixture isolates RLS,
  including own INSERT, anon NULL uid, and another PUBLIC-covered role.
- Service-role BYPASSRLS, identical SQLSTATE/row counts/returned IDs across
  current/proposed/rollback, unchanged ACL/RLS flags and exact nine-policy
  metadata restoration. Deliberate extra-policy drift aborts before any edit.

| Command | Result |
|---|---|
| `npm test -- __tests__/wardrobeItemsRls.test.ts` | Pass: 321 command checks; 107 cases across two grant modes, each checked in three policy states |
| `npm test` | **124 passed / 0 failed** |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no lint warnings |
| `npx tsx __tests__/recommendation-golden-set.ts` | **35 passed / 0 failed** |
| `node scripts/validate-benchmark-fixtures.mjs` | Pass: 100 cases and **53 frozen-file checksums** |
| `node scripts/validate-africa-track-c.mjs` | Pass: 100 sealed cases |

**Files changed:** this report, `__tests__/wardrobeItemsRls.test.ts`,
`TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md` and the tool-versioned approved
migration file. No application or dependency file changed. The test additionally
checks migration/report SQL identity and the historical replay rejection.

- **Deviations:** no policy-scope or protected-area deviation. Disposable local
  schema/function/grant setup is the expressly requested test fixture, not live
  DDL. Keeping PUBLIC is deliberate equivalence, not a new PUBLIC grant.
- Only the explicitly approved live policy DDL was applied. No other live DDL,
  grants, customer-data queries/changes, app publication or deployment.
- INSERT allowance is tested separately from INSERT ACL: own direct INSERT
  cannot honestly be labelled allowed under today's live privileges.
- Local PostgreSQL is 17.6, matching the live version. Tests verify SQL/RLS
  behavior, not live PostgREST caching, RPC execution, full production schema
  constraints, physical devices, performance or lock duration.
- Live application, recorded-version mirror and metadata comparison are complete.
  Live rollback and the proposed fresh-install transition were not executed.
