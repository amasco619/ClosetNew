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
    resize:              (_uri)   => resizeD.promise,
    removeBg:            (_b64)   => removeBgD.promise,
    reencodeAsJpeg:      (_pngB64) => reencodeD.promise,
    resolveClassifyBase64: (orig, reenc) =>
      reenc && reenc.length > 0 ? reenc : orig,
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

  // ── runRedirectSingle ─────────────────────────────────────────────────────

  section('runRedirectSingle — 8. unmounted: router.replace not called');
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

  section('runRedirectSingle — 9. mounted + settled with classification: replace fires with params');
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

  section('runRedirectSingle — 10. singleRedirectedRef latch prevents double navigation');
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

  section('runRedirectSingle — 11. race: two simultaneous calls, only first navigates');
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

  section('runSaveAll — 12. unmount before getSession resolves: no mutations fire');
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

  section('runSaveAll — 13. unmount before resize resolves: no wardrobe mutations fire');
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

  section('runSaveAll — 14. unmount after resize, before upload resolves: no wardrobe mutations fire');
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

  section('runSaveAll — 15. no unmount (happy path, guest): all mutations fire');
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

  section('runSaveAll — 16. no unmount (happy path, authenticated): full upload + mutations fire');
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

  section('runSaveAll — 17. early unmount (mountedRef already false at entry): nothing runs');
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

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n=== bulkReviewMountedGuard: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`);
  if (failed > 0) process.exit(1);

})();
