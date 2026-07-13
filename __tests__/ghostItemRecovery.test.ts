/**
 * Unit tests for the ghost-item recovery card edge cases.
 *
 * Covers the pure helpers in constants/orphanDetection.ts that back the
 * recovery card shown on the Home screen when a wardrobe item is missing its
 * photo. Because the helpers are asset-free and React-free they run directly
 * in tsx without any mocking of Expo or Supabase.
 *
 * Four areas:
 *
 * A. detectNoPhotoOrphans — synchronous absent-URI filter
 * B. isGuestPhotoUri      — guest photo filename predicate
 * C. detectFileOrphans    — async file-existence + cloud-recovery logic
 * D. applyOrphanResolution — 'remove' vs 'dismiss' action routing
 *
 * Run: `npx tsx __tests__/ghostItemRecovery.test.ts`
 * Exits non-zero when any assertion fails.
 */

import {
  detectNoPhotoOrphans,
  isGuestPhotoUri,
  detectFileOrphans,
  applyOrphanResolution,
  type FileInfoFn,
  type RecoverUrlFn,
} from '../constants/orphanDetection';
import type { WardrobeItem } from '../constants/types';

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

function eq<T>(a: T, b: T, msg: string): void {
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
  );
}

function section(name: string): void {
  console.log(`\n${name}:`);
}

// ── Item factory ──────────────────────────────────────────────────────────────

let _seq = 0;
function makeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  const id = overrides.id ?? `item-${++_seq}`;
  return {
    id,
    photoUri: `https://storage.example.com/${id}.jpg`,
    category: 'top',
    subType: 'blouse',
    colorFamily: 'neutral',
    description: '',
    occasionTags: [],
    seasonTags: [],
    createdAt: new Date().toISOString(),
    formalityLevel: 5,
    ...overrides,
  } as WardrobeItem;
}

// ── FileInfoFn factories ──────────────────────────────────────────────────────

const alwaysExists: FileInfoFn = async () => ({ exists: true });
const neverExists: FileInfoFn = async () => ({ exists: false });
const alwaysThrows: FileInfoFn = async () => { throw new Error('I/O error'); };

function existsFor(...ids: string[]): FileInfoFn {
  return async (uri: string) => ({ exists: ids.some(id => uri.includes(id)) });
}

// ── RecoverUrlFn factories ────────────────────────────────────────────────────

const noRecovery: RecoverUrlFn = async () => null;
function recoversFor(...ids: string[]): RecoverUrlFn {
  return async (_userId: string, itemId: string) =>
    ids.includes(itemId) ? `https://storage.example.com/${itemId}-recovered.jpg` : null;
}

// ── A. detectNoPhotoOrphans ───────────────────────────────────────────────────

async function testDetectNoPhotoOrphans(): Promise<void> {
  section('A1. detectNoPhotoOrphans — items with undefined photoUri are returned');
  {
    const a = makeItem({ id: 'a', photoUri: undefined });
    const b = makeItem({ id: 'b', photoUri: undefined });
    const orphans = detectNoPhotoOrphans([a, b]);
    eq(orphans.length, 2, 'both items without photoUri are returned');
    assert(orphans.every(o => ['a', 'b'].includes(o.id)), 'correct items returned');
  }

  section('A2. detectNoPhotoOrphans — empty-string photoUri is treated as absent');
  {
    const a = makeItem({ id: 'empty-uri', photoUri: '' });
    const orphans = detectNoPhotoOrphans([a]);
    eq(orphans.length, 1, 'item with empty-string photoUri is an orphan');
    eq(orphans[0]!.id, 'empty-uri', 'correct item returned');
  }

  section('A3. detectNoPhotoOrphans — items with a real photoUri are NOT returned');
  {
    const a = makeItem({ id: 'has-https', photoUri: 'https://cdn.example.com/photo.jpg' });
    const b = makeItem({ id: 'has-file', photoUri: 'file:///tmp/photo.jpg' });
    const orphans = detectNoPhotoOrphans([a, b]);
    eq(orphans.length, 0, 'no orphans when all items have a photoUri');
  }

  section('A4. detectNoPhotoOrphans — mixed array: only the no-photo items surfaced');
  {
    const good1 = makeItem({ id: 'good1', photoUri: 'https://cdn.example.com/a.jpg' });
    const bad1  = makeItem({ id: 'bad1',  photoUri: '' });
    const good2 = makeItem({ id: 'good2', photoUri: 'file:///tmp/b.jpg' });
    const bad2  = makeItem({ id: 'bad2',  photoUri: undefined });
    const orphans = detectNoPhotoOrphans([good1, bad1, good2, bad2]);
    eq(orphans.length, 2, 'exactly the two no-photo items are returned');
    assert(orphans.some(o => o.id === 'bad1'), 'bad1 is in orphans');
    assert(orphans.some(o => o.id === 'bad2'), 'bad2 is in orphans');
    assert(!orphans.some(o => o.id === 'good1'), 'good1 is not in orphans');
    assert(!orphans.some(o => o.id === 'good2'), 'good2 is not in orphans');
  }

  section('A5. detectNoPhotoOrphans — empty wardrobe returns empty array');
  {
    const orphans = detectNoPhotoOrphans([]);
    eq(orphans.length, 0, 'empty input produces empty output');
  }
}

