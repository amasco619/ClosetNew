/**
 * Tests for the getProfileBlueprint algorithm — implemented using the
 * asset-free modules (blueprintSlots.ts + blueprintPriority.ts) so the suite
 * runs safely in a Node/tsx environment without triggering PNG require() calls.
 *
 * Strategy: replicate the pure algorithmic core of getProfileBlueprint using
 * the canonical slot data from blueprintSlots.ts and the priority helpers from
 * blueprintPriority.ts, then verify observable behaviour across all 6 style
 * goals, constraint filters, body-type boosts, secondary merges, and lifestyle
 * weight ordering.
 */

import { STYLE_BLUEPRINT_SLOTS, STYLE_GOALS } from '../constants/blueprintSlots';
import { applyLifestyleWeights } from '../constants/blueprintPriority';
import type { ItemCategory, StyleGoal } from '../constants/types';

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

// ── Local copy of BODY_TYPE_PRIORITY_BOOSTS ────────────────────────────────────
// This map is private in wardrobeBlueprint.ts — we replicate it here so the
// test can verify body-type boost behaviour without importing the asset-heavy
// module. Must stay in sync with the source of truth.

const BODY_TYPE_PRIORITY_BOOSTS: Record<string, Partial<Record<ItemCategory, number>>> = {
  hourglass:           { dress: -1 },
  pear:                { top: -1, jewelry: -1, outerwear: -1 },
  apple:               { outerwear: -1, bottom: -1, dress: 1 },
  rectangle:           { outerwear: -1, dress: -1, jewelry: -1 },
  'inverted-triangle': { bottom: -1, shoes: -1 },
  athletic:            { dress: -1, outerwear: -1, jewelry: -1 },
};

// ── Local copy of the getProfileBlueprint algorithm ───────────────────────────
// Mirrors wardrobeBlueprint.ts getProfileBlueprint exactly, operating on the
// imageKey-free SlotMeta type from blueprintSlots.ts.

interface TestProfile {
  styleGoalPrimary: string | null;
  styleGoalSecondary?: string | null;
  bodyType?: string | null;
  lifestyleWork?: number;
  lifestyleCasual?: number;
  lifestyleEvents?: number;
  lifestyleActive?: number;
  lifestyleBrunch?: number;
  constraints?: {
    noSleeveless?: boolean;
    noShortSkirts?: boolean;
    maxHeelHeight?: string;
  };
}

interface Slot {
  id: string;
  category: ItemCategory;
  subType: string;
  colorFamily: string;
  priority: number;
  label: string;
  description: string;
}

function buildBlueprint(profile: TestProfile): Slot[] {
  const primaryGoal = profile.styleGoalPrimary as StyleGoal | null;

  // No primary goal → fall back to classic (same as WARDROBE_BLUEPRINT).
  const sourceGoal: StyleGoal = primaryGoal ?? 'classic';
  let items: Slot[] = STYLE_BLUEPRINT_SLOTS[sourceGoal].map(
    ({ imageKey: _imageKey, ...rest }) => ({ ...rest }),
  );

  // Merge unique secondary-goal items at priority+10.
  if (profile.styleGoalSecondary) {
    const secondaryGoal = profile.styleGoalSecondary as StyleGoal;
    const existingIds = new Set(items.map(i => `${i.category}-${i.subType}-${i.colorFamily}`));
    for (const sItem of STYLE_BLUEPRINT_SLOTS[secondaryGoal]) {
      const key = `${sItem.category}-${sItem.subType}-${sItem.colorFamily}`;
      if (!existingIds.has(key)) {
        const { imageKey: _imageKey, ...rest } = sItem;
        items.push({ ...rest, priority: rest.priority + 10 });
        existingIds.add(key);
      }
    }
  }

  // Apply body-type priority boosts.
  if (profile.bodyType && BODY_TYPE_PRIORITY_BOOSTS[profile.bodyType]) {
    const boosts = BODY_TYPE_PRIORITY_BOOSTS[profile.bodyType];
    items = items.map(item => ({
      ...item,
      priority: item.priority + (boosts[item.category] ?? 0),
    }));
  }

  // Apply lifestyle weights (returns sorted by priority ascending).
  items = applyLifestyleWeights(items, {
    work:   profile.lifestyleWork   ?? 0,
    casual: profile.lifestyleCasual ?? 0,
    events: profile.lifestyleEvents ?? 0,
    active: profile.lifestyleActive ?? 0,
    brunch: profile.lifestyleBrunch ?? 0,
  });

  // Constraint filters.
  if (profile.constraints?.maxHeelHeight === 'flat') {
    items = items.filter(
      item => !(item.category === 'shoes' && item.subType === 'heels'),
    );
  }
  if (profile.constraints?.noSleeveless) {
    items = items.filter(
      item => !(item.category === 'top' && item.subType === 'tank-top'),
    );
  }
  if (profile.constraints?.noShortSkirts) {
    items = items.filter(
      item => !(item.subType === 'mini-skirt' || item.subType === 'mini-dress'),
    );
  }

  // Final sort (constraint filtering preserves order; explicit sort is
  // authoritative, matching getProfileBlueprint exactly).
  items.sort((a, b) => a.priority - b.priority);
  return items;
}

