# D.2 B0.1 — Transactional Multi-Item Persistence Architecture

Read-only architecture specification. Prepared from the complete attached B0.1 brief, the approved Phase B report, repository code and migrations, and read-only production catalog inspection on 2026-09-19.

## Current persistence architecture

### Wardrobe rows

Observed in current code and the live database:

- public.wardrobe_items has PRIMARY KEY (id). The id column is uuid NOT NULL with default gen_random_uuid().
- Phase A added UNIQUE (user_id, id) so garment membership can use an ownership-safe composite foreign key.
- user_id is NOT NULL and references public.user_profiles(id) ON DELETE CASCADE.
- The repository does not contain the original CREATE TABLE for wardrobe_items; the primary key and current columns were therefore confirmed through a read-only pg_catalog/information_schema query.
- lib/database.ts insertWardrobeItem performs one standalone PostgREST insert, then appends the returned ID to AsyncStorage. It is not part of a wider database transaction.
- contexts/AppContext.tsx addWardrobeItem updates React state and AsyncStorage optimistically, then starts insertWardrobeItem without awaiting it. Database failure is logged but is not returned to the caller.
- app/add-item.tsx and app/bulk-review.tsx generate fresh item UUIDs with Crypto.randomUUID(). Bulk save processes items independently.

### Phase A groups and memberships

public.garment_groups currently has:

- PRIMARY KEY (id), with id defaulting to gen_random_uuid();
- UNIQUE (user_id, id);
- user_id referencing user_profiles(id) ON DELETE CASCADE;
- constrained relationship_type, relationship_confidence, confirmation_status, shared_attributes, and source_image_path;
- a check requiring relationship_confidence for ai_inferred groups.

public.garment_group_members currently has:

- PRIMARY KEY (group_id, garment_id);
- composite FOREIGN KEY (user_id, group_id) to garment_groups(user_id, id) ON DELETE CASCADE;
- composite FOREIGN KEY (user_id, garment_id) to wardrobe_items(user_id, id) ON DELETE CASCADE.

These composite foreign keys prevent cross-account group membership even if an application caller supplies another user’s IDs.

### Existing Phase A RPC

public.create_garment_group(...) is PL/pgSQL SECURITY INVOKER. It:

1. Derives ownership from auth.uid().
2. Rejects unauthenticated requests.
3. Requires at least two non-null garment IDs.
4. Rejects duplicate garment IDs.
5. Verifies that every garment belongs to auth.uid().
6. Inserts one garment_groups row.
7. Inserts every garment_group_members row.
8. Returns the created group.

The group and membership inserts are atomic within that RPC invocation. It does not insert wardrobe rows and it generates a fresh group ID on every successful invocation.

A new PostgreSQL orchestration function can call public.create_garment_group(...) without modifying it. PostgreSQL function calls do not open autonomous transactions: the inner Phase A function’s group/member writes participate in the outer RPC’s transaction. Because both functions are SECURITY INVOKER, auth.uid(), table privileges, RLS, constraints, and ownership checks remain effective.

### Current Storage behavior

- uploadWardrobeImage writes to the private wardrobe-images bucket at {userId}/{itemId}.jpg or .png.
- Upload uses upsert:true, so retrying the same item ID and extension rewrites the same object rather than creating another object.
- The helper returns a one-hour signed URL and a durable storagePath. Only the durable path is safe for database persistence.
- Storage uploads and PostgreSQL writes are independent systems and cannot share one transaction.
- Current single-item code may retain a local file after authenticated Storage failure and still add the item optimistically. That fallback is not suitable for an atomic authenticated multi-item operation.

### Account deletion

- Both in-app and web deletion flows remove user-prefixed Storage objects first, explicitly delete child database tables before parent rows, delete user_profiles, then delete auth.users.
- garment_group_members, garment_groups, and wardrobe_items are already in the explicit deletion order.
- The database foreign keys also cascade wardrobe/group rows from user_profiles as defense in depth.
- Any new operation record must reference user_profiles ON DELETE CASCADE. If an idempotency table is approved, both explicit server deletion table lists should also include it before user_profiles so existing defense-in-depth semantics remain consistent.

### Current security posture relevant to B0.1

