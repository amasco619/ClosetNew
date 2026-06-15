/**
 * Unit tests: lifestyle weights influence blueprint slot order.
 *
 * Imports the real production helpers from constants/blueprintPriority.ts —
 * the same module that getProfileBlueprint delegates to.  Any change to
 * LIFESTYLE_CATEGORY_WEIGHTS or applyLifestyleWeights in production will
 * therefore be caught by these tests.
 *
 * constants/wardrobeBlueprint.ts cannot be imported directly in tsx/Node
 * because its module-level SAMPLE_IMAGES object calls require() on PNG asset
 * files that Node cannot parse.  By extracting the pure priority logic into
 * constants/blueprintPriority.ts (no asset dependencies), we can test the
 * real algorithm without any mocking.
 *
 * Invariants verified:
 *   1. High lifestyleActive  → shoes and bottom slots rank above jewelry/dress
 *   2. High lifestyleBrunch  → dress and bag slots rank higher
 *   3. All-zero lifestyle    → blueprint order unchanged from base priorities
 *   4. work / casual / events adjustments covered (regression guard)
 *
 * Run: `npx tsx __tests__/lifestyle-blueprint.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  LIFESTYLE_CATEGORY_WEIGHTS,
  applyLifestyleWeights,
} from '../constants/blueprintPriority';
import type { ItemCategory } from '../constants/types';
import type { PrioritisedSlot, LifestyleValues } from '../constants/blueprintPriority';

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

/**
 * Returns true when every category in `before` appears strictly earlier than
 * every category in `after` within the sorted slot list.
 */
function allBefore(
  sorted: PrioritisedSlot[],
  before: ItemCategory[],
  after: ItemCategory[],
): boolean {
  const lastBeforeIdx = Math.max(
    ...before.map(cat => sorted.map(s => s.category).lastIndexOf(cat)),
  );
  const firstAfterIdx = Math.min(
    ...after
      .map(cat => sorted.findIndex(s => s.category === cat))
      .filter(i => i !== -1),
  );
  return lastBeforeIdx < firstAfterIdx;
}

/**
 * One representative slot per category, all with EQUAL base priority.
 * Using equal priorities isolates lifestyle as the sole differentiator.
 */
function makeEqualSlots(basePriority = 5): Array<PrioritisedSlot & { id: string }> {
  const categories: ItemCategory[] = ['top', 'bottom', 'outerwear', 'shoes', 'jewelry', 'dress', 'bag'];
  return categories.map(cat => ({ id: cat, category: cat, priority: basePriority }));
}

// ── Sanity: verify constants are loaded from the real module ──────────────────

console.log('\nSanity — LIFESTYLE_CATEGORY_WEIGHTS loaded from production module:');

assert(
  typeof LIFESTYLE_CATEGORY_WEIGHTS === 'object'
  && Object.keys(LIFESTYLE_CATEGORY_WEIGHTS).length === 5,
  'LIFESTYLE_CATEGORY_WEIGHTS has exactly 5 scenario keys (work/casual/events/active/brunch)',
);
assert(
  LIFESTYLE_CATEGORY_WEIGHTS.active.shoes === 2,
  'active.shoes weight is 2 (production value)',
);
assert(
  LIFESTYLE_CATEGORY_WEIGHTS.brunch.dress === 2,
  'brunch.dress weight is 2 (production value)',
);
assert(
  LIFESTYLE_CATEGORY_WEIGHTS.work.outerwear === 2,
  'work.outerwear weight is 2 (production value)',
);
assert(
  LIFESTYLE_CATEGORY_WEIGHTS.events.jewelry === 2,
  'events.jewelry weight is 2 (production value)',
);

// ── 1. All-zero lifestyle ─────────────────────────────────────────────────────

console.log('\nAll-zero lifestyle:');

