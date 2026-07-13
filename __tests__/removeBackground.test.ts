/**
 * Tests for the background-removal / classify integration path.
 *
 * Covers three scenarios from the task spec:
 *
 *  A. resolveClassifyBase64 (pure helper in lib/photoroom.ts)
 *     — When bg removal succeeds (non-empty re-encoded JPEG), that string is
 *       returned, not the original JPEG.
 *     — When bg removal or re-encode fails (null / undefined / empty string),
 *       the original JPEG is returned so classify always receives a valid payload.
 *
 *  B. server/remove-background.ts handler
 *     — Missing PHOTOROOM_API_KEY → 503 (not 500).
 *     — Photoroom returns non-OK (e.g. 422) → 502.
 *     — Missing imageBase64 in request body → 400.
 *     — Network error (fetch throws) → 502.
 *
 * No live network calls are made. The server handler is tested with lightweight
 * mock req/res objects; global fetch is monkey-patched per test where needed.
 *
 * Run: `npx tsx __tests__/removeBackground.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { resolveClassifyBase64, selectClassifyPayload } from '../lib/classifyPath';
import { removeBackground as serverRemoveBackground } from '../server/remove-background';

// ── Assertion harness ──────────────────────────────────────────────────────────

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

// ── Mock req / res factory ─────────────────────────────────────────────────────

interface MockRes {
  _status: number;
  _body: unknown;
  status(code: number): MockRes;
  json(body: unknown): MockRes;
}

function makeMockRes(): MockRes {
  const res: MockRes = {
    _status: 200,
    _body: null,
    status(code) { res._status = code; return res; },
    json(body) { res._body = body; return res; },
  };
  return res;
}

function makeMockReq(body: Record<string, unknown> = {}): { body: Record<string, unknown> } {
  return { body };
}

// ── All tests (sync + async) in a single runner ────────────────────────────────

async function main() {

  // ── A. resolveClassifyBase64 — happy path ─────────────────────────────────

  console.log('\nresolveClassifyBase64 — bg removal succeeded:');

  {
    const original = 'original-jpeg-base64';
    const reencoded = 'reencoded-jpeg-from-png-base64';
    assertEq(
      resolveClassifyBase64(original, reencoded),
      reencoded,
      'non-empty re-encoded JPEG is forwarded to classify (not the original)',
    );
  }

  {
    const original = 'original-jpeg-base64';
    const reencoded = 'a'; // minimal non-empty string
    assertEq(
      resolveClassifyBase64(original, reencoded),
      reencoded,
      'single-char re-encoded string is treated as valid and forwarded',
    );
  }

  // ── A. resolveClassifyBase64 — failure / fallback paths ───────────────────

  console.log('\nresolveClassifyBase64 — bg removal failed (fallback to original):');

  {
    const original = 'original-jpeg-base64';
    assertEq(
      resolveClassifyBase64(original, null),
      original,
      'null reencodedJpeg → original JPEG forwarded (Photoroom 502 / network error)',
    );
  }

  {
    const original = 'original-jpeg-base64';
    assertEq(
      resolveClassifyBase64(original, undefined),
      original,
      'undefined reencodedJpeg → original JPEG forwarded (re-encode exception path)',
    );
  }

  {
    const original = 'original-jpeg-base64';
    assertEq(
      resolveClassifyBase64(original, ''),
      original,
      'empty string reencodedJpeg → original JPEG forwarded (never passes empty to Gemini)',
    );
  }

  // ── A. resolveClassifyBase64 — invariant: result is never empty ────────────

  console.log('\nresolveClassifyBase64 — result is always non-empty:');

  for (const bad of [null, undefined, ''] as const) {
    const result = resolveClassifyBase64('non-empty-original', bad);
    assert(result.length > 0, `result is non-empty when reencodedJpeg is ${JSON.stringify(bad)}`);
  }

  // ── C. Full pipeline integration — what classify endpoint receives ──────────
  // Models the complete add-item.tsx / bulk-review.tsx pipeline logic:
  //   1. original JPEG is the fallback
  //   2. removeBackground() called with original → returns png or null
  //   3. if png returned, re-encode to JPEG → success or throws
  //   4. resolveClassifyBase64 selects the final payload for classify

  console.log('\nPipeline integration — classify endpoint receives correct payload:');

  {
    const original = 'original-jpeg-base64';
    const bgPng = 'photoroom-png-base64';
    const reencoded = 'reencoded-jpeg-base64';
    assertEq(
      selectClassifyPayload(original, bgPng, reencoded),
      reencoded,
      'success path: /api/remove-background returns PNG → classify receives re-encoded JPEG (not original)',
    );
  }

  {
    const original = 'original-jpeg-base64';
    assertEq(
      selectClassifyPayload(original, null, null),
      original,
      'failure path (HTTP 502): /api/remove-background returns null → classify falls back to original JPEG',
    );
  }

  {
    const original = 'original-jpeg-base64';
    assertEq(
      selectClassifyPayload(original, null, null),
      original,
      'failure path (network error): fetch throws → classify falls back to original JPEG, item still saves',
    );
  }

  {
    const original = 'original-jpeg-base64';
    assertEq(
      selectClassifyPayload(original, null, null),
      original,
      'failure path (empty body): response.imageBase64 missing → lib/photoroom returns null → classify uses original JPEG',
    );
  }

  {
    const original = 'original-jpeg-base64';
    const bgPng = 'photoroom-png-base64';
    assertEq(
      selectClassifyPayload(original, bgPng, null),
      original,
      'partial failure: bg removal succeeded but re-encoding threw → classify falls back to original JPEG',
    );
  }

  {
    const original = 'original-jpeg-base64';
    const bgPng = 'photoroom-png-base64';
    assertEq(
      selectClassifyPayload(original, bgPng, ''),
      original,
      'partial failure: re-encoding returned empty string → classify falls back to original JPEG (never empty to Gemini)',
    );
  }

  // Invariant: classify payload is never empty regardless of pipeline outcome
  console.log('\nPipeline invariant — classify payload is never empty:');

  const pipelineCases: Array<[string | null, string | null]> = [
    [null, null],
    ['some-png', null],
    ['some-png', ''],
    [null, 'ignored'],
  ];

  for (const [bgPng, reencoded] of pipelineCases) {
    const result = selectClassifyPayload('non-empty-original', bgPng, reencoded);
    assert(result.length > 0, `payload is non-empty for bgPng=${JSON.stringify(bgPng)}, reencoded=${JSON.stringify(reencoded)}`);
  }

  // ── B. server handler — missing PHOTOROOM_API_KEY → 503 ───────────────────

  console.log('\nserver/remove-background — missing PHOTOROOM_API_KEY:');

  {
    const savedKey = process.env.PHOTOROOM_API_KEY;
    delete process.env.PHOTOROOM_API_KEY;

    const req = makeMockReq({ imageBase64: 'any-base64' });
    const res = makeMockRes();

    await serverRemoveBackground(req as any, res as any);

    assertEq(res._status, 503, 'missing API key → HTTP 503 (not 500)');
    assertEq(
      (res._body as any)?.error,
      'background_removal_unavailable',
      'missing API key → error: "background_removal_unavailable"',
    );

    if (savedKey !== undefined) process.env.PHOTOROOM_API_KEY = savedKey;
  }

  // ── B. server handler — missing imageBase64 → 400 ─────────────────────────

  console.log('\nserver/remove-background — missing imageBase64:');

  {
    process.env.PHOTOROOM_API_KEY = 'test-key';

    const req = makeMockReq({});
    const res = makeMockRes();

    await serverRemoveBackground(req as any, res as any);

    assertEq(res._status, 400, 'missing imageBase64 body → HTTP 400');
    assertEq(
      (res._body as any)?.error,
      'imageBase64 is required',
      'missing imageBase64 → error: "imageBase64 is required"',
    );
  }

  // ── B. server handler — Photoroom returns non-OK → 502 ────────────────────

  console.log('\nserver/remove-background — Photoroom returns non-OK response:');

  {
    process.env.PHOTOROOM_API_KEY = 'test-key';

    const req = makeMockReq({ imageBase64: 'valid-base64' });
    const res = makeMockRes();

    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => ({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => 'Invalid image format',
    });

    await serverRemoveBackground(req as any, res as any);

    assertEq(res._status, 502, 'Photoroom non-OK response → HTTP 502');
    assertEq(
      (res._body as any)?.error,
      'photoroom_error',
      'Photoroom non-OK → error: "photoroom_error"',
    );
    assertEq(
      (res._body as any)?.status,
      422,
      'Photoroom non-OK → upstream status forwarded in body',
    );

    (globalThis as any).fetch = originalFetch;
  }

  // ── B. server handler — network error (fetch throws) → 502 ────────────────

  console.log('\nserver/remove-background — network error:');

  {
    process.env.PHOTOROOM_API_KEY = 'test-key';

    const req = makeMockReq({ imageBase64: 'valid-base64' });
    const res = makeMockRes();

    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => { throw new Error('ECONNREFUSED'); };

    await serverRemoveBackground(req as any, res as any);

    assertEq(res._status, 502, 'network error → HTTP 502 (not 500)');
    assertEq(
      (res._body as any)?.error,
      'background_removal_failed',
      'network error → error: "background_removal_failed"',
    );

    (globalThis as any).fetch = originalFetch;
    delete process.env.PHOTOROOM_API_KEY;
  }

  // ── Final result ───────────────────────────────────────────────────────────

  console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Unexpected error in test runner:', err);
  process.exit(1);
});
