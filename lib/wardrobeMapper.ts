/**
 * wardrobeMapper.ts — pure DB→WardrobeItem hydration.
 *
 * Extracted from AppContext so the same mapping path is used by both the
 * app (cold-start Supabase load) and tests. Missing legacy semantics stay
 * unknown; subtype/default interpretation belongs to the frozen engine,
 * not to the canonical mapper.
 */

import type { WardrobeItem, ItemCategory, OccasionTag } from '../constants/types';
import { recommendationSemanticsSchema } from './wardrobeSemantics';

/**
 * Map a raw Supabase wardrobe_items row to a WardrobeItem value object.
 *
 * The row is typed `any` because Supabase returns untyped JSON; we
 * defensively extract only the fields we know about and discard the rest.
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbRowToWardrobeItem(it: any): WardrobeItem {
  const semantics = recommendationSemanticsSchema.parse(it.recommendation_semantics ?? {});
  return {
    id:           it.id,
    photoUri:     it.cleaned_image_url || it.image_url || '',
    category:     it.garment_type as ItemCategory,
    subType:      it.sub_type || '',
    colorFamily:  it.color_family || '',
    description:  it.description,
    occasionTags: (it.occasion as OccasionTag[]) || [],
    ...semantics,
    seasonTags:   semantics.seasonTags ?? [],
    createdAt:    it.created_at,
    fabric:       it.fabric ?? undefined,
    fit:          it.fit ?? undefined,
    pattern:      it.pattern ?? undefined,
    patternScale: it.pattern_scale ?? undefined,
    storagePath:  it.image_url && !it.image_url.startsWith('http') &&
      !it.image_url.startsWith('file') ? it.image_url : undefined,
  };
}
