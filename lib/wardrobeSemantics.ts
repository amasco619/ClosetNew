import { z } from 'zod';
import type { WardrobeItem } from '../constants/types';
import { centroidHsl, hslToLab } from '../constants/colorPerceptual';

export const SEMANTIC_FIELDS = [
  'category', 'subType', 'colorFamily', 'accentColor', 'pattern', 'patternScale',
  'fabric', 'fit', 'weight', 'neckline', 'sleeveLength', 'rise', 'warmthBand',
  'formalityLevel', 'seasonTags', 'occasionTags', 'metalTone', 'dominantHsl', 'dominantLab',
] as const;

// Existing normalized columns remain authoritative for identity/material/fit/print.
// Only the previously unrepresented signals live in this bounded nullable object.
export const recommendationSemanticsSchema = z.object({
  accentColor: z.string().min(1).max(64).optional(),
  weight: z.enum(['light', 'mid', 'heavy']).optional(),
  neckline: z.enum(['crew', 'v-neck', 'scoop', 'turtleneck', 'boat', 'square', 'halter', 'off-shoulder', 'collared']).optional(),
  sleeveLength: z.enum(['sleeveless', 'short', 'three-quarter', 'long']).optional(),
  rise: z.enum(['low', 'mid', 'high']).optional(),
  warmthBand: z.enum(['cold', 'cool', 'mild', 'warm', 'hot']).optional(),
  formalityLevel: z.number().finite().min(1).max(10).optional(),
  seasonTags: z.array(z.enum(['winter', 'summer', 'spring', 'fall', 'all-season'])).max(5).optional(),
  metalTone: z.enum(['gold', 'silver', 'rose-gold', 'mixed', 'none']).optional(),
  dominantHsl: z.object({
    h: z.number().finite().min(0).max(360),
    s: z.number().finite().min(0).max(1),
    l: z.number().finite().min(0).max(1),
  }).strict().optional(),
  dominantLab: z.object({
    L: z.number().finite().min(0).max(100),
    a: z.number().finite().min(-200).max(200),
    b: z.number().finite().min(-200).max(200),
  }).strict().optional(),
  confirmedFields: z.array(z.enum(SEMANTIC_FIELDS)).max(SEMANTIC_FIELDS.length).optional(),
  // Already exposed by saved-item cost-per-wear UI; preserve that existing edit
  // rather than returning a false success for an unsupported purchase-price save.
  purchasePrice: z.number().finite().positive().max(1000000000).optional(),
}).strict();

export type RecommendationSemantics = z.infer<typeof recommendationSemanticsSchema>;

export function serializeRecommendationSemantics(item: Partial<WardrobeItem>): RecommendationSemantics {
  return recommendationSemanticsSchema.parse({
    accentColor: item.accentColor, weight: item.weight, neckline: item.neckline,
    sleeveLength: item.sleeveLength, rise: item.rise, warmthBand: item.warmthBand,
    formalityLevel: item.formalityLevel, seasonTags: item.seasonTags, metalTone: item.metalTone,
    dominantHsl: item.dominantHsl, dominantLab: item.dominantLab,
    confirmedFields: item.confirmedFields,
    purchasePrice: item.purchasePrice,
  });
}

export function mergeWardrobeCorrection(
  item: WardrobeItem,
  updates: Partial<Omit<WardrobeItem, 'id' | 'createdAt'>>,
): WardrobeItem {
  const corrected = { ...item, ...updates };
  const changed = SEMANTIC_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(updates, field));
  corrected.confirmedFields = [...new Set([...(item.confirmedFields ?? []), ...changed])];
  if (changed.length) corrected.modelConfidence = undefined;
  // A user colour correction invalidates image-derived colours, even when an
  // old classifier response also supplies them.
  if (updates.colorFamily !== undefined && updates.colorFamily !== item.colorFamily) {
    corrected.dominantHsl = centroidHsl(updates.colorFamily);
    const hsl = corrected.dominantHsl;
    corrected.dominantLab = hslToLab(hsl.h, hsl.s, hsl.l);
  }
  serializeRecommendationSemantics(corrected);
  return corrected;
}

/** Shared save barrier: a failed persistence call never returns committed truth. */
export async function saveWardrobeCorrection(
  item: WardrobeItem,
  updates: Partial<Omit<WardrobeItem, 'id' | 'createdAt'>>,
  persist: (corrected: WardrobeItem) => Promise<void>,
): Promise<WardrobeItem> {
  const corrected = mergeWardrobeCorrection(item, updates);
  await persist(corrected);
  return corrected;
}