// ── B. isGuestPhotoUri ────────────────────────────────────────────────────────

async function testIsGuestPhotoUri(): Promise<void> {
  const DOC = 'file:///var/mobile/Containers/Data/Application/SOME-UUID/Documents/';

  section('B1. isGuestPhotoUri — wardrobe_<id>.jpg is a guest URI');
  {
    assert(isGuestPhotoUri(`${DOC}wardrobe_abc123.jpg`), '.jpg guest URI recognised');
  }

  section('B2. isGuestPhotoUri — wardrobe_<id>.png is a guest URI');
  {
    assert(isGuestPhotoUri(`${DOC}wardrobe_abc123.png`), '.png guest URI recognised');
  }

  section('B3. isGuestPhotoUri — case-insensitive extension (.JPG, .PNG)');
  {
    assert(isGuestPhotoUri(`${DOC}wardrobe_abc123.JPG`), '.JPG accepted');
    assert(isGuestPhotoUri(`${DOC}wardrobe_abc123.PNG`), '.PNG accepted');
  }

  section('B4. isGuestPhotoUri — non-guest file:// URI returns false');
  {
    assert(!isGuestPhotoUri(`${DOC}temp_upload_abc.jpg`), 'temp_upload_ prefix → not guest');
    assert(!isGuestPhotoUri(`${DOC}photo_abc123.jpg`), 'photo_ prefix → not guest');
  }

  section('B5. isGuestPhotoUri — https:// Supabase URI returns false');
  {
    const uri = 'https://xyzcompany.supabase.co/storage/v1/object/public/wardrobe/abc.jpg';
    assert(!isGuestPhotoUri(uri), 'Supabase https:// URI is not a guest URI');
  }

  section('B6. isGuestPhotoUri — wardrobe_ with unsupported extension returns false');
  {
    assert(!isGuestPhotoUri(`${DOC}wardrobe_abc123.gif`), '.gif → not guest');
    assert(!isGuestPhotoUri(`${DOC}wardrobe_abc123.webp`), '.webp → not guest');
  }

  section('B7. isGuestPhotoUri — wardrobe_ with no extension returns false');
  {
    assert(!isGuestPhotoUri(`${DOC}wardrobe_abc123`), 'no extension → not guest');
  }
}

// ── C. detectFileOrphans ─────────────────────────────────────────────────────

