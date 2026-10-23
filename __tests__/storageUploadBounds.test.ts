import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import {
  MAX_STORAGE_UPLOAD_BYTES, MAX_STORAGE_IMAGE_EDGE, PermanentStorageUploadError,
  base64ByteLength, prepareBoundedStorageImage, storageUploadFailureKind,
} from '../lib/storageUploadBounds';
import { runSaveAll, type BulkItemCore, type SaveAllDeps } from '../lib/bulkClassifyCore';
import { createGuestWardrobeMigration, type GuestMigrationRecord } from '../lib/guestWardrobeMigration';
import { selectPendingGuestWardrobeItems } from '../lib/guestWardrobePresentation';
import type { WardrobeItem } from '../constants/types';

const classification = {
  category: 'top' as const, subType: 't-shirt', colorFamily: 'grey',
  description: 'Grey T-shirt', occasionTags: [], seasonTags: [],
};
const small = Buffer.from('synthetic image bytes').toString('base64');
const exact = Buffer.alloc(MAX_STORAGE_UPLOAD_BYTES).toString('base64');
const over = Buffer.alloc(MAX_STORAGE_UPLOAD_BYTES + 1).toString('base64');

async function main() {
  assert.equal(MAX_STORAGE_UPLOAD_BYTES, 6_000_000);
  assert.equal(MAX_STORAGE_IMAGE_EDGE, 1600);
  for (const value of ['', 'a', 'ab', 'abc']) {
    assert.equal(base64ByteLength(Buffer.from(value).toString('base64')), value.length);
  }
  assert.equal(base64ByteLength(`data:image/jpeg;base64,${small}`), 21);
  assert.equal(await prepareBoundedStorageImage('image/jpeg',
    async () => ({ base64: exact, width: 1600, height: 1200 })), exact);
  const qualities: number[] = [];
  await prepareBoundedStorageImage('image/jpeg', async quality => {
    qualities.push(quality);
    return { base64: quality > 0.55 ? over : small, width: 1000, height: 1600 };
  });
  assert.deepEqual(qualities, [0.85, 0.7, 0.55]);
  for (const mime of ['image/jpeg', 'image/png'] as const) {
    let calls = 0;
    await assert.rejects(() => prepareBoundedStorageImage(mime, async () => {
      calls++; return { base64: over, width: 1600, height: 1600 };
    }), error => error instanceof PermanentStorageUploadError && /6 MB/.test(error.message));
    assert.equal(calls, mime === 'image/jpeg' ? 4 : 1, 'PNG is not flattened to JPEG or endlessly recompressed');
  }
  for (const image of [
    { base64: small, width: 1601, height: 1 },
    { base64: small, width: 1, height: 1601 },
    { base64: '', width: 100, height: 100 },
  ]) {
    await assert.rejects(() => prepareBoundedStorageImage('image/jpeg', async () => image),
      PermanentStorageUploadError);
  }
  assert.equal(storageUploadFailureKind({ statusCode: '413' }), 'too-large');
  assert.equal(storageUploadFailureKind({ status: 415 }), 'unsupported');
  for (const status of [408, 429, 500, 503]) assert.equal(storageUploadFailureKind({ status }), null);

  // Exercise the real upload boundary and native adapter with synthetic codecs;
  // there is no Supabase connection and no device/user image in this test.
  const fixture = {
    width: 3000, height: 4500, output: small,
    uploads: [] as any[], encodes: [] as any[], resizes: [] as any[],
    writes: [] as string[], deletes: [] as string[], error: null as any,
  };
  Object.assign(globalThis, { __storageUploadBounds: fixture });
  const mocks: Record<string, string> = {
    './supabase': `const f=globalThis.__storageUploadBounds;
      export const supabase={storage:{from:bucket=>({
        upload:async(path,body,options)=>{f.uploads.push({bucket,path,bytes:body.byteLength,options});return {error:f.error};},
        createSignedUrl:async()=>({data:{signedUrl:'https://synthetic.test/photo'},error:null}),
      })}};`,
    'expo-file-system/legacy': `const f=globalThis.__storageUploadBounds;
      export const cacheDirectory='file:///cache/',EncodingType={Base64:'base64'};
      export const writeAsStringAsync=async(uri)=>{f.writes.push(uri);};
      export const deleteAsync=async(uri)=>{f.deletes.push(uri);};`,
    'expo-image-manipulator': `const f=globalThis.__storageUploadBounds;
      export const SaveFormat={JPEG:'jpeg',PNG:'png'};
      export const ImageManipulator={manipulate:uri=>{
        let width=f.width,height=f.height;
        return {release(){},resize(size){
          f.resizes.push(size); const scale=(size.width??size.height)/(size.width?width:height);
          width=Math.round(width*scale);height=Math.round(height*scale);
        },renderAsync:async()=>({width,height,release(){},saveAsync:async options=>{
          f.encodes.push({uri,...options});
          return {uri:'file:///cache/output',base64:f.output,width,height};
        }})};
      }};`,
  };
  const bundled = await build({
    entryPoints: ['lib/storage.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'synthetic-storage', setup(b) {
      b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path)
        ? { path: args.path, namespace: 'mock' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const mod = { exports: {} as any };
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(
    createRequire(`${process.cwd()}/package.json`), mod, mod.exports);
  for (const path of ['single', 'bulk', 'multi-crop', 'guest-sync', 'cached-cutout']) {
    fixture.resizes = []; fixture.encodes = [];
    const mime = path === 'cached-cutout' ? 'image/png' : 'image/jpeg';
    await mod.exports.uploadWardrobeImage('owner', small, path, mime, `file:///local/${path}`);
    const upload = fixture.uploads.at(-1);
    assert.equal(upload.bucket, 'wardrobe-images');
    assert.equal(upload.options.contentType, mime);
    assert(upload.bytes <= MAX_STORAGE_UPLOAD_BYTES);
    assert.deepEqual(fixture.resizes, [{ height: 1600 }], `${path}: portrait longest edge, not width, is capped`);
    assert.equal(fixture.encodes[0].format, mime === 'image/png' ? 'png' : 'jpeg');
    assert(!fixture.deletes.some(uri => uri.startsWith('file:///local/')), 'selected/local originals are retained');
  }
  fixture.width = 600; fixture.height = 900; fixture.resizes = [];
  await mod.exports.uploadTryonPhoto('owner', small);
  assert.equal(fixture.uploads.at(-1).bucket, 'tryon-photos');
  assert.equal(fixture.uploads.at(-1).options.contentType, 'image/jpeg');
  assert.equal(fixture.resizes.length, 0, 'small images are never upscaled');
  assert(fixture.writes.some(uri => /amodka-storage-/.test(uri)));
  assert(fixture.writes.every(uri => fixture.deletes.includes(uri)), 'base64-only temporary input is cleaned');
  const beforeReject = fixture.uploads.length;
  fixture.output = over;
  await assert.rejects(() => mod.exports.uploadWardrobeImage('owner', small, 'too-large', 'image/png', 'file:///local/png'),
    (error: any) => error.permanent && error.kind === 'too-large');
  assert.equal(fixture.uploads.length, beforeReject, 'oversized cutouts never reach Storage');
  fixture.output = small;
  for (const status of [413, 415]) {
    fixture.error = { statusCode: String(status), message: 'synthetic rejection' };
    await assert.rejects(() => mod.exports.uploadWardrobeImage('owner', small, `reject-${status}`),
      (error: any) => error.permanent === true);
  }
  fixture.error = null;
  delete (globalThis as any).__storageUploadBounds;

  // Both bulk and multi-item save use runSaveAll; cutout/original source URIs
  // must survive this layer so the shared codec can inspect true dimensions.
  let bulk: BulkItemCore[] = [{ uri: 'file:///original', cutoutUri: 'file:///cutout', status: 'settled', classification }];
  let attempts = 0; let commits = 0; let surfaced = '';
  const deps: SaveAllDeps = {
    generateId: () => 'item', getSession: async () => 'owner', resize: async () => ({ base64: small }),
    readPngBase64: async () => small, resolveUploadArg: clean => ({ base64: clean!, mimeType: 'image/png' }),
    upload: async (_owner, _data, _id, _mime, uri) => {
      assert.equal(uri, 'file:///cutout'); attempts++;
      if (attempts === 1) throw { status: 413 };
      return 'https://synthetic.test/photo';
    },
    setItems: update => { bulk = update(bulk); }, setSaving: () => {},
    addItems: async () => { commits++; }, onItemHaptic: () => {}, onDoneHaptic: () => {}, navigate: () => {},
    onLocalOnlyComplete: (_uris, message) => { surfaced = message ?? ''; },
  };
  await runSaveAll([{ ...bulk[0], classification }], { current: true }, deps);
  assert.equal(attempts, 1);
  assert.equal(commits, 0);
  assert.equal(bulk[0].status, 'local-only');
  assert.match(bulk[0].uploadError!, /6 MB/);
  assert.match(surfaced, /6 MB/);
  assert.equal(bulk[0].uri, 'file:///original');
  await runSaveAll([{ ...bulk[0], classification }], { current: true }, deps);
  assert.equal(attempts, 2, 'only a second explicit save retries the failed bulk upload');
  assert.equal(commits, 1);
  assert.equal(bulk[0].uploadError, undefined);

  const garment = { id: 'guest-piece', photoUri: 'file:///docs/wardrobe_guest-piece.jpg',
    createdAt: '2026-10-23', ...classification } as unknown as WardrobeItem;
  let journal: GuestMigrationRecord[] = [];
  let guestAttempts = 0; let confirmed = 0; let rejectGuest = true;
  const guestDeps = {
    read: async () => structuredClone(journal),
    write: async (rows: GuestMigrationRecord[]) => { journal = structuredClone(rows); },
    newId: () => 'migration-id',
    snapshot: async () => ({ confirmedIds: [], activeCount: 0, totalCount: 0, premium: false }),
    upload: async () => { guestAttempts++; if (rejectGuest) throw { statusCode: '415' }; return 'owner/photo.jpg'; },
    insert: async (_owner: string, entries: any[]) => entries.map(entry => entry.migrationId),
    confirmed: async () => { confirmed++; },
  };
  const migration = createGuestWardrobeMigration(guestDeps);
  await migration.decide('owner', 'absorb');
  await migration.claim('owner', [garment]);
  assert.deepEqual(await migration.sync('owner', () => true), { pending: 1, capacity: false, failed: 1 });
  const failed = selectPendingGuestWardrobeItems(await migration.list(), 'owner', new Set());
  assert.match(failed[0].uploadError!, /JPEG or PNG/);
  assert.equal(failed[0].item.photoUri, garment.photoUri);
  assert.equal(confirmed, 0, 'rejected guest photos are not confirmed or reclaimed');
  await createGuestWardrobeMigration(guestDeps).sync('owner', () => true);
  assert.equal(guestAttempts, 1, 'a persisted permanent failure survives restart and is skipped automatically');
  await migration.clearPermanentFailures('another-owner');
  await migration.sync('owner', () => true);
  assert.equal(guestAttempts, 1);
  rejectGuest = false;
  await migration.clearPermanentFailures('owner');
  assert.deepEqual(await migration.sync('owner', () => true), { pending: 0, capacity: false, failed: 0 });
  assert.equal(guestAttempts, 2);

  // Call-site contracts cover all screens/adapters in addition to the real
  // boundary tests above; no upload may bypass the common Storage helper.
  assert.match(readFileSync('app/add-item.tsx', 'utf8'), /cachedCutout \? photoUri : uploadSourceUri/);
  for (const file of ['app/bulk-review.tsx', 'app/multi-item-review.tsx']) {
    assert.match(readFileSync(file, 'utf8'), /uploadWardrobeImage\([\s\S]*?sourceUri/);
  }
  assert.match(readFileSync('lib/guestWardrobeSync.ts', 'utf8'), /image\/jpeg', uri/);
  assert.match(readFileSync('app/(tabs)/wardrobe.tsx', 'utf8'), /Retry failed uploads/);
  console.log('Storage bounds: helper, all six upload paths, PNG transparency, exact byte cap, permanent rejection and manual retry proofs passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
