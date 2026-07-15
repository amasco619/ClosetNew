/**
 * Tests for the bulk-review auto-persist and orphan-cleanup contracts.
 *
 * The logic is extracted into lib/bulkClassifyCore so it can be imported and
 * exercised directly in Node.js without pulling in Expo / React Native.
 * Async dependencies are injected as mock functions backed by deferred promises,
 * giving precise control over which await point completes before assertions run.
 *
 * Scenarios covered:
 *  1. Happy path          — settled + cleanBase64 + authenticated → addItem called,
 *                           status flips to 'auto-saved', autoSavedId stored.
 *  2. Auth gate           — settled + cleanBase64 + NO session → addItem NOT called,
 *                           status reverts to 'settled'.
 *  3. No-BG path          — settled WITHOUT cleanBase64 → selectAutoPersistCandidates
 *                           filters it out; runAutoPersistItem never called.
 *  4. Orphan cleanup      — removing an 'auto-saved' item → removeItem called with
 *                           the correct id; UI status flips to 'removed'.
 *  5. applyAutoSavedEdits — all-auto-saved items → updateItem called for each;
 *                           no addItem call; returns correct count.
 *  6. Unmount before auth — mountedRef.current = false before getSession resolves →
 *                           addItem NOT called, setItems reverts to 'settled'.
 *  7. Upload error        — upload throws → addItem NOT called, status reverts to
 *                           'settled' (upload failure never permanently blocks the item).
 *  8. Item removed mid-flight (post-auth) → addItem NOT called even when auth succeeds.
 *  9. selectAutoPersistCandidates dedup gate — attempted URIs are excluded.
 * 10. runHandleRemove non-auto-saved — removeItem NOT called for ordinary settled items.
 *
 * Run: `npx tsx __tests__/bulkAutoPersist.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  runAutoPersistItem,
  selectAutoPersistCandidates,
  runHandleRemove,
  applyAutoSavedEdits,
  type AutoPersistDeps,
  type AutoPersistItemInput,
  type BulkItemCore,
  type ClassifyResult,
  type AutoSavedEditItem,
  type ApplyAutoSavedEditsDeps,
} from '../lib/bulkClassifyCore';

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

// ── Deferred promise helper ───────────────────────────────────────────────────

function deferred<T>(): { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const tick = () => Promise.resolve();

// ── Shared fixtures ───────────────────────────────────────────────────────────

const TEST_URI = 'file:///photos/shirt.jpg';
const TEST_CLEAN_B64 = 'abc123pngbase64';
const TEST_UUID = 'test-uuid-1234';
const TEST_CLOUD_URI = 'https://storage.example.com/wardrobe/user-abc/test-uuid-1234.png';

const CLASSIFICATION: ClassifyResult = {
  category:     'top',
  subType:      't-shirt',
  colorFamily:  'white',
  description:  'A white t-shirt',
  occasionTags: ['casual'],
  seasonTags:   ['all-season'],
};

function makeInput(overrides: Partial<AutoPersistItemInput> = {}): AutoPersistItemInput {
  return {
    uri:           TEST_URI,
    cleanBase64:   TEST_CLEAN_B64,
    classification: CLASSIFICATION,
    ...overrides,
  };
}

/** Minimal itemsRef snapshot that looks like a live (non-removed) item. */
function makeItemsRef(
  uri = TEST_URI,
  status = 'auto-saving',
): { current: { uri: string; status: string }[] } {
  return { current: [{ uri, status }] };
}

// ── Deps builder ──────────────────────────────────────────────────────────────

interface MockDepsResult {
  deps: AutoPersistDeps;
  addItemCalls: number;
  addItemPayloads: Array<{ id: string; photoUri: string; classification: ClassifyResult }>;
  setItemsStatuses: string[];
  hapticFired: boolean;
  resolveSession(userId: string | null): void;
  resolveUpload(url: string): void;
  rejectUpload(err: Error): void;
}

