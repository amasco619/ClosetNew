/**
 * Regression tests for outfit-group completion logic.
 *
 * Covers generateRecommendedOutfitGroups and computeNextSmartBuy from
 * constants/outfitGroupsCore.ts — the asset-free module that wardrobeBlueprint.ts
 * delegates to. No PNG require() calls are triggered in this suite.
 *
 * Sections:
 *   1. generateRecommendedOutfitGroups — recipe path
 *      a. Empty slot list → empty result
 *      b. All slots needed → every group has isComplete false
 *      c. All slots owned → every group has isComplete true
 *      d. Mixed ownership → only groups where every slot is owned are complete
 *      e. Recipe skipped when a referenced slot is missing
 *      f. Recipe label/vibe/rationale passed through correctly
 *
 *   2. generateRecommendedOutfitGroups — positional fallback
 *      a. Slots without a recognised style-goal prefix → fallback used
 *      b. No shoes → empty result even with tops/bottoms/dresses
 *      c. Top+bottom+shoe groups produced in priority order
 *      d. Dress+shoe groups appended after top+bottom groups
 *      e. isComplete flag correct in fallback groups
 *
 *   3. computeNextSmartBuy
 *      a. All groups complete → returns null
 *      b. One-missing unlock detected → isDirectUnlock true, unlocks ≥ 1
 *      c. One slot missing from multiple groups → highest unlock count wins
 *      d. No group is one-away → most-common-needed fallback
 *      e. Tie on unlock count → lower priority number wins
 *      f. Tie on both unlock count and priority → lexicographically smaller id wins
 *
 *   4. OUTFIT_RECIPES structural invariants
 *      a. Every style-goal has at least one recipe pair that shares a slotId
 *         (ensures 3c is always exercisable and never silently skipped)
 *
 * Run: `npx tsx __tests__/outfitGroupCompletion.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  generateRecommendedOutfitGroups,
  computeNextSmartBuy,
  OUTFIT_RECIPES,
} from '../constants/outfitGroupsCore';
import type { CoreWardrobeSlot } from '../constants/outfitGroupsCore';

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

// ── Slot factory ──────────────────────────────────────────────────────────────

let _counter = 0;
function makeSlot(
  overrides: Partial<CoreWardrobeSlot> & { id: string; status: 'needed' | 'owned' },
): CoreWardrobeSlot {
  _counter++;
  return {
    category: 'top',
    subType: 't-shirt',
    colorFamily: 'white',
    priority: _counter,
    label: `Slot ${overrides.id}`,
    description: '',
    sampleImage: null,
    ...overrides,
  };
}

/**
 * Build a minimal set of slots that exactly satisfies the first recipe for the
 * given style-goal prefix, with the specified statuses per slotId.
 */
function recipeSlotsFor(
  prefix: 'cls' | 'yth' | 'min' | 'elv' | 'bld' | 'rom',
  recipeIndex: number,
  statuses: Record<string, 'needed' | 'owned'>,
): CoreWardrobeSlot[] {
  const goalMap: Record<string, keyof typeof OUTFIT_RECIPES> = {
    cls: 'classic', yth: 'youthful', min: 'minimal',
    elv: 'elevated', bld: 'bold',   rom: 'romantic',
  };
  const goal = goalMap[prefix];
  const recipe = OUTFIT_RECIPES[goal][recipeIndex];
  return recipe.slotIds.map(id => makeSlot({
    id,
    status: statuses[id] ?? 'needed',
    category: id.includes('-top-') ? 'top'
      : id.includes('-bot-') ? 'bottom'
      : id.includes('-drs-') ? 'dress'
      : id.includes('-out-') ? 'outerwear'
      : id.includes('-sho-') ? 'shoes'
      : id.includes('-bag-') ? 'bag'
      : 'jewelry',
    priority: 1,
  }));
}

// =============================================================================
// 1. generateRecommendedOutfitGroups — recipe path
// =============================================================================

console.log('\n1a. Empty slot list returns empty array');
{
  const groups = generateRecommendedOutfitGroups([]);
  assert(groups.length === 0, 'empty slots → 0 groups');
}

console.log('\n1b. All slots needed → every group is incomplete');
{
  const recipe = OUTFIT_RECIPES.classic[0];
  const slots = recipe.slotIds.map((id, i) => makeSlot({
    id,
    status: 'needed',
    category: 'top',
    priority: i + 1,
  }));
  const groups = generateRecommendedOutfitGroups(slots);
  assert(groups.length > 0, 'at least one group produced');
  assert(groups.every(g => !g.isComplete), 'all groups are incomplete when all slots needed');
}

