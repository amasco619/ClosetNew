/**
 * Pure, asset-free lifestyle-priority helpers used by getProfileBlueprint.
 *
 * Extracted into a separate module so this logic can be imported in Node/tsx
 * test environments without triggering the PNG asset requires that live in
 * wardrobeBlueprint.ts.
 */

import type { ItemCategory } from './types';

export const LIFESTYLE_CATEGORY_WEIGHTS: Record<string, Record<ItemCategory, number>> = {
  work:   { top: 1, bottom: 1, outerwear: 2, shoes: 1, jewelry: 1, dress: 1, bag: 1 },
  casual: { top: 1, bottom: 1, outerwear: 0, shoes: 2, jewelry: 0, dress: 0, bag: 1 },
  events: { top: 0, bottom: 0, outerwear: 0, shoes: 1, jewelry: 2, dress: 2, bag: 1 },
  active: { top: 0, bottom: 2, outerwear: 1, shoes: 2, jewelry: 0, dress: 0, bag: 0 },
  brunch: { top: 1, bottom: 0, outerwear: 0, shoes: 1, jewelry: 1, dress: 2, bag: 2 },
};

export interface LifestyleValues {
  work: number;
  casual: number;
  events: number;
  active: number;
  brunch: number;
}

export interface PrioritisedSlot {
  category: ItemCategory;
  priority: number;
}

/**
 * Compute per-category priority adjustments from lifestyle proportions, apply
 * them to the supplied slots, and return the slots sorted by adjusted priority
 * (ascending — lower number = higher priority).
 *
 * This is the canonical implementation; getProfileBlueprint delegates to it.
 */
export function applyLifestyleWeights<T extends PrioritisedSlot>(
  slots: T[],
  lifestyle: LifestyleValues,
): T[] {
  const catWeights: Record<ItemCategory, number> = {
    top: 0, bottom: 0, outerwear: 0, shoes: 0, jewelry: 0, dress: 0, bag: 0,
  };

  const total = Object.values(lifestyle).reduce((s, v) => s + v, 0);

  if (total > 0) {
    for (const [scenario, weights] of Object.entries(LIFESTYLE_CATEGORY_WEIGHTS)) {
      const proportion = (lifestyle[scenario as keyof LifestyleValues] || 0) / total;
      for (const [cat, weight] of Object.entries(weights)) {
        catWeights[cat as ItemCategory] += weight * proportion;
      }
    }
  }

  return [...slots]
    .map(s => ({ ...s, priority: s.priority - Math.round(catWeights[s.category]) }))
    .sort((a, b) => a.priority - b.priority);
}
