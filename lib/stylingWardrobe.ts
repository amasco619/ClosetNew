import type { GarmentGroup, WardrobeItem } from '../constants/types';
import { SEMANTIC_FIELDS } from './wardrobeSemantics';

type ReadonlyValue<T> = T extends object
  ? { readonly [K in keyof T]: ReadonlyValue<T[K]> }
  : T;

/** Styling truth excludes image/account/bookkeeping and AI diagnostic provenance. */
export type StylingGarment = ReadonlyValue<
  Pick<WardrobeItem, 'id' | typeof SEMANTIC_FIELDS[number]>
> & {
  /** Undefined means relationships were not loaded; [] means no supplied membership. */
  readonly groupIds?: readonly string[];
};

export interface StylingWardrobe {
  readonly garments: readonly StylingGarment[];
  /** Existing Phase A records, not inferred pairs or inherited garment attributes. */
  readonly relationships?: readonly ReadonlyValue<GarmentGroup>[];
  /** Lossless compatibility snapshot, in original order, for the frozen engine.
   * Its photo/bookkeeping/diagnostic fields are NOT styling semantics. */
  readonly v37Items: WardrobeItem[];
}

// Canonical wardrobe/group models are JSON-shaped records. Preserve undefined
// and empty arrays while detaching nested values; no JSON-stringify coercions.
function copyValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copyValue) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, copyValue(entry)]),
    ) as T;
  }
  return value;
}

/**
 * Pure canonical → Styling Intelligence boundary.
 *
 * Input must already be canonical (P0.1 hydration/save), not raw classifier
 * output. No defaults, subtype remapping, cultural inference or provider I/O.
 * A cleared canonical value is unknown, regardless of confirmedFields.
 * Existing getGarmentGroups()/mapDbRowToGarmentGroup() results can be supplied
 * unchanged. Rejected/inferred/confirmed relationships retain their status;
 * sharedAttributes never override an individual garment.
 *
 * No new derived signals are needed: v3.7 accepts these optional fields. Its
 * existing read-time interpretations stay inside the frozen engine, never
 * masquerading as confirmed facts in garments.
 */
export function projectWardrobeForStyling(
  items: readonly WardrobeItem[],
  groups?: readonly GarmentGroup[],
): StylingWardrobe {
  const relationships = groups === undefined ? undefined : copyValue(groups);
  const membership = new Map<string, string[]>();
  for (const group of relationships ?? []) {
    for (const member of group.members) {
      const ids = membership.get(member.garmentId) ?? [];
      ids.push(group.id);
      membership.set(member.garmentId, ids);
    }
  }

  const garments = items.map(item => ({
    id: item.id,
    ...Object.fromEntries(SEMANTIC_FIELDS.map(field => [field, copyValue(item[field])])),
    groupIds: groups === undefined ? undefined : [...(membership.get(item.id) ?? [])],
  })) as StylingGarment[];

  return { garments, relationships, v37Items: items.map(copyValue) };
}
