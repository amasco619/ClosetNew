/**
 * Email sign-up flow extracted to its own Node-testable module.
 *
 * Sign-up is proxied through the Express server (/api/auth/sign-up) so that:
 *   - Rate limiting (authLimiter: 5 req / 15 min per IP) is enforced
 *   - Input validation happens server-side before touching Supabase
 *   - Generic error messages prevent email-enumeration attacks (the server
 *     always returns success regardless of whether the email is registered)
 *
 * No static imports from react-native, expo/*, lib/supabase, or
 * lib/query-client so this file loads cleanly under tsx in Node.js test
 * environments. Platform / makeRedirectUri are dynamically imported only in
 * the production path.
 *
 * See .agents/memory/node-test-rn-isolation.md for the rationale.
 */

/**
 * Mutable overrides injected by the test suite.
 *
 * fetch — replaces the globalThis.fetch used for the server proxy call.
 *         Must return a Response-like object with { ok, statusText, json() }.
 *
 * Never reassign this export; mutate its properties instead. ESM named
 * exports compiled by tsx/esbuild are getter-only descriptors — mutating a
 * property on the stable object reference is the only safe override path.
 * See .agents/memory/test-overrides-pattern.md.
 */
export const _testOverrides: {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
} = {}

/**
 * Signs up a new user with email and password via the server proxy.
 *
 * POST /api/auth/sign-up (Express proxy):
 *   Enforces server-side rate-limiting, input validation, and redirect URL
 *   allowlisting. The server always responds with { success: true,
 *   needsConfirmation: true } regardless of whether the email is already
 *   registered, preventing email-enumeration attacks. If the server returns
 *   a non-2xx status (e.g. 400 invalid_email, 429 rate_limit), an error is
 *   thrown and the flow stops.
 *
 * The caller should always display a fixed "check your email for a
 * confirmation link" message without branching on enumerable account states.
 *
 * Trims and lower-cases the email before forwarding it to the server.
 * Throws with a `[signUpWithEmail] …` prefix on any non-2xx response.
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ needsConfirmation: boolean }> {
  const _fetch = (_testOverrides.fetch ?? globalThis.fetch) as (
    url: string,
    init?: RequestInit
  ) => Promise<Response>

  let emailRedirectTo: string
  let apiUrl: string

  if (_testOverrides.fetch) {
    // Test path — skip dynamic RN imports and use a sentinel origin.
    emailRedirectTo = 'https://test.invalid/auth/callback'
    apiUrl = 'https://test.invalid'
  } else {
    const { Platform } = await import('react-native')
    const { makeRedirectUri } = await import('expo-auth-session')

    const nativeRedirectTo = makeRedirectUri({ scheme: 'auracloset' })
    emailRedirectTo =
      Platform.OS === 'web'
        ? `${(globalThis as unknown as { window: { location: { origin: string } } }).window.location.origin}/auth/callback`
        : nativeRedirectTo

    const host = process.env.EXPO_PUBLIC_DOMAIN
    if (!host) throw new Error('EXPO_PUBLIC_DOMAIN is not set')
    apiUrl = `https://${host}`
  }

  const res = await _fetch(
    new URL('/api/auth/sign-up', apiUrl).toString(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        emailRedirectTo,
      }),
      credentials: 'include',
    }
  )

  const json: { success?: boolean; needsConfirmation?: boolean; error?: string } =
    await res.json()

  if (!res.ok) {
    throw new Error(`[signUpWithEmail] ${json.error ?? res.statusText}`)
  }

  return { needsConfirmation: json.needsConfirmation ?? true }
}
