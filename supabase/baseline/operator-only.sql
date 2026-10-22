-- GENERATED OPERATOR-ONLY SNAPSHOT RESTORATION; schema only; NEVER APPLY TO PRODUCTION.
-- Manual review only. NOT automatically required for a new Supabase project, which has its own defaults.
-- Only a Supabase-authorised administrator with authority over supabase_admin defaults,
-- public/Storage schema ownership, Storage object grants and event triggers can run corresponding sections.
-- Ordinary hosted postgres authority is NOT established; never bypass this role boundary.
-- Broad captured grants are reproduced as historical evidence, not recommended new defaults.
-- Each named section is independently transactional. Use ON_ERROR_STOP=1 and explicit approval.

-- BEGIN SECTION: operator-01-admin-defaults
BEGIN;
SET LOCAL search_path = public, extensions, storage, auth;
-- Captured defaults for creator role supabase_admin.
-- ORIGIN: MANUAL/UNKNOWN — platform or role-level default configuration; no repo migration source.
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated", "postgres", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT DELETE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT ON TABLES TO "anon";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "anon";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT REFERENCES ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRIGGER ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT DELETE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT ON TABLES TO "authenticated";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "authenticated";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT REFERENCES ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRIGGER ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT DELETE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT ON TABLES TO "postgres";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "postgres";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT REFERENCES ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRIGGER ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT DELETE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT ON TABLES TO "service_role";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "service_role";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT REFERENCES ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRIGGER ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated", "postgres", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated", "postgres", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "service_role";

COMMIT;
-- END SECTION

-- BEGIN SECTION: operator-02-public-schema-acls
BEGIN;
SET LOCAL search_path = public, extensions, storage, auth;
-- Public schema ACL: snapshot grantor is pg_database_owner; hosted authority is unverified.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM "anon";
REVOKE ALL PRIVILEGES ON SCHEMA public FROM "authenticated";
REVOKE ALL PRIVILEGES ON SCHEMA public FROM "service_role";
-- ORIGIN: MANUAL/UNKNOWN — Supabase/platform or role-level default configuration; no repo migration source
GRANT USAGE ON SCHEMA public TO PUBLIC;
-- ORIGIN: MANUAL/UNKNOWN — Supabase/platform or role-level default configuration; no repo migration source
GRANT USAGE ON SCHEMA public TO "anon";
-- ORIGIN: MANUAL/UNKNOWN — Supabase/platform or role-level default configuration; no repo migration source
GRANT USAGE ON SCHEMA public TO "authenticated";
-- ORIGIN: MANUAL/UNKNOWN — Supabase/platform or role-level default configuration; no repo migration source
GRANT USAGE ON SCHEMA public TO "service_role";

COMMIT;
-- END SECTION

-- BEGIN SECTION: operator-03-storage-acls
BEGIN;
SET LOCAL search_path = public, extensions, storage, auth;
-- Requires platform object ownership/authorised grant authority; not verified for hosted postgres.
-- Storage schema ACL and storage.objects ACL (platform-managed relations are not created here).
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM "anon";
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM "authenticated";
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM "service_role";
-- ORIGIN: Supabase-managed (grantor supabase_admin)
GRANT USAGE ON SCHEMA storage TO "anon";
-- ORIGIN: Supabase-managed (grantor supabase_admin)
GRANT USAGE ON SCHEMA storage TO "authenticated";
-- ORIGIN: Supabase-managed (grantor supabase_admin)
GRANT USAGE ON SCHEMA storage TO "service_role";
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM "service_role";
GRANT DELETE ON TABLE storage.objects TO "anon";
GRANT INSERT ON TABLE storage.objects TO "anon";
GRANT SELECT ON TABLE storage.objects TO "anon";
GRANT UPDATE ON TABLE storage.objects TO "anon";
GRANT DELETE ON TABLE storage.objects TO "authenticated";
GRANT INSERT ON TABLE storage.objects TO "authenticated";
GRANT SELECT ON TABLE storage.objects TO "authenticated";
GRANT UPDATE ON TABLE storage.objects TO "authenticated";
GRANT DELETE ON TABLE storage.objects TO "service_role";
GRANT INSERT ON TABLE storage.objects TO "service_role";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'GRANT MAINTAIN ON TABLE storage.objects TO "service_role";';
  END IF;
END
$baseline$;
GRANT REFERENCES ON TABLE storage.objects TO "service_role";
GRANT SELECT ON TABLE storage.objects TO "service_role";
GRANT TRIGGER ON TABLE storage.objects TO "service_role";
GRANT TRUNCATE ON TABLE storage.objects TO "service_role";
GRANT UPDATE ON TABLE storage.objects TO "service_role";

COMMIT;
-- END SECTION

-- BEGIN SECTION: operator-04-event-trigger
BEGIN;
SET LOCAL search_path = public, extensions, storage, auth;
-- CREATE EVENT TRIGGER requires superuser or equivalent platform-authorised capability; hosted execution unverified.
-- Manual/unknown event trigger; Supabase-managed event triggers are listed but not recreated.
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE EVENT TRIGGER "ensure_rls" ON ddl_command_end WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') EXECUTE FUNCTION public.rls_auto_enable();
ALTER EVENT TRIGGER "ensure_rls" OWNER TO "postgres";
-- Skipped Supabase-managed event triggers: issue_graphql_placeholder, issue_pg_cron_access, issue_pg_graphql_access, issue_pg_net_access, pgrst_ddl_watch, pgrst_drop_watch

-- Other skipped Supabase-managed objects recorded in the snapshot:
-- auth.users, storage.objects, storage.buckets relation definitions and storage.objects triggers.
-- SKIPPED Supabase-managed trigger: storage.objects.protect_objects_delete -> storage.protect_delete()
-- SKIPPED Supabase-managed trigger: storage.objects.update_objects_updated_at -> storage.update_updated_at_column()
-- SKIPPED platform function implementation referenced by issue_graphql_placeholder: set_graphql_placeholder()
-- SKIPPED platform function implementation referenced by issue_pg_cron_access: grant_pg_cron_access()
-- SKIPPED platform function implementation referenced by issue_pg_graphql_access: grant_pg_graphql_access()
-- SKIPPED platform function implementation referenced by issue_pg_net_access: grant_pg_net_access()
-- SKIPPED platform function implementation referenced by pgrst_ddl_watch: pgrst_ddl_watch()
-- SKIPPED platform function implementation referenced by pgrst_drop_watch: pgrst_drop_watch()
-- Non-public Supabase-managed function definitions and platform schema internals are not in this baseline.
-- Public views/materialized views and public custom types: none captured.
COMMIT;
-- END SECTION
