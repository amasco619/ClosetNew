import {
  NATIVE_OAUTH_CALLBACK_URL,
  parseEmailConfirmationCallback,
  parseOAuthCallback,
  parsePasswordRecoveryCallback,
} from '../lib/oauth-callback'
import { completeOAuthCallback, type OAuthSessionAdapter } from '../lib/oauth-session'

type Session = { id: string }

let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`)
  } else {
    console.error(`  ✗ ${message}`)
    failed++
  }
}

function makeAdapter(options: { exchangeError?: string } = {}) {
  const exchangeCodes: string[] = []
  let confirmations = 0

  const adapter: OAuthSessionAdapter<Session> = {
    async exchangeCodeForSession(code) {
      exchangeCodes.push(code)
      return options.exchangeError
        ? { data: { session: null }, error: { message: options.exchangeError } }
        : { data: { session: { id: 'pkce-session' } }, error: null }
    },
    markEmailConfirmed() {
      confirmations++
    },
  }

  return { adapter, exchangeCodes, confirmations: () => confirmations }
}

async function main() {
console.log('\nOAuth session completion:')

{
  const spy = makeAdapter()
  const session = await completeOAuthCallback({ code: 'pkce-code', type: 'signup' }, spy.adapter)
  assert(session?.id === 'pkce-session', 'exchanges a PKCE code for a session')
  assert(spy.exchangeCodes.join() === 'pkce-code', 'passes the callback code verbatim')
  assert(spy.confirmations() === 1, 'records signup confirmation after a successful PKCE exchange')
}

{
  const spy = makeAdapter()
  const parsed = parseOAuthCallback(
    'amodka://auth/callback?error=access_denied&error_description=User%20cancelled',
    NATIVE_OAUTH_CALLBACK_URL,
  )
  await completeOAuthCallback(parsed ?? {}, spy.adapter)
    .then(() => assert(false, 'surfaces standard provider error URLs'))
    .catch(error => assert(error.message === 'access_denied: User cancelled', 'surfaces standard provider error URLs'))
}

{
  const spy = makeAdapter()
  const session = await completeOAuthCallback({}, spy.adapter)
  assert(session === null, 'ignores callback URLs without credentials')
  assert(spy.exchangeCodes.length === 0, 'does not call Supabase for empty callbacks')
}

{
  const spy = makeAdapter({ exchangeError: 'invalid or expired code' })
  await completeOAuthCallback({ code: 'expired-code' }, spy.adapter)
    .then(() => assert(false, 'rejects invalid or expired PKCE codes'))
    .catch(error => assert(error.message.includes('invalid or expired code'), 'rejects invalid or expired PKCE codes'))
}

{
  const spy = makeAdapter()
  const parsed = parseEmailConfirmationCallback('amodka://auth/confirm?code=confirm-code')
  const session = await completeOAuthCallback(parsed ?? {}, spy.adapter)
  assert(session?.id === 'pkce-session', 'confirmation exchanges its PKCE code for a session')
  assert(spy.confirmations() === 1, 'confirmation records the verified email')
}

{
  const spy = makeAdapter()
  const parsed = parsePasswordRecoveryCallback(
    'amodka://auth/update-password?code=recovery-code',
  )
  const session = await completeOAuthCallback(parsed ?? {}, spy.adapter)
  assert(session?.id === 'pkce-session', 'recovery exchanges its PKCE code for a session')
  assert(spy.confirmations() === 0, 'recovery does not masquerade as email confirmation')
}

{
  const spy = makeAdapter({ exchangeError: 'invalid or expired code' })
  const parsed = parsePasswordRecoveryCallback(
    'amodka://auth/update-password?code=expired-code&type=recovery',
  )
  await completeOAuthCallback(parsed ?? {}, spy.adapter)
    .then(() => assert(false, 'rejects an expired recovery code'))
    .catch(error => assert(error.message.includes('invalid or expired code'), 'rejects an expired recovery code'))
}

{
  const spy = makeAdapter()
  const parsed = parseOAuthCallback('amodka://arbitrary?code=attacker-code', NATIVE_OAUTH_CALLBACK_URL)
  assert(parsed === null, 'refuses OAuth-shaped deep links outside the exact callback endpoint')
}

console.log(`\n=== oauthSession: ${failed === 0 ? 'all tests passed' : `${failed} test(s) failed`} ===\n`)
if (failed > 0) process.exit(1)
}

main().catch(error => {
  console.error('Unexpected OAuth session test failure:', error)
  process.exit(1)
})