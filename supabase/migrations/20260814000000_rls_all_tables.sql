-- ════════════════════════════════════════════════════════════════════════════
-- Phase 5B — Row-Level Security for all user-owned tables
-- ════════════════════════════════════════════════════════════════════════════
--
-- This migration enables RLS and applies ownership policies to every
-- user-linked table.  user_profiles already has RLS from the earlier
-- migration (20260610000000_user_profiles_rls.sql); this file covers the
-- remaining tables.
--
-- Policy convention:
--   SELECT / INSERT / UPDATE / DELETE are all scoped to auth.uid() = user_id
--   and explicitly target the authenticated role so the intent is clear:
--     authenticated  → own rows only
--     anon           → no access (no GRANT to anon role, and auth.uid()=NULL)
--     service_role   → BYPASSRLS; governed by DAC grants in separate migration
--
-- Storage bucket policies are at the bottom of this file.  They require the
-- wardrobe-images and tryon-photos buckets to ALREADY EXIST in Supabase Storage.
-- The bucket privacy setting (public → private) must be applied separately in
-- the Supabase dashboard or via the management API before these policies have
-- their intended effect on download access.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── wardrobe_items ──────────────────────────────────────────────────────────
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Users can read own wardrobe items') THEN
    CREATE POLICY "Users can read own wardrobe items"
      ON wardrobe_items FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Users can insert own wardrobe items') THEN
    CREATE POLICY "Users can insert own wardrobe items"
      ON wardrobe_items FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Users can update own wardrobe items') THEN
    CREATE POLICY "Users can update own wardrobe items"
      ON wardrobe_items FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Users can delete own wardrobe items') THEN
    CREATE POLICY "Users can delete own wardrobe items"
      ON wardrobe_items FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── wear_logs ───────────────────────────────────────────────────────────────
ALTER TABLE wear_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wear_logs' AND policyname='Users can read own wear logs') THEN
    CREATE POLICY "Users can read own wear logs"
      ON wear_logs FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wear_logs' AND policyname='Users can insert own wear logs') THEN
    CREATE POLICY "Users can insert own wear logs"
      ON wear_logs FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wear_logs' AND policyname='Users can delete own wear logs') THEN
    CREATE POLICY "Users can delete own wear logs"
      ON wear_logs FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── affinity_signals ────────────────────────────────────────────────────────
ALTER TABLE affinity_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='affinity_signals' AND policyname='Users can read own affinity signals') THEN
    CREATE POLICY "Users can read own affinity signals"
      ON affinity_signals FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='affinity_signals' AND policyname='Users can insert own affinity signals') THEN
    CREATE POLICY "Users can insert own affinity signals"
      ON affinity_signals FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='affinity_signals' AND policyname='Users can delete own affinity signals') THEN
    CREATE POLICY "Users can delete own affinity signals"
      ON affinity_signals FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── pair_affinity_signals ───────────────────────────────────────────────────
ALTER TABLE pair_affinity_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pair_affinity_signals' AND policyname='Users can read own pair affinity signals') THEN
    CREATE POLICY "Users can read own pair affinity signals"
      ON pair_affinity_signals FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pair_affinity_signals' AND policyname='Users can insert own pair affinity signals') THEN
    CREATE POLICY "Users can insert own pair affinity signals"
      ON pair_affinity_signals FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pair_affinity_signals' AND policyname='Users can delete own pair affinity signals') THEN
    CREATE POLICY "Users can delete own pair affinity signals"
      ON pair_affinity_signals FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── rotation_cursors ────────────────────────────────────────────────────────
ALTER TABLE rotation_cursors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rotation_cursors' AND policyname='Users can read own rotation cursors') THEN
    CREATE POLICY "Users can read own rotation cursors"
      ON rotation_cursors FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rotation_cursors' AND policyname='Users can insert own rotation cursors') THEN
    CREATE POLICY "Users can insert own rotation cursors"
      ON rotation_cursors FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rotation_cursors' AND policyname='Users can update own rotation cursors') THEN
    CREATE POLICY "Users can update own rotation cursors"
      ON rotation_cursors FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rotation_cursors' AND policyname='Users can delete own rotation cursors') THEN
    CREATE POLICY "Users can delete own rotation cursors"
      ON rotation_cursors FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── slot_statuses ───────────────────────────────────────────────────────────
