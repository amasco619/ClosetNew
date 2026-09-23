---
name: Persistent rate-limiter tests
description: Isolate endpoint integration tests from persistent counters and the development database.
---

For mounted endpoint tests, retain the actual middleware but isolate its
persistence from the development database before loading the server modules.
Use distinct client identities across invocations when persistence is
deliberately exercised.

**Why:** A focused pass followed by a full regression pass hit a legitimate
hour-long counter from the first pass. Separately, mounted tests written
against the real limiter silently wrote synthetic counters and lockouts into
the development database because a connection URL was available to the test
runner. Neither should affect production data or other tests.

**How to apply:** For isolated route tests, remove the database URL from the
test process before dynamically importing modules that instantiate limiter
stores, then restore it at teardown; keep the real middleware enabled with
in-memory persistence. If a test intentionally covers persistent behavior,
use an injected persistence layer and distinct valid test IPs. Do not change
production limiter thresholds just to make tests pass.