import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build, transformSync } from 'esbuild';
import { clearAccountDeviceData } from '../constants/accountDeletionCleanup';
import type { WardrobeItem } from '../constants/types';
import {
  createGuestWardrobeMigration,
  getReclaimableGuestPhotoSources,
  planGuestMigration,
  type GuestMigrationEntry,
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

  let disk: GuestMigrationEntry[] = [];
  const cloud = new Set<string>();
  const uploads: string[] = [];
  const inserts: string[][] = [];
  let activeCount = 27;
  let failUpload = item(2).id;
  let loseInsertResponse = false;
  let current = true;
  const confirmed: string[] = [];
  const deps = {
    read: async () => JSON.parse(JSON.stringify(disk)) as GuestMigrationEntry[],
    write: async (entries: GuestMigrationEntry[]) => { disk = JSON.parse(JSON.stringify(entries)); },
    newId: () => item(9).id,
    snapshot: async () => ({ ...snapshot, activeCount, confirmedIds: [...cloud] }),
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
  await migration.claim('a', [item(3), item(1), item(2)]);
  await migration.claim('b', [item(1), item(2), item(3)]);
  assert.equal(disk.length, 3);
  assert.ok(disk.every(entry => entry.ownerId === 'a'), 'guest claim cannot be rebound to another account');
  assert.equal((await migration.sync('b', () => true))!.pending, 0);
  assert.deepEqual(uploads, []);
  assert.equal((await migration.sync('a', () => true))!.pending, 1);
  assert.deepEqual(inserts, [[item(1).id, item(3).id]], 'uploads that succeed use the existing batch insert');
  assert.ok(disk.find(entry => entry.item.id === item(2).id && !entry.synced));
  assert.deepEqual(confirmed, [item(1).id, item(3).id], 'no failed upload is cleared/confirmed');
  assert.deepEqual(
    getReclaimableGuestPhotoSources(disk, 'a').map(entry => entry.item.id).sort(),
    [item(1).id, item(3).id].sort(),
    'only row-confirmed sources are eligible; pending originals stay untouched',
  );
  assert.deepEqual(getReclaimableGuestPhotoSources(disk, 'b'), [], 'source cleanup is owner-bound');
  assert.equal(await migration.takeNotice('a'), 2);
  assert.equal(await migration.takeNotice('a'), 0, 'notice is persisted at most once');

  // Restart the controller with the same durable journal; retry uses the same ID.
  migration = createGuestWardrobeMigration(deps);
  failUpload = '';
  loseInsertResponse = true;
  await migration.sync('a', () => true);
  assert.equal(disk.find(entry => entry.item.id === item(2).id)!.synced, false);
  assert.ok(!getReclaimableGuestPhotoSources(disk, 'a').some(entry => entry.item.id === item(2).id),
    'ambiguous insert acknowledgement never makes its source eligible for deletion');
  assert.ok(disk.find(entry => entry.item.id === item(2).id)!.storagePath);
  const beforeRetry = uploads.length;
  loseInsertResponse = false;
  migration = createGuestWardrobeMigration(deps);
  const recovered = await migration.sync('a', () => true);
  assert.equal(recovered!.pending, 0);
  assert.equal(uploads.length, beforeRetry, 'ambiguous committed row is reconciled without another upload');
  assert.equal(cloud.size, 3);
  assert.equal(await migration.takeNotice('a'), 1);
  await migration.claim('b', [item(1)]);
  assert.equal(disk.filter(entry => entry.ownerId === 'b').length, 0, 'synced tombstones stop duplicate cross-account claims');

  // Full account retains untouched local entries, then retries after room opens.
  await migration.claim('a', [item(4)]);
  const full = await migration.sync('a', () => true);
  assert.deepEqual(full, { pending: 1, capacity: true });
  activeCount = 29;
  const guarded = createGuestWardrobeMigration({
    ...deps, upload: async (owner, entry) => { current = false; return `${owner}/${entry.migrationId}.jpg`; },
  });
  const insertsBefore = inserts.length;
  await guarded.sync('a', () => current);
  assert.equal(inserts.length, insertsBefore, 'account switch after upload prevents database insert');
  assert.equal(disk.find(entry => entry.item.id === item(4).id)!.synced, false);
  current = true;
  await migration.sync('a', () => current);
  assert.equal(disk.find(entry => entry.item.id === item(4).id)!.synced, true);
  await migration.markSourceReclaimed('a', item(1).id);
  assert.equal(disk.find(entry => entry.ownerId === 'a' && entry.migrationId === item(1).id)!.sourceReclaimed, true);
  await migration.markSourceReclaimed('b', item(1).id);
  assert.equal(disk.find(entry => entry.ownerId === 'a' && entry.migrationId === item(1).id)!.sourceReclaimed, true,
    'another account cannot mark an owned tombstone reclaimed');
  await migration.claim('b', [item(5)]);
  const accountAOriginals = await migration.removeOwner('a');
  assert.ok(accountAOriginals.includes(item(1).photoUri), 'account deletion receives the owned original for local cleanup');
  assert.deepEqual(disk.map(entry => entry.ownerId), ['b'], 'account deletion keeps another owner’s pending work');
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
  assert.deepEqual(await offline.sync('b', () => true), { pending: 1, capacity: false });
  assert.equal(JSON.stringify(disk), beforeOffline, 'an outage neither clears nor falsely confirms a pending item');
  const blocked = createGuestWardrobeMigration({
    ...deps, write: async () => { throw new Error('disk unavailable'); },
  });
  await assert.rejects(() => blocked.claim('a', [item(6)]), /disk unavailable/);
  assert.equal(JSON.stringify(disk), beforeOffline, 'failed durable claim cannot destroy the guest source');
  const readsBefore = inserts.length;
  await migration.sync('b', () => false);
  assert.equal(inserts.length, readsBefore, 'a stale account cannot begin work');

  // Execute the actual auth-capture helper: non-guest account caches never enter
  // the journal. Only persisted guest rows, never in-memory account rows, qualify.
  const source = readFileSync('contexts/AppContext.tsx', 'utf8');
  const capture = source.slice(source.indexOf('async function claimGuestWardrobe('), source.indexOf('// Sub-type chips'));
  let captured: WardrobeItem[] = [];
  const invoke = new Function('AsyncStorage', 'STORAGE_KEYS', 'guestWardrobeSync',
    `${transformSync(capture, { loader: 'ts' }).code}; return claimGuestWardrobe;`)(
    { getItem: async () => JSON.stringify([item(1)]) }, { wardrobe: 'wardrobe' },
    { claim: async (_owner: string, items: WardrobeItem[]) => { captured = items; } },
  );
  await invoke('a', { isGuest: false });
  assert.equal(captured.length, 0);
  await invoke('a', { isGuest: true });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].id, item(1).id);
  assert.match(source, /await claimGuestWardrobe\(userId, localSnap\);[\s\S]*?await loadUserDataFromDB\(userId/);
  assert.match(source, /await claimGuestWardrobe\(initUserId, loadedProfile\);[\s\S]*?await loadUserDataFromDB\(initUserId/);

  // Exercise the production adapter with stubbed Supabase/storage/file services.
  // Any accidental provider dependency becomes a throwing stub, not a live call.
  const fixture = { disk: new Map<string, string>(), rows: [] as any[], ai: 0, uploads: [] as string[], activeOwner: 'a' };
  Object.assign(globalThis, { __guestSyncTest: fixture });
  const mocks: Record<string, string> = {
    '@react-native-async-storage/async-storage': `const m=globalThis.__guestSyncTest; export default {getItem:async k=>m.disk.get(k)??null,setItem:async(k,v)=>{m.disk.set(k,v);}};`,
    'expo-crypto': `export const randomUUID=()=> '00000000-0000-4000-8000-000000000009';`,
    'expo-file-system/legacy': `export const documentDirectory='file:///docs/',EncodingType={Base64:'base64'},readAsStringAsync=async()=> 'photo';`,
    './supabase': `export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:globalThis.__guestSyncTest.activeOwner}}}})}};`,
    './entitlements': `export const fetchAuthoritativeEntitlement=async()=>({isPremium:false});`,
    './storage': `export const uploadWardrobeImage=async(owner,photo,id)=>{globalThis.__guestSyncTest.uploads.push(photo);return {storagePath:owner+'/'+id+'.jpg',signedUrl:'https://signed'};};`,
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
  await adapter.claim('a', [item(6)]);
  await adapter.sync('a', () => true);
  assert.equal(fixture.rows.length, 1);
  assert.equal(fixture.rows[0].id, item(6).id);
  assert.equal(fixture.rows[0].image_url, `a/${item(6).id}.jpg`);
  assert.equal(fixture.rows[0].user_id, 'a');
  assert.equal(fixture.ai, 0);
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
  console.log('Guest migration plan, durable ownership, partial/offline retry, lost response, cap, account guard, auth capture and no-AI adapter proofs passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
