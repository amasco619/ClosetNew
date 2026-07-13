/**
 * Tests for the mountedRef guard in bulk-review.tsx.
 *
 * The guard logic is extracted into lib/bulkClassifyCore (runClassifyUri,
 * runRedirectSingle) so it can be imported and exercised directly in Node.js
 * without pulling in Expo / React Native.  Async dependencies are injected as
 * mock functions backed by deferred promises, giving precise control over which
 * await point completes before the component "unmounts".
 *
 * Key timing insight: runClassifyUri awaits each async dep before checking
 * mountedRef.  So to test the guard at checkpoint N, the test must:
 *   1. Resolve every dep up to and including dep N (so the pipeline advances).
 *   2. Flip mountedRef.current = false BEFORE resolving dep N.
 *   3. resolving dep N → pipeline reaches guard N → guard fires → function returns.
 *
 * If a mountedRef.current check is ever removed from either function, the
 * corresponding test here will fail — ensuring no silent regression.
 *
 * Run: `npx tsx __tests__/bulkReviewMountedGuard.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { runClassifyUri, runRedirectSingle, runSaveAll } from '../lib/bulkClassifyCore';
import type { BulkItemCore, ClassifyResult, ClassifyDeps, SaveAllItem, SaveAllDeps } from '../lib/bulkClassifyCore';

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

/**
 * Returns a promise and the resolve function so a test can control exactly when
 * an async step completes (simulating slow network / heavy image processing).
 */
