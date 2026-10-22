---
name: Production smoke isolation
description: Prevent workspace tooling and service access from invalidating isolated runtime checks
---

Production-only smoke installs must remove workspace node_modules binary paths
from PATH, then execute compiled output with native Node rather than a development
runner. Keep external service requests blocked when the check only needs local
startup and an unauthenticated response.

**Why:** An inherited workspace PATH allowed an ostensibly clean production npm
install to borrow a development-only lifecycle tool. Successful compilation also
failed to reveal ESM/CommonJS runtime incompatibility and an undeclared server
dependency. Startup can prune operational state, so merely probing a local
listener must not inadvertently become a live-data test.

**How to apply:** Use the mandatory production smoke command before publishing.
Preserve install-script failure semantics when patches exist; do not use ignored
lifecycle scripts or workspace tool resolution as proof of runtime independence.
