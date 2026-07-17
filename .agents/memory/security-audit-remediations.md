---
name: Security audit remediations
description: All second-pass security and perf remediations applied to AuraCloset; rules every future dev must follow
---

## Applied (do not revert)

- **NC-1**: `upsertUserProfile` has no `premium` field. `togglePremium` in AppContext does NOT write to Supabase. Only `/api/user/upgrade-premium` (server, requireAuth) may set the premium column.
- **NH-1**: `deleteWardrobeItem(userId, itemId)`, `deleteWearLog(userId, logId)`, `updateWardrobeItemAffinity(userId, itemId, affinity)` — every delete/update on user rows must filter on both `id` AND `user_id`.
- **NH-2**: axios.post in `server/extract-color.ts` has `{ timeout: 20_000 }` — do not remove.
- **NM-1**: `_testOverrides.skipAuth` is guarded by `process.env.NODE_ENV === 'test'` at all three check-points in `server/remove-background.ts`. `scripts/run-tests.mjs` sets `NODE_ENV: 'test'` in spawn env.
- **NM-2**: `pruneBgRemovalCache()` runs on startup + every 24 h — deletes bg_removal_cache rows older than 30 days.
- **NM-3**: Web Supabase client uses `SessionStorageAdapter` (sessionStorage, not localStorage).
- **P-A**: `getAffinitySignals` and `getPairAffinitySignals` filter `.gte('logged_at', 90-day cutoff)`.
- **P-E**: AI routes wrapped with `withAiLimit` (p-limit 5 concurrent slots) in `server/routes.ts`.

**Why:** Full documented rationale in TECHNICAL.md §12 Security.
