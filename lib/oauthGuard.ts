/**
 * Pure OAuth browser-result guard.
 *
 * Contains zero React Native / Expo / Supabase imports so it can be exercised
 * directly in a Node.js test environment (tsx) without any native module shims.
 *
 * `lib/auth.ts` imports and re-exports `handleOAuthBrowserResult`; tests
 * import it directly from here.
 */

export type OAuthBrowserResult =
  | { type: 'success'; url: string }
  | { type: 'dismiss' }
  | { type: 'cancel' }
  | { type: 'locked' };

/**
 * Core dismiss-guard logic shared by signInWithGoogle and signInWithApple.
 *
 * Only calls `createSession` when the in-app browser returned
 * `type === 'success'`.  For every other outcome — the user dismissing the
 * browser, the OS cancelling, or a session lock — the function returns without
 * touching the session, so `isAuthenticated` stays `false` and the navigation
 * useEffect in sign-in.tsx never fires.
 *
 * The `createSession` parameter defaults to `createSessionFromUrl` in
 * production callers but can be replaced with a spy in tests.
 */
export async function handleOAuthBrowserResult(
  result: OAuthBrowserResult,
  createSession: (url: string) => Promise<unknown>,
): Promise<void> {
  if (result.type === 'success') {
    await createSession(result.url);
  }
}
