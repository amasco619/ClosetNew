---
name: Background-removal quota policy approval
description: Concurrency characterization is not approval to change free admission or Premium counting.
---

The approved background-removal Supabase cutover deliberately preserves the
existing read-before-increment free admission and uncapped Premium counting.
Any quota fix requires separate explicit approval; concurrency verification
must use isolated fixtures without real provider calls or production writes.

**Why:** The user explicitly scoped the work to reporting whether concurrent
admissions can exceed the allowance, not changing quota semantics, rate limiting,
lockout, billing, or production data. Finding an overrun does not authorize a
new admission policy.

**How to apply:** Before addressing a reported background-removal quota race,
check for explicit approval of the remedy. Keep characterization evidence
separate from production-load claims and do not add a universal SQL cap that
would silently cap Premium.
