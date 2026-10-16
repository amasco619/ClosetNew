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

## Expo Go platform detection
For Expo auth helpers, use the compile-time `process.env.EXPO_OS` value when platform selection is needed; do not dynamically import the full `react-native` namespace just to read `Platform.OS`. When email confirmation is disabled, signup needs no confirmation redirect or platform detection.

**Why:** Metro's native dynamic-import path can enumerate React Native exports and touch `PushNotificationIOS`, which is unavailable in Expo Go on iOS. This caused signup to fail before reaching Supabase; removing the unused signup redirect eliminated the import, while password-reset redirect selection uses `EXPO_OS`.

**How to apply:** Keep Node-tested `lib/` modules free of static React Native imports. Use `EXPO_OS` only for auth flows that actually need a platform-specific redirect.

## How to fix a new lib/ module
1. Replace static `import { getApiUrl } from "./query-client"` with inlined logic (it only reads `process.env.EXPO_PUBLIC_DOMAIN`).
2. Replace static `import { supabase } from "./supabase"` with `await import('./supabase')` INSIDE the function body, guarded by a `_testOverrides` check (see `test-overrides-pattern.md`).
3. Never use `import { fetch } from "expo/fetch"` — use the global `fetch` instead (React Native sets `globalThis.fetch` at startup; Node 18+ has it natively).

## Applied in
`lib/photoroom.ts` — now imports only from `shared/photoroom-error-codes` and `lib/classifyPath.ts` statically; supabase is a guarded dynamic import; getApiUrl is inlined.

## Executing extracted provider callbacks
When a test extracts a React provider callback and executes it with `new Function`, every newly referenced module helper must be imported by the test and passed into that function's dependency object. Prefer the real pure helper over a test-only reimplementation.

**Why:** Extracted callback bodies do not retain their original module scope, so an otherwise valid helper call fails at runtime with `ReferenceError`.

**How to apply:** Update the callback test harness whenever the callback gains a module-level helper dependency; keep importing framework-heavy providers out of Node tests.
