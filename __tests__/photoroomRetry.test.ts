/**
 * Unit tests for the retry logic in lib/photoroom.ts — removeBackground().
 *
 * The retry contract:
 *   - photoroom_timeout on attempt 1 → attempt 2 is made
 *     - attempt 2 succeeds → returns PNG base64
 *     - attempt 2 also times out → returns null
 *   - Any other error code (photoroom_error, photoroom_invalid_response,
 *     photoroom_empty_response) → no retry, returns null immediately
 *   - Network error (fetch throws) → no retry, returns null
 *   - Success on first call → returns PNG base64, no retry needed
 *
 * Strategy: expo/fetch is injected into require.cache before lib/photoroom.ts
 * is loaded so that photoroom receives our controlled mock fetch rather than
 * the native Expo networking module (which cannot run in Node.js).
 *
 * Run: npx tsx __tests__/photoroomRetry.test.ts
 * Exits non-zero on any failed assertion.
 */

import path from 'path';

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

// ── Module-mocking helper ──────────────────────────────────────────────────────
//
// loadPhotoroomWithMock() installs a controlled fetch into require.cache under
// the expo/fetch key, clears any cached copy of lib/photoroom.ts, then requires
// it fresh so the module captures our mock fetch binding at import time.
//
// It also records the number of times fetch was called so tests can assert that
// non-timeout error codes do NOT trigger a second network request.

type FetchResponse = { imageBase64?: string; error?: string };

interface MockContext {
  removeBackground: (imageBase64: string) => Promise<string | null>;
  callCount: () => number;
}

async function loadPhotoroomWithMock(
  responses: Array<FetchResponse | 'throw'>,
): Promise<MockContext> {
  let calls = 0;

  const mockFetch = async (_url: string, _init: unknown): Promise<unknown> => {
    const slot = responses[calls++];
    if (slot === 'throw') {
      throw new Error('mock: network error');
    }
    const data = slot ?? { imageBase64: undefined };
    return { json: async () => data };
  };

  const expoFetchKey = require.resolve('expo/fetch');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cache = (require as any).cache as Record<string, any>;
  const prevExpoFetch = cache[expoFetchKey];

  // Install mock expo/fetch
  cache[expoFetchKey] = {
    id: expoFetchKey,
    filename: expoFetchKey,
    loaded: true,
    exports: { fetch: mockFetch },
    children: [],
    paths: [],
  };

  // Clear any previously cached version of photoroom and its sibling
  const photoroomKey = path.resolve(__dirname, '../lib/photoroom.ts');
  const classifyKey  = path.resolve(__dirname, '../lib/classifyPath.ts');
  const qcKey        = path.resolve(__dirname, '../lib/query-client.ts');

  for (const k of [photoroomKey, classifyKey, qcKey]) {
    delete cache[k];
  }

  // Also try without extension in case tsx resolves differently
  try {
    const alt = require.resolve('../lib/photoroom');
    if (alt !== photoroomKey) {
      delete cache[alt];
    }
  } catch { /* ignore */ }

  // Load photoroom — it will import expo/fetch from our mocked cache entry
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { removeBackground } = require('../lib/photoroom') as {
    removeBackground: (s: string) => Promise<string | null>;
  };

  // Restore the original expo/fetch cache entry so other modules are unaffected
  if (prevExpoFetch !== undefined) {
    cache[expoFetchKey] = prevExpoFetch;
  } else {
    delete cache[expoFetchKey];
  }

  return {
    removeBackground,
    callCount: () => calls,
  };
}