- wardrobe_items, garment_groups, and garment_group_members have owner-scoped RLS using auth.uid() = user_id.
- Authenticated users have normal CRUD on garment group tables; service_role has SELECT and DELETE only; anon has no garment-group table access.
- Execute on create_garment_group is revoked from PUBLIC and granted to authenticated.
- The live catalog contains duplicate historical owner policies on wardrobe_items, including a public ALL policy with the same owner predicate. It also reports anon privileges such as TRUNCATE/REFERENCES/TRIGGER on wardrobe_items. These are pre-existing ACL-hardening concerns, not created by Phase B. They should not be copied to a new operation table. This report does not claim exploitability and makes no ACL changes.

## Required atomicity invariant

For one authenticated multi-item persistence operation, the only acceptable committed business states are:

    Success:
      N new wardrobe_items
      + exactly one garment_groups row
      + exactly N garment_group_members rows
      + one replay identity/result, if the selected design uses an operation record

    Failure:
      zero new wardrobe_items
      + zero new garment_groups
      + zero new garment_group_members
      + no completed replay result

The invariant applies to PostgreSQL. Storage objects are outside it and require the separate protocol defined below.

Additional requirements:

- Every wardrobe row and the group must belong to the authenticated user derived from auth.uid().
- The operation must reject duplicate item IDs and fewer than two items before business writes.
- A group/member error must roll back the preceding wardrobe inserts.
- No client-side compensating delete may be treated as the primary atomicity mechanism.
- Exact replay must not create a second group or second set of wardrobe rows.
- Conflicting reuse of an operation identity must never overwrite or reinterpret the original operation.

The existing client sequence does not meet this invariant because item writes are standalone, optimistic, and not awaited.

## Operation identity model

The following is the exact operation contract required regardless of which approved persistence mechanism stores or reconstructs it.

### Format and generation

- operationId is a UUID v4 generated by the authenticated client before any Storage upload or database write.
- It is generated once per logical save operation, not once per attempt.
- The client persists a pending operation manifest locally before starting I/O.
- Operation identity is the pair (auth.uid(), operationId). This allows UUID reuse by different accounts without exposing one account’s operation to another.
- operationId is not a garment ID, source-image path, signed URL, or classifier request ID.

### Canonical database payload

The replay comparison covers only durable database intent, not transient signed URLs or image bytes. Before comparison, the RPC constructs canonical JSONB containing:

- a payload schema version;
- every client-generated item ID;
- every exact wardrobe_items value to be inserted, with omitted/defaultable values normalized consistently to explicit nulls or documented defaults;
- relationship type, confidence, confirmation status, shared attributes, and durable source_image_path;
- membership IDs sorted by UUID;
- item objects sorted by item ID.

JSONB equality is the authority for same versus different payload. Storing canonical JSONB avoids relying on a hash alone and avoids object-key ordering differences. A digest may be added as an optimization, but cannot replace the authoritative canonical payload comparison unless collision handling is explicitly accepted.

### Ownership and lifecycle

- The RPC ignores any supplied user_id and assigns auth.uid() to all rows.
- An operation record, if selected, is owner-scoped and references user_profiles(id) ON DELETE CASCADE.
- A completed operation is immutable. It may be selected by its owner and deleted only through approved retention/account-deletion mechanisms.
- To guarantee replay for the account’s lifetime, retain the operation identity and canonical payload until account deletion.
- A bounded retention period weakens the replay guarantee. If approved, an immutable tombstone containing at least owner, operation ID, canonical-payload fingerprint/version, and expiry outcome must remain long enough to prevent the same ID from silently creating a new logical operation. The exact retention duration is an architecture/privacy decision.

### Concurrency

The database must serialize attempts for the same (user, operationId). An orchestration implementation can take a transaction-scoped advisory lock derived from both values before checking replay state. Hash collisions only serialize unrelated calls; they do not alter data correctness.

With an operation-record design, the simpler visible rule is:

- first caller holds the operation lock and completes or rolls back;
- concurrent identical caller waits, then observes the committed record and returns replay;
- if the first caller rolls back, the waiting caller observes no record and may execute the operation.

## Item/group identity model

### Item identity

- The client generates every WardrobeItem UUID at operation creation, before Storage upload.
- IDs are stored in the local pending manifest and included in canonical payload.
- All retries reuse the same item IDs.
- The RPC rejects null IDs, duplicate IDs, IDs already owned by another user, and pre-existing IDs that are not an exact replay of the same completed operation.
- Because wardrobe_items has a global PRIMARY KEY (id), accidental cross-user reuse also fails at the database constraint even though operation IDs are owner-scoped.

