---
name: Upload cleanup after ambiguous saves
description: Why photo cleanup must distinguish confirmed database rejection from an uncertain network response
---

Only remove an uploaded wardrobe photo after a confirmed database rejection or when saving was abandoned before database persistence began. A transport failure or invalid RPC response is not proof of rollback.

**Why:** Storage and the database do not share a transaction. Deleting an image after a lost response can break a row that actually committed.

**How to apply:** In future upload flows, keep cleanup best-effort and preserve the original error. If the outcome of a database request is uncertain, leave the uploaded image intact rather than risk deleting an acknowledged or committed item.