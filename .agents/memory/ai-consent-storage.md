---
name: AI image consent storage
description: Why AI consent is kept in server-managed Auth app metadata rather than the editable profile document
---

Keep account-level AI image consent in server-managed Supabase Auth app metadata, and check the current stored account value on every provider-bound API request. Unknown, absent, or unavailable values do not authorize processing.

**Why:** The profile's editable JSON is replaced by ordinary profile updates, and a client cache or JWT claim can be stale. Auth app metadata supports a durable preference without a schema migration or provider configuration change. The server's current Auth admin read is the enforcement source; a client state flag is not.

**How to apply:** Preserve unrelated app metadata on preference writes; never make a new AI image endpoint bypass the server check. A published Privacy Policy URL and counsel-approved consent body are separate legal inputs, not values to infer from existing implementation.