// ── Test runner ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // getApiUrl() reads this env var; set it before any module load
  process.env.EXPO_PUBLIC_DOMAIN = 'test.example.com';

  // ── 1. timeout → success on retry ─────────────────────────────────────────

  console.log('\nremoveBackground — photoroom_timeout on attempt 1, success on retry:');

  {
    const ctx = await loadPhotoroomWithMock([
      { error: 'photoroom_timeout' },
      { imageBase64: 'retry-success-png-base64' },
    ]);

    const result = await ctx.removeBackground('input-jpeg');

    assertEq(
      result,
      'retry-success-png-base64',
      'returns PNG base64 from the successful retry',
    );
    assertEq(
      ctx.callCount(),
      2,
      'exactly two fetch calls were made (initial + retry)',
    );
  }

  // ── 2. timeout → timeout (both attempts fail) ──────────────────────────────

  console.log('\nremoveBackground — photoroom_timeout on both attempts:');

  {
    const ctx = await loadPhotoroomWithMock([
      { error: 'photoroom_timeout' },
      { error: 'photoroom_timeout' },
    ]);

    const result = await ctx.removeBackground('input-jpeg');

    assertEq(
      result,
      null,
      'returns null when retry also times out',
    );
    assertEq(
      ctx.callCount(),
      2,
      'exactly two fetch calls were made (initial + retry)',
    );
  }

  // ── 3. photoroom_error — no retry ─────────────────────────────────────────

  console.log('\nremoveBackground — photoroom_error does NOT trigger a retry:');

  {
    const ctx = await loadPhotoroomWithMock([
      { error: 'photoroom_error' },
      { imageBase64: 'should-never-be-returned' },
    ]);

    const result = await ctx.removeBackground('input-jpeg');

    assertEq(
      result,
      null,
      'photoroom_error returns null (no imageBase64 field)',
    );
    assertEq(
      ctx.callCount(),
      1,
      'only one fetch call made — photoroom_error does not trigger retry',
    );
  }

  // ── 4. photoroom_invalid_response — no retry ───────────────────────────────

  console.log('\nremoveBackground — photoroom_invalid_response does NOT trigger a retry:');

  {
    const ctx = await loadPhotoroomWithMock([
      { error: 'photoroom_invalid_response' },
      { imageBase64: 'should-never-be-returned' },
    ]);

    const result = await ctx.removeBackground('input-jpeg');

    assertEq(
      result,
      null,
      'photoroom_invalid_response returns null',
    );
    assertEq(
      ctx.callCount(),
      1,
      'only one fetch call made — photoroom_invalid_response does not trigger retry',
    );
  }

  // ── 5. photoroom_empty_response — no retry ─────────────────────────────────

  console.log('\nremoveBackground — photoroom_empty_response does NOT trigger a retry:');

  {
    const ctx = await loadPhotoroomWithMock([
      { error: 'photoroom_empty_response' },
      { imageBase64: 'should-never-be-returned' },
    ]);

    const result = await ctx.removeBackground('input-jpeg');

    assertEq(
      result,
      null,
      'photoroom_empty_response returns null',
    );
    assertEq(
      ctx.callCount(),
      1,
      'only one fetch call made — photoroom_empty_response does not trigger retry',
    );
  }

  // ── 6. Success on first call — no retry ────────────────────────────────────

  console.log('\nremoveBackground — success on first call, no retry needed:');

  {
    const ctx = await loadPhotoroomWithMock([
      { imageBase64: 'first-call-success-base64' },
    ]);

    const result = await ctx.removeBackground('input-jpeg');

    assertEq(
      result,
      'first-call-success-base64',
      'returns PNG base64 from the first successful call',
    );
    assertEq(
      ctx.callCount(),
      1,
      'exactly one fetch call made (no unnecessary retry on success)',
    );
  }

  // ── 7. Network error (fetch throws) — no retry ─────────────────────────────

  console.log('\nremoveBackground — network error (fetch throws) returns null, no retry:');

  {
    const ctx = await loadPhotoroomWithMock(['throw']);

    const result = await ctx.removeBackground('input-jpeg');

    assertEq(
      result,
      null,
      'returns null when fetch throws (graceful degradation)',
    );
    assertEq(
      ctx.callCount(),
      1,
      'only one fetch call made — network errors do not trigger retry',
    );
  }

  // ── 8. timeout → network error on retry ────────────────────────────────────

  console.log('\nremoveBackground — photoroom_timeout then network error on retry:');

  {
    const ctx = await loadPhotoroomWithMock([
      { error: 'photoroom_timeout' },
      'throw',
    ]);

    const result = await ctx.removeBackground('input-jpeg');

    assertEq(
      result,
      null,
      'returns null when retry attempt throws a network error',
    );
    assertEq(
      ctx.callCount(),
      2,
      'two fetch calls made — retry was attempted even though it failed with a network error',
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
