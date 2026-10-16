import { NATIVE_PASSWORD_RECOVERY_URL } from './oauth-callback'

export const _testOverrides: {
  fetch?: typeof fetch
  platform?: 'web' | 'native'
  webOrigin?: string
  apiUrl?: string
} = {}

export async function requestPasswordReset(email: string): Promise<void> {
  let redirectTo: string
  let apiUrl: string
  let request: typeof fetch
  if (_testOverrides.fetch) {
    redirectTo = _testOverrides.platform === 'native'
      ? NATIVE_PASSWORD_RECOVERY_URL
      : `${_testOverrides.webOrigin ?? 'https://test.invalid'}/auth/update-password`
    apiUrl = _testOverrides.apiUrl ?? 'https://test.invalid'
    request = _testOverrides.fetch
  } else {
    const { getApiUrl } = await import('./query-client')
    const { fetch: expoFetch } = await import('expo/fetch')
    redirectTo = process.env.EXPO_OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/auth/update-password`
      : NATIVE_PASSWORD_RECOVERY_URL
    apiUrl = getApiUrl()
    request = expoFetch as typeof fetch
  }

  const res = await request(new URL('/api/auth/reset-password', apiUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), redirectTo }),
    credentials: 'include',
  })
  let json: { acknowledged?: boolean; error?: string }
  try {
    json = await res.json()
  } catch {
    throw new Error('[requestPasswordReset] The reset response could not be read. Please try again later.')
  }
  if (!res.ok) {
    throw new Error(`[requestPasswordReset] ${json?.error ?? res.statusText}`)
  }
  if (json?.acknowledged !== true) {
    throw new Error('[requestPasswordReset] The reset response was invalid. Please try again later.')
  }
}