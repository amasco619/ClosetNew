/**
 * Pure, asset-free core of the getProfileBlueprint algorithm.
 *
 * Extracted into a separate module so the real blueprint-building logic can be
 * imported and called directly in Node/tsx test environments without triggering
 * the PNG asset require() calls that live in wardrobeBlueprint.ts.
 *
 * wardrobeBlueprint.ts delegates to buildProfileBlueprintSlots and attaches
 * sampleImage from its SAMPLE_IMAGES map; it no longer maintains its own copy
 * of BODY_TYPE_PRIORITY_BOOSTS or the algorithm body.
 *
 * Tests import buildProfileBlueprintSlots directly — no local mirror needed.
 */

import { STYLE_BLUEPRINT_SLOTS } from './blueprintSlots';
import { applyLifestyleWeights } from './blueprintPriority';
import type { ItemCategory, BodyType } from './types';
import type { SlotMeta, StyleGoal } from './blueprintSlots';

export const BODY_TYPE_PRIORITY_BOOSTS: Record<BodyType, Partial<Record<ItemCategory, number>>> = {
  hourglass:           { dress: -1 },
  pear:                { top: -1, jewelry: -1, outerwear: -1 },
  apple:               { outerwear: -1, bottom: -1, dress: 1 },
  rectangle:           { outerwear: -1, dress: -1, jewelry: -1 },
  'inverted-triangle': { bottom: -1, shoes: -1 },
  athletic:            { dress: -1, outerwear: -1, jewelry: -1 },
};

/**
 * Minimal profile shape required by buildProfileBlueprintSlots.
 * The full UserProfile from types.ts is structurally compatible —
 * pass it directly without any casting.
 */
export interface BlueprintProfile {
  styleGoalPrimary?: StyleGoal | null;
  styleGoalSecondary?: StyleGoal | null;
  bodyType?: BodyType | null;
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

/**
 * Asset-free version of getProfileBlueprint.
 *
 * Returns SlotMeta[] (with imageKey instead of sampleImage) sorted by
 * adjusted priority ascending. wardrobeBlueprint.ts wraps this to attach
 * sampleImage. Tests call this directly to exercise the real algorithm.
 *
 * Algorithm (mirrors getProfileBlueprint exactly):
 *   1. Start from primary-goal slots (falls back to classic when unset).
 *   2. Merge unique secondary-goal slots at priority + 10.
 *   3. Apply body-type priority boosts.
 *   4. Apply lifestyle-proportion priority weights (via applyLifestyleWeights).
 *   5. Filter constraint-excluded sub-types.
 *   6. Sort ascending by adjusted priority.
 */
export function buildProfileBlueprintSlots(profile: BlueprintProfile): SlotMeta[] {
  const sourceGoal: StyleGoal = profile.styleGoalPrimary ?? 'classic';

  let items: SlotMeta[] = [...STYLE_BLUEPRINT_SLOTS[sourceGoal]];

  if (profile.styleGoalSecondary) {
    const secondaryGoal = profile.styleGoalSecondary;
    const existingIds = new Set(
      items.map(i => `${i.category}-${i.subType}-${i.colorFamily}`),
    );
    for (const sItem of STYLE_BLUEPRINT_SLOTS[secondaryGoal]) {
      const key = `${sItem.category}-${sItem.subType}-${sItem.colorFamily}`;
      if (!existingIds.has(key)) {
        items.push({ ...sItem, priority: sItem.priority + 10 });
        existingIds.add(key);
      }
    }
  }

  if (profile.bodyType && BODY_TYPE_PRIORITY_BOOSTS[profile.bodyType]) {
    const boosts = BODY_TYPE_PRIORITY_BOOSTS[profile.bodyType];
    items = items.map(item => ({
      ...item,
      priority: item.priority + (boosts[item.category] ?? 0),
    }));
  }

  items = applyLifestyleWeights(items, {
    work:   profile.lifestyleWork   ?? 0,
    casual: profile.lifestyleCasual ?? 0,
    events: profile.lifestyleEvents ?? 0,
    active: profile.lifestyleActive ?? 0,
    brunch: profile.lifestyleBrunch ?? 0,
  });

  if (profile.constraints?.maxHeelHeight === 'flat') {
    items = items.filter(item => !(item.category === 'shoes' && item.subType === 'heels'));
  }
  if (profile.constraints?.noSleeveless) {
    items = items.filter(item => !(item.category === 'top' && item.subType === 'tank-top'));
  }
  if (profile.constraints?.noShortSkirts) {
    items = items.filter(
      item => !(item.subType === 'mini-skirt' || item.subType === 'mini-dress'),
    );
  }

  items.sort((a, b) => a.priority - b.priority);
  return items;
}
