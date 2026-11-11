---
name: Sleeve preference rollout
description: Why the standing sleeve preference must not backfill older profiles
---

The standing shortest-sleeve setting uses read-time interpretation of legacy
coverage settings. Do not introduce a migration or bulk backfill for its rollout;
persist the optional preference only when the user explicitly edits that setting.

**Why:** The user declined the SQL/backfill proposal and required old account,
guest and device-cached preferences to remain unchanged until an explicit edit.

**How to apply:** Keep hydration and unrelated profile saves from materialising a
derived default as a newly stored preference. Treat any later backfill as a
separate decision requiring approval.
