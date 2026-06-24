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
 *   5. Recipe slot ID cross-check against blueprint algorithm output
 *      a. Every slotId in every recipe resolves to a real slot produced by
 *         buildProfileBlueprintSlots for that style goal (no dangling IDs)
 *      b. Constrained-profile cross-check: for each constraint combination
 *         (noSleeveless, flat heels, noShortSkirts) identifies recipes with
 *         dangling slot IDs and asserts the set matches the known-gaps snapshot.
 *         Also verifies the runtime correctly skips those recipes via
 *         generateRecommendedOutfitGroups (the existing fallback from section 1e).
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
import { buildProfileBlueprintSlots } from '../constants/blueprintCore';

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
// 5. Recipe slot ID cross-check against blueprint algorithm output
// =============================================================================

console.log('\n5a. Every recipe slotId resolves to a real slot in the blueprint');
{
  const goals = Object.keys(OUTFIT_RECIPES) as Array<keyof typeof OUTFIT_RECIPES>;
  for (const goal of goals) {
    // Use a minimal profile with no constraints so no slots are filtered out.
    // The profile only sets the primary style goal — all other fields default
    // to undefined/0 which means no body-type boosts, no lifestyle adjustments,
    // and no constraint exclusions. This gives the full slot set for the goal.
    const blueprintSlots = buildProfileBlueprintSlots({ styleGoalPrimary: goal });
    const blueprintSlotIds = new Set(blueprintSlots.map(s => s.id));

    for (const recipe of OUTFIT_RECIPES[goal]) {
      for (const slotId of recipe.slotIds) {
        assert(
          blueprintSlotIds.has(slotId),
          `"${goal}" recipe "${recipe.id}": slotId "${slotId}" exists in blueprint output`,
        );
      }
    }
  }
}

// =============================================================================
// 5b. Constrained-profile recipe cross-check
// =============================================================================

/**
 * Helper: given a style goal and a set of constraints, returns the set of
 * recipe IDs that would have at least one dangling slotId (i.e. a slot that
 * the constraint filter removed from the blueprint output).
 */
function findDanglingRecipes(
  goal: keyof typeof OUTFIT_RECIPES,
  constraints: NonNullable<Parameters<typeof buildProfileBlueprintSlots>[0]['constraints']>,
): Set<string> {
  const slots = buildProfileBlueprintSlots({ styleGoalPrimary: goal, constraints });
  const blueprintSlotIds = new Set(slots.map(s => s.id));
  const dangling = new Set<string>();
  for (const recipe of OUTFIT_RECIPES[goal]) {
    if (recipe.slotIds.some(id => !blueprintSlotIds.has(id))) {
      dangling.add(recipe.id);
    }
  }
  return dangling;
}

/**
 * Convert SlotMeta[] from buildProfileBlueprintSlots into CoreWardrobeSlot[]
 * so we can pass them to generateRecommendedOutfitGroups. All slots start as
 * 'needed' (worst-case ownership) so the runtime skip behaviour is observable
 * independently of completion state.
 */
function toRuntimeSlots(
  slots: ReturnType<typeof buildProfileBlueprintSlots>,
): CoreWardrobeSlot[] {
  return slots.map(s => ({
    id: s.id,
    category: s.category,
    subType: s.subType,
    colorFamily: s.colorFamily,
    priority: s.priority,
    label: s.label,
    description: s.description,
    sampleImage: null,
    status: 'needed' as const,
  }));
}

// ── Known-gap snapshots ────────────────────────────────────────────────────
//
// These sets represent the recipes that are currently known to be skipped when
// a user has the specified constraint active. They are intentional design gaps:
// the runtime already handles them correctly (generateRecommendedOutfitGroups
// silently skips recipes whose slot IDs are not all present — see section 1e).
//
// HOW TO READ: if a future blueprint or recipe change produces a test failure
// here it means a NEW gap has appeared. The developer must either:
//   (a) Fix the recipe so it references only non-constrained slots, OR
//   (b) Add the new recipe ID to the relevant snapshot below with a comment.
//
// noSleeveless filters: category=top && subType=tank-top
// flatHeels    filters: category=shoes && subType=heels
// noShortSkirts filters: subType=mini-skirt || subType=mini-dress

const KNOWN_GAPS_NO_SLEEVELESS: Record<string, string[]> = {
  minimal:  ['min-look-2'], // min-top-1 (white ribbed tank) is filtered
  youthful: ['yth-look-2'], // yth-top-1 (white ribbed tank) is filtered
};

