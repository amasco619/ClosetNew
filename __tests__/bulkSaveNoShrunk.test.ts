/**
 * Confirms that a missing shrunk.base64 from ImageManipulator cannot silently
 * skip a bulk upload: when resize returns null/undefined base64 AND there is no
 * cleanBase64, resolveUploadArg returns null, the upload is skipped, but
 * addItem is still called with the original local URI.
 *
 * This guards against a regression where the item would simply be dropped from
 * the wardrobe save without any user-visible feedback.
 *
 * Run: `npx tsx __tests__/bulkSaveNoShrunk.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { runSaveAll } from '../lib/bulkClassifyCore';
import type { SaveAllItem, SaveAllDeps } from '../lib/bulkClassifyCore';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function deferred<T>(): { promise: Promise<T>; resolve(v: T): void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

const tick = () => Promise.resolve();

const TEST_URI = 'file:///photos/shirt.jpg';
const TEST_USER_ID = 'user-abc-123';
const TEST_UUID = 'item-uuid-9999';

const CLASSIFICATION = {
  category: 'top' as const,
  subType: 't-shirt',
  colorFamily: 'white',
  description: 'A white t-shirt',
  occasionTags: ['casual' as const],
  seasonTags: ['all-season' as const],
};

function makeSaveItem(overrides: Partial<SaveAllItem> = {}): SaveAllItem {
  return { uri: TEST_URI, classification: CLASSIFICATION, ...overrides };
}

interface DepsResult {
  deps: SaveAllDeps;
  addItemCalls: number;
  addItemPayloads: Array<{ id: string; photoUri: string }>;
  setItemsStatuses: string[];
  navigateCalled: boolean;
  uploadCalled: boolean;
  resolveSession(): void;
  resolveResize(result: { base64?: string } | null): void;
}

function makeDeps(userId: string | null): DepsResult {
  let addItemPayloads: Array<{ id: string; photoUri: string }> = [];
  let setItemsStatuses: string[] = [];
  let navigateCalled = false;
  let uploadCalled = false;

  const sessionD = deferred<string | null>();
  const resizeD  = deferred<{ base64?: string } | null>();

  const deps: SaveAllDeps = {
    generateId: () => TEST_UUID,
    getSession: () => sessionD.promise,
    resize: (_uri) => resizeD.promise,
    upload: async (_uid, _b64, _id, _mime) => {
      uploadCalled = true;
      return 'https://storage.example.com/wardrobe/item.png';
    },
    resolveUploadArg: (clean, shrunk) => {
      // Mirrors resolveWardrobeUploadArg: return null when both are absent
      const c = clean && !clean.startsWith('data:') ? clean : null;
      if (c) return { base64: c, mimeType: 'image/png' };
      const s = shrunk && !shrunk.startsWith('data:') ? shrunk : null;
      if (s) return { base64: s, mimeType: 'image/jpeg' };
      return null;
    },
    addItem: (payload) => {
      addItemPayloads.push({ id: payload.id, photoUri: payload.photoUri });
    },
    setItems: (updater) => {
      const after = updater([{ uri: TEST_URI, status: 'pending', classification: null }]);
      if (after[0]) setItemsStatuses.push(after[0].status);
    },
    setSaving: () => {},
    onItemHaptic: () => {},
    onDoneHaptic: () => {},
    navigate: () => { navigateCalled = true; },
  };

  return {
    deps,
    get addItemCalls() { return addItemPayloads.length; },
    addItemPayloads,
    get setItemsStatuses() { return setItemsStatuses; },
    get navigateCalled() { return navigateCalled; },
    get uploadCalled() { return uploadCalled; },
    resolveSession: () => sessionD.resolve(userId),
    resolveResize: (v) => resizeD.resolve(v),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  section('1. Missing shrunk.base64 + no cleanBase64 (authenticated): addItem called with local URI');
  {
    // Scenario: ImageManipulator.resize() returns an object where .base64 is
    // undefined (e.g. manipulateAsync succeeded but base64 encoding was skipped).
    // resolveUploadArg(undefined, undefined) → null → upload is skipped.
    // addItem must still be called with the original file:// URI so the item
    // is not lost from the wardrobe.
    const d = makeDeps(TEST_USER_ID);
    const item = makeSaveItem({ cleanBase64: undefined });
    const mountedRef = { current: true };

    const p = runSaveAll([item], mountedRef, d.deps);
    await tick();

    d.resolveSession(); // authenticated
    await tick();

    // resize returns an object with base64: undefined
    d.resolveResize({ base64: undefined });
    await p;

    assert(d.addItemCalls === 1,
      'addItem IS called even when shrunk.base64 is undefined');
    assert(d.addItemPayloads[0]?.photoUri === TEST_URI,
      'addItem receives the original local URI as fallback');
    assert(!d.uploadCalled,
      'upload is NOT called when resolveUploadArg returns null');
    assert(d.navigateCalled,
      'navigate fires after save completes');
    assert(d.setItemsStatuses.includes('saved'),
      'item status flips to saved');
  }

  section('2. resize returns null entirely: addItem called with local URI');
  {
    // Scenario: ImageManipulator.manipulateAsync() returns null (crash path).
    const d = makeDeps(TEST_USER_ID);
    const item = makeSaveItem({ cleanBase64: undefined });
    const mountedRef = { current: true };

    const p = runSaveAll([item], mountedRef, d.deps);
    await tick();

    d.resolveSession();
    await tick();

    d.resolveResize(null); // entire result is null
    await p;

    assert(d.addItemCalls === 1,
      'addItem IS called even when resize returns null');
    assert(d.addItemPayloads[0]?.photoUri === TEST_URI,
      'addItem receives the original local URI when resize is null');
    assert(!d.uploadCalled,
      'upload NOT called when resize result is null');
  }

  section('3. cleanBase64 present: upload proceeds normally (sanity check)');
  {
    // Sanity: when cleanBase64 IS present, upload is called and addItem
    // receives the cloud URI, not the local one.
    let uploadedUri: string | null = null;
    const item = makeSaveItem({ cleanBase64: 'abc123pngbase64' });
    const mountedRef = { current: true };

    const sessionD = deferred<string | null>();
    const deps: SaveAllDeps = {
      generateId: () => 'cloud-item-id',
      getSession: () => sessionD.promise,
      resize: (_uri) => Promise.resolve({ base64: 'should-not-be-used' }),
      upload: async (_uid, _b64, _id, _mime) => {
        uploadedUri = 'https://storage.example.com/wardrobe/cloud-item-id.png';
        return uploadedUri;
      },
      resolveUploadArg: (clean, _shrunk) => {
        return clean ? { base64: clean, mimeType: 'image/png' } : null;
      },
      addItem: (payload) => {
        assert(payload.photoUri === uploadedUri,
          'addItem receives the cloud URI when upload succeeds');
      },
      setItems: (_updater) => {},
      setSaving: () => {},
      onItemHaptic: () => {},
      onDoneHaptic: () => {},
      navigate: () => {},
    };

    const p = runSaveAll([item], mountedRef, deps);
    await tick();
    sessionD.resolve(TEST_USER_ID);
    await p;

    assert(uploadedUri !== null, 'upload was called when cleanBase64 is present');
  }

  section('4. data: URI in base64: treated as absent (resolveUploadArg guard)');
  {
    // Scenario: a data: URI somehow ends up in cleanBase64.
    // resolveWardrobeUploadArg must reject it and fall back to local URI.
    const d = makeDeps(TEST_USER_ID);
    const item = makeSaveItem({ cleanBase64: 'data:image/png;base64,abc123' });
    const mountedRef = { current: true };

    const p = runSaveAll([item], mountedRef, d.deps);
    await tick();

    d.resolveSession();
    await tick();

    // resize is called (since cleanBase64 is treated as absent by resolveUploadArg)
    // but resolveUploadArg will also reject the shrunk result if it's a data: URI
    d.resolveResize({ base64: 'data:image/jpeg;base64,shrunk' });
    await p;

    assert(!d.uploadCalled,
      'upload NOT called when both cleanBase64 and shrunkBase64 are data: URIs');
    assert(d.addItemCalls === 1,
      'addItem still called (with local URI fallback) when upload arg is null');
    assert(d.addItemPayloads[0]?.photoUri === TEST_URI,
      'photoUri falls back to local URI when data: URI is rejected');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n=== bulkSaveNoShrunk: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`);
  if (failed > 0) process.exit(1);

})();
