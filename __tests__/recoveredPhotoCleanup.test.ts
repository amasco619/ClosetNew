import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';
import { wardrobeImageCleanupPaths } from '../lib/wardrobeImagePath';
import { parsePendingPhotoCleanups, retryPhotoCleanups } from '../constants/guestPhotoCleanup';

// Run production Storage code against an isolated synthetic bucket. No live
// credentials, real accounts or real photos are used by this test.
async function storageHarness() {
  const objects = new Set([
    'disposable-owner/original-row.jpg',
    'disposable-owner/replacement-photo.png',
    'disposable-owner/replacement-photo.jpg',
    'disposable-owner/unrelated.jpg',
    'other-disposable-owner/replacement-photo.png',
  ]);
  const removed: string[][] = [];
  let fail = false;
  const result = await build({
    entryPoints: ['lib/storage.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs',
    plugins: [{
      name: 'synthetic-storage',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export const supabase = dependencies.supabase;', loader: 'js',
        }));
      },
    }],
  });
  const module = { exports: {} as any };
  new Function('module', 'exports', 'require', 'dependencies', result.outputFiles[0].text)(
    module, module.exports, createRequire(import.meta.url), {
      supabase: { storage: { from: (bucket: string) => {
        assert.equal(bucket, 'wardrobe-images');
        return {
          remove: async (paths: string[]) => {
            removed.push(paths);
            if (fail) return { error: { message: 'Synthetic temporary outage' } };
            paths.forEach(path => objects.delete(path));
            return { error: null };
          },
        };
      } } },
    },
  );
  return { objects, removed, storage: module.exports, setFailure: (value: boolean) => { fail = value; } };
}

// Execute the actual AppContext callback with synthetic I/O, not a copied flow.
function removalHarness(storage: any, options: {
  path?: string; noRow?: boolean; dbFailure?: boolean; switchAccount?: boolean; failPhoto?: boolean;
} = {}) {
  const source = readFileSync('contexts/AppContext.tsx', 'utf8');
  const start = source.indexOf('const removeWardrobeItem =');
  const end = source.indexOf('const resolveOrphan =', start);
  const queued: any[] = [];
  const deletions: string[] = [];
  const code = `
    const { storage, options, queued, deletions } = dependencies;
    const useCallback = fn => fn;
    const profile = { isGuest: false }, isPremium = false, freeSelectedItemIds = [];
    const currentUserIdRef = { current: 'disposable-owner' };
    const accountGenerationRef = { current: 1 }, startupGenerationRef = { current: 1 };
    // The item is intentionally unloaded: deletion must use the DB photo.
    const wardrobeItemsRef = { current: [] };
    const wardrobeLoadedCountRef = { current: 0 }, wardrobeTotalCountRef = { current: 1 };
    const isCurrentAccountRequest = (id, a, s) =>
      id === currentUserIdRef.current && a === accountGenerationRef.current && s === startupGenerationRef.current;
    const deleteWardrobeItem = async (owner, id) => {
      deletions.push(id);
      if (options.dbFailure) throw new Error('Ambiguous database transport failure');
      if (options.switchAccount) currentUserIdRef.current = 'other-disposable-owner';
      return options.noRow ? null : { image_url: options.path ?? 'disposable-owner/replacement-photo.png' };
    };
    const deleteWardrobeImage = async (...args) => {
      if (options.failPhoto) throw new Error('Synthetic storage outage');
      await storage.deleteWardrobeImage(...args);
    };
    const rememberPhotoCleanup = async entry => { queued.push(entry); };
    const getWardrobeItems = async () => ({ totalCount: 0, items: [] });
    const getFreeWardrobeSelection = async () => [];
    const persistFreeWardrobeSelection = async () => {};
    const setWardrobeItems = () => {}, updateWardrobePagination = () => {}, setFreeSelectedItemIds = () => {};
    const console = { warn: () => {}, error: () => {} };
    ${source.slice(start, end)}
    return { removeWardrobeItem, queued, deletions };
  `;
  return new Function('dependencies', ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText)({ storage, options, queued, deletions });
}

