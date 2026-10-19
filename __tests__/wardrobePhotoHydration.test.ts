import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';
import { hydrateWardrobePhoto, MissingWardrobePhotoError } from '../lib/wardrobePhotoHydration';
import { readCurrentEntitlement } from '../lib/entitlements';

// Execute the production callbacks with in-memory I/O, without bootstrapping
// Expo/auth. This exercises pagination and entitlement wiring, not a replica.
function refreshHarness(options: {
  resolve?: (path: string) => Promise<string>;
  queued?: boolean;
} = {}) {
  const resolver = {
    current: options.resolve ?? (async (path: string) => {
      if (path.includes('missing')) throw new MissingWardrobePhotoError('Object not found');
      throw new Error('Network request failed');
    }),
  };
  const source = readFileSync('contexts/AppContext.tsx', 'utf8');
  const block = (start: string, end: string) =>
    source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  const tokenStart = source.indexOf("if (event === 'TOKEN_REFRESHED'");
  const tokenEnd = source.indexOf('\n      }\n    );', tokenStart);
  const code = `
    const { hydrateWardrobePhoto, readCurrentEntitlement, resolver, queued } = dependencies;
    const useCallback = callback => callback;
    const currentUserIdRef = { current: 'owner' };
    const accountGenerationRef = { current: 1 };
    const startupGenerationRef = { current: 1 };
    const wardrobeCorrectionRevisionRef = { current: 0 };
    const wardrobeLoadPromiseRef = { current: null };
    const wardrobeLoadedCountRef = { current: 100 };
    const wardrobeTotalCountRef = { current: 102 };
    const isPremiumRef = { current: true };
    const firstPage = Array.from({ length: 100 }, (_, i) => ({
      id: 'item-' + i, photoUri: 'https://example.com/' + i,
    }));
    const laterPage = ['missing', 'transient'].map(id => ({
      id, photoUri: 'owner/' + id + '.jpg', storagePath: 'owner/' + id + '.jpg',
      description: 'Keep garment metadata', category: 'top',
    }));
    const state = { items: firstPage, orphans: [], selection: [], premium: true, unavailable: false };
    const wardrobeItemsRef = { current: firstPage };
    const updates = [];
    const setOrphanedItems = update => {
      if (queued) updates.push(update);
      else state.orphans = update(state.orphans);
    };
    const setWardrobeItems = update => {
      state.items = typeof update === 'function' ? update(state.items) : update;
      wardrobeItemsRef.current = state.items;
    };
    const setFreeSelectedItemIds = ids => { state.selection = ids; };
    const setIsPremium = value => { state.premium = value; };
    const setEntitlementUnavailable = value => { state.unavailable = value; };
    const reportError = () => { throw new Error('Unexpected entitlement failure'); };
    const warnings = [];
    const console = { warn: (...args) => warnings.push(args) };
    const resolveWardrobeImageUrl = path => resolver.current(path);
    const isCurrentStartupGeneration = (generation, current) => generation === current;
    const getWardrobeItems = async (userId, offset = 0) => ({
      totalCount: 102, items: offset === 0 ? firstPage : laterPage,
    });
    const getFreeWardrobeSelection = async () => ['missing', 'transient'];
    const getSelectedWardrobeItems = async (userId, ids) => laterPage.filter(item => ids.includes(item.id));
    const mapDbRowToWardrobeItem = row => ({ ...row });
    const fetchAuthoritativeEntitlement = async () => ({ isPremium: false, expiresAt: null });
    const updateWardrobePagination = (total, loaded) => {
      wardrobeTotalCountRef.current = total;
      wardrobeLoadedCountRef.current = loaded;
    };
    ${block('const isCurrentAccountRequest =', 'const readPendingPhotoCleanups =')}
    ${block('const refreshPremiumEntitlement =', 'const updateProfile =')}
    ${block('const loadMoreWardrobeItems =', 'const setFreeWardrobeSelection =')}
    let active = true;
    const timers = [];
    const pendingEntitlementTimers = new Set();
    const setTimeout = callback => { timers.push(callback); return callback; };
    const event = 'TOKEN_REFRESHED';
    const session = { user: { id: 'owner' } };
    const tokenRefresh = () => { ${source.slice(tokenStart, tokenEnd)} };
    return {
      state, warnings, currentUserIdRef, accountGenerationRef, startupGenerationRef,
      wardrobeCorrectionRevisionRef, wardrobeLoadedCountRef,
      loadMoreWardrobeItems, loadAllWardrobeItems, refreshPremiumEntitlement,
      tokenRefresh: () => { tokenRefresh(); timers.splice(0).forEach(callback => callback()); },
      flushUpdates: () => updates.splice(0).forEach(update => { state.orphans = update(state.orphans); }),
      setResolve: resolve => { resolver.current = resolve; },
    };
  `;
  const compiled = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function('dependencies', compiled)({
    hydrateWardrobePhoto, readCurrentEntitlement, queued: options.queued, resolver,
  });
}

