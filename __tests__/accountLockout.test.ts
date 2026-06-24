/**
 * Unit tests for the account lockout helpers in server/middleware/rateLimiter.ts:
 *   checkAccountLockout / recordFailedAttempt / clearLockout / initLockoutStore
 *
 * A lightweight in-memory persistence layer is injected via
 * __setPersistenceLayerForTesting so no real Postgres connection is needed.
 * __resetForTesting clears the in-memory cache and the injected layer between
 * test groups.
 *
 * Run: `npx tsx __tests__/accountLockout.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  checkAccountLockout,
  recordFailedAttempt,
  clearLockout,
  initLockoutStore,
  __setPersistenceLayerForTesting,
  __resetForTesting,
  type LockoutRecord,
  type LockoutPersistenceLayer,
} from '../server/middleware/rateLimiter';

// ── Helpers ───────────────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function section(name: string): void {
  console.log(`\n${name}:`);
}

const EMAIL = 'test@example.com';
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

const realDateNow = Date.now.bind(Date);

function fakeNow(ts: number): void {
  Date.now = () => ts;
}

function restoreNow(): void {
  Date.now = realDateNow;
}

/**
 * Build a lightweight in-memory persistence layer for testing.
 * Captures every set/delete call so tests can inspect what was written
 * and simulate a process restart by re-feeding entries to initLockoutStore.
 */
function makeTestStore(): {
  layer: LockoutPersistenceLayer;
  written: Map<string, { record: LockoutRecord; expiresAt: number }>;
} {
  const written = new Map<string, { record: LockoutRecord; expiresAt: number }>();

  const layer: LockoutPersistenceLayer = {
    async set(key, record, ttlMs) {
      written.set(key, { record, expiresAt: Date.now() + ttlMs });
    },
    async delete(key) {
      written.delete(key);
    },
    async loadAll() {
      const now = Date.now();
      return [...written.entries()]
        .filter(([, v]) => v.expiresAt > now)
        .map(([key, { record, expiresAt }]) => ({ key, record, expiresAt }));
    },
  };

  return { layer, written };
}

/** Reset module state and inject a fresh test store. Returns the captured store. */
function freshStore() {
  __resetForTesting();
  const { layer, written } = makeTestStore();
  __setPersistenceLayerForTesting(layer);
  return written;
}

// ── Main (async wrapper required for top-level await under CJS/tsx) ───────────

(async () => {

// ── first failure recorded ─────────────────────────────────────────────────

section('first failure recorded');

freshStore();
assert(checkAccountLockout(EMAIL).locked === false, 'no record → not locked');

recordFailedAttempt(EMAIL);

const afterFirst = checkAccountLockout(EMAIL);
assert(afterFirst.locked === false, 'after 1st failure → not locked');

clearLockout(EMAIL);

// ── 4th failure does not yet lock ─────────────────────────────────────────

section('4th failure not yet locked');

freshStore();
for (let i = 0; i < 4; i++) recordFailedAttempt(EMAIL);

const afterFour = checkAccountLockout(EMAIL);
assert(afterFour.locked === false, 'after 4 failures → not locked');

clearLockout(EMAIL);

// ── 5th failure triggers lock ─────────────────────────────────────────────

section('5th failure triggers lock');

freshStore();

const t0 = 1_700_000_000_000;
fakeNow(t0);

for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);

const afterFive = checkAccountLockout(EMAIL);
assert(afterFive.locked === true, 'after 5 failures → locked');
if (afterFive.locked) {
  assert(
    afterFive.minutesLeft >= 1 && afterFive.minutesLeft <= 15,
    `minutesLeft in [1,15] (got ${afterFive.minutesLeft})`,
  );
}

fakeNow(t0 + FIFTEEN_MIN_MS - 1000);
const nearExpiry = checkAccountLockout(EMAIL);
assert(nearExpiry.locked === true, 'just before lock expires → still locked');
if (nearExpiry.locked) {
  assert(nearExpiry.minutesLeft === 1, `minutesLeft rounds up to 1 at 1 s remaining (got ${nearExpiry.minutesLeft})`);
}

restoreNow();
clearLockout(EMAIL);

// ── clearLockout clears an active lock ────────────────────────────────────

section('lock clears on success (clearLockout)');

freshStore();

const t1 = 1_700_000_000_000;
fakeNow(t1);
for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);

