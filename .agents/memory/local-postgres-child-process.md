---
name: Local PostgreSQL child-process startup
description: Why disposable PostgreSQL tests can hang when their server inherits captured output.
---

When a test starts a local PostgreSQL daemon through a child process that captures stdout/stderr, redirect the daemon's logs away from the captured pipes.

**Why:** A detached server inherited the captured pipe and kept the parent waiting indefinitely even after the server was ready. This occurred during disposable-database verification, not because of a database query.

**How to apply:** In future isolated PostgreSQL integration tests, make daemon output independent of the spawning process before waiting for startup; distinguish startup-process hangs from connection errors.