async function main() {
  const bucket = await storageHarness();
  const h = removalHarness(bucket.storage);
  assert.equal(await h.removeWardrobeItem('original-row', ''), true);
  assert.deepEqual(bucket.removed, [['disposable-owner/replacement-photo.png']]);
  assert.equal(bucket.objects.has('disposable-owner/replacement-photo.png'), false);
  assert.equal(bucket.objects.size, 4, 'only the exact replacement object is removed');
  assert.ok(bucket.objects.has('disposable-owner/original-row.jpg'));
  assert.ok(bucket.objects.has('disposable-owner/replacement-photo.jpg'));
  assert.ok(bucket.objects.has('disposable-owner/unrelated.jpg'));
  assert.ok(bucket.objects.has('other-disposable-owner/replacement-photo.png'));
  const jpeg = removalHarness(bucket.storage, { path: 'disposable-owner/replacement-photo.jpg' });
  assert.equal(await jpeg.removeWardrobeItem('original-row'), true);
  assert.deepEqual(bucket.removed.at(-1), ['disposable-owner/replacement-photo.jpg']);

  const failed = removalHarness(bucket.storage, { failPhoto: true });
  assert.equal(await failed.removeWardrobeItem('original-row'), false);
  const pending = parsePendingPhotoCleanups(JSON.stringify(failed.queued));
  assert.deepEqual(pending, [{
    ownerKey: 'disposable-owner', itemId: 'original-row',
    storagePath: 'disposable-owner/replacement-photo.png',
  }]);
  const localDelete = async () => { throw new Error('Must not touch local photos'); };
  const deleteStorage = bucket.storage.deleteWardrobeImage;
  assert.deepEqual(await retryPhotoCleanups(pending, 'other-disposable-owner', null, localDelete, deleteStorage), pending);
  bucket.setFailure(true);
  assert.deepEqual(await retryPhotoCleanups(pending, 'disposable-owner', null, localDelete, deleteStorage), pending);
  bucket.setFailure(false);
  assert.deepEqual(await retryPhotoCleanups(pending, 'disposable-owner', null, localDelete, deleteStorage), []);
  assert.deepEqual(bucket.removed.at(-1), ['disposable-owner/replacement-photo.png']);

  const callsBefore = bucket.removed.length;
  for (const options of [{ dbFailure: true }, { noRow: true }, { switchAccount: true }]) {
    const guarded = removalHarness(bucket.storage, options);
    await guarded.removeWardrobeItem('original-row');
    assert.equal(guarded.queued.length, 0, 'uncertain delete or changed account never queues a photo');
  }
  const stale = removalHarness(bucket.storage);
  assert.equal(await stale.removeWardrobeItem('original-row', '', 'other-disposable-owner'), false);
  assert.deepEqual(stale.deletions, []);
  assert.equal(bucket.removed.length, callsBefore, 'no storage writes for unconfirmed or wrong-owner removal');

  for (const path of [
    'other-disposable-owner/replacement-photo.png', '../replacement-photo.png',
    'disposable-owner/../unrelated.jpg', 'disposable-owner/nested/photo.jpg',
    'disposable-owner/%2e%2e/photo.jpg', 'disposable-owner/photo.gif',
    'disposable-owner/photo.jpg?token=x', 'file:///photo.jpg', '',
    'https://example.test/storage/v1/object/public/wardrobe-images/other-disposable-owner/photo.jpg',
    'https://example.test/storage/v1/object/public/wardrobe-images/disposable-owner/../disposable-owner/photo.jpg',
  ]) {
    await assert.rejects(() => deleteStorage('disposable-owner', 'original-row', path));
    assert.deepEqual(parsePendingPhotoCleanups(JSON.stringify([{
      ownerKey: 'disposable-owner', itemId: 'original-row', storagePath: path,
    }])), [], 'invalid explicit paths must not fall back to row IDs');
  }
  assert.equal(bucket.removed.length, callsBefore);
  assert.deepEqual(wardrobeImageCleanupPaths('disposable-owner', 'legacy-row'), [
    'disposable-owner/legacy-row.jpg', 'disposable-owner/legacy-row.png',
  ]);
  for (const kind of ['public', 'sign']) {
    const url = `https://example.test/storage/v1/object/${kind}/wardrobe-images/disposable-owner/replacement-photo.png?token=synthetic`;
    assert.deepEqual(wardrobeImageCleanupPaths('disposable-owner', 'original-row', url),
      ['disposable-owner/replacement-photo.png']);
  }
  const legacy = parsePendingPhotoCleanups('[{"ownerKey":"disposable-owner","itemId":"legacy-row"}]');
  assert.deepEqual(await retryPhotoCleanups(legacy, 'disposable-owner', null, localDelete, deleteStorage), []);
  assert.deepEqual(bucket.removed.at(-1), [
    'disposable-owner/legacy-row.jpg', 'disposable-owner/legacy-row.png',
  ]);

  // Database deletion still scopes both row and owner, and returns the durable
  // path from the deleted row. Ambiguous/failed deletes never return a receipt.
  const db = readFileSync('lib/database.ts', 'utf8');
  const dbStart = db.indexOf('export async function deleteWardrobeItem(');
  const dbEnd = db.indexOf('export async function updateWardrobeItemAffinity', dbStart);
  assert.match(db.slice(dbStart, dbEnd),
    /\.delete\(\)[\s\S]*\.eq\('id', itemId\)[\s\S]*\.eq\('user_id', userId\)[\s\S]*\.select\('image_url'\)[\s\S]*\.maybeSingle\(\)/);
  const dbCode = ts.transpileModule(
    db.slice(dbStart, dbEnd).replace('export async function', 'async function') +
      '\nreturn deleteWardrobeItem;',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const dbCalls: unknown[] = [];
  const receipt = { image_url: 'disposable-owner/replacement-photo.png' };
  let dbResult: { data: typeof receipt | null; error: { message: string } | null } =
    { data: receipt, error: null };
  const query = {
    delete() { dbCalls.push('delete'); return this; },
    eq(column: string, value: string) { dbCalls.push([column, value]); return this; },
    select(columns: string) { dbCalls.push(['select', columns]); return this; },
    async maybeSingle() { return dbResult; },
  };
  const deleteRow = new Function('supabase', dbCode)({
    from: (table: string) => { assert.equal(table, 'wardrobe_items'); return query; },
  });
  assert.deepEqual(await deleteRow('disposable-owner', 'original-row'), receipt);
  assert.deepEqual(dbCalls, [
    'delete', ['id', 'original-row'], ['user_id', 'disposable-owner'], ['select', 'image_url'],
  ]);
  dbResult = { data: null, error: null };
  assert.equal(await deleteRow('disposable-owner', 'original-row'), null);
  dbResult = { data: receipt, error: { message: 'Synthetic ambiguous response' } };
  await assert.rejects(() => deleteRow('disposable-owner', 'original-row'), /Synthetic ambiguous response/);
  console.log('Recovered photo cleanup passed: exact synthetic object, retry round-trip, legacy paths, owner and ambiguous-delete guards.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