const KNOWN_GAPS_FLAT_HEELS: Record<string, string[]> = {
  elevated: ['elv-look-1', 'elv-look-3', 'elv-look-4'], // elv-sho-1/-2 are heels
  bold:     ['bld-look-1', 'bld-look-3', 'bld-look-4'], // bld-sho-1/-2 are heels
  romantic: ['rom-look-2'],                              // rom-sho-1 is heels
  classic:  ['cls-look-3'],                              // cls-sho-2 is heels
};

const KNOWN_GAPS_NO_SHORT_SKIRTS: Record<string, string[]> = {
  bold:     ['bld-look-2'],                              // bld-bot-3 is mini-skirt
  youthful: ['yth-look-2', 'yth-look-4', 'yth-look-5'], // yth-bot-3/-4 mini-skirt; yth-drs-4 mini-dress
  romantic: ['rom-look-4'],                              // rom-bot-3 is mini-skirt
};

const goals = Object.keys(OUTFIT_RECIPES) as Array<keyof typeof OUTFIT_RECIPES>;

console.log('\n5b-i. noSleeveless constraint: dangling recipe set matches known-gaps snapshot');
{
  for (const goal of goals) {
    const dangling = findDanglingRecipes(goal, { noSleeveless: true });
    const expected = new Set(KNOWN_GAPS_NO_SLEEVELESS[goal] ?? []);
    assert(
      dangling.size === expected.size && [...dangling].every(id => expected.has(id)),
      `"${goal}" noSleeveless dangling recipes match snapshot (${
        expected.size > 0 ? [...expected].join(', ') : 'none'
      })`,
    );
  }
}

console.log('\n5b-ii. flatHeels constraint: dangling recipe set matches known-gaps snapshot');
{
  for (const goal of goals) {
    const dangling = findDanglingRecipes(goal, { maxHeelHeight: 'flat' });
    const expected = new Set(KNOWN_GAPS_FLAT_HEELS[goal] ?? []);
    assert(
      dangling.size === expected.size && [...dangling].every(id => expected.has(id)),
      `"${goal}" flatHeels dangling recipes match snapshot (${
        expected.size > 0 ? [...expected].join(', ') : 'none'
      })`,
    );
  }
}

console.log('\n5b-iii. noShortSkirts constraint: dangling recipe set matches known-gaps snapshot');
{
  for (const goal of goals) {
    const dangling = findDanglingRecipes(goal, { noShortSkirts: true });
    const expected = new Set(KNOWN_GAPS_NO_SHORT_SKIRTS[goal] ?? []);
    assert(
      dangling.size === expected.size && [...dangling].every(id => expected.has(id)),
      `"${goal}" noShortSkirts dangling recipes match snapshot (${
        expected.size > 0 ? [...expected].join(', ') : 'none'
      })`,
    );
  }
}

console.log('\n5b-iv. Runtime skips dangling recipes for constrained profiles');
{
  // Spot-check a representative case for each constraint: verify that
  // generateRecommendedOutfitGroups produces a group list that excludes every
  // recipe ID in the known-gaps set for that constraint.

  const constraintCases: Array<{
    label: string;
    goal: keyof typeof OUTFIT_RECIPES;
    constraints: NonNullable<Parameters<typeof buildProfileBlueprintSlots>[0]['constraints']>;
    knownGaps: Record<string, string[]>;
  }> = [
    {
      label: 'noSleeveless / minimal',
      goal: 'minimal',
      constraints: { noSleeveless: true },
      knownGaps: KNOWN_GAPS_NO_SLEEVELESS,
    },
    {
      label: 'flatHeels / elevated',
      goal: 'elevated',
      constraints: { maxHeelHeight: 'flat' },
      knownGaps: KNOWN_GAPS_FLAT_HEELS,
    },
    {
      label: 'noShortSkirts / youthful',
      goal: 'youthful',
      constraints: { noShortSkirts: true },
      knownGaps: KNOWN_GAPS_NO_SHORT_SKIRTS,
    },
  ];

  for (const { label, goal, constraints, knownGaps } of constraintCases) {
    const blueprintSlots = buildProfileBlueprintSlots({ styleGoalPrimary: goal, constraints });
    const runtimeSlots = toRuntimeSlots(blueprintSlots);
    const groups = generateRecommendedOutfitGroups(runtimeSlots);
    const groupIds = new Set(groups.map(g => g.id));

    const gapIds = knownGaps[goal] ?? [];
    for (const recipeId of gapIds) {
      assert(
        !groupIds.has(recipeId),
        `[${label}] recipe "${recipeId}" is skipped at runtime (dangling slot removed by constraint)`,
      );
    }

    // At least some non-gap recipes should still be surfaced (the constraint
    // only removes a subset of recipes, not all of them).
    const allGoalRecipeIds = OUTFIT_RECIPES[goal].map(r => r.id);
    const nonGapRecipeIds = allGoalRecipeIds.filter(id => !gapIds.includes(id));
    const survivingNonGap = nonGapRecipeIds.filter(id => groupIds.has(id));
    assert(
      survivingNonGap.length > 0,
      `[${label}] at least one non-gap recipe is still surfaced after constraint filtering`,
    );
  }
}

