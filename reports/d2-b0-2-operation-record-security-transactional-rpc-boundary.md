# D.2 B0.2 — Operation Record Security & Transactional RPC Boundary

Read-only architecture and security specification. Prepared after reading the complete 202-line B0.2 brief, the B0.1 architecture report, the Phase A migrations, relevant client/server persistence code, and read-only live Supabase catalog metadata on 2026-09-19.

## Security problem

B0.1 requires a completed-operation record to be authoritative: its owner, operation ID, canonical payload, item IDs, group ID, and completion time must describe a database transaction that actually committed. An authenticated client must not be able to fabricate, mutate, or delete that record.

The central PostgreSQL constraint is:

- A SECURITY INVOKER function runs with the authenticated caller’s effective privileges and RLS context.
- If authenticated receives INSERT on an API-exposed operation table so an invoker function can insert, the same authenticated role can insert directly through PostgREST.
- Owner-scoped RLS proves only that auth.uid() equals user_id. It cannot prove that a row was produced by the orchestration function.
- Removing UPDATE and DELETE privileges makes inserted rows immutable after creation but does not prevent fabrication at creation.
- Column grants, defaults, ordinary checks, and an invoker trigger do not prove call provenance.

Therefore, a public/API-exposed operation table cannot simultaneously be directly non-writable by authenticated clients and writable by a SECURITY INVOKER function executing as those clients. A separate trusted write boundary is required.

The trusted boundary can be either:

1. A narrowly audited SECURITY DEFINER orchestration function whose owner alone can write the locked operation table; or
2. A SECURITY INVOKER function with the operation table in a schema excluded from PostgREST, where database grants permit the invoker but API schema exposure prevents direct table access. This second design depends on deployment configuration that is not currently checked into the repository.

The existing Phase A create_garment_group(...) function is SECURITY INVOKER, owned by postgres, has search_path=pg_catalog, and grants EXECUTE only to authenticated. It can remain unchanged and participate in the outer PostgreSQL transaction.

## Operation-record model

### Proposed table identity

Proposed logical name:

    public.multi_item_persistence_operations

If the private-schema invoker alternative is selected, use the same table contract under an approved non-exposed schema instead of public.

### Exact columns

| Column | Type | Nullability/default | Purpose |
|---|---|---|---|
| user_id | uuid | NOT NULL | Owner derived only from auth.uid(); references public.user_profiles(id) ON DELETE CASCADE. |
| operation_id | uuid | NOT NULL | Stable client-generated UUID v4 for one logical multi-item save. |
| payload_version | smallint | NOT NULL, initially 1 | Pins canonicalization semantics so later payload formats cannot be mistaken for exact replay. |
| canonical_payload | jsonb | NOT NULL | Canonical durable database intent used for exact equality comparison. |
| item_ids | uuid[] | NOT NULL | Ordered result item IDs generated before upload and reused on retry. |
| group_id | uuid | NOT NULL | Group ID returned by the first successful call to unchanged Phase A RPC. |
| completed_at | timestamptz | NOT NULL DEFAULT now() | Time the all-or-nothing database operation committed. |

No processing, failed, pending, mutable status, signed URL, image bytes, secret, authentication token, or transient error belongs in this table. Only completed records are inserted, at the end of the successful transaction.

### Primary and unique constraints

- PRIMARY KEY (user_id, operation_id).
- No separate global uniqueness constraint on operation_id is required; identity is owner-scoped.
- No uniqueness constraint on group_id is required because garment_groups already has PRIMARY KEY (id), and one operation result stores one generated group.
- No uniqueness constraint on item_ids as an array is useful. wardrobe_items PRIMARY KEY (id) enforces each item identity globally.

### Ownership foreign key

    user_id REFERENCES public.user_profiles(id) ON DELETE CASCADE

Do not add foreign keys from group_id or the item_ids array to business rows. Completed operations are historical replay records and must survive later user deletion of an individual garment or group. Account deletion removes them through the owner FK.

### Checks

The table should enforce only checks that are deterministic and appropriate at row level:

- payload_version = 1 for the initial contract;
- jsonb_typeof(canonical_payload) = 'object';
- cardinality(item_ids) >= 2;
- array_position(item_ids, NULL) IS NULL;
- group_id is non-null through column definition.

Duplicate item IDs, canonical sorting, equality between item_ids and IDs embedded in canonical_payload, and relationship validation belong in the orchestration function. PostgreSQL CHECK constraints cannot safely contain the required subqueries for array distinctness.

### Indexes

