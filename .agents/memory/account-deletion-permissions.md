---
name: Account deletion live permission prerequisite
description: Why deletion tests alone cannot establish live cleanup access in Supabase.
---

Service-role RLS bypass does not imply table privileges. Live inspection during
the account-deletion regression found no service-role SELECT/DELETE privileges
on free wardrobe selections; deletion correctly stopped before Auth removal.
The proposed grant was not applied pending approval.

**Why:** Mocked deletion tests passed while the real service could not execute
the inventory. A separate wrong-database usage deletion would have failed next.

**How to apply:** Before claiming live deletion works, verify effective privileges
and the actual database used by every owner-keyed store. Do not bypass failed
tables or delete Auth to conceal cleanup failures. Recheck the grant's current
state rather than assuming this historical missing privilege is still present.
