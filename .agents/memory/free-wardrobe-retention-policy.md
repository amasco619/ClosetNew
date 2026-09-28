---
name: Free wardrobe retained-row policy
description: Distinguishes the approved active-item limit from an unapproved retained-row or storage quota.
---

The approved Free capacity is 30 **selected active** items, not 30 retained database rows. A Free account can retain more rows following Premium expiry. Avoid silently converting the admission rule into a total-row cap, even if clearing a selection and inserting again could otherwise accumulate retained rows.

**Why:** A security review raised repeated selection changes as a potential storage-abuse path. A total-row limit would block legitimate post-expiry selection and replacement behavior, so it cannot be added as an implicit fix to the approved active-capacity specification. Storage abuse is a distinct product policy question.

**How to apply:** When changing admission or testing downgrade behavior, enforce 30 active selections and 2,000 Premium rows. If retained storage also needs a limit, get an explicit product rule that defines grandfathered Premium rows, post-downgrade additions, and deletion/replacement first.