// ── Helper: verify ascending priority order ───────────────────────────────────

function isSorted(items: Slot[]): boolean {
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
  const slots = buildBlueprint({ styleGoalPrimary: goal });
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

const noGoalSlots  = buildBlueprint({ styleGoalPrimary: null });
const classicSlots = buildBlueprint({ styleGoalPrimary: 'classic' });

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

const primaryOnly    = buildBlueprint({ styleGoalPrimary: 'minimal' });
const withSecondary  = buildBlueprint({
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

const noPearBoost  = buildBlueprint({ styleGoalPrimary: 'minimal' });
const withPearBoost = buildBlueprint({ styleGoalPrimary: 'minimal', bodyType: 'pear' });

const pearAffected = new Set<ItemCategory>(['top', 'jewelry', 'outerwear']);

let allPearDeltasCorrect = true;
for (const slot of noPearBoost) {
  const boosted = withPearBoost.find(s => s.id === slot.id);
  if (!boosted) continue;
  const expectedDelta = pearAffected.has(slot.category) ? -1 : 0;
  if (boosted.priority !== slot.priority + expectedDelta) {
    allPearDeltasCorrect = false;
  }
}
assert(allPearDeltasCorrect, 'pear boost: affected categories get -1, others unchanged');
assert(isSorted(withPearBoost), 'pear boost: output remains sorted after body-type adjustment');

// Spot-check: top item priority decreased.
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
const withApple = buildBlueprint({ styleGoalPrimary: 'bold', bodyType: 'apple' });
const noApple   = buildBlueprint({ styleGoalPrimary: 'bold' });
assert(isSorted(withApple), 'apple boost: output remains sorted');

const appleAffected: Partial<Record<ItemCategory, number>> = { outerwear: -1, bottom: -1, dress: 1 };
let allAppleDeltasCorrect = true;
for (const slot of noApple) {
  const boosted = withApple.find(s => s.id === slot.id);
  if (!boosted) continue;
  const expectedDelta = appleAffected[slot.category] ?? 0;
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
const withSleeveless   = buildBlueprint({ styleGoalPrimary: 'minimal' });
const noSleevelessSlots = buildBlueprint({
  styleGoalPrimary: 'minimal',
  constraints: { noSleeveless: true },
});

assert(
  !noSleevelessSlots.some(s => s.category === 'top' && s.subType === 'tank-top'),
  'noSleeveless: no tank-top in result',
);
// Verify the tank-top WAS present before the filter (guards against a false pass).
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
const noShortSkirtsSlots = buildBlueprint({
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
const flatHeelsSlots = buildBlueprint({
  styleGoalPrimary: 'bold',
  constraints: { maxHeelHeight: 'flat' },
});
const withHeels = buildBlueprint({ styleGoalPrimary: 'bold' });

assert(
  !flatHeelsSlots.some(s => s.category === 'shoes' && s.subType === 'heels'),
  'flat heels: no heels in shoes category',
);
// Verify heels were present before the filter.
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
const multiConstraint = buildBlueprint({
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

const eveningHeavy = buildBlueprint({
  styleGoalPrimary: 'classic',
  lifestyleEvents: 80,
  lifestyleWork:   10,
  lifestyleCasual: 10,
});

const allCasual = buildBlueprint({
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
const allActive = buildBlueprint({
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
// Summary
// ─────────────────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall getProfileBlueprint assertions passed');
