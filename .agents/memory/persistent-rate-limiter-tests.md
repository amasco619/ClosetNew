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

**How to apply:** Isolate the actual persistence boundary with an injected
Supabase client/store; removing `DATABASE_URL` no longer isolates the limiter.
Run route fixtures through the repository test runner, which sets
`NODE_ENV=test`; direct `tsx` execution can bypass guarded test overrides and
send synthetic counters to the live service. Keep the real middleware enabled
and add fail-fast test-mode guards where practical. For intentional persistence
coverage use an injected layer and distinct valid test IPs. Do not change
production limiter thresholds just to make tests pass.