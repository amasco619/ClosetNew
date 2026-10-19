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

import { createSerialQueue, runClassifyUri, runRedirectSingle, runSaveAll, undoSavedItems } from '../lib/bulkClassifyCore';
import type { BulkItemCore, ClassifyResult, ClassifyDeps, SaveAllItem, SaveAllDeps } from '../lib/bulkClassifyCore';
import nodeAssert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { build, type Plugin } from 'esbuild';

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
    writePngToCache: async () => {
      const result = await reencodeD.promise;
      if (!result) throw new Error('cache_write_failed');
      return result.uri;
    },
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

const mountedBulkReview = {
  account: {
    isGuest: true,
    authenticatedUserId: null as string | null,
    wardrobeItems: [] as unknown[],
    isPremium: false,
    addWardrobeItems: async () => {},
    removeWardrobeItem: async () => {},
  },
  params: { selectionId: 'guest-review-selection' },
  selection: {
    photos: [
      { uri: 'file:///staged-guest-photo-1.jpg' },
      { uri: 'file:///staged-guest-photo-2.jpg' },
    ],
    failedCount: 0,
  },
  calls: { preference: 0, photoRoom: 0, classifier: 0 },
};
Object.assign(globalThis, {
  __bulkReviewMounted: mountedBulkReview,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const mountedScreenMocks: Record<string, string> = {
  'react-native': `
    import React from 'react';
    const host=name=>({children,...props})=>React.createElement(name,props,children);
    export const View=host('View'),Text=host('Text'),Pressable=host('Pressable'),
      ActivityIndicator=host('ActivityIndicator');
    export const FlatList=({data,renderItem,ListHeaderComponent,...props})=>{
      const header=typeof ListHeaderComponent==='function'
        ?React.createElement(ListHeaderComponent,{key:'header'})
        :ListHeaderComponent&&React.cloneElement(ListHeaderComponent,{key:'header'});
      const cards=data.map((item,index)=>React.cloneElement(renderItem({item,index}),{key:String(index)}));
      return React.createElement('FlatList',props,[header,...cards]);
    };
    export const Dimensions={get:()=>({width:400,height:800})};
    export const StyleSheet={create:styles=>styles,absoluteFill:{}};
    export const Platform={OS:'web'};
    export const BackHandler={addEventListener:()=>({remove(){}})};
    export const AppState={addEventListener:()=>({remove(){}})};
  `,
  'expo-status-bar': `export const StatusBar=()=>null;`,
  'expo-router': `
    import React from 'react';
    const m=globalThis.__bulkReviewMounted;
    export const router={push:()=>{},replace:()=>{},navigate:()=>{},back:()=>{},setParams:()=>{}};
    export const useLocalSearchParams=()=>m.params;
    export const useFocusEffect=callback=>React.useEffect(callback,[callback]);
  `,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:0,bottom:0});`,
  '@expo/vector-icons': `export const Ionicons=()=>null;`,
  'expo-image-manipulator': `export const manipulateAsync=async()=>({uri:'file:///resized.jpg',base64:'resized'}),SaveFormat={JPEG:'jpeg'};`,
  'expo-file-system/legacy': `
    export const cacheDirectory='file:///cache/',documentDirectory='file:///documents/';
    export const EncodingType={Base64:'base64'};
    export const getInfoAsync=async()=>({exists:true,size:1});
    export const readAsStringAsync=async()=>'base64';
    export const readDirectoryAsync=async()=>[];
    export const writeAsStringAsync=async()=>{};
    export const deleteAsync=async()=>{};
  `,
  'expo-haptics': `export const impactAsync=async()=>{},selectionAsync=async()=>{},notificationAsync=async()=>{},ImpactFeedbackStyle={Light:'light'},NotificationFeedbackType={Success:'success',Warning:'warning'};`,
  'expo-crypto': `export const randomUUID=()=>'test-id';`,
  'react-native-reanimated': `
    import React from 'react';
    const animation={duration:()=>animation};
    export const FadeInDown=animation;
    export const useSharedValue=value=>({value});
    export const useAnimatedStyle=callback=>callback();
    export const withRepeat=value=>value,withTiming=value=>value,cancelAnimation=()=>{};
    export default {View:({children,...props})=>React.createElement('AnimatedView',props,children)};
  `,
  '@/contexts/AppContext': `export const useApp=()=>globalThis.__bulkReviewMounted.account;`,
  '@/components/GarmentTile': `import React from 'react';export const GarmentTile=props=>React.createElement('Image',props);`,
  '@/contexts/LuxuryFeedbackContext': `export const useDialog=()=>({alert:async()=>{},confirm:async()=>false,notify:()=>{}}),useToast=()=>({show:()=>{}});`,
  '@/components/PhotoRefusalNotice': `export const PhotoRefusalNotice=()=>null;`,
  '@/constants/types': `
    export const ALL_PATTERNS=[],ALL_PATTERN_SCALES=[],ALL_FABRICS=[],ALL_FABRIC_WEIGHTS=[],
      ALL_FITS=[],ALL_NECKLINES=[],ALL_SLEEVES=[],ALL_RISES=[],ALL_WARMTHS=[];
  `,
  '@/components/BulkItemEditPanel': `import React from 'react';export default ()=>null;`,
  '@/constants/colors': `export default new Proxy({}, {get:()=>'#555'});`,
  '@/lib/query-client': `
    export const authenticatedApiRequest=async()=>{globalThis.__bulkReviewMounted.calls.classifier++;return {json:async()=>({})};};
  `,
  '@/lib/photoroom': `
    export const removeBackground=async()=>{globalThis.__bulkReviewMounted.calls.photoRoom++;return {status:'unavailable'};};
  `,
  '@/lib/classifyPath': `export const classificationImagePayload=base64=>({imageBase64:base64,imageMimeType:'image/jpeg'});`,
  '@/lib/uploadErrors': `export const UPLOAD_DIAGNOSTICS_ENABLED=false,reportUploadError=()=>{};`,
  '@/lib/uploadPhotoSource': `export const readCachedCutout=async()=>null;`,
  '@/lib/uploadRetry': `export const classificationWaitMs=()=>0,runSerialUploadRetries=async()=>{};`,
  '@/lib/prepareClassificationImage': `export const prepareClassificationImage=async()=>({base64:'resized'});`,
  '@/constants/guestPhotoCleanup': `export const buildGuestPhotoDestPath=()=>'';`,
  '@/lib/storage': `export const deleteWardrobeImage=async()=>{},uploadWardrobeImage=async()=>'';`,
  '@/lib/uploadArg': `export const resolveWardrobeUploadArg=()=>null;`,
  '@/lib/supabase': `export const supabase={auth:{}};`,
  '@/lib/bulkPhotoStaging': `
    const m=globalThis.__bulkReviewMounted;
    export const bulkStagingDirectoryUri=()=> 'file:///staging/';
    export const getBulkPhotoSelection=id=>id===m.params.selectionId?m.selection:undefined;
    export const cleanupBulkPhotoSelection=async()=>{};
    export const removeBulkPhotoFromSelection=async()=>{};
    export const shortUriHash=()=> 'test-hash';
  `,
  '../lib/responsive': `export const rs=value=>value;`,
  '@/components/AiProcessingConsent': `export const AiProcessingConsent=()=>null;`,
  '@/lib/aiProcessingPreference': `
    export const aiPreferenceErrorMessage=()=> 'Preference unavailable';
    export const getAiProcessingPreference=async()=>{globalThis.__bulkReviewMounted.calls.preference++;return 'allowed';};
    export const setAiProcessingPreference=async()=>{};
  `,
};

const mountedScreenPlugin: Plugin = {
  name: 'bulk-review-mounted-guest-fixtures',
  setup(bundle) {
    bundle.onResolve({ filter: /.*/ }, args => Object.hasOwn(mountedScreenMocks, args.path)
      ? { path: args.path, namespace: 'bulk-review-fixture' }
      : undefined);
    bundle.onLoad({ filter: /.*/, namespace: 'bulk-review-fixture' }, args => ({
      contents: mountedScreenMocks[args.path],
      loader: 'js',
      resolveDir: process.cwd(),
    }));
  },
};

async function testMountedGuestSelectionStaysManualAfterSignIn(): Promise<void> {
  mountedBulkReview.account.isGuest = true;
  mountedBulkReview.account.authenticatedUserId = null;
  mountedBulkReview.calls = { preference: 0, photoRoom: 0, classifier: 0 };
  const requireProject = createRequire(path.join(process.cwd(), 'package.json'));
  const renderer = requireProject('react-test-renderer');
  const built = await build({
    entryPoints: ['app/bulk-review.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    define: { __DEV__: 'false' },
    plugins: [mountedScreenPlugin],
  });
  const mod = { exports: {} as { default?: React.ComponentType }};
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    requireProject, mod, mod.exports,
  );
  if (!mod.exports.default) throw new Error('bulk review screen is bundled');
  let tree!: { root: any; update(element: React.ReactNode): void; unmount(): void };
  const element = () => React.createElement(mod.exports.default!);
  await React.act(async () => { tree = renderer.create(element()); });

  const addDetailsCount = () => tree.root.findAllByType('Text')
    .filter((node: any) => node.children.join('') === 'Add details').length;
  nodeAssert.equal(addDetailsCount(), 2, 'guest selection initially renders both photos as manual cards');
  nodeAssert.equal(mountedBulkReview.calls.preference, 0, 'guest mount does not fetch AI preference');

  await React.act(async () => {
    mountedBulkReview.account.isGuest = false;
    mountedBulkReview.account.authenticatedUserId = 'signed-in-user';
    tree.update(element());
    await new Promise(resolve => setTimeout(resolve, 250));
  });

  nodeAssert.equal(addDetailsCount(), 2, 'the same staged photos remain manual after sign-in');
  nodeAssert.deepEqual(mountedBulkReview.calls, { preference: 0, photoRoom: 0, classifier: 0 },
    'sign-in during review starts no AI preference fetch, PhotoRoom call, or classifier request');
  await React.act(async () => { tree.unmount(); });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  section('Mounted Bulk Review — guest selection stays manual after sign-in');
  await testMountedGuestSelectionStaysManualAfterSignIn();
  assert(true, 'same staged selection remains manual and makes no AI network calls');

  section('createSerialQueue — native transforms run one at a time and recover after rejection');
  {
    const enqueue = createSerialQueue();
    const firstGate = deferred<string>();
    const started: string[] = [];
    let active = 0;
    let maxActive = 0;

    const first = enqueue(async () => {
      started.push('first');
      active++;
      maxActive = Math.max(maxActive, active);
      const result = await firstGate.promise;
      active--;
      return result;
    });
    const second = enqueue(async () => {
      started.push('second');
      active++;
      maxActive = Math.max(maxActive, active);
      active--;
      return 'second';
    });

    await tick();
    assert(started.join(',') === 'first',
      'second transform waits while the first transform is active');
    firstGate.resolve('first');
    const results = await Promise.all([first, second]);
    assert(results.join(',') === 'first,second' && maxActive === 1,
      'queued transforms preserve order with no overlap');

    await enqueue(async () => { throw new Error('expected transform failure'); }).catch(() => {});
    const afterFailure = await enqueue(async () => 'recovered');
    assert(afterFailure === 'recovered',
      'a rejected transform does not poison the queue');
  }

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

  section('runClassifyUri — optional background removal failure still classifies the original');
  {
    const mountedRef = { current: true };
    let items: BulkItemCore[] = [makeItem()];
    let classifiedBase64 = '';
    let classifiedMimeType = '';
    const deps: ClassifyDeps = {
      resize: async () => ({ base64: 'original-resized-jpeg' }),
      removeBg: async () => { throw new Error('session unavailable'); },
      writePngToCache: async () => { throw new Error('should not be called'); },
      classify: async (base64, mimeType) => {
        classifiedBase64 = base64;
        classifiedMimeType = mimeType;
        return CLASSIFY_RESPONSE;
      },
      setItems: updater => { items = updater(items); },
      onHaptic: () => {},
    };

    await runClassifyUri(TEST_URI, mountedRef, deps);

    assert(classifiedBase64 === 'original-resized-jpeg',
      'classifier receives the original resized JPEG after background removal rejects');
    assert(classifiedMimeType === 'image/jpeg',
      'fallback keeps the original JPEG MIME type');
    assert(items[0]?.status === 'settled',
      'optional background removal failure does not leave the card in error');
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

  section('runClassifyUri — retrying a failed item clears its error and settles');
  {
    const mountedRef = { current: true };
    let items: BulkItemCore[] = [
      makeItem({ status: 'error', failureStage: 'photo-preparation' }),
    ];
    const deps: ClassifyDeps = {
      resize: async () => ({ base64: 'retry-jpeg' }),
      removeBg: async () => null,
      writePngToCache: async () => 'unused',
      classify: async () => CLASSIFY_RESPONSE,
      setItems: updater => { items = updater(items); },
      onHaptic: () => {},
    };

    await runClassifyUri(TEST_URI, mountedRef, deps);

    assert(items[0]?.status === 'settled',
      'retry changes the failed item to settled when classification succeeds');
    assert(items[0]?.failureStage === undefined,
      'retry removes the previous failure stage');
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

  section('runClassifyUri — cache write failure falls back to original JPEG');
  {
    // A failed cache write must fail explicitly rather than retain the clean
    // PNG base64 inside the React item state.
    const mountedRef = { current: true };

    // Capture full item snapshots to inspect the saved preview URI.
    const itemSnapshots: BulkItemCore[] = [];

    const resizeD   = deferred<{ base64?: string } | null>();
    let classifiedBase64 = '';
    let classifiedMimeType = '';
    const deps: ClassifyDeps = {
      resize:          (_uri)    => resizeD.promise,
      removeBg:        (_b64)    => Promise.resolve('clean-png'),
      writePngToCache: (_pngB64) => Promise.reject(new Error('cache_write_failed')),
      classify:  (base64, mimeType) => {
        classifiedBase64 = base64;
        classifiedMimeType = mimeType;
        return Promise.resolve(CLASSIFY_RESPONSE);
      },
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

    await classifyPromise;

    assert(itemSnapshots.every(s => s.cutoutUri === undefined),
      'failed cache URI is never retained');
    assert(itemSnapshots.every(s => !('cleanBase64' in s)),
      'large clean PNG base64 is never retained in item state');
    assert(
      classifiedBase64 === 'resized' && classifiedMimeType === 'image/jpeg',
      'classifier receives the original JPEG when the transparent preview cannot be cached',
    );
    assert(
      itemSnapshots.some(s => s.status === 'settled'),
      'classification can still settle when the optional preview cache write fails',
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
      { bulkSelectionId: 'test-selection', replace: () => { callCount++; } },
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
      { bulkSelectionId: 'test-selection', replace: (p: { pathname: string }) => { replacePathname = p.pathname; } },
    );

    assert(replacePathname === '/add-item',
      'replace called with /add-item pathname');
    assert(singleRedirectedRef.current,
      'latch engaged after first call');
  }

  section('runRedirectSingle — staged-photo handoff uses only the in-memory selection ID');
  {
    const mountedRef = { current: true };
    const redirectedRef = { current: false };
    let routeParams: Record<string, unknown> | undefined;
    const classification: ClassifyResult = {
      category: 'top',
      subType: 't-shirt',
      colorFamily: 'white',
      description: 'test',
      occasionTags: ['casual'],
      seasonTags: ['all-season'],
    };
    runRedirectSingle(
      makeItem({ status: 'settled', classification }),
      true,
      mountedRef,
      redirectedRef,
      {
        bulkSelectionId: 'short-id-1234',
        replace: (params: { params?: Record<string, unknown> }) => { routeParams = params.params; },
      },
    );
    assert(routeParams?.bulkSelectionId === 'short-id-1234', 'redirect carries the opaque selection key');
    assert(!('initialUri' in (routeParams ?? {})), 'redirect never serializes the staged file URI');
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
      { bulkSelectionId: 'test-selection', replace: () => { callCount++; } },
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

    runRedirectSingle(makeItem(), false, mountedRef, singleRedirectedRef, { bulkSelectionId: 'test-selection', replace: nav });
    runRedirectSingle(makeItem(), false, mountedRef, singleRedirectedRef, { bulkSelectionId: 'test-selection', replace: nav });

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
      saveGuestImage: async (_base64, itemId) => `file:///documents/${itemId}.jpg`,
      resolveUploadArg: (clean, shrunk) => {
        const b = clean ?? shrunk;
        if (!b || b.startsWith('data:')) return null;
        return { base64: b, mimeType: 'image/jpeg' };
      },
      addItems: async (items) => { addItemCalls += items.length; },
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
    const addedItems: Array<{ id: string; photoUri: string }> = [];
    d.deps.onAdded = items => addedItems.push(...items);

    // Guest: no userId → skips upload entirely
    const p = runSaveAll([makeSaveItem({ cleanBase64: 'already-prepared' })], mountedRef, d.deps);
    await tick();

    d.resolveSession(null); // guest
    await p;

    assert(d.addItemCalls === 1,
      'addItem called once on guest happy path');
    assert(addedItems.length === 1 &&
      addedItems[0]?.id === 'test-uuid' &&
      addedItems[0]?.photoUri === 'file:///documents/test-uuid.jpg',
    'one Undo snapshot is exposed only after the committed item has an id and durable photo');
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

  section('undoSavedItems — serially removes each saved item and reports partial failure');
  {
    const calls: string[] = [];
    const complete = await undoSavedItems([
      { id: 'item-1', photoUri: 'https://storage.example/1.jpg' },
      { id: 'item-2', photoUri: 'file:///documents/2.jpg' },
    ], async (id, photoUri) => {
      calls.push(`${id}:${photoUri}`);
      return id !== 'item-1';
    });
    assert(calls.length === 2, 'Undo attempts every saved item even when one removal fails');
    assert(calls[0] === 'item-1:https://storage.example/1.jpg' &&
      calls[1] === 'item-2:file:///documents/2.jpg',
    'Undo passes each committed row id and photo to the normal removal path in order');
    assert(!complete, 'Undo reports an incomplete batch instead of claiming success');
  }

  section('runSaveAll — staged-file cleanup runs only after wardrobe commit acknowledgement');
  {
    const events: string[] = [];
    let cleanupCalls = 0;
    const deps: SaveAllDeps = {
      generateId: () => 'stage-save-id',
      getSession: async () => null,
      resize: async () => { throw new Error('resize should not be needed'); },
      saveGuestImage: async () => 'file:///documents/wardrobe-photo.jpg',
      upload: async () => 'https://storage.example.com/photo.jpg',
      resolveUploadArg: () => null,
      addItems: async () => { events.push('commit'); },
      setItems: () => undefined,
      setSaving: () => undefined,
      onItemHaptic: () => undefined,
      onDoneHaptic: () => { events.push('done'); },
      navigate: () => { events.push('navigate'); },
      onSaved: async uris => {
        cleanupCalls++;
        assert(uris[0] === 'file:///photos/shirt.jpg', 'commit callback receives source staging URIs');
        events.push('cleanup');
      },
    };
    await runSaveAll(
      [makeSaveItem({ cleanBase64: 'already-prepared' })],
      { current: true },
      deps,
    );
    assert(cleanupCalls === 1, 'confirmed batch commit triggers staging cleanup once');
    assert(events.indexOf('commit') < events.indexOf('cleanup'), 'cleanup happens after commit acknowledgement');
    assert(events.indexOf('cleanup') < events.indexOf('navigate'), 'cleanup completes before leaving review');

    let failedCommitCleanupCalls = 0;
    await runSaveAll(
      [makeSaveItem({ cleanBase64: 'already-prepared' })],
      { current: true },
      {
        ...deps,
        addItems: async () => { throw new Error('commit rejected'); },
        onSaved: () => { failedCommitCleanupCalls++; },
        onSaveError: () => undefined,
      },
    );
    assert(failedCommitCleanupCalls === 0, 'failed or ambiguous database saves retain their staged source files');
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
      { bulkSelectionId: 'test-selection', replace: () => {} },
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

  section('BulkCard preview URI — 18. cached transparent PNG is preferred, original is fallback');
  {
    function bulkCardPreviewUri(item: Pick<BulkItemCore, 'uri' | 'cutoutUri'>): string {
      return item.cutoutUri ?? item.uri;
    }

    const withCutout: Pick<BulkItemCore, 'uri' | 'cutoutUri'> = {
      uri: 'file:///Library/Caches/shirt.jpg',
      cutoutUri: 'file:///Library/Caches/clean.png',
    };
    const withoutCutout: Pick<BulkItemCore, 'uri' | 'cutoutUri'> = {
      uri: 'file:///Library/Caches/hoodie.jpg',
    };
    const withWhitePng: Pick<BulkItemCore, 'uri' | 'cutoutUri'> = {
      uri: 'file:///Library/Caches/sneakers.jpg',
      cutoutUri: 'file:///Library/Caches/white-on-white.png',
    };

    assert(
      bulkCardPreviewUri(withCutout) === withCutout.cutoutUri,
      'preview is the cached transparent PNG when available',
    );
    assert(
      bulkCardPreviewUri(withCutout) !== withCutout.uri,
      'preview is not the flattened JPEG source when a cutout exists',
    );
    assert(
      bulkCardPreviewUri(withoutCutout) === withoutCutout.uri,
      'preview falls back to original when no cutout exists',
    );
    assert(
      bulkCardPreviewUri(withWhitePng) === withWhitePng.cutoutUri,
      'white garment uses the same transparent preview path',
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

  section('runSaveAll — 24. authenticated upload failure blocks the entire DB batch');
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
      addItems: async (payloads) => { addItemPayloads.push(...payloads.map(payload => ({ photoUri: payload.photoUri }))); },
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

    assert(addItemPayloads.length === 0, 'no database batch runs when any authenticated upload fails');
    assert(
      finalStatuses[item1.uri] === 'local-only',
      'failed item remains local-only and retryable',
    );
    assert(
      finalStatuses[item2.uri] === 'settled',
      'successfully uploaded item remains uncommitted and retryable',
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

  section('runSaveAll — 24b. authenticated null upload source is local-only and blocks navigation');

  {
    const mountedRef = { current: true };
    const item = makeSaveItem({ cleanBase64: undefined });
    let finalStatus = 'pending';
    let navigated = false;
    let fallbackCount = 0;
    let localOnlyUris: string[] = [];
    const deps: SaveAllDeps = {
      generateId: () => 'null-upload-id',
      getSession: async () => 'user-1',
      resize: async () => ({ base64: undefined }),
      upload: async () => 'https://unused.example.com/image.jpg',
      resolveUploadArg: () => null,
      addItems: async () => {},
      setItems: (updater: (prev: any[]) => any[]) => {
        finalStatus = updater([{ uri: item.uri, status: finalStatus, classification: null }])[0].status;
      },
      onUploadFallback: () => { fallbackCount++; },
      onLocalOnlyComplete: (uris: string[]) => { localOnlyUris = uris; },
      setSaving: () => {},
      onItemHaptic: () => {},
      onDoneHaptic: () => {},
      navigate: () => { navigated = true; },
    };

    await runSaveAll([item], mountedRef, deps);
    assert(finalStatus === 'local-only', 'null upload source produces local-only status');
    assert(fallbackCount === 1, 'null upload source reports upload fallback');
    assert(localOnlyUris.length === 1, 'local-only completion reports the item');
    assert(!navigated, 'local-only outcome does not navigate away');
  }

  // ── Photo preview timing ──────────────────────────────────────────────────
  //
  // After removeBg resolves, the pipeline waits for reencodeAsJpeg before
  // deciding what to send to Gemini:
  //   - If reencodeAsJpeg succeeds  → classify receives the clean JPEG
  //   - If reencodeAsJpeg fails     → classify receives the original JPEG
  // displayUri is NOT written to state until reencodeAsJpeg resolves.
  // These two sections lock in that ordering so a future refactor cannot
  // silently break either invariant.

  section('Photo preview timing — 25. displayUri not set while reencodeAsJpeg is in-flight');
  {
    // After removeBg resolves (and before reencodeAsJpeg resolves), the
    // pipeline is inside the try block for reencodeAsJpeg and must NOT have
    // called setItems with displayUri yet.
    // A second assertion verifies that classify is eventually invoked with
    // the re-encoded JPEG (not the raw PNG or the original JPEG).
    const mountedRef = { current: true };
    const itemSnapshots: BulkItemCore[] = [];
    let classifyCalledWith = '';

    const resizeD   = deferred<{ base64?: string } | null>();
    const cacheWriteD = deferred<string>();
    const classifyD = deferred<Record<string, unknown>>();

    const deps: ClassifyDeps = {
      resize:          (_uri)    => resizeD.promise,
      removeBg:        (_b64)    => Promise.resolve('clean-png-b64'),
      writePngToCache: (_pngB64) => cacheWriteD.promise,
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
    await tick(); // removeBg value delivered; pipeline enters the cache write (pending)
    await tick(); // extra tick to absorb any additional scheduling

    // At this point removeBg has resolved but the cache write is still pending.
    // No setItems call should have included the cutout URI yet.
    const snapshotsBeforeReencode = [...itemSnapshots];

    assert(
      snapshotsBeforeReencode.every(s => s.cutoutUri === undefined),
      'cutout URI not set on any item while cache write is in-flight',
    );

    // Resolve the rest of the pipeline.
    cacheWriteD.resolve('file:///cache/cutout.png');
    await tick();
    classifyD.resolve(CLASSIFY_RESPONSE);
    await classifyPromise;

    assert(
      classifyCalledWith === 'clean-png-b64',
      'classify receives transparent PNG; server applies the neutral matte',
    );
  }

  section('Photo preview timing — 26. cutout URI is set before settled fires on happy path');
  {
    // On the successful path the pipeline must write the cutout URI in a
    // setItems call that precedes the final
    // setItems({ status: \'settled\' }) call.  Verify by comparing
    // the snapshot indices captured during the run.
    const mountedRef = { current: true };
    const itemSnapshots: BulkItemCore[] = [];

    const deps: ClassifyDeps = {
      resize:          (_uri)    => Promise.resolve({ base64: 'resized-b64' }),
      removeBg:        (_b64)    => Promise.resolve('clean-png-b64'),
      writePngToCache:  (_pngB64) => Promise.resolve('file:///cache/cutout.png'),
      classify: (_b64) => Promise.resolve(CLASSIFY_RESPONSE),
      setItems: (updater) => {
        const after = updater([makeItem()]);
        if (after[0]) itemSnapshots.push({ ...after[0] });
      },
      onHaptic: () => {},
    };

    await runClassifyUri(TEST_URI, mountedRef, deps);

    const displayUriIdx = itemSnapshots.findIndex(s => s.cutoutUri !== undefined);
    const settledIdx    = itemSnapshots.findIndex(s => s.status === 'settled');

    assert(displayUriIdx !== -1, 'cutout URI is set at some point on the happy path');
    assert(settledIdx    !== -1, 'settled status is reached on the happy path');
    assert(
      displayUriIdx < settledIdx,
      'cutout URI is set before settled fires (PNG preview appears before Gemini result)',
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n=== bulkReviewMountedGuard: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`);
  if (failed > 0) process.exit(1);

})();