- The primary-key index on (user_id, operation_id) is sufficient for replay lookup and owner-FK cascade prefix access.
- Do not add speculative indexes.
- If architecture later approves time-based retention sweeps, add an index on completed_at only when the actual cleanup query requires it.

### Canonical payload

canonical_payload contains durable database intent only:

- payload schema version;
- item records sorted by item UUID;
- exact persisted wardrobe columns with omitted values normalized consistently;
- relationship type, confidence, confirmation status, shared attributes, and durable source_image_path;
- member IDs sorted by UUID.

It must not contain:

- signed URLs;
- image bytes or base64;
- API keys, secrets, or tokens;
- session/JWT data;
- client-supplied user_id;
- temporary file URIs;
- non-durable UI state.

JSONB equality after server-side canonicalization is authoritative. A digest may be stored or calculated for performance, but digest equality alone must not define exact replay.

### Immutability

- Authenticated clients receive no INSERT, UPDATE, or DELETE table privilege.
- The orchestration function inserts one completed row and never updates it.
- No application API changes completed records.
- A BEFORE UPDATE trigger that always rejects may be added as defense in depth, because no legitimate lifecycle requires UPDATE.
- Do not use an unconditional DELETE-blocking trigger: it would also interfere with account deletion/cascade and approved service-role cleanup. DELETE immutability is enforced through ACLs and the narrow account-deletion boundary.

### Retention and account deletion

- Default retention: account lifetime. This preserves exact replay after timeout, restart, and later business-row deletion.
- Account deletion removes operation rows through user_profiles ON DELETE CASCADE.
- If defense-in-depth explicit cleanup remains project policy, add the table to both server/routes.ts account-deletion table lists before user_profiles deletion.
- Any bounded retention policy requires a separately approved immutable tombstone strategy. Deleting all evidence permits old operation IDs to be reinterpreted as new operations and weakens the stated replay guarantee.

## SECURITY INVOKER analysis

### Option 1A: API-exposed operation table

This option cannot satisfy the authoritative-record requirement.

For the invoker function to INSERT or SELECT the table, authenticated must have corresponding privileges. On an exposed public table, PostgREST exposes those same privileges directly. An authenticated user could then:

- fabricate a completed record for their own user_id;
- choose operation_id, canonical_payload, item_ids, group_id, and completed_at;
- block a future legitimate operation by pre-claiming its ID;
- fabricate exact-replay results that do not correspond to an atomic transaction.

Owner RLS prevents cross-user rows but does not prevent same-user fabrication. Omitting UPDATE/DELETE does not solve forged INSERT. Granting only selected insert columns still allows fabrication of all authoritative values available to the function. Defaults do not establish provenance.

An invoker trigger has the same effective caller context unless it introduces a privileged boundary, at which point it is effectively the definer option. Custom session variables are not a safe origin signal if the caller can set them. No ordinary policy expression can reliably tell that an INSERT originated inside a particular invoker function.

Conclusion: SECURITY INVOKER plus an API-exposed operation table is rejected for B0.2’s stated guarantee.

### Option 1B: Non-exposed private operation schema

This is a genuinely viable invoker design only under all of these conditions:

- The operation table is in a schema excluded from PostgREST exposed schemas in every environment.
- authenticated has the PostgreSQL schema/table privileges needed by the invoker function, but the table has no API route because the schema is not exposed.
- The public orchestration RPC is the only exposed entry point.
- PUBLIC and anon have no schema/table privileges.
- The function has search_path=pg_catalog and fully qualifies the private operation table and public business objects.
- Owner-scoped RLS remains enabled as defense in depth.
- Deployment tests prove the private schema cannot be selected, inserted, updated, deleted, or invoked through PostgREST.
- Configuration drift is monitored; exposing the schema would convert authenticated INSERT privilege into direct fabrication capability.

The repository contains no checked-in PostgREST exposed-schema configuration, so this boundary cannot currently be proven from source control alone. It requires production configuration inspection and release validation.

### Ability to call Phase A

A SECURITY INVOKER orchestration function is naturally compatible with the existing SECURITY INVOKER create_garment_group(...): both execute with the authenticated role and auth.uid() context. Its group and membership writes remain in the same outer transaction.

The private-table invoker must still possess INSERT/SELECT privileges on the private operation table, and existing authenticated privileges/RLS must permit wardrobe/group work. It does not globally prevent clients from using existing direct wardrobe/group APIs; the all-or-nothing guarantee applies to the Phase B multi-item route.

## SECURITY DEFINER analysis

A narrowly audited SECURITY DEFINER orchestration function can provide an authoritative public-schema operation record because authenticated needs only EXECUTE on the function and receives no operation-table write privileges.

### Exact function posture