{
  // Varied base priorities prove the guard (totalLifestyle === 0 → no adjustments).
  const base: Array<PrioritisedSlot & { id: string }> = [
    { id: 'dress',    category: 'dress',    priority: 1 },
    { id: 'shoes',    category: 'shoes',    priority: 2 },
    { id: 'bag',      category: 'bag',      priority: 3 },
    { id: 'top',      category: 'top',      priority: 4 },
    { id: 'bottom',   category: 'bottom',   priority: 5 },
    { id: 'jewelry',  category: 'jewelry',  priority: 6 },
    { id: 'outerwear',category: 'outerwear',priority: 7 },
  ];
  const zero: LifestyleValues = { work: 0, casual: 0, events: 0, active: 0, brunch: 0 };
  const sorted = applyLifestyleWeights(base, zero);

  assert(
    sorted.every((s, i) => s.id === base[i].id),
    'all-zero lifestyle preserves original base-priority order exactly',
  );
  assert(
    sorted.map(s => s.priority).every((p, i, arr) => i === 0 || p >= arr[i - 1]),
    'all-zero lifestyle: result is sorted ascending by priority',
  );
}

// ── 2. High lifestyleActive ───────────────────────────────────────────────────

console.log('\nHigh lifestyleActive (80 active / 10 work / 10 casual):');

{
  const sorted = applyLifestyleWeights(
    makeEqualSlots(),
    { work: 10, casual: 10, events: 0, active: 80, brunch: 0 },
  );

  assert(
    allBefore(sorted, ['shoes', 'bottom'], ['jewelry', 'dress']),
    'shoes and bottom rank before jewelry and dress when active is dominant',
  );

  const shoesIdx   = sorted.findIndex(s => s.category === 'shoes');
  const bottomIdx  = sorted.findIndex(s => s.category === 'bottom');
  const jewelryIdx = sorted.findIndex(s => s.category === 'jewelry');
  const dressIdx   = sorted.findIndex(s => s.category === 'dress');

  assert(shoesIdx  < jewelryIdx, 'shoes ranks above jewelry');
  assert(shoesIdx  < dressIdx,   'shoes ranks above dress');
  assert(bottomIdx < jewelryIdx, 'bottom ranks above jewelry');
  assert(bottomIdx < dressIdx,   'bottom ranks above dress');
}

// Extreme: active = 100%
{
  const sorted = applyLifestyleWeights(
    makeEqualSlots(),
    { work: 0, casual: 0, events: 0, active: 100, brunch: 0 },
  );

  assert(
    allBefore(sorted, ['shoes', 'bottom'], ['jewelry', 'dress']),
    'shoes and bottom rank before jewelry and dress when active is 100 %',
  );

  const shoesIdx   = sorted.findIndex(s => s.category === 'shoes');
  const bottomIdx  = sorted.findIndex(s => s.category === 'bottom');
  const jewelryIdx = sorted.findIndex(s => s.category === 'jewelry');
  const dressIdx   = sorted.findIndex(s => s.category === 'dress');

  assert(shoesIdx  < jewelryIdx, '100 % active: shoes ranks above jewelry');
  assert(bottomIdx < dressIdx,   '100 % active: bottom ranks above dress');
}

// ── 3. High lifestyleBrunch ───────────────────────────────────────────────────

console.log('\nHigh lifestyleBrunch (80 brunch / 10 work / 10 casual):');

{
  const sorted = applyLifestyleWeights(
    makeEqualSlots(),
    { work: 10, casual: 10, events: 0, active: 0, brunch: 80 },
  );

  const dressIdx  = sorted.findIndex(s => s.category === 'dress');
  const bagIdx    = sorted.findIndex(s => s.category === 'bag');
  const bottomIdx = sorted.findIndex(s => s.category === 'bottom');

  assert(dressIdx < bottomIdx, 'dress ranks above bottom when brunch is dominant');
  assert(bagIdx   < bottomIdx, 'bag ranks above bottom when brunch is dominant');

  assert(
    allBefore(sorted, ['dress', 'bag'], ['bottom']),
    'dress and bag rank higher (lower index) than bottom when brunch dominates',
  );
}

// Extreme: brunch = 100%
{
  const sorted = applyLifestyleWeights(
    makeEqualSlots(),
    { work: 0, casual: 0, events: 0, active: 0, brunch: 100 },
  );

  const dressIdx  = sorted.findIndex(s => s.category === 'dress');
  const bagIdx    = sorted.findIndex(s => s.category === 'bag');
  const bottomIdx = sorted.findIndex(s => s.category === 'bottom');

  assert(dressIdx < bottomIdx, 'brunch 100 %: dress ranks above bottom');
  assert(bagIdx   < bottomIdx, 'brunch 100 %: bag ranks above bottom');
}

