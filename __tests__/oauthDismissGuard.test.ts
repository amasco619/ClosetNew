/**
 * Unit tests for the OAuth dismiss guard in lib/auth.ts.
 *
 * Verifies that `_handleOAuthBrowserResult` (the core guard shared by both
 * signInWithGoogle and signInWithApple) only calls `createSession` when the
 * in-app browser returns `type === 'success'`.  All other result types —
 * 'dismiss', 'cancel', 'locked' — must leave the session untouched so the
 * user stays on the sign-in screen.
 *
 * The `isAuthenticated` flag in AppContext is driven exclusively by
 * onAuthStateChange, which only fires after a real session is established.
 * Because the guard never calls `createSessionFromUrl` on a non-success
 * result, no Supabase event is emitted, `isAuthenticated` stays `false`, and
 * the navigation useEffect in sign-in.tsx never fires.
 *
 * Run: `npx tsx __tests__/oauthDismissGuard.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { handleOAuthBrowserResult } from '../lib/oauthGuard';

// ── Assertion harness ─────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function section(name: string): void {
  console.log(`\n${name}:`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a spy createSession function paired with a calls array so tests
 * can check whether it was invoked and with what URL.
 */
function makeSessionSpy() {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
  };
  return { calls, fn };
}

/**
 * Mirrors the useEffect guard in app/sign-in.tsx:
 *
 *   useEffect(() => {
 *     if (isAuthenticated) router.replace('/')
 *   }, [isAuthenticated])
 *
 * Extracted as a pure function so we can exercise it without a React renderer.
 */
function applyAuthGuard(isAuthenticated: boolean, navigate: () => void): void {
  if (isAuthenticated) navigate();
}

// ── Main (async wrapper required for top-level await under CJS/tsx) ───────────

(async () => {

// ── Dismiss / cancel / locked paths ──────────────────────────────────────────

section('OAuth browser dismissed — session must not be created');

{
  const spy = makeSessionSpy();
  await handleOAuthBrowserResult({ type: 'dismiss' }, spy.fn);
  assert(spy.calls.length === 0, 'dismiss: createSession is NOT called');
}

{
  const spy = makeSessionSpy();
  await handleOAuthBrowserResult({ type: 'cancel' }, spy.fn);
  assert(spy.calls.length === 0, 'cancel: createSession is NOT called');
}

{
  const spy = makeSessionSpy();
  await handleOAuthBrowserResult({ type: 'locked' }, spy.fn);
  assert(spy.calls.length === 0, 'locked: createSession is NOT called');
}

// ── Happy path ────────────────────────────────────────────────────────────────

section('OAuth browser success — session must be created');

{
  const TARGET_URL = 'auracloset://auth/callback?access_token=tok&refresh_token=rtok';
  const spy = makeSessionSpy();
  await handleOAuthBrowserResult({ type: 'success', url: TARGET_URL }, spy.fn);
  assert(spy.calls.length === 1, 'success: createSession IS called exactly once');
  assert(spy.calls[0] === TARGET_URL, 'success: createSession receives the callback URL verbatim');
}

// ── isAuthenticated guard (navigation logic) ──────────────────────────────────

section('isAuthenticated guard — navigation must not fire when session is absent');

{
  let navigated = false;
  applyAuthGuard(false, () => { navigated = true; });
  assert(!navigated, 'isAuthenticated=false: navigation does NOT fire');
}

{
  let navigated = false;
  applyAuthGuard(true, () => { navigated = true; });
  assert(navigated, 'isAuthenticated=true: navigation fires');
}

// ── End-to-end trace — dismiss path ──────────────────────────────────────────

section('End-to-end dismiss trace: browser dismissed → no session → no navigation');

{
  // Simulate what happens when the user dismisses the browser mid-OAuth.
  // Step 1+2: guard skips createSession on dismiss.
  // Step 3:   isAuthenticated remains false (no onAuthStateChange event).
  // Step 4:   navigation guard does not fire.

  let isAuthenticated = false;

  await handleOAuthBrowserResult({ type: 'dismiss' }, async (_url) => {
    // In production, createSessionFromUrl → supabase.auth.setSession →
    // onAuthStateChange → isAuthenticated = true.  This path is skipped.
    isAuthenticated = true;
  });

  assert(isAuthenticated === false, 'end-to-end dismiss: isAuthenticated stays false');

  let navigated = false;
  applyAuthGuard(isAuthenticated, () => { navigated = true; });
  assert(!navigated, 'end-to-end dismiss: navigation does not fire');
}

// ── End-to-end trace — success path ──────────────────────────────────────────

section('End-to-end success trace: browser success → session → navigation fires');

{
  const CALLBACK_URL = 'auracloset://auth/callback?access_token=tok&refresh_token=rtok';
  let isAuthenticated = false;

  await handleOAuthBrowserResult({ type: 'success', url: CALLBACK_URL }, async (_url) => {
    // createSessionFromUrl sets the session → onAuthStateChange → isAuthenticated = true.
    isAuthenticated = true;
  });

  assert(isAuthenticated as boolean === true, 'end-to-end success: isAuthenticated becomes true');

  let navigated = false;
  applyAuthGuard(isAuthenticated, () => { navigated = true; });
  assert(navigated, 'end-to-end success: navigation fires');
}

// ── Exit ──────────────────────────────────────────────────────────────────────

console.log(`\n=== oauthDismissGuard: ${failed === 0 ? 'all tests passed' : `${failed} test(s) FAILED`} ===\n`);
if (failed > 0) process.exit(1);

})();