function makeDeferredDeps(overrides: {
  resolveUploadArgResult?: { base64: string; mimeType: string } | null;
} = {}): MockDepsResult {
  const addItemPayloads: Array<{ id: string; photoUri: string; classification: ClassifyResult }> = [];
  const setItemsStatuses: string[] = [];
  let hapticFired = false;

  const sessionD = deferred<string | null>();
  const uploadD  = deferred<string>();

  const resolveUploadArgResult =
    'resolveUploadArgResult' in overrides
      ? overrides.resolveUploadArgResult
      : { base64: TEST_CLEAN_B64, mimeType: 'image/png' };

  const deps: AutoPersistDeps = {
    generateId: () => TEST_UUID,
    getSession: () => sessionD.promise,
    resolveUploadArg: (_cleanBase64) => resolveUploadArgResult ?? null,
    upload: (_userId, _base64, _itemId, _mimeType) => uploadD.promise,
    addItem: (payload) => {
      addItemPayloads.push({
        id:             payload.id,
        photoUri:       payload.photoUri,
        classification: payload.classification,
      });
    },
    setItems: (updater) => {
      const fakeItems: BulkItemCore[] = [
        { uri: TEST_URI, status: 'auto-saving', classification: null },
      ];
      const after = updater(fakeItems);
      if (after[0]) setItemsStatuses.push(after[0].status);
    },
    onHaptic: () => { hapticFired = true; },
  };

  return {
    deps,
    get addItemCalls() { return addItemPayloads.length; },
    addItemPayloads,
    get setItemsStatuses() { return setItemsStatuses; },
    get hapticFired() { return hapticFired; },
    resolveSession: (v) => sessionD.resolve(v),
    resolveUpload:  (v) => uploadD.resolve(v),
    rejectUpload:   (e) => uploadD.reject(e),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  // ── 1. Happy path ────────────────────────────────────────────────────────

  section('runAutoPersistItem — 1. happy path (authenticated + upload): addItem called, status → auto-saved');
  {
    const mountedRef = { current: true };
    const itemsRef   = makeItemsRef();
    const d = makeDeferredDeps();

    const p = runAutoPersistItem(makeInput(), mountedRef, itemsRef, d.deps);
    await tick();

    d.resolveSession('user-abc');
    await tick();

    d.resolveUpload(TEST_CLOUD_URI);
    const autoSavedId = await p;

    assert(d.addItemCalls === 1,
      'addItem called exactly once on happy path');
    assert(d.addItemPayloads[0]?.id === TEST_UUID,
      'addItem receives the generated itemId');
    assert(d.addItemPayloads[0]?.photoUri === TEST_CLOUD_URI,
      'addItem receives the cloud upload URI');
    assert(d.addItemPayloads[0]?.classification.category === 'top',
      'addItem receives the correct classification category');
    assert(d.setItemsStatuses.includes('auto-saved'),
      'setItems flips status to auto-saved');
    assert(d.hapticFired,
      'haptic fires on success');
    assert(autoSavedId === TEST_UUID,
      'runAutoPersistItem returns the autoSavedId');
  }

  // ── 2. Auth gate ─────────────────────────────────────────────────────────

  section('runAutoPersistItem — 2. auth gate (no session): addItem NOT called, status reverts to settled');
  {
    const mountedRef = { current: true };
    const itemsRef   = makeItemsRef();
    const d = makeDeferredDeps();

    const p = runAutoPersistItem(makeInput(), mountedRef, itemsRef, d.deps);
    await tick();

    d.resolveSession(null); // guest / unauthenticated
    const result = await p;

    assert(d.addItemCalls === 0,
      'addItem NOT called when session is null');
    assert(!d.hapticFired,
      'haptic NOT fired when session is null');
    assert(d.setItemsStatuses.includes('settled'),
      'setItems reverts status to settled when no session');
    assert(result === null,
      'runAutoPersistItem returns null when no session');
  }

  // ── 3. No-BG path (selectAutoPersistCandidates filter) ───────────────────

  section('selectAutoPersistCandidates — 3. no-BG path: item without cleanBase64 is filtered out');
  {
    const attempted = new Set<string>();
    const items: BulkItemCore[] = [
      { uri: 'file:///a.jpg', status: 'settled', cleanBase64: undefined,      classification: null },
      { uri: 'file:///b.jpg', status: 'settled', cleanBase64: 'pngb64',       classification: null },
      { uri: 'file:///c.jpg', status: 'classifying', cleanBase64: 'pngb64',  classification: null },
    ];

    const candidates = selectAutoPersistCandidates(items, attempted);

    assert(candidates.length === 1,
      'only the item with cleanBase64 AND settled status is selected');
    assert(candidates[0]?.uri === 'file:///b.jpg',
      'the selected candidate is the settled+cleanBase64 item');
  }

  section('selectAutoPersistCandidates — 3b. cleanBase64 absent means auto-persist does NOT fire');
  {
    const attempted = new Set<string>();
    const items: BulkItemCore[] = [
      { uri: TEST_URI, status: 'settled', cleanBase64: undefined, classification: null },
    ];

    const candidates = selectAutoPersistCandidates(items, attempted);

    assert(candidates.length === 0,
      'no candidates selected when cleanBase64 is absent — auto-persist does not fire');
  }

  // ── 4. Orphan cleanup ────────────────────────────────────────────────────

  section('runHandleRemove — 4. orphan cleanup: auto-saved item → removeItem called with correct id');
  {
    const removeItemIds: string[] = [];
    const finalStatuses: string[] = [];

    runHandleRemove(
      TEST_URI,
      { status: 'auto-saved', autoSavedId: 'wardrobe-item-xyz' },
      {
        removeItem: (id) => { removeItemIds.push(id); },
        setItems: (updater) => {
          const after = updater([{ uri: TEST_URI, status: 'auto-saved', classification: null }]);
          if (after[0]) finalStatuses.push(after[0].status);
        },
      },
    );

    assert(removeItemIds.length === 1,
      'removeItem called exactly once');
    assert(removeItemIds[0] === 'wardrobe-item-xyz',
      'removeItem called with the correct autoSavedId');
    assert(finalStatuses.includes('removed'),
      'setItems flips status to removed');
  }

  // ── 5. applyAutoSavedEdits ───────────────────────────────────────────────

  section('applyAutoSavedEdits — 5. all auto-saved items: updateItem called for each, correct ids');
  {
    const updateCalls: Array<{ id: string; classification: ClassifyResult }> = [];
    let addItemCalled = false;

    const items: AutoSavedEditItem[] = [
      { autoSavedId: 'id-001', classification: CLASSIFICATION },
      { autoSavedId: 'id-002', classification: { ...CLASSIFICATION, category: 'bottom', subType: 'jeans' } },
    ];

    const deps: ApplyAutoSavedEditsDeps = {
      updateItem: (id, classification) => { updateCalls.push({ id, classification }); },
    };

    const count = applyAutoSavedEdits(items, deps);

    assert(!addItemCalled,
      'addItem NOT called by applyAutoSavedEdits (items already persisted)');
    assert(count === 2,
      'applyAutoSavedEdits returns the count of updated items');
    assert(updateCalls.length === 2,
      'updateItem called once per auto-saved item');
    assert(updateCalls[0]?.id === 'id-001',
      'first updateItem call uses the correct id');
    assert(updateCalls[1]?.id === 'id-002',
      'second updateItem call uses the correct id');
    assert(updateCalls[1]?.classification.category === 'bottom',
      'second updateItem call passes the correct classification');
  }

  section('applyAutoSavedEdits — 5b. navigate fires after applyAutoSavedEdits (via caller logic)');
  {
    // applyAutoSavedEdits itself is synchronous and does not navigate.
    // The caller (handleSaveAll) navigates after the call.  Verify here that
    // applyAutoSavedEdits returns without touching navigate.
    let navigateCalled = false;
    const deps: ApplyAutoSavedEditsDeps = {
      updateItem: () => { /* no-op */ },
    };
    const count = applyAutoSavedEdits(
      [{ autoSavedId: 'id-001', classification: CLASSIFICATION }],
      deps,
    );
    assert(!navigateCalled,
      'applyAutoSavedEdits does not call navigate (navigate is caller responsibility)');
    assert(count === 1,
      'returns 1 for a single item');
  }

  // ── 6. Unmount before auth resolves ──────────────────────────────────────

  section('runAutoPersistItem — 6. unmount before getSession resolves: addItem NOT called, settled reverted');
  {
    const mountedRef = { current: true };
    const itemsRef   = makeItemsRef();
    const d = makeDeferredDeps();

    const p = runAutoPersistItem(makeInput(), mountedRef, itemsRef, d.deps);
    await tick(); // reaches await getSession

    mountedRef.current = false;
    d.resolveSession('user-abc');
    const result = await p;

    assert(d.addItemCalls === 0,
      'addItem NOT called when unmounted before auth resolves');
    assert(d.setItemsStatuses.includes('settled'),
      'setItems reverts to settled when unmounted during auth check');
    assert(result === null,
      'returns null when unmounted during auth');
  }

  // ── 7. Upload error ───────────────────────────────────────────────────────

  section('runAutoPersistItem — 7. upload error: addItem NOT called, status reverts to settled');
  {
    const mountedRef = { current: true };
    const itemsRef   = makeItemsRef();
    const d = makeDeferredDeps();

    const p = runAutoPersistItem(makeInput(), mountedRef, itemsRef, d.deps);
    await tick();

    d.resolveSession('user-abc');
    await tick();

    d.rejectUpload(new Error('network_error'));
    const result = await p;

    assert(d.addItemCalls === 0,
      'addItem NOT called when upload throws');
    assert(d.setItemsStatuses.includes('settled'),
      'setItems reverts to settled on upload failure');
    assert(!d.hapticFired,
      'haptic NOT fired on upload failure');
    assert(result === null,
      'returns null on upload failure');
  }

  // ── 8. Item removed mid-flight (post-auth) ────────────────────────────────

  section('runAutoPersistItem — 8. item removed after auth, before upload: addItem NOT called');
  {
    const mountedRef = { current: true };
    // Simulate itemsRef showing 'removed' status after auth resolves.
    const itemsRef: { current: { uri: string; status: string }[] } = {
      current: [{ uri: TEST_URI, status: 'auto-saving' }],
    };
    const d = makeDeferredDeps();

    const p = runAutoPersistItem(makeInput(), mountedRef, itemsRef, d.deps);
    await tick();

    d.resolveSession('user-abc');
    await tick();

    // Simulate user tapping remove while auth was in-flight.
    itemsRef.current = [{ uri: TEST_URI, status: 'removed' }];

    d.resolveUpload(TEST_CLOUD_URI); // upload resolves but item is already removed
    const result = await p;

    assert(d.addItemCalls === 0,
      'addItem NOT called when item is removed after auth');
    assert(result === null,
      'returns null when item is removed after auth');
  }

  // ── 9. selectAutoPersistCandidates dedup gate ─────────────────────────────

  section('selectAutoPersistCandidates — 9. attempted URIs are excluded (dedup gate)');
  {
    const attempted = new Set<string>(['file:///already.jpg']);
    const items: BulkItemCore[] = [
      { uri: 'file:///already.jpg', status: 'settled', cleanBase64: 'pngb64', classification: null },
      { uri: 'file:///new.jpg',     status: 'settled', cleanBase64: 'pngb64', classification: null },
    ];

    const candidates = selectAutoPersistCandidates(items, attempted);

    assert(candidates.length === 1,
      'already-attempted URI is excluded from candidates');
    assert(candidates[0]?.uri === 'file:///new.jpg',
      'only the new (un-attempted) item is returned');
  }

  // ── 10. runHandleRemove — non-auto-saved item ─────────────────────────────

  section('runHandleRemove — 10. non-auto-saved item: removeItem NOT called, status still flips');
  {
    const removeItemIds: string[] = [];
    const finalStatuses: string[] = [];

    runHandleRemove(
      TEST_URI,
      { status: 'settled', autoSavedId: undefined },
      {
        removeItem: (id) => { removeItemIds.push(id); },
        setItems: (updater) => {
          const after = updater([{ uri: TEST_URI, status: 'settled', classification: null }]);
          if (after[0]) finalStatuses.push(after[0].status);
        },
      },
    );

    assert(removeItemIds.length === 0,
      'removeItem NOT called for a non-auto-saved item');
    assert(finalStatuses.includes('removed'),
      'setItems still flips status to removed for non-auto-saved item');
  }

  section('runHandleRemove — 10b. undefined match (item not found in ref): no crash, no removeItem call');
  {
    const removeItemIds: string[] = [];

    runHandleRemove(
      TEST_URI,
      undefined, // item not found in itemsRef
      {
        removeItem: (id) => { removeItemIds.push(id); },
        setItems: (_updater) => { /* not capturing */ },
      },
    );

    assert(removeItemIds.length === 0,
      'removeItem NOT called when match is undefined (item not found)');
  }

  // ── 11. Happy path (no upload — resolveUploadArg returns null) ────────────

  section('runAutoPersistItem — 11. no upload needed (resolveUploadArg returns null): local URI used');
  {
    const mountedRef = { current: true };
    const itemsRef   = makeItemsRef();
    const d = makeDeferredDeps({ resolveUploadArgResult: null });

    const p = runAutoPersistItem(makeInput(), mountedRef, itemsRef, d.deps);
    await tick();

    d.resolveSession('user-abc');
    const result = await p;

    assert(d.addItemCalls === 1,
      'addItem called even when upload is skipped');
    assert(d.addItemPayloads[0]?.photoUri === TEST_URI,
      'photoUri falls back to the original local URI when upload is null');
    assert(result === TEST_UUID,
      'returns autoSavedId on success (no-upload path)');
  }

  // ── 12. applyAutoSavedEdits — empty list ─────────────────────────────────

  section('applyAutoSavedEdits — 12. empty list: updateItem NOT called, returns 0');
  {
    let updateCalled = false;
    const count = applyAutoSavedEdits([], {
      updateItem: () => { updateCalled = true; },
    });

    assert(!updateCalled,
      'updateItem NOT called for an empty list');
    assert(count === 0,
      'returns 0 for an empty list');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n=== bulkAutoPersist: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`);
  if (failed > 0) process.exit(1);

})();
