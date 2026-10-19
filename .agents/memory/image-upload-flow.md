---
name: Image upload and transient bulk staging
description: Storage/row identity, safe bulk picker handoff, and staged-source cleanup boundaries.
---

**Identity rule:** New garments can share their row and image-object IDs, but recovery deliberately preserves the garment ID while uploading a fresh object. Never assume those identities remain equal when cleaning up a saved garment.

**Why:** A replacement must not overwrite the existing photo before its database save is confirmed; a lost response can mean the replacement committed. Cleanup must respect the persisted photo identity rather than infer it from the garment identity.

**Save boundary:** Authenticated saves require a successful Storage upload and never persist a device-local picker URI. Guest saves copy the image into `documentDirectory`; the temporary cache source can then be removed after the wardrobe write is acknowledged.

**Product allowance:** The free PhotoRoom allowance is 20 lifetime removals per account, not 20 per day.

**Why:** The user explicitly required lifetime wording while preserving quota semantics.

**How to apply:** Upload-related remaining/limit messages must not imply a daily reset.

**Bulk picker rule:** Copy multi-selected picker files into app-owned cache staging before routing, keep staged URIs in a transient in-memory selection keyed by an opaque ID, and pass only that ID through navigation. Do not delete staged sources until persistence is acknowledged; preserve any source still referenced by a retryable local-only/pending item.

**Why:** Expo SDK 57 and package history did not explain the native Android bitmap decode failure; the bulk/single difference was carrying temporary picker URIs through Expo Router. The exact native root cause remains unproven, so staging is the reliable boundary rather than a claim about decoder internals.

The user subsequently confirmed that bulk preparation works with staging. Later footwear refusals occurred in the classifier after successful preparation; do not conflate semantic HTTP 422 refusals with bitmap/staging failures.

**How to apply:** For new garments, pre-generate the itemId, upload, then pass the same id to addWardrobeItem. For recovery, preserve the garment ID and persist the replacement object's path; use that owned path for later removal and retries. For multi-photo selection, stage before route changes, navigate by ID, and clean only after confirmed persistence or explicit unreferenced cancellation.
