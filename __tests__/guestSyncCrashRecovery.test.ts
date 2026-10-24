import assert from 'node:assert/strict';
import type { WardrobeItem } from '../constants/types';
import {
  createGuestWardrobeMigration, isGuestMigrationEntry,
  type GuestMigrationDeps, type GuestMigrationRecord,
} from '../lib/guestWardrobeMigration';

async function main() {
  const original = 'file:///docs/wardrobe_large.jpg';
  const item = { id: 'large', photoUri: original, createdAt: '2026-10-24' } as WardrobeItem;
  let disk: GuestMigrationRecord[] = [];
  let prepared = 0;
  let confirmedIds: string[] = [];
  let offlineSnapshot = false;
  let caughtError: unknown;
  let interrupt = true;
  let started: (() => void) | undefined;
  const deps: GuestMigrationDeps = {
    read: async () => structuredClone(disk),
    write: async rows => { disk = structuredClone(rows); },
    newId: () => 'migration',
    snapshot: async () => {
      if (offlineSnapshot) throw new Error('Network request failed');
      return { confirmedIds, activeCount: 0, totalCount: 0, premium: false };
    },
    prepare: async (_owner, entry) => {
      prepared++;
      assert.equal(entry.item.photoUri, original);
      assert.equal(saved().preparationInFlight, true, 'marker is on disk BEFORE native preparation');
      started?.();
      if (interrupt) return new Promise<string>(() => {}); // simulated process death; never a JS catch
      if (caughtError) throw caughtError;
      return 'bounded';
    },
    upload: async () => 'owner/migration.jpg',
    insert: async (_owner, rows) => rows.map(row => row.migrationId),
    confirmed: async () => {},
  };
  const saved = () => {
    const entry = disk.find(row => isGuestMigrationEntry(row) && row.ownerId === 'owner');
    assert(entry && isGuestMigrationEntry(entry));
    assert.equal(entry.item.photoUri, original, 'the managed original is never removed by recovery');
    return entry;
  };
  const launchAndInterrupt = async () => {
    const reachedPrepare = new Promise<void>(resolve => { started = resolve; });
    void createGuestWardrobeMigration(deps).sync('owner', () => true);
    await reachedPrepare;
  };
  const setup = createGuestWardrobeMigration(deps);
  await setup.decide('owner', 'absorb');
  await setup.claim('owner', [item]);
  await launchAndInterrupt();
  assert.equal(saved().consecutiveCrashCount, undefined);
  assert.equal(saved().uploadAttemptCount, undefined, 'an OS kill cannot reach the caught-failure counter');
  const firstDisk = structuredClone(disk);

  // An offline snapshot must not consume the surviving marker or count a crash.
  offlineSnapshot = true;
  await createGuestWardrobeMigration(deps).sync('owner', () => true);
  assert.equal(saved().consecutiveCrashCount, undefined);
  assert.equal(saved().preparationInFlight, true);
  offlineSnapshot = false;
  await launchAndInterrupt();
  assert.equal(prepared, 2, 'the first surviving marker allows exactly one automatic retry');
  assert.equal(saved().consecutiveCrashCount, 1);
  const recovery = createGuestWardrobeMigration(deps);
  assert.deepEqual(await recovery.sync('owner', () => true), { pending: 1, failed: 1, capacity: false });
  assert.equal(prepared, 2, 'the second surviving marker does not decode again');
  assert.equal(saved().consecutiveCrashCount, 2);
  assert.equal(saved().preparationInFlight, undefined);
  assert.match(saved().uploadError!, /interrupted twice.*Retry failed uploads/);
  await recovery.clearPermanentFailures('other-owner');
  assert.equal(saved().consecutiveCrashCount, 2, 'manual retry is owner-bound');
  await recovery.clearPermanentFailures('owner');
  assert.equal(saved().consecutiveCrashCount, 0);
  assert.equal(saved().uploadError, undefined);
  interrupt = false;
  assert.deepEqual(await recovery.sync('owner', () => true), { pending: 0, failed: 0, capacity: false });
  assert.equal(saved().synced, true);
  assert.equal(saved().preparationInFlight, undefined);
  assert.equal(saved().consecutiveCrashCount, 0);

  disk = structuredClone(firstDisk);
  await createGuestWardrobeMigration(deps).sync('owner', () => true);
  assert.equal(saved().synced, true, 'the first surviving marker can recover automatically');
  assert.equal(saved().consecutiveCrashCount, 0, 'successful upload breaks the crash sequence');

  // A row committed before death is reconciled FIRST, never classified as a crash.
  disk = structuredClone(firstDisk);
  saved().consecutiveCrashCount = 1;
  confirmedIds = ['migration'];
  const before = prepared;
  await createGuestWardrobeMigration(deps).sync('owner', () => true);
  assert.equal(saved().synced, true);
  assert.equal(saved().consecutiveCrashCount, 0);
  assert.equal(saved().preparationInFlight, undefined);
  assert.equal(prepared, before);
  confirmedIds = [];

  // A completed/caught attempt breaks the consecutive-crash sequence.
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const error of [new Error('Network request failed'), { status: 429 }, { status: 503 }]) {
      disk = structuredClone(firstDisk);
      saved().preparationInFlight = undefined;
      saved().consecutiveCrashCount = 1;
      caughtError = error;
      await createGuestWardrobeMigration(deps).sync('owner', () => true);
      assert.equal(saved().consecutiveCrashCount, 0);
      assert.equal(saved().preparationInFlight, undefined);
      assert.equal(saved().uploadError, undefined);
    }
  } finally { console.warn = warn; }
  console.log('Guest crash recovery: durable pre-prepare marker, reconciliation first, one retry then pause, owner/manual reset, offline/HTTP exclusion and original retention passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
