/**
 * Unit tests for the retry logic in lib/photoroom.ts — removeBackground().
 *
 * Updated to use BgRemovalResult return type and globalThis.fetch mocking
 * instead of expo/fetch require.cache injection (which caused esbuild to
 * follow expo/fetch → react-native and fail on syntax it cannot transform
 * in Node.js).
 *
 * The retry contract:
 *   - photoroom_timeout on attempt 1 → attempt 2 is made
 *     - attempt 2 succeeds → { status: 'success', base64: '...' }
 *     - attempt 2 also times out → { status: 'failed' }
 *   - Any other error code (photoroom_error, photoroom_invalid_response,
 *     photoroom_empty_response) → no retry, non-success status
 *   - Network error (fetch throws) → no retry, { status: 'failed' }
 *   - Success on first call → { status: 'success', base64: '...' }, no retry
 *
 * Run: npx tsx __tests__/photoroomRetry.test.ts
 * Exits non-zero on any failed assertion.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { removeBackground, _testOverrides } from '../lib/photoroom';
import type { BgRemovalResult } from '../lib/photoroom';
import { PHOTOROOM_TIMEOUT_ERROR } from '../shared/photoroom-error-codes';

// ── Assertion helpers ──────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    failed++;
  }
}

// ── Mock fetch factory ─────────────────────────────────────────────────────────
//
// Replaces globalThis.fetch with a mock that returns responses from the
// provided array in order, tracking how many calls were made.
//
//   { imageBase64?, error? }  → resolves with { json: async () => response }
//   'throw'                   → rejects with a mock network error

type MockResponse = { imageBase64?: string; error?: string };

function setupMockFetch(responses: Array<MockResponse | 'throw'>): {
  callCount: () => number;
  restore: () => void;
} {
  let calls = 0;
  const original = (globalThis as any).fetch;

  (globalThis as any).fetch = async (_url: string, _init: unknown): Promise<unknown> => {
    const slot = responses[calls++] ?? {};
    if (slot === 'throw') {
      throw new Error('mock: network error');
    }
    return { json: async () => slot };
  };

  return {
    callCount: () => calls,
    restore: () => { (globalThis as any).fetch = original; },
  };
}

// ── Test runner ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // getApiUrl() reads this env var; set it before any import side-effects
  process.env.EXPO_PUBLIC_DOMAIN = 'test.example.com';

  // Bypass supabase.auth.getSession() for all server-call tests so this
  // suite runs in Node.js without a live Supabase connection.
  _testOverrides.sessionToken = 'test-token';

  // ── 1. timeout → success on retry ─────────────────────────────────────────

  console.log('\nremoveBackground — photoroom_timeout on attempt 1, success on retry:');

  {
    const mock = setupMockFetch([
      { error: PHOTOROOM_TIMEOUT_ERROR },
      { imageBase64: 'retry-success-png-base64' },
    ]);

    const result = await removeBackground('input-jpeg');
    mock.restore();

    assertEq(result.status, 'success', 'status is "success" on successful retry');
    assertEq(
      result.base64,
      'retry-success-png-base64',
      'returns PNG base64 from the successful retry',
    );
    assertEq(mock.callCount(), 2, 'exactly two fetch calls were made (initial + retry)');
  }

  // ── 2. timeout → timeout (both attempts fail) ──────────────────────────────

  console.log('\nremoveBackground — photoroom_timeout on both attempts:');

  {
    const mock = setupMockFetch([
      { error: PHOTOROOM_TIMEOUT_ERROR },
      { error: PHOTOROOM_TIMEOUT_ERROR },
    ]);

    const result = await removeBackground('input-jpeg');
    mock.restore();

    assertEq(result.status, 'failed', 'status is "failed" when retry also times out');
    assertEq(mock.callCount(), 2, 'exactly two fetch calls were made (initial + retry)');
  }

  // ── 3. photoroom_error — no retry ─────────────────────────────────────────

  console.log('\nremoveBackground — photoroom_error does NOT trigger a retry:');

  {
    const mock = setupMockFetch([
      { error: 'photoroom_error' },
      { imageBase64: 'should-never-be-returned' },
    ]);

    const result = await removeBackground('input-jpeg');
    mock.restore();

    assert(
      result.status !== 'success',
      'photoroom_error does not return success status',
    );
    assertEq(
      mock.callCount(),
      1,
      'only one fetch call made — photoroom_error does not trigger retry',
    );
  }

  // ── 4. photoroom_invalid_response — no retry ───────────────────────────────

  console.log('\nremoveBackground — photoroom_invalid_response does NOT trigger a retry:');

  {
    const mock = setupMockFetch([
      { error: 'photoroom_invalid_response' },
      { imageBase64: 'should-never-be-returned' },
    ]);

    const result = await removeBackground('input-jpeg');
    mock.restore();

    assert(
      result.status !== 'success',
      'photoroom_invalid_response does not return success status',
    );
    assertEq(
      mock.callCount(),
      1,
      'only one fetch call made — photoroom_invalid_response does not trigger retry',
    );
  }

  // ── 5. photoroom_empty_response — no retry ─────────────────────────────────

  console.log('\nremoveBackground — photoroom_empty_response does NOT trigger a retry:');

  {
    const mock = setupMockFetch([
      { error: 'photoroom_empty_response' },
      { imageBase64: 'should-never-be-returned' },
    ]);

    const result = await removeBackground('input-jpeg');
    mock.restore();

    assert(
      result.status !== 'success',
      'photoroom_empty_response does not return success status',
    );
    assertEq(
      mock.callCount(),
      1,
      'only one fetch call made — photoroom_empty_response does not trigger retry',
    );
  }

  // ── 6. Success on first call — no retry ────────────────────────────────────

  console.log('\nremoveBackground — success on first call, no retry needed:');

  {
    const mock = setupMockFetch([
      { imageBase64: 'first-call-success-base64' },
    ]);

    const result = await removeBackground('input-jpeg');
    mock.restore();

    assertEq(result.status, 'success', 'status is "success" on first-call success');
    assertEq(
      result.base64,
      'first-call-success-base64',
      'returns PNG base64 from the first successful call',
    );
    assertEq(mock.callCount(), 1, 'exactly one fetch call made (no unnecessary retry on success)');
  }

  // ── 7. Network error (fetch throws) — no retry ─────────────────────────────

  console.log('\nremoveBackground — network error (fetch throws) returns failed status, no retry:');

  {
    const mock = setupMockFetch(['throw']);

    const result = await removeBackground('input-jpeg');
    mock.restore();

    assertEq(
      result.status,
      'failed',
      'status is "failed" when fetch throws (graceful degradation)',
    );
    assertEq(mock.callCount(), 1, 'only one fetch call made — network errors do not trigger retry');
  }

  // ── 8. timeout → network error on retry ────────────────────────────────────

  console.log('\nremoveBackground — photoroom_timeout then network error on retry:');

  {
    const mock = setupMockFetch([
      { error: PHOTOROOM_TIMEOUT_ERROR },
      'throw',
    ]);

    const result = await removeBackground('input-jpeg');
    mock.restore();

    assertEq(
      result.status,
      'failed',
      'status is "failed" when retry attempt throws a network error',
    );
    assertEq(
      mock.callCount(),
      2,
      'two fetch calls made — retry was attempted even though it failed with a network error',
    );
  }

  // ── 9. Cross-layer contract: source-text assertions ────────────────────────
  //
  // Ensures that both the server handler and client lib import the error
  // constant from the shared module — inlining the bare string would
  // silently break the contract even if TypeScript still compiled.

  console.log('\nCross-layer contract — server and client import from shared module:');

  {
    const readSrc = (rel: string) =>
      readFileSync(join(process.cwd(), rel), 'utf8');

    const serverSrc = readSrc('server/remove-background.ts');
    assert(
      serverSrc.includes('shared/photoroom-error-codes'),
      'server/remove-background.ts imports from shared/photoroom-error-codes',
    );
    assert(
      serverSrc.includes('PHOTOROOM_TIMEOUT_ERROR'),
      'server/remove-background.ts references PHOTOROOM_TIMEOUT_ERROR constant',
    );
    assert(
      !/"photoroom_timeout"/.test(serverSrc),
      'server/remove-background.ts has no bare "photoroom_timeout" string literal',
    );

    const clientSrc = readSrc('lib/photoroom.ts');
    assert(
      clientSrc.includes('shared/photoroom-error-codes'),
      'lib/photoroom.ts imports from shared/photoroom-error-codes',
    );
    assert(
      clientSrc.includes('PHOTOROOM_TIMEOUT_ERROR'),
      'lib/photoroom.ts references PHOTOROOM_TIMEOUT_ERROR constant',
    );
    assert(
      !/"photoroom_timeout"/.test(clientSrc),
      'lib/photoroom.ts has no bare "photoroom_timeout" string literal',
    );

    assert(
      PHOTOROOM_TIMEOUT_ERROR === 'photoroom_timeout',
      'shared constant value is "photoroom_timeout"',
    );
  }

  // ── Final summary ──────────────────────────────────────────────────────────

  console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