### Group identity

Two viable identity mechanisms exist and require architecture approval:

1. Existing-Phase-A identity: create_garment_group generates the group UUID during the first successful transaction. The operation result stores that UUID. Exact replay returns the stored UUID, making it stable across retries without changing Phase A.
2. Stable supplied identity: the client or database deterministically assigns a group UUID before writes and a new additive entry point accepts it. Exact replay locates the group by that ID and compares all persisted intent. The current Phase A RPC cannot do this because it always generates the ID.

Under the first mechanism, operation and group are one-to-one but have different UUIDs. Under the second, they may be different stable UUIDs or deliberately the same UUID; reusing one value reduces identifiers but couples operation retention to group lifecycle and requires explicit approval.

Deletion semantics matter: if a user later deletes a group/item, a retained operation record should represent historical completion and must not recreate deleted business rows on replay. The replay response should return the original IDs plus a completed/replayed outcome; the client then loads current state and may find those rows were subsequently deleted.

## Transaction boundary

PostgREST executes one RPC call inside one PostgreSQL transaction. The intended boundary for an orchestration-plus-operation-record design is:

    BEGIN  -- implicit for the RPC call

      v_user_id := auth.uid();
      reject if unauthenticated;
      validate operation UUID, item count, item UUID uniqueness,
        canonical payload shape, and Phase A inputs;

      acquire transaction-scoped lock for (v_user_id, operation_id);

      SELECT existing completed operation for
        (v_user_id, operation_id);

      IF existing operation exists THEN
        IF existing.canonical_payload = requested.canonical_payload THEN
          RETURN original item IDs, original group ID,
            outcome = 'replayed', replayed = true;
        ELSE
          RAISE conflicting-operation exception;
        END IF;
      END IF;

      INSERT all N public.wardrobe_items rows in one set-based statement,
        assigning user_id = v_user_id;

      SELECT * INTO v_group
      FROM public.create_garment_group(
        p_garment_ids,
        p_relationship_type,
        p_relationship_confidence,
        p_confirmation_status,
        p_shared_attributes,
        p_source_image_path
      );

      -- The Phase A function performs:
      --   INSERT one public.garment_groups row
      --   INSERT N public.garment_group_members rows

      INSERT one completed operation record containing:
        v_user_id,
        operation_id,
        canonical_payload,
        ordered item IDs,
        v_group.id,
        completed_at;

      RETURN item IDs, group ID,
        outcome = 'committed', replayed = false;

    COMMIT  -- implicit only if the function returns successfully

Every database write inside the boundary is therefore:

1. N wardrobe_items inserts.
2. One garment_groups insert inside the existing Phase A RPC.
3. N garment_group_members inserts inside the existing Phase A RPC.
4. One completed idempotency-operation insert, if that design is approved.

Any unhandled exception rolls back all four categories. The orchestration function must not catch write errors and then return success. If errors are translated, translation must re-raise so PostgreSQL aborts the transaction.

A stable-ID/no-operation-table design uses the same business transaction but replaces the completed operation insert with exact comparison against rows found by the supplied stable item/group IDs. It must still serialize same-operation attempts.

## Storage/database boundary

### Before the database transaction

1. Generate operationId and all item IDs once.
2. Build and durably save a local pending manifest containing owner ID, operation ID, item IDs, expected Storage paths, canonical database intent, and stage.
3. Upload every required per-item image to deterministic existing-bucket paths: {userId}/{itemId}.jpg or .png.
4. If a group source image is required, use a deterministic flat existing-bucket path such as {userId}/{operationId}-source.jpg. Do not create a new bucket or store a signed URL.
5. Because uploads use stable paths and upsert:true, retry resumes or rewrites the same objects.
6. Do not call the database RPC until every required upload has succeeded and every durable path is known.

### Storage failure before the RPC

- Do not perform database writes.
- Attempt to remove all objects uploaded by that operation.
- If cleanup fails, keep the local manifest marked cleanup_pending and retry deletion later.
- An orphaned object is preferable to partial relational state, but orphan cleanup must be observable and bounded.

### After calling the RPC

