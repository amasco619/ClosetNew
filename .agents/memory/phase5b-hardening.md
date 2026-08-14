---
name: Phase 5B + 5B.1 storage, compliance, and Nigeria hardening
description: Signed URL architecture; storagePath threading; RLS migration; account deletion fix; AsyncStorage clear; cold-start fix; Nigeria compliance docs.
---

# Phase 5B + 5B.1 Hardening

## Storage Architecture (post Phase 5B/5B.1)

**Rule:** `uploadWardrobeImage` returns `{signedUrl, storagePath}`. Always store `storagePath` in DB; use `signedUrl` for display only.

**Cold-start fix (A7):** AsyncStorage saves `photoUri = storagePath` (not signed URL). `loadData()` resolves paths on cache load. `AppState 'active'` listener refreshes signed URLs on foreground. `getSignedWardrobeUrl` imported into AppContext.

**How to apply:**
- Upload call sites destructure `{signedUrl, storagePath}`
- `storagePath` flows through `WardrobeItem.storagePath?` → AppContext DB insert
- `resolveWardrobeImageUrl(pathOrUrl)` handles paths and legacy URLs
- In-memory signed URL cache in `lib/storage.ts` (1h TTL, 60s buffer)

## Pending Operator Actions
1. Run `scripts/migrate-legacy-storage-urls.ts --dry-run` → confirm 0 missing objects
2. Run live migration to convert legacy public URLs → storage paths
3. Apply `supabase/migrations/20260814000000_rls_all_tables.sql`
4. Set `wardrobe-images` bucket PRIVATE in Supabase dashboard
5. Set `tryon-photos` bucket PRIVATE (or disable — bucket is unused by app UI)

## Account Deletion (fully fixed Phase 5B.1)
Server: Storage cleanup + 8-table DB cleanup + auth deletion.
Client (profile.tsx): `AsyncStorage.multiRemove([all user-owned keys])` fires after server success only. Keys list covers AppContext, database.ts, weather, wardrobe-view, auth, and all legacy @auracloset_* keys.

## Nigeria Compliance (Phase 5B.1)
Launch strategy: Nigeria → UK → Global.
Key docs: `docs/compliance/nigeria-market-readiness.md`, `docs/compliance/phase5c-payment-architecture.md`.
Nigeria-specific: NDPA 2023, NDPC, FCCPC, GAID 2025. Cross-border transfer mechanisms unverified for all processors — launch blocker.
Skin tone legal basis unconfirmed under NDPA s.30 — launch blocker.

## Nigerian Fashion Readiness
`docs/recommendation/nigeria-fashion-readiness.md` — engine v3.7 handles Ankara correctly (print + large → hero pattern). Climate: hot/humid, rain filter all pass. Taxonomy gaps: `lace` fabric, `traditional-event` occasion tag needed. Visual classification and human stylist validation not yet performed.
