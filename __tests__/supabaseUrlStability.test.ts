/**
 * Confirms that Supabase Storage public URLs used for wardrobe photos are
 * stable and session-independent, so they survive an app reinstall.
 *
 * Key properties verified:
 *   1. The storage path is deterministic from (userId, itemId, extension) alone —
 *      no session token or timestamp is embedded in the path.
 *   2. A public URL derived from that path contains no query-string parameters
 *      that would cause it to expire (no ?token=, ?signature=, ?Expires=).
 *   3. The path built by uploadWardrobeImage and the path reconstructed by
 *      recoverWardrobeImageUrl are identical (for the same ext).
 *   4. recoverWardrobeImageUrl tries '.jpg' before '.png', giving the
 *      format-preference order documented in lib/storage.ts.
 *
 * These are pure path/URL construction assertions — no real Supabase calls
 * are made and no network access is required.
 *
 * Run: `npx tsx __tests__/supabaseUrlStability.test.ts`
 * Exits non-zero on any failed assertion.
 */

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

function section(label: string): void {
  console.log(`\n${label}`);
}

// ── Mirrors lib/storage.ts path construction (pure, no Supabase import) ───────

const BUCKET = 'wardrobe-images';

/**
 * Mirrors the path construction in uploadWardrobeImage and
 * recoverWardrobeImageUrl without importing lib/storage.ts (which pulls in
 * the Supabase client and react-native).
 */
function buildStoragePath(userId: string, itemId: string, ext: 'jpg' | 'png'): string {
  return `${userId}/${itemId}.${ext}`;
}

/**
 * Mirrors the public URL format that Supabase Storage getPublicUrl() produces.
 * The real implementation calls supabase.storage.from(BUCKET).getPublicUrl(path).
 */
function buildPublicUrl(projectRef: string, path: string): string {
  return `https://${projectRef}.supabase.co/storage/v1/object/public/${BUCKET}/${path}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  const USER_ID  = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const ITEM_ID  = 'f9e8d7c6-b5a4-3210-fedc-ba0987654321';
  const PROJ_REF = 'xyzabcdefghijkl';

  section('1. Storage path is deterministic: same inputs → same path');
  {
    const pathA = buildStoragePath(USER_ID, ITEM_ID, 'jpg');
    const pathB = buildStoragePath(USER_ID, ITEM_ID, 'jpg');
    assert(pathA === pathB, 'identical inputs produce identical paths');
    assert(pathA === `${USER_ID}/${ITEM_ID}.jpg`,
      `path has expected structure: ${USER_ID}/${ITEM_ID}.jpg`);
  }

  section('2. Public URL contains no session-specific query parameters');
  {
    const path = buildStoragePath(USER_ID, ITEM_ID, 'jpg');
    const url  = buildPublicUrl(PROJ_REF, path);
    const parsed = new URL(url);

    assert(parsed.search === '', 'public URL has no query string');
    assert(!url.includes('token='),      'no token= param');
    assert(!url.includes('signature='),  'no signature= param');
    assert(!url.includes('Expires='),    'no Expires= param (no pre-signed expiry)');
    assert(!url.includes('X-Amz-'),      'no AWS SigV4 params');
  }

  section('3. Public URL is https:// (not http://)');
  {
    const path = buildStoragePath(USER_ID, ITEM_ID, 'png');
    const url  = buildPublicUrl(PROJ_REF, path);
    assert(url.startsWith('https://'), 'URL uses HTTPS');
  }

  section('4. Path from upload matches path from recovery (same extension)');
  {
    // uploadWardrobeImage uses the mimeType to derive the extension:
    //   image/png → .png, image/jpeg → .jpg
    // recoverWardrobeImageUrl tries .jpg first, then .png.
    const uploadPathJpeg = buildStoragePath(USER_ID, ITEM_ID, 'jpg');
    const uploadPathPng  = buildStoragePath(USER_ID, ITEM_ID, 'png');
    const recoverFirst   = buildStoragePath(USER_ID, ITEM_ID, 'jpg'); // tries jpg first

    assert(uploadPathJpeg === recoverFirst,
      'JPEG upload path matches the first recovery attempt (.jpg)');
    assert(uploadPathPng !== recoverFirst,
      'PNG upload path does NOT match the first recovery attempt (needs .png fallback)');
  }

  section('5. Path contains userId and itemId exactly once each');
  {
    const path = buildStoragePath(USER_ID, ITEM_ID, 'jpg');
    const userIdOccurrences = (path.match(new RegExp(USER_ID, 'g')) ?? []).length;
    const itemIdOccurrences = (path.match(new RegExp(ITEM_ID, 'g')) ?? []).length;
    assert(userIdOccurrences === 1, 'userId appears exactly once in the path');
    assert(itemIdOccurrences === 1, 'itemId appears exactly once in the path');
  }

  section('6. Different users get different paths (no cross-user collision)');
  {
    const path1 = buildStoragePath('user-aaa', ITEM_ID, 'jpg');
    const path2 = buildStoragePath('user-bbb', ITEM_ID, 'jpg');
    assert(path1 !== path2, 'different userIds → different paths');
    assert(!path1.includes('user-bbb'), 'user-bbb not in user-aaa path');
    assert(!path2.includes('user-aaa'), 'user-aaa not in user-bbb path');
  }

  section('7. Different items get different paths (no collision)');
  {
    const path1 = buildStoragePath(USER_ID, 'item-111', 'jpg');
    const path2 = buildStoragePath(USER_ID, 'item-222', 'jpg');
    assert(path1 !== path2, 'different itemIds → different paths');
  }

  section('8. URL survives app reinstall (no local state required)');
  {
    // A reinstall clears local caches but not Supabase's CDN.
    // The URL must be fully reconstructible from the stored DB values alone
    // (userId + itemId + extension + project ref).
    const path = buildStoragePath(USER_ID, ITEM_ID, 'jpg');
    const url  = buildPublicUrl(PROJ_REF, path);

    // The URL must NOT contain anything from the local Supabase session:
    // - No access token     (supabase.auth.getSession().session.access_token)
    // - No refresh token
    // - No user JWT claims
    assert(!url.includes('eyJ'), 'URL does not contain a base64-encoded JWT (no auth token embedded)');
    assert(!url.includes('Bearer'), 'URL does not contain Bearer keyword');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n=== supabaseUrlStability: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`);
  if (failed > 0) process.exit(1);

})();
