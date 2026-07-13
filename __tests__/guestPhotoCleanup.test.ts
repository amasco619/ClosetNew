/**
 * Unit tests for the guest-mode photo cleanup helpers in
 * constants/guestPhotoCleanup.ts.
 *
 * Two surfaces are covered:
 *
 * A. deleteGuestPhoto — innermost URI guard
 *    Verifies that deleteAsync is called with the right args when the URI
 *    is local, and not called for Supabase https:// URIs or edge cases.
 *
 * B. runGuestRemoval — mirrors the full guest branch of removeWardrobeItem
 *    Verifies that the item-lookup + deleteAsync invocation work together,
 *    matching the behaviour AppContext relies on.
 *
 * Run: `npx tsx __tests__/guestPhotoCleanup.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { deleteGuestPhoto, runGuestRemoval, buildGuestPhotoDestPath } from '../constants/guestPhotoCleanup';

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

function section(name: string): void {
  console.log(`\n${name}:`);
}

// ── Spy factory ───────────────────────────────────────────────────────────────

interface CallRecord {
  uri: string;
  options: { idempotent: boolean };
}

function makeSpy(): { calls: CallRecord[]; fn: (uri: string, opts: { idempotent: boolean }) => Promise<void> } {
  const calls: CallRecord[] = [];
  return {
    calls,
    fn: async (uri: string, options: { idempotent: boolean }) => {
      calls.push({ uri, options });
    },
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOCUMENT_DIR = 'file:///var/mobile/Containers/Data/Application/SOME-UUID/Documents/';
const LOCAL_URI = `${DOCUMENT_DIR}wardrobe/abc123.jpg`;
const SUPABASE_URI = 'https://xyzcompany.supabase.co/storage/v1/object/public/wardrobe/abc123.jpg';

// ── A. deleteGuestPhoto ───────────────────────────────────────────────────────

async function testDeleteGuestPhoto(): Promise<void> {
  section('A1. deleteGuestPhoto — local URI → deleteAsync called');
  {
    const spy = makeSpy();
    await deleteGuestPhoto(LOCAL_URI, DOCUMENT_DIR, spy.fn);

    assert(spy.calls.length === 1, 'deleteAsync called exactly once');
    assert(spy.calls[0]?.uri === LOCAL_URI, 'deleteAsync called with the correct URI');
    assert(spy.calls[0]?.options?.idempotent === true, 'deleteAsync called with { idempotent: true }');
  }

  section('A2. deleteGuestPhoto — Supabase https:// URI → deleteAsync NOT called');
  {
    const spy = makeSpy();
    await deleteGuestPhoto(SUPABASE_URI, DOCUMENT_DIR, spy.fn);

    assert(spy.calls.length === 0, 'deleteAsync not called for a Supabase URI');
  }

  section('A3. deleteGuestPhoto — undefined photoUri → deleteAsync NOT called');
  {
    const spy = makeSpy();
    await deleteGuestPhoto(undefined, DOCUMENT_DIR, spy.fn);

    assert(spy.calls.length === 0, 'deleteAsync not called when photoUri is undefined');
  }

  section('A4. deleteGuestPhoto — null documentDirectory → deleteAsync NOT called');
  {
    const spy = makeSpy();
    await deleteGuestPhoto(LOCAL_URI, null, spy.fn);

    assert(spy.calls.length === 0, 'deleteAsync not called when documentDirectory is null');
  }

  section('A5. deleteGuestPhoto — URI outside documentDirectory → deleteAsync NOT called');
  {
    const spy = makeSpy();
    const otherDir = 'file:///var/mobile/Containers/Data/Application/OTHER-UUID/Documents/';
    await deleteGuestPhoto(LOCAL_URI, otherDir, spy.fn);

    assert(spy.calls.length === 0, 'deleteAsync not called when URI is outside documentDirectory');
  }
}

// ── B. runGuestRemoval — mirrors removeWardrobeItem guest branch ───────────────

async function testRunGuestRemoval(): Promise<void> {
  const ITEM_ID = 'item-abc';
  const OTHER_ID = 'item-xyz';

  const wardrobeWithLocal = [
    { id: ITEM_ID, photoUri: LOCAL_URI },
    { id: OTHER_ID, photoUri: `${DOCUMENT_DIR}wardrobe/other.jpg` },
  ];

  const wardrobeWithSupabase = [
    { id: ITEM_ID, photoUri: SUPABASE_URI },
  ];

  const wardrobeNoPhoto = [
    { id: ITEM_ID },
  ];

  section('B1. runGuestRemoval — local photoUri → deleteAsync called with correct URI and idempotent flag');
  {
    const spy = makeSpy();
    await runGuestRemoval(ITEM_ID, wardrobeWithLocal, DOCUMENT_DIR, spy.fn);

    assert(spy.calls.length === 1, 'deleteAsync called exactly once for the target item');
    assert(spy.calls[0]?.uri === LOCAL_URI, 'deleteAsync called with the target item URI');
    assert(spy.calls[0]?.options?.idempotent === true, 'deleteAsync called with { idempotent: true }');
  }

  section('B2. runGuestRemoval — Supabase https:// photoUri → deleteAsync NOT called');
  {
    const spy = makeSpy();
    await runGuestRemoval(ITEM_ID, wardrobeWithSupabase, DOCUMENT_DIR, spy.fn);

    assert(spy.calls.length === 0, 'deleteAsync not called when item has a Supabase URI');
  }

  section('B3. runGuestRemoval — item has no photoUri → deleteAsync NOT called');
  {
    const spy = makeSpy();
    await runGuestRemoval(ITEM_ID, wardrobeNoPhoto, DOCUMENT_DIR, spy.fn);

    assert(spy.calls.length === 0, 'deleteAsync not called when item has no photoUri');
  }

  section('B4. runGuestRemoval — id not found in wardrobe → deleteAsync NOT called');
  {
    const spy = makeSpy();
    await runGuestRemoval('non-existent-id', wardrobeWithLocal, DOCUMENT_DIR, spy.fn);

    assert(spy.calls.length === 0, 'deleteAsync not called when id not found in wardrobe');
  }

  section('B5. runGuestRemoval — only the matched item is deleted, not others in the list');
  {
    const spy = makeSpy();
    await runGuestRemoval(ITEM_ID, wardrobeWithLocal, DOCUMENT_DIR, spy.fn);

    assert(spy.calls.length === 1, 'deleteAsync called exactly once (not for every item)');
    assert(spy.calls[0]?.uri === LOCAL_URI, 'only the target item URI was passed to deleteAsync');
  }

  section('B6. runGuestRemoval — null documentDirectory → deleteAsync NOT called');
  {
    const spy = makeSpy();
    await runGuestRemoval(ITEM_ID, wardrobeWithLocal, null, spy.fn);

    assert(spy.calls.length === 0, 'deleteAsync not called when documentDirectory is null');
  }
}

// ── C. buildGuestPhotoDestPath — path contract tests ──────────────────────────
//
// These tests confirm that the path written by the guest upload path in
// add-item.tsx will always start with documentDirectory, satisfying the
// startsWith guard in deleteGuestPhoto. Both sides of the contract now use
// the same function, so a change to the path format is caught here first.

async function testBuildGuestPhotoDestPath(): Promise<void> {
  const ITEM_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  section('C1. buildGuestPhotoDestPath — jpg path starts with documentDirectory');
  {
    const path = buildGuestPhotoDestPath(DOCUMENT_DIR, ITEM_ID, 'jpg');
    assert(path.startsWith(DOCUMENT_DIR), 'jpg path starts with documentDirectory');
  }

  section('C2. buildGuestPhotoDestPath — png path starts with documentDirectory');
  {
    const path = buildGuestPhotoDestPath(DOCUMENT_DIR, ITEM_ID, 'png');
    assert(path.startsWith(DOCUMENT_DIR), 'png path starts with documentDirectory');
  }

  section('C3. buildGuestPhotoDestPath — path contains the item id');
  {
    const path = buildGuestPhotoDestPath(DOCUMENT_DIR, ITEM_ID, 'jpg');
    assert(path.includes(ITEM_ID), 'path contains the item id');
  }

  section('C4. buildGuestPhotoDestPath — jpg path ends with .jpg');
  {
    const path = buildGuestPhotoDestPath(DOCUMENT_DIR, ITEM_ID, 'jpg');
    assert(path.endsWith('.jpg'), 'path ends with .jpg');
  }

  section('C5. buildGuestPhotoDestPath — png path ends with .png');
  {
    const path = buildGuestPhotoDestPath(DOCUMENT_DIR, ITEM_ID, 'png');
    assert(path.endsWith('.png'), 'path ends with .png');
  }

  section('C6. buildGuestPhotoDestPath → deleteGuestPhoto contract: path satisfies cleanup guard');
  {
    const path = buildGuestPhotoDestPath(DOCUMENT_DIR, ITEM_ID, 'jpg');
    const spy = makeSpy();
    await deleteGuestPhoto(path, DOCUMENT_DIR, spy.fn);
    assert(spy.calls.length === 1, 'deleteGuestPhoto fires for a path built by buildGuestPhotoDestPath');
    assert(spy.calls[0]?.uri === path, 'deleteGuestPhoto receives the exact path that was built');
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  await testDeleteGuestPhoto();
  await testRunGuestRemoval();
  await testBuildGuestPhotoDestPath();

  console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