- Definitive committed/replayed response: retain Storage objects, refresh/load committed database rows, then delete the local pending manifest.
- Definitive database rejection before commit: remove operation Storage objects; retain cleanup_pending locally if deletion fails.
- Client timeout or network loss: do not delete Storage objects because the database may have committed. Retry the same RPC with the same operation ID, item IDs, and payload until the response is definitive.
- App termination: local manifest survives and drives resume/reconciliation after restart.
- User changes account: never replay or delete objects through a different account. Resume only after the original owner authenticates; Storage RLS and database ownership remain authoritative.

### Account deletion and cleanup

Flat paths are required because current account deletion lists the user prefix and removes returned objects. A new nested directory layout would need separately verified recursive deletion. Any operation record must cascade from user_profiles and be included in both explicit account-deletion table lists if the idempotency-table design is selected.

## Replay/idempotency semantics

### Same operation plus same payload

Database comparison:

    existing.owner = auth.uid()
    AND existing.operation_id = request.operation_id
    AND existing.canonical_payload = canonicalize(request.payload)

Expected database response:

    {
      operation_id: UUID,
      outcome: 'replayed',
      replayed: true,
      item_ids: UUID[],
      group_id: UUID,
      completed_at: timestamptz
    }

Behavior:

- Return the original committed IDs.
- Perform zero new business writes.
- Do not upload new Storage objects; the client reuses deterministic paths.
- HTTP transport should map this normal RPC result to 200.

### Same operation plus different payload

Expected database behavior:

- Raise an exception before any business write.
- Use a stable application-recognizable SQLSTATE/message contract, for example SQLSTATE 22023 with message operation_id reused with different payload.
- The API layer maps it to a non-retryable conflict response, preferably HTTP 409 if a server route wraps the RPC; direct PostgREST clients must map the documented SQL error code/message.
- Preserve the original committed operation and business rows unchanged.
- Return no foreign or original payload contents in the error.

### First execution

Expected database response:

    {
      operation_id: UUID,
      outcome: 'committed',
      replayed: false,
      item_ids: UUID[],
      group_id: UUID,
      completed_at: timestamptz
    }

### Unknown commit outcome

For client → RPC → timeout:

1. The client keeps the pending manifest and Storage objects.
2. It retries the exact same request; it does not generate IDs or reclassify.
3. If the first transaction committed, the retry finds the completed operation and returns replayed with the original IDs.
4. If the first transaction rolled back or never reached PostgreSQL, no completed operation exists and the retry executes normally.
5. If the first transaction is still running, same-operation serialization makes the retry wait for its outcome. Client-side exponential backoff prevents repeated concurrent retries.
6. After application restart, the persisted local manifest supplies the same owner, operation ID, item IDs, paths, and canonical intent.

The client must never interpret transport timeout as database failure and must never clean up Storage until database outcome is definitive.

## Failure matrix

| Scenario | Database result | Storage/client result | Retry behavior |
|---|---|---|---|
| First item insert fails | Entire RPC transaction rolls back; no item/group/member/operation row | Remove uploaded objects after definitive rejection | Same operation may retry after correcting a retryable cause; identical invalid payload fails again |
| Second or later item insert fails | Earlier item inserts roll back too; no group/member/operation row | Same as first-item failure | No partial row discovery or compensation needed |
| Group insert/validation fails | All wardrobe inserts roll back; no group/member/operation row | Remove uploads after definitive rejection | Correct payload under a new operation ID; conflicting payload must not reuse the old ID if a completed record exists |
| Membership insert fails | Wardrobe and group inserts roll back with memberships | Remove uploads after definitive rejection | Safe exact retry after transient cause |
| Duplicate request, same payload | First call commits once; concurrent/later call returns original result with replayed=true | Keep the same deterministic objects | No duplicate rows or group |
| Conflicting request, same operation ID | Reject before writes; original result remains | Do not overwrite original objects; surface non-retryable conflict | Caller must recover original manifest or start a genuinely new logical operation with new IDs |
| Timeout before PostgreSQL receives request | No rows | Keep manifest/objects | Exact retry performs first execution |
| Timeout while transaction later rolls back | No committed rows | Keep manifest/objects until retry confirms | Exact retry performs first successful execution |
| Timeout after commit | Full committed set and replay identity exist | Keep objects | Exact retry returns original result |
| Authentication expired before RPC | No rows; auth.uid() is null and RPC raises 42501 | Keep manifest; do not delete while outcome is merely an auth/transport ambiguity | Refresh authentication, verify same user, replay exact request |
| Authentication expires after PostgreSQL begins | The transaction uses the authenticated request context with which it began; it commits fully or rolls back | Reconcile by same operation after reauthentication | Never switch owner |
| Cross-user garment/item identity | Ownership checks, RLS, composite FKs, or global item PK reject; transaction rolls back | Do not reveal foreign existence/details | No retry under a different user; require new IDs for a new owner operation |
| Retry after application restart | No special database case | Load local pending manifest, restore same operation/item IDs and paths | Replay exact request; committed returns replayed, absent executes |
| Storage upload fails before RPC | No database call and no rows | Delete successful partial uploads; persist cleanup_pending if needed | Resume/rewrite deterministic paths before DB call |
| DB rejects after all uploads | No committed rows | Delete all operation objects after definitive rejection | Retry only after resolving the rejection; use same operation for same logical intent |
| Cleanup deletion fails | Database remains correctly empty | Orphan objects remain temporarily and cleanup_pending is retained | Retry cleanup; do not create database rows merely to account for orphan files |
| User deletes group/items after prior success, then old request replays | Operation remains historically completed under account-lifetime retention | Do not recreate deliberately deleted rows | Return completed/replayed IDs; client loads current state and observes deletion |
| Account deletion | Operation/items/groups/members cascade or are explicitly deleted; auth user removed | User-prefixed Storage objects removed first | No later authenticated replay exists |