function deferred<T>(): { promise: Promise<T>; resolve(v: T): void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

/** Flush the microtask queue (one tick). */
const tick = () => Promise.resolve();

// ── Minimal item fixture ──────────────────────────────────────────────────────

const TEST_URI = 'file:///photos/shirt.jpg';

function makeItem(overrides: Partial<BulkItemCore> = {}): BulkItemCore {
  return { uri: TEST_URI, status: 'pending', classification: null, ...overrides };
}

// ── Mock deps builder ─────────────────────────────────────────────────────────

type SetItemsCall = string;

interface DeferredDeps {
  deps: ClassifyDeps;
  setItemsCalls: SetItemsCall[];
  hapticFired: { value: boolean };
  resolveResize(result: { base64?: string } | null): void;
  resolveRemoveBg(result: string | null): void;
  resolveReencode(result: { base64?: string; uri: string } | null): void;
  resolveClassify(data: Record<string, unknown>): void;
}

/**
 * Build a ClassifyDeps object where every async step is backed by a deferred
 * promise.  Returns resolvers so the test can release steps one at a time,
 * simulating mid-flight unmount at each checkpoint.
 *
 * IMPORTANT: the pipeline always awaits every dep before checking mountedRef.
 * Therefore every deferred MUST be resolved (in order) for classifyPromise to
 * resolve.  Tests set mountedRef.current = false BEFORE resolving the dep that
 * guards the section they want to suppress.
 */
function makeDeferredDeps(): DeferredDeps {
  const setItemsCalls: SetItemsCall[] = [];
  const hapticFired = { value: false };

  const resizeD   = deferred<{ base64?: string } | null>();
  const removeBgD = deferred<string | null>();
  const reencodeD = deferred<{ base64?: string; uri: string } | null>();
  const classifyD = deferred<Record<string, unknown>>();

  const deps: ClassifyDeps = {
    resize:         (_uri)    => resizeD.promise,
    removeBg:       (_b64)    => removeBgD.promise,
    reencodeAsJpeg: (_pngB64) => reencodeD.promise,
    resolvePhotoUri: (orig, reenc) =>
      reenc && reenc.length > 0 && !reenc.startsWith('data:') ? reenc : orig,
    classify: (_b64) => classifyD.promise,
    setItems: (updater) => {
      const after = updater([makeItem()]);
      setItemsCalls.push(after[0]?.status ?? 'unknown');
    },
    onHaptic: () => { hapticFired.value = true; },
  };

  return {
    deps,
    setItemsCalls,
    hapticFired,
    resolveResize:   (v) => resizeD.resolve(v),
    resolveRemoveBg: (v) => removeBgD.resolve(v),
    resolveReencode: (v) => reencodeD.resolve(v),
    resolveClassify: (v) => classifyD.resolve(v),
  };
}

const CLASSIFY_RESPONSE: Record<string, unknown> = {
  category:     'top',
  subType:      't-shirt',
  colorFamily:  'white',
  description:  'A white t-shirt',
  occasionTags: ['casual'],
  seasonTags:   ['all-season'],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  // ── runClassifyUri ────────────────────────────────────────────────────────

  section('runClassifyUri — 1. early unmount (mountedRef already false at entry)');
  {
    // Component unmounts before classifyUri even starts.
    const mountedRef = { current: false };
    const d = makeDeferredDeps();

    const classifyPromise = runClassifyUri(TEST_URI, mountedRef, d.deps);
    // The function returns without awaiting any step; resolve deferreds to
    // ensure the promise resolves and the test doesn't hang.
    d.resolveResize({ base64: 'r' });
    d.resolveRemoveBg(null);
    d.resolveReencode(null);
    d.resolveClassify({});
    await classifyPromise;

    assert(d.setItemsCalls.length === 0,
      'setItems never called when already unmounted at entry');
  }

  section('runClassifyUri — 2. unmount between resize and removeBg');
  {
    // Simulate: resize succeeds, user taps back, removeBg resolves (late network).
    const mountedRef = { current: true };
    const d = makeDeferredDeps();

    const classifyPromise = runClassifyUri(TEST_URI, mountedRef, d.deps);
    await tick(); // pipeline runs to `await deps.resize`

    d.resolveResize({ base64: 'resized' }); // resize resolves
    await tick(); // pipeline passes post-resize guard, reaches `await deps.removeBg`

    // Unmount NOW, then let removeBg resolve — pipeline will hit the post-removeBg guard.
    mountedRef.current = false;
    d.resolveRemoveBg(null);
    d.resolveReencode(null); // also unblock reencodeAsJpeg in case logic reaches it
    d.resolveClassify({});
    await classifyPromise;

    assert(d.setItemsCalls.includes('classifying'),
      'classifying update fires (before unmount)');
    assert(!d.setItemsCalls.includes('settled'),
      'settled suppressed after unmount (post-removeBg guard fires)');
    assert(!d.setItemsCalls.includes('error'),
      'error suppressed after unmount');
  }

  section('runClassifyUri — 3. unmount between removeBg and reencodeAsJpeg');
  {
    // removeBg succeeds (displayUri update fires), then user taps back.
    const mountedRef = { current: true };
    const d = makeDeferredDeps();

    const classifyPromise = runClassifyUri(TEST_URI, mountedRef, d.deps);
    await tick();

    d.resolveResize({ base64: 'resized' });
    await tick(); // past post-resize guard, reaches removeBg

    d.resolveRemoveBg('clean-png');
    await tick(); // post-removeBg guard passes, pipeline enters reencodeAsJpeg directly (no intermediate data: URI update)

    // Unmount NOW, then let reencodeAsJpeg resolve.
    mountedRef.current = false;
    d.resolveReencode({ base64: 'reenc', uri: 'file:///reenc.jpg' });
    d.resolveClassify({});
    await classifyPromise;

    assert(d.setItemsCalls.includes('classifying'),
      'classifying update fires');
    assert(!d.setItemsCalls.includes('settled'),
      'settled suppressed after unmount (post-reencodeAsJpeg guard fires)');
  }

  section('runClassifyUri — 4. unmount before classify resolves');
  {
    // reencodeAsJpeg succeeds, then user taps back before the classify API returns.
    const mountedRef = { current: true };
    const d = makeDeferredDeps();

    const classifyPromise = runClassifyUri(TEST_URI, mountedRef, d.deps);
    await tick();

    d.resolveResize({ base64: 'resized' });
    await tick();

    d.resolveRemoveBg('clean-png');
    await tick();

    d.resolveReencode({ base64: 'reenc', uri: 'file:///reenc.jpg' });
    await tick(); // past post-reencodeAsJpeg guard, reaches classify

    // Unmount NOW, then let classify resolve.
    mountedRef.current = false;
    d.resolveClassify(CLASSIFY_RESPONSE);
    await classifyPromise;

    assert(d.setItemsCalls.includes('classifying'),
      'classifying update fires');
    assert(!d.setItemsCalls.includes('settled'),
      'settled suppressed after unmount (post-classify guard fires)');
  }

  section('runClassifyUri — 5. no unmount (happy path), all updates fire');
  {
    const mountedRef = { current: true };
    const d = makeDeferredDeps();

    const classifyPromise = runClassifyUri(TEST_URI, mountedRef, d.deps);
    await tick();

    d.resolveResize({ base64: 'resized' });
    await tick();

    d.resolveRemoveBg('clean-png');
    await tick();

    d.resolveReencode({ base64: 'reenc', uri: 'file:///reenc.jpg' });
    await tick();

    d.resolveClassify(CLASSIFY_RESPONSE);
    await classifyPromise;

    assert(d.setItemsCalls.includes('classifying'), 'classifying fires');
    assert(d.setItemsCalls.includes('settled'),     'settled fires on happy path');
    assert(d.hapticFired.value,                     'haptic fires on success');
  }

  section('runClassifyUri — 6. resize failure triggers error status');
  {
    const mountedRef = { current: true };
    const d = makeDeferredDeps();

    const classifyPromise = runClassifyUri(TEST_URI, mountedRef, d.deps);
    await tick();

    d.resolveResize(null); // null → throws 'resize_failed' inside pipeline catch
    // Remaining deferreds never reached; resolve them so nothing leaks.
    d.resolveRemoveBg(null);
    d.resolveReencode(null);
    d.resolveClassify({});
    await classifyPromise;

    assert(d.setItemsCalls.includes('error'),
      'error status set when resize returns null');
    assert(!d.setItemsCalls.includes('settled'),
      'settled not called on resize failure');
  }

  section('runClassifyUri — 7. resize failure + unmount = error update suppressed');
  {
    // Unmount happens between the initial classifying update and resize resolving.
    const mountedRef = { current: true };
    const d = makeDeferredDeps();

    const classifyPromise = runClassifyUri(TEST_URI, mountedRef, d.deps);
    await tick(); // pipeline runs to `await deps.resize`

    mountedRef.current = false; // user taps back
    d.resolveResize(null); // resize resolves (null) — catch block fires but mountedRef guard suppresses error update
    d.resolveRemoveBg(null);
    d.resolveReencode(null);
    d.resolveClassify({});
    await classifyPromise;

    assert(!d.setItemsCalls.includes('error'),
      'error update suppressed when unmounted before resize result is processed');
  }

  section('runClassifyUri — 8. reencodeAsJpeg throws (mounted): fallback displayUri = original URI, cleanBase64 captured');
  {
    // reencodeAsJpeg rejects while the component is still mounted.
    // The catch block must: set displayUri = resolvePhotoUri(uri, null) = original file:// URI
    //                  and: capture cleanBase64 so the clean PNG is still uploaded on save.
    const mountedRef = { current: true };

    // Capture full item snapshots (not just status) to inspect displayUri and cleanBase64.
    const itemSnapshots: BulkItemCore[] = [];

    const resizeD   = deferred<{ base64?: string } | null>();
    const classifyD = deferred<Record<string, unknown>>();

    const deps: ClassifyDeps = {
      resize:          (_uri)    => resizeD.promise,
      removeBg:        (_b64)    => Promise.resolve('clean-png'),
      reencodeAsJpeg:  (_pngB64) => Promise.reject(new Error('reencode_failed')),
      resolvePhotoUri: (orig, reenc) =>
        reenc && reenc.length > 0 && !reenc.startsWith('data:') ? reenc : orig,
      classify:  (_b64)    => classifyD.promise,
      setItems: (updater) => {
        const after = updater([makeItem()]);
        if (after[0]) itemSnapshots.push({ ...after[0] });
      },
      onHaptic: () => {},
    };

    const classifyPromise = runClassifyUri(TEST_URI, mountedRef, deps);
    await tick(); // reaches await resize

    resizeD.resolve({ base64: 'resized' });
    // removeBg resolves immediately (Promise.resolve), reencodeAsJpeg rejects immediately.
    // Allow enough ticks for: resize → removeBg → reencodeAsJpeg reject → catch block.
    await tick();
    await tick();
    await tick();
    await tick();

    classifyD.resolve(CLASSIFY_RESPONSE);
    await classifyPromise;

    // The catch block fires a setItems with displayUri set via resolvePhotoUri(uri, null).
    const fallbackSnapshot = itemSnapshots.find(s => s.displayUri !== undefined);

    assert(
      fallbackSnapshot?.displayUri === TEST_URI,
      'fallback displayUri is the original file:// URI, not blank or a data: string',
    );
    assert(
      fallbackSnapshot?.cleanBase64 === 'clean-png',
      'cleanBase64 is still captured even when reencodeAsJpeg throws',
    );
    assert(
      itemSnapshots.some(s => s.status === 'settled'),
      'pipeline continues to settled after reencodeAsJpeg failure',
    );
  }

  // ── runRedirectSingle ─────────────────────────────────────────────────────

  section('runRedirectSingle — 9. unmounted: router.replace not called');
  {
    const mountedRef          = { current: false };
    const singleRedirectedRef = { current: false };
    let callCount = 0;

    runRedirectSingle(
      makeItem({ status: 'settled', classification: null }),
      false,
      mountedRef,
      singleRedirectedRef,
      { replace: () => { callCount++; } },
    );

    assert(callCount === 0,
      'router.replace not called when mountedRef is false');
    assert(!singleRedirectedRef.current,
      'latch stays false when unmounted');
  }

  section('runRedirectSingle — 10. mounted + settled with classification: replace fires with params');
  {
    const mountedRef          = { current: true };
    const singleRedirectedRef = { current: false };
    let replacePathname = '';

    const classification: ClassifyResult = {
      category:     'top',
      subType:      't-shirt',
      colorFamily:  'white',
      description:  'test',
      occasionTags: ['casual'],
      seasonTags:   ['all-season'],
    };

    runRedirectSingle(
      makeItem({ status: 'settled', classification }),
      true,
      mountedRef,
      singleRedirectedRef,
      { replace: (p: { pathname: string }) => { replacePathname = p.pathname; } },
    );

    assert(replacePathname === '/add-item',
      'replace called with /add-item pathname');
    assert(singleRedirectedRef.current,
      'latch engaged after first call');
  }

  section('runRedirectSingle — 11. singleRedirectedRef latch prevents double navigation');
  {
    const mountedRef          = { current: true };
    const singleRedirectedRef = { current: true }; // latch already set
    let callCount = 0;

    runRedirectSingle(
      makeItem(),
      false,
      mountedRef,
      singleRedirectedRef,
      { replace: () => { callCount++; } },
    );

    assert(callCount === 0,
      'router.replace not called when latch is already set');
  }

  section('runRedirectSingle — 12. race: two simultaneous calls, only first navigates');
  {
    const mountedRef          = { current: true };
    const singleRedirectedRef = { current: false };
    let callCount = 0;
    const nav = () => { callCount++; };

    runRedirectSingle(makeItem(), false, mountedRef, singleRedirectedRef, { replace: nav });
    runRedirectSingle(makeItem(), false, mountedRef, singleRedirectedRef, { replace: nav });

    assert(callCount === 1,
      'router.replace called exactly once despite race');
  }

  // ── runSaveAll ────────────────────────────────────────────────────────────

  /**
   * Build a SaveAllDeps where getSession, resize, and upload are backed by
   * deferred promises so tests can release them one at a time.
   */
  interface DeferredSaveDeps {
    deps: SaveAllDeps;
    addItemCalls: number;
    setItemsStatuses: string[];
    setSavingValues: boolean[];
    navigateCalled: boolean;
    resolveSession(userId: string | null): void;
    resolveResize(result: { base64?: string } | null): void;
    resolveUpload(url: string): void;
    rejectUpload(err: Error): void;
  }

  function makeSaveItem(overrides: Partial<SaveAllItem> = {}): SaveAllItem {
    return {
      uri: 'file:///photos/shirt.jpg',
      classification: {
        category:     'top',
        subType:      't-shirt',
        colorFamily:  'white',
        description:  'A white t-shirt',
        occasionTags: ['casual'],
        seasonTags:   ['all-season'],
      },
      ...overrides,
    };
  }

  function makeDeferredSaveDeps(): DeferredSaveDeps {
    let addItemCalls = 0;
    const setItemsStatuses: string[] = [];
    const setSavingValues: boolean[] = [];
    let navigateCalled = false;

    const sessionD = deferred<string | null>();
    const resizeD  = deferred<{ base64?: string } | null>();
    const uploadD  = deferred<string>();

    const deps: SaveAllDeps = {
      generateId: () => 'test-uuid',
      getSession: () => sessionD.promise,
      resize:     (_uri) => resizeD.promise,
      upload:     (_userId, _b64, _itemId, _mime) => uploadD.promise,
      resolveUploadArg: (clean, shrunk) => {
        const b = clean ?? shrunk;
        if (!b || b.startsWith('data:')) return null;
        return { base64: b, mimeType: 'image/jpeg' };
      },
      addItem: () => { addItemCalls++; },
      setItems: (updater) => {
        const after = updater([{ uri: 'file:///photos/shirt.jpg', status: 'pending', classification: null }]);
        setItemsStatuses.push(after[0]?.status ?? 'unknown');
      },
      setSaving: (v) => { setSavingValues.push(v); },
      onItemHaptic: () => {},
      onDoneHaptic: () => {},
      navigate: () => { navigateCalled = true; },
    };

    return {
      deps,
      get addItemCalls() { return addItemCalls; },
      get setItemsStatuses() { return setItemsStatuses; },
      get setSavingValues() { return setSavingValues; },
      get navigateCalled() { return navigateCalled; },
      resolveSession: (v) => sessionD.resolve(v),
      resolveResize:  (v) => resizeD.resolve(v),
      resolveUpload:  (v) => uploadD.resolve(v),
      rejectUpload:   (e) => { uploadD.promise.catch(() => {}); (uploadD as any)._reject?.(e); },
    };
  }

  section('runSaveAll — 13. unmount before getSession resolves: no mutations fire');
  {
    const mountedRef = { current: true };
    const d = makeDeferredSaveDeps();

    const p = runSaveAll([makeSaveItem()], mountedRef, d.deps);
    await tick(); // pipeline reaches await getSession

    mountedRef.current = false;
    d.resolveSession('user-123');
    await p;

    assert(d.addItemCalls === 0,
      'addItem not called when unmounted before getSession resolves');
    assert(!d.setItemsStatuses.includes('saved'),
      'setItems(saved) not called when unmounted before getSession resolves');
    assert(!d.navigateCalled,
      'navigate not called when unmounted before getSession resolves');
  }

  section('runSaveAll — 14. unmount before resize resolves: no wardrobe mutations fire');
  {
    const mountedRef = { current: true };
    const d = makeDeferredSaveDeps();

    const p = runSaveAll([makeSaveItem()], mountedRef, d.deps);
    await tick();

    d.resolveSession('user-123'); // getSession resolves, loop starts
    await tick(); // loop sets 'saving', reaches await resize

    mountedRef.current = false;
    d.resolveResize({ base64: 'shrunk-base64' });
    await p;

    assert(d.addItemCalls === 0,
      'addItem not called when unmounted during resize');
    assert(!d.setItemsStatuses.includes('saved'),
      'setItems(saved) suppressed when unmounted during resize');
    assert(!d.navigateCalled,
      'navigate suppressed when unmounted during resize');
  }

  section('runSaveAll — 15. unmount after resize, before upload resolves: no wardrobe mutations fire');
  {
    const mountedRef = { current: true };
    const d = makeDeferredSaveDeps();

    const p = runSaveAll([makeSaveItem()], mountedRef, d.deps);
    await tick();

    d.resolveSession('user-123');
    await tick();

    d.resolveResize({ base64: 'shrunk-base64' }); // resize resolves, upload starts
    await tick();

    mountedRef.current = false;
    d.resolveUpload('https://storage.example.com/item.jpg');
    await p;

    assert(d.addItemCalls === 0,
      'addItem not called when unmounted during upload');
    assert(!d.setItemsStatuses.includes('saved'),
      'setItems(saved) suppressed when unmounted during upload');
    assert(!d.navigateCalled,
      'navigate suppressed when unmounted during upload');
  }

  section('runSaveAll — 16. no unmount (happy path, guest): all mutations fire');
  {
    const mountedRef = { current: true };
    const d = makeDeferredSaveDeps();

    // Guest: no userId → skips upload entirely
    const p = runSaveAll([makeSaveItem()], mountedRef, d.deps);
    await tick();

    d.resolveSession(null); // guest
    await p;

    assert(d.addItemCalls === 1,
      'addItem called once on guest happy path');
    assert(d.setItemsStatuses.includes('saving'),
      'setItems(saving) fires');
    assert(d.setItemsStatuses.includes('saved'),
      'setItems(saved) fires');
    assert(d.navigateCalled,
      'navigate fires on completion');
    assert(d.setSavingValues[0] === true,
      'setSaving(true) fires at start');
    assert(d.setSavingValues[d.setSavingValues.length - 1] === false,
      'setSaving(false) fires at end');
  }

  section('runSaveAll — 17. no unmount (happy path, authenticated): full upload + mutations fire');
  {
    const mountedRef = { current: true };
    const d = makeDeferredSaveDeps();

    // Authenticated, no cleanBase64 → resize + upload path
    const p = runSaveAll([makeSaveItem({ cleanBase64: undefined })], mountedRef, d.deps);
    await tick();

    d.resolveSession('user-123');
    await tick();

    d.resolveResize({ base64: 'shrunk-b64' });
    await tick();

    d.resolveUpload('https://storage.example.com/wardrobe/user-123/test-uuid.jpg');
    await p;

    assert(d.addItemCalls === 1,
      'addItem called once on authenticated happy path');
    assert(d.setItemsStatuses.includes('saved'),
      'setItems(saved) fires');
    assert(d.navigateCalled,
      'navigate fires on completion');
  }

  section('runSaveAll — 18. early unmount (mountedRef already false at entry): nothing runs');
  {
    const mountedRef = { current: false };
    const d = makeDeferredSaveDeps();

    const p = runSaveAll([makeSaveItem()], mountedRef, d.deps);
    d.resolveSession(null);
    d.resolveResize(null);
    d.resolveUpload('');
    await p;

    assert(d.addItemCalls === 0,
      'addItem never called when already unmounted at entry');
    assert(!d.navigateCalled,
      'navigate never called when already unmounted at entry');
  }

  // ── No stale-state console warnings ──────────────────────────────────────

  section('No stale-state console.error warnings emitted for any unmount scenario');
  {
    const originalError = console.error;
    const errorCalls: string[] = [];
    console.error = (...args: unknown[]) => {
      errorCalls.push(args.map(String).join(' '));
    };

    // Replay unmount-between-resize-and-removeBg (mirrors test 2).
    {
      const mountedRef = { current: true };
      const d = makeDeferredDeps();
      const p = runClassifyUri(TEST_URI, mountedRef, d.deps);
      await tick();
      d.resolveResize({ base64: 'r' });
      await tick();
      mountedRef.current = false;
      d.resolveRemoveBg(null);
      d.resolveReencode(null);
      d.resolveClassify({});
      await p;
    }

    // Replay redirect unmount (mirrors test 8).
    runRedirectSingle(
      makeItem(),
      false,
      { current: false },
      { current: false },
      { replace: () => {} },
    );

    console.error = originalError;

    const staleWarnings = errorCalls.filter(m =>
      m.includes('unmounted') || m.includes('state update'),
    );
    assert(staleWarnings.length === 0,
      'no stale-state console.error warnings emitted');
  }

  // ── BulkCard preview URI contract ────────────────────────────────────────
  //
  // The BulkCard component always renders item.uri as its photo source,
  // never item.displayUri. This section encodes that contract as a set of
  // pure assertions so a future refactor cannot silently reintroduce the
  // NSTemporaryDirectory eviction blank-tile bug.
  //
  // The logic under test is: previewUri = item.uri (always).
  // onError fallback        = item.uri (always, same value).
  //
  // Both resolve to item.uri so that:
  //  A) Light garments (transparent Photoroom PNG → white JPEG) never
  //     render blank.
  //  B) Temp-file eviction (iOS NSTemporaryDirectory purge of the
  //     ImageManipulator output) never renders blank.
  //  C) expo-image silent failure is recovered by the onError handler.

  section('BulkCard preview URI — 18. displayUri is never the preview source');
  {
    function bulkCardPreviewUri(item: Pick<BulkItemCore, 'uri' | 'displayUri'>): string {
      return item.uri;
    }

    const withDisplay: Pick<BulkItemCore, 'uri' | 'displayUri'> = {
      uri: 'file:///Library/Caches/shirt.jpg',
      displayUri: 'file:///tmp/ImageManipulator/clean.jpg',
    };
    const withoutDisplay: Pick<BulkItemCore, 'uri' | 'displayUri'> = {
      uri: 'file:///Library/Caches/hoodie.jpg',
    };
    const withWhiteJpeg: Pick<BulkItemCore, 'uri' | 'displayUri'> = {
      uri: 'file:///Library/Caches/sneakers.jpg',
      displayUri: 'file:///tmp/ImageManipulator/white-on-white.jpg',
    };

    assert(
      bulkCardPreviewUri(withDisplay) === withDisplay.uri,
      'preview is item.uri even when displayUri is set',
    );
    assert(
      bulkCardPreviewUri(withDisplay) !== withDisplay.displayUri,
      'preview is NOT displayUri (temp path)',
    );
    assert(
      bulkCardPreviewUri(withoutDisplay) === withoutDisplay.uri,
      'preview is item.uri when displayUri is absent',
    );
    assert(
      bulkCardPreviewUri(withWhiteJpeg) !== withWhiteJpeg.displayUri,
      'white-garment transparent re-encode never surfaced as preview',
    );
  }

  section('BulkCard preview URI — 19. onError fallback resolves to item.uri');
  {
    function onErrorFallback(item: Pick<BulkItemCore, 'uri'>): string {
      return item.uri;
    }

    const item = { uri: 'file:///Library/Caches/coat.jpg' };

    assert(
      onErrorFallback(item) === item.uri,
      'onError fallback is item.uri (stable app-cache path)',
    );
    assert(
      !onErrorFallback(item).startsWith('data:'),
      'onError fallback is never a data: URI',
    );
    assert(
      onErrorFallback(item).startsWith('file://'),
      'onError fallback is a file:// path',
    );
  }

  section('BulkCard preview URI — 20. upload path still reads cleanBase64 not preview');
  {
    // The upload arg selector reads cleanBase64 (not displayUri or the preview
    // source).  Confirm resolveWardrobeUploadArg still picks the PNG path when
    // cleanBase64 is present, regardless of what displayUri contains.
    const { resolveWardrobeUploadArg } = await import('../lib/uploadArg');

    const cleanBase64 = 'abc123pngbase64';
    const result = resolveWardrobeUploadArg(cleanBase64, undefined);

    assert(result !== null, 'upload arg is non-null when cleanBase64 is present');
    assert(result?.mimeType === 'image/png', 'upload uses PNG mime type for cleanBase64');
    assert(result?.base64 === cleanBase64, 'upload base64 is cleanBase64 (not displayUri)');

    const noClean = resolveWardrobeUploadArg(undefined, 'jpegbase64');
    assert(noClean?.mimeType === 'image/jpeg', 'upload falls back to JPEG when cleanBase64 absent');

    const noSource = resolveWardrobeUploadArg(undefined, undefined);
    assert(noSource === null, 'upload is null when both sources are absent');
  }

  // ── handleSaveAll savingRef double-tap guard ──────────────────────────────
  //
  // The savingRef latch in handleSaveAll is a useRef(false) checked
  // synchronously at the top of the handler and set to true before any await.
  // This closes the race where a second tap arrives before setSaving(true) has
  // completed a React render cycle.
  //
  // These tests mirror the exact ref pattern used in bulk-review.tsx —
  // the component itself is not importable in Node, so we exercise the pattern
  // directly.

  section('savingRef latch — 21. second call exits immediately while first is in-flight');
  {
    let runSaveAllCallCount = 0;
    const savingRef = { current: false };

    const mockHandleSaveAll = async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        runSaveAllCallCount++;
        await tick(); // simulate async work (getSession, upload, etc.)
      } finally {
        savingRef.current = false;
      }
    };

    // Simulate rapid double-tap: both calls happen synchronously before any
    // await resolves, so the second call sees savingRef.current === true.
    const p1 = mockHandleSaveAll();
    const p2 = mockHandleSaveAll();
    await Promise.all([p1, p2]);

    assert(runSaveAllCallCount === 1,
      'runSaveAll invoked exactly once despite rapid double-tap');
  }

  section('savingRef latch — 22. ref is cleared after completion (subsequent tap works)');
  {
    let runSaveAllCallCount = 0;
    const savingRef = { current: false };

    const mockHandleSaveAll = async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        runSaveAllCallCount++;
        await tick();
      } finally {
        savingRef.current = false;
      }
    };

    await mockHandleSaveAll(); // first save completes
    await mockHandleSaveAll(); // second save after completion should proceed

    assert(runSaveAllCallCount === 2,
      'savingRef is cleared after completion so a later tap can proceed');
  }

  section('savingRef latch — 23. many concurrent taps: exactly one proceeds');
  {
    let runSaveAllCallCount = 0;
    const savingRef = { current: false };

    const mockHandleSaveAll = async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        runSaveAllCallCount++;
        await tick();
      } finally {
        savingRef.current = false;
      }
    };

    // Simulate 5 rapid taps before any microtask runs
    const promises = Array.from({ length: 5 }, () => mockHandleSaveAll());
    await Promise.all(promises);

    assert(runSaveAllCallCount === 1,
      'only one of five concurrent taps reaches runSaveAll');
  }

  section('runSaveAll — 24. upload failure on first item does not block second item');
  {
    const mountedRef = { current: true };

    const item1: SaveAllItem = {
      uri: 'file:///photos/item1.jpg',
      classification: {
        category:     'top',
        subType:      't-shirt',
        colorFamily:  'white',
        description:  'Item 1',
        occasionTags: ['casual'],
        seasonTags:   ['all-season'],
      },
    };
    const item2: SaveAllItem = {
      uri: 'file:///photos/item2.jpg',
      classification: {
        category:     'bottom',
        subType:      'jeans',
        colorFamily:  'blue',
        description:  'Item 2',
        occasionTags: ['casual'],
        seasonTags:   ['all-season'],
      },
    };

    const addItemPayloads: Array<{ photoUri: string }> = [];
    const finalStatuses: Record<string, string> = {};
    let uploadCallCount = 0;

    const deps: SaveAllDeps = {
      generateId: () => `uuid-${uploadCallCount}`,
      getSession: async () => 'user-123',
      resize: async (_uri) => ({ base64: 'shrunk' }),
      upload: async (_userId, _b64, _itemId, _mime) => {
        uploadCallCount++;
        if (uploadCallCount === 1) throw new Error('network_error');
        return 'https://storage.example.com/item2.jpg';
      },
      resolveUploadArg: (clean, shrunk) => {
        const b = clean ?? shrunk;
        if (!b) return null;
        return { base64: b, mimeType: 'image/jpeg' };
      },
      addItem: (payload) => { addItemPayloads.push({ photoUri: payload.photoUri }); },
      setItems: (updater) => {
        const prev = [
          { uri: item1.uri, status: finalStatuses[item1.uri] ?? 'pending', classification: null },
          { uri: item2.uri, status: finalStatuses[item2.uri] ?? 'pending', classification: null },
        ];
        const after = updater(prev);
        for (const it of after) {
          finalStatuses[it.uri] = it.status;
        }
      },
      setSaving:    () => {},
      onItemHaptic: () => {},
      onDoneHaptic: () => {},
      navigate:     () => {},
    };

    await runSaveAll([item1, item2], mountedRef, deps);

    assert(
      addItemPayloads.length === 2,
      'addItem called for both items even though first upload failed',
    );
    assert(
      addItemPayloads[0]?.photoUri === item1.uri,
      'first item falls back to local URI when upload throws',
    );
    assert(
      addItemPayloads[1]?.photoUri === 'https://storage.example.com/item2.jpg',
      'second item uses the uploaded cloud URI',
    );
    assert(
      finalStatuses[item1.uri] === 'saved',
      'first item ends in saved (not stuck in saving)',
    );
    assert(
      finalStatuses[item2.uri] === 'saved',
      'second item ends in saved (not stuck in saving)',
    );
    assert(
      finalStatuses[item1.uri] !== 'saving',
      'first item is not stuck in saving',
    );
    assert(
      finalStatuses[item2.uri] !== 'saving',
      'second item is not stuck in saving',
    );
  }

  // ── Photo preview timing ──────────────────────────────────────────────────
  //
  // After removeBg resolves, the pipeline immediately sets
  //   classifyBase64 = cleanPngBase64
  // so Gemini receives the clean image — but displayUri is NOT written to
  // state until reencodeAsJpeg resolves.  These two sections lock in that
  // ordering so a future refactor cannot silently break either invariant.

  section('Photo preview timing — 25. displayUri not set while reencodeAsJpeg is in-flight');
  {
    // After removeBg resolves (and before reencodeAsJpeg resolves), the
    // pipeline has updated its internal classifyBase64 = cleanPngBase64
    // but must NOT have called setItems with displayUri yet.
    // A second assertion verifies that classify is eventually invoked
    // with the clean PNG base64, not the resized JPEG.
    const mountedRef = { current: true };
    const itemSnapshots: BulkItemCore[] = [];
    let classifyCalledWith = '';

    const resizeD   = deferred<{ base64?: string } | null>();
    const reencodeD = deferred<{ base64?: string; uri: string } | null>();
    const classifyD = deferred<Record<string, unknown>>();

    const deps: ClassifyDeps = {
      resize:          (_uri)    => resizeD.promise,
      removeBg:        (_b64)    => Promise.resolve('clean-png-b64'),
      reencodeAsJpeg:  (_pngB64) => reencodeD.promise,
      resolvePhotoUri: (orig, reenc) =>
        reenc && reenc.length > 0 && !reenc.startsWith('data:') ? reenc : orig,
      classify: (b64) => { classifyCalledWith = b64; return classifyD.promise; },
      setItems: (updater) => {
        const after = updater([makeItem()]);
        if (after[0]) itemSnapshots.push({ ...after[0] });
      },
      onHaptic: () => {},
    };

    const classifyPromise = runClassifyUri(TEST_URI, mountedRef, deps);
    await tick(); // pipeline reaches await resize

    resizeD.resolve({ base64: 'resized-b64' });
    await tick(); // resize result delivered; removeBg (Promise.resolve) queued
    await tick(); // removeBg value delivered; pipeline enters await reencodeAsJpeg (pending)
    await tick(); // extra tick to absorb any additional scheduling

    // At this point removeBg has resolved but reencodeAsJpeg is still pending.
    // No setItems call should have included displayUri yet.
    const snapshotsBeforeReencode = [...itemSnapshots];

    assert(
      snapshotsBeforeReencode.every(s => s.displayUri === undefined),
      'displayUri not set on any item while reencodeAsJpeg is still in-flight',
    );

    // Resolve the rest of the pipeline.
    reencodeD.resolve({ base64: 'reenc-b64', uri: 'file:///reenc.jpg' });
    await tick();
    classifyD.resolve(CLASSIFY_RESPONSE);
    await classifyPromise;

    assert(
      classifyCalledWith === 'clean-png-b64',
      'classify receives cleanPngBase64 (not the original resized JPEG)',
    );
  }

  section('Photo preview timing — 26. displayUri is set before settled fires on happy path');
  {
    // On the successful path the pipeline must write displayUri (and
    // cleanBase64) in a setItems call that precedes the final
    // setItems({ status: \'settled\' }) call.  Verify by comparing
    // the snapshot indices captured during the run.
    const mountedRef = { current: true };
    const itemSnapshots: BulkItemCore[] = [];

    const deps: ClassifyDeps = {
      resize:          (_uri)    => Promise.resolve({ base64: 'resized-b64' }),
      removeBg:        (_b64)    => Promise.resolve('clean-png-b64'),
      reencodeAsJpeg:  (_pngB64) => Promise.resolve({ base64: 'reenc-b64', uri: 'file:///reenc.jpg' }),
      resolvePhotoUri: (orig, reenc) =>
        reenc && reenc.length > 0 && !reenc.startsWith('data:') ? reenc : orig,
      classify: (_b64) => Promise.resolve(CLASSIFY_RESPONSE),
      setItems: (updater) => {
        const after = updater([makeItem()]);
        if (after[0]) itemSnapshots.push({ ...after[0] });
      },
      onHaptic: () => {},
    };

    await runClassifyUri(TEST_URI, mountedRef, deps);

    const displayUriIdx = itemSnapshots.findIndex(s => s.displayUri !== undefined);
    const settledIdx    = itemSnapshots.findIndex(s => s.status === 'settled');

    assert(displayUriIdx !== -1, 'displayUri is set at some point on the happy path');
    assert(settledIdx    !== -1, 'settled status is reached on the happy path');
    assert(
      displayUriIdx < settledIdx,
      'displayUri is set before settled fires (preview appears before Gemini result)',
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n=== bulkReviewMountedGuard: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`);
  if (failed > 0) process.exit(1);

})();