- LANGUAGE plpgsql.
- SECURITY DEFINER.
- SET search_path = pg_catalog exactly.
- Every non-pg_catalog object is schema-qualified, including:
  - auth.uid();
  - public.multi_item_persistence_operations;
  - public.wardrobe_items;
  - public.create_garment_group(...);
  - all referenced public composite types/functions.
- No dynamic SQL.
- No caller-controlled identifiers, schema names, relation names, ORDER BY expressions, or executable fragments.
- No SET ROLE, row_security=off, service-role API call, or JWT claim accepted from the payload.

PostgreSQL resolves pg_catalog implicitly even when omitted, but security-sensitive references should still be explicit where practical. The deployed auth.uid() location/signature must be verified and referenced as auth.uid(); it is not a public function.

### Ownership derivation

- v_user_id := auth.uid().
- If null, raise SQLSTATE 42501 before any write.
- Do not accept user_id as an authoritative parameter.
- Assign v_user_id to every wardrobe row and operation record.
- Pass only item IDs created in the current request to Phase A after they have been inserted for v_user_id.
- Validate that all item IDs are non-null/distinct and do not pre-exist outside an exact completed replay.

### Function owner and privilege surface

Two ownership patterns are technically possible:

1. Existing Supabase migration-owner pattern: function owned by postgres. This requires no Phase A RLS/policy changes and can call the current Phase A RPC. It has a broad potential privilege surface, so safety depends on static fully qualified SQL, no dynamic SQL, exhaustive validation, and an exact ACL audit.
2. Dedicated NOLOGIN executor role: narrower in principle, but it must receive enough business-table privileges and RLS-policy membership to insert wardrobe/group rows and call the SECURITY INVOKER Phase A function. Under current policies, introducing that role may require inherited authenticated role membership or additive RLS policies, expanding the migration and potentially touching Phase A security posture.

Because B0.2 forbids modifying Phase A, the owner pattern is an explicit architecture decision. Do not assume a dedicated owner is automatically safer unless its RLS and inherited privileges are fully specified and tested.

### RLS interaction

SECURITY DEFINER changes the effective database role but auth.uid() still reflects request JWT context. A table owner or postgres normally bypasses RLS. Therefore:

- RLS is defense in depth for the operation table, not the definer function’s primary authorization boundary.
- The function must explicitly derive/check auth.uid() and assign it to all writes.
- It must not rely on caller-provided ownership.
- Existing Phase A manually validates every garment against auth.uid() before creating the group, so its core ownership check remains useful even when nested under a definer effective role.
- The outer definer must perform equivalent ownership assignment/validation for wardrobe inserts.
- Tests must verify cross-user item IDs fail without revealing whether foreign rows exist.

FORCE ROW LEVEL SECURITY does not constrain superusers/BYPASSRLS roles and therefore does not make a postgres-owned definer safe by itself.

### Calling unchanged Phase A RPC

The outer function may invoke:

    SELECT * INTO v_group
    FROM public.create_garment_group(...);

The inner SECURITY INVOKER function uses the outer function’s effective database role, but auth.uid() remains the requesting user. Its explicit checks require at least two distinct IDs and verify all rows have user_id = auth.uid(). PostgreSQL does not start an autonomous transaction for the nested call. The existing Phase A function can remain unchanged.

### Error handling

- Validate authentication, operation shape, item count/IDs, canonical payload, and relationship inputs before writes.
- Conflicting replay raises a stable documented exception before business writes.
- Do not swallow constraint, RLS, Phase A, or operation-record errors.
- If an exception handler maps errors, it must RAISE again so the transaction aborts.
- Never return partial success.
- Avoid including canonical payload or foreign-row details in errors.
- Direct PostgREST may expose SQLSTATE/message; an eventual server wrapper may map known conflict/auth codes without changing transaction semantics.

### Privilege-escalation prevention

- Revoke function EXECUTE from PUBLIC and anon; grant only authenticated.
- Do not grant authenticated membership in the function-owner role.
- Revoke CREATE from untrusted roles on schemas used for object resolution where applicable.
- Use search_path=pg_catalog and fully qualified object names.
- Avoid dynamic SQL and unsafe polymorphic caller-controlled types.
- Reject extra/unrecognized payload fields during canonicalization or ignore them consistently outside the authoritative payload; do not execute them.
- Cap item count and canonical payload size to prevent resource abuse; exact limits require architecture approval.
- Use a transaction-scoped advisory lock keyed by both auth.uid() and operation_id to prevent same-operation races.
- Audit the function owner’s privileges and every referenced function for unsafe definer chaining.

### Account deletion

