# Payment B1 — Entitlement Security Boundary

**Result:** B1 privilege boundary implemented and applied to the connected Amodka Supabase project. No purchase or verification flow was added. The approved Premium wardrobe capacity is **2,000 items**, not 500 or unlimited; this stage only updates the existing client cap and capability reference.

## Change

- `supabase/migrations/20260927000000_protect_user_profile_entitlements.sql` is forward-only. It removes authenticated/PUBLIC table-level INSERT, UPDATE and DELETE (also unused TRUNCATE/TRIGGER) and any direct column grants on `premium` and `premium_expires_at`. It grants authenticated INSERT/UPDATE on the ordinary columns used by `upsertUserProfile`, including `id` for conflict upserts, and retains SELECT and own-row RLS. The migration aborts if effective privileges from direct, PUBLIC or inherited grants still allow entitlement writes or if required reader/service-role grants are missing.
- The existing server-only `applyVerifiedEntitlement` writer, `getUserEntitlement` reader, `GET /api/user/entitlements`, PhotoRoom server entitlement check and service-role account-deletion paths were not changed. Client profile DELETE is now denied; account deletion remains server-operated.
- The existing client wardrobe cap and active-item slices use 2,000 for Premium. This is **client-only**, not a new server-enforced storage quota. The older payment architecture's Premium wardrobe number and `TECHNICAL.md` now reflect 2,000.

## Verification

- Applied the migration through the connected Supabase migration operation (`protect_user_profile_entitlements_b1`). Read-only live catalog queries afterwards confirmed: authenticated table-level INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER = false; effective authenticated INSERT/UPDATE for both entitlement columns = false; own-profile SELECT and the ordinary upsert columns = true; service-role SELECT/UPDATE/DELETE = true; no inherited authenticated role memberships were returned. Existing own-row RLS policies remain present. No production row was inserted, updated or deleted as a test.
- `__tests__/profileEntitlementAcl.test.ts` starts an isolated local PostgreSQL cluster, applies the exact migration to a representative profile schema/policies, and tests normal INSERT/conflict upserts, SELECT/RLS isolation, rejection of both entitlement columns (alone and combined with benign edits), rejection of authenticated DELETE and anonymous writes, and service-role read/update/delete. It also exercises PUBLIC-grant removal and abort-on-inherited-grant behavior. The disposable cluster contains no application user data.
- Focused `entitlements`, `accountDeletion` (both app and web paths), `removeBackground` and new ACL tests: **4 passed**. Full `npm test`: **64 passed, 0 failed**. `npm run typecheck`: passed. `npm run lint`: passed with 31 pre-existing warnings and no errors.

## Verification limits / later scope

- No separate Supabase test branch or PostgREST binary was available. The isolated test checks PostgreSQL conflict-upsert SQL, **not an actual Supabase/PostgREST request**. No live write test was made. Verify a real initial and conflict profile upsert, service-role mutation/deletion and the blocked authenticated write attempts in a disposable Supabase branch when one is available. Live catalog checks establish effective permissions but do not execute those paths.
- `getWardrobeItems` currently uses one unpaginated Supabase read (`lib/database.ts`); a wardrobe beyond the API's configured row limit may not load all 2,000 items. Pagination and trusted storage-capacity enforcement belong to the later Premium capability stage, not B1. Do not advertise the client cap as a server-enforced quota.
- Client expiry-refresh behavior and PhotoRoom quota architecture are unchanged. This is an entitlement **write-boundary** result, not paid-subscription launch readiness.

## Protected systems

No changes to Recommendation Engine v3.7, classifier/taxonomy, Track B/C benchmarks or protected CSV, Phase A garment groups, B1/B2/B3 multi-item implementation, or single-item persistence. No dependencies, payment integrations or server entitlement routes were changed.