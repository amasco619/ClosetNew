---
name: Expo Go OAuth relay
description: Why OAuth infinite-spinner happens in Expo Go and how the relay fix works
---

## The problem

`makeRedirectUri({ scheme: 'auracloset' })` in Expo Go returns `exp://localhost:<port>`
— NOT `auracloset://`. This is hardcoded in `expo-linking/build/Schemes.js`:

```js
if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
  // auracloset is not in EXPO_CLIENT_SCHEMES → silently ignored
  return 'exp';
}
```

If `exp://localhost:<port>` is not in Supabase's allowed redirect URLs list,
Supabase shows an error page → `openAuthSessionAsync` never resolves → spinner hangs.

## The relay fix (no Supabase dashboard changes required)

**Why it works**: Supabase strips query params before matching the redirect URL
against its allow-list. So `https://<domain>?nativeCallback=exp://localhost:8082`
matches the allowed `https://<domain>` (already there for web OAuth).

### lib/auth.ts — `buildNativeOAuthRedirectTo()`
- In Expo Go: `redirectTo = https://<domain>?nativeCallback=<encoded-exp-url>`
  - Strip `:5000` port from `EXPO_PUBLIC_DOMAIN` to get the bare Replit domain
- In standalone: `redirectTo = nativeRedirectTo = auracloset://` (unchanged)

### lib/supabase.ts — `isNativeCallbackRelay`
- When `window.location.search.includes('nativeCallback')` → set `detectSessionInUrl: false`
- Prevents Supabase web client from racing to exchange the PKCE code (verifier
  is in native SecureStore, not in the ASWebAuth browser's storage)

### app/_layout.tsx — relay useEffect (web-only)
- Reads `nativeCallback` + `code` params from URL
- Validates scheme: only `exp://` or `auracloset://` allowed
- Sets `window.location.href = 'exp://<devserver>?code=xxx'`
- `ASWebAuthenticationSession` (`callbackURLScheme = 'exp'`) intercepts → resolves

**Why**: `exp://` IS registered in Expo Go's Info.plist; `auracloset://` is NOT.

## Key facts

- `EXPO_PUBLIC_DOMAIN` = `$REPLIT_DEV_DOMAIN:5000` — must strip the port to get
  the bare domain that Supabase's allow-list knows about.
- In standalone builds, `makeRedirectUri({ scheme: 'auracloset' })` returns
  `auracloset://` correctly. The relay is only active when `isExpoGo = true`.
- `Constants.executionEnvironment === ExecutionEnvironment.StoreClient` reliably
  detects Expo Go vs standalone builds.
