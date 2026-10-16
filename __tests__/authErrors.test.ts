import assert from 'node:assert/strict'
import {
  AuthError,
  authErrorCopy,
  authErrorFromServer,
  authErrorFromSupabase,
  normalizeAuthError,
  type AuthErrorCode,
} from '../lib/authErrors'

const expected: [AuthErrorCode, () => AuthError][] = [
  ['invalid_credentials', () => authErrorFromServer(401, { error: 'invalid_credentials' }, 'sign-in')],
  ['account_exists', () => authErrorFromServer(409, { reason: 'account_exists' }, 'sign-up')],
  ['email_not_confirmed', () => authErrorFromSupabase({ code: 'email_not_confirmed' })],
  ['weak_password', () => authErrorFromServer(400, { error: 'weak_password' }, 'sign-up')],
  ['invalid_email', () => authErrorFromServer(400, { error: 'invalid_email' }, 'sign-up')],
  ['rate_limited', () => authErrorFromServer(429, { error: 'rate_limit', retryAfter: 45 }, 'sign-in')],
  ['network', () => authErrorFromServer(503, { error: 'provider unavailable' }, 'sign-in')],
  ['oauth_cancelled', () => authErrorFromSupabase({ code: 'access_denied' })],
  ['unknown', () => normalizeAuthError(new Error('provider details must not reach the UI'))],
]

for (const [code, create] of expected) {
  const error = create()
  assert.ok(error instanceof AuthError, `${code}: mapped to AuthError`)
  assert.equal(error.code, code, `${code}: mapped to the expected code`)
  const copy = authErrorCopy(error)
  assert.ok(!copy.title.includes('provider details'), `${code}: copy is catalogue-controlled`)
  assert.ok(!copy.message.includes('provider details'), `${code}: support text is catalogue-controlled`)
}

assert.equal(expected[5]?.[1]().retryAfter, 45, 'rate-limit retry-after metadata is retained')
console.log('Typed auth error mappings: all states passed')
