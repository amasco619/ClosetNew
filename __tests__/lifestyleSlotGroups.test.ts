/**
 * Unit tests: getLifestyleGatedSlots — lifestyle-gated slot completion logic.
 *
 * Imports directly from constants/lifestyleSlotGroups.ts (asset-free) so these
 * tests run in Node/tsx without triggering PNG require() calls from
 * wardrobeBlueprint.ts.
 *
 * Invariants verified:
 *   1. Lifestyle below threshold — no group returned (active and brunch).
 *   2. Lifestyle at exact threshold — group is returned.
 *   3. Lifestyle above threshold with needed slots — isComplete: false,
 *      slots contains needed entries (capped at 3).
 *   4. Lifestyle above threshold with all slots owned — isComplete: true,
 *      slots array is empty.
 *   5. Lifestyle above threshold with no matching slots at all — no group
 *      returned (ID pattern not present in slot list).
 *   6. Both active and brunch above threshold — both groups returned.
 *   7. Slots capped at 3 — only first 3 needed slots appear in the group.
 *   8. Lifestyle exactly one below threshold — no group returned.
 *
 * Run: `npx tsx __tests__/lifestyleSlotGroups.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  getLifestyleGatedSlots,
  LIFESTYLE_THRESHOLD,
  type SlotLike,
} from '../constants/lifestyleSlotGroups';

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

// ── Slot factories ────────────────────────────────────────────────────────────

function activeSlot(n: number, status: 'needed' | 'owned' = 'needed'): SlotLike {
  return { id: `cls-act-${n}`, status };
}

function brunchSlot(n: number, status: 'needed' | 'owned' = 'needed'): SlotLike {
  return { id: `cls-brn-${n}`, status };
}

function regularSlot(n: number): SlotLike {
  return { id: `cls-top-${n}`, status: 'needed' };
}

// ── Section 1: Threshold boundary — active ───────────────────────────────────

console.log('\nSection 1: active threshold boundary');

{
  const slots = [activeSlot(1), activeSlot(2)];
  const result = getLifestyleGatedSlots(slots, LIFESTYLE_THRESHOLD - 1, 0);
  assert(result.length === 0, `active = ${LIFESTYLE_THRESHOLD - 1} (below threshold) → no group returned`);
}

{
  const slots = [activeSlot(1), activeSlot(2)];
  const result = getLifestyleGatedSlots(slots, LIFESTYLE_THRESHOLD, 0);
  assert(result.length === 1, `active = ${LIFESTYLE_THRESHOLD} (at threshold) → group returned`);
  assert(result[0].lifestyle === 'active', 'group lifestyle = "active"');
}

{
  const slots = [activeSlot(1), activeSlot(2)];
  const result = getLifestyleGatedSlots(slots, LIFESTYLE_THRESHOLD + 10, 0);
  assert(result.length === 1, `active = ${LIFESTYLE_THRESHOLD + 10} (above threshold) → group returned`);
}

// ── Section 2: Threshold boundary — brunch ───────────────────────────────────

console.log('\nSection 2: brunch threshold boundary');

{
  const slots = [brunchSlot(1), brunchSlot(2)];
  const result = getLifestyleGatedSlots(slots, 0, LIFESTYLE_THRESHOLD - 1);
  assert(result.length === 0, `brunch = ${LIFESTYLE_THRESHOLD - 1} (below threshold) → no group returned`);
}

{
  const slots = [brunchSlot(1), brunchSlot(2)];
  const result = getLifestyleGatedSlots(slots, 0, LIFESTYLE_THRESHOLD);
  assert(result.length === 1, `brunch = ${LIFESTYLE_THRESHOLD} (at threshold) → group returned`);
  assert(result[0].lifestyle === 'brunch', 'group lifestyle = "brunch"');
}

// ── Section 3: Needed slots → isComplete: false ───────────────────────────────

console.log('\nSection 3: needed slots → isComplete: false');

{
  const slots = [activeSlot(1, 'needed'), activeSlot(2, 'needed'), regularSlot(1)];
  const result = getLifestyleGatedSlots(slots, LIFESTYLE_THRESHOLD, 0);
  assert(result.length === 1, 'one group returned when active slots are needed');
  assert(result[0].isComplete === false, 'isComplete = false when needed slots exist');
  assert(result[0].slots.length === 2, 'both needed active slots appear in group');
  assert(result[0].label === 'Active essentials', 'label = "Active essentials"');
}

{
  const slots = [brunchSlot(1, 'needed'), brunchSlot(2, 'needed'), regularSlot(1)];
  const result = getLifestyleGatedSlots(slots, 0, LIFESTYLE_THRESHOLD);
  assert(result.length === 1, 'one group returned when brunch slots are needed');
  assert(result[0].isComplete === false, 'isComplete = false when brunch needed slots exist');
  assert(result[0].label === 'Brunch essentials', 'label = "Brunch essentials"');
}

// ── Section 4: All slots owned → isComplete: true ────────────────────────────

console.log('\nSection 4: all slots owned → isComplete: true');

{
  const slots = [activeSlot(1, 'owned'), activeSlot(2, 'owned'), activeSlot(3, 'owned')];
  const result = getLifestyleGatedSlots(slots, LIFESTYLE_THRESHOLD, 0);
  assert(result.length === 1, 'group still returned when all active slots owned');
  assert(result[0].isComplete === true, 'isComplete = true when all active slots are owned');
  assert(result[0].slots.length === 0, 'slots array is empty when isComplete');
  assert(result[0].lifestyle === 'active', 'lifestyle = "active"');
}

{
  const slots = [brunchSlot(1, 'owned'), brunchSlot(2, 'owned')];
  const result = getLifestyleGatedSlots(slots, 0, LIFESTYLE_THRESHOLD);
  assert(result.length === 1, 'group still returned when all brunch slots owned');
  assert(result[0].isComplete === true, 'isComplete = true when all brunch slots are owned');
  assert(result[0].slots.length === 0, 'slots array is empty when brunch isComplete');
}

// ── Section 5: No matching slots at all → no group ───────────────────────────

console.log('\nSection 5: no matching slots at all → no group returned');

{
  const slots = [regularSlot(1), regularSlot(2), regularSlot(3)];
  const result = getLifestyleGatedSlots(slots, LIFESTYLE_THRESHOLD, 0);
  assert(result.length === 0, 'active above threshold but no -act- slots → no group returned');
}

{
  const slots = [regularSlot(1), regularSlot(2), activeSlot(1, 'needed')];
  const result = getLifestyleGatedSlots(slots, 0, LIFESTYLE_THRESHOLD);
  assert(result.length === 0, 'brunch above threshold but no -brn- slots → no group returned');
}

{
  const result = getLifestyleGatedSlots([], LIFESTYLE_THRESHOLD, LIFESTYLE_THRESHOLD);
  assert(result.length === 0, 'empty slots list → no groups returned regardless of thresholds');
}

// ── Section 6: Both lifestyles above threshold ────────────────────────────────

console.log('\nSection 6: both active and brunch above threshold');

{
  const slots = [
    activeSlot(1, 'needed'), activeSlot(2, 'owned'),
    brunchSlot(1, 'needed'), brunchSlot(2, 'needed'),
  ];
  const result = getLifestyleGatedSlots(slots, LIFESTYLE_THRESHOLD, LIFESTYLE_THRESHOLD);
  assert(result.length === 2, 'two groups returned when both lifestyles exceed threshold');
  assert(result[0].lifestyle === 'active', 'first group is active');
  assert(result[1].lifestyle === 'brunch', 'second group is brunch');
  assert(result[0].isComplete === false, 'active group isComplete = false (1 needed)');
  assert(result[1].isComplete === false, 'brunch group isComplete = false (2 needed)');
}

{
  const slots = [
    activeSlot(1, 'owned'), activeSlot(2, 'owned'),
    brunchSlot(1, 'owned'),
  ];
  const result = getLifestyleGatedSlots(slots, 100, 100);
  assert(result.length === 2, 'two groups returned when both fully owned');
  assert(result[0].isComplete === true, 'active group isComplete = true');
  assert(result[1].isComplete === true, 'brunch group isComplete = true');
}

// ── Section 7: Needed-slots cap at 3 ─────────────────────────────────────────

console.log('\nSection 7: needed slots capped at 3');

{
  const slots = [
    activeSlot(1, 'needed'), activeSlot(2, 'needed'), activeSlot(3, 'needed'),
    activeSlot(4, 'needed'), activeSlot(5, 'needed'),
  ];
  const result = getLifestyleGatedSlots(slots, LIFESTYLE_THRESHOLD, 0);
  assert(result.length === 1, 'group returned when 5 active needed slots exist');
  assert(result[0].slots.length === 3, 'needed slots capped at 3 in the returned group');
  assert(result[0].isComplete === false, 'isComplete = false when cap is applied');
}

{
  const slots = [
    brunchSlot(1, 'needed'), brunchSlot(2, 'needed'), brunchSlot(3, 'needed'),
    brunchSlot(4, 'needed'),
  ];
  const result = getLifestyleGatedSlots(slots, 0, LIFESTYLE_THRESHOLD);
  assert(result[0].slots.length === 3, 'brunch needed slots also capped at 3');
}

// ── Section 8: Mixed owned + needed ──────────────────────────────────────────

console.log('\nSection 8: mixed owned and needed slots');

{
  const slots = [
    activeSlot(1, 'owned'), activeSlot(2, 'needed'), activeSlot(3, 'owned'),
    activeSlot(4, 'needed'),
  ];
  const result = getLifestyleGatedSlots(slots, LIFESTYLE_THRESHOLD, 0);
  assert(result.length === 1, 'group returned for mixed owned/needed active slots');
  assert(result[0].isComplete === false, 'isComplete = false when any slot is needed');
  assert(result[0].slots.length === 2, 'only the 2 needed slots appear (owned excluded)');
  assert(
    result[0].slots.every(s => s.status === 'needed'),
    'every slot in returned group has status "needed"',
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n--- Results: ${failed === 0 ? 'all passed' : `${failed} failed`} ---`);
if (failed > 0) process.exit(1);
