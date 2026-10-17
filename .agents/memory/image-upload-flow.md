---
name: Image upload and transient bulk staging
description: Storage/row identity, safe bulk picker handoff, and staged-source cleanup boundaries.
---

**Why this matters:** uploadWardrobeImage stores the file under `{userId}/{itemId}.jpg` in Supabase Storage. AppContext.addWardrobeItem also generates a UUID for the DB row. If they differ, deleteWardrobeImage(userId, itemId) cannot find the image.

**Solution:** add-item.tsx handleSave generates the itemId via `Crypto.randomUUID()`, passes it to `uploadWardrobeImage(userId, photoBase64, itemId)`, then passes it as `id` to `addWardrobeItem({ id: itemId, photoUri: storageUrl, ... })`. AppContext.addWardrobeItem uses `item.id ?? Crypto.randomUUID()` so existing callers without an id still work.

**Save boundary:** Authenticated saves require a successful Storage upload and never persist a device-local picker URI. Guest saves copy the image into `documentDirectory`; the temporary cache source can then be removed after the wardrobe write is acknowledged.

**Product allowance:** The free PhotoRoom allowance is 20 lifetime removals per account, not 20 per day.

**Why:** The user explicitly required lifetime wording while preserving quota semantics.

**How to apply:** Upload-related remaining/limit messages must not imply a daily reset.

**Bulk picker rule:** Copy multi-selected picker files into app-owned cache staging before routing, keep staged URIs in a transient in-memory selection keyed by an opaque ID, and pass only that ID through navigation. Do not delete staged sources until persistence is acknowledged; preserve any source still referenced by a retryable local-only/pending item.

**Why:** Expo SDK 57 and package history did not explain the native Android bitmap decode failure; the bulk/single difference was carrying temporary picker URIs through Expo Router. The exact native root cause remains unproven, so staging is the reliable boundary rather than a claim about decoder internals.

The user subsequently confirmed that bulk preparation works with staging. Later footwear refusals occurred in the classifier after successful preparation; do not conflate semantic HTTP 422 refusals with bitmap/staging failures.

**How to apply:** Any future flow that adds a wardrobe item with an image should pre-generate the itemId, upload, then pass the same id to addWardrobeItem. For multi-photo selection, stage before route changes, navigate by ID, and clean only after confirmed persistence or explicit unreferenced cancellation.