// ── 4. High lifestyleWork (regression guard) ──────────────────────────────────

console.log('\nHigh lifestyleWork (80 work / 20 casual):');

{
  const sorted = applyLifestyleWeights(
    makeEqualSlots(),
    { work: 80, casual: 20, events: 0, active: 0, brunch: 0 },
  );

  const outerwearIdx = sorted.findIndex(s => s.category === 'outerwear');
  const topIdx       = sorted.findIndex(s => s.category === 'top');
  const bottomIdx    = sorted.findIndex(s => s.category === 'bottom');

  assert(
    outerwearIdx < topIdx && outerwearIdx < bottomIdx,
    'work lifestyle: outerwear ranks above top and bottom (highest work weight = 2)',
  );
  assert(
    sorted.map(s => s.priority).every((p, i, arr) => i === 0 || p >= arr[i - 1]),
    'work lifestyle: result is sorted ascending by adjusted priority',
  );
}

// ── 5. High lifestyleEvents (regression guard) ────────────────────────────────

console.log('\nHigh lifestyleEvents (80 events / 20 casual):');

{
  const sorted = applyLifestyleWeights(
    makeEqualSlots(),
    { work: 0, casual: 20, events: 80, active: 0, brunch: 0 },
  );

  const dressIdx   = sorted.findIndex(s => s.category === 'dress');
  const jewelryIdx = sorted.findIndex(s => s.category === 'jewelry');
  const topIdx     = sorted.findIndex(s => s.category === 'top');
  const bottomIdx  = sorted.findIndex(s => s.category === 'bottom');

  assert(dressIdx   < topIdx,    'events lifestyle: dress ranks above top');
  assert(dressIdx   < bottomIdx, 'events lifestyle: dress ranks above bottom');
  assert(jewelryIdx < topIdx,    'events lifestyle: jewelry ranks above top');
  assert(jewelryIdx < bottomIdx, 'events lifestyle: jewelry ranks above bottom');
}

// ── 6. High lifestyleCasual (regression guard) ────────────────────────────────

console.log('\nHigh lifestyleCasual (80 casual / 20 work):');

{
  const sorted = applyLifestyleWeights(
    makeEqualSlots(),
    { work: 20, casual: 80, events: 0, active: 0, brunch: 0 },
  );

  const shoesIdx   = sorted.findIndex(s => s.category === 'shoes');
  const dressIdx   = sorted.findIndex(s => s.category === 'dress');
  const jewelryIdx = sorted.findIndex(s => s.category === 'jewelry');

  assert(shoesIdx < dressIdx,   'casual lifestyle: shoes rank above dress');
  assert(shoesIdx < jewelryIdx, 'casual lifestyle: shoes rank above jewelry');
}

// ── 7. Mixed lifestyle — active + brunch together ─────────────────────────────

console.log('\nMixed lifestyle:');

{
  // At exactly 50/50, Math.round(0.5) === 1 in JS, so dress, bag, and jewelry
  // all receive a rounded weight of 1 and tie at the same adjusted priority.
  // Only shoes (weight 1.5 → rounds to 2) clearly separates from the pack.
  const sorted = applyLifestyleWeights(
    makeEqualSlots(),
    { work: 0, casual: 0, events: 0, active: 50, brunch: 50 },
  );

  const shoesIdx   = sorted.findIndex(s => s.category === 'shoes');
  const jewelryIdx = sorted.findIndex(s => s.category === 'jewelry');
  const dressIdx   = sorted.findIndex(s => s.category === 'dress');
  const bagIdx     = sorted.findIndex(s => s.category === 'bag');

  assert(shoesIdx < jewelryIdx, '50/50 active+brunch: shoes rank above jewelry');
  assert(shoesIdx < dressIdx,   '50/50 active+brunch: shoes rank above dress (highest combined weight)');
  assert(shoesIdx < bagIdx,     '50/50 active+brunch: shoes rank above bag');
}

