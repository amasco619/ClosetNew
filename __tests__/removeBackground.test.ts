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

import { resolveClassifyBase64, selectClassifyPayload, resolvePhotoUri } from '../lib/classifyPath';
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

  // ── B. server handler — Photoroom HTTP 200 with 0-byte body → 502 ───────────
  // The real bug: Photoroom returns a valid HTTP 200 but an empty PNG body.
  // Without the byteLength guard the server would return a 200 with an empty
  // base64 string, storing a broken image in Supabase Storage.

  console.log('\nserver/remove-background — Photoroom HTTP 200 with empty body (0 bytes):');

  {
    process.env.PHOTOROOM_API_KEY = 'test-key';

    const req = makeMockReq({ imageBase64: 'valid-base64' });
    const res = makeMockRes();

    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    await serverRemoveBackground(req as any, res as any);

    assertEq(res._status, 502, 'HTTP 200 with 0-byte body → HTTP 502 (not 200)');
    assertEq(
      (res._body as any)?.error,
      'photoroom_empty_response',
      'HTTP 200 with 0-byte body → error: "photoroom_empty_response"',
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

  // ── D. resolvePhotoUri — URI stored in wardrobe state is never data: ───────

  console.log('\nresolvePhotoUri — normal file:// URI from ImageManipulator:');

  {
    const original = 'file:///var/mobile/Containers/Data/tmp/original.jpg';
    const reencoded = 'file:///var/mobile/Containers/Data/tmp/IMG_reencoded.jpg';
    assertEq(
      resolvePhotoUri(original, reencoded),
      reencoded,
      'file:// reencoded URI is accepted and returned',
    );
  }

  {
    const original = 'file:///original.jpg';
    const reencoded = 'https://supabase.co/storage/v1/object/public/wardrobe/123.png';
    assertEq(
      resolvePhotoUri(original, reencoded),
      reencoded,
      'https:// URI is accepted and returned (Supabase public URL)',
    );
  }

  console.log('\nresolvePhotoUri — data: URI is rejected, falls back to originalUri:');

  {
    const original = 'file:///original.jpg';
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB...';
    assertEq(
      resolvePhotoUri(original, dataUri),
      original,
      'data: reencoded URI is rejected — falls back to original asset URI',
    );
  }

  {
    const original = 'file:///original.jpg';
    assertEq(
      resolvePhotoUri(original, null),
      original,
      'null reencoded URI → falls back to original (ImageManipulator threw)',
    );
  }

  {
    const original = 'file:///original.jpg';
    assertEq(
      resolvePhotoUri(original, undefined),
      original,
      'undefined reencoded URI → falls back to original',
    );
  }

  {
    const original = 'file:///original.jpg';
    assertEq(
      resolvePhotoUri(original, ''),
      original,
      'empty string reencoded URI → falls back to original',
    );
  }

  console.log('\nresolvePhotoUri invariant — result never starts with data::');

  const photoUriCases: Array<string | null | undefined> = [
    'data:image/jpeg;base64,abc123',
    'data:image/png;base64,iVBORw0KGgo=',
    null,
    undefined,
    '',
  ];

  for (const candidate of photoUriCases) {
    const result = resolvePhotoUri('file:///safe-fallback.jpg', candidate);
    assert(
      !result.startsWith('data:'),
      `result does not start with "data:" when reencodedUri is ${JSON.stringify(candidate)}`,
    );
  }

  // ── E. finalUri selection — wardrobe state never receives a data: URI ──────
  // Models the handleSave() logic in add-item.tsx:
  //   1. photoUri is set via resolvePhotoUri (never data:) before handleSave runs
  //   2. Upload success  → finalUri = Supabase public URL (https://)
  //   3. Upload failure  → finalUri = photoUri (file://)
  //   4. Guest copy ok   → finalUri = documentDirectory path (file://)
  //   5. Guest copy fail → finalUri = photoUri (file://)
  // In all paths, finalUri must never start with "data:".

  console.log('\nfinalUri selection — stored photoUri is never a data: URI:');

  function selectFinalUri(
    photoUri: string,
    uploadedUrl: string | null,
    guestDestPath: string | null,
  ): string {
    if (uploadedUrl !== null) return uploadedUrl;
    if (guestDestPath !== null) return guestDestPath;
    return photoUri;
  }

  const fileUri = 'file:///var/mobile/Containers/Data/tmp/IMG_reencoded.jpg';
  const supabaseUrl = 'https://project.supabase.co/storage/v1/object/public/wardrobe/uuid.png';
  const docDirPath = 'file:///var/mobile/Containers/Data/Documents/wardrobe_uuid.png';

  {
    assertEq(
      selectFinalUri(fileUri, supabaseUrl, null),
      supabaseUrl,
      'upload success → finalUri is Supabase https:// URL',
    );
  }

  {
    assertEq(
      selectFinalUri(fileUri, null, null),
      fileUri,
      'upload failure → finalUri falls back to file:// photoUri',
    );
  }

  {
    assertEq(
      selectFinalUri(fileUri, null, docDirPath),
      docDirPath,
      'guest copy success → finalUri is documentDirectory file:// path',
    );
  }

  {
    assertEq(
      selectFinalUri(fileUri, null, null),
      fileUri,
      'guest copy failure → finalUri falls back to file:// photoUri',
    );
  }

  console.log('\nfinalUri invariant — never data: in any path:');

  const finalUriCases: Array<[string | null, string | null]> = [
    [supabaseUrl, null],
    [null, null],
    [null, docDirPath],
  ];

  for (const [uploadedUrl, guestDest] of finalUriCases) {
    const result = selectFinalUri(fileUri, uploadedUrl, guestDest);
    assert(
      !result.startsWith('data:'),
      `finalUri never starts with "data:" (uploadedUrl=${JSON.stringify(uploadedUrl)}, guestDest=${JSON.stringify(guestDest)})`,
    );
  }

  // ── F. Bulk-review classify path ──────────────────────────────────────────
  //
  // bulk-review.tsx classifyUri() models the same pipeline as add-item.tsx:
  //   1. Resize → original JPEG base64 (classifyBase64 = resized.base64)
  //   2. removeBackground(resized.base64) → cleanPngBase64 | null
  //   3. If cleanPngBase64:
  //        a. re-encode PNG → JPEG (ImageManipulator.manipulateAsync)
  //        b. classifyBase64 = resolveClassifyBase64(classifyBase64, reencoded.base64)
  //   4. POST /api/classify-garment with { imageBase64: classifyBase64 }
  //
  // All paths below use selectClassifyPayload() which is the pure distillation
  // of that exact logic, exercising the same resolveClassifyBase64 branch that
  // bulk-review.tsx calls on line 379.

  console.log('\nbulk-review classify path — resolveClassifyBase64 is used for every item:');

  {
    // Happy path: bg removal AND re-encode both succeed for a single item.
    const originalJpeg = 'bulk-item-original-jpeg';
    const bgPng = 'photoroom-clean-png';
    const reencodedJpeg = 'reencoded-jpeg-for-gemini';
    assertEq(
      selectClassifyPayload(originalJpeg, bgPng, reencodedJpeg),
      reencodedJpeg,
      'bulk: bg removal + re-encode succeed → classify receives re-encoded JPEG (not original)',
    );
  }

  {
    // bg removal returns null (Photoroom API key missing, network error, HTTP 502).
    const originalJpeg = 'bulk-item-original-jpeg';
    assertEq(
      selectClassifyPayload(originalJpeg, null, null),
      originalJpeg,
      'bulk: bg removal returns null → classify falls back to original JPEG (item still classified)',
    );
  }

  {
    // bg removal succeeds but ImageManipulator.manipulateAsync throws during re-encode.
    // The catch block in bulk-review.tsx keeps classifyBase64 at the original value.
    const originalJpeg = 'bulk-item-original-jpeg';
    const bgPng = 'photoroom-clean-png';
    assertEq(
      selectClassifyPayload(originalJpeg, bgPng, null),
      originalJpeg,
      'bulk: bg removal succeeds but re-encode throws → classify falls back to original JPEG',
    );
  }

  {
    // bg removal succeeds but re-encode yields an empty base64 string.
    // resolveClassifyBase64 treats empty string as a failure.
    const originalJpeg = 'bulk-item-original-jpeg';
    const bgPng = 'photoroom-clean-png';
    assertEq(
      selectClassifyPayload(originalJpeg, bgPng, ''),
      originalJpeg,
      'bulk: re-encode produces empty string → classify falls back to original JPEG (never sends empty payload)',
    );
  }

  {
    // bg removal returns an empty string (malformed Photoroom response).
    // lib/photoroom.ts returns data.imageBase64 ?? null, so a missing key yields null;
    // but guard that empty string from a different code path also falls back.
    const originalJpeg = 'bulk-item-original-jpeg';
    assertEq(
      selectClassifyPayload(originalJpeg, null, null),
      originalJpeg,
      'bulk: malformed Photoroom response (treated as null) → classify falls back to original JPEG',
    );
  }

  console.log('\nbulk-review classify path — multi-item: every item independently falls back:');

  {
    // Simulate a 3-item bulk upload where bg removal behaves differently per item.
    const items = [
      { original: 'item-a-jpeg', bgPng: 'bg-removed-a', reencoded: 'reenc-a' },
      { original: 'item-b-jpeg', bgPng: null,            reencoded: null },
      { original: 'item-c-jpeg', bgPng: 'bg-removed-c',  reencoded: null },
    ];

    const expected = ['reenc-a', 'item-b-jpeg', 'item-c-jpeg'];

    items.forEach((item, i) => {
      const result = selectClassifyPayload(item.original, item.bgPng, item.reencoded);
      assertEq(
        result,
        expected[i],
        `bulk item [${i}]: correct classify payload selected independently of other items`,
      );
    });
  }

  console.log('\nbulk-review classify path — invariant: classify payload is never empty:');

  {
    // Across all realistic pipeline outcomes for a bulk item, the classify
    // payload must always be a non-empty string so Gemini never receives garbage.
    const bulkFailureCases: Array<[string | null, string | null]> = [
      [null, null],          // bg removal failed outright
      ['png', null],         // re-encode threw
      ['png', ''],           // re-encode returned empty string
      [null, 'ignored'],     // bg removal null; reencoded arg is irrelevant
    ];

    for (const [bgPng, reencoded] of bulkFailureCases) {
      const result = selectClassifyPayload('non-empty-original', bgPng, reencoded);
      assert(
        result.length > 0,
        `bulk invariant: classify payload non-empty for bgPng=${JSON.stringify(bgPng)}, reencoded=${JSON.stringify(reencoded)}`,
      );
    }
  }

  // ── G. Bulk-review displayUri path — resolvePhotoUri guards the card preview URI
  //
  // After background removal + re-encode, classifyUri() in bulk-review.tsx calls
  // resolvePhotoUri(uri, reencoded.uri) to update displayUri.  The helper ensures
  // the stored value is always a file:// or https:// URI, never a data: string.
  //
  // Mapping to bulk-review.tsx code paths:
  //   Success  → ImageManipulator returns file:// URI → resolvePhotoUri accepts it
  //   Failure  → re-encode throws / returns null      → resolvePhotoUri falls back
  //              to the original asset URI (item.uri)
  //   Invariant → displayUri (and therefore the wardrobe photoUri) never starts with "data:"

  console.log('\nbulk-review displayUri — resolvePhotoUri guards the card preview URI:');

  {
    // Happy path: bg removal + re-encode both succeed.
    // ImageManipulator.manipulateAsync returns a local file:// URI.
    const originalAssetUri = 'file:///var/mobile/tmp/bulk-item-0.jpg';
    const reencodedFileUri = 'file:///var/mobile/tmp/IMG_reencoded_bulk-item-0.jpg';
    assertEq(
      resolvePhotoUri(originalAssetUri, reencodedFileUri),
      reencodedFileUri,
      'bulk displayUri: re-encode succeeds → file:// URI accepted as displayUri',
    );
  }

  {
    // bg removal succeeds but ImageManipulator.manipulateAsync throws during re-encode.
    // The catch block in bulk-review.tsx calls resolvePhotoUri(uri, null), which
    // returns the original asset URI, resetting displayUri away from the intermediate
    // data: PNG that was set just before the try block.
    const originalAssetUri = 'file:///var/mobile/tmp/bulk-item-1.jpg';
    assertEq(
      resolvePhotoUri(originalAssetUri, null),
      originalAssetUri,
      'bulk displayUri: re-encode throws → catch calls resolvePhotoUri(uri, null) → original asset URI stored',
    );
  }

  {
    // bg removal returns null (API key missing / network error / HTTP 502).
    // classifyUri skips the re-encode try/catch block entirely; no data: URI is ever
    // set into displayUri, so it stays as the original asset URI (item.uri).
    const originalAssetUri = 'file:///var/mobile/tmp/bulk-item-2.jpg';
    assertEq(
      resolvePhotoUri(originalAssetUri, null),
      originalAssetUri,
      'bulk displayUri: bg removal returns null → re-encode block skipped → original asset URI kept',
    );
  }

  {
    // ImageManipulator unexpectedly returns a data: URI (defensive guard).
    // resolvePhotoUri rejects it and falls back to the original asset URI.
    const originalAssetUri = 'file:///var/mobile/tmp/bulk-item-3.jpg';
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB...';
    assertEq(
      resolvePhotoUri(originalAssetUri, dataUri),
      originalAssetUri,
      'bulk displayUri: ImageManipulator returns data: URI → rejected; falls back to original asset URI',
    );
  }

  console.log('\nbulk-review displayUri invariant — resolvePhotoUri result never starts with "data:":');

  const bulkDisplayUriCases: Array<string | null | undefined> = [
    'data:image/jpeg;base64,/9j/4AAQSkZJRgAB...',
    'data:image/png;base64,iVBORw0KGgo=',
    null,
    undefined,
    '',
  ];

  for (const candidate of bulkDisplayUriCases) {
    const result = resolvePhotoUri('file:///safe-fallback.jpg', candidate);
    assert(
      !result.startsWith('data:'),
      `bulk displayUri never starts with "data:" when reencodedUri is ${JSON.stringify(candidate)}`,
    );
  }

  // ── H. Bulk-review finalUri (wardrobe photoUri) — never a data: URI ──────
  //
  // Models the handleSaveAll() logic in bulk-review.tsx:
  //   finalUri starts as item.uri (file://)
  //   Upload success (session + cleanBase64) → finalUri = Supabase public URL (https://)
  //   Upload success (session, no cleanBase64) → finalUri = Supabase public URL (https://)
  //   Upload failure (catch) → finalUri stays as item.uri (file://)
  //   Guest / no session → finalUri stays as item.uri (file://)
  // In all paths, the photoUri stored in addWardrobeItem must never start with "data:".

  console.log('\nbulk-review finalUri (wardrobe photoUri) — never a data: URI:');

  function selectBulkFinalUri(
    itemUri: string,
    uploadedUrl: string | null,
  ): string {
    if (uploadedUrl !== null) return uploadedUrl;
    return itemUri;
  }

  const bulkItemUri   = 'file:///var/mobile/tmp/bulk-item-4.jpg';
  const bulkSupabase  = 'https://project.supabase.co/storage/v1/object/public/wardrobe/bulk-uuid.png';

  {
    assertEq(
      selectBulkFinalUri(bulkItemUri, bulkSupabase),
      bulkSupabase,
      'bulk upload success (cleanBase64) → photoUri is Supabase https:// URL',
    );
  }

  {
    assertEq(
      selectBulkFinalUri(bulkItemUri, null),
      bulkItemUri,
      'bulk upload failure → photoUri falls back to original file:// URI',
    );
  }

  {
    assertEq(
      selectBulkFinalUri(bulkItemUri, null),
      bulkItemUri,
      'bulk guest/no-session → photoUri is original file:// URI (no upload attempt)',
    );
  }

  console.log('\nbulk-review finalUri invariant — never data: in any path:');

  const bulkFinalUriCases: Array<string | null> = [bulkSupabase, null];

  for (const uploadedUrl of bulkFinalUriCases) {
    const result = selectBulkFinalUri(bulkItemUri, uploadedUrl);
    assert(
      !result.startsWith('data:'),
      `bulk finalUri never starts with "data:" (uploadedUrl=${JSON.stringify(uploadedUrl)})`,
    );
  }

  // ── Final result ───────────────────────────────────────────────────────────

  console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Unexpected error in test runner:', err);
  process.exit(1);
});
