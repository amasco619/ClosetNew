/**
 * Unit tests for the account lockout helpers in server/middleware/rateLimiter.ts:
 *   checkAccountLockout / recordFailedAttempt / clearLockout
 *
 * The lockoutStore is a module-level Map so each test cleans up after itself
 * via clearLockout (which deletes the key).  Date.now is monkey-patched for
 * the time-travel cases and restored immediately after each block.
 *
 * Run: `npx tsx __tests__/accountLockout.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  checkAccountLockout,
  recordFailedAttempt,
  clearLockout,
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

// Save the real Date.now so we can restore it.
const realDateNow = Date.now.bind(Date);

function fakeNow(ts: number): void {
  Date.now = () => ts;
}

function restoreNow(): void {
  Date.now = realDateNow;
}

// ── first failure recorded ─────────────────────────────────────────────────

section('first failure recorded');

clearLockout(EMAIL);
assert(checkAccountLockout(EMAIL).locked === false, 'no record → not locked');

recordFailedAttempt(EMAIL);

const afterFirst = checkAccountLockout(EMAIL);
assert(afterFirst.locked === false, 'after 1st failure → not locked');

clearLockout(EMAIL);

// ── 4th failure does not yet lock ─────────────────────────────────────────

section('4th failure not yet locked');

clearLockout(EMAIL);
for (let i = 0; i < 4; i++) recordFailedAttempt(EMAIL);

const afterFour = checkAccountLockout(EMAIL);
assert(afterFour.locked === false, 'after 4 failures → not locked');

clearLockout(EMAIL);

// ── 5th failure triggers lock ─────────────────────────────────────────────

section('5th failure triggers lock');

clearLockout(EMAIL);

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

// Advance to just before lock expiry (14 min 59 s in) → still locked.
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

clearLockout(EMAIL);

const t1 = 1_700_000_000_000;
fakeNow(t1);
for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);

assert(checkAccountLockout(EMAIL).locked === true, 'locked before clear');
clearLockout(EMAIL);
assert(checkAccountLockout(EMAIL).locked === false, 'not locked after clearLockout');

restoreNow();

// ── lock expires after the lockout window ─────────────────────────────────

section('lock expires after lockout window');

clearLockout(EMAIL);

const t2 = 1_700_000_000_000;
fakeNow(t2);
for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
assert(checkAccountLockout(EMAIL).locked === true, 'locked right after 5th failure');

// Move time forward by exactly the lockout duration.
fakeNow(t2 + FIFTEEN_MIN_MS + 1);
const afterExpiry = checkAccountLockout(EMAIL);
assert(afterExpiry.locked === false, 'expired lock → not locked');

restoreNow();
clearLockout(EMAIL);

// ── stale window resets the attempt counter ───────────────────────────────

section('stale window resets counter');

clearLockout(EMAIL);

const t3 = 1_700_000_000_000;
fakeNow(t3);

// Record 4 failures in the first window.
for (let i = 0; i < 4; i++) recordFailedAttempt(EMAIL);
assert(checkAccountLockout(EMAIL).locked === false, '4 failures in first window → not locked');

// Advance past the window boundary.
fakeNow(t3 + FIFTEEN_MIN_MS + 1);

// One more failure starts a fresh window (should NOT trigger a lock).
recordFailedAttempt(EMAIL);
const afterReset = checkAccountLockout(EMAIL);
assert(afterReset.locked === false, 'first failure in new window → not locked');

// Now record 4 more in this new window (total 5 in new window) → lock.
for (let i = 0; i < 4; i++) recordFailedAttempt(EMAIL);
const afterNewWindow = checkAccountLockout(EMAIL);
assert(afterNewWindow.locked === true, '5 failures in fresh window → locked');

restoreNow();
clearLockout(EMAIL);

// ── email normalisation ───────────────────────────────────────────────────

section('email normalisation (case + whitespace)');

clearLockout('  USER@Example.COM  ');

const t4 = 1_700_000_000_000;
fakeNow(t4);

for (let i = 0; i < 5; i++) recordFailedAttempt('  USER@Example.COM  ');

const mixedCase = checkAccountLockout('user@example.com');
assert(mixedCase.locked === true, 'mixed-case / padded email matches normalised key');

restoreNow();
clearLockout('user@example.com');

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) FAILED.`}\n`);
process.exit(failed > 0 ? 1 : 0);