The operation table’s owner FK cascades on user_profiles deletion. service_role requires only the approved deletion/read privileges. The definer RPC does not expose operation deletion. Both explicit account-deletion flows should include the table if defense-in-depth parity is approved.

## Alternative security boundary if genuinely required

The only additional boundary justified by the current system is the non-exposed private-schema SECURITY INVOKER design described above. It avoids SECURITY DEFINER privilege escalation but makes PostgREST schema exposure a security control.

| Property | Private-schema SECURITY INVOKER | Locked-table SECURITY DEFINER |
|---|---|---|
| Atomicity | One RPC transaction; same as definer | One RPC transaction |
| Replay correctness | Same canonical record and lock model | Same canonical record and lock model |
| Authoritative record | Depends on operation schema remaining non-exposed | Enforced by no client table-write ACL plus privileged function |
| auth.uid() | Native caller RLS context | Must be explicitly derived and checked under changed effective role |
| RLS | Primary per-row enforcement | Defense in depth when owner bypass applies |
| Table ACL | authenticated requires function-use DML privileges; API exposure must block direct table route | authenticated receives no table privileges |
| Function ACL | EXECUTE authenticated only | EXECUTE authenticated only |
| Main failure mode | Schema/config drift exposes direct fabrication path | Definer bug/search-path/dynamic-SQL flaw escalates privileges |
| Migration/config impact | New schema/table/RLS/grants/function plus verified PostgREST exposure config | New table/RLS/grants/definer function and owner audit |
| Implementation complexity | Database plus deployment-configuration validation | Database privilege/code audit; no exposed-schema dependency |
| Phase A compatibility | Directly aligned with existing invoker RPC | Existing Phase A remains unchanged but runs under definer effective role; explicit auth.uid checks remain |
| Account deletion | Private-table service deletion/cascade must be wired and tested | Public locked-table service deletion/cascade must be wired and tested |

No client compensation, signed Storage marker, session variable, trigger-only origin check, stable IDs alone, or canonical hash alone provides equivalent guarantees.

This comparison does not automatically select a design. Approval must choose which risk boundary the project accepts: configuration exposure drift or narrowly audited definer privilege.

## Exact privilege model

The following is the exact minimum privilege model for the recommended locked-table definer contract. The private-schema invoker variation necessarily grants authenticated function-use SELECT/INSERT on the non-exposed operation table and must compensate with API exposure controls.

### Operation table: public.multi_item_persistence_operations

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER | MAINTAIN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| PUBLIC | No | No | No | No | No | No | No | No |
| anon | No | No | No | No | No | No | No | No |
| authenticated | No | No | No | No | No | No | No | No |
| service_role | Yes | No | No | Yes | No | No | No | No |
| function owner | Yes | Yes | No | No, except ownership/cascade administration as unavoidable | No | Minimum required | No | No |

Notes:

- Client replay occurs through the orchestration RPC; direct SELECT is unnecessary.
- service_role SELECT/DELETE matches the existing account-deletion convention. If DELETE alone is proven sufficient for the Supabase client deletion call, SELECT may be removed after testing.
- The function never needs UPDATE because it inserts only completed rows.
- Default privileges must be reconciled explicitly after creation so anon/authenticated do not inherit broad privileges.
- Table ownership inherently carries powers beyond ACL display; function owner choice must be audited separately.

### Orchestration function

| Role | EXECUTE |
|---|---:|
| PUBLIC | No |
| anon | No |
| authenticated | Yes |
| service_role | No required grant |
| function owner | Yes by ownership |

Explicit behavior:

- REVOKE ALL from PUBLIC.
- Revoke any inherited/default EXECUTE from anon and service_role if present.
- Grant EXECUTE only to authenticated.
- Do not expose helper functions. If helpers are unavoidable, place them in a non-exposed schema, revoke PUBLIC, and grant only to the function owner.

### Existing business tables/functions

- Do not broaden wardrobe_items, garment_groups, or garment_group_members client ACLs for the operation record.
- Do not modify existing Phase A function grants.
- The definer owner must already have or receive only the privileges required by the approved owner pattern.
- Do not copy the live wardrobe_items residual anon TRUNCATE/REFERENCES/TRIGGER privileges to the new table.

## Exact RLS model

### Locked-table SECURITY DEFINER design

- ENABLE ROW LEVEL SECURITY on public.multi_item_persistence_operations.
- No PUBLIC policy.
- No anon policy.
- No authenticated INSERT, UPDATE, or DELETE policy.
- No authenticated SELECT policy because replay is through the RPC.
- service_role relies on its managed BYPASSRLS behavior plus explicit table ACL for account deletion; this must be verified in a disposable environment.
- The definer function’s owner may bypass RLS. The function’s explicit auth.uid() ownership assignment is therefore mandatory.

