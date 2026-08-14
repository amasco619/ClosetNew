---
name: Phase 5B storage and compliance hardening
description: Signed URL architecture for wardrobe-images; storagePath threading; RLS migration; account deletion fix; compliance docs location.
---

# Phase 5B Hardening

## Storage Architecture (post Phase 5B)

**Rule:** `uploadWardrobeImage` returns `{signedUrl, storagePath}`. Always store `storagePath` in the DB (`image_url` column); use `signedUrl` for display only — it expires.

**How to apply:**
- New upload call sites must destructure both fields
- `storagePath` flows through `WardrobeItem.storagePath?` → AppContext `insertWardrobeItem(image_url: storagePath)` 
- `resolveWardrobeImageUrl(pathOrUrl)` handles dual mode: paths → signed URL, legacy https:// URLs → as-is
- In-memory signed URL cache in `lib/storage.ts` (1h TTL, 60s buffer)

**Why:** wardrobe-images bucket must be set PRIVATE (operator action). Signed URLs are the access mechanism for private buckets.

## Pending Operator Actions (not in code)
1. Set `wardrobe-images` bucket PRIVATE in Supabase dashboard
2. Apply `supabase/migrations/20260814000000_rls_all_tables.sql` 
3. Run DB migration to convert legacy public URLs → storage paths before bucket goes private

## Account Deletion (fixed)
`DELETE /api/user/delete-account` now: deletes Storage objects (wardrobe-images + tryon-photos), deletes all DB records (8 tables with user_id, plus user_profiles with id), then deletes auth user.

## Compliance Documents
All in `docs/compliance/`: data-inventory.md, data-flow.md, dpia-screening.md, privacy-policy-source.md, terms-source.md, store-compliance-matrix.md, business-risk-register.md.

## Critical pre-launch blockers documented
- Bucket must be private (R-01)
- RLS migration must be applied (R-03)  
- Premium upgrade endpoint needs payment verification (R-06) — Phase 5C
- Skin tone legal basis — legal review required (R-08)
- Full DPIA required (R-09)
- Privacy Policy must be published (R-10)
- Google Play external deletion URL required (R-14)
