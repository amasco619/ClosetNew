---
name: AI image consent storage
description: Why AI consent is kept in server-managed Auth app metadata rather than the editable profile document
---

Keep account-level AI image consent in server-managed Supabase Auth app metadata, and check the current stored account value on every provider-bound API request. The current Amodka default is OFF when no choice is saved; `not_asked`, `allowed`, and `declined` remain distinct. Only explicit `allowed` may display ON, and the existing disclosure must be accepted before any provider call. Explicit OFF remains OFF across sessions/devices. Changing the preference alone must not send or reprocess previously selected photos.

**Why:** The user prefers AI processing to remain disabled unless someone opts in. The profile's editable JSON is replaced by ordinary profile updates, and a client cache or JWT claim can be stale. Auth app metadata supports a durable preference without a schema migration or provider configuration change. The server's current Auth admin read is the enforcement source; a client state flag is not.

**How to apply:** Preserve unrelated app metadata on preference writes; keep `not_asked`, `allowed`, and `declined` distinct; require an explicit allow before provider calls; never make a new AI image endpoint bypass the server check. A published Privacy Policy URL and counsel-approved consent body are separate legal inputs, not values to infer from existing implementation.

Privacy preference changes must not share the low-frequency destructive-account
mutation budget.

**Why:** Device testing produced repeated privacy-write 429s while sign-in and
preference reads still succeeded. Signing out or restarting does not reliably
clear durable limiter counters, so that is not a recovery strategy.

**How to apply:** Keep privacy toggles independently protected, show retryable
rate-limit errors, and reconcile ambiguous saves against the current server
value rather than assuming either success or failure.