assert(checkAccountLockout(EMAIL).locked === true, 'locked before clear');
clearLockout(EMAIL);
assert(checkAccountLockout(EMAIL).locked === false, 'not locked after clearLockout');

restoreNow();

// ── lock expires after the lockout window ─────────────────────────────────

section('lock expires after lockout window');

freshStore();

const t2 = 1_700_000_000_000;
fakeNow(t2);
for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
assert(checkAccountLockout(EMAIL).locked === true, 'locked right after 5th failure');

fakeNow(t2 + FIFTEEN_MIN_MS + 1);
const afterExpiry = checkAccountLockout(EMAIL);
assert(afterExpiry.locked === false, 'expired lock → not locked');

restoreNow();
clearLockout(EMAIL);

// ── stale window resets the attempt counter ───────────────────────────────

section('stale window resets counter');

freshStore();

const t3 = 1_700_000_000_000;
fakeNow(t3);

for (let i = 0; i < 4; i++) recordFailedAttempt(EMAIL);
assert(checkAccountLockout(EMAIL).locked === false, '4 failures in first window → not locked');

fakeNow(t3 + FIFTEEN_MIN_MS + 1);

recordFailedAttempt(EMAIL);
const afterReset = checkAccountLockout(EMAIL);
assert(afterReset.locked === false, 'first failure in new window → not locked');

for (let i = 0; i < 4; i++) recordFailedAttempt(EMAIL);
const afterNewWindow = checkAccountLockout(EMAIL);
assert(afterNewWindow.locked === true, '5 failures in fresh window → locked');

restoreNow();
clearLockout(EMAIL);

// ── email normalisation ───────────────────────────────────────────────────

section('email normalisation (case + whitespace)');

freshStore();

const t4 = 1_700_000_000_000;
fakeNow(t4);

for (let i = 0; i < 5; i++) recordFailedAttempt('  USER@Example.COM  ');

const mixedCase = checkAccountLockout('user@example.com');
assert(mixedCase.locked === true, 'mixed-case / padded email matches normalised key');

restoreNow();
clearLockout('user@example.com');

// ── persistence: writes reach the backing store ───────────────────────────

section('persistence: failed attempts written to backing store');

{
  const written = freshStore();

  const t5 = 1_700_000_000_000;
  fakeNow(t5);

  recordFailedAttempt(EMAIL);

  // Give the async write a tick to settle
  await new Promise<void>((r) => setImmediate(r));

  assert(written.size === 1, 'one entry written to persistent store after first failure');
  const entry = written.get(EMAIL);
  assert(entry !== undefined, 'persistent store has the normalised key');
  if (entry) {
    assert(entry.record.attempts === 1, `stored record has attempts=1 (got ${entry.record.attempts})`);
    assert(entry.record.lockedUntil === null, 'stored record has lockedUntil=null before threshold');
  }

  // Record 4 more failures → 5 total → should trigger lock in stored record
  for (let i = 0; i < 4; i++) recordFailedAttempt(EMAIL);
  await new Promise<void>((r) => setImmediate(r));

  const lockedEntry = written.get(EMAIL);
  assert(lockedEntry !== undefined, 'locked entry still present in persistent store');
  if (lockedEntry) {
    assert(lockedEntry.record.attempts === 5, `stored record has attempts=5 (got ${lockedEntry.record.attempts})`);
    assert(lockedEntry.record.lockedUntil !== null, 'stored record has lockedUntil set after 5th failure');
  }

  restoreNow();
}

// ── persistence: clearLockout removes from backing store ──────────────────

section('persistence: clearLockout removes entry from backing store');

{
  const written = freshStore();

  const t6 = 1_700_000_000_000;
  fakeNow(t6);

  for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
  await new Promise<void>((r) => setImmediate(r));

  assert(written.has(EMAIL), 'entry in persistent store before clear');
  clearLockout(EMAIL);
  await new Promise<void>((r) => setImmediate(r));
  assert(!written.has(EMAIL), 'entry removed from persistent store after clearLockout');

  restoreNow();
}

// ── restart survival: initLockoutStore restores locked state ──────────────

section('restart survival: active lock restored after simulated restart');

