import { Platform } from 'react-native'
import { makeRedirectUri } from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch } from 'expo/fetch'
import { supabase } from './supabase'
import { getApiUrl } from './query-client'
import { handleOAuthBrowserResult, type OAuthBrowserResult } from './oauthGuard'
export { signInWithEmail } from './emailSignIn'
export { signUpWithEmail } from './emailSignUp'

export const EMAIL_CONFIRMED_KEY = '@auracloset_email_confirmed'

WebBrowser.maybeCompleteAuthSession()

// In Expo Go (StoreClient), expo-linking's resolveScheme() always returns 'exp'
// regardless of the scheme argument — auracloset:// is silently ignored because it
// is not registered in Expo Go's Info.plist.  makeRedirectUri({ scheme: 'auracloset' })
// therefore resolves to exp://<devserver> in Expo Go, while returning auracloset://
// in standalone / EAS builds where the scheme IS in Info.plist.
const nativeRedirectTo = makeRedirectUri({ scheme: 'auracloset' })

// True when running inside the Expo Go app (development, not a standalone build).
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient

// In Expo Go, nativeRedirectTo is exp://<devserver> (e.g. exp://localhost:8082).
// We relay the OAuth callback through the HTTPS Replit domain (already in
// Supabase's allowed redirect URL list from the web OAuth setup) so no extra
// Supabase dashboard config is needed.
//
// The redirectTo we give Supabase becomes:
//   https://<domain>?nativeCallback=<encoded-exp-url>
//
// Supabase strips query params before matching against the allow-list, so the
// base domain matches.  After auth it redirects to:
//   https://<domain>?nativeCallback=exp://localhost:8082&code=xxx
//
// The Expo web page loading inside ASWebAuthenticationSession detects
// nativeCallback and does window.location.href = 'exp://localhost:8082?code=xxx'.
// ASWebAuthenticationSession (callbackURLScheme = 'exp') intercepts that
// redirect and resolves openAuthSessionAsync — no Supabase allow-list changes needed.
//
// In standalone builds, redirectTo = nativeRedirectTo = 'auracloset://' and the
// existing direct-deep-link path is used unchanged.
function buildNativeOAuthRedirectTo(): string {
  if (!isExpoGo) return nativeRedirectTo
  // EXPO_PUBLIC_DOMAIN is set to "$REPLIT_DEV_DOMAIN:5000"; strip the port so
  // the URL matches the bare Replit domain that is in Supabase's allow-list.
  const domain = (process.env.EXPO_PUBLIC_DOMAIN ?? '').split(':')[0]
  return `https://${domain}?nativeCallback=${encodeURIComponent(nativeRedirectTo)}`
}

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
 * iOS, Chrome Custom Tabs on Android) and waits for the callback URL.
 *
 * On standalone builds redirectTo = auracloset:// (registered in Info.plist).
 * ASWebAuthenticationSession (callbackURLScheme = 'auracloset') intercepts the
 * Supabase redirect directly → browserPromise resolves.
 *
 * On Expo Go, auracloset:// is not registered in Expo Go's Info.plist so
 * ASWebAuthenticationSession cannot use it as a callbackURLScheme.
 * Instead, redirectTo = https://<domain>?nativeCallback=exp://<devserver>.
 * Supabase redirects to that HTTPS URL; the Expo web page (running inside the
 * same ASWebAuthenticationSession) reads the nativeCallback param and does
 * window.location.href = 'exp://<devserver>?code=xxx'.  callbackURLScheme = 'exp'
 * (derived from nativeRedirectTo which is exp:// in Expo Go) intercepts that
 * redirect → browserPromise resolves.
 *
 * A Linking.addEventListener races the browser promise as a belt-and-suspenders
 * fallback for edge cases where ASWebAuth delivers the URL as a regular deep
 * link instead.
 */
async function openOAuthSessionWithFallback(oauthUrl: string): Promise<void> {
  const scheme = nativeRedirectTo.split('://')[0]

  let removeListener: (() => void) | undefined

  // Linking listener: catches the deep-link if the OS routes the callback URL
  // to the app directly rather than via ASWebAuthenticationSession.
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
    options: { redirectTo: buildNativeOAuthRedirectTo(), skipBrowserRedirect: true },
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
    options: { redirectTo: buildNativeOAuthRedirectTo(), skipBrowserRedirect: true },
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
