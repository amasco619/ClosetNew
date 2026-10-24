import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import type { WardrobeItem } from '../constants/types';
import { createGuestWardrobeMigration, type GuestMigrationRecord } from '../lib/guestWardrobeMigration';
import { MAX_STORAGE_UPLOAD_BYTES } from '../lib/storageUploadBounds';

async function main() {
  const small = Buffer.from('bounded synthetic JPEG/PNG output').toString('base64');
  const fixture = {
    width: 3000, height: 4500, savedWidth: 0, savedHeight: 0, failPrepare: false, failCopy: false,
    probes: [] as string[], writes: [] as { uri: string; base64: string }[],
    copies: [] as { from: string; to: string }[], deletes: [] as string[], formats: [] as string[],
  };
  Object.assign(globalThis, { __guestPhotoSave: fixture });
  const mocks: Record<string, string> = {
    'react-native': `const f=globalThis.__guestPhotoSave;
      export const Image={getSize:async uri=>{
        f.probes.push(uri);return uri.startsWith('file:///docs/')
          ? {width:f.savedWidth,height:f.savedHeight} : {width:f.width,height:f.height};
      }};`,
    'expo-file-system/legacy': `const f=globalThis.__guestPhotoSave;
      export const documentDirectory='file:///docs/',cacheDirectory='file:///cache/',EncodingType={Base64:'base64'};
      export const writeAsStringAsync=async(uri,base64)=>{f.writes.push({uri,base64});};
      export const copyAsync=async value=>{f.copies.push(value);if(f.failCopy)throw Error('copy failed');};
      export const deleteAsync=async uri=>{f.deletes.push(uri);};`,
    'expo-image-manipulator': `const f=globalThis.__guestPhotoSave;
      export const SaveFormat={JPEG:'jpeg',PNG:'png'};
      export const ImageManipulator={manipulate:uri=>{
        let width=f.width,height=f.height;
        return {release(){},resize(axis){
          const scale=(axis.width??axis.height)/Math.max(width,height);
          width=Math.round(width*scale);height=Math.round(height*scale);
        },async renderAsync(){
          if(Math.max(width,height)>1600)throw Error('unresized source render');
          if(f.failPrepare)throw Error('synthetic preparation failure');
          return {release(){},async saveAsync(options){
            f.formats.push(options.format);f.savedWidth=width;f.savedHeight=height;
            return {uri:'file:///cache/rendered',width,height,base64:${JSON.stringify(small)}};
          }};
        }};
      }};`,
  };
  const bundle = await build({
    entryPoints: ['lib/saveGuestPhoto.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'guest-save-native', setup(b) {
      b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path)
        ? { path: args.path, namespace: 'mock' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const mod = { exports: {} as typeof import('../lib/saveGuestPhoto') };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    createRequire(`${process.cwd()}/package.json`), mod, mod.exports);
  const source = 'file:///picker/large-original.jpg';
  const saved = await mod.exports.saveGuestPhoto(source, 'bounded', 'image/jpeg', { width: 3000, height: 4500 });
  assert.deepEqual(saved.localPhotoDimensions, { width: 1067, height: 1600 });
  assert.equal(saved.guestSyncNeedsManualRetry, undefined);
  assert.equal(fixture.probes.includes(source), false, 'new source uses saved picker dimensions');
  assert.equal(fixture.copies.length, 0, 'successful guest save never copies the original');
  assert(Buffer.from(fixture.writes.at(-1)!.base64, 'base64').length <= MAX_STORAGE_UPLOAD_BYTES);
  assert(fixture.writes.at(-1)!.uri.startsWith('file:///docs/'));
  const png = await mod.exports.saveGuestPhoto('file:///picker/cutout.png', 'cutout', 'image/png',
    { width: 999, height: 999 }, source);
  assert.deepEqual(png.localPhotoDimensions, { width: 1067, height: 1600 },
    'cutout dimensions come from its own metadata, not original-picker dimensions');
  assert.equal(fixture.formats.at(-1), 'png');
  assert.equal(fixture.probes.includes('file:///picker/cutout.png'), true);
  fixture.failPrepare = true;
  const retained = await mod.exports.saveGuestPhoto(source, 'retained', 'image/jpeg', { width: 3000, height: 4500 });
  assert.equal(retained.guestSyncNeedsManualRetry, true);
  assert.deepEqual(retained.localPhotoDimensions, { width: 3000, height: 4500 });
  assert.equal(fixture.copies.at(-1)!.from, source);
  fixture.failCopy = true;
  await assert.rejects(mod.exports.saveGuestPhoto(source, 'failed', 'image/jpeg', { width: 3000, height: 4500 }),
    /Could not save photo to device storage/);
  assert(!fixture.deletes.includes(source), 'neither preparation nor fallback failure deletes the original');
  assert(fixture.deletes.every(uri => uri.startsWith('file:///cache/') ||
    ['file:///docs/wardrobe_retained.jpg', 'file:///docs/wardrobe_failed.jpg'].includes(uri)),
  'only generated temporary/incomplete destinations are removed, never either source');

  // The save result's local-only high-risk flag becomes the existing manual state.
  let disk: GuestMigrationRecord[] = [];
  let prepares = 0;
  const migration = createGuestWardrobeMigration({
    read: async () => structuredClone(disk), write: async rows => { disk = structuredClone(rows); },
    newId: () => 'retained-id',
    snapshot: async () => ({ confirmedIds: [], activeCount: 0, totalCount: 0, premium: false }),
    prepare: async () => { prepares++; return small; },
    upload: async () => 'owner/retained.jpg',
    insert: async (_owner, rows) => rows.map(row => row.migrationId), confirmed: async () => {},
  });
  await migration.decide('owner', 'absorb');
  await migration.claim('owner', [{ ...retained, id: 'retained', createdAt: '2026-10-24' } as WardrobeItem]);
  assert.deepEqual(await migration.sync('owner', () => true), { pending: 1, failed: 1, capacity: false });
  assert.equal(prepares, 0, 'unbounded fallback does not start automatic preparation');
  await migration.clearPermanentFailures('owner');
  await migration.sync('owner', () => true);
  assert.equal(prepares, 1, 'manual retry explicitly permits preparation');
  const screen = readFileSync('app/add-item.tsx', 'utf8');
  assert.match(screen, /await saveGuestPhoto\([\s\S]*?photoWidth[\s\S]*?photoHeight/);
  assert.match(screen, /guestPhotoMetadata = \{[\s\S]*?localPhotoDimensions: saved.localPhotoDimensions/);
  assert.match(screen, /storagePath: finalStoragePath,\s*\.\.\.guestPhotoMetadata/);
  delete (globalThis as any).__guestPhotoSave;
  console.log('Guest save: real bounded adapter, dimensions before first render, PNG preservation, no original copy on success, safe fallback/manual-only sync and no deletion on failure passed (native mocks).');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
