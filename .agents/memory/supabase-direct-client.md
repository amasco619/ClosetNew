---
name: Supabase direct client pattern
description: Why RLS + anon client is correct and the Express proxy approach was a workaround.
---

The supabase anon client (with RLS policies) is the correct pattern for AuraCloset.

**Why:** The Express proxy (/api/db/* routes in server/db-routes.ts with supabaseAdmin + JWT verification) was built as a temporary workaround when RLS policies hadn't been created in the Supabase dashboard yet. Once all 8 tables had proper RLS policies, the proxy became unnecessary and was removed.

**How to apply:** lib/database.ts calls `supabase` (the anon client from lib/supabase.ts) directly. RLS policies use `auth.uid() = user_id` to enforce per-user isolation. Never re-introduce the Express proxy pattern unless RLS genuinely cannot handle the access pattern.

For user-facing Auth operations such as sign-up, sign-in, and password reset, use the publishable key even when the call is rate-limited through the server. Keep the secret key for admin-only operations.

**Why:** Supabase's user-facing password Auth examples use the publishable key; using the privileged secret key for these operations is unnecessary.

**How to apply:** keep server Auth proxy clients stateless and publishable-key-backed; do not switch them to the admin secret.

**Saved looks:** The saved_looks table is a 9th table that must exist. It has a composite PK of (user_id, id) where id is the outfit fingerprint string.
