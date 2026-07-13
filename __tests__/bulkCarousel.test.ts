/**
 * Pure carousel navigation arithmetic — no Expo/React imports needed.
 * Exercises stepCarousel / canGoPrev / canGoNext from lib/carouselUtils.
 *
 * Run: `npx tsx __tests__/bulkCarousel.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { stepCarousel, canGoPrev, canGoNext } from '../lib/carouselUtils';

// ── Harness ───────────────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function section(label: string): void {
  console.log(`\n${label}:`);
}

// ── stepCarousel — forward ────────────────────────────────────────────────────

section('stepCarousel — forward navigation');
assert(stepCarousel(0, 'next', 5) === 1, 'advances from first item → 1');
assert(stepCarousel(2, 'next', 5) === 3, 'advances from middle → 3');
assert(stepCarousel(4, 'next', 5) === 4, 'clamps at last item (no wrap)');
assert(stepCarousel(0, 'next', 1) === 0, 'single-item: next clamps at 0');
assert(stepCarousel(1, 'next', 2) === 1, '2-item: next at last clamps');

// ── stepCarousel — backward ───────────────────────────────────────────────────

section('stepCarousel — backward navigation');
assert(stepCarousel(4, 'prev', 5) === 3, 'retreats from last → 3');
assert(stepCarousel(2, 'prev', 5) === 1, 'retreats from middle → 1');
assert(stepCarousel(0, 'prev', 5) === 0, 'clamps at first item (no wrap)');
assert(stepCarousel(0, 'prev', 1) === 0, 'single-item: prev clamps at 0');

// ── stepCarousel — edge cases ─────────────────────────────────────────────────

section('stepCarousel — edge: empty / boundary');
assert(stepCarousel(0, 'next', 0) === 0, 'empty collection: next → 0');
assert(stepCarousel(0, 'prev', 0) === 0, 'empty collection: prev → 0');

// ── stepCarousel — symmetry ───────────────────────────────────────────────────

section('stepCarousel — next → prev symmetry');
{
  const start = 2;
  const afterNext = stepCarousel(start, 'next', 5);
  assert(stepCarousel(afterNext, 'prev', 5) === start,
    `next(${start}) then prev returns to ${start}`);
}
{
  const start = 3;
  const afterPrev = stepCarousel(start, 'prev', 5);
  assert(stepCarousel(afterPrev, 'next', 5) === start,
    `prev(${start}) then next returns to ${start}`);
}

// ── canGoPrev ─────────────────────────────────────────────────────────────────

section('canGoPrev');
assert(canGoPrev(0) === false, 'false at index 0');
assert(canGoPrev(1) === true,  'true at index 1');
assert(canGoPrev(10) === true, 'true at any positive index');

// ── canGoNext ─────────────────────────────────────────────────────────────────

section('canGoNext');
assert(canGoNext(4, 5) === false, 'false at last index (4 of 5)');
assert(canGoNext(3, 5) === true,  'true before last index (3 of 5)');
assert(canGoNext(0, 0) === false, 'false when total is 0');
assert(canGoNext(0, 1) === false, 'false when total is 1');
assert(canGoNext(0, 2) === true,  'true when there are 2+ items and at first');

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
  console.log('All carousel arithmetic tests passed.');
} else {
  console.error(`${failed} carousel arithmetic test(s) failed.`);
  process.exit(1);
}
