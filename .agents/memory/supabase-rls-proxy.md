---
name: Supabase RLS bypass via Express proxy
description: All Supabase table access routes through Express /api/db/* using the admin client because RLS policies were never applied to the live database.
---

# Supabase RLS — Express Proxy Pattern

## The rule
Never call Supabase tables directly from the React Native client (`lib/supabase.ts` with the anon/publishable key). All database reads and writes must go through the Express backend at `/api/db/*`.

## Why
Supabase RLS is enabled on all tables but no policies were ever applied to the live database. The anon-key client (device-side) receives "permission denied" on every table, regardless of whether the user is authenticated. The service-role key (in `SUPABASE_SECRET_KEY`) bypasses RLS and lives only on the server.

## How to apply
- **Server side** (`server/db-routes.ts`): Each route calls `verifyUser(req.headers.authorization)` which validates the JWT via `supabaseAdmin.auth.getUser(token)`, then uses `supabaseAdmin` for the actual query.
- **Client side** (`lib/database.ts`): `dbApi(method, path, body)` reads `supabase.auth.getSession()` for the current token, adds `Authorization: Bearer {token}`, and calls the Express route.
- If the session has no token (guest/unauthenticated), `dbApi` throws "Not authenticated" — callers should `.catch()` gracefully for guest mode.
- AsyncStorage write-through is preserved in `insertWardrobeItem` and `insertWearLog` for offline resilience before the server call.