console.log('\n1c. All slots owned → every group is complete');
{
  const recipe = OUTFIT_RECIPES.classic[0];
  const slots = recipe.slotIds.map((id, i) => makeSlot({
    id,
    status: 'owned',
    category: 'top',
    priority: i + 1,
  }));
  const groups = generateRecommendedOutfitGroups(slots);
  assert(groups.length > 0, 'at least one group produced');
  assert(groups.every(g => g.isComplete), 'all groups are complete when all slots owned');
}

console.log('\n1d. Mixed ownership → isComplete reflects per-group slot status');
{
  const clsRecipes = OUTFIT_RECIPES.classic;
  const recipe0 = clsRecipes[0];
  const recipe1 = clsRecipes[1];

  const allIds = [...new Set([...recipe0.slotIds, ...recipe1.slotIds])];
  const slots = allIds.map((id, i) => makeSlot({
    id,
    status: recipe0.slotIds.includes(id) ? 'owned' : 'needed',
    category: 'top',
    priority: i + 1,
  }));

  const groups = generateRecommendedOutfitGroups(slots);
  const group0 = groups.find(g => g.id === recipe0.id);
  const group1 = groups.find(g => g.id === recipe1.id);

  assert(!!group0, 'first recipe group present');
  assert(!!group0 && group0.isComplete, 'first group complete — all slots owned');
  assert(!!group1, 'second recipe group present');
  assert(!!group1 && !group1.isComplete, 'second group incomplete — some slots needed');
}

console.log('\n1e. Recipe skipped when a referenced slot is missing from the input');
{
  const recipe = OUTFIT_RECIPES.classic[0];
  const slotIds = recipe.slotIds.slice(0, recipe.slotIds.length - 1);
  const slots = slotIds.map((id, i) => makeSlot({ id, status: 'needed', category: 'top', priority: i + 1 }));

  const groups = generateRecommendedOutfitGroups(slots);
  const skipped = groups.find(g => g.id === recipe.id);
  assert(!skipped, 'recipe with missing slot is skipped (not surfaced)');
}

console.log('\n1f. Recipe label, vibe, and rationale are passed through');
{
  const recipe = OUTFIT_RECIPES.minimal[0];
  const slots = recipe.slotIds.map((id, i) => makeSlot({ id, status: 'needed', category: 'top', priority: i + 1 }));

  const groups = generateRecommendedOutfitGroups(slots);
  const group = groups.find(g => g.id === recipe.id);

  assert(!!group, 'group found');
  assert(group?.label === recipe.label, `label matches "${recipe.label}"`);
  assert(group?.vibe === recipe.vibe, `vibe matches "${recipe.vibe}"`);
  assert(group?.rationale === recipe.rationale, 'rationale matches');
}

// =============================================================================
// 2. generateRecommendedOutfitGroups — positional fallback
// =============================================================================

console.log('\n2a. Unknown prefix → positional fallback used (no recipe match)');
{
  const slots: CoreWardrobeSlot[] = [
    makeSlot({ id: 'cust-top-1', status: 'needed', category: 'top', priority: 1 }),
    makeSlot({ id: 'cust-bot-1', status: 'needed', category: 'bottom', priority: 1 }),
    makeSlot({ id: 'cust-sho-1', status: 'needed', category: 'shoes', priority: 1 }),
  ];
  const groups = generateRecommendedOutfitGroups(slots);
  assert(groups.length > 0, 'fallback produces groups');
  assert(groups[0].id.startsWith('look-'), 'fallback group id starts with "look-"');
}

console.log('\n2b. No shoes in fallback → empty result');
{
  const slots: CoreWardrobeSlot[] = [
    makeSlot({ id: 'cust-top-1', status: 'needed', category: 'top', priority: 1 }),
    makeSlot({ id: 'cust-bot-1', status: 'needed', category: 'bottom', priority: 1 }),
  ];
  const groups = generateRecommendedOutfitGroups(slots);
  assert(groups.length === 0, 'no shoes → 0 groups in fallback');
}

console.log('\n2c. Top+bottom groups produced in priority order');
{
  const slots: CoreWardrobeSlot[] = [
    makeSlot({ id: 'cust-top-2', status: 'needed', category: 'top', priority: 2 }),
    makeSlot({ id: 'cust-top-1', status: 'needed', category: 'top', priority: 1 }),
    makeSlot({ id: 'cust-bot-2', status: 'needed', category: 'bottom', priority: 2 }),
    makeSlot({ id: 'cust-bot-1', status: 'needed', category: 'bottom', priority: 1 }),
    makeSlot({ id: 'cust-sho-1', status: 'needed', category: 'shoes', priority: 1 }),
  ];
  const groups = generateRecommendedOutfitGroups(slots);
  const tbGroups = groups.filter(g => g.id.startsWith('look-tb-'));
  assert(tbGroups.length === 2, '2 top+bottom groups produced');
  assert(
    tbGroups[0].slots.find(s => s.category === 'top')?.id === 'cust-top-1',
    'first group uses highest-priority top',
  );
  assert(
    tbGroups[1].slots.find(s => s.category === 'top')?.id === 'cust-top-2',
    'second group uses second-priority top',
  );
}