// At 20 active / 80 brunch the brunch signal dominates clearly:
// dress+bag weight = 1.6 → rounds to 2; jewelry weight = 0.8 → rounds to 1.
{
  const sorted = applyLifestyleWeights(
    makeEqualSlots(),
    { work: 0, casual: 0, events: 0, active: 20, brunch: 80 },
  );

  const dressIdx   = sorted.findIndex(s => s.category === 'dress');
  const bagIdx     = sorted.findIndex(s => s.category === 'bag');
  const jewelryIdx = sorted.findIndex(s => s.category === 'jewelry');
  const bottomIdx  = sorted.findIndex(s => s.category === 'bottom');

  assert(dressIdx < jewelryIdx, 'brunch-dominant mix: dress ranks above jewelry');
  assert(bagIdx   < jewelryIdx, 'brunch-dominant mix: bag ranks above jewelry');
  assert(dressIdx < bottomIdx,  'brunch-dominant mix: dress ranks above bottom');
  assert(bagIdx   < bottomIdx,  'brunch-dominant mix: bag ranks above bottom');
}

// ── 8. Identical base priorities — lifestyle as the sole tie-breaker ──────────

console.log('\nIdentical base priorities — lifestyle tie-breaking:');

{
  const tied: Array<PrioritisedSlot & { id: string }> = [
    { id: 'jewelry', category: 'jewelry', priority: 5 },
    { id: 'dress',   category: 'dress',   priority: 5 },
    { id: 'shoes',   category: 'shoes',   priority: 5 },
    { id: 'bottom',  category: 'bottom',  priority: 5 },
  ];

  const sorted = applyLifestyleWeights(
    tied,
    { work: 0, casual: 0, events: 0, active: 100, brunch: 0 },
  );

  const shoesIdx   = sorted.findIndex(s => s.id === 'shoes');
  const bottomIdx  = sorted.findIndex(s => s.id === 'bottom');
  const jewelryIdx = sorted.findIndex(s => s.id === 'jewelry');
  const dressIdx   = sorted.findIndex(s => s.id === 'dress');

  assert(shoesIdx  < jewelryIdx, 'tie-breaking: shoes before jewelry with active lifestyle');
  assert(bottomIdx < jewelryIdx, 'tie-breaking: bottom before jewelry with active lifestyle');
  assert(shoesIdx  < dressIdx,   'tie-breaking: shoes before dress with active lifestyle');
  assert(bottomIdx < dressIdx,   'tie-breaking: bottom before dress with active lifestyle');
}

// ── 9. Proportionality — increasing active further boosts shoes/bottom ────────

console.log('\nProportionality — active weight grows with proportion:');

{
  const lowActive: LifestyleValues  = { work: 20, casual: 50, events: 30, active: 10, brunch: 0 };
  const highActive: LifestyleValues = { work: 10, casual: 10, events:  0, active: 80, brunch: 0 };

  const singleShoes: Array<PrioritisedSlot & { id: string }> =
    [{ id: 'shoes', category: 'shoes', priority: 10 }];
  const singleJewelry: Array<PrioritisedSlot & { id: string }> =
    [{ id: 'jewelry', category: 'jewelry', priority: 10 }];

  const shoesLow  = applyLifestyleWeights(singleShoes,   lowActive)[0].priority;
  const shoesHigh = applyLifestyleWeights(singleShoes,   highActive)[0].priority;
  const jewLow    = applyLifestyleWeights(singleJewelry, lowActive)[0].priority;
  const jewHigh   = applyLifestyleWeights(singleJewelry, highActive)[0].priority;

  assert(
    shoesHigh <= shoesLow,
    'shoes: adjusted priority decreases (or stays equal) as active proportion grows',
  );
  assert(
    jewHigh >= jewLow,
    'jewelry: adjusted priority increases (or stays equal) as active proportion grows',
  );
  assert(
    shoesHigh < jewHigh,
    'high-active: shoes adjusted priority is lower than jewelry adjusted priority',
  );
}

// ── Exit ──────────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll lifestyle-blueprint tests passed.');
}
