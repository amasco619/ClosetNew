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
  // EXPO_PUBLIC_DOMAIN = "$REPLIT_DEV_DOMAIN:5000".  Strip the port first.
  // REPLIT_DEV_DOMAIN in Replit's agent/runner context is the session-specific
  // UUID-prefixed domain (e.g. 53ecd44a-...-00-xyz.riker.replit.dev), which
  // routes to the Expo dev-server web mode — NOT to our Express server on
  // port 5000.  Supabase's Site URL is the *stable* domain without the UUID
  // prefix (00-xyz.riker.replit.dev), so sending the UUID domain as redirectTo
  // causes Supabase to reject it and fall back to the Site URL, silently
  // dropping the nativeCallback query param we need.
  //
  // Fix: strip the UUID prefix (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-) so we
  // always use the stable domain that IS in Supabase's allow-list and that
  // routes to Express on port 5000.
  const raw = (process.env.EXPO_PUBLIC_DOMAIN ?? '').split(':')[0]
  const domain = raw.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  )
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
 * Opens the OAuth URL and waits for the callback URL.
 *
 * ─── iOS ────────────────────────────────────────────────────────────────────
 * Uses openAuthSessionAsync (ASWebAuthenticationSession).  In Expo Go the
 * callbackURLScheme is 'exp'; in standalone builds it is 'auracloset'.
 * ASWebAuth intercepts the redirect and resolves browserPromise.  A Linking
 * listener races it as a belt-and-suspenders fallback.  dismissAuthSession()
 * closes the sheet after the race settles.
 *
 * ─── Android ────────────────────────────────────────────────────────────────
 * Uses WebBrowser.openBrowserAsync (Chrome Custom Tab / CCT).  A CCT slides
 * in as a sheet over the app — no hard app-switch to a separate Chrome
 * process.  When Google auth completes and the server returns 302 → exp://…,
 * Android intercepts the custom scheme as a VIEW intent: the CCT closes
 * automatically and Expo Go comes to the foreground.
 *
 * Cancel detection: openBrowserAsync resolves (type 'cancel') when the CCT
 * is closed for any reason.  A 500 ms buffer after the browser closes gives
 * the Linking event time to arrive before we declare cancel — the CCT close
 * and the Linking callback race each other by ~200 ms on the success path.
 * WebBrowser.dismissBrowser() is called in the finally block as a best-effort
 * cleanup; it is a no-op if the CCT already closed via intent dispatch.
 */
async function openOAuthSessionWithFallback(oauthUrl: string): Promise<void> {
  const scheme = nativeRedirectTo.split('://')[0]

  // ── Android: Chrome Custom Tab (in-app browser sheet) ────────────────────
  //
  // openBrowserAsync opens a Chrome Custom Tab that slides in over the app —
  // no hard app-switch to a separate Chrome process. When the server 302s to
  // exp://…, Android intercepts the scheme as a VIEW intent: the CCT closes
  // automatically and Expo Go comes to the foreground (the Linking listener
  // below catches the URL). The user never leaves the app context.
  //
  // Cancel detection: openBrowserAsync resolves (type 'cancel') when the CCT
  // closes for any reason. A 500 ms buffer gives the Linking event time to
  // arrive before we declare cancel — on intent-dispatch the CCT close and
  // the Linking callback race each other by ~200 ms.
  if (Platform.OS === 'android') {
    let linkingRemove: (() => void) | undefined

    const linkingPromise = new Promise<OAuthBrowserResult>((resolve) => {
      const sub = Linking.addEventListener('url', (event) => {
        if (
          event.url.startsWith(scheme + '://') &&
          (event.url.includes('code=') || event.url.includes('access_token='))
        ) {
          resolve({ type: 'success', url: event.url })
        }
      })
      linkingRemove = () => sub.remove()
    })

    // openBrowserAsync promise resolves when the CCT is dismissed (manually or
    // via intent dispatch). Race it with the linking success event; add 500 ms
    // after browser close so the Linking callback has time to fire first on
    // the success path.
    const browserClosedPromise: Promise<OAuthBrowserResult> =
      WebBrowser.openBrowserAsync(oauthUrl, { showTitle: false })
        .then(
          () =>
            new Promise<OAuthBrowserResult>((r) =>
              setTimeout(() => r({ type: 'cancel' }), 500),
            ),
        )
        .catch((): OAuthBrowserResult => ({ type: 'cancel' }))

    try {
      const result = await Promise.race([linkingPromise, browserClosedPromise])
      await handleOAuthBrowserResult(result, createSessionFromUrl)
    } finally {
      linkingRemove?.()
      WebBrowser.dismissBrowser() // best-effort; CCT may already be closed
    }
    return
  }

  // ── iOS: ASWebAuthenticationSession via openAuthSessionAsync ──────────────
  let removeListener: (() => void) | undefined

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

  const browserPromise = WebBrowser.openAuthSessionAsync(oauthUrl, nativeRedirectTo)
  browserPromise.catch(() => {})

  try {
    const result = await Promise.race([
      browserPromise as Promise<OAuthBrowserResult>,
      linkingPromise,
    ])
    await handleOAuthBrowserResult(result, createSessionFromUrl)
  } finally {
    removeListener?.()
    WebBrowser.dismissAuthSession()
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
