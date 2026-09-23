---
name: Persistent rate-limiter tests
description: Avoid false rate-limit failures in repeated endpoint integration tests.
---

When integration tests exercise the real persisted rate limiter, use distinct
client identities across invocations rather than deterministic IPs reused by
every test run.

**Why:** A focused pass followed by a full regression pass hit a legitimate
hour-long counter from the first pass; the second pass received 429 instead
of the expected injected failure. The code under test was correct.

**How to apply:** Keep the actual limiter enabled in endpoint tests, but
generate distinct valid test IPs for independent calls and repeated runs.
Do not change production limiter thresholds just to make tests pass.