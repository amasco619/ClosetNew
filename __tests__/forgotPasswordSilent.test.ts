/**
 * Contract tests for the real password-reset client flow.
 *
 * Run: npx tsx __tests__/forgotPasswordSilent.test.ts
 */

import { requestPasswordReset, _testOverrides } from '../lib/emailPasswordReset'

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
    calls.push({ url: String(url), init })
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
  section('Acknowledged reset contract and request shape')
  {
    const mock = install(response(true, { acknowledged: true }))
    await requestPasswordReset('  USER@Example.COM  ')
    const body = JSON.parse(mock.calls[0]?.init?.body as string)
    assert(mock.calls[0]?.url === 'https://api.example.test/api/auth/reset-password', 'uses reset API')
    assert(mock.calls[0]?.init?.method === 'POST', 'uses POST')
    assert(body.email === 'user@example.com', 'trims and lower-cases email')
    assert(body.redirectTo === 'https://app.example.test/auth/update-password', 'uses web redirect')
    mock.restore()
  }

  section('Native redirect override')
  {
    const mock = install(response(true, { acknowledged: true }), 'native')
    await requestPasswordReset('user@example.com')
    const body = JSON.parse(mock.calls[0]?.init?.body as string)
    assert(body.redirectTo === 'amodka://auth/update-password', 'uses native recovery redirect')
    mock.restore()
  }

  section('Malformed and non-2xx responses')
  {
    const malformed = install(response(true, { acknowledged: false }))
    const malformedMessage = await thrown(() => requestPasswordReset('user@example.com'))
    assert(malformedMessage.includes('response was invalid'), 'rejects malformed 2xx response')
    malformed.restore()

    const non2xx = install(response(false, { error: 'invalid_email' }, 'Bad Request'))
    const non2xxMessage = await thrown(() => requestPasswordReset('bad@example.com'))
    assert(non2xxMessage.includes('[requestPasswordReset]'), 'prefixes non-2xx errors')
    assert(non2xxMessage.includes('invalid_email'), 'propagates server error')
    non2xx.restore()
  }

  section('Fetch and JSON failures')
  {
    const network = install(new TypeError('Failed to fetch'))
    const networkMessage = await thrown(() => requestPasswordReset('user@example.com'))
    assert(networkMessage.includes('Failed to fetch'), 'propagates fetch rejection')
    network.restore()

    const invalidJson = install({
      ok: true,
      statusText: 'OK',
      json: async () => { throw new SyntaxError('Unexpected token <') },
    } as unknown as Response)
    const jsonMessage = await thrown(() => requestPasswordReset('user@example.com'))
    assert(jsonMessage.includes('response could not be read'), 'reports invalid JSON')
    invalidJson.restore()
  }

  console.log(`\n=== forgotPasswordSilent: ${failed === 0 ? 'all tests passed' : `${failed} FAILED`} ===`)
  if (failed > 0) process.exit(1)
})()