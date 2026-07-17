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
 * Minimal interface for an AppState-like event source.
 * Matches the shape of React Native's AppState so the real module can be
 * passed in production and a hand-rolled fake can be used in tests.
 */
export interface AppStateEventSource {
  addEventListener(
    type: 'change',
    handler: (state: string) => void,
  ): { remove(): void };
}

/**
 * Pure factory for the Android OAuth cancel-detection promise.
 *
 * When the host app transitions background → active without a linking event,
 * the returned `promise` resolves to `{ type: 'cancel' }` after `delayMs`
 * (default 400 ms) — matching the behaviour in `lib/auth.ts`.
 *
 * Call `markLinkingResolved()` as soon as a success deep-link is received so
 * the cancel timer is pre-empted.
 *
 * Extracted from `lib/auth.ts` as a pure, zero-native-dep factory so it can
 * be exercised directly in Node/tsx unit tests without any native shims.
 */
export function buildAndroidCancelDetector(
  appState: AppStateEventSource,
  delayMs = 400,
): { promise: Promise<OAuthBrowserResult>; markLinkingResolved(): void } {
  let linkingResolved = false;
  let wentBackground = false;
  let cancelTimer: ReturnType<typeof setTimeout> | undefined;
  let sub: { remove(): void } | undefined;

  const promise = new Promise<OAuthBrowserResult>((resolve) => {
    sub = appState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        wentBackground = true;
      } else if (wentBackground && state === 'active' && !linkingResolved) {
        cancelTimer = setTimeout(() => {
          if (!linkingResolved) resolve({ type: 'cancel' });
        }, delayMs);
      }
    });
  });

  return {
    promise,
    markLinkingResolved() {
      linkingResolved = true;
      clearTimeout(cancelTimer);
      sub?.remove();
    },
  };
}

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