async function checkLaterReads() {
  const flows = ['loadMoreWardrobeItems', 'loadAllWardrobeItems', 'refreshPremiumEntitlement', 'tokenRefresh'];
  const settle = () => new Promise(resolve => setImmediate(resolve));
  for (const flow of flows) {
    const harness = refreshHarness();
    await harness[flow]();
    await settle();
    assert.equal(harness.state.items.length, 102, `${flow}: preserve all garment records`);
    assert.deepEqual(harness.state.orphans.map((item: { id: string }) => item.id), ['missing'],
      `${flow}: recover only confirmed missing photos outside page one`);
    const missing = harness.state.items.find((item: { id: string }) => item.id === 'missing');
    assert.equal(missing.photoUri, '');
    assert.equal(missing.storagePath, 'owner/missing.jpg');
    assert.equal(missing.description, 'Keep garment metadata');
    const transient = harness.state.items.find((item: { id: string }) => item.id === 'transient');
    assert.equal(transient.photoUri, 'owner/transient.jpg');
    assert.equal(harness.warnings.length, 1, `${flow}: diagnose transient failures`);
    assert.equal(harness.state.unavailable, false, `${flow}: missing photos are not entitlement failures`);
    if (flow.includes('Entitlement') || flow === 'tokenRefresh') {
      assert.equal(harness.state.premium, false);
      assert.deepEqual(harness.state.selection, ['missing', 'transient']);
    } else {
      assert.equal(harness.wardrobeLoadedCountRef.current, 102, `${flow}: pagination advances normally`);
    }
    await harness.loadAllWardrobeItems();
    assert.equal(harness.state.orphans.length, 1, `${flow}: repeated discovery is deduplicated`);

    for (const invalidate of [
      (h: any) => { h.currentUserIdRef.current = null; },
      (h: any) => { h.currentUserIdRef.current = 'another-owner'; },
      (h: any) => { h.accountGenerationRef.current++; },
      (h: any) => { h.startupGenerationRef.current++; },
    ]) {
      const deferred = Promise.withResolvers<string>();
      const stale = refreshHarness({ resolve: () => deferred.promise });
      const pending = stale[flow]();
      await settle();
      invalidate(stale);
      deferred.reject(new MissingWardrobePhotoError('Object not found'));
      await pending;
      await settle();
      assert.equal(stale.state.orphans.length, 0, `${flow}: no stale recovery publication`);
      assert.equal(stale.state.items.length, 100, `${flow}: no stale wardrobe publication`);
    }

    const restoredDeferred = Promise.withResolvers<string>();
    const staleRestore = refreshHarness({ resolve: () => restoredDeferred.promise });
    staleRestore.state.orphans = [{ id: 'missing' }];
    const staleRestorePending = staleRestore[flow]();
    await settle();
    staleRestore.startupGenerationRef.current++;
    restoredDeferred.resolve('https://example.com/restored');
    await staleRestorePending;
    await settle();
    assert.deepEqual(staleRestore.state.orphans.map((item: { id: string }) => item.id), ['missing'],
      `${flow}: stale successful signing must not clear an existing warning`);

    const queued = refreshHarness({ queued: true });
    await queued[flow]();
    await settle();
    queued.startupGenerationRef.current++;
    queued.flushUpdates();
    assert.equal(queued.state.orphans.length, 0, `${flow}: updater rechecks ownership`);

    const healthy = refreshHarness({ resolve: async path => `https://example.com/${path}` });
    await healthy[flow]();
    await settle();
    assert.equal(healthy.state.orphans.length, 0, `${flow}: available photos need no recovery`);
    assert.equal(healthy.warnings.length, 0);
    assert.equal(healthy.state.items.find((item: { id: string }) => item.id === 'missing').photoUri,
      'https://example.com/owner/missing.jpg');
  }

  const deferred = Promise.withResolvers<string>();
  const corrected = refreshHarness({ resolve: () => deferred.promise });
  corrected.state.orphans = [{ id: 'missing' }];
  const pending = corrected.loadAllWardrobeItems();
  await settle();
  corrected.wardrobeCorrectionRevisionRef.current++;
  deferred.resolve('https://example.com/restored');
  await pending;
  assert.deepEqual(corrected.state.orphans.map((item: { id: string }) => item.id), ['missing'],
    'full refresh cannot clear recovery for a correction made while signing is pending');
  assert.equal(corrected.state.items.length, 100);

  for (const message of ['Unauthorized', 'Permission denied', 'Network request failed']) {
    const transient = refreshHarness({ resolve: async () => { throw new Error(message); } });
    await transient.loadAllWardrobeItems();
    assert.equal(transient.state.orphans.length, 0, `${message}: never a recovery candidate`);
    assert.equal(transient.warnings.length, 2);
  }
}