## Architecture alternatives

The alternatives below are compared without ranking or automatic selection. Atomic orchestration and replay identity are separate requirements; a candidate must cover both to satisfy the complete B0.1 goal.

### Alternative A — Transactional orchestration RPC without a durable operation record

**Schema impact:** No new table. Requires a new RPC accepting all wardrobe rows and relationship inputs. Existing tables remain unchanged.

**Security impact:** SECURITY INVOKER can preserve auth.uid(), RLS, and existing constraints. Grant EXECUTE only to authenticated and set a safe search_path.

**Transaction semantics:** Strong all-or-nothing database writes. It can call the existing Phase A RPC in the same transaction.

**Retry semantics:** Atomicity alone does not identify a prior committed result. If it generates a fresh group ID, timeout replay can duplicate or fail on stable item IDs. It does not satisfy exact replay without adding stable result-discovery semantics.

**Implementation complexity:** Low for atomicity; incomplete for the full requirement.

**Migration requirements:** New function/grants only.

**Phase A interaction:** Reuses create_garment_group unchanged.

**Rollback/containment:** Database rollback is strong; unknown-commit recovery remains unresolved.

### Alternative B — Transactional orchestration RPC plus idempotency operation record

**Schema impact:** Adds one owner-scoped operation table containing operation ID, canonical payload, item IDs, generated group ID, and completion timestamp. No WardrobeItem or Phase A table changes.

**Security impact:** New table needs RLS, authenticated owner SELECT/controlled INSERT semantics, no anon access, minimal service-role deletion access, and account-deletion cascade. Prefer that only the RPC writes immutable records even if owner SELECT is allowed.

**Transaction semantics:** Orchestration inserts wardrobe rows, calls existing Phase A RPC, and records the result in one transaction. A transaction-scoped operation lock serializes duplicates.

**Retry semantics:** Exact JSONB comparison cleanly distinguishes identical replay from conflicting reuse. Existing Phase A-generated group ID is returned from the stored result.

**Implementation complexity:** Moderate. Requires canonicalization, operation locking, immutable result mapping, retention policy, RLS/ACL tests, and client pending-manifest behavior.

**Migration requirements:** New table, indexes/constraints, RLS/policies/ACLs, orchestration RPC, function grants, and account-deletion list update.

**Phase A interaction:** Calls create_garment_group unchanged; does not require stable group-ID changes.

**Rollback/containment:** Operation record and all business rows commit or roll back together. Storage still uses compensation/reconciliation.

### Alternative C — Stable item IDs plus stable group-ID additive entry point

**Schema impact:** No new table is strictly required. Existing item/group UUID constraints can identify rows. Requires a new additive group entry point or orchestration RPC that accepts a stable group ID; the current Phase A RPC cannot accept one.

