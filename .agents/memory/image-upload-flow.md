---
name: Image upload + item ID sync
description: How add-item generates a UUID before upload so Storage path and DB row stay aligned.
---

**Why this matters:** uploadWardrobeImage stores the file under `{userId}/{itemId}.jpg` in Supabase Storage. AppContext.addWardrobeItem also generates a UUID for the DB row. If they differ, deleteWardrobeImage(userId, itemId) cannot find the image.

**Solution:** add-item.tsx handleSave generates the itemId via `Crypto.randomUUID()`, passes it to `uploadWardrobeImage(userId, photoBase64, itemId)`, then passes it as `id` to `addWardrobeItem({ id: itemId, photoUri: storageUrl, ... })`. AppContext.addWardrobeItem uses `item.id ?? Crypto.randomUUID()` so existing callers without an id still work.

**Fallback:** If the Storage upload fails, handleSave falls back to the local device URI (photoUri) so the item still saves to the wardrobe.

**How to apply:** Any future flow that adds a wardrobe item with an image should pre-generate the itemId, upload, then pass the same id to addWardrobeItem.