async function main() {
  await checkLaterReads();
  const missing = {
    id: 'existing-item', storagePath: 'owner/existing-item.jpg',
    photoUri: 'owner/existing-item.jpg', category: 'top', description: 'Keep my details',
  };
  const missingError = new MissingWardrobePhotoError('Wardrobe photo is no longer available');
  assert.equal(await hydrateWardrobePhoto(missing, async () => { throw missingError; }), true);
  assert.equal(missing.photoUri, '', 'missing paths are not rendered as image URLs');
  assert.equal(missing.storagePath, 'owner/existing-item.jpg', 'retain path for repair');
  assert.equal(missing.description, 'Keep my details');
  assert.equal(missing.id, 'existing-item');
  assert.equal(await hydrateWardrobePhoto(missing, async () => 'https://example.com/restored'), false);
  assert.equal(missing.photoUri, 'https://example.com/restored', 'a restored photo resolves normally');

  for (const message of ['Network request failed', 'Unauthorized', 'Permission denied']) {
    const error = new Error(message);
    await assert.rejects(hydrateWardrobePhoto(missing, async () => { throw error; }), error);
  }
  let called = false;
  const local = { photoUri: 'file:///guest.jpg' };
  assert.equal(await hydrateWardrobePhoto(local, async () => { called = true; return ''; }), false);
  assert.equal(called, false);
  assert.equal(local.photoUri, 'file:///guest.jpg');

  // Exercise the actual Storage response mapping without loading React Native or
  // contacting Supabase. Bundled helpers share the same error-class identity.
  const bundle = await build({
    stdin: {
      contents: `export { getSignedWardrobeUrl } from './lib/storage';
        export { hydrateWardrobePhoto } from './lib/wardrobePhotoHydration';
        export { supabase } from './lib/supabase';`,
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{
      name: 'stub-supabase',
      setup(builder) {
        builder.onResolve({ filter: /\/supabase$|^\.\/supabase$/ }, () => ({
          path: 'supabase', namespace: 'stub',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export const supabase = { storage: {} };', loader: 'js',
        }));
      },
    }],
  });
  const compiled = { exports: {} as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
    compiled, compiled.exports, createRequire(import.meta.url),
  );
  for (const [providerMessage, isMissing] of [
    ['Object not found', true], ['Unauthorized', false], ['Network request failed', false],
  ] as const) {
    compiled.exports.supabase.storage.from = () => ({
      createSignedUrl: async () => ({ data: null, error: { message: providerMessage } }),
    });
    const item = { photoUri: 'owner/missing.jpg', storagePath: 'owner/missing.jpg' };
    const pending = compiled.exports.hydrateWardrobePhoto(item, compiled.exports.getSignedWardrobeUrl);
    if (isMissing) {
      assert.equal(await pending, true);
      assert.equal(item.photoUri, '');
    } else {
      await assert.rejects(pending, new RegExp(providerMessage));
    }
  }

  const restored = refreshHarness();
  await restored.loadAllWardrobeItems();
  assert.deepEqual(restored.state.orphans.map((item: { id: string }) => item.id), ['missing']);
  restored.state.orphans = [...restored.state.orphans, { id: 'transient' }];
  restored.setResolve(async (path: string) => {
    if (path.includes('missing')) return `https://example.com/${path}`;
    throw new Error('Network request failed');
  });
  await restored.loadAllWardrobeItems();
  assert.deepEqual(restored.state.orphans.map((item: { id: string }) => item.id), ['transient'],
    'successful signing clears the resolved warning but transient failures remain unresolved');

  const context = readFileSync('contexts/AppContext.tsx', 'utf8');
  const start = context.indexOf('const storagePathItems =');
  const end = context.indexOf('updateWardrobePagination', start);
  const hydration = context.slice(start, end);
  assert.match(hydration, /await hydrateWardrobePhotos\(\s*storagePathItems,/);
  assert.match(hydration, /assertCurrent\(\);\s*setWardrobeItems\(mapped\);/,
    'late startup responses must pass existing account/startup guards before publishing the wardrobe');
  const helperStart = context.indexOf('const hydrateWardrobePhotos =');
  const helperEnd = context.indexOf('const readPendingPhotoCleanups =', helperStart);
  const helper = context.slice(helperStart, helperEnd);
  assert(helper.indexOf('if (!isCurrent()') < helper.indexOf('setOrphanedItems('),
    'late responses must pass existing account/startup and correction guards before publishing recovery UI');
  assert.match(helper, /resolved\.filter\(id => !missingIds\.has\(id\)\)/,
    'only successfully resolved IDs clear warnings, while confirmed missing IDs remain');
  assert.doesNotMatch(hydration, /deleteWardrobe|uploadWardrobe|\.remove\(|\.insert\(/,
    'hydrating a missing photo must not mutate cloud data');
  console.log('Wardrobe photo hydration: initial/page/full/manual/token recovery, available photos, deduplication, preserved metadata, transient diagnostics and deferred ownership/correction guards passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