async function testDetectFileOrphans(): Promise<void> {
  const FILE_URI = (id: string) => `file:///tmp/wardrobe/${id}.jpg`;

  section('C1. File exists locally → NOT an orphan');
  {
    const item = makeItem({ id: 'c1', photoUri: FILE_URI('c1') });
    const { orphans, recovered } = await detectFileOrphans(
      [item], alwaysExists, noRecovery, 'user-abc',
    );
    eq(orphans.length, 0, 'no orphans when local file exists');
    eq(Object.keys(recovered).length, 0, 'nothing recovered when file exists locally');
  }

  section('C2. File missing + userId null (guest) → IS an orphan');
  {
    const item = makeItem({ id: 'c2', photoUri: FILE_URI('c2') });
    const { orphans } = await detectFileOrphans(
      [item], neverExists, noRecovery, null,
    );
    eq(orphans.length, 1, 'guest item with missing file is surfaced as orphan');
    eq(orphans[0]!.id, 'c2', 'correct item id in orphans');
  }

  section('C3. File missing + userId present + cloud recovery succeeds → NOT an orphan');
  {
    const item = makeItem({ id: 'c3', photoUri: FILE_URI('c3') });
    const { orphans, recovered } = await detectFileOrphans(
      [item], neverExists, recoversFor('c3'), 'user-abc',
    );
    eq(orphans.length, 0, 'item is not orphaned when cloud recovery succeeds');
    assert(recovered['c3'] !== undefined, 'recovered map contains the item id');
    assert(
      typeof recovered['c3'] === 'string' && recovered['c3']!.length > 0,
      'recovered URL is a non-empty string',
    );
  }

  section('C4. File missing + userId present + cloud recovery fails → IS an orphan');
  {
    const item = makeItem({ id: 'c4', photoUri: FILE_URI('c4') });
    const { orphans, recovered } = await detectFileOrphans(
      [item], neverExists, noRecovery, 'user-abc',
    );
    eq(orphans.length, 1, 'item is orphaned when cloud recovery also fails');
    eq(orphans[0]!.id, 'c4', 'correct item surfaced');
    eq(Object.keys(recovered).length, 0, 'no entries in recovered map');
  }

  section('C5. getInfoAsync throws → NOT an orphan (transient I/O error is swallowed)');
  {
    const item = makeItem({ id: 'c5', photoUri: FILE_URI('c5') });
    const { orphans } = await detectFileOrphans(
      [item], alwaysThrows, noRecovery, 'user-abc',
    );
    eq(orphans.length, 0, 'getInfoAsync throwing does not surface item as orphan');
  }

  section('C6. getInfoAsync throws + guest user → NOT an orphan (guard is consistent)');
  {
    const item = makeItem({ id: 'c6', photoUri: FILE_URI('c6') });
    const { orphans } = await detectFileOrphans(
      [item], alwaysThrows, noRecovery, null,
    );
    eq(orphans.length, 0, 'getInfoAsync throwing does not surface guest item as orphan');
  }

  section('C7. Mixed batch: some files exist, some missing, some throw');
  {
    const exists = makeItem({ id: 'exists', photoUri: FILE_URI('exists') });
    const missing = makeItem({ id: 'missing', photoUri: FILE_URI('missing') });
    const throws = makeItem({ id: 'throws', photoUri: FILE_URI('throws') });

    let throwCount = 0;
    const selectiveInfo: FileInfoFn = async (uri: string) => {
      if (uri.includes('exists')) return { exists: true };
      if (uri.includes('throws')) { throwCount++; throw new Error('disk error'); }
      return { exists: false };
    };

    const { orphans, recovered } = await detectFileOrphans(
      [exists, missing, throws], selectiveInfo, noRecovery, null,
    );
    eq(orphans.length, 1, 'only the truly missing item is surfaced');
    eq(orphans[0]!.id, 'missing', 'correct item in orphans');
    assert(!orphans.some(o => o.id === 'exists'), 'existent file not in orphans');
    assert(!orphans.some(o => o.id === 'throws'), 'threw item not in orphans');
    assert(throwCount === 1, 'getInfoAsync was called for the throwing item');
    eq(Object.keys(recovered).length, 0, 'nothing recovered (all guests)');
  }

  section('C8. Authenticated user: recovery succeeds for some, fails for others');
  {
    const rec = makeItem({ id: 'rec', photoUri: FILE_URI('rec') });
    const norec = makeItem({ id: 'norec', photoUri: FILE_URI('norec') });

    const { orphans, recovered } = await detectFileOrphans(
      [rec, norec], neverExists, recoversFor('rec'), 'user-abc',
    );
    eq(orphans.length, 1, 'only the unrecoverable item is orphaned');
    eq(orphans[0]!.id, 'norec', 'correct orphan');
    assert(recovered['rec'] !== undefined, 'recovered item appears in map');
    assert(recovered['norec'] === undefined, 'unrecovered item not in map');
  }

  section('C9. Empty input → no orphans, no recovered items');
  {
    const { orphans, recovered } = await detectFileOrphans([], alwaysThrows, noRecovery, 'user-abc');
    eq(orphans.length, 0, 'empty input → empty orphans');
    eq(Object.keys(recovered).length, 0, 'empty input → empty recovered map');
  }

  section('C10. recover() itself rejects → treated as recovery failure → IS an orphan');
  {
    const item = makeItem({ id: 'c10', photoUri: FILE_URI('c10') });
    const rejectingRecover: RecoverUrlFn = async () => { throw new Error('network error'); };
    const { orphans } = await detectFileOrphans(
      [item], neverExists, rejectingRecover, 'user-abc',
    );
    eq(orphans.length, 1, 'recovering throws → item surfaced as orphan');
    eq(orphans[0]!.id, 'c10', 'correct item id');
  }

  section('C11. Guest user: all file:// items with missing files are surfaced');
  {
    const a = makeItem({ id: 'ga', photoUri: FILE_URI('ga') });
    const b = makeItem({ id: 'gb', photoUri: FILE_URI('gb') });
    const c = makeItem({ id: 'gc', photoUri: FILE_URI('gc') });
    const { orphans } = await detectFileOrphans([a, b, c], neverExists, noRecovery, null);
    eq(orphans.length, 3, 'all three missing guest items are orphaned');
  }

  section('C12. File exists for one item, missing for another with same userId');
  {
    const good = makeItem({ id: 'good', photoUri: FILE_URI('good') });
    const bad  = makeItem({ id: 'bad',  photoUri: FILE_URI('bad') });
    const { orphans } = await detectFileOrphans(
      [good, bad], existsFor('good'), noRecovery, 'user-abc',
    );
    eq(orphans.length, 1, 'only the missing item is orphaned');
    eq(orphans[0]!.id, 'bad', 'correct item orphaned');
    assert(!orphans.some(o => o.id === 'good'), 'existent file not orphaned');
  }
}

