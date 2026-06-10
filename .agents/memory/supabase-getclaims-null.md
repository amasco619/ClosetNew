---
name: Supabase getClaims null safety
description: getClaims() returns data:null when there is no active session — destructuring crashes
---

`supabase.auth.getClaims()` returns `{ data: { claims: ... } | null }`. When no session exists, `data` is `null`. Destructuring `({ data: { claims } })` throws `Cannot destructure property 'claims' of null`.

**Why:** The Supabase JS v2 client returns `data: null` (not `data: { claims: null }`) for unauthenticated calls.

**How to apply:** Always use optional chaining:
```typescript
// CORRECT
const { data } = await supabase.auth.getClaims()
const claims = data?.claims  // safe — undefined when no session

// WRONG — crashes when not signed in
const { data: { claims } } = await supabase.auth.getClaims()
```

Applies everywhere getClaims() is called: `app/index.tsx`, `app/auth/callback.tsx`, `app/auth/update-password.tsx`.
