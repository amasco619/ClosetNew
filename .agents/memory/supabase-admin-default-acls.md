---
name: Supabase admin default privileges
description: Project-specific access limitation for changing default privileges owned by supabase_admin.
---

# Supabase admin default privileges

Supabase does not grant this project's users superuser status or membership in `supabase_admin`; changing defaults owned by `supabase_admin` requires Supabase support or another Supabase-authorized operator. The connected migration session runs as non-superuser `postgres` and is not a member of `supabase_admin`.

**Why:** An approved `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` migration was rejected with `permission denied to change default privileges`; the live default ACL remained unchanged.

**How to apply:** Do not try to bypass the role boundary or claim the ACL is fixed. Ask for Supabase-authorized execution, then record the migration version and verify the default ACL before closing any follow-up work.

Treat local superuser schema-replay success separately from hosted execution readiness.

**Why:** Disposable Supabase stubs can reproduce catalog ACLs while granting capabilities that the connected project's ordinary migration role does not have.

**How to apply:** Keep the admin-only prerequisite explicit in baseline/rebuild reports; matching local fingerprints must never be used to close the hosted permission blocker.
