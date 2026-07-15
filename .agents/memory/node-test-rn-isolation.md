---
name: Node.js test isolation for React Native modules
description: How to make lib/ modules that depend on react-native/expo importable in Node.js tsx test environments.
---

## The rule
Any `lib/` module that is tested directly in Node.js via tsx MUST NOT have static imports of modules that chain to `react-native` or `expo/*` (e.g. `lib/supabase.ts`, `lib/query-client.ts`).

**Why:** tsx/esbuild transforms all statically-imported TypeScript in the chain. `react-native/index.js` contains Flow syntax (`import typeof`) at line 27 that esbuild cannot parse — it raises `ERROR: Unexpected "typeof"` and crashes the test process before any test runs.

## Known offenders
- `lib/supabase.ts` — imports `react-native`, `react-native-url-polyfill/auto`, `expo-secure-store`
- `lib/query-client.ts` — imports `expo/fetch` which chains to `react-native`

## Safe modules (no RN deps, import freely)
- `lib/classifyPath.ts` — explicitly kept RN-free; documented in its own JSDoc
- `shared/*` — pure constants, no framework deps

## How to fix a new lib/ module
1. Replace static `import { getApiUrl } from "./query-client"` with inlined logic (it only reads `process.env.EXPO_PUBLIC_DOMAIN`).
2. Replace static `import { supabase } from "./supabase"` with `await import('./supabase')` INSIDE the function body, guarded by a `_testOverrides` check (see `test-overrides-pattern.md`).
3. Never use `import { fetch } from "expo/fetch"` — use the global `fetch` instead (React Native sets `globalThis.fetch` at startup; Node 18+ has it natively).

## Applied in
`lib/photoroom.ts` — now imports only from `shared/photoroom-error-codes` and `lib/classifyPath.ts` statically; supabase is a guarded dynamic import; getApiUrl is inlined.
