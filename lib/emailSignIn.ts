/**
 * Email sign-in two-step flow extracted to its own Node-testable module.
 *
 * No static imports from react-native, expo/*, lib/supabase, or
 * lib/query-client so this file loads cleanly under tsx in Node.js test
 * environments. The supabase client is resolved via a guarded dynamic import;
 * getApiUrl logic is inlined; globalThis.fetch is used in place of the
 * expo/fetch named import.
 *
 * See .agents/memory/node-test-rn-isolation.md for the rationale.
 */

/**
 * Mutable overrides injected by the test suite.
 *
 * fetch               — replaces the globalThis.fetch used for the server
 *                       proxy call (Step 1).
 * signInWithPassword  — replaces supabase.auth.signInWithPassword (Step 2).
 *
 * Never reassign this export; mutate its properties instead. ESM named
 * exports compiled by tsx/esbuild are getter-only descriptors — mutating a
 * property on the stable object reference is the only safe override path.
 * See .agents/memory/test-overrides-pattern.md.
 */
export const _testOverrides: {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
  signInWithPassword?: (credentials: {
    email: string
    password: string
  }) => Promise<{ error: { message: string } | null }>
} = {}

/** Inlined from lib/query-client.ts to avoid the expo/fetch static import. */
function getApiUrl(): string {
  const host = process.env.EXPO_PUBLIC_DOMAIN
  if (!host) throw new Error('EXPO_PUBLIC_DOMAIN is not set')
  return `https://${host}`
}

/**
 * Signs in the user via a two-step flow.
 *
 * Step 1 — server proxy (/api/auth/sign-in):
 *   Enforces server-side rate-limiting and lockout. If the server returns a
 *   non-2xx status (e.g. 401 Unauthorised or 429 Too Many Requests), an error
 *   is thrown and Step 2 is never reached.
 *
 * Step 2 — supabase.auth.signInWithPassword():
 *   Establishes the client session directly with Supabase. We use
 *   signInWithPassword() rather than setSession() to avoid the processLock
 *   deadlock on web (see the comment in the original auth.ts for details).
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<void> {
  const _fetch = (_testOverrides.fetch ?? globalThis.fetch) as (
    url: string,
    init?: RequestInit
  ) => Promise<Response>

  // Step 1: server-side rate-limit + lockout check (Express proxy)
  const url = new URL('/api/auth/sign-in', getApiUrl())
  const res = await _fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    credentials: 'include',
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(`[signInWithEmail] ${json.error ?? res.statusText}`)
  }

  // Step 2: establish the client session directly with Supabase.
  // On web, setSession() with processLock can deadlock when the
  // onAuthStateChange callback fires DB queries that internally call
  // getSession() before the lock is released. Using signInWithPassword()
  // avoids this entirely and is the idiomatic Supabase pattern for the
  // anon-key client.
  let signInWithPassword: (credentials: {
    email: string
    password: string
  }) => Promise<{ error: { message: string } | null }>

  if (_testOverrides.signInWithPassword) {
    signInWithPassword = _testOverrides.signInWithPassword
  } else {
    const { supabase } = await import('./supabase')
    signInWithPassword = (creds) => supabase.auth.signInWithPassword(creds)
  }

  const { error } = await signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) {
    throw new Error(`[signInWithEmail] ${error.message}`)
  }
}