**Security impact:** Must duplicate or safely reuse Phase A’s auth.uid(), ownership, minimum-member, duplicate-member, RLS, and grant rules. Supplied IDs must never imply ownership.

**Transaction semantics:** One orchestrator can atomically insert stable-ID items, stable-ID group, and memberships.

**Retry semantics:** The function can locate existing rows by stable IDs and compare every durable field/member against canonical request intent. Exact match returns replay; any mismatch conflicts. Later legitimate edits or deletion make historical replay comparison ambiguous unless original payload/result is retained elsewhere.

**Implementation complexity:** Moderate to high because exact row-state comparison, concurrent replay, edits, deletes, and backwards compatibility must be specified. Stable IDs alone are insufficient unless the full comparison is implemented.

**Migration requirements:** New additive function/signature and grants; possibly no table. Existing create_garment_group must remain backward compatible and unchanged if Phase A is frozen.

**Phase A interaction:** Cannot use current create_garment_group for supplied group identity. An additive sibling function must reproduce or factor the same validation, which creates drift risk unless shared validation is introduced with explicit Phase A approval.

**Rollback/containment:** Strong inside the orchestration transaction. Replay guarantee lasts only while the compared business rows remain unchanged and present.

### Alternative D — Operation record combined with stable supplied group ID

**Schema impact:** Adds an operation table and an additive stable-group function/RPC.

**Security impact:** Combines the controls required by B and C.

**Transaction semantics:** Strong; all rows and operation result remain in one transaction.

**Retry semantics:** Strong historical replay and stable pre-upload group identity. It can use operation ID as group ID or keep them distinct.

**Implementation complexity:** Highest of the database-RPC candidates because it adds both mechanisms. It is justified only if a stable group ID is needed before the transaction, for example for a required source-image naming contract.

**Migration requirements:** Operation schema plus additive stable-ID group/orchestration functions and grants.

**Phase A interaction:** Existing RPC can remain, but the new path does not need it unless validation is safely shared.

**Rollback/containment:** Strong database rollback; Storage remains external.

### Alternative E — Trusted server endpoint with a direct PostgreSQL transaction

**Schema impact:** May still need an operation table. No client-visible RPC is required, but the backend needs a direct transaction-capable PostgreSQL connection; multiple Supabase/PostgREST calls do not form one transaction.

**Security impact:** Moves the boundary to trusted server credentials. The server must authenticate the bearer token, derive the user, enforce every ownership rule, protect connection credentials, and avoid broad service-role writes. Current service_role ACLs on group tables intentionally omit INSERT/UPDATE.

**Transaction semantics:** Equivalent guarantees are possible only with one real database connection and BEGIN/COMMIT, or by having the server call an orchestration RPC. Calling an RPC from the server makes the RPC—not the HTTP endpoint—the transaction boundary.

**Retry semantics:** Same operation record or stable-ID comparison is still required.

**Implementation complexity:** High operational and security complexity relative to the current direct Supabase client pattern.

**Migration requirements:** Possibly operation schema; backend connection/configuration/dependency work; no direct table migration if stable-ID comparison is used.

**Phase A interaction:** Can call the existing RPC only if the nested call shares the same database transaction; a separate HTTP/PostgREST RPC call does not. Direct SQL can invoke the function in the active transaction.

**Rollback/containment:** Strong with a real transaction. Larger credential and deployment failure surface.

### Insufficient mechanisms, documented for exclusion

- Client-side sequential inserts plus compensating deletes: cannot guarantee cleanup after crash/network loss.
- Fresh UUIDs on retry: creates duplicates.
- Stable item IDs alone: detects some duplicates but cannot return the original group result.
- source_image_path uniqueness: conflates provenance with request identity and rejects legitimate reuse.
- Storage object existence: Storage is not a transactional database commit marker.
- Reclassification on retry: may change payload and must not be part of persistence replay.

## Security/RLS implications

Any eventual design must satisfy all of the following:

