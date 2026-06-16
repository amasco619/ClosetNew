/**
 * Tests for the getProfileBlueprint algorithm.
 *
 * Calls buildProfileBlueprintSlots from constants/blueprintCore.ts directly —
 * the real production function, not a hand-maintained local mirror.  Any change
 * to the algorithm in blueprintCore.ts is therefore caught immediately.
 *
 * blueprintCore.ts is asset-free (no PNG require() calls) so this suite runs
 * safely in a Node/tsx environment without any mocking.
 *
 * Invariants verified:
 *   1. All 6 style goals return a sorted, non-empty list with typed fields.
 *   2. No primary goal falls back to classic.
 *   3. Secondary-goal merge: combined list is longer, secondary items carry +10.
 *   4. Body-type priority boosts (pear and apple spot-checks).
 *   5. Constraint filtering: noSleeveless / noShortSkirts / flat heels.
 *   6. Lifestyle weights influence slot ordering.
 *
 * Run: `npx tsx __tests__/getProfileBlueprint.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { STYLE_BLUEPRINT_SLOTS, STYLE_GOALS } from '../constants/blueprintSlots';
import {
  buildProfileBlueprintSlots,
  BODY_TYPE_PRIORITY_BOOSTS,
} from '../constants/blueprintCore';
import type { SlotMeta } from '../constants/blueprintSlots';
import type { ItemCategory } from '../constants/types';

// ── Assertion harness ──────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

// ── Helper: verify ascending priority order ───────────────────────────────────

function isSorted(items: SlotMeta[]): boolean {
  for (let i = 1; i < items.length; i++) {
    if (items[i].priority < items[i - 1].priority) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. All 6 style goals return a non-empty priority-ascending list
// ─────────────────────────────────────────────────────────────────────────────

console.log('\ngetProfileBlueprint — sorted output for all 6 style goals:');

for (const goal of STYLE_GOALS) {
  const slots = buildProfileBlueprintSlots({ styleGoalPrimary: goal });
  assert(slots.length > 0, `${goal}: returns a non-empty list`);
  assert(isSorted(slots), `${goal}: returned slots are sorted by priority ascending`);
  assert(
    slots.every(s => typeof s.priority === 'number'),
    `${goal}: every slot has a numeric priority`,
  );
  assert(
    slots.every(s => s.category && s.subType && s.colorFamily),
    `${goal}: every slot has category, subType, and colorFamily`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. No primary goal falls back to classic (sorted)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\ngetProfileBlueprint — no primary goal falls back to classic:');

const noGoalSlots  = buildProfileBlueprintSlots({ styleGoalPrimary: null });
const classicSlots = buildProfileBlueprintSlots({ styleGoalPrimary: 'classic' });

assert(noGoalSlots.length > 0, 'no primary goal: returns non-empty list');
assert(isSorted(noGoalSlots), 'no primary goal: fallback list is sorted');
assert(
  noGoalSlots.length === classicSlots.length,
  'no primary goal: fallback length matches classic',
);
assert(
  noGoalSlots.every((s, i) =>
    s.id === classicSlots[i].id && s.priority === classicSlots[i].priority,
  ),
  'no primary goal: fallback slots match classic blueprint exactly',
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Secondary goal merge
//    primary = minimal, secondary = elevated.
//    Combined list must be longer than primary-only, fully sorted, and all
//    secondary-only items must carry the +10 priority offset.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\ngetProfileBlueprint — secondary goal merge:');

const primaryOnly   = buildProfileBlueprintSlots({ styleGoalPrimary: 'minimal' });
const withSecondary = buildProfileBlueprintSlots({
  styleGoalPrimary: 'minimal',
  styleGoalSecondary: 'elevated',
});

assert(
  withSecondary.length > primaryOnly.length,
  'secondary merge: combined list is longer than primary-only',
);
assert(isSorted(withSecondary), 'secondary merge: combined list is sorted');

const primaryIds         = new Set(primaryOnly.map(s => s.id));
const secondaryOnlyItems = withSecondary.filter(s => !primaryIds.has(s.id));

assert(
  secondaryOnlyItems.length > 0,
  'secondary merge: at least one elevated-only slot was added',
);

// All secondary-origin items must sit at priority ≥ 11 with all-zero lifestyle
// (minimum source priority 1 + 10 offset = 11; no lifestyle adjustment applied).
assert(
  secondaryOnlyItems.every(s => s.priority >= 11),
  'secondary merge: all secondary-only items carry the +10 priority offset (priority ≥ 11)',
);

// Primary items (shared between primary and combined) must have the same
// priority value in both lists.
for (const pSlot of primaryOnly) {
  const combined = withSecondary.find(s => s.id === pSlot.id);
  if (combined) {
    assert(
      combined.priority === pSlot.priority,
      `secondary merge: primary item ${pSlot.id} priority unchanged in combined list`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Body-type priority boosts
//    pear: top -1, jewelry -1, outerwear -1 (lower = higher priority).
//    Items in non-boosted categories must be unchanged.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\ngetProfileBlueprint — body-type priority boosts (pear):');

const noPearBoost   = buildProfileBlueprintSlots({ styleGoalPrimary: 'minimal' });
const withPearBoost = buildProfileBlueprintSlots({ styleGoalPrimary: 'minimal', bodyType: 'pear' });

const pearAffected = new Set(
  Object.entries(BODY_TYPE_PRIORITY_BOOSTS.pear)
    .filter(([, v]) => v !== 0)
    .map(([k]) => k as ItemCategory),
);

let allPearDeltasCorrect = true;
for (const slot of noPearBoost) {
  const boosted = withPearBoost.find(s => s.id === slot.id);
  if (!boosted) continue;
  const expectedDelta = pearAffected.has(slot.category) ? (BODY_TYPE_PRIORITY_BOOSTS.pear[slot.category] ?? 0) : 0;
  if (boosted.priority !== slot.priority + expectedDelta) {
    allPearDeltasCorrect = false;
  }
}
assert(allPearDeltasCorrect, 'pear boost: affected categories get the correct delta, others unchanged');
assert(isSorted(withPearBoost), 'pear boost: output remains sorted after body-type adjustment');

// Spot-check: top item priority decreased by 1.
const topSlotBaseline = noPearBoost.find(s => s.category === 'top');
const topSlotBoosted  = withPearBoost.find(s => s.id === topSlotBaseline?.id);
if (topSlotBaseline && topSlotBoosted) {
  assert(
    topSlotBoosted.priority === topSlotBaseline.priority - 1,
    'pear boost spot-check: top item priority reduced by 1',
  );
}

// Spot-check: bottom item priority unchanged.
const botSlotBaseline = noPearBoost.find(s => s.category === 'bottom');
const botSlotBoosted  = withPearBoost.find(s => s.id === botSlotBaseline?.id);
if (botSlotBaseline && botSlotBoosted) {
  assert(
    botSlotBoosted.priority === botSlotBaseline.priority,
    'pear boost spot-check: bottom item priority unchanged',
  );
}

// apple body type: outerwear -1, bottom -1, dress +1.
const withApple = buildProfileBlueprintSlots({ styleGoalPrimary: 'bold', bodyType: 'apple' });
const noApple   = buildProfileBlueprintSlots({ styleGoalPrimary: 'bold' });
assert(isSorted(withApple), 'apple boost: output remains sorted');

const appleBoosts = BODY_TYPE_PRIORITY_BOOSTS.apple;
let allAppleDeltasCorrect = true;
for (const slot of noApple) {
  const boosted = withApple.find(s => s.id === slot.id);
  if (!boosted) continue;
  const expectedDelta = appleBoosts[slot.category] ?? 0;
  if (boosted.priority !== slot.priority + expectedDelta) {
    allAppleDeltasCorrect = false;
  }
}
assert(allAppleDeltasCorrect, 'apple boost: outerwear/bottom -1, dress +1, others unchanged');

// ─────────────────────────────────────────────────────────────────────────────
// 5. Constraint filtering
// ─────────────────────────────────────────────────────────────────────────────

console.log('\ngetProfileBlueprint — constraint filtering:');

// ── noSleeveless: tank-top removed from top category ──────────────────────────
// 'minimal' includes a tank-top (min-top-1).
const withSleeveless    = buildProfileBlueprintSlots({ styleGoalPrimary: 'minimal' });
const noSleevelessSlots = buildProfileBlueprintSlots({
  styleGoalPrimary: 'minimal',
  constraints: { noSleeveless: true },
});

assert(
  !noSleevelessSlots.some(s => s.category === 'top' && s.subType === 'tank-top'),
  'noSleeveless: no tank-top in result',
);
if (withSleeveless.some(s => s.category === 'top' && s.subType === 'tank-top')) {
  assert(
    noSleevelessSlots.length < withSleeveless.length,
    'noSleeveless: list is shorter than unrestricted',
  );
}
assert(isSorted(noSleevelessSlots), 'noSleeveless: output remains sorted');

// Non-sleeveless tops still present.
assert(
  noSleevelessSlots.some(s => s.category === 'top' && s.subType !== 'tank-top'),
  'noSleeveless: non-sleeveless tops still present',
);

// ── noShortSkirts: mini-skirt and mini-dress removed ──────────────────────────
// 'youthful' contains a mini-skirt.
const noShortSkirtsSlots = buildProfileBlueprintSlots({
  styleGoalPrimary: 'youthful',
  constraints: { noShortSkirts: true },
});

assert(
  !noShortSkirtsSlots.some(s => s.subType === 'mini-skirt'),
  'noShortSkirts: no mini-skirt',
);
assert(
  !noShortSkirtsSlots.some(s => s.subType === 'mini-dress'),
  'noShortSkirts: no mini-dress',
);
assert(isSorted(noShortSkirtsSlots), 'noShortSkirts: output remains sorted');

// ── flat heels: heels in shoes category removed ───────────────────────────────
// 'bold' and 'romantic' include heels.
const flatHeelsSlots = buildProfileBlueprintSlots({
  styleGoalPrimary: 'bold',
  constraints: { maxHeelHeight: 'flat' },
});
const withHeels = buildProfileBlueprintSlots({ styleGoalPrimary: 'bold' });

assert(
  !flatHeelsSlots.some(s => s.category === 'shoes' && s.subType === 'heels'),
  'flat heels: no heels in shoes category',
);
if (withHeels.some(s => s.category === 'shoes' && s.subType === 'heels')) {
  assert(
    flatHeelsSlots.length < withHeels.length,
    'flat heels: list is shorter than unrestricted',
  );
}
assert(
  flatHeelsSlots.some(s => s.category === 'shoes'),
  'flat heels: other shoe types still present',
);
assert(isSorted(flatHeelsSlots), 'flat heels: output remains sorted');

// ── Combined constraints ───────────────────────────────────────────────────────
const multiConstraint = buildProfileBlueprintSlots({
  styleGoalPrimary: 'classic',
  constraints: {
    noSleeveless: true,
    noShortSkirts: true,
    maxHeelHeight: 'flat',
  },
});

assert(
  !multiConstraint.some(s => s.category === 'top' && s.subType === 'tank-top'),
  'multi-constraint: no tank-top',
);
assert(
  !multiConstraint.some(s => s.subType === 'mini-skirt' || s.subType === 'mini-dress'),
  'multi-constraint: no mini-skirt or mini-dress',
);
assert(
  !multiConstraint.some(s => s.category === 'shoes' && s.subType === 'heels'),
  'multi-constraint: no heels',
);
assert(isSorted(multiConstraint), 'multi-constraint: output remains sorted');

// ─────────────────────────────────────────────────────────────────────────────
// 6. Lifestyle weights influence ordering
//    High events lifestyle boosts dress/jewelry (LIFESTYLE_CATEGORY_WEIGHTS.events:
//    dress +2, jewelry +2 → lower priority numbers → appear earlier in sorted list).
// ─────────────────────────────────────────────────────────────────────────────

console.log('\ngetProfileBlueprint — lifestyle weight ordering:');

const eveningHeavy = buildProfileBlueprintSlots({
  styleGoalPrimary: 'classic',
  lifestyleEvents: 80,
  lifestyleWork:   10,
  lifestyleCasual: 10,
});

const allCasual = buildProfileBlueprintSlots({
  styleGoalPrimary: 'classic',
  lifestyleEvents: 0,
  lifestyleCasual: 100,
});

assert(isSorted(eveningHeavy), 'lifestyle events-heavy: output is sorted');
assert(isSorted(allCasual),    'lifestyle all-casual: output is sorted');

// In the events-heavy profile, dress items should have a numerically lower
// (better) priority value than in the casual profile because the events
// lifestyle weight applies a -2 boost to the dress category.
const evDress  = eveningHeavy.find(s => s.category === 'dress');
const casDress = allCasual.find(s => s.id === evDress?.id);
if (evDress && casDress) {
  assert(
    evDress.priority < casDress.priority,
    'lifestyle events-heavy: dress items have strictly lower (better) priority than casual profile',
  );
}

// Jewelry should also be boosted by the events lifestyle weight (-2).
const evJewel  = eveningHeavy.find(s => s.category === 'jewelry');
const casJewel = allCasual.find(s => s.id === evJewel?.id);
if (evJewel && casJewel) {
  assert(
    evJewel.priority < casJewel.priority,
    'lifestyle events-heavy: jewelry items have strictly lower (better) priority than casual profile',
  );
}

// All-active lifestyle: shoes/bottom get the active weight boost.
const allActive = buildProfileBlueprintSlots({
  styleGoalPrimary: 'classic',
  lifestyleActive: 100,
});
assert(isSorted(allActive), 'lifestyle all-active: output is sorted');

// Active lifestyle pushes bottom and shoes earlier (LIFESTYLE_CATEGORY_WEIGHTS.active:
// bottom +2, shoes +2 → lower priority).
const actBottom = allActive.find(s => s.category === 'bottom');
const casBottom = allCasual.find(s => s.id === actBottom?.id);
if (actBottom && casBottom) {
  assert(
    actBottom.priority < casBottom.priority,
    'lifestyle all-active: bottom items have lower priority than all-casual profile',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Real function used — verify BODY_TYPE_PRIORITY_BOOSTS source of truth
//    Confirms the exported constant from blueprintCore.ts is the live one.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\ngetProfileBlueprint — BODY_TYPE_PRIORITY_BOOSTS source of truth:');

assert(
  typeof BODY_TYPE_PRIORITY_BOOSTS === 'object',
  'BODY_TYPE_PRIORITY_BOOSTS is an object (loaded from blueprintCore)',
);
assert(
  Object.keys(BODY_TYPE_PRIORITY_BOOSTS).length === 6,
  'BODY_TYPE_PRIORITY_BOOSTS has entries for all 6 body types',
);

// Verify every blueprint slot's category is a valid ItemCategory —
// this exercises STYLE_BLUEPRINT_SLOTS through the real function.
const allCategories = new Set<string>([
  'top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry',
]);
for (const goal of STYLE_GOALS) {
  const slots = buildProfileBlueprintSlots({ styleGoalPrimary: goal });
  assert(
    slots.every(s => allCategories.has(s.category)),
    `${goal}: every slot category is a valid ItemCategory`,
  );
}

// Confirm STYLE_BLUEPRINT_SLOTS and buildProfileBlueprintSlots agree on counts
// (no slots silently dropped or duplicated when no constraints or lifestyle set).
for (const goal of STYLE_GOALS) {
  const rawCount  = STYLE_BLUEPRINT_SLOTS[goal].length;
  const builtSlots = buildProfileBlueprintSlots({ styleGoalPrimary: goal });
  assert(
    builtSlots.length === rawCount,
    `${goal}: buildProfileBlueprintSlots returns the same number of slots as STYLE_BLUEPRINT_SLOTS (${rawCount})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall getProfileBlueprint assertions passed');
