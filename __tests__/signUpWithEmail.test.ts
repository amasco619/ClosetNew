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
): { calls: Array<{ url: string; init?: RequestInit }>; restore: () => void } {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  _testOverrides.platform = platform
  _testOverrides.webOrigin = 'https://app.example.test'
  _testOverrides.apiUrl = 'https://api.example.test'
  _testOverrides.fetch = async (url, init) => {
    calls.push({ url, init })
    if (result instanceof Error) throw result
    return result
  }
  return {
    calls,
    restore: () => {
      delete _testOverrides.fetch
      delete _testOverrides.platform
      delete _testOverrides.webOrigin
      delete _testOverrides.apiUrl
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
    const result = await signUpWithEmail('  User@EXAMPLE.COM  ', 'Password1')
    const body = JSON.parse(mock.calls[0]?.init?.body as string)
    assert(result.needsConfirmation === true, 'returns needsConfirmation:true')
    assert(mock.calls[0]?.url === 'https://api.example.test/api/auth/sign-up', 'uses the sign-up API')
    assert(mock.calls[0]?.init?.method === 'POST', 'uses POST')
    assert(body.email === 'user@example.com', 'trims and lower-cases email')
    assert(body.password === 'Password1', 'forwards password')
    assert(body.emailRedirectTo === 'https://app.example.test/auth/callback', 'uses web redirect')
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

  section('Malformed successful responses')
  {
    const missingAcknowledgement = install(response(true, { needsConfirmation: true }))
    const first = await thrown(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(first.includes('response was invalid'), 'rejects 2xx without acknowledged:true')
    missingAcknowledgement.restore()

    const missingConfirmation = install(response(true, { acknowledged: true }))
    const second = await thrown(() => signUpWithEmail('user@example.com', 'Password1'))
    assert(second.includes('response was invalid'), 'rejects 2xx without needsConfirmation:true')
    missingConfirmation.restore()
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