---
name: Durable wardrobe photo deletion
description: Transactional cloud-photo cleanup intent and safety boundary for authenticated wardrobe deletes
---

Authenticated wardrobe photo deletion requires a server-side receipt committed in the same transaction as its wardrobe-row delete. A receipt is owner-bound, covers only an owned Storage path, and is created only when no other wardrobe row references that image. Keep the receipt until Storage removal succeeds; local app storage alone cannot cover an exit between the database and Storage steps.

**Why:** Database and Storage writes cannot share a transaction, and a process can exit after the database commits but before the client records or performs photo cleanup. A durable receipt also distinguishes a committed deletion from an ambiguous response.

**How to apply:** On restart, read and process receipts only for the signed-in owner, validate paths through the existing Storage deletion guard, and acknowledge only after removal succeeds. A timeout or missing delete response is never sufficient reason to delete a photo. Preserve the separate local-file cleanup path for guests.