1. Use SECURITY INVOKER unless architecture explicitly approves a narrowly audited SECURITY DEFINER function. SECURITY INVOKER is compatible with calling the existing Phase A RPC.
2. Derive user identity only from auth.uid(); do not accept authoritative user_id in request JSON.
3. Set search_path to pg_catalog and schema-qualify all public objects, matching Phase A.
4. Grant EXECUTE only to authenticated; revoke from PUBLIC and anon.
5. Keep the existing composite ownership foreign keys and Phase A validation.
6. Apply RLS to any operation table with auth.uid() = user_id.
7. Do not grant anon any operation-table privileges.
8. Give authenticated users only the minimum direct operation-table privileges. If direct INSERT/UPDATE/DELETE would bypass immutability, perform writes through an approved function boundary rather than broad CRUD grants.
9. Give service_role only permissions required by account deletion/administration. Existing Phase A intentionally limits it to SELECT/DELETE on group tables.
10. Avoid returning payload contents, foreign IDs, or existence details in conflict/ownership errors.
11. Treat item UUIDs and operation UUIDs as identifiers, not authorization.
12. Test two-user races and cross-account supplied item IDs.
13. Do not copy the live wardrobe_items duplicate policies or broad residual ACLs to new structures.

A SECURITY INVOKER orchestration RPC does not prevent callers from using existing direct wardrobe/group APIs outside the new flow. The guarantee applies to the Phase B multi-item save path. Enforcing RPC-only writes globally would require ACL changes outside this task and could break existing single-item behavior.

## Migration implications

No migration was created by this task.

If Alternative A is approved:

- Add one new orchestration function and its revoke/grant statements.
- No table change.
- Replay remains incomplete unless combined with another mechanism.

If Alternative B is approved:

- Add a new owner-scoped operation table.
- Candidate minimum columns: user_id uuid, operation_id uuid, canonical_payload jsonb, item_ids uuid[], group_id uuid, completed_at timestamptz.
- Candidate key: PRIMARY KEY (user_id, operation_id).
- Add user_profiles ownership FK with ON DELETE CASCADE.
- Add checks for JSON object payload, at least two distinct item IDs, and non-null completed result.
- Add RLS/policies, indexes only where query shape requires them, ACL reconciliation, and orchestration RPC.
- Do not add a group FK automatically: historical replay after user deletion of a group needs an explicit lifecycle decision. Account ownership still cascades through user_profiles.
- Update both explicit account-deletion table lists if defense-in-depth parity is required.

If Alternative C is approved:

- Add an additive stable-group/orchestration function accepting p_group_id.
- Keep existing create_garment_group signature and behavior unchanged.
- Duplicate or shared validation requires explicit Phase A architecture review.

If Alternative D is approved:

- Apply both B and C migrations.

If Alternative E is approved:

- A database migration may still be required for the operation record.
- Backend runtime/dependency/secrets configuration would also change; no such change belongs in B0.1.

Every migration candidate requires disposable-environment tests for rollback at each write, exact replay, conflicting replay, RLS, grants, account deletion, and Phase A lifecycle compatibility before production application.

## Exact files that would eventually change

This is an eventual boundary, not work performed by B0.1.

### Common to any database-RPC implementation

- supabase/migrations/<new_phase_b_transactional_persistence_migration>.sql — new function and, if selected, operation table/RLS/ACLs. Existing Phase A migration files remain untouched.
- lib/database.ts — one awaited typed wrapper for the new orchestration result and documented database errors.
- __tests__/garmentGroups.test.ts — retain Phase A regression coverage; extend only if the project’s test organization keeps database contract tests here.
- A new focused transactional persistence test file under __tests__/ — atomic failure injection, replay, conflicts, concurrency, ownership, and response shape.

### If an operation table is selected

- server/routes.ts — add the operation table to both explicit account-deletion table lists, unless architecture accepts FK cascade alone.
- Generated/local Supabase database types, if the project introduces or maintains them for the new table/RPC.

### Client persistence boundary after B0.1 approval

- A focused new lib module for pending multi-item operation manifests and canonical request construction.
- lib/storage.ts only if a narrow group-source upload/cleanup helper is required; existing per-item paths and upsert behavior should otherwise be reused.
- contexts/AppContext.tsx only to expose an awaited committed multi-item state update. The existing fire-and-forget addWardrobeItem must not be used as the durable transaction boundary.
- The eventual approved multi-item review caller, determined by the separate UI/product decision. B0.1 does not modify app/add-item.tsx or app/bulk-review.tsx.

### Only for the trusted direct-server alternative

- server/routes.ts — authenticated endpoint and error mapping.
- Server database-connection/configuration files and package manifest, only after security approval.

### Files that must not change for this architecture

