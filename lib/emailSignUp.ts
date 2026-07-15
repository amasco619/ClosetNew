/**
 * Email sign-up flow extracted to its own Node-testable module.
 *
 * No static imports from react-native, expo/*, lib/supabase, or
 * lib/query-client so this file loads cleanly under tsx in Node.js test
 * environments. The supabase client is resolved via a guarded dynamic import;
 * Platform / makeRedirectUri are also dynamically imported only in the
 * production path.
 *
 * See .agents/memory/node-test-rn-isolation.md for the rationale.
 */

/**
 * Mutable overrides injected by the test suite.
 *
 * signUp — replaces supabase.auth.signUp(); receives the same argument shape
 *          the production call uses and must return { data, error }.
 *
 * Never reassign this export; mutate its properties instead. ESM named
 * exports compiled by tsx/esbuild are getter-only descriptors — mutating a
 * property on the stable object reference is the only safe override path.
 * See .agents/memory/test-overrides-pattern.md.
 */
export const _testOverrides: {
  signUp?: (params: {
    email: string
    password: string
    options: { emailRedirectTo: string }
  }) => Promise<{
    data: { session: unknown | null }
    error: { message: string } | null
  }>
} = {}

/**
 * Signs up a new user with email and password.
 *
 * Trims and lower-cases the email before forwarding it to Supabase.
 * Returns `{ needsConfirmation: true }` when Supabase has not yet issued a
 * session (i.e. email confirmation is required), and `false` when the account
 * is already confirmed and a session was created immediately.
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ needsConfirmation: boolean }> {
  let signUp: (params: {
    email: string
    password: string
    options: { emailRedirectTo: string }
  }) => Promise<{
    data: { session: unknown | null }
    error: { message: string } | null
  }>

  let emailRedirectTo: string

  if (_testOverrides.signUp) {
    signUp = _testOverrides.signUp
    emailRedirectTo = 'test://redirect'
  } else {
    const { supabase } = await import('./supabase')
    const { Platform } = await import('react-native')
    const { makeRedirectUri } = await import('expo-auth-session')

    const nativeRedirectTo = makeRedirectUri({ scheme: 'auracloset' })
    emailRedirectTo =
      Platform.OS === 'web'
        ? `${(globalThis as unknown as { window: { location: { origin: string } } }).window.location.origin}/auth/callback`
        : nativeRedirectTo

    signUp = (params) => supabase.auth.signUp(params)
  }

  const { data, error } = await signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo },
  })
  if (error) throw new Error(`[signUpWithEmail] ${error.message}`)
  return { needsConfirmation: !data.session }
}
