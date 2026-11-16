-- Applied migration: 20261116233111_check_look_feedback_receipts.
-- Reproducible post-apply checks. Synthetic users and receipts never commit.
BEGIN;
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.check_look_feedback'::regclass)
    THEN RAISE EXCEPTION 'Feedback RLS disabled'; END IF;
  IF has_table_privilege('anon','public.check_look_feedback','INSERT,UPDATE,DELETE') OR
     has_table_privilege('authenticated','public.check_look_feedback','INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'Client has write permission'; END IF;
END $$;
INSERT INTO auth.users(id) VALUES
  ('b2200000-0000-4000-8000-000000000001'),
  ('b2200000-0000-4000-8000-000000000002');
SET LOCAL ROLE service_role;
INSERT INTO public.check_look_feedback
  (user_id,request_id,model_verdict,final_verdict,payload_text,prompt_hash,app_version)
VALUES ('b2200000-0000-4000-8000-000000000001',gen_random_uuid(),
  'Works','Works','Synthetic R22 access test',repeat('a',64),'test');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b2200000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.check_look_feedback
      WHERE user_id='b2200000-0000-4000-8000-000000000001') <> 1
    THEN RAISE EXCEPTION 'Owner cannot read receipt'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','b2200000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.check_look_feedback
      WHERE user_id='b2200000-0000-4000-8000-000000000001')
    THEN RAISE EXCEPTION 'Other owner row visible'; END IF;
END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id='b2200000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.check_look_feedback
      WHERE user_id='b2200000-0000-4000-8000-000000000001')
    THEN RAISE EXCEPTION 'Cascade failed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: RLS, client write denial, service insert, owner isolation, auth deletion cascade; synthetic data rolled back' AS verification;
