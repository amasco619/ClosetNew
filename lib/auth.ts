import { makeRedirectUri } from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import { supabase } from './supabase'

WebBrowser.maybeCompleteAuthSession()

const redirectTo = makeRedirectUri({ scheme: 'auracloset' })

export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url)
  if (errorCode) throw new Error(errorCode)

  const { access_token, refresh_token } = params
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
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: redirectTo,
    },
  })
  if (error) throw new Error(`[signUpWithEmail] ${error.message}`)
  return { needsConfirmation: !data.session }
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) throw new Error(`[signInWithEmail] ${error.message}`)
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo }
  )
  if (error) throw new Error(`[requestPasswordReset] ${error.message}`)
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(`[updatePassword] ${error.message}`)
}

export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  })
  if (error) throw new Error(`[signInWithGoogle] ${error.message}`)
  const result = await WebBrowser.openAuthSessionAsync(
    data?.url ?? '',
    redirectTo
  )
  if (result.type === 'success') {
    await createSessionFromUrl(result.url)
  }
}

export async function signInWithApple(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  })
  if (error) throw new Error(`[signInWithApple] ${error.message}`)
  const result = await WebBrowser.openAuthSessionAsync(
    data?.url ?? '',
    redirectTo
  )
  if (result.type === 'success') {
    await createSessionFromUrl(result.url)
  }
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
  if (password.length < 6) {
    return 'Password must be at least 6 characters.'
  }
  return null
}
