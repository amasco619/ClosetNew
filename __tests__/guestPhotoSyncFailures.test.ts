import assert from 'node:assert/strict';
import type { WardrobeItem } from '../constants/types';
import {
  createGuestWardrobeMigration, isGuestMigrationEntry,
  type GuestMigrationDeps, type GuestMigrationRecord,
} from '../lib/guestWardrobeMigration';
import { PermanentStorageUploadError, StorageStageError } from '../lib/storageUploadBounds';

async function main() {
  const original = 'file:///docs/wardrobe_original.jpg';
  const garment = {
    id: 'synthetic-piece', photoUri: original, createdAt: '2026-10-24',
    category: 'top', subType: 't-shirt', colorFamily: 'grey', occasionTags: [], seasonTags: [],
  } as unknown as WardrobeItem;
  let disk: GuestMigrationRecord[] = [];
  let uploadError: unknown = new Error(`not-for-logging ${original}`);
  let prepareError: unknown;
  let prepareDelay = 0;
  let hangDuringSignedUrl = false;
  let uploads = 0;
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args); };
  const deps: GuestMigrationDeps = {
    read: async () => structuredClone(disk),
    write: async rows => { disk = structuredClone(rows); },
    newId: () => 'synthetic-migration',
    snapshot: async () => ({ confirmedIds: [], activeCount: 0, totalCount: 0, premium: false }),
    prepare: async (_owner, entry) => {
      assert.equal(entry.item.photoUri, original);
      if (prepareDelay) await new Promise(resolve => setTimeout(resolve, prepareDelay));
      if (prepareError) throw prepareError;
      return 'bounded-photo';
    },
    upload: async (_owner, _entry, photo, onStage) => {
      assert.equal(photo, 'bounded-photo');
      uploads++;
      if (hangDuringSignedUrl) {
        onStage('signed-url');
        return new Promise<string>(() => {});
      }
      if (uploadError) throw uploadError;
      return 'synthetic-owner/synthetic-migration.jpg';
    },
    insert: async (_owner, rows) => rows.map(row => row.migrationId),
    confirmed: async () => {},
    networkTimeoutMs: 5,
  };
  const saved = () => {
    const entry = disk.find(isGuestMigrationEntry);
    assert(entry);
    assert.equal(entry.item.photoUri, original, 'every failure retains the original local reference');
    return entry;
  };
  let migration = createGuestWardrobeMigration(deps);
  try {
    await migration.decide('synthetic-owner', 'absorb');
    await migration.claim('synthetic-owner', [garment]);
    for (let n = 1; n <= 3; n++) {
      const result = await migration.sync('synthetic-owner', () => true);
      assert.equal(result?.failed, n === 3 ? 1 : 0);
      assert.equal(saved().unrecognizedFailureCount, n);
      assert.equal(saved().lastUploadFailure?.attemptCount, n);
      assert.equal(saved().lastUploadFailure?.stage, 'upload');
      assert.equal(saved().lastUploadFailure?.code, 'UNRECOGNISED');
      assert.equal(saved().synced, false);
    }
    assert.match(saved().uploadError!, /3 attempts/);
    migration = createGuestWardrobeMigration(deps);
    await migration.sync('synthetic-owner', () => true);
    assert.equal(uploads, 3, 'restart/foreground does not retry an entry at its ceiling');
    await migration.clearPermanentFailures('synthetic-owner');
    assert.equal(saved().unrecognizedFailureCount, 0);
    await migration.sync('synthetic-owner', () => true);
    assert.equal(saved().unrecognizedFailureCount, 1);
    assert.equal(saved().lastUploadFailure?.attemptCount, 1, 'manual retry resets the attempt cycle');

    // Recognised failures are diagnostic, not part of the unknown-failure ceiling.
    for (const status of [408, 429, 500, 503]) {
      const stage = status === 503 ? 'signed-url' : 'upload';
      uploadError = new StorageStageError(stage, { statusCode: String(status), message: 'not-for-logging' });
      await migration.sync('synthetic-owner', () => true);
      assert.equal(saved().unrecognizedFailureCount, 0);
      assert.equal(saved().lastUploadFailure?.stage, stage);
      assert.equal(saved().lastUploadFailure?.status, status);
      assert.equal(saved().lastUploadFailure?.code, `HTTP_${status}`);
      assert.equal(saved().uploadError, undefined);
    }
    for (const error of [
      new Error('Network request failed'),
      new Error('java.net.UnknownHostException: Unable to resolve host not-for-logging'),
      { code: 'ENETUNREACH' },
      new StorageStageError('upload', new TypeError('Failed to fetch')),
    ]) {
      uploadError = error;
      await migration.sync('synthetic-owner', () => true);
      assert.equal(saved().unrecognizedFailureCount, 0, 'airplane-mode/DNS failures never count');
      assert.equal(saved().uploadError, undefined, 'offline is never marked permanent or manual-only');
      assert.equal(saved().lastUploadFailure?.code, 'NETWORK_OFFLINE');
    }
    hangDuringSignedUrl = true;
    await migration.sync('synthetic-owner', () => true);
    assert.equal(saved().lastUploadFailure?.code, 'TIMEOUT');
    assert.equal(saved().lastUploadFailure?.stage, 'signed-url');
    assert.equal(saved().unrecognizedFailureCount, 0, 'known timeout is not an unknown failure');
    assert.equal(saved().uploadError, undefined);
    hangDuringSignedUrl = false;

    prepareError = new Error(`not-for-logging ${original}`);
    await migration.sync('synthetic-owner', () => true);
    assert.equal(saved().lastUploadFailure?.stage, 'prepare');
    assert.equal(saved().unrecognizedFailureCount, 1);
    prepareError = new PermanentStorageUploadError('invalid');
    await migration.sync('synthetic-owner', () => true);
    assert.equal(saved().lastUploadFailure?.code, 'INVALID');
    assert.equal(saved().unrecognizedFailureCount, 0);
    assert.match(saved().uploadError!, /could not be prepared/);
    assert.equal(saved().synced, false);

    const prefix = '[guest-sync] Photo transfer failed ';
    for (const warning of warnings) {
      assert.equal(warning.length, 1, 'each failed attempt emits one sanitised line');
      const [message] = warning;
      assert.equal(typeof message, 'string');
      assert((message as string).startsWith(prefix));
      const diagnostic = JSON.parse((message as string).slice(prefix.length));
      assert(diagnostic && typeof diagnostic === 'object');
      assert.deepEqual(Object.keys(diagnostic).sort(),
        ('status' in diagnostic ? ['stage', 'code', 'status', 'elapsedMs', 'attemptCount']
          : ['stage', 'code', 'elapsedMs', 'attemptCount']).sort());
      assert(Number.isFinite((diagnostic as { elapsedMs: number }).elapsedMs));
      assert(!/not-for-logging|file:|synthetic-owner/.test(JSON.stringify(diagnostic)));
    }
    assert.deepEqual(JSON.parse((warnings.at(-1)![0] as string).slice(prefix.length)), saved().lastUploadFailure,
      'the persisted diagnostic and one console warning contain identical fields');

    await migration.clearPermanentFailures('synthetic-owner');
    prepareError = undefined;
    uploadError = undefined;
    prepareDelay = 25; // deliberately longer than the 5 ms test network deadline
    assert.deepEqual(await migration.sync('synthetic-owner', () => true),
      { pending: 0, capacity: false, failed: 0 });
    assert.equal(saved().synced, true, 'local preparation is outside the network deadline');
    assert.equal(saved().lastUploadFailure, undefined);
    assert.equal(saved().unrecognizedFailureCount, 0);
  } finally {
    console.warn = originalWarn;
  }
  console.log('Guest photo sync: deadline split, sanitised diagnostics, unknown-only ceiling, manual reset, offline exemption and original retention passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
