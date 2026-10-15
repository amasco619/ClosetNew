---
name: Wardrobe load state ownership
description: Ensure screen-level wardrobe loading and errors belong to the active account, even when accounts have equal item counts.
---

Wardrobe screens must scope transient loading, completion, and failure state to the active account identity as well as the current wardrobe shape or retry number.

**Why:** Two accounts can have identical item counts while their full-wardrobe requests are independent; a late success or failure from one account must not make another account appear complete, loading, or failed.

**How to apply:** Include the authenticated account identity in automatic screen request keys and guard manually initiated requests against account changes. Keep data ownership in the shared context unchanged.
