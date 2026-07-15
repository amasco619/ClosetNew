/**
 * Unit tests for the two-step email sign-in flow in lib/emailSignIn.ts.
 *
 * Flow under test:
 *   Step 1 — POST /api/auth/sign-in (server proxy: rate-limiting + lockout)
 *   Step 2 — supabase.auth.signInWithPassword() (client-side session)
 *
 * Contracts verified:
 *   - Server proxy is always called first (Step 1 before Step 2)
 *   - 401 / 429 from the server: supabase is NOT called, error propagates
 *   - 200 from the server: supabase.auth.signInWithPassword() IS called
 *   - Supabase error: error propagates with [signInWithEmail] prefix
 *   - Happy path: resolves without error
 *
 * Uses the _testOverrides / globalThis.fetch mock patterns established in
 * .agents/memory/test-overrides-pattern.md.
 *
 * Run: `npx tsx __tests__/signInWithEmail.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { signInWithEmail, _testOverrides } from '../lib/emailSignIn'

// ── Assertion harness ─────────────────────────────────────────────────────────

let failed = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`)
  } else {
    console.error(`  ✗ ${msg}`)
    failed++
  }
}

function section(name: string): void {
  console.log(`\n${name}:`)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a mock Response-like object that satisfies the subset of the
 * Response interface used by signInWithEmail (ok, statusText, json()).
 */
function makeResponse(
  ok: boolean,
  body: Record<string, unknown>,
  statusText = ok ? 'OK' : 'Error'
): Response {
  return {
    ok,
    statusText,
    json: async () => body,
  } as unknown as Response
}

/**
 * Installs a mock fetch that returns a fixed response and records the call
 * arguments so tests can assert on them.
 */
function installFetchMock(response: Response): {
  calls: Array<{ url: string; init: RequestInit | undefined }>
  restore: () => void
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  _testOverrides.fetch = async (url, init) => {
    calls.push({ url, init })
    return response
  }
  return {
    calls,
    restore: () => { delete _testOverrides.fetch },
  }
}

/**
 * Installs a mock supabase.auth.signInWithPassword that returns a fixed result
 * and counts invocations.
 */
function installSupabaseMock(
  result: { error: { message: string } | null }
): { callCount: () => number; restore: () => void } {
  let count = 0
  _testOverrides.signInWithPassword = async (_creds) => {
    count++
    return result
  }
  return {
    callCount: () => count,
    restore: () => { delete _testOverrides.signInWithPassword },
  }
}

// EXPO_PUBLIC_DOMAIN must be set so getApiUrl() does not throw.
process.env.EXPO_PUBLIC_DOMAIN = 'test.example.com'

// ── Tests ─────────────────────────────────────────────────────────────────────

