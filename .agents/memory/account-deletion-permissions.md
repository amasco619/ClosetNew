---
name: Account deletion live permission prerequisite
description: Why deletion tests alone cannot establish live cleanup access in Supabase.
---

Service-role RLS bypass does not imply table privileges. Live inspection during
the account-deletion regression found no service-role SELECT/DELETE privileges
on free wardrobe selections; deletion correctly stopped before Auth removal.
The user subsequently approved the narrow server-only grant; it was applied and
live metadata confirmed both privileges. This was not a live deletion test.

**Why:** Mocked deletion tests passed while the real service could not execute
the inventory. A separate wrong-database usage deletion would have failed next.

**How to apply:** Before claiming live deletion works, verify effective privileges
and the actual database used by every owner-keyed store. Do not bypass failed
tables or delete Auth to conceal cleanup failures. Recheck the grant's current
state rather than assuming this historical missing privilege is still present.

A failed account deletion can leave wardrobe rows whose Storage objects were
already removed. A later sign-in may therefore succeed but encounter missing
photos; account existence is not evidence that its images remain available.

**Why:** Storage cleanup precedes database cleanup and they are not one
transaction. Treat the photo symptom separately from authentication; deleted
bytes cannot be restored by changing signing permissions.

**How to apply:** Inspect row paths and object existence before diagnosing
credential failures. Preserve garment records and offer explicit photo repair
instead of automatic deletion or fabricated image recovery.
