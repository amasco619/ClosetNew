-- ════════════════════════════════════════════════════════════════════════════
-- Minimum DAC privileges for service_role on user-owned tables
-- ════════════════════════════════════════════════════════════════════════════
--
-- service_role has BYPASSRLS=true (exempts from RLS policy evaluation) but
-- still requires PostgreSQL DAC GRANTs to access tables.  BYPASSRLS does NOT
-- bypass DAC.
--
-- Live audit (2026-08-17) confirmed that only wardrobe_items has any
-- service_role grants (SELECT, UPDATE, DELETE).  All other user-owned tables
-- returned 42501 "permission denied" for service_role.
--
-- This migration grants the minimum privileges demonstrably required by
-- existing production server code.  No INSERT is granted to any table because
-- no server route inserts rows (user-facing writes go through the authenticated
-- client).  No broader grants are added.
--
-- ─── Privilege justification per table ──────────────────────────────────────
--
-- user_profiles
--   SELECT  → server/remove-background.ts:181,195
--             Fallback premium check when JWT claim is stale or absent.
--             supabaseAdmin.from("user_profiles").select("premium").eq("id", userId)
--   UPDATE  → server/routes.ts:291-299
--             /api/user/upgrade-premium endpoint.
--             supabaseAdmin.from("user_profiles").update({premium, premium_expires_at})
--   DELETE  → server/routes.ts:365, 497
--             Account deletion (in-app + web OTP flow).
--             supabaseAdmin.from("user_profiles").delete().eq("id", userId)
--
-- wear_logs, affinity_signals, pair_affinity_signals, rotation_cursors,
-- slot_statuses, tryon_profiles, saved_looks, wardrobe_items
--   SELECT  → Required by PostgREST alongside DELETE.
--             PostgREST executes DELETE as "DELETE FROM table WHERE ... RETURNING *"
--             by default (return=representation).  RETURNING * requires SELECT
--             privilege in PostgreSQL even when the caller does not call .select().
--             Without SELECT the DELETE is rejected with 42501, causing account
--             deletion to silently skip these tables.
--             Confirmed by live validation (Task 409.2, 2026-08-18):
--             supabaseAdmin.from("affinity_signals").delete().eq("user_id", id)
--             → 42501 "permission denied" hint: "GRANT SELECT ON ... TO service_role"
--   DELETE  → server/routes.ts:355-363, 494-495
--             Account deletion (in-app + web OTP flow).
--             supabaseAdmin.from(table).delete().eq("user_id", userId)
--             wardrobe_items already has SELECT, DELETE from a prior corrective
--             grant; re-granting is a no-op.
--
-- ─── What is NOT granted ────────────────────────────────────────────────────
--   INSERT on any table         — no server route inserts rows
--   UPDATE on non-profile tables — no server route updates these tables
--   Any grant to anon or authenticated roles — unchanged
-- ════════════════════════════════════════════════════════════════════════════

-- user_profiles: SELECT (premium check) + UPDATE (upgrade-premium) + DELETE (account deletion)
GRANT SELECT, UPDATE, DELETE ON public.user_profiles TO service_role;

-- User-data tables: SELECT + DELETE (account deletion)
-- SELECT is required alongside DELETE because PostgREST sends RETURNING *
-- by default, which requires SELECT in addition to DELETE.
GRANT SELECT, DELETE ON public.wear_logs             TO service_role;
GRANT SELECT, DELETE ON public.affinity_signals      TO service_role;
GRANT SELECT, DELETE ON public.pair_affinity_signals TO service_role;
GRANT SELECT, DELETE ON public.rotation_cursors      TO service_role;
GRANT SELECT, DELETE ON public.slot_statuses         TO service_role;
GRANT SELECT, DELETE ON public.tryon_profiles        TO service_role;
GRANT SELECT, DELETE ON public.saved_looks           TO service_role;

-- wardrobe_items: SELECT, DELETE already granted; re-grant is idempotent.
-- Included for completeness and audit trail.
GRANT SELECT, DELETE ON public.wardrobe_items TO service_role;
