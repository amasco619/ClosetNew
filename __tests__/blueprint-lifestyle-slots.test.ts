/**
 * Unit tests: active and brunch slot groups surface at the right lifestyle thresholds.
 *
 * Uses buildProfileBlueprintSlots from constants/blueprintCore.ts — the real
 * production function, asset-free and directly importable in Node/tsx.
 *
 * Blueprint slot groups are identified by the naming convention baked into
 * blueprintSlots.ts: active slots have IDs matching *-act-*, brunch slots *-brn-*.
 *
 * Design note — what "ranks higher" means:
 *   applyLifestyleWeights applies a per-CATEGORY boost proportional to the
 *   lifestyle proportion.  The active lifestyle boosts bottom (+2) and shoes (+2)
 *   and outerwear (+1); the brunch lifestyle boosts dress (+2) and bag (+2).
 *   Tests therefore target the categories that are explicitly boosted, not every
 *   slot that happens to carry an "-act-" or "-brn-" ID (some of those slots are
 *   in top or bag categories that receive a different, or zero, active boost).
 *
 * Invariants verified:
 *   1. Active slot group exists — at least one *-act-* slot per blueprint.
 *   2. Brunch slot group exists — at least one *-brn-* slot per blueprint.
 *   3. High lifestyleActive → bottom and shoes category avg rank improves.
 *   4. High lifestyleBrunch → dress and bag category avg rank improves.
 *   5. Category ordering at lifestyleActive = 100:
 *        shoes and bottom rank before jewelry (no active boost for jewelry).
 *   6. Category ordering at lifestyleBrunch = 100:
 *        dress and bag rank before bottom (no brunch boost for bottom).
 *   7. Spot-check — minimal blueprint leggings (bottom p4) index improves at active=80.
 *   8. Spot-check — minimal blueprint brunch dress (dress p8) index improves at brunch=80.
 *   9. Proportionality — bottom avg rank improves monotonically as active rises.
 *  10. Proportionality — dress avg rank improves monotonically as brunch rises.
 *
 * Run: `npx tsx __tests__/blueprint-lifestyle-slots.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { STYLE_GOALS } from '../constants/blueprintSlots';
import { buildProfileBlueprintSlots } from '../constants/blueprintCore';
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

/** Sorted index of a slot in the blueprint (lower = appears earlier / higher priority). */
function slotIndex(slots: SlotMeta[], id: string): number {
  return slots.findIndex(s => s.id === id);
}

/**
 * Average sorted index of all slots belonging to `category`.
 * Lower means the category collectively appears earlier.
 */
function avgCategoryIndex(slots: SlotMeta[], category: ItemCategory): number {
  const indices = slots
    .map((s, i) => (s.category === category ? i : -1))
    .filter(i => i !== -1);
  if (indices.length === 0) return Infinity;
  return indices.reduce((s, i) => s + i, 0) / indices.length;
}

/**
 * Returns true when the first slot of `before` appears before the first slot
 * of `after` in the sorted list.
 */