ALTER TABLE slot_statuses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='slot_statuses' AND policyname='Users can read own slot statuses') THEN
    CREATE POLICY "Users can read own slot statuses"
      ON slot_statuses FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='slot_statuses' AND policyname='Users can insert own slot statuses') THEN
    CREATE POLICY "Users can insert own slot statuses"
      ON slot_statuses FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='slot_statuses' AND policyname='Users can update own slot statuses') THEN
    CREATE POLICY "Users can update own slot statuses"
      ON slot_statuses FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='slot_statuses' AND policyname='Users can delete own slot statuses') THEN
    CREATE POLICY "Users can delete own slot statuses"
      ON slot_statuses FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── tryon_profiles ──────────────────────────────────────────────────────────
ALTER TABLE tryon_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tryon_profiles' AND policyname='Users can read own tryon profiles') THEN
    CREATE POLICY "Users can read own tryon profiles"
      ON tryon_profiles FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tryon_profiles' AND policyname='Users can insert own tryon profiles') THEN
    CREATE POLICY "Users can insert own tryon profiles"
      ON tryon_profiles FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tryon_profiles' AND policyname='Users can update own tryon profiles') THEN
    CREATE POLICY "Users can update own tryon profiles"
      ON tryon_profiles FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tryon_profiles' AND policyname='Users can delete own tryon profiles') THEN
    CREATE POLICY "Users can delete own tryon profiles"
      ON tryon_profiles FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── saved_looks ─────────────────────────────────────────────────────────────
ALTER TABLE saved_looks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_looks' AND policyname='Users can read own saved looks') THEN
    CREATE POLICY "Users can read own saved looks"
      ON saved_looks FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_looks' AND policyname='Users can insert own saved looks') THEN
    CREATE POLICY "Users can insert own saved looks"
      ON saved_looks FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_looks' AND policyname='Users can update own saved looks') THEN
    CREATE POLICY "Users can update own saved looks"
      ON saved_looks FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_looks' AND policyname='Users can delete own saved looks') THEN
    CREATE POLICY "Users can delete own saved looks"
      ON saved_looks FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Storage bucket RLS policies
--
-- These policies require the respective storage buckets to exist.
-- The INSERT policy covers uploads; SELECT covers signed-URL or download
-- requests routed through RLS; DELETE covers removal.
--
-- NOTE: For private buckets, Supabase enforces RLS on download.
--       For public buckets, download bypasses RLS (anyone with the URL can
--       access the file).  Setting the bucket to PRIVATE in the Supabase
--       dashboard is the authoritative control; these policies add defence-
--       in-depth for path-based cross-user read/list/delete attempts.
--
-- Idempotency: uses pg_policies (schemaname='storage', tablename='objects')
-- which is the standard PostgreSQL system catalog — consistent with the
-- application-table checks above and available on all PostgreSQL versions.
-- The earlier draft used storage.policies (a Supabase-specific view that is
-- not exposed via PostgREST and may be absent in some Supabase configurations).
--
-- Role targeting: explicit TO authenticated clause on every policy.
-- auth.uid() returns NULL for anon callers so the USING/WITH CHECK expression
-- already denies unauthenticated access, but the explicit role keeps intent
-- clear and prevents any ambiguity in future Supabase policy-auditing tools.
-- ════════════════════════════════════════════════════════════════════════════

-- wardrobe-images: users can only access their own prefix (userId/*)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'wardrobe-images select own'
  ) THEN
    CREATE POLICY "wardrobe-images select own"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'wardrobe-images'
        AND auth.uid()::text = (string_to_array(name, '/'))[1]
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'wardrobe-images insert own'
  ) THEN
    CREATE POLICY "wardrobe-images insert own"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'wardrobe-images'
        AND auth.uid()::text = (string_to_array(name, '/'))[1]
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'wardrobe-images update own'
  ) THEN
    CREATE POLICY "wardrobe-images update own"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'wardrobe-images'
        AND auth.uid()::text = (string_to_array(name, '/'))[1]
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'wardrobe-images delete own'
  ) THEN
    CREATE POLICY "wardrobe-images delete own"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'wardrobe-images'
        AND auth.uid()::text = (string_to_array(name, '/'))[1]
      );
  END IF;
END $$;

-- tryon-photos: users can only access their own prefix (userId/*)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'tryon-photos select own'
  ) THEN
    CREATE POLICY "tryon-photos select own"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'tryon-photos'
        AND auth.uid()::text = (string_to_array(name, '/'))[1]
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'tryon-photos insert own'
  ) THEN
    CREATE POLICY "tryon-photos insert own"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'tryon-photos'
        AND auth.uid()::text = (string_to_array(name, '/'))[1]
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'tryon-photos delete own'
  ) THEN
    CREATE POLICY "tryon-photos delete own"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'tryon-photos'
        AND auth.uid()::text = (string_to_array(name, '/'))[1]
      );
  END IF;
END $$;
