/**
 * Unit tests for the email sign-up flow in lib/emailSignUp.ts.
 *
 * Contracts verified:
 *   - Supabase error propagates with [signUpWithEmail] prefix
 *   - needsConfirmation: true when session is null (email confirmation required)
 *   - needsConfirmation: false when session is present (auto-confirmed)
 *   - Email is trimmed + lower-cased before being sent to Supabase
 *
 * Uses the _testOverrides / dynamic-import pattern established in
 * .agents/memory/test-overrides-pattern.md.
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

type SignUpParams = {
  email: string
  password: string
  options: { emailRedirectTo: string }
}

type SignUpResult = {
  data: { session: unknown | null }
  error: { message: string } | null
}

/**
 * Installs a mock supabase.auth.signUp that returns a fixed result and
 * records every call so tests can assert on the arguments received.
 */
function installSignUpMock(result: SignUpResult): {
  calls: SignUpParams[]
  restore: () => void
} {
  const calls: SignUpParams[] = []
  _testOverrides.signUp = async (params) => {
    calls.push(params)
    return result
  }
  return {
    calls,
    restore: () => { delete _testOverrides.signUp },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

;(async () => {

// ── Supabase error propagates ─────────────────────────────────────────────────

section('Supabase error: error must propagate with [signUpWithEmail] prefix')

{
  const { restore } = installSignUpMock({
    data: { session: null },
    error: { message: 'Email already registered' },
  })

  let threw = false
  let errorMsg = ''
  try {
    await signUpWithEmail('test@example.com', 'Password1')
  } catch (e: unknown) {
    threw = true
    errorMsg = (e as Error).message
  }

  assert(threw, 'an error is thrown when Supabase returns an error')
  assert(
    errorMsg.includes('[signUpWithEmail]'),
    'error message has [signUpWithEmail] prefix'
  )
  assert(
    errorMsg.includes('Email already registered'),
    'Supabase error message is propagated verbatim'
  )

  restore()
}

// ── needsConfirmation: true when session is null ──────────────────────────────

section('needsConfirmation: true when session is null')

{
  const { restore } = installSignUpMock({
    data: { session: null },
    error: null,
  })

  let result: { needsConfirmation: boolean } | undefined
  try {
    result = await signUpWithEmail('test@example.com', 'Password1')
  } catch {
    // should not throw
  }

  assert(result !== undefined, 'resolves without throwing')
  assert(result?.needsConfirmation === true, 'needsConfirmation is true when session is null')

  restore()
}

// ── needsConfirmation: false when session is present ─────────────────────────

section('needsConfirmation: false when session is present')

{
  const fakeSession = { access_token: 'tok', user: { id: 'u1' } }
  const { restore } = installSignUpMock({
    data: { session: fakeSession },
    error: null,
  })

  let result: { needsConfirmation: boolean } | undefined
  try {
    result = await signUpWithEmail('test@example.com', 'Password1')
  } catch {
    // should not throw
  }

  assert(result !== undefined, 'resolves without throwing')
  assert(result?.needsConfirmation === false, 'needsConfirmation is false when session is present')

  restore()
}

// ── Email is trimmed + lower-cased ────────────────────────────────────────────

section('Email normalisation: trimmed and lower-cased before being sent to Supabase')

{
  const { calls, restore } = installSignUpMock({
    data: { session: null },
    error: null,
  })

  await signUpWithEmail('  User@EXAMPLE.COM  ', 'Password1')

  assert(calls.length === 1, 'signUp is called exactly once')
  assert(
    calls[0]?.email === 'user@example.com',
    'email is trimmed and lower-cased'
  )
  assert(
    calls[0]?.password === 'Password1',
    'password is forwarded verbatim'
  )

  restore()
}

// ── No error on successful sign-up ────────────────────────────────────────────

section('Happy path: no error thrown when Supabase returns success')

{
  const { restore } = installSignUpMock({
    data: { session: null },
    error: null,
  })

  let threw = false
  try {
    await signUpWithEmail('new@example.com', 'Password1')
  } catch {
    threw = true
  }

  assert(!threw, 'no error is thrown on successful sign-up')

  restore()
}

// ── Exit ──────────────────────────────────────────────────────────────────────

console.log(
  `\n=== signUpWithEmail: ${failed === 0 ? 'all tests passed' : `${failed} test(s) FAILED`} ===\n`
)
if (failed > 0) process.exit(1)

})()