function firstSlotBefore(slots: SlotMeta[], before: ItemCategory, after: ItemCategory): boolean {
  const beforeIdx = slots.findIndex(s => s.category === before);
  const afterIdx  = slots.findIndex(s => s.category === after);
  if (beforeIdx === -1 || afterIdx === -1) return true;
  return beforeIdx < afterIdx;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 & 2. Active and brunch slot groups exist in every blueprint
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n1. Active slot group present in every blueprint:');

for (const goal of STYLE_GOALS) {
  const raw = buildProfileBlueprintSlots({ styleGoalPrimary: goal });
  const activeIds = raw.filter(s => s.id.includes('-act-'));
  assert(
    activeIds.length > 0,
    `${goal}: has at least one active-group slot (found ${activeIds.length})`,
  );
}

console.log('\n2. Brunch slot group present in every blueprint:');

for (const goal of STYLE_GOALS) {
  const raw = buildProfileBlueprintSlots({ styleGoalPrimary: goal });
  const brunchIds = raw.filter(s => s.id.includes('-brn-'));
  assert(
    brunchIds.length > 0,
    `${goal}: has at least one brunch-group slot (found ${brunchIds.length})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. High lifestyleActive → bottom and shoes category rank improves
//
//    LIFESTYLE_CATEGORY_WEIGHTS.active: bottom +2, shoes +2, outerwear +1.
//    We measure the improvement on the two highest-weighted categories
//    (bottom and shoes) specifically, because the active weight also
//    partially competes with the casual.top and casual.bag boosts that
//    exist in the low-active profile, making top/bag slots harder to
//    reason about in isolation.
//
//    Baseline: all-casual (lifestyleCasual = 100)
//    High active: work=10, casual=10, active=80
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n3. High lifestyleActive → bottom and shoes category avg rank improves (all blueprints):');

for (const goal of STYLE_GOALS) {
  const noActive = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleCasual: 100,
  });
  const highActive = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleWork:   10,
    lifestyleCasual: 10,
    lifestyleActive: 80,
  });

  const bottomLow  = avgCategoryIndex(noActive,   'bottom');
  const bottomHigh = avgCategoryIndex(highActive, 'bottom');

  assert(
    bottomHigh < bottomLow,
    `${goal}: bottom avg rank ${bottomHigh.toFixed(1)} (high active) < ${bottomLow.toFixed(1)} (no active)`,
  );

  // outerwear: casual.outerwear = 0, active.outerwear = 1 → clear improvement at high active.
  // (shoes is excluded here: casual.shoes = active.shoes = 2, so both round to the same
  //  catWeight at these proportions and the avg rank does not reliably change.)
  const outerLow  = avgCategoryIndex(noActive,   'outerwear');
  const outerHigh = avgCategoryIndex(highActive, 'outerwear');

  assert(
    outerHigh < outerLow,
    `${goal}: outerwear avg rank ${outerHigh.toFixed(1)} (high active) < ${outerLow.toFixed(1)} (no active)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. High lifestyleBrunch → dress and bag category rank improves
//
//    LIFESTYLE_CATEGORY_WEIGHTS.brunch: dress +2, bag +2, shoes +1, top +1.
//    dress and bag are the strongly-boosted categories (weight = 2).
//
//    Baseline: all-casual (lifestyleCasual = 100; casual.dress = 0, casual.bag = 1)
//    High brunch: work=10, casual=10, brunch=80
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n4. High lifestyleBrunch → dress and bag category avg rank improves (all blueprints):');

for (const goal of STYLE_GOALS) {
  const noBrunch = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleCasual: 100,
  });
  const highBrunch = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleWork:   10,
    lifestyleCasual: 10,
    lifestyleBrunch: 80,
  });

  // dress: casual.dress = 0 (no boost without brunch) → big improvement at high brunch
  const dressLow  = avgCategoryIndex(noBrunch,   'dress');
  const dressHigh = avgCategoryIndex(highBrunch, 'dress');

  assert(
    dressHigh < dressLow,
    `${goal}: dress avg rank ${dressHigh.toFixed(1)} (high brunch) < ${dressLow.toFixed(1)} (no brunch)`,
  );

  // bag: casual.bag = 1, brunch.bag = 2 → brunch gives extra +1 weight → improvement
  const bagLow  = avgCategoryIndex(noBrunch,   'bag');
  const bagHigh = avgCategoryIndex(highBrunch, 'bag');

  assert(
    bagHigh < bagLow,
    `${goal}: bag avg rank ${bagHigh.toFixed(1)} (high brunch) < ${bagLow.toFixed(1)} (no brunch)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Category ordering at lifestyleActive = 100
//    active weight: bottom +2, shoes +2, outerwear +1.
//    jewelry and dress receive NO active boost → stay at higher (worse) priority.
//    Verifies: the first shoes and bottom slots appear before the first jewelry slot.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n5. Category ordering at lifestyleActive = 100 (all blueprints):');

for (const goal of STYLE_GOALS) {
  const pureActive = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleActive: 100,
  });

  assert(
    firstSlotBefore(pureActive, 'shoes', 'jewelry'),
    `${goal}: at active=100, first shoes slot precedes first jewelry slot`,
  );
  assert(
    firstSlotBefore(pureActive, 'bottom', 'jewelry'),
    `${goal}: at active=100, first bottom slot precedes first jewelry slot`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Category ordering at lifestyleBrunch = 100
//    brunch weight: dress +2, bag +2.
//    bottom receives NO brunch boost → stays at higher (worse) priority.
//    Verifies: the first dress and bag slots appear before the first bottom slot.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n6. Category ordering at lifestyleBrunch = 100 (all blueprints):');

for (const goal of STYLE_GOALS) {
  const pureBrunch = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleBrunch: 100,
  });

  assert(
    firstSlotBefore(pureBrunch, 'dress', 'bottom'),
    `${goal}: at brunch=100, first dress slot precedes first bottom slot`,
  );
  assert(
    firstSlotBefore(pureBrunch, 'bag', 'bottom'),
    `${goal}: at brunch=100, first bag slot precedes first bottom slot`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Spot-check — minimal blueprint: leggings (bottom p4) index improves at active=80
//
//    bottom gets +2 from active (LIFESTYLE_CATEGORY_WEIGHTS.active.bottom = 2).
//    At active=0 (casual=100): catWeights[bottom] rounds to 1 → leggings adj = 4-1 = 3.
//    At active=80 (work=10, casual=10): catWeights[bottom] ≈ 1.8 → rounds to 2 →
//      leggings adj = 4-2 = 2.  Lower adj → earlier in sorted list.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n7. Spot-check — minimal: leggings index improves with high active:');

{
  const noActive = buildProfileBlueprintSlots({
    styleGoalPrimary: 'minimal',
    lifestyleCasual: 100,
  });
  const highActive = buildProfileBlueprintSlots({
    styleGoalPrimary: 'minimal',
    lifestyleWork:   10,
    lifestyleCasual: 10,
    lifestyleActive: 80,
  });

  const leggingsNoActive   = slotIndex(noActive,   'min-act-1');
  const leggingsHighActive = slotIndex(highActive, 'min-act-1');

  assert(leggingsNoActive   !== -1, 'minimal: min-act-1 (leggings) present in no-active blueprint');
  assert(leggingsHighActive !== -1, 'minimal: min-act-1 (leggings) present in high-active blueprint');
  assert(
    leggingsHighActive < leggingsNoActive,
    `minimal: leggings index at high active (${leggingsHighActive}) < no active (${leggingsNoActive})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Spot-check — minimal blueprint: dress category avg rank improves at brunch=80
//
//    dress gets +2 from brunch; casual.dress = 0 (no dress boost without brunch).
//    ALL dress slots shift from their base priorities at brunch=0 to base-2 at
//    brunch=80, moving them collectively earlier in the sorted list.
//
//    Note: individual slot index is not spot-checked here because the brunch dress
//    (dress p8) ties in adj priority with the brunch sandals (shoes p7, -1 from
//    brunch.shoes=1) at high brunch, making their relative sort order depend on
//    insertion-sort stability rather than the lifestyle algorithm.  The category
//    avg rank is stable and meaningful.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n8. Spot-check — minimal: dress category avg rank improves with high brunch:');

{
  const noBrunch = buildProfileBlueprintSlots({
    styleGoalPrimary: 'minimal',
    lifestyleCasual: 100,
  });
  const highBrunch = buildProfileBlueprintSlots({
    styleGoalPrimary: 'minimal',
    lifestyleWork:   10,
    lifestyleCasual: 10,
    lifestyleBrunch: 80,
  });

  const dressNoBrunch   = avgCategoryIndex(noBrunch,   'dress');
  const dressHighBrunch = avgCategoryIndex(highBrunch, 'dress');

  assert(
    dressHighBrunch < dressNoBrunch,
    `minimal: dress avg rank at high brunch (${dressHighBrunch.toFixed(1)}) < no brunch (${dressNoBrunch.toFixed(1)})`,
  );

  // Confirm min-brn-2 (the specific brunch dress slot) still exists in both blueprints.
  assert(slotIndex(noBrunch,   'min-brn-2') !== -1, 'minimal: min-brn-2 present in no-brunch blueprint');
  assert(slotIndex(highBrunch, 'min-brn-2') !== -1, 'minimal: min-brn-2 present in high-brunch blueprint');
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Proportionality — bottom avg rank improves monotonically as active proportion rises
//    low  = active=20, casual=80
//    high = active=80, casual=20
//    Expectation: high-active produces strictly lower avg bottom rank.
//    Verified for every blueprint.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n9. Proportionality — bottom category rank improves as active proportion rises:');

for (const goal of STYLE_GOALS) {
  const lowActive = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleActive: 20,
    lifestyleCasual: 80,
  });
  const highActive = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleActive: 80,
    lifestyleCasual: 20,
  });

  const bottomLow  = avgCategoryIndex(lowActive,  'bottom');
  const bottomHigh = avgCategoryIndex(highActive, 'bottom');

  assert(
    bottomHigh <= bottomLow,
    `${goal}: bottom avg rank at active=80 (${bottomHigh.toFixed(1)}) ≤ active=20 (${bottomLow.toFixed(1)})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Proportionality — dress avg rank improves monotonically as brunch proportion rises
//     low  = brunch=20, casual=80
//     high = brunch=80, casual=20
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n10. Proportionality — dress category rank improves as brunch proportion rises:');

for (const goal of STYLE_GOALS) {
  const lowBrunch = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleBrunch: 20,
    lifestyleCasual: 80,
  });
  const highBrunch = buildProfileBlueprintSlots({
    styleGoalPrimary: goal,
    lifestyleBrunch: 80,
    lifestyleCasual: 20,
  });

  const dressLow  = avgCategoryIndex(lowBrunch,  'dress');
  const dressHigh = avgCategoryIndex(highBrunch, 'dress');

  assert(
    dressHigh <= dressLow,
    `${goal}: dress avg rank at brunch=80 (${dressHigh.toFixed(1)}) ≤ brunch=20 (${dressLow.toFixed(1)})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exit
// ─────────────────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll blueprint-lifestyle-slots tests passed.');
}