If direct owner inspection is later approved, add only:

    SELECT TO authenticated
    USING (auth.uid() = user_id)

and grant table SELECT only. This does not permit fabrication but expands metadata exposure and is not required for replay.

### Private-schema SECURITY INVOKER design

- ENABLE ROW LEVEL SECURITY.
- INSERT policy for the function’s authenticated execution context: WITH CHECK (auth.uid() = user_id).
- SELECT policy: USING (auth.uid() = user_id), because replay lookup occurs under caller context.
- No UPDATE policy.
- No client DELETE policy; account deletion uses service_role/cascade.
- The function derives user_id; however, if the schema becomes API-exposed, the same policies would allow direct same-owner record fabrication. Non-exposure is therefore part of the security boundary.

### Business rows

The existing Phase A owner checks, RLS policies, composite ownership foreign keys, and constraints remain unchanged. B0.2 adds no policy to existing tables.

## Replay security model

### First execution

1. Authenticate and derive v_user_id from auth.uid().
2. Canonicalize/validate durable intent.
3. Lock (v_user_id, operation_id) for the transaction.
4. Find no completed record.
5. Reject any pre-existing item IDs not accounted for by exact replay.
6. Insert all wardrobe rows, call unchanged Phase A, insert completed operation record.
7. Return:

    {
      operation_id,
      outcome: 'committed',
      replayed: false,
      item_ids,
      group_id,
      completed_at
    }

### Exact replay

Condition:

    same auth.uid()
    + same operation_id
    + same payload_version
    + JSONB-equal server-canonicalized payload

Behavior:

- Return the original item IDs, group ID, and completion time.
- Set outcome='replayed', replayed=true.
- Perform no wardrobe/group/member/operation writes.
- Do not return canonical payload.

### Conflicting replay

Condition:

    same auth.uid() + same operation_id + different canonical payload/version

Behavior:

- Reject before business writes.
- Preserve original operation and business rows.
- Raise stable SQLSTATE 22023 with a generic operation_id reuse conflict message.
- Do not reveal the original payload or row values.

### Forged operation ID

An operation UUID is not authorization. A caller may choose any UUID for a new owner-scoped operation. It becomes authoritative only after the RPC commits the complete transaction. Preclaiming an operation ID under the same account is prevented by the locked operation table’s no-client-write ACL. Another account may use the same UUID because the primary key is owner-scoped; it cannot access or interfere with the first account’s row.

### Concurrent identical requests

- Both derive the same owner/operation lock key.
- One transaction proceeds.
- The other waits.
- If the first commits, the waiter reads the completed record and returns replayed.
- If the first rolls back, the waiter sees no record and may perform the first successful execution.
- Exactly one committed operation/group/item set results.

### Concurrent conflicting requests

- The operation lock serializes them.
- If the first commits, the second compares its different canonical payload and fails with conflict.
- If the first rolls back, whichever request next acquires the lock may become the committed definition of that operation ID.
- Clients must persist the original canonical intent before dispatch so their own retries do not conflict.

### Retry after timeout

- Never infer rollback from timeout.
- Keep deterministic Storage objects and pending manifest.
- Replay exactly the same operation ID, item IDs, payload, and payload version after authentication is restored.
- Committed first call returns replay; rolled-back/never-received call executes once.

### Retry after application restart

- Restore the local pending manifest.
- Verify the current authenticated user equals manifest owner.
- Reuse operation/item IDs and canonical durable intent.
- Do not reclassify or regenerate IDs as part of persistence replay.

### Replay after group deletion

- The completed operation row remains because group_id is historical and has no FK cascade to garment_groups.
- Exact replay returns the original group ID with replayed=true.
- It does not recreate the group or memberships.
- Client reload observes that the group no longer exists.

### Replay after individual garment deletion

- The operation row remains; item_ids are historical and not array foreign keys.
- Exact replay returns the original IDs and does not recreate the deleted garment.
- Client reload observes current wardrobe state.

### Account deletion

- Storage is removed first by current account-deletion flows.
- Explicit operation-row deletion and/or user_profiles cascade removes the operation record.
- Business rows and auth user are deleted.
- No subsequent authenticated replay is possible.

## Transaction boundary

