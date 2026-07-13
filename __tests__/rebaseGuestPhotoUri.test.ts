/**
 * Unit tests for lib/rebaseGuestPhotoUri.ts
 *
 * Guards against regressions in the path-rebasing logic that keeps guest-mode
 * wardrobe thumbnails intact across Android app updates where documentDirectory
 * can shift between installs.
 *
 * Run: `npx tsx __tests__/rebaseGuestPhotoUri.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { rebaseGuestPhotoUri } from '../lib/rebaseGuestPhotoUri';

// ── Helpers ───────────────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function eq(a: unknown, b: unknown, msg: string): void {
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── Constants used across tests ───────────────────────────────────────────────

const OLD_DIR = 'file:///data/user/0/com.app/files/';
const NEW_DIR = 'file:///data/user/0/com.app.v2/files/';
const UUID    = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

// ── Section 1: Path unchanged when prefix already matches ─────────────────────

console.log('\n1. Path unchanged when prefix already matches');

{
  const uri = `${NEW_DIR}wardrobe_${UUID}.jpg`;
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    'jpg: same prefix → identity');
}
{
  const uri = `${NEW_DIR}wardrobe_${UUID}.PNG`;
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    'PNG (uppercase extension): same prefix → identity');
}

// ── Section 2: Path corrected when prefix differs ─────────────────────────────

console.log('\n2. Path corrected when prefix differs');

{
  const oldUri = `${OLD_DIR}wardrobe_${UUID}.jpg`;
  const want   = `${NEW_DIR}wardrobe_${UUID}.jpg`;
  eq(rebaseGuestPhotoUri(oldUri, NEW_DIR), want,
    'jpg: old prefix rebased to new documentDirectory');
}
{
  const oldUri = `${OLD_DIR}wardrobe_${UUID}.png`;
  const want   = `${NEW_DIR}wardrobe_${UUID}.png`;
  eq(rebaseGuestPhotoUri(oldUri, NEW_DIR), want,
    'png: old prefix rebased to new documentDirectory');
}
{
  const oldUri = `${OLD_DIR}wardrobe_${UUID}.JPG`;
  const want   = `${NEW_DIR}wardrobe_${UUID}.JPG`;
  eq(rebaseGuestPhotoUri(oldUri, NEW_DIR), want,
    'JPG (uppercase): old prefix rebased');
}

// ── Section 3: Non-guest URIs left untouched ──────────────────────────────────

console.log('\n3. Non-guest URIs (https://, data://) left untouched');

{
  const uri = 'https://example.com/wardrobe_abc.jpg';
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    'https:// URI → untouched');
}
{
  const uri = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    'data: URI → untouched');
}
{
  const uri = 'content://media/external/images/media/42';
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    'content:// URI → untouched');
}

// ── Section 4: Malformed filenames left untouched ─────────────────────────────

console.log('\n4. Malformed filenames that do not match wardrobe_*.jpg|png pattern');

{
  const uri = `${OLD_DIR}photo_${UUID}.jpg`;
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    'wrong prefix (photo_ not wardrobe_) → untouched');
}
{
  const uri = `${OLD_DIR}wardrobe_${UUID}.gif`;
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    '.gif extension → untouched');
}
{
  const uri = `${OLD_DIR}wardrobe_${UUID}.webp`;
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    '.webp extension → untouched');
}
{
  const uri = `${OLD_DIR}wardrobe_${UUID}`;
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    'no extension → untouched');
}
{
  const uri = `${OLD_DIR}wardrobe_${UUID}.jpg/extra`;
  eq(rebaseGuestPhotoUri(uri, NEW_DIR), uri,
    'filename with path component after extension → untouched');
}

// ── Section 5: Edge cases ─────────────────────────────────────────────────────

console.log('\n5. Edge cases');

{
  const uri = `${OLD_DIR}wardrobe_${UUID}.jpg`;
  eq(rebaseGuestPhotoUri(uri, ''), uri,
    'empty currentDocDir → untouched (no-op guard)');
}
{
  const uri = `${OLD_DIR}wardrobe_${UUID}.jpg`;
  eq(rebaseGuestPhotoUri(uri, OLD_DIR), uri,
    'same old prefix passed as currentDocDir → identity (no rebase needed)');
}

// ── Final summary ─────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) FAILED.`}\n`);
if (failed > 0) process.exit(1);