console.log('\n2d. Dress+shoe groups appended after top+bottom groups');
{
  const slots: CoreWardrobeSlot[] = [
    makeSlot({ id: 'cust-top-1', status: 'needed', category: 'top', priority: 1 }),
    makeSlot({ id: 'cust-bot-1', status: 'needed', category: 'bottom', priority: 1 }),
    makeSlot({ id: 'cust-drs-1', status: 'needed', category: 'dress', priority: 1 }),
    makeSlot({ id: 'cust-sho-1', status: 'needed', category: 'shoes', priority: 1 }),
  ];
  const groups = generateRecommendedOutfitGroups(slots);
  const tbGroups = groups.filter(g => g.id.startsWith('look-tb-'));
  const drGroups = groups.filter(g => g.id.startsWith('look-dr-'));
  assert(tbGroups.length === 1, '1 top+bottom group');
  assert(drGroups.length === 1, '1 dress group appended');
  const tbIdx = groups.findIndex(g => g.id.startsWith('look-tb-'));
  const drIdx = groups.findIndex(g => g.id.startsWith('look-dr-'));
  assert(tbIdx < drIdx, 'top+bottom group comes before dress group');
}

console.log('\n2e. isComplete correct in fallback groups');
{
  const slots: CoreWardrobeSlot[] = [
    makeSlot({ id: 'cust-top-1', status: 'owned', category: 'top', priority: 1 }),
    makeSlot({ id: 'cust-bot-1', status: 'owned', category: 'bottom', priority: 1 }),
    makeSlot({ id: 'cust-sho-1', status: 'needed', category: 'shoes', priority: 1 }),
  ];
  const groups = generateRecommendedOutfitGroups(slots);
  assert(groups.length === 1, '1 group produced');
  assert(!groups[0].isComplete, 'group is incomplete because shoe is needed');

  const slots2: CoreWardrobeSlot[] = [
    makeSlot({ id: 'cust-top-1', status: 'owned', category: 'top', priority: 1 }),
    makeSlot({ id: 'cust-bot-1', status: 'owned', category: 'bottom', priority: 1 }),
    makeSlot({ id: 'cust-sho-1', status: 'owned', category: 'shoes', priority: 1 }),
  ];
  const groups2 = generateRecommendedOutfitGroups(slots2);
  assert(groups2.length === 1, '1 group produced');
  assert(groups2[0].isComplete, 'group is complete when all slots owned');
}

// =============================================================================
// 3. computeNextSmartBuy
// =============================================================================

console.log('\n3a. All groups complete → computeNextSmartBuy returns null');
{
  const recipe = OUTFIT_RECIPES.classic[0];
  const slots = recipe.slotIds.map((id, i) => makeSlot({ id, status: 'owned', category: 'top', priority: i + 1 }));
  const result = computeNextSmartBuy(slots);
  assert(result === null, 'returns null when all groups complete');
}

console.log('\n3b. One slot missing from one group → direct unlock detected');
{
  const recipe = OUTFIT_RECIPES.classic[0];
  const missingId = recipe.slotIds[recipe.slotIds.length - 1];
  const slots = recipe.slotIds.map((id, i) => makeSlot({
    id,
    status: id === missingId ? 'needed' : 'owned',
    category: 'top',
    priority: i + 1,
  }));

  const result = computeNextSmartBuy(slots);
  assert(result !== null, 'result is not null');
  assert(result?.slot.id === missingId, `picks the single missing slot (${missingId})`);
  assert(result?.isDirectUnlock === true, 'isDirectUnlock is true');
  assert((result?.unlocks ?? 0) >= 1, 'unlocks count ≥ 1');
}

