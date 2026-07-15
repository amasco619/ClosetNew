import { Platform } from 'react-native'
import { makeRedirectUri } from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch } from 'expo/fetch'
import { supabase } from './supabase'
import { getApiUrl } from './query-client'
import { handleOAuthBrowserResult, type OAuthBrowserResult } from './oauthGuard'
export { signInWithEmail } from './emailSignIn'
export { signUpWithEmail } from './emailSignUp'

export const EMAIL_CONFIRMED_KEY = '@auracloset_email_confirmed'

WebBrowser.maybeCompleteAuthSession()

const nativeRedirectTo = makeRedirectUri({ scheme: 'auracloset' })

export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url)
  if (errorCode) throw new Error(errorCode)

  const { access_token, refresh_token, code, type } = params

  // PKCE flow (Supabase JS v2 default for OAuth on native).
  // The redirect URL contains ?code=xxx; exchange it using the stored PKCE
  // verifier via exchangeCodeForSession, which handles the processLock
  // internally and avoids the setSession deadlock.
  // Pass the code string itself (not the full URL) per the auth-js contract.
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(String(code))
    if (error) throw new Error(`[createSessionFromUrl] ${error.message}`)
    if (type === 'signup') {
      AsyncStorage.setItem(EMAIL_CONFIRMED_KEY, '1').catch(() => {})
    }
    return data.session
  }

  // Implicit flow fallback (older Supabase project configuration or non-PKCE
  // providers). The URL contains #access_token=xxx&refresh_token=yyy.
  if (!access_token) return null
  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  })
  if (error) throw new Error(`[createSessionFromUrl] ${error.message}`)
  if (type === 'signup') {
    AsyncStorage.setItem(EMAIL_CONFIRMED_KEY, '1').catch(() => {})
  }
  return data.session
}

export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/auth/update-password`
      : undefined

  const url = new URL('/api/auth/reset-password', getApiUrl())
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), ...(redirectTo ? { redirectTo } : {}) }),
    credentials: 'include',
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(`[requestPasswordReset] ${json.error ?? res.statusText}`)
  }
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(`[updatePassword] ${error.message}`)
}

/**
 * Opens the OAuth URL in the in-app browser (ASWebAuthenticationSession on
 * iOS, Chrome Custom Tabs on Android) and waits for the auracloset:// redirect.
 *
 * On standalone builds the in-app browser detects the redirect itself and
 * resolves via `browserPromise`.
 *
 * On Expo Go (development), the OS delivers the auracloset:// deep-link to the
 * Expo client before ASWebAuthenticationSession sees its callback, so
 * `openAuthSessionAsync` hangs indefinitely.  A native `Linking.addEventListener`
 * races it: whichever path delivers the redirect URL first wins.  The abandoned
 * `browserPromise` is suppressed so it never causes an unhandled rejection.
 */
async function openOAuthSessionWithFallback(oauthUrl: string): Promise<void> {
  const scheme = nativeRedirectTo.split('://')[0]

  let removeListener: (() => void) | undefined

  // Linking listener: catches the deep-link when the OS routes auracloset://
  // to the app directly (Expo Go development environment).
  const linkingPromise = new Promise<OAuthBrowserResult>((resolve) => {
    const sub = Linking.addEventListener('url', (event) => {
      if (
        event.url.startsWith(scheme + '://') &&
        (event.url.includes('code=') || event.url.includes('access_token='))
      ) {
        resolve({ type: 'success', url: event.url })
      }
    })
    removeListener = () => sub.remove()
  })

  // Browser promise: normal path where ASWebAuth intercepts the redirect.
  const browserPromise = WebBrowser.openAuthSessionAsync(oauthUrl, nativeRedirectTo)

  // Prevent an unhandled-rejection warning from the losing promise.
  browserPromise.catch(() => {})

  try {
    const result = await Promise.race([
      browserPromise as Promise<OAuthBrowserResult>,
      linkingPromise,
    ])
    await handleOAuthBrowserResult(result, createSessionFromUrl)
  } finally {
    removeListener?.()
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    // On web, custom URL schemes (auracloset://) cannot be received by the
    // browser. Use a full-page redirect instead; detectSessionInUrl:true (set
    // in lib/supabase.ts for web) auto-processes the PKCE code on return.
    const origin = typeof window !== 'undefined' ? window.location.origin : nativeRedirectTo
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: origin },
    })
    if (error) throw new Error(`[signInWithGoogle] ${error.message}`)
    return
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: nativeRedirectTo, skipBrowserRedirect: true },
  })
  if (error) throw new Error(`[signInWithGoogle] ${error.message}`)
  await openOAuthSessionWithFallback(data?.url ?? '')
}

export async function signInWithApple(): Promise<void> {
  if (Platform.OS === 'web') {
    const origin = typeof window !== 'undefined' ? window.location.origin : nativeRedirectTo
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: origin },
    })
    if (error) throw new Error(`[signInWithApple] ${error.message}`)
    return
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: nativeRedirectTo, skipBrowserRedirect: true },
  })
  if (error) throw new Error(`[signInWithApple] ${error.message}`)
  await openOAuthSessionWithFallback(data?.url ?? '')
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(`[signOut] ${error.message}`)
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw new Error(`[getCurrentUser] ${error.message}`)
  return user
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters.'
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.'
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.'
  }
  return null
}
