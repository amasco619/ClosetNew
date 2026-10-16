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
 * environments. With Supabase Confirm Email disabled, signup needs no
 * platform-specific confirmation redirect.
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
import { authErrorFromServer, authErrorFromSupabase, AuthError } from './authErrors'

export const _testOverrides: {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
  apiUrl?: string
  signInWithEmail?: (email: string, password: string) => Promise<void>
} = {}

/**
 * Signs up a new user with email and password via the server proxy.
 *
 * POST /api/auth/sign-up (Express proxy):
 *   Enforces server-side rate-limiting and input validation. The server
 *   acknowledges receipt without promising account creation or email delivery.
 *   A known duplicate account receives the approved, rate-limited disclosure.
 *   If the server returns
 *   a non-2xx status (e.g. 400 invalid_email, 429 rate_limit), an error is
 *   thrown and the flow stops.
 *
 * After the generic acknowledgement, attempts the normal rate-limited sign-in
 * flow. Successful sign-in establishes the new session. Rejected sign-in is
 * surfaced as a generic sign-up error; this flow does not show email guidance.
 *
 * Trims and lower-cases the email before forwarding it to the server.
 * Throws typed AuthErrors; provider text is never exposed to the UI.
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<void> {
  const _fetch = (_testOverrides.fetch ?? globalThis.fetch) as (
    url: string,
    init?: RequestInit
  ) => Promise<Response>

  let apiUrl: string

  if (_testOverrides.fetch) {
    apiUrl = _testOverrides.apiUrl ?? 'https://test.invalid'
  } else {
    const host = process.env.EXPO_PUBLIC_DOMAIN
    if (!host) throw new Error('EXPO_PUBLIC_DOMAIN is not set')
    apiUrl = `https://${host}`
  }

  let res: Response
  try {
    res = await _fetch(
      new URL('/api/auth/sign-up', apiUrl).toString(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
        credentials: 'include',
      }
    )
  } catch {
    throw authErrorFromSupabase(new TypeError('Network request failed'))
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw authErrorFromSupabase(new TypeError('Invalid response'))
  }

  const body = json !== null && typeof json === 'object'
    ? json as { acknowledged?: boolean; reason?: string }
    : {}

  if (body.reason === 'account_exists') {
    throw authErrorFromServer(res.status, body, 'sign-up')
  }
  if (!res.ok) {
    throw authErrorFromServer(res.status, json, 'sign-up')
  }

  if (body.acknowledged !== true) {
    throw new AuthError('network')
  }

  const signIn = _testOverrides.signInWithEmail ??
    (await import('./emailSignIn')).signInWithEmail
  try {
    await signIn(email.trim().toLowerCase(), password)
  } catch (error) {
    throw authErrorFromSupabase(error)
  }
}
