import type { GarmentGroup, OutfitSet } from '../constants/types';
import type { StylingWardrobe } from './stylingWardrobe';

/** Transient membership view; no inherited garment facts or inferred layer order. */
export interface StylingRelationshipUnit {
  readonly groupId: string;
  readonly relationshipType: GarmentGroup['relationshipType'];
  readonly confirmationStatus: GarmentGroup['confirmationStatus'];
  readonly memberIds: readonly string[];
  readonly availableMemberIds: readonly string[];
  readonly missingMemberIds: readonly string[];
}

export interface RelationshipAwareStylingWardrobe extends StylingWardrobe {
  /** Undefined still means not loaded, rather than "no relationships". */
  readonly relationshipUnits: readonly StylingRelationshipUnit[] | undefined;
}

/** Input rows are already owner-scoped by Phase A; live callers also pass ownerId. */
export function projectRelationshipsForStyling(
  wardrobe: StylingWardrobe, ownerId?: string,
): RelationshipAwareStylingWardrobe {
  const owned = new Set(wardrobe.garments.map(item => item.id));
  const relationshipUnits = wardrobe.relationships?.filter(group =>
    (ownerId === undefined || group.userId === ownerId) &&
    group.members.length > 0 &&
    group.members.every(member => member.userId === group.userId && member.groupId === group.id) &&
    new Set(group.members.map(member => member.garmentId)).size === group.members.length,
  ).map(group => {
    const memberIds = group.members.map(member => member.garmentId);
    return {
      groupId: group.id, relationshipType: group.relationshipType,
      confirmationStatus: group.confirmationStatus, memberIds,
      availableMemberIds: memberIds.filter(id => owned.has(id)),
      missingMemberIds: memberIds.filter(id => !owned.has(id)),
    };
  });
  return { ...wardrobe, relationshipUnits };
}

const CORE = new Set(['top', 'bottom', 'dress']);

/**
 * Pin authoritative members in occupied slots before frozen v3.7 generation.
 * This makes a pair available even when arbitrary bottoms would fill its
 * limited shortlist. Names, matching colours and shared attributes play no role.
 */
export function coordinatedCandidateScopes(
  wardrobe: RelationshipAwareStylingWardrobe,
  eligibleIds: ReadonlySet<string>,
  preferredCoreIds: ReadonlySet<string>,
): { groupId: string; memberIds: readonly string[]; itemIds: string[] }[] {
  const categoryById = new Map(wardrobe.garments.map(item => [item.id, item.category]));
  return (wardrobe.relationshipUnits ?? []).filter(unit =>
    unit.relationshipType === 'coordinated_set' && unit.confirmationStatus === 'user_confirmed' &&
    unit.memberIds.length > 1 && unit.missingMemberIds.length === 0 &&
    unit.memberIds.every(id => eligibleIds.has(id)) &&
    unit.memberIds.some(id => CORE.has(categoryById.get(id)!)) &&
    (preferredCoreIds.size === 0 || unit.memberIds.some(id => preferredCoreIds.has(id))),
  ).map(unit => {
    const members = new Set(unit.memberIds);
    const occupied = new Set(unit.memberIds.map(id => categoryById.get(id)!));
    const completeCore = occupied.has('dress') || (occupied.has('top') && occupied.has('bottom'));
    const itemIds = wardrobe.garments.filter(item =>
      eligibleIds.has(item.id) &&
      (!occupied.has(item.category) || members.has(item.id)) &&
      (!completeCore || !CORE.has(item.category) || members.has(item.id)),
    ).map(item => item.id);
    return { groupId: unit.groupId, memberIds: unit.memberIds, itemIds };
  });
}

export interface OutfitRelationshipUse {
  readonly groupId: string;
  readonly relationshipType: GarmentGroup['relationshipType'];
  readonly confirmationStatus: GarmentGroup['confirmationStatus'];
  readonly memberIds: readonly string[];
  readonly participatingMemberIds: readonly string[];
}
export interface RelationshipAwareOutfit extends OutfitSet {
  /** Ephemeral provenance, not a new durable garment relationship. */
  readonly stylingRelationships: readonly OutfitRelationshipUse[];
}

export function annotateStylingRelationships(
  outfits: readonly OutfitSet[], units: readonly StylingRelationshipUnit[],
): RelationshipAwareOutfit[] {
  return outfits.map(outfit => {
    const ids = new Set(outfit.components.map(component => component.matchedItemId));
    return {
      ...outfit,
      stylingRelationships: units.filter(unit => unit.availableMemberIds.some(id => ids.has(id))).map(unit => ({
        groupId: unit.groupId, relationshipType: unit.relationshipType,
        confirmationStatus: unit.confirmationStatus, memberIds: [...unit.memberIds],
        participatingMemberIds: unit.availableMemberIds.filter(id => ids.has(id)),
      })),
    };
  });
}

export function usesConfirmedCoordinatedSet(outfit: OutfitSet): boolean {
  return ((outfit as Partial<RelationshipAwareOutfit>).stylingRelationships ?? []).some(use =>
    use.relationshipType === 'coordinated_set' && use.confirmationStatus === 'user_confirmed' &&
    use.memberIds.length > 1 && use.participatingMemberIds.length === use.memberIds.length,
  );
}
