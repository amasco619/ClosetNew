import type { GarmentGroup, OccasionTag, OutfitSet, WardrobeItem } from '../constants/types';
import { projectWardrobeForStyling } from './stylingWardrobe';
import { projectRelationshipsForStyling, type RelationshipAwareOutfit } from './stylingRelationships';

// ponytail: ordinal days and a finite public catalogue, not future-day styling.
export const TRAVEL_ACTIVITIES = [
  { id: 'casual', label: 'Casual', scenario: 'casual' },
  { id: 'work', label: 'Work', scenario: 'work' },
  { id: 'date-dressy', label: 'Dressy date', scenario: 'date-dressy' },
  { id: 'event', label: 'Event', scenario: 'event' },
  { id: 'wedding', label: 'Wedding', scenario: 'wedding' },
  { id: 'travel', label: 'Travel', scenario: 'travel' },
  { id: 'resort', label: 'Resort', scenario: 'resort' },
  { id: 'active', label: 'Active', scenario: 'active' },
  { id: 'traditional-event', label: 'Traditional', scenario: 'traditional-event' },
  { id: 'other', label: 'Other / unsupported', scenario: null },
] as const satisfies readonly { id: string; label: string; scenario: OccasionTag | null }[];
export type TravelActivity = typeof TRAVEL_ACTIVITIES[number]['id'];
export type TravelAccess = 'checking' | 'ready' | 'sign-in' | 'not-entitled' | 'unavailable' | 'loading' | 'failure';
export interface TravelLook {
  key: string;
  outfit: OutfitSet;
  source: 'generic' | 'traditional';
  disclosures: string[];
  notice?: string;
}
export interface TravelSlot { id: string; day: number; activity: TravelActivity; look?: TravelLook }

export function travelLookKey(outfit: OutfitSet): string {
  return JSON.stringify([outfit.scenario, [...new Set(outfit.components.map(c => c.matchedItemId))].sort()]);
}

export function validTravelOutfit(outfit: OutfitSet, items: readonly WardrobeItem[]): boolean {
  const ids = new Set(items.map(item => item.id));
  return outfit.components.length > 0 && outfit.components.every(c =>
    c.owned === true && typeof c.matchedItemId === 'string' &&
    c.matchedItemId.trim().length > 0 && ids.has(c.matchedItemId),
  );
}

/** Membership, never garment names/colours, supplies the disclosure. */
export function travelChoices(
  activity: TravelActivity, generic: readonly OutfitSet[], traditional: readonly OutfitSet[],
  items: readonly WardrobeItem[], groups: readonly GarmentGroup[], owner: string,
): TravelLook[] {
  const scenario = TRAVEL_ACTIVITIES.find(a => a.id === activity)?.scenario;
  if (!scenario) return [];
  const source = scenario === 'traditional-event' ? 'traditional' : 'generic';
  const units = projectRelationshipsForStyling(projectWardrobeForStyling(items, groups), owner).relationshipUnits ?? [];
  const seen = new Set<string>();
  return (source === 'traditional' ? traditional : generic).flatMap(outfit => {
    if (outfit.scenario !== scenario || !validTravelOutfit(outfit, items)) return [];
    const key = travelLookKey(outfit);
    if (seen.has(key)) return [];
    const ids = new Set(outfit.components.map(c => c.matchedItemId));
    const disclosures: string[] = [];
    for (const unit of units) {
      if (unit.relationshipType !== 'coordinated_set' || unit.confirmationStatus !== 'user_confirmed' || unit.memberIds.length < 2) continue;
      const used = unit.memberIds.filter(id => ids.has(id)).length;
      if (!used) continue;
      // Dedicated Traditional results must still satisfy current membership.
      if (source === 'traditional' && used !== unit.memberIds.length) return [];
      disclosures.push(used === unit.memberIds.length
        ? `Includes all ${used} pieces of a confirmed coordinated set.`
        : `Partial confirmed coordinated set: ${used} of ${unit.memberIds.length} pieces; the other pieces are not included.`);
    }
    if (source === 'traditional') {
      const provenance = (outfit as Partial<RelationshipAwareOutfit>).stylingRelationships;
      // Preserve the service object/provenance; reject membership changes since it ran.
      if (provenance?.some(use => !units.some(unit => unit.groupId === use.groupId &&
        unit.relationshipType === use.relationshipType && unit.confirmationStatus === use.confirmationStatus &&
        JSON.stringify([...unit.memberIds].sort()) === JSON.stringify([...use.memberIds].sort())))) return [];
    } else {
      disclosures.push('Current generic look; not constructed with Traditional relationship-aware safeguards.');
    }
    seen.add(key);
    return [{ key, outfit, source, disclosures }];
  });
}

export function travelChecklist(slots: readonly TravelSlot[], items: readonly WardrobeItem[]): WardrobeItem[] {
  const used = new Set(slots.flatMap(slot => slot.look && validTravelOutfit(slot.look.outfit, items)
    ? slot.look.outfit.components.map(c => c.matchedItemId!) : []));
  return items.filter(item => used.delete(item.id));
}

export function travelCoverage(slots: readonly TravelSlot[]) {
  return { planned: slots.filter(slot => slot.look).length, total: slots.length };
}

/** Ignore expiring display URLs; all canonical/eligibility changes invalidate choices. */
export function travelWardrobeRevision(items: readonly WardrobeItem[]): string {
  return JSON.stringify(items.map(({ photoUri, ...item }) => item));
}
export function travelGroupRevision(groups: readonly GarmentGroup[]): string {
  return JSON.stringify(groups.map(group => ({
    id: group.id, owner: group.userId, type: group.relationshipType, status: group.confirmationStatus,
    members: group.members.map(m => [m.groupId, m.userId, m.garmentId]).sort(),
  })).sort((a, b) => a.id.localeCompare(b.id)));
}