;(async () => {

// ── Step 1 always fires ───────────────────────────────────────────────────────

section('Step 1: server proxy is always called first')

{
  const serverOk = makeResponse(true, {})
  const callOrder: string[] = []

  _testOverrides.fetch = async (url, init) => {
    callOrder.push('fetch')
    return serverOk
  }
  _testOverrides.signInWithPassword = async (_creds) => {
    callOrder.push('supabase')
    return { error: null }
  }

  await signInWithEmail('User@Example.com', 'Password1')

  assert(callOrder[0] === 'fetch', 'fetch (server proxy) fires before supabase')
  assert(callOrder[1] === 'supabase', 'supabase fires after fetch')
  assert(callOrder.length === 2, 'exactly two I/O calls occur on happy path')

  // Verify URL and method
  delete _testOverrides.fetch
  delete _testOverrides.signInWithPassword

  // Re-run with capturing mock to check URL/body details
  const { calls, restore: restoreFetch } = installFetchMock(serverOk)
  const { restore: restoreSupabase } = installSupabaseMock({ error: null })

  await signInWithEmail('User@Example.com', 'Password1')

  assert(calls.length === 1, 'fetch is called exactly once')
  assert(
    calls[0]?.url.includes('/api/auth/sign-in'),
    'fetch targets /api/auth/sign-in'
  )
  assert(calls[0]?.init?.method === 'POST', 'fetch method is POST')

  // Verify email is trimmed + lowercased in the request body
  const body = JSON.parse(calls[0]?.init?.body as string ?? '{}')
  assert(body.email === 'user@example.com', 'email is trimmed and lower-cased')

  restoreFetch()
  restoreSupabase()
}

// ── 401 from server: supabase must NOT be called ──────────────────────────────

section('Step 1 returns 401 (lockout): Supabase must not be called')

{
  const server401 = makeResponse(false, { error: 'Account locked' }, '401')
  const { restore: restoreFetch } = installFetchMock(server401)
  const { callCount, restore: restoreSupabase } = installSupabaseMock({ error: null })

  let threw = false
  let errorMsg = ''
  try {
    await signInWithEmail('test@example.com', 'Password1')
  } catch (e: unknown) {
    threw = true
    errorMsg = (e as Error).message
  }

  assert(threw, '401: an error is thrown')
  assert(
    errorMsg.includes('[signInWithEmail]'),
    '401: error message has [signInWithEmail] prefix'
  )
  assert(
    errorMsg.includes('Account locked'),
    '401: server error text is propagated'
  )
  assert(callCount() === 0, '401: supabase.auth.signInWithPassword is NOT called')

  restoreFetch()
  restoreSupabase()
}

// ── 429 from server: supabase must NOT be called ──────────────────────────────

section('Step 1 returns 429 (rate-limited): Supabase must not be called')

{
  const server429 = makeResponse(false, { error: 'Too many attempts' }, '429')
  const { restore: restoreFetch } = installFetchMock(server429)
  const { callCount, restore: restoreSupabase } = installSupabaseMock({ error: null })

  let threw = false
  let errorMsg = ''
  try {
    await signInWithEmail('test@example.com', 'Password1')
  } catch (e: unknown) {
    threw = true
    errorMsg = (e as Error).message
  }

  assert(threw, '429: an error is thrown')
  assert(
    errorMsg.includes('Too many attempts'),
    '429: server error text is propagated'
  )
  assert(callCount() === 0, '429: supabase.auth.signInWithPassword is NOT called')

  restoreFetch()
  restoreSupabase()
}

// ── Server returns 200: supabase MUST be called ───────────────────────────────

section('Step 1 returns 200: supabase.auth.signInWithPassword must be called')

{
  const serverOk = makeResponse(true, {})
  const { restore: restoreFetch } = installFetchMock(serverOk)
  const { callCount, restore: restoreSupabase } = installSupabaseMock({ error: null })

  await signInWithEmail('test@example.com', 'Password1')

  assert(callCount() === 1, '200: supabase.auth.signInWithPassword IS called once')

  restoreFetch()
  restoreSupabase()
}

// ── Supabase credentials forwarded correctly ──────────────────────────────────

section('Step 2: correct credentials are forwarded to supabase')

{
  const serverOk = makeResponse(true, {})
  const { restore: restoreFetch } = installFetchMock(serverOk)

  const capturedCreds: Array<{ email: string; password: string }> = []
  _testOverrides.signInWithPassword = async (creds) => {
    capturedCreds.push(creds)
    return { error: null }
  }

  await signInWithEmail('  Mixed@Case.COM  ', 'Password1')

  assert(
    capturedCreds[0]?.email === 'mixed@case.com',
    'supabase receives trimmed + lower-cased email'
  )
  assert(
    capturedCreds[0]?.password === 'Password1',
    'supabase receives the original password verbatim'
  )

  restoreFetch()
  delete _testOverrides.signInWithPassword
}

// ── Supabase error propagates ─────────────────────────────────────────────────

section('Step 2 Supabase error: error must propagate')

{
  const serverOk = makeResponse(true, {})
  const { restore: restoreFetch } = installFetchMock(serverOk)
  const { restore: restoreSupabase } = installSupabaseMock({
    error: { message: 'Invalid login credentials' },
  })

  let threw = false
  let errorMsg = ''
  try {
    await signInWithEmail('test@example.com', 'WrongPass1')
  } catch (e: unknown) {
    threw = true
    errorMsg = (e as Error).message
  }

  assert(threw, 'supabase error: an error is thrown')
  assert(
    errorMsg.includes('[signInWithEmail]'),
    'supabase error: message has [signInWithEmail] prefix'
  )
  assert(
    errorMsg.includes('Invalid login credentials'),
    'supabase error: Supabase message is propagated'
  )

  restoreFetch()
  restoreSupabase()
}

// ── Happy path: no error ──────────────────────────────────────────────────────

section('Happy path: both steps succeed, no error thrown')

{
  const serverOk = makeResponse(true, {})
  const { restore: restoreFetch } = installFetchMock(serverOk)
  const { callCount, restore: restoreSupabase } = installSupabaseMock({ error: null })

  let threw = false
  try {
    await signInWithEmail('test@example.com', 'Password1')
  } catch {
    threw = true
  }

  assert(!threw, 'happy path: no error is thrown')
  assert(callCount() === 1, 'happy path: supabase is called exactly once')

  restoreFetch()
  restoreSupabase()
}

// ── Exit ──────────────────────────────────────────────────────────────────────

console.log(
  `\n=== signInWithEmail: ${failed === 0 ? 'all tests passed' : `${failed} test(s) FAILED`} ===\n`
)
if (failed > 0) process.exit(1)

})()