// ── D. applyOrphanResolution ──────────────────────────────────────────────────

async function testApplyOrphanResolution(): Promise<void> {
  section('D1. action="remove" — removeItem is called with the correct id');
  {
    const calls: string[] = [];
    const removeItem = (id: string) => { calls.push(id); };
    applyOrphanResolution('item-42', 'remove', removeItem);
    eq(calls.length, 1, 'removeItem called exactly once');
    eq(calls[0], 'item-42', 'removeItem called with the correct id');
  }

  section('D2. action="dismiss" — removeItem is NOT called');
  {
    const calls: string[] = [];
    const removeItem = (id: string) => { calls.push(id); };
    applyOrphanResolution('item-42', 'dismiss', removeItem);
    eq(calls.length, 0, 'removeItem not called on dismiss');
  }

  section('D3. action="remove" does not call removeItem for a different id');
  {
    const calls: string[] = [];
    const removeItem = (id: string) => { calls.push(id); };
    applyOrphanResolution('item-A', 'remove', removeItem);
    assert(!calls.includes('item-B'), 'removeItem not called for item-B');
    assert(calls.includes('item-A'), 'removeItem called for item-A only');
  }

  section('D4. action="remove" is idempotent — calling twice calls removeItem twice');
  {
    const calls: string[] = [];
    const removeItem = (id: string) => { calls.push(id); };
    applyOrphanResolution('item-99', 'remove', removeItem);
    applyOrphanResolution('item-99', 'remove', removeItem);
    eq(calls.length, 2, 'each resolve call invokes removeItem independently');
  }

  section('D5. multiple "dismiss" calls in a row never invoke removeItem');
  {
    const calls: string[] = [];
    const removeItem = (id: string) => { calls.push(id); };
    applyOrphanResolution('item-1', 'dismiss', removeItem);
    applyOrphanResolution('item-2', 'dismiss', removeItem);
    applyOrphanResolution('item-3', 'dismiss', removeItem);
    eq(calls.length, 0, 'removeItem never called across multiple dismissals');
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  await testDetectNoPhotoOrphans();
  await testIsGuestPhotoUri();
  await testDetectFileOrphans();
  await testApplyOrphanResolution();

  console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
