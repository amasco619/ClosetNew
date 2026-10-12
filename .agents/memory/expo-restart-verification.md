---
name: Expo restart verification
description: An environment-specific restart acknowledgement can conceal a surviving Metro child and a blocked replacement.
---

Do not treat an Expo workflow restart acknowledgement as proof that a fresh
frontend is serving. Verify the actual readiness log, particularly after a
port-conflict prompt.

**Why:** An older Expo child survived its launcher restart in this environment.
The replacement waited on an interactive alternate-port prompt while preview
returned an HTML shell without a usable bundle. Resolving the surviving child
restored the existing workflow and the browser journey.

**How to apply:** When logs show a busy port or alternate-port prompt, establish
which process owns the listener before retrying. Do not change app code or
declare the preview healthy merely because the restart callback succeeded.