{
  const written = freshStore();

  const t7 = 1_700_000_000_000;
  fakeNow(t7);

  // Simulate 5 failed attempts before the restart
  for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
  await new Promise<void>((r) => setImmediate(r));

  assert(checkAccountLockout(EMAIL).locked === true, 'locked before restart');

  // Simulate a process restart: clear in-memory cache but keep persistent store
  // and persistence layer reference (i.e. only the memCache is wiped).
  const { layer } = makeTestStore();
  // Rebuild with the same written data
  const rehydrateLayer: LockoutPersistenceLayer = {
    async set(key, record, ttlMs) {
      written.set(key, { record, expiresAt: Date.now() + ttlMs });
    },
    async delete(key) { written.delete(key); },
    async loadAll() {
      const now = Date.now();
      return [...written.entries()]
        .filter(([, v]) => v.expiresAt > now)
        .map(([key, { record, expiresAt }]) => ({ key, record, expiresAt }));
    },
  };

  // Clear only the in-memory cache (simulates a restart)
  __resetForTesting();
  __setPersistenceLayerForTesting(rehydrateLayer);

  assert(checkAccountLockout(EMAIL).locked === false, 'not locked right after restart (cache empty)');

  // Rehydrate from persistent store
  await initLockoutStore();

  const afterRestart = checkAccountLockout(EMAIL);
  assert(afterRestart.locked === true, 'lock restored after initLockoutStore (restart survival)');
  if (afterRestart.locked) {
    assert(
      afterRestart.minutesLeft >= 1 && afterRestart.minutesLeft <= 15,
      `minutesLeft in valid range after restart (got ${afterRestart.minutesLeft})`,
    );
  }

  restoreNow();
}

// ── restart survival: attempt counter preserved after restart ─────────────

section('restart survival: partial attempt count preserved across restart');

{
  const written = freshStore();

  const t8 = 1_700_000_000_000;
  fakeNow(t8);

  // Record 3 failures (below lock threshold)
  for (let i = 0; i < 3; i++) recordFailedAttempt(EMAIL);
  await new Promise<void>((r) => setImmediate(r));

  assert(checkAccountLockout(EMAIL).locked === false, '3 failures → not yet locked before restart');

  // Simulate restart by clearing memCache and re-injecting the same data store
  const rehydrateLayer: LockoutPersistenceLayer = {
    async set(key, record, ttlMs) {
      written.set(key, { record, expiresAt: Date.now() + ttlMs });
    },
    async delete(key) { written.delete(key); },
    async loadAll() {
      const now = Date.now();
      return [...written.entries()]
        .filter(([, v]) => v.expiresAt > now)
        .map(([key, { record, expiresAt }]) => ({ key, record, expiresAt }));
    },
  };

  __resetForTesting();
  __setPersistenceLayerForTesting(rehydrateLayer);
  await initLockoutStore();

  // Now 2 more failures should trigger the lock (total = 5 across the restart boundary)
  for (let i = 0; i < 2; i++) recordFailedAttempt(EMAIL);

  const afterRestart = checkAccountLockout(EMAIL);
  assert(afterRestart.locked === true, '5th failure (across restart) triggers lock');

  restoreNow();
}

// ── restart survival: expired lock not restored ───────────────────────────

section('restart survival: expired lock is not restored after restart');

{
  const written = freshStore();

  const t9 = 1_700_000_000_000;
  fakeNow(t9);

  for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
  await new Promise<void>((r) => setImmediate(r));

  // Advance time past the full lockout window
  fakeNow(t9 + FIFTEEN_MIN_MS + 1);

  const rehydrateLayer: LockoutPersistenceLayer = {
    async set(key, record, ttlMs) {
      written.set(key, { record, expiresAt: t9 + ttlMs }); // stored with original expiry
    },
    async delete(key) { written.delete(key); },
    async loadAll() {
      const now = Date.now();
      return [...written.entries()]
        .filter(([, v]) => v.expiresAt > now)
        .map(([key, { record, expiresAt }]) => ({ key, record, expiresAt }));
    },
  };

  __resetForTesting();
  __setPersistenceLayerForTesting(rehydrateLayer);
  await initLockoutStore();

  const afterExpiredRestart = checkAccountLockout(EMAIL);
  assert(afterExpiredRestart.locked === false, 'expired lock not restored after restart');

  restoreNow();
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) FAILED.`}\n`);
process.exit(failed > 0 ? 1 : 0);

})();
