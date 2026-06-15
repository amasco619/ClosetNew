/**
 * Unit tests: raw slot priorities baked into each STYLE_BLUEPRINTS set.
 *
 * wardrobeBlueprint.ts cannot be imported directly in Node/tsx because its
 * module-level SAMPLE_IMAGES object calls require() on PNG asset files that
 * Node cannot parse.  constants/blueprintSlots.ts is an asset-free mirror of
 * the same data (id, category, subType, colorFamily, priority, label) that
 * can be imported without any mocking.
 *
 * Invariants verified for each of the six named blueprint sets:
 *
 *   1. POSITIVE INTEGER PRIORITIES
 *      Every slot has a priority value that is a positive integer (≥ 1).
 *      Catches accidental 0, negative, or fractional values.
 *
 *   2. UNIQUE IDs
 *      No two slots within the same blueprint share an id.
 *      Catches copy-paste duplicates that would confuse slot matching.
 *
 *   3. CORE SLOTS IN TOP HALF
 *      The seven core categories (top, bottom, dress, outerwear, shoes, bag,
 *      jewelry) each have at least one priority-1 slot, and those slots appear
 *      in the first half of the blueprint when sorted ascending by priority.
 *      Catches a mis-keyed priority that would silently bury a hero piece.
 *
 * Run: `npx tsx __tests__/blueprint-slots.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  STYLE_BLUEPRINT_SLOTS,
  STYLE_GOALS,
  CORE_CATEGORIES,
} from '../constants/blueprintSlots';
import type { SlotMeta } from '../constants/blueprintSlots';
import type { ItemCategory } from '../constants/types';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sort a copy of the slots ascending by priority (lower = higher priority). */
function sortedByPriority(slots: SlotMeta[]): SlotMeta[] {
  return [...slots].sort((a, b) => a.priority - b.priority);
}

/**
 * For a sorted slot list of length N, returns the exclusive upper bound for
 * "top half" membership.  With N = 10 the top half is positions 0–4 (< 5).
 */
function topHalfBound(n: number): number {
  return Math.ceil(n / 2);
}

// ── 1. POSITIVE INTEGER PRIORITIES ───────────────────────────────────────────

console.log('\n1. Positive integer priorities');

for (const goal of STYLE_GOALS) {
  const slots = STYLE_BLUEPRINT_SLOTS[goal];

  const nonPositive = slots.filter(s => !Number.isInteger(s.priority) || s.priority < 1);
  assert(
    nonPositive.length === 0,
    `${goal}: all ${slots.length} slots have positive integer priorities` +
    (nonPositive.length > 0 ? ` (bad: ${nonPositive.map(s => `${s.id}=${s.priority}`).join(', ')})` : ''),
  );
}

// ── 2. UNIQUE IDS ─────────────────────────────────────────────────────────────

console.log('\n2. Unique slot IDs within each blueprint');

for (const goal of STYLE_GOALS) {
  const slots = STYLE_BLUEPRINT_SLOTS[goal];
  const ids = slots.map(s => s.id);
  const unique = new Set(ids);

  assert(
    unique.size === ids.length,
    `${goal}: all ${ids.length} slot IDs are unique`,
  );

  if (unique.size !== ids.length) {
    const seen = new Set<string>();
    const dupes = ids.filter(id => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    console.error(`    duplicate IDs: ${dupes.join(', ')}`);
  }
}

// ── 3. CORE SLOTS IN TOP HALF ─────────────────────────────────────────────────

console.log('\n3. Core-category priority-1 slots appear in the top half of each blueprint');

for (const goal of STYLE_GOALS) {
  const slots = STYLE_BLUEPRINT_SLOTS[goal];
  const sorted = sortedByPriority(slots);
  const n = sorted.length;
  const bound = topHalfBound(n);

  console.log(`\n  ${goal} (${n} slots, top-half bound = index < ${bound}):`);

  for (const cat of CORE_CATEGORIES) {
    const catSlots = slots.filter(s => s.category === cat);

    assert(
      catSlots.length > 0,
      `${goal}/${cat}: category has at least one slot`,
    );

    const minPriority = Math.min(...catSlots.map(s => s.priority));

    assert(
      minPriority === 1,
      `${goal}/${cat}: lowest-priority slot has priority === 1 (got ${minPriority})`,
    );

    const topCoreSlots = catSlots.filter(s => s.priority === 1);
    for (const slot of topCoreSlots) {
      const sortedIdx = sorted.findIndex(s => s.id === slot.id);
      assert(
        sortedIdx < bound,
        `${goal}/${cat}: core slot "${slot.id}" (priority ${slot.priority}) is in sorted position ${sortedIdx} < ${bound}`,
      );
    }
  }
}

// ── 4. SANITY — blueprint sizes are non-trivial ───────────────────────────────

console.log('\n4. Blueprint slot counts are non-trivial');

for (const goal of STYLE_GOALS) {
  const n = STYLE_BLUEPRINT_SLOTS[goal].length;
  assert(
    n >= 20,
    `${goal}: blueprint has at least 20 slots (has ${n})`,
  );
}

// ── 5. ALL SIX GOALS ARE PRESENT ─────────────────────────────────────────────

console.log('\n5. All six style goals are present in STYLE_BLUEPRINT_SLOTS');

const expectedGoals = ['minimal', 'elevated', 'bold', 'romantic', 'classic', 'youthful'];
for (const goal of expectedGoals) {
  assert(
    goal in STYLE_BLUEPRINT_SLOTS,
    `STYLE_BLUEPRINT_SLOTS contains key "${goal}"`,
  );
}

assert(
  Object.keys(STYLE_BLUEPRINT_SLOTS).length === expectedGoals.length,
  `STYLE_BLUEPRINT_SLOTS has exactly ${expectedGoals.length} keys (no extras)`,
);

// ── 6. NO CROSS-BLUEPRINT ID COLLISIONS ──────────────────────────────────────

console.log('\n6. IDs are unique across all blueprints (no cross-goal collisions)');

{
  const allIds: string[] = STYLE_GOALS.flatMap(g => STYLE_BLUEPRINT_SLOTS[g].map(s => s.id));
  const globalUnique = new Set(allIds);

  assert(
    globalUnique.size === allIds.length,
    `All ${allIds.length} slot IDs are unique across all six blueprints`,
  );

  if (globalUnique.size !== allIds.length) {
    const seen = new Set<string>();
    const dupes = allIds.filter(id => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    console.error(`  cross-blueprint duplicate IDs: ${dupes.join(', ')}`);
  }
}

// ── Exit ──────────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll blueprint-slots tests passed.');
}