// =============================================================================
// 5c. hasSubstitution flag when constraint-excluded slots are the only gap
// =============================================================================

console.log('\n5c. hasSubstitution:true when constraints are the only reason a slot is missing');
{
  const cases: Array<{
    label: string;
    goal: keyof typeof OUTFIT_RECIPES;
    constraints: NonNullable<Parameters<typeof buildProfileBlueprintSlots>[0]['constraints']>;
  }> = [
    { label: 'noSleeveless/minimal',   goal: 'minimal',  constraints: { noSleeveless: true } },
    { label: 'flatHeels/elevated',     goal: 'elevated', constraints: { maxHeelHeight: 'flat' } },
    { label: 'noShortSkirts/youthful', goal: 'youthful', constraints: { noShortSkirts: true } },
  ];

  for (const { label, goal, constraints } of cases) {
    const unconstrainedBp = buildProfileBlueprintSlots({ styleGoalPrimary: goal });
    const constrainedBp   = buildProfileBlueprintSlots({ styleGoalPrimary: goal, constraints });

    const constrainedIds  = new Set(constrainedBp.map(s => s.id));
    const excludedSlotIds = new Set(
      unconstrainedBp.map(s => s.id).filter(id => !constrainedIds.has(id)),
    );

    if (excludedSlotIds.size === 0) {
      console.log(`  (skip: ${label} — constraint removes no slots from blueprint)`);
      continue;
    }

    const danglingIds = findDanglingRecipes(goal, constraints);

    if (danglingIds.size === 0) {
      console.log(`  (skip: ${label} — no dangling recipes for this constraint combination)`);
      continue;
    }

    const runtimeSlots      = toRuntimeSlots(constrainedBp);
    const groupsWithOptions = generateRecommendedOutfitGroups(runtimeSlots, { excludedSlotIds });
    const groupsWithout     = generateRecommendedOutfitGroups(runtimeSlots);

    const subGroups = groupsWithOptions.filter(g => g.hasSubstitution === true);

    assert(
      subGroups.length > 0,
      `[${label}] at least one hasSubstitution group when dangling recipes exist (got ${subGroups.length})`,
    );

    for (const g of subGroups) {
      assert(
        g.isComplete === false,
        `[${label}] hasSubstitution group "${g.id}" has isComplete=false`,
      );
      assert(
        danglingIds.has(g.id),
        `[${label}] hasSubstitution group "${g.id}" corresponds to a known dangling recipe`,
      );
    }

    // Without options, those dangling recipes are still silently dropped (backward compat)
    const withoutIds = new Set(groupsWithout.map(g => g.id));
    for (const g of subGroups) {
      assert(
        !withoutIds.has(g.id),
        `[${label}] recipe "${g.id}" absent from output without excludedSlotIds (old behaviour preserved)`,
      );
    }

    assert(
      groupsWithOptions.length >= groupsWithout.length,
      `[${label}] group count with excludedSlotIds (${groupsWithOptions.length}) >= without (${groupsWithout.length})`,
    );
  }
}

console.log('\n5c-ii. hasSubstitution groups always have isComplete=false, even with all-owned slots');
{
  const goal: keyof typeof OUTFIT_RECIPES = 'minimal';
  const constraints = { noSleeveless: true };

  const unconstrainedBp = buildProfileBlueprintSlots({ styleGoalPrimary: goal });
  const constrainedBp   = buildProfileBlueprintSlots({ styleGoalPrimary: goal, constraints });
  const excludedSlotIds = new Set(
    unconstrainedBp.map(s => s.id).filter(id => !constrainedBp.find(s2 => s2.id === id)),
  );

  if (excludedSlotIds.size > 0) {
    // All constrained slots set to 'owned' — substitution groups still cannot be complete.
    const allOwned = toRuntimeSlots(constrainedBp).map(s => ({ ...s, status: 'owned' as const }));
    const groups   = generateRecommendedOutfitGroups(allOwned, { excludedSlotIds });

    for (const g of groups.filter(g => g.hasSubstitution === true)) {
      assert(
        g.isComplete === false,
        `hasSubstitution group "${g.id}" has isComplete=false even when all owned slots are "owned"`,
      );
    }
  } else {
    console.log('  (skip: noSleeveless removes no slots from minimal blueprint)');
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
