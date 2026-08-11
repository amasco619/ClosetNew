/**
 * Verifies that the PgRateLimitStore in-memory fallback correctly counts and
 * resets requests when the Postgres pool is absent (DATABASE_URL not set).
 *
 * This guards against a regression where the fallback Map could:
 *   - Undercount hits (allowing requests past the limit)
 *   - Fail to reset the window after it expires
 *   - Lose the count between increment calls
 *
 * The tests exercise PgRateLimitStore directly with pool=null so no real DB
 * connection is needed.
 *
 * Run: `npx tsx __tests__/rateLimiterDbFallback.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { PgRateLimitStore, __resetForTesting, __makeStoreForTesting } from '../server/middleware/rateLimiter';

// ── Assertion harness ─────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    failed++;
  }
}

function section(label: string): void {
  console.log(`\n${label}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a PgRateLimitStore with null pool (forces in-memory fallback). */
function makeInMemoryStore(prefix = 'test', windowMs = 60_000): PgRateLimitStore {
  const store = new PgRateLimitStore(prefix, null);
  store.init({ windowMs } as any);
  return store;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  section('1. pool is null when DATABASE_URL is absent');
  {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetForTesting();

    const store = __makeStoreForTesting('auth');
    assert(store instanceof PgRateLimitStore, 'store is PgRateLimitStore');
    assert(store._poolForTesting === null, 'pool is null without DATABASE_URL');

    if (saved !== undefined) process.env.DATABASE_URL = saved;
    __resetForTesting();
  }

  section('2. First increment: totalHits = 1');
  {
    const store = makeInMemoryStore('s2');
    const { totalHits } = await store.increment('client-ip');
    assertEq(totalHits, 1, 'first increment → totalHits = 1');
  }

  section('3. Consecutive increments: hits count correctly within window');
  {
    const store = makeInMemoryStore('s3', 10_000);
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { totalHits } = await store.increment('client-ip');
      results.push(totalHits);
    }
    assert(results.every((h, i) => h === i + 1),
      'hits increment sequentially: 1, 2, 3, 4, 5');
    assertEq(results[4], 5, 'fifth increment → totalHits = 5');
  }

  section('4. Window expiry: hits reset to 1 after the window elapses');
  {
    // Use a 1 ms window so the window expires before the second call.
    const store = makeInMemoryStore('s4', 1);

    const first = await store.increment('client-ip');
    assertEq(first.totalHits, 1, 'first increment → 1');

    // Wait 5 ms to ensure the window has expired.
    await new Promise(r => setTimeout(r, 5));

    const second = await store.increment('client-ip');
    assertEq(second.totalHits, 1, 'first hit in new window → resets to 1');
  }

  section('5. Different keys are tracked independently');
  {
    const store = makeInMemoryStore('s5');
    await store.increment('ip-alpha');
    await store.increment('ip-alpha');
    await store.increment('ip-beta');

    const { totalHits: alphaHits } = await store.increment('ip-alpha');
    const { totalHits: betaHits }  = await store.increment('ip-beta');

    assertEq(alphaHits, 3, 'ip-alpha: 3 increments → totalHits 3');
    assertEq(betaHits,  2, 'ip-beta: 2 increments → totalHits 2');
  }

  section('6. decrement reduces the count (in-memory fallback)');
  {
    const store = makeInMemoryStore('s6');
    await store.increment('client-ip');  // hits = 1
    await store.increment('client-ip');  // hits = 2
    await store.decrement('client-ip');  // hits = 1
    const { totalHits } = await store.increment('client-ip'); // hits = 2
    // 2 increments → 2, decrement → 1, 1 more increment → 2
    assertEq(totalHits, 2, 'decrement reduces hits; next increment builds from 1');
  }

  section('7. resetKey clears a single key (in-memory fallback)');
  {
    const store = makeInMemoryStore('s7');
    await store.increment('ip-a');
    await store.increment('ip-a');
    await store.increment('ip-b');
    await store.resetKey('ip-a');

    const { totalHits: aHits } = await store.increment('ip-a');
    const { totalHits: bHits } = await store.increment('ip-b');

    assertEq(aHits, 1, 'ip-a resets to 1 after resetKey');
    assertEq(bHits, 2, 'ip-b unaffected by ip-a resetKey');
  }

  section('8. resetAll clears all keys with matching prefix (in-memory fallback)');
  {
    const store = makeInMemoryStore('s8');
    await store.increment('ip-x');
    await store.increment('ip-x');
    await store.increment('ip-y');
    await store.resetAll();

    const { totalHits: xHits } = await store.increment('ip-x');
    const { totalHits: yHits } = await store.increment('ip-y');

    assertEq(xHits, 1, 'ip-x resets to 1 after resetAll');
    assertEq(yHits, 1, 'ip-y resets to 1 after resetAll');
  }

  section('9. resetTime is in the future after first increment');
  {
    const windowMs = 5_000;
    const store = makeInMemoryStore('s9', windowMs);
    const before = Date.now();
    const result = await store.increment('client-ip');
    const after = Date.now();

    assert(result.resetTime instanceof Date, 'resetTime is a Date object');
    assert((result.resetTime?.getTime() ?? 0) > before, 'resetTime is after the call');
    assert((result.resetTime?.getTime() ?? 0) <= after + windowMs + 100,
      'resetTime is at most windowMs in the future');
  }

  section('10. Fallback state is not shared between store instances');
  {
    const storeA = makeInMemoryStore('sA');
    const storeB = makeInMemoryStore('sB');

    await storeA.increment('client-ip');
    await storeA.increment('client-ip');

    const { totalHits: aHits } = await storeA.increment('client-ip');
    const { totalHits: bHits } = await storeB.increment('client-ip');

    assertEq(aHits, 3, 'storeA has 3 hits');
    assertEq(bHits, 1, 'storeB is independent (starts at 1)');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n=== rateLimiterDbFallback: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`);
  if (failed > 0) process.exit(1);

})();
