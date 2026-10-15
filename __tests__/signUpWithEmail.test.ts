/**
 * Contract tests for the email sign-up proxy.
 *
 * Run: npx tsx __tests__/signUpWithEmail.test.ts
 */

import { signUpWithEmail, _testOverrides } from '../lib/emailSignUp'

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

function response(ok: boolean, body: unknown, statusText = ok ? 'OK' : 'Bad Request'): Response {
  return { ok, statusText, json: async () => body } as unknown as Response
}

function install(
  result: Response | Error,
  platform: 'web' | 'native' = 'web',
  signInError?: Error,
): {
  calls: { url: string; init?: RequestInit }[]
  signInCalls: { email: string; password: string }[]
  restore: () => void
} {
  const calls: { url: string; init?: RequestInit }[] = []
  const signInCalls: { email: string; password: string }[] = []
  _testOverrides.platform = platform
  _testOverrides.webOrigin = 'https://app.example.test'
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
      delete _testOverrides.platform
      delete _testOverrides.webOrigin
      delete _testOverrides.apiUrl
      delete _testOverrides.signInWithEmail
    },
  }
}

async function thrown(action: () => Promise<unknown>): Promise<string> {
  try {
    await action()
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

;(async () => {
  section('Acknowledged sign-up contract and request shape')
  {
    const mock = install(response(true, { acknowledged: true, needsConfirmation: true }))
    await signUpWithEmail('  User@EXAMPLE.COM  ', 'Password1')
    const body = JSON.parse(mock.calls[0]?.init?.body as string)
    assert(mock.calls[0]?.url === 'https://api.example.test/api/auth/sign-up', 'uses the sign-up API')
    assert(mock.calls[0]?.init?.method === 'POST', 'uses POST')
    assert(body.email === 'user@example.com', 'trims and lower-cases email')
    assert(body.password === 'Password1', 'forwards password')
    assert(body.emailRedirectTo === 'https://app.example.test/auth/callback', 'uses web redirect')
    assert(mock.signInCalls[0]?.email === 'user@example.com', 'signs in with the normalized email')
    assert(mock.signInCalls[0]?.password === 'Password1', 'signs in with the submitted password')
    mock.restore()
  }

  section('Rejected sign-in is not presented as email confirmation')
  {
    const mock = install(
      response(true, { acknowledged: true, needsConfirmation: true }),
      'web',
      new Error('[signInWithEmail] invalid_credentials'),
    )
    const message = await thrown(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(message.includes('Sign-up could not be completed'), 'shows a generic signup error')
    assert(!message.toLowerCase().includes('confirm'), 'does not imply that a confirmation email was sent')
    mock.restore()
  }

  section('Sign-in service failures are surfaced')
  {
    const mock = install(
      response(true, { acknowledged: true, needsConfirmation: true }),
      'web',
      new Error('[signInWithEmail] rate_limited'),
    )
    const message = await thrown(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(message.includes('[signUpWithEmail] rate_limited'), 'does not misreport a service failure as email confirmation')
    mock.restore()
  }

  section('Native redirect override')
  {
    const mock = install(response(true, { acknowledged: true, needsConfirmation: true }), 'native')
    await signUpWithEmail('user@example.com', 'Password1')
    const body = JSON.parse(mock.calls[0]?.init?.body as string)
    assert(body.emailRedirectTo === 'amodka://auth/confirm', 'uses native confirmation redirect')
    mock.restore()
  }

  section('Non-2xx responses')
  {
    const mock = install(response(false, { error: 'rate_limit' }, 'Too Many Requests'))
    const message = await thrown(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(message.includes('[signUpWithEmail]'), 'prefixes non-2xx errors')
    assert(message.includes('rate_limit'), 'propagates server error')
    mock.restore()
  }

  section('Acknowledged response no longer depends on confirmation metadata')
  {
    const missingAcknowledgement = install(response(true, { acknowledged: true }))
    await signUpWithEmail('user@example.com', 'Password1')
    assert(missingAcknowledgement.signInCalls.length === 1, 'attempts sign-in without needsConfirmation metadata')
    missingAcknowledgement.restore()

    const malformed = install(response(true, { needsConfirmation: true }))
    const message = await thrown(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(message.includes('response was invalid'), 'rejects 2xx without acknowledged:true')
    malformed.restore()
  }

  section('Fetch and JSON failures')
  {
    const network = install(new TypeError('Failed to fetch'))
    const networkMessage = await thrown(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(networkMessage.includes('Failed to fetch'), 'propagates fetch rejection')
    network.restore()

    const invalidJson = install({
      ok: true,
      statusText: 'OK',
      json: async () => { throw new SyntaxError('Unexpected token <') },
    } as unknown as Response)
    const jsonMessage = await thrown(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(jsonMessage.includes('response could not be read'), 'reports invalid JSON')
    invalidJson.restore()
  }

  console.log(`\n=== signUpWithEmail: ${failed === 0 ? 'all tests passed' : `${failed} FAILED`} ===`)
  if (failed > 0) process.exit(1)
})()