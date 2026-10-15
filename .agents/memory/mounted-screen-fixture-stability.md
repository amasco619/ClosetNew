---
name: Mounted screen test fixture stability
description: Stable identity rules for mocked React context values in mounted screen tests.
---

Mounted screen tests should keep mock context arrays, objects, and callbacks referentially stable across renders unless the scenario intentionally changes them.

**Why:** Screens often include context callbacks and collections in effect dependencies. Recreating empty values on every render can retrigger effects that set state and produce a render loop unrelated to production behavior.

**How to apply:** Define shared fixture arrays, objects, and no-op functions once; return those references from the mocked context and replace only the values under test.