console.log('\n3c. Same slot missing from multiple groups → highest unlock count wins');
{
  const clsRecipes = OUTFIT_RECIPES.classic;

  // Dynamically locate the first overlapping pair in the classic style-goal.
  // If no pair exists the test fails loudly — 4a should have caught it first.
  let overlappingPair: [typeof clsRecipes[0], typeof clsRecipes[0], string] | null = null;
  outer3c: for (let i = 0; i < clsRecipes.length; i++) {
    const setA = new Set(clsRecipes[i].slotIds);
    for (let j = i + 1; j < clsRecipes.length; j++) {
      const shared = clsRecipes[j].slotIds.find(id => setA.has(id));
      if (shared) {
        overlappingPair = [clsRecipes[i], clsRecipes[j], shared];
        break outer3c;
      }
    }
  }

  assert(overlappingPair !== null, 'classic style-goal has at least one overlapping recipe pair');

  if (overlappingPair) {
    const [recipeA, recipeB, sharedMissingId] = overlappingPair;
    const allIds = [...new Set([...recipeA.slotIds, ...recipeB.slotIds])];
    const slots = allIds.map((id, i) => makeSlot({
      id,
      status: id === sharedMissingId ? 'needed' : 'owned',
      category: 'top',
      priority: i + 1,
    }));

    const result = computeNextSmartBuy(slots);
    assert(result?.slot.id === sharedMissingId, `slot "${sharedMissingId}" that unlocks both groups is picked`);
    assert((result?.unlocks ?? 0) === 2, 'unlocks === 2');
    assert(result?.isDirectUnlock === true, 'isDirectUnlock is true');
  }
}

console.log('\n3d. No group is one-away → most-common-needed fallback');
{
  const recipe = OUTFIT_RECIPES.classic[0];
  const needed0 = recipe.slotIds[0];
  const needed1 = recipe.slotIds[1];
  const slots = recipe.slotIds.map((id, i) => makeSlot({
    id,
    status: id === needed0 || id === needed1 ? 'needed' : 'owned',
    category: 'top',
    priority: i + 1,
  }));

  const result = computeNextSmartBuy(slots);
  assert(result !== null, 'result is not null — fallback to most-common-needed');
  assert(!result?.isDirectUnlock, 'isDirectUnlock is false (no group is one-away)');
  assert((result?.appearsIn ?? 0) > 0, 'appearsIn > 0');
}

console.log('\n3e. Tie on unlock count → lower priority number wins');
{
  const slots: CoreWardrobeSlot[] = [
    makeSlot({ id: 'cust-top-1', status: 'owned',  category: 'top',    priority: 1 }),
    makeSlot({ id: 'cust-bot-1', status: 'owned',  category: 'bottom', priority: 1 }),
    makeSlot({ id: 'cust-sho-A', status: 'needed', category: 'shoes',  priority: 5 }),
    makeSlot({ id: 'cust-top-2', status: 'owned',  category: 'top',    priority: 2 }),
    makeSlot({ id: 'cust-bot-2', status: 'owned',  category: 'bottom', priority: 2 }),
    makeSlot({ id: 'cust-sho-B', status: 'needed', category: 'shoes',  priority: 2 }),
  ];
  const groups = generateRecommendedOutfitGroups(slots);
  assert(groups.length === 2, 'two fallback groups produced');
  assert(groups.every(g => !g.isComplete), 'both groups incomplete');

  const result = computeNextSmartBuy(slots);
  assert(result?.slot.id === 'cust-sho-B', 'lower priority number (2) wins over (5)');
}

console.log('\n3f. Tie on unlock count AND priority → lexicographically smaller id wins');
{
  const slots: CoreWardrobeSlot[] = [
    makeSlot({ id: 'cust-top-1', status: 'owned',  category: 'top',    priority: 1 }),
    makeSlot({ id: 'cust-bot-1', status: 'owned',  category: 'bottom', priority: 1 }),
    makeSlot({ id: 'cust-sho-Z', status: 'needed', category: 'shoes',  priority: 1 }),
    makeSlot({ id: 'cust-top-2', status: 'owned',  category: 'top',    priority: 2 }),
    makeSlot({ id: 'cust-bot-2', status: 'owned',  category: 'bottom', priority: 2 }),
    makeSlot({ id: 'cust-sho-A', status: 'needed', category: 'shoes',  priority: 1 }),
  ];
  const result = computeNextSmartBuy(slots);
  assert(result?.slot.id === 'cust-sho-A', 'lexicographically smaller id "cust-sho-A" wins over "cust-sho-Z"');
}

// =============================================================================
// 4. OUTFIT_RECIPES structural invariants
// =============================================================================

console.log('\n4a. Every style-goal has at least one recipe pair sharing a slotId');
{
  const goals = Object.keys(OUTFIT_RECIPES) as Array<keyof typeof OUTFIT_RECIPES>;
  for (const goal of goals) {
    const recipes = OUTFIT_RECIPES[goal];
    let found = false;
    outer: for (let i = 0; i < recipes.length; i++) {
      const setA = new Set(recipes[i].slotIds);
      for (let j = i + 1; j < recipes.length; j++) {
        if (recipes[j].slotIds.some(id => setA.has(id))) {
          found = true;
          break outer;
        }
      }
    }
    assert(
      found,
      `"${goal}" has at least one recipe pair sharing a slotId (required for smart-buy overlap test)`,
    );
  }
}

// =============================================================================
// Exit
// =============================================================================

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll outfitGroupCompletion tests passed.');
}
