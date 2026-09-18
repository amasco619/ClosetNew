-- Reconcile Phase A table ACLs after Supabase default privileges are applied.

REVOKE ALL PRIVILEGES
  ON TABLE public.garment_groups, public.garment_group_members
  FROM anon, PUBLIC;

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.garment_groups, public.garment_group_members
  FROM authenticated, service_role;

REVOKE INSERT, UPDATE
  ON TABLE public.garment_groups, public.garment_group_members
  FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.garment_groups, public.garment_group_members
  TO authenticated;

GRANT SELECT, DELETE
  ON TABLE public.garment_groups, public.garment_group_members
  TO service_role;