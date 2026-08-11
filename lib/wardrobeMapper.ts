/**
 * wardrobeMapper.ts — pure DB→WardrobeItem hydration.
 *
 * Extracted from AppContext so the same mapping path is used by both the
 * app (cold-start Supabase load) and tests. Any field that is intentionally
 * NOT copied from the DB row (e.g. `rise`, `fit`) must be absent here —
 * that is what makes legacy items score neutrally on signals added in later
 * phases.
 *
 * IMPORTANT: do NOT add phase-specific fields (rise, fit, neckline, …) here
 * until the Supabase schema column exists AND the column is populated for all
 * rows. Until then, the field must remain undefined on hydrated items so the
 * scorer falls back to its 0/neutral default.
 */

import type { WardrobeItem, ItemCategory, OccasionTag } from '../constants/types';

/**
 * Map a raw Supabase wardrobe_items row to a WardrobeItem value object.
 *
 * The row is typed `any` because Supabase returns untyped JSON; we
 * defensively extract only the fields we know about and discard the rest.
 *
 * Fields intentionally absent from this mapping (must remain undefined):
 *   • rise        — Phase 3.1 addition; not yet backfilled for legacy rows.
 *   • fit         — Phase 3.1 addition; not yet backfilled for legacy rows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbRowToWardrobeItem(it: any): WardrobeItem {
  return {
    id:           it.id,
    photoUri:     it.cleaned_image_url || it.image_url || '',
    category:     it.garment_type as ItemCategory,
    subType:      it.sub_type || '',
    colorFamily:  it.color_family || '',
    description:  it.description,
    occasionTags: (it.occasion as OccasionTag[]) || [],
    seasonTags:   [],
    createdAt:    it.created_at,
    formalityLevel: 5,
    // rise and fit are intentionally absent — see module-level comment above.
  };
}