The locked-table SECURITY DEFINER version uses one PostgREST RPC transaction:

    BEGIN  -- implicit

      v_user_id := auth.uid();
      IF v_user_id IS NULL THEN RAISE 42501; END IF;

      validate operation_id, payload_version, item count,
        item UUIDs, relationship inputs, and payload size;

      canonicalize durable payload server-side;

      acquire transaction-scoped advisory lock for
        (v_user_id, operation_id);

      SELECT completed operation
      FROM public.multi_item_persistence_operations
      WHERE user_id = v_user_id
        AND operation_id = p_operation_id;

      IF record exists AND canonical payload/version match THEN
        RETURN stored IDs/outcome=replayed;  -- no writes
      ELSIF record exists THEN
        RAISE SQLSTATE 22023 conflict;       -- no writes
      END IF;

      verify proposed item IDs do not already exist;

      INSERT all N public.wardrobe_items rows
        in one set-based statement with user_id = v_user_id;

      SELECT * INTO v_group
      FROM public.create_garment_group(...);

      -- unchanged Phase A function inserts:
      --   one public.garment_groups row
      --   N public.garment_group_members rows

      INSERT one public.multi_item_persistence_operations row
        containing only the completed immutable result;

      RETURN committed result;

    COMMIT  -- implicit only on successful function return

Any failure during wardrobe insert, Phase A validation/group/member insertion, or operation-record insertion aborts the RPC statement and rolls back every write. PostgreSQL nested function calls are not autonomous transactions, so unchanged create_garment_group participates in the outer transaction.

The function must not catch errors and return success. The completed operation insert is last so no pending/failure row can survive a rolled-back transaction.

## Storage boundary

Storage remains outside PostgreSQL and is unchanged by B0.2.

### Deterministic paths

- Per-item images: wardrobe-images/{userId}/{itemId}.jpg or .png.
- Optional shared source: a deterministic flat path such as wardrobe-images/{userId}/{operationId}-source.jpg.
- Paths use stable IDs from the pending manifest.
- Signed URLs are generated for display only and never enter canonical payload or operation record.

### Pending manifest

Before upload, persist locally:

- owner user ID;
- operation ID;
- payload version;
- stable item IDs;
- expected Storage paths;
- canonical durable database intent;
- upload/RPC stage.

The manifest is client recovery state, not an authoritative completion record.

### cleanup_pending

- If an upload fails before RPC, make no database call and remove successful partial uploads.
- If cleanup fails, retain cleanup_pending paths locally and retry deletion later.
- If the database definitively rejects, remove operation objects and retain cleanup_pending on deletion failure.
- Orphan Storage objects must never be converted into fabricated completed operation rows.

### Timeout behavior

- On unknown RPC outcome, do not delete uploaded objects.
- Keep the manifest and replay the exact RPC after backoff/auth refresh.
- Delete the manifest only after definitive committed/replayed response and successful local state reconciliation.

### Account deletion

- Existing deletion routes remove user-prefixed wardrobe-images before database/auth deletion.
- Keep paths flat unless account deletion is upgraded to verified recursive listing.
- Operation records cascade/explicitly delete with account data.
- cleanup_pending local state should be cleared only after account deletion success; a failed deletion preserves local recovery information consistent with current UI behavior.

## Failure/concurrency matrix

| Threat/failure | Expected enforcement | Result |
|---|---|---|
| Client directly INSERTs fabricated completed record | No authenticated INSERT ACL; no INSERT RLS path in definer design | Permission denied; no row |
| Client UPDATEs payload, group ID, item IDs, completion | No UPDATE ACL/policy; optional reject-update trigger | Permission denied; row unchanged |
| Client DELETEs completed record | No authenticated DELETE ACL/policy | Permission denied; row remains |
| Client uses forged user_id in payload | Function ignores/rejects it and derives auth.uid() | All writes owned by auth.uid(); no forged owner |
| Client supplies cross-user item ID | Pre-existing-ID/ownership check plus Phase A ownership/composite FKs | Generic authorization/conflict failure; full rollback |
| Client fabricates group_id result | group_id is captured from Phase A return, never accepted as authoritative in selected existing-RPC contract | Impossible through RPC; no client table write |
| First execution succeeds | One transaction commits N items, one group, N members, one operation record | committed response |
| Wardrobe item 1 fails | Exception propagates | Zero committed rows |
| Wardrobe item 2+ fails | Earlier same-transaction item writes roll back | Zero committed rows |
| Phase A group validation/insert fails | Exception propagates | Wardrobe writes roll back; zero operation row |
| Membership insert fails | Phase A and outer transaction roll back | Zero business/operation rows |
| Operation-record insert fails | Last write fails and aborts transaction | Items/group/members roll back |
| Exact replay | Lock, record lookup, JSONB equality | Original result; zero writes |
| Conflicting replay | Lock then inequality check | SQLSTATE 22023; original unchanged |
| Concurrent identical calls | Same owner-operation advisory lock | One commit, one replay |
| Concurrent conflicting calls | Same lock | First successful definition wins; later mismatch conflicts |
| Timeout before request reaches DB | No record | Exact retry performs first execution |
| Timeout during transaction followed by rollback | No visible record | Exact retry executes |
| Timeout after commit | Completed record exists | Exact retry returns replay |
| Auth expired before RPC | auth.uid() null | SQLSTATE 42501; zero writes |
| App restarts | Local pending manifest survives | Same request replayed |
| Replay after group deletion | Historical record retained without group FK | Return historical IDs; do not recreate |
| Replay after garment deletion | Historical item_ids retained | Return historical IDs; do not recreate |
| Another user uses same operation UUID | Owner-scoped primary key/RLS/function owner derivation | Independent owner operation; no interference |
| Search-path poisoning | search_path=pg_catalog plus qualified objects, no dynamic SQL | Attacker object not resolved |
| Function argument used as SQL identifier/code | Static SQL only | No injection/privilege escalation |
| anon calls function | No EXECUTE grant | Permission denied |
| service_role fabricates records directly | No INSERT/UPDATE ACL | Not permitted by intended ACL; deletion only |
| Account deletion | Storage cleanup, explicit deletion/cascade, auth deletion | No record/business rows; replay unavailable |

