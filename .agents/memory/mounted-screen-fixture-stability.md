---
name: Mounted screen test fixture stability
description: Stable mocked context values and isolated module boundaries in mounted screen tests.
---

Mounted screen tests should keep mock context arrays, objects, and callbacks referentially stable across renders unless the scenario intentionally changes them. When a screen gains a new native sheet or service import, stub that leaf and the direct data boundary in screen-level bundles instead of pulling native or Supabase modules into the fixture.

**Why:** Screens often include context callbacks and collections in effect dependencies, while esbuild test bundles resolve the full static import graph. Unstable values cause unrelated effect loops; unstubbed native/data dependencies make a screen test load platform code it does not exercise.

**How to apply:** Define shared fixture arrays, objects, and no-op functions once; return those references from the mocked context and replace only the values under test. Give screen-level bundles small named-export mocks for new leaf UI and data modules; test the real leaf separately.