- supabase/migrations/20260918000000_garment_groups.sql
- supabase/migrations/20260918223816_reconcile_garment_group_table_acls.sql
- constants/types.ts WardrobeItem definition
- Recommendation Engine v3.7 modules
- classifier/Gemini files
- taxonomy files
- UI files during B0.1
- frozen benchmark inputs/results/methodology

## Open PO/architecture decisions

The following decisions require explicit approval. This report does not select them automatically.

1. Which complete mechanism to adopt: operation record, stable-ID row comparison, both, or a trusted server transaction.
2. Whether the existing Phase A RPC must be called unchanged, or whether an additive stable-group sibling/shared validator is allowed.
3. Whether group ID must exist before the database transaction. If not, the current Phase A-generated ID can be stored in an operation result.
4. Whether operation identity is owner-scoped (user_id, operation_id) or globally unique operation_id. Owner-scoped identity better matches RLS; global identity gives cross-user collision semantics.
5. Whether canonical JSONB or a hash-plus-payload is authoritative for conflict detection.
6. Operation retention: account lifetime, bounded full-result retention plus tombstone, or a narrower documented retry guarantee.
7. Replay after user-initiated deletion/edit: return historical completion without recreation, return an expired outcome, or retain an immutable result snapshot with current-state metadata.
8. Whether completed operation rows are readable directly by authenticated clients or only returned through RPC.
9. Whether service_role receives SELECT and DELETE or DELETE only on an operation table.
10. Whether explicit account-deletion lists must include the operation table in addition to FK cascade.
11. Maximum number of items and maximum canonical-payload size accepted per operation.
12. Required client retry/backoff window and when a pending manifest may be declared abandoned.
13. Orphan Storage retention/cleanup mechanism and observability.
14. Whether a distinct group source image is required; this determines whether a pre-transaction stable group ID has any practical value.
15. Whether transport errors are exposed through direct PostgREST SQL errors or normalized by a server endpoint.
16. Whether the pre-existing wardrobe_items duplicate policies and residual anon ACLs receive a separate security-hardening task before Phase B rollout.

## Recommended implementation order

This is dependency order only; it does not rank the architecture alternatives.

### B0.1 approval gate

1. Approve one complete atomicity-plus-replay mechanism.
2. Approve operation/group identity and retention semantics.
3. Approve canonical payload and exact response/error contract.
4. Approve Storage cleanup/reconciliation and account-deletion behavior.
5. Resolve whether Phase A must be called unchanged or an additive stable-ID entry point is allowed.

### Database contract phase

6. Write contract tests first for first/second-item failure, group/member failure, exact replay, conflict, concurrency, expired auth, and cross-user IDs.
7. Create one additive migration containing only the approved structures/functions/RLS/ACLs.
8. Verify the existing Phase A RPC and lifecycle tests remain unchanged and passing.
9. Verify account deletion in a disposable environment.

### Client integration phase

10. Add the typed awaited database wrapper.
11. Add durable local pending-operation manifest handling.
12. Reuse deterministic Storage paths and implement cleanup_pending reconciliation.
13. Integrate only the approved multi-item caller; do not route through fire-and-forget addWardrobeItem for durable writes.
14. After definitive commit/replay, hydrate/update ordinary WardrobeItems and separate group metadata.

### Release containment

15. Gate the new persistence path independently from the legacy single-item path.
16. Run the targeted Phase B persistence/security matrix.
17. Do not start classifier B1, UI redesign, v3.7 integration, taxonomy work, or benchmark changes as part of this architecture implementation.

## Confirmation of zero changes

B0.1 was performed as a read-only architecture investigation.

Confirmed:

- No application code was modified.
- No migration was created or changed.
- No database schema, row, RLS policy, ACL, function, trigger, or Storage object was modified.
- Supabase access was limited to read-only project discovery and catalog queries.
- Phase A was not modified.
- WardrobeItem was not modified.
- Recommendation Engine v3.7 was not modified.
- Classifier/Gemini was not modified.
- Taxonomy was not modified.
- UI was not modified.
- Benchmarks were not modified or run.
- B1 was not started.
- No tests, workflows, packages, secrets, or environment variables were changed.

The only working-tree entry created by the user for this task is the attached source specification:

    attached_assets/Pasted-D-2-B0-1-Transactional-Multi-Item-Persistence-Architect_1789773493551.txt

This report is the sole generated deliverable.
