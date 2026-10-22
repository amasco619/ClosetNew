---
name: Mounted async handler tests
description: How to test loading states when a mounted screen handler awaits a deferred request.
---

When testing a pending screen submission, invoke the handler inside a block-bodied `React.act` callback without returning its promise, then resolve or reject the deferred request in a later `act`.

**Why:** returning the handler's promise makes `React.act` wait for the deferred request, so the test cannot inspect the loading state or resolve the request.

**How to apply:** use this pattern for mounted UI tests that intentionally keep an API call pending to verify disabled controls, spinners, or error recovery.
