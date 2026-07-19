/**
 * Unit tests for the email sign-up flow in lib/emailSignUp.ts.
 *
 * Flow under test:
 *   POST /api/auth/sign-up (server proxy: rate-limiting + input validation)
 *
 * Contracts verified:
 *   - Server proxy is called with the correct URL, method, and body
 *   - Non-2xx response: error thrown with [signUpWithEmail] prefix
 *   - 429 rate-limited response: error thrown
 *   - needsConfirmation:true / false is forwarded from the server response
 *   - needsConfirmation defaults to true when the field is absent
 *   - Email is trimmed + lower-cased before being sent to the server
 *   - statusText used as error fallback when the body has no error field
 *   - Happy path: resolves without throwing
 *
 * Uses the _testOverrides / fetch-mock pattern established in
 * lib/emailSignIn.ts — see .agents/memory/test-overrides-pattern.md.
 *
 * Run: `npx tsx __tests__/signUpWithEmail.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { signUpWithEmail, _testOverrides } from '../lib/emailSignUp'

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

/** Builds a mock Response-like object matching the subset used by signUpWithEmail. */
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

type FetchCall = { url: string; init?: RequestInit }

/**
 * Installs a mock fetch that returns a fixed response and records every call
 * so tests can assert on the arguments received.
 */
function installFetchMock(response: Response): {
  calls: FetchCall[]
  restore: () => void
} {
  const calls: FetchCall[] = []
  _testOverrides.fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return response
  }
  return {
    calls,
    restore: () => { delete _testOverrides.fetch },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

;(async () => {

// ── Server proxy called with correct shape ────────────────────────────────────

section('Server proxy: correct URL, method, and body')

{
  const { calls, restore } = installFetchMock(
    makeResponse(true, { success: true, needsConfirmation: true })
  )

  await signUpWithEmail('user@example.com', 'Password1')

  assert(calls.length === 1, 'fetch is called exactly once')
  assert(
    calls[0]?.url.includes('/api/auth/sign-up'),
    'fetch targets /api/auth/sign-up'
  )
  assert(calls[0]?.init?.method === 'POST', 'fetch method is POST')

  const body = JSON.parse(calls[0]?.init?.body as string ?? '{}')
  assert(body.email === 'user@example.com', 'email is forwarded in body')
  assert(body.password === 'Password1', 'password is forwarded in body')
  assert(typeof body.emailRedirectTo === 'string', 'emailRedirectTo is included in body')

  restore()
}

// ── Non-2xx: error propagates with [signUpWithEmail] prefix ───────────────────

section('Non-2xx response: error thrown with [signUpWithEmail] prefix')

{
  const { restore } = installFetchMock(
    makeResponse(false, { error: 'invalid_email' }, '400 Bad Request')
  )

  let threw = false
  let errorMsg = ''
  try {
    await signUpWithEmail('bad-email', 'Password1')
  } catch (e: unknown) {
    threw = true
    errorMsg = (e as Error).message
  }

  assert(threw, 'an error is thrown on non-2xx response')
  assert(errorMsg.includes('[signUpWithEmail]'), 'error message has [signUpWithEmail] prefix')
  assert(errorMsg.includes('invalid_email'), 'server error code is propagated')

  restore()
}

// ── 429 rate-limited: error thrown ────────────────────────────────────────────

section('429 rate-limited: error thrown')

{
  const { restore } = installFetchMock(
    makeResponse(false, { error: 'rate_limit', retryAfter: 60 }, 'Too Many Requests')
  )

  let threw = false
  try {
    await signUpWithEmail('user@example.com', 'Password1')
  } catch {
    threw = true
  }

  assert(threw, 'an error is thrown when rate-limited')

  restore()
}

// ── needsConfirmation: true ───────────────────────────────────────────────────

section('needsConfirmation: true when server returns needsConfirmation:true')

{
  const { restore } = installFetchMock(
    makeResponse(true, { success: true, needsConfirmation: true })
  )

  let result: { needsConfirmation: boolean } | undefined
  try {
    result = await signUpWithEmail('user@example.com', 'Password1')
  } catch {
    // should not throw
  }

  assert(result !== undefined, 'resolves without throwing')
  assert(result?.needsConfirmation === true, 'needsConfirmation is true')

  restore()
}

// ── needsConfirmation: false ──────────────────────────────────────────────────

section('needsConfirmation: false when server returns needsConfirmation:false')

{
  const { restore } = installFetchMock(
    makeResponse(true, { success: true, needsConfirmation: false })
  )

  let result: { needsConfirmation: boolean } | undefined
  try {
    result = await signUpWithEmail('user@example.com', 'Password1')
  } catch {
    // should not throw
  }

  assert(result !== undefined, 'resolves without throwing')
  assert(result?.needsConfirmation === false, 'needsConfirmation is false')

  restore()
}

// ── needsConfirmation defaults to true when field absent ─────────────────────

section('needsConfirmation defaults to true when field absent from response')

{
  const { restore } = installFetchMock(
    makeResponse(true, { success: true })
  )

  let result: { needsConfirmation: boolean } | undefined
  try {
    result = await signUpWithEmail('user@example.com', 'Password1')
  } catch {
    // should not throw
  }

  assert(result?.needsConfirmation === true, 'defaults to true when field absent')

  restore()
}

// ── Email normalisation ───────────────────────────────────────────────────────

section('Email normalisation: trimmed and lower-cased before being sent to server')

{
  const { calls, restore } = installFetchMock(
    makeResponse(true, { success: true, needsConfirmation: true })
  )

  await signUpWithEmail('  User@EXAMPLE.COM  ', 'Password1')

  const body = JSON.parse(calls[0]?.init?.body as string ?? '{}')
  assert(body.email === 'user@example.com', 'email is trimmed and lower-cased')
  assert(body.password === 'Password1', 'password is forwarded verbatim')

  restore()
}

// ── Happy path: no error thrown ───────────────────────────────────────────────

section('Happy path: no error thrown when server returns success')

{
  const { restore } = installFetchMock(
    makeResponse(true, { success: true, needsConfirmation: true })
  )

  let threw = false
  try {
    await signUpWithEmail('new@example.com', 'Password1')
  } catch {
    threw = true
  }

  assert(!threw, 'no error is thrown on successful sign-up')

  restore()
}

// ── statusText fallback when error field absent ───────────────────────────────

section('Error fallback: statusText used when error field absent in body')

{
  const { restore } = installFetchMock(
    makeResponse(false, {}, 'Service Unavailable')
  )

  let errorMsg = ''
  try {
    await signUpWithEmail('user@example.com', 'Password1')
  } catch (e: unknown) {
    errorMsg = (e as Error).message
  }

  assert(
    errorMsg.includes('Service Unavailable'),
    'statusText is used as fallback when error field absent'
  )

  restore()
}

// ── Exit ──────────────────────────────────────────────────────────────────────

console.log(
  `\n=== signUpWithEmail: ${failed === 0 ? 'all tests passed' : `${failed} test(s) FAILED`} ===\n`
)
if (failed > 0) process.exit(1)

})()
