import {
  NATIVE_OAUTH_CALLBACK_URL,
  NATIVE_EMAIL_CONFIRMATION_URL,
  NATIVE_PASSWORD_RECOVERY_URL,
  buildOAuthRelayUrl,
  isOAuthCallbackUrl,
  isOAuthRelayDestination,
  parseOAuthCallback,
  parseEmailConfirmationCallback,
  parsePasswordRecoveryCallback,
} from '../lib/oauth-callback'

let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`)
  } else {
    console.error(`  ✗ ${message}`)
    failed++
  }
}

console.log('\nNative OAuth callback recognition:')

assert(
  isOAuthCallbackUrl('amodka://auth/callback?code=pkce-code', NATIVE_OAUTH_CALLBACK_URL),
  'accepts Amodka PKCE code callbacks',
)

console.log('\nNative email callback recognition:')

assert(
  parseEmailConfirmationCallback('amodka://auth/confirm?code=confirm-code&type=signup')?.code ===
    'confirm-code',
  'accepts an exact signup confirmation callback',
)
assert(
  parseEmailConfirmationCallback('amodka://auth/confirm?code=confirm-code')?.type === 'signup',
  'accepts and classifies a confirmation code when Supabase omits the optional type',
)
assert(
  parseEmailConfirmationCallback('amodka://auth/confirm?code=confirm-code&type=recovery') === null,
  'rejects the wrong callback type on the confirmation route',
)
assert(
  parseEmailConfirmationCallback(`${NATIVE_EMAIL_CONFIRMATION_URL}?type=signup`) === null,
  'rejects confirmation callbacks without a code',
)
assert(
  parsePasswordRecoveryCallback(
    'amodka://auth/update-password?code=recovery-code&type=recovery',
  )?.code === 'recovery-code',
  'accepts an exact password recovery callback',
)
assert(
  parsePasswordRecoveryCallback('amodka://auth/update-password?code=recovery-code')?.type ===
    'recovery',
  'accepts and classifies a recovery code when Supabase omits the optional type',
)
assert(
  parsePasswordRecoveryCallback(
    'amodka://auth/update-password?code=recovery-code&type=signup',
  ) === null,
  'rejects the wrong callback type on the recovery route',
)
assert(
  parsePasswordRecoveryCallback(`${NATIVE_PASSWORD_RECOVERY_URL}?type=recovery`) === null,
  'rejects recovery callbacks without a code',
)
assert(
  parseEmailConfirmationCallback('amodka://arbitrary?code=confirm-code&type=signup') === null &&
    parsePasswordRecoveryCallback('amodka://arbitrary?code=recovery-code&type=recovery') === null,
  'rejects arbitrary Amodka URLs for both email flows',
)
assert(
  !isOAuthCallbackUrl(
    'amodka://auth/confirm?code=confirm-code&type=signup',
    NATIVE_OAUTH_CALLBACK_URL,
  ) &&
    !isOAuthCallbackUrl(
      'amodka://auth/update-password?code=recovery-code&type=recovery',
      NATIVE_OAUTH_CALLBACK_URL,
    ),
  'keeps email callbacks separate from the OAuth callback endpoint',
)
assert(
  !isOAuthCallbackUrl('amodka://auth/callback#access_token=token&refresh_token=refresh', NATIVE_OAUTH_CALLBACK_URL),
  'rejects implicit token callbacks that cannot be bound to a PKCE transaction',
)
assert(
  isOAuthCallbackUrl('amodka://auth/callback?error=access_denied', NATIVE_OAUTH_CALLBACK_URL),
  'accepts Amodka provider error callbacks for normal error handling',
)
assert(
  isOAuthCallbackUrl('exp://127.0.0.1:8081?code=expo-go-code', 'exp://127.0.0.1:8081'),
  'accepts Expo Go relay callbacks',
)
assert(
  !isOAuthCallbackUrl('auracloset://auth/callback?code=legacy-code', NATIVE_OAUTH_CALLBACK_URL),
  'rejects retired AuraCloset callbacks',
)
assert(
  !isOAuthCallbackUrl('amodka://wardrobe/item/123?code=attacker-code', NATIVE_OAUTH_CALLBACK_URL),
  'rejects ordinary Amodka deep links without an OAuth payload',
)
assert(
  !isOAuthCallbackUrl('amodka://auth/callback?code=', NATIVE_OAUTH_CALLBACK_URL),
  'rejects empty or expired-looking callback payloads before session exchange',
)
assert(
  JSON.stringify(
    parseOAuthCallback(
      'amodka://auth/callback?error=access_denied&error_description=User%20cancelled',
      NATIVE_OAUTH_CALLBACK_URL,
    ),
  ) === JSON.stringify({ errorCode: 'access_denied', errorDescription: 'User cancelled' }),
  'normalizes standard OAuth error and description parameters',
)

console.log('\nExpo Go relay destination handling:')

assert(
  isOAuthRelayDestination('exp://127.0.0.1:8081'),
  'accepts an Expo Go destination before it contains an OAuth payload',
)
assert(
  buildOAuthRelayUrl('exp://127.0.0.1:8081', 'relay-code', 'signup') ===
    'exp://127.0.0.1:8081?code=relay-code&type=signup',
  'emits the completed Expo Go navigation after Supabase returns a code',
)
assert(
  buildOAuthRelayUrl('amodka://auth/callback?ignored=1', 'relay-code') ===
    'amodka://auth/callback?code=relay-code',
  'replaces untrusted destination query values with the OAuth relay payload',
)
assert(
  buildOAuthRelayUrl('amodka://arbitrary', 'relay-code') === null,
  'rejects Amodka relay destinations outside the exact callback endpoint',
)
assert(
  buildOAuthRelayUrl('https://attacker.example/callback', 'relay-code') === null,
  'rejects arbitrary web destinations from the relay',
)
assert(
  !isOAuthRelayDestination('exp://localhost.attacker.example:8081'),
  'rejects localhost lookalike destinations',
)
assert(
  !isOAuthRelayDestination(
    'exp://attacker.example/53ecd44a-9d8d-422e-9856-0c22d2daefb0-00-3o1ja7l3rjo1j.riker.replit.dev',
    '53ecd44a-9d8d-422e-9856-0c22d2daefb0-00-3o1ja7l3rjo1j.riker.replit.dev',
  ),
  'rejects configured-domain substring destinations',
)
assert(
  isOAuthRelayDestination(
    'exp://53ecd44a-9d8d-422e-9856-0c22d2daefb0-00-3o1ja7l3rjo1j.riker.replit.dev',
    '53ecd44a-9d8d-422e-9856-0c22d2daefb0-00-3o1ja7l3rjo1j.riker.replit.dev',
  ),
  'accepts only the exact configured Replit Expo host',
)
assert(
  !isOAuthRelayDestination('exp://attacker@localhost:8081'),
  'rejects destinations with user-info even when the hostname is local',
)

console.log(`\n=== oauthCallback: ${failed === 0 ? 'all tests passed' : `${failed} test(s) failed`} ===\n`)
if (failed > 0) process.exit(1)