## Migration implications

No migration was created or applied in B0.2.

If locked-table SECURITY DEFINER is approved, one additive migration would eventually need to:

1. Create public.multi_item_persistence_operations with the exact contract above.
2. Revoke all inherited/default table privileges from PUBLIC, anon, authenticated, and service_role before adding the exact grants.
3. Enable RLS with no client policies unless direct SELECT is separately approved.
4. Add only the operation-table checks and primary key specified above.
5. Optionally add an UPDATE-rejection trigger; do not add a DELETE trigger that breaks account cascade.
6. Create the orchestration function with SECURITY DEFINER, search_path=pg_catalog, fully qualified static SQL, stable return/error contract, and exact owner.
7. Revoke function EXECUTE from PUBLIC/anon/service_role and grant only authenticated.
8. Grant service_role SELECT/DELETE on the operation table only if required by tested account-deletion behavior.
9. Reconcile default privileges so TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, and UPDATE are absent for client/service roles.
10. Leave both Phase A migrations and create_garment_group(...) unchanged.

If private-schema SECURITY INVOKER is approved, the migration/configuration set also needs:

- a dedicated operation schema;
- verified exclusion from PostgREST exposed schemas in development and production;
- exact schema USAGE/table SELECT+INSERT grants needed by authenticated invocations;
- owner RLS policies;
- tests proving direct API table access is impossible;
- configuration-drift monitoring and deployment validation.

A dedicated function-owner role for the definer alternative requires a separate privilege/RLS design. Do not add it casually: current Phase A policies target authenticated, and the existing Phase A function is SECURITY INVOKER. The owner must have exactly the effective privileges and RLS policy membership needed for the nested call.

## Exact files that would eventually change

This is the eventual implementation boundary only. B0.2 changed none of these files.

### Locked-table SECURITY DEFINER contract

- supabase/migrations/<new_phase_b_operation_security_migration>.sql — operation table, RLS, exact ACLs, immutable-update protection if approved, orchestration function, owner and EXECUTE grants. Existing Phase A migrations remain untouched.
- lib/database.ts — typed awaited RPC wrapper and mapping for committed, replayed, conflict, authentication, and constraint outcomes.
- server/routes.ts — add operation table to both explicit account-deletion table lists if defense-in-depth cleanup is approved; add HTTP error mapping only if the product chooses a server wrapper instead of direct RPC.
- A new focused database contract/integration test file under __tests__/ — privilege probes, forgery attempts, rollback injection, exact/conflicting/concurrent replay, cross-user cases, search-path safety, account deletion, and Phase A regression.
- __tests__/garmentGroups.test.ts — Phase A compatibility assertions only if this existing file is the project’s accepted location; do not rewrite Phase A behavior.

### Private-schema SECURITY INVOKER contract

- The same new migration, with private schema/table/invoker ACLs instead of public locked-table/definer ACLs.
- Supabase/PostgREST exposed-schema configuration managed outside the current repository, plus deployment validation documentation.
- The same lib/database.ts, account-deletion, and test boundaries.

### Later client integration after architecture approval

- A focused lib module for pending manifests, canonical request creation, replay, and cleanup_pending.
- lib/storage.ts only if a narrow helper is needed; existing deterministic per-item paths/upsert should be reused.
- contexts/AppContext.tsx only for an awaited post-commit state update. Existing fire-and-forget addWardrobeItem is not the authoritative boundary.
- The later approved multi-item caller. B0.2 does not modify UI files or start B1.

