import { Platform } from 'react-native'
import { makeRedirectUri } from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import { fetch } from 'expo/fetch'
import { supabase } from './supabase'
import { getApiUrl } from './query-client'
import { handleOAuthBrowserResult } from './oauthGuard'
export { signInWithEmail } from './emailSignIn'

WebBrowser.maybeCompleteAuthSession()

const nativeRedirectTo = makeRedirectUri({ scheme: 'auracloset' })

export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url)
  if (errorCode) throw new Error(errorCode)

  const { access_token, refresh_token, code } = params

  // PKCE flow (Supabase JS v2 default for OAuth on native).
  // The redirect URL contains ?code=xxx; exchange it using the stored PKCE
  // verifier via exchangeCodeForSession, which handles the processLock
  // internally and avoids the setSession deadlock.
  // Pass the code string itself (not the full URL) as the auth-js contract
  // requires the authorization code value, not the callback URL.
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(String(code))
    if (error) throw new Error(`[createSessionFromUrl] ${error.message}`)
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
  return data.session
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ needsConfirmation: boolean }> {
  const emailRedirectTo =
    Platform.OS === 'web'
      ? `${window.location.origin}/auth/callback`
      : nativeRedirectTo

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo,
    },
  })
  if (error) throw new Error(`[signUpWithEmail] ${error.message}`)
  return { needsConfirmation: !data.session }
}


export async function requestPasswordReset(email: string): Promise<void> {
  const url = new URL('/api/auth/reset-password', getApiUrl())
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
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

export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    // On web, custom URL schemes (auracloset://) cannot be received by the
    // browser, so WebBrowser.openAuthSessionAsync would hang indefinitely
    // waiting for a redirect that never lands. Use a full-page redirect
    // instead: Supabase calls window.location.assign() and the browser
    // navigates to Google, completes auth, and returns to this origin.
    // detectSessionInUrl:true (set in lib/supabase.ts for web) will
    // auto-process the PKCE code on return.
    const origin = typeof window !== 'undefined' ? window.location.origin : nativeRedirectTo
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: origin,
      },
    })
    if (error) throw new Error(`[signInWithGoogle] ${error.message}`)
    // window.location.assign() has been called; the page is navigating away.
    return
  }

  // Native: in-app browser with auracloset:// deep-link redirect.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: nativeRedirectTo,
      skipBrowserRedirect: true,
    },
  })
  if (error) throw new Error(`[signInWithGoogle] ${error.message}`)
  const result = await WebBrowser.openAuthSessionAsync(
    data?.url ?? '',
    nativeRedirectTo
  )
  await handleOAuthBrowserResult(result as import('./oauthGuard').OAuthBrowserResult, createSessionFromUrl)
}

export async function signInWithApple(): Promise<void> {
  if (Platform.OS === 'web') {
    const origin = typeof window !== 'undefined' ? window.location.origin : nativeRedirectTo
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: origin,
      },
    })
    if (error) throw new Error(`[signInWithApple] ${error.message}`)
    return
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: nativeRedirectTo,
      skipBrowserRedirect: true,
    },
  })
  if (error) throw new Error(`[signInWithApple] ${error.message}`)
  const result = await WebBrowser.openAuthSessionAsync(
    data?.url ?? '',
    nativeRedirectTo
  )
  await handleOAuthBrowserResult(result as import('./oauthGuard').OAuthBrowserResult, createSessionFromUrl)
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
