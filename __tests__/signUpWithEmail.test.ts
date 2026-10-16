/**
 * Contract tests for the email sign-up proxy.
 *
 * Run: npx tsx __tests__/signUpWithEmail.test.ts
 */

import { signUpWithEmail, _testOverrides } from '../lib/emailSignUp'
import { AuthError } from '../lib/authErrors'

let failed = 0
function assert(condition: boolean, message: string): void {
  if (condition) console.log(`  ✓ ${message}`)
  else {
    console.error(`  ✗ ${message}`)
    failed++
  }
}
function section(message: string): void {
  console.log(`\n${message}:`)
}

function response(
  ok: boolean,
  body: unknown,
  statusText = ok ? 'OK' : 'Bad Request',
  status = ok ? 200 : 400,
): Response {
  return { ok, status, statusText, json: async () => body } as unknown as Response
}

function install(
  result: Response | Error,
  signInError?: Error,
): {
  calls: { url: string; init?: RequestInit }[]
  signInCalls: { email: string; password: string }[]
  restore: () => void
} {
  const calls: { url: string; init?: RequestInit }[] = []
  const signInCalls: { email: string; password: string }[] = []
  _testOverrides.apiUrl = 'https://api.example.test'
  _testOverrides.fetch = async (url, init) => {
    calls.push({ url, init })
    if (result instanceof Error) throw result
    return result
  }
  _testOverrides.signInWithEmail = async (email, password) => {
    signInCalls.push({ email, password })
    if (signInError) throw signInError
  }
  return {
    calls,
    signInCalls,
    restore: () => {
      delete _testOverrides.fetch
      delete _testOverrides.apiUrl
      delete _testOverrides.signInWithEmail
    },
  }
}

async function thrownCode(action: () => Promise<unknown>): Promise<string> {
  try {
    await action()
    return ''
  } catch (error) {
    return error instanceof AuthError ? error.code : ''
  }
}

;(async () => {
  section('Acknowledged sign-up contract and request shape')
  {
    const mock = install(response(true, { acknowledged: true }))
    await signUpWithEmail('  User@EXAMPLE.COM  ', 'Password1')
    const body = JSON.parse(mock.calls[0]?.init?.body as string)
    assert(mock.calls[0]?.url === 'https://api.example.test/api/auth/sign-up', 'uses the sign-up API')
    assert(mock.calls[0]?.init?.method === 'POST', 'uses POST')
    assert(body.email === 'user@example.com', 'trims and lower-cases email')
    assert(body.password === 'Password1', 'forwards password')
    assert(!('emailRedirectTo' in body), 'does not send an unused confirmation redirect')
    assert(mock.signInCalls[0]?.email === 'user@example.com', 'signs in with the normalized email')
    assert(mock.signInCalls[0]?.password === 'Password1', 'signs in with the submitted password')
    mock.restore()
  }

  section('Rejected sign-in is not presented as email confirmation')
  {
    const mock = install(
      response(true, { acknowledged: true }),
      new AuthError('invalid_credentials'),
    )
    const code = await thrownCode(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(code === 'invalid_credentials', 'post-signup sign-in failure is typed and generic')
    mock.restore()
  }

  section('Sign-in service failures are surfaced')
  {
    const mock = install(
      response(true, { acknowledged: true }),
      new AuthError('rate_limited'),
    )
    const code = await thrownCode(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(code === 'rate_limited', 'does not misreport a service failure as email confirmation')
    mock.restore()
  }

  section('Native signup uses the same redirect-free request')
  {
    const mock = install(response(true, { acknowledged: true }))
    await signUpWithEmail('user@example.com', 'Password1')
    const body = JSON.parse(mock.calls[0]?.init?.body as string)
    assert(!('emailRedirectTo' in body), 'does not send the native confirmation redirect')
    mock.restore()
  }

  section('Expo iOS signup avoids dynamically importing React Native')
  {
    const originalFetch = globalThis.fetch
    const originalExpoOs = process.env.EXPO_OS
    const originalDomain = process.env.EXPO_PUBLIC_DOMAIN
    const calls: { url: string; init?: RequestInit }[] = []

    delete _testOverrides.fetch
    delete _testOverrides.apiUrl
    _testOverrides.signInWithEmail = async () => {}
    process.env.EXPO_OS = 'ios'
    process.env.EXPO_PUBLIC_DOMAIN = 'api.example.test:5000'
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return response(true, { acknowledged: true })
    }) as typeof fetch

    try {
      await signUpWithEmail('native@example.test', 'Password1')
      const body = JSON.parse(calls[0]?.init?.body as string)
      assert(
        calls[0]?.url === 'https://api.example.test:5000/api/auth/sign-up',
        'uses the configured server API URL',
      )
      assert(!('emailRedirectTo' in body), 'does not send an unused confirmation redirect')
    } finally {
      globalThis.fetch = originalFetch
      if (originalExpoOs === undefined) delete process.env.EXPO_OS
      else process.env.EXPO_OS = originalExpoOs
      if (originalDomain === undefined) delete process.env.EXPO_PUBLIC_DOMAIN
      else process.env.EXPO_PUBLIC_DOMAIN = originalDomain
      delete _testOverrides.signInWithEmail
    }
  }

  section('Non-2xx responses')
  {
    const mock = install(response(false, { error: 'rate_limit' }, 'Too Many Requests', 429))
    const code = await thrownCode(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(code === 'rate_limited', 'maps server rate limiting without exposing its message')
    mock.restore()
  }

  section('Approved duplicate-account response')
  {
    const mock = install(response(false,
      { success: false, reason: 'account_exists' }, 'Conflict', 409))
    const code = await thrownCode(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(code === 'account_exists', 'maps the explicit duplicate reason')
    assert(mock.signInCalls.length === 0, 'does not attempt sign-in after a duplicate response')
    mock.restore()
  }

  section('Acknowledged response contract')
  {
    const missingAcknowledgement = install(response(true, { acknowledged: true }))
    await signUpWithEmail('user@example.com', 'Password1')
    assert(missingAcknowledgement.signInCalls.length === 1, 'attempts sign-in after acknowledgment')
    missingAcknowledgement.restore()

    const malformed = install(response(true, {}))
    const code = await thrownCode(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(code === 'network', 'treats a malformed 2xx contract as a retryable network error')
    malformed.restore()
  }

  section('Fetch and JSON failures')
  {
    const network = install(new TypeError('Failed to fetch'))
    const networkCode = await thrownCode(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(networkCode === 'network', 'maps fetch rejection without exposing transport text')
    network.restore()

    const invalidJson = install({
      ok: true,
      statusText: 'OK',
      json: async () => { throw new SyntaxError('Unexpected token <') },
    } as unknown as Response)
    const jsonCode = await thrownCode(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(jsonCode === 'network', 'maps invalid JSON to network')
    invalidJson.restore()
  }

  console.log(`\n=== signUpWithEmail: ${failed === 0 ? 'all tests passed' : `${failed} FAILED`} ===`)
  if (failed > 0) process.exit(1)
})()