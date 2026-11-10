---
name: Expo lint cache
description: Distinguishing stale imported-module parse errors from current TypeScript errors.
---

If Expo lint reports an imported-module parse error at a stale line after the source has been fixed and typecheck passes, establish the uncached result before changing valid code again.

**Why:** Cached lint continued reporting an earlier syntax error after the referenced source was valid; uncached lint and the subsequent full lint run passed.

**How to apply:** Run `npx expo lint --no-cache` when the reported imported-module location no longer matches the current source. Do not weaken lint rules or rewrite types solely to satisfy a stale cached diagnostic.