### Must remain unchanged for this contract

- supabase/migrations/20260918000000_garment_groups.sql
- supabase/migrations/20260918223816_reconcile_garment_group_table_acls.sql
- WardrobeItem type
- Recommendation Engine v3.7
- classifier/Gemini
- taxonomy
- UI during B0.2
- Storage objects/configuration during B0.2
- frozen benchmarks

## Required architecture decisions

Explicit approval is required for:

1. Locked-table SECURITY DEFINER versus private-schema SECURITY INVOKER.
2. If definer: postgres owner versus a separately designed dedicated NOLOGIN executor role.
3. If invoker: the exact non-exposed schema and how exposed-schema configuration is versioned, audited, and verified in production.
4. Whether completed operation records are accessible only through RPC or also owner-readable by direct SELECT.
5. Whether service_role needs SELECT+DELETE or DELETE only on operation records.
6. Whether both explicit account-deletion lists must include the table in addition to FK cascade.
7. Account-lifetime retention versus bounded retention plus immutable tombstone.
8. Replay after later user deletion: historical completed response without recreation, or a distinct expired/deleted outcome.
9. Maximum item count and canonical-payload byte size.
10. Canonical payload normalization details and versioning process.
11. Exact SQLSTATE/message and direct-PostgREST versus server HTTP error mapping.
12. Advisory-lock key derivation and acceptable contention/collision behavior.
13. Whether an UPDATE-rejection trigger is required in addition to no UPDATE ACL.
14. Whether a distinct group source image is required.
15. cleanup_pending retry lifetime and orphan observability.
16. Whether the pre-existing wardrobe_items residual ACL/policy findings block Phase B rollout or become a separate hardening task.

## Recommended implementation contract

Subject to architecture approval, the recommended contract for the current public-schema/direct-PostgREST architecture is:

1. Use public.multi_item_persistence_operations as an immutable completed-only operation record.
2. Use PRIMARY KEY (user_id, operation_id), with ownership derived from auth.uid().
3. Retain canonical JSONB, payload version, stable item IDs, generated Phase A group ID, and completion time for the account lifetime.
4. Give authenticated no direct operation-table privileges or RLS write path.
5. Expose one narrowly audited SECURITY DEFINER orchestration RPC to authenticated only.
6. Use search_path=pg_catalog, fully qualify every application object, use static SQL only, and accept no authoritative user_id/group result from clients.
7. Serialize by owner+operation ID, compare canonical JSONB exactly, and return committed/replayed outcomes with stable IDs.
8. Insert all wardrobe rows, call unchanged public.create_garment_group(...), then insert the completed record in one transaction.
9. Let every error propagate so all database writes roll back.
10. Keep Storage before/outside the transaction with deterministic paths, a durable local pending manifest, cleanup_pending, and no cleanup on unknown commit outcome.
11. Preserve historical operation records after group/item deletion and never recreate deliberately deleted business rows on replay.
12. Delete operation records only through account deletion or a separately approved retention mechanism.
13. Add exhaustive ACL/RLS/forgery/concurrency/rollback/search-path tests before migration rollout.
14. Keep Phase A, WardrobeItem, v3.7, classifier, taxonomy, UI, Storage, and benchmarks unchanged.

Why this contract is recommended rather than silently selected: it avoids making PostgREST exposed-schema configuration part of the authoritative-write boundary. The private-schema invoker remains viable if architecture prefers RLS-native caller execution and accepts configuration exposure as a tested security control. Approval must choose between those risk models before implementation.

## Confirmation of zero changes

B0.2 was performed as a read-only architecture/security investigation.

Confirmed:

- The complete attached specification was read before work began.
- No application code was modified.
- No migration was created, changed, or applied.
- No database table, row, function, policy, ACL, trigger, role, or configuration was modified.
- Supabase access was limited to read-only project/catalog inspection.
- No Storage object, bucket, policy, or configuration was modified.
- Phase A and create_garment_group(...) were not modified.
- WardrobeItem was not modified.
- Recommendation Engine v3.7 was not modified.
- Classifier/Gemini was not modified.
- Taxonomy was not modified.
- UI was not modified.
- Tests and benchmarks were not modified or run.
- B1 was not started.
- No workflow, package, secret, or environment variable was changed.

The only user-created working-tree input for this task is:

    attached_assets/Pasted-D-2-B0-2-Operation-Record-Security-Transactional-RPC-Bo_1789774720831.txt

This report is the sole generated deliverable.
