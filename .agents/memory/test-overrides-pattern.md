---
name: _testOverrides mutable export pattern
description: Pattern for bypassing auth/I-O in tsx unit tests without reassigning ESM exports.
---

## The rule
Export a plain mutable object `export const _testOverrides: { ... } = {}` from any module that needs test-time I/O bypass. Tests MUTATE properties on this object; they never reassign the export itself.

**Why:** ESM named exports compiled by tsx/esbuild become getter-only `Object.defineProperty` descriptors. Reassigning them from outside the module (`module._testOverrides = ...`) throws a TypeError. Mutating a property on the exported object (`module._testOverrides.foo = 'bar'`) works because the object reference is stable.

## Applied in
- `server/remove-background.ts` — exports `_testOverrides: { skipAuth: boolean; testUserId: string }`; tests set `skipAuth = true` and `testUserId = 'test-user-id'` to bypass Supabase auth and quota checks.
- `lib/photoroom.ts` — exports `_testOverrides: { sessionToken?: string }`; tests set `sessionToken = 'test-token'` to bypass `supabase.auth.getSession()` AND skip the dynamic `await import('./supabase')` entirely (the import is inside the `else` branch, so it never executes when `sessionToken` is set).

## Pattern skeleton
```typescript
// In the module under test:
export const _testOverrides: { myFlag?: string } = {};

export async function doThing() {
  if (_testOverrides.myFlag) {
    // test path — no I/O
  } else {
    // production path — real I/O / dynamic imports
    const { realDep } = await import('./heavyDep');
    ...
  }
}
```

```typescript
// In the test:
import { doThing, _testOverrides } from '../lib/myModule';
_testOverrides.myFlag = 'test-value';
// ... run tests ...
delete _testOverrides.myFlag; // restore if needed between tests
```

## Mock fetch pattern (companion)
For mocking network calls in the test, replace `globalThis.fetch`:
```typescript
const original = (globalThis as any).fetch;
(globalThis as any).fetch = async (url, init) => { /* mock */ };
// ... test ...
(globalThis as any).fetch = original; // restore
```
This works because the production code uses the global `fetch` (not a static import from expo/fetch).
