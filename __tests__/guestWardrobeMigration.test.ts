import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { clearAccountDeviceData } from '../constants/accountDeletionCleanup';
import type { WardrobeItem } from '../constants/types';
import {
  createGuestWardrobeMigration,
  getReclaimableGuestPhotoSources,
  isGuestMigrationEntry,
  planGuestMigration,
  type GuestMigrationEntry,
  type GuestMigrationRecord,
} from '../lib/guestWardrobeMigration';

const item = (n: number): WardrobeItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  createdAt: `2026-10-${String(n).padStart(2, '0')}T00:00:00Z`,
  photoUri: `file:///docs/wardrobe_${n}.jpg`, category: 'top',
  subType: 't-shirt', colorFamily: 'grey', seasonTags: ['all-season'], occasionTags: ['casual'],
});
const record = (n: number, ownerId = 'a'): GuestMigrationEntry => ({
  ownerId, migrationId: item(n).id, item: item(n), synced: false, announced: false,
});

async function main() {
  const snapshot = { confirmedIds: [], activeCount: 28, totalCount: 80, premium: false };
  const plan = planGuestMigration([record(3), record(1), record(2), record(4, 'b')], 'a', snapshot);
  assert.deepEqual(plan.transfer.map(entry => entry.item.id), [item(1).id, item(2).id]);
  assert.deepEqual(plan.retained.map(entry => entry.item.id), [item(3).id]);
  assert.equal(planGuestMigration([record(1)], 'a', { ...snapshot, activeCount: 30 }).transfer.length, 0);
  assert.equal(planGuestMigration([record(1)], 'a', { ...snapshot, activeCount: 35 }).transfer.length, 0);
  assert.equal(planGuestMigration([record(1), record(2)], 'a', { ...snapshot, premium: true, totalCount: 1999 }).transfer.length, 1);
  assert.equal(planGuestMigration([record(1)], 'a', { ...snapshot, confirmedIds: [item(1).id], activeCount: 30 }).confirmed.length, 1);
  const done = record(1); done.synced = true;
  assert.equal(planGuestMigration([done], 'a', snapshot).transfer.length, 0);

  let disk: GuestMigrationRecord[] = [];
  const savedEntry = (ownerId: string, id: string) => disk.find((entry): entry is GuestMigrationEntry =>
    isGuestMigrationEntry(entry) && entry.ownerId === ownerId && entry.migrationId === id,
  );
  const cloud = new Set<string>();
  const uploads: string[] = [];
  const inserts: string[][] = [];
  let activeCount = 27;
  let failUpload = item(2).id;
  let loseInsertResponse = false;
  let current = true;
  const confirmed: string[] = [];
  const deps = {
    read: async () => JSON.parse(JSON.stringify(disk)) as GuestMigrationRecord[],
    write: async (entries: GuestMigrationRecord[]) => { disk = JSON.parse(JSON.stringify(entries)); },
    newId: () => item(9).id,
    snapshot: async () => ({ ...snapshot, activeCount, confirmedIds: [...cloud] }),
    prepare: async () => 'bounded-photo',
    upload: async (owner: string, entry: GuestMigrationEntry) => {
      uploads.push(entry.migrationId);
      if (entry.migrationId === failUpload) throw new Error('offline file read');
      return `${owner}/${entry.migrationId}.jpg`;
    },
    insert: async (_owner: string, entries: GuestMigrationEntry[]) => {
      assert.ok(entries.every(entry => !cloud.has(entry.migrationId)), 'retry never reinserts confirmed IDs');
      const ids = entries.map(entry => entry.migrationId);
      inserts.push(ids);
      ids.forEach(id => cloud.add(id));
      activeCount += ids.length;
      if (loseInsertResponse) throw new Error('lost acknowledgement after commit');
      return ids;
    },
    confirmed: async (entry: GuestMigrationEntry) => { confirmed.push(entry.item.id); },
  };
  let migration = createGuestWardrobeMigration(deps);
  assert.equal(await migration.decide('a', 'absorb'), 'absorb');
  assert.equal(await migration.decide('a', 'discard'), 'absorb', 'the first disposition is durable and never overwritten');
  await migration.decide('b', 'absorb');
  await migration.claim('a', [item(3), item(1), item(2)]);
  await migration.claim('b', [item(1), item(2), item(3)]);
  assert.equal(disk.filter(isGuestMigrationEntry).length, 3);
  assert.ok(disk.filter(isGuestMigrationEntry).every(entry => entry.ownerId === 'a'), 'guest claim cannot be rebound to another account');
  assert.equal((await migration.sync('b', () => true))!.pending, 0);
  assert.deepEqual(uploads, []);
  assert.equal((await migration.sync('a', () => true))!.pending, 1);
  assert.equal(await migration.completeDecision('a'), false, 'the disposition remains durable while any guest row is pending');
  assert.deepEqual(inserts, [[item(1).id, item(3).id]], 'uploads that succeed use the existing batch insert');
  assert.equal(savedEntry('a', item(2).id)?.synced, false);
  assert.deepEqual(confirmed, [item(1).id, item(3).id], 'no failed upload is cleared/confirmed');
  assert.deepEqual(
    getReclaimableGuestPhotoSources(disk, 'a').map(entry => entry.item.id).sort(),
    [item(1).id, item(3).id].sort(),
    'only row-confirmed sources are eligible; pending originals stay untouched',
  );
  assert.deepEqual(getReclaimableGuestPhotoSources(disk, 'b'), [], 'source cleanup is owner-bound');
  assert.equal(await migration.takeNotice('a'), 2);
  assert.equal(await migration.takeNotice('a'), 0, 'notice is persisted at most once');

  await migration.decide('existing', 'discard');
  await migration.claim('existing', [item(8)]);
  assert.equal(disk.filter((entry): entry is GuestMigrationEntry =>
    isGuestMigrationEntry(entry) && entry.ownerId === 'existing',
  ).length, 0, 'confirmed existing accounts never receive guest item claims');
  disk.push(record(8, 'existing')); // a pending row left by a pre-decision app version
  const discardPhotos = await migration.discardOwner('existing');
  assert.deepEqual(discardPhotos, [item(8).photoUri]);
  assert.equal(await migration.getDecision('existing'), 'discard', 'discard cleanup retains the one-time decision');
  const discardedFiles: string[] = [];
  await clearAccountDeviceData({
    removeStorageKeys: async () => undefined,
    photoUris: discardPhotos,
    documentDirectory: 'file:///docs/',
    deleteAsync: async uri => { discardedFiles.push(uri); },
    clearSignedPhotoCache: () => undefined,
  });
  assert.deepEqual(discardedFiles, discardPhotos, 'existing-account discard uses the managed local photo cleanup');
  assert.equal(await migration.completeDecision('existing'), true);

  // Restart the controller with the same durable journal; retry uses the same ID.
  migration = createGuestWardrobeMigration(deps);
  failUpload = '';
  loseInsertResponse = true;
  await migration.sync('a', () => true);
  assert.equal(savedEntry('a', item(2).id)!.synced, false);
  assert.ok(!getReclaimableGuestPhotoSources(disk, 'a').some(entry => entry.item.id === item(2).id),
    'ambiguous insert acknowledgement never makes its source eligible for deletion');
  assert.ok(savedEntry('a', item(2).id)!.storagePath);
  const beforeRetry = uploads.length;
  loseInsertResponse = false;
  migration = createGuestWardrobeMigration(deps);
  const recovered = await migration.sync('a', () => true);
  assert.equal(recovered!.pending, 0);
  assert.equal(await migration.completeDecision('a'), true, 'a completed migration releases its decision for a later guest session');
  assert.equal(uploads.length, beforeRetry, 'ambiguous committed row is reconciled without another upload');
  assert.equal(cloud.size, 3);
  assert.equal(await migration.takeNotice('a'), 1);
  await migration.claim('b', [item(1)]);
  assert.equal(disk.filter((entry): entry is GuestMigrationEntry =>
    isGuestMigrationEntry(entry) && entry.ownerId === 'b',
  ).length, 0, 'synced tombstones stop duplicate cross-account claims');

  // Full account retains untouched local entries, then retries after room opens.
  await migration.decide('a', 'absorb');
  await migration.claim('a', [item(4)]);
  const full = await migration.sync('a', () => true);
  assert.deepEqual(full, { pending: 1, capacity: true, failed: 0 });
  activeCount = 29;
  const guarded = createGuestWardrobeMigration({
    ...deps, upload: async (owner, entry) => { current = false; return `${owner}/${entry.migrationId}.jpg`; },
  });
  const insertsBefore = inserts.length;
  await guarded.sync('a', () => current);
  assert.equal(inserts.length, insertsBefore, 'account switch after upload prevents database insert');
  assert.equal(savedEntry('a', item(4).id)!.synced, false);
  current = true;
  await migration.sync('a', () => current);
  assert.equal(savedEntry('a', item(4).id)!.synced, true);
  await migration.markSourceReclaimed('a', item(1).id);
  assert.equal(savedEntry('a', item(1).id)!.sourceReclaimed, true);
  await migration.markSourceReclaimed('b', item(1).id);
  assert.equal(savedEntry('a', item(1).id)!.sourceReclaimed, true,
    'another account cannot mark an owned tombstone reclaimed');
  await migration.claim('b', [item(5)]);
  const accountAOriginals = await migration.removeOwner('a');
  assert.ok(accountAOriginals.includes(item(1).photoUri), 'account deletion receives the owned original for local cleanup');
  assert.ok(disk.every(entry => entry.ownerId !== 'a') && disk.some(entry => entry.ownerId === 'b'),
    'account deletion removes that owner’s claim and preserves another owner’s pending work');
  const deletedAccountPhotos: string[] = [];
  await clearAccountDeviceData({
    removeStorageKeys: async () => undefined,
    photoUris: accountAOriginals,
    documentDirectory: 'file:///docs/',
    deleteAsync: async uri => { deletedAccountPhotos.push(uri); },
    clearSignedPhotoCache: () => undefined,
  });
  assert.deepEqual(deletedAccountPhotos.sort(), accountAOriginals.sort(),
    'account deletion uses the managed-file guard for only the removed owner’s tombstone sources');

  const offline = createGuestWardrobeMigration({
    ...deps, snapshot: async () => { throw new Error('service unavailable'); },
  });
  const beforeOffline = JSON.stringify(disk);
  assert.deepEqual(await offline.sync('b', () => true), { pending: 1, capacity: false, failed: 0 });
  assert.equal(JSON.stringify(disk), beforeOffline, 'an outage neither clears nor falsely confirms a pending item');
  const blocked = createGuestWardrobeMigration({
    ...deps, write: async () => { throw new Error('disk unavailable'); },
  });
  await assert.rejects(() => blocked.claim('a', [item(6)]), /disk unavailable/);
  assert.equal(JSON.stringify(disk), beforeOffline, 'failed durable claim cannot destroy the guest source');
  const readsBefore = inserts.length;
  await migration.sync('b', () => false);
  assert.equal(inserts.length, readsBefore, 'a stale account cannot begin work');

  // The account decision is persisted before any guest claim/profile write.
  const source = readFileSync('contexts/AppContext.tsx', 'utf8');
  const disposition = source.indexOf('decideGuestDataDisposition(dbProfile, wardrobePage.totalCount)');
  const claim = source.indexOf('await guestWardrobeSync.claim(userId, cachedGuestItems');
  const profileWrite = source.indexOf('await upsertUserProfile({', source.indexOf('const loadUserDataFromDB'));
  assert.ok(disposition >= 0 && claim > disposition && profileWrite > disposition,
    'server snapshot disposition is decided before guest claim and profile writes');

  // Exercise the production adapter with stubbed Supabase/storage/file services.
  // Any accidental provider dependency becomes a throwing stub, not a live call.
  const fixture = {
    disk: new Map<string, string>(), rows: [] as any[], ai: 0, uploads: [] as string[], activeOwner: 'a',
    preparedUris: [] as string[], fullFileReads: 0,
  };
  Object.assign(globalThis, { __guestSyncTest: fixture });
  const mocks: Record<string, string> = {
    '@react-native-async-storage/async-storage': `const m=globalThis.__guestSyncTest; export default {getItem:async k=>m.disk.get(k)??null,setItem:async(k,v)=>{m.disk.set(k,v);}};`,
    'expo-crypto': `export const randomUUID=()=> '00000000-0000-4000-8000-000000000009';`,
    'expo-file-system/legacy': `export const documentDirectory='file:///docs/',EncodingType={Base64:'base64'};
      export const readAsStringAsync=async()=>{globalThis.__guestSyncTest.fullFileReads++;throw Error('Original Base64 allocation prohibited');};`,
    './supabase': `export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:globalThis.__guestSyncTest.activeOwner}}}})}};`,
    './entitlements': `export const fetchAuthoritativeEntitlement=async()=>({isPremium:false});`,
    './storageUploadImage': `export const prepareStorageUploadImage=async(base64,mime,uri)=>{
      if(base64!=='')throw Error('Original Base64 allocation prohibited');
      globalThis.__guestSyncTest.preparedUris.push(uri);return 'bounded-photo';};`,
    './storage': `export const uploadPreparedWardrobeImage=async(owner,id,mime,photo)=>{
      globalThis.__guestSyncTest.uploads.push(photo);return {storagePath:owner+'/'+id+'.jpg',signedUrl:'https://signed'};};`,
    './database': `const m=globalThis.__guestSyncTest;
      export const getSelectedWardrobeItems=async()=>m.rows;
      export const getWardrobeItems=async()=>({items:m.rows,totalCount:m.rows.length});
      export const getFreeWardrobeSelection=async()=>m.rows.map(r=>r.id);
      export const insertWardrobeItems=async rows=>{m.rows.push(...rows);return rows.map(r=>r.id);};`,
    '@/lib/photoroom': `export const removeBackground=()=>{globalThis.__guestSyncTest.ai++;throw Error('AI prohibited');};`,
  };
  const bundle = await build({
    entryPoints: ['lib/guestWardrobeSync.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', metafile: true,
    plugins: [{
      name: 'guest-transfer-io',
      setup(b) {
        b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'mock' } : undefined);
        b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
      },
    }],
  });
  const mod = { exports: {} as any };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    createRequire(path.join(process.cwd(), 'package.json')), mod, mod.exports);
  const adapter = mod.exports.guestWardrobeSync;
  await adapter.decide('a', 'absorb');
  await adapter.claim('a', [item(6)]);
  await adapter.sync('a', () => true);
  assert.equal(fixture.rows.length, 1);
  assert.equal(fixture.rows[0].id, item(6).id);
  assert.equal(fixture.rows[0].image_url, `a/${item(6).id}.jpg`);
  assert.equal(fixture.rows[0].user_id, 'a');
  assert.equal(fixture.ai, 0);
  assert.equal(fixture.fullFileReads, 0);
  assert.deepEqual(fixture.preparedUris, [item(6).photoUri], 'managed original goes directly to the bounded codec');
  assert.deepEqual(fixture.uploads, ['bounded-photo'], 'only bounded output reaches the network uploader');
  const uploadCount = fixture.uploads.length;
  const rowCount = fixture.rows.length;
  await adapter.claim('a', [item(7)]);
  fixture.activeOwner = 'b';
  await adapter.sync('a', () => true);
  assert.equal(fixture.uploads.length, uploadCount, 'real adapter rechecks Supabase owner, not only UI identity');
  assert.equal(fixture.rows.length, rowCount);
  assert.ok([...fixture.disk.keys()].every(key =>
    key === '@amodka_wardrobe' || key === '@amodka_guest_wardrobe_migration'),
  'no rotation, wear, mood, reactions, saved-look, profile or consent key is written');
  assert.ok(!Object.keys(bundle.metafile!.inputs).some(file => /photoroom|classif|aiProcessingPreference|AiProcessingConsent/i.test(file)),
    'the migration dependency graph contains no AI, consent or background-removal module');
  console.log('Guest migration disposition, durable ownership, partial/offline retry, lost response, cap, account guard and no-AI adapter proofs passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
