import type { GarmentGroup, OutfitComponent, OutfitSet, WardrobeItem } from '../../../constants/types';

export type StructuralRole =
  | 'base-top'
  | 'base-bottom'
  | 'one-piece'
  | 'layer'
  | 'headwear'
  | 'accessory'
  | 'unknown';

export interface NigerianStylingV1Input {
  wardrobe: readonly WardrobeItem[];
  /** Required: an empty array means membership was loaded and no sets exist. */
  relationships: readonly GarmentGroup[];
  /** Explicit structural labels take precedence over the canonical category. */
  rolesByItemId?: Readonly<Record<string, StructuralRole>>;
  /** Set only by an explicit request or an explicit context requirement. */
  includeHeadwear?: boolean;
}

export interface NigerianStylingV1Decision {
  sourceOutfitId: string;
  status: 'eligible' | 'unknown' | 'rejected';
  reason?: string;
  removedHeadwearIds: string[];
}

export interface NigerianStylingV1Result {
  outfits: OutfitSet[];
  decisions: NigerianStylingV1Decision[];
}

const HEADWEAR_SUBTYPES = new Set([
  'cap', 'gele', 'head-scarf', 'headwrap', 'structured-headpiece', 'sunhat',
]);

function roleFor(
  item: WardrobeItem | undefined,
  rolesByItemId: NigerianStylingV1Input['rolesByItemId'],
): StructuralRole {
  if (!item) return 'unknown';
  const explicit = rolesByItemId?.[item.id];
  if (explicit) return explicit;
  if (HEADWEAR_SUBTYPES.has(item.subType)) return 'headwear';
  switch (item.category) {
    case 'top': return 'base-top';
    case 'bottom': return 'base-bottom';
    case 'dress': return 'one-piece';
    case 'outerwear': return 'layer';
    case 'shoes':
    case 'bag':
    case 'jewelry': return 'accessory';
    default: return 'unknown';
  }
}

function itemIds(components: readonly OutfitComponent[]): string[] {
  return components.flatMap(component => component.matchedItemId ? [component.matchedItemId] : []);
}

function coordinatedSetReason(
  ids: ReadonlySet<string>,
  roles: ReadonlyMap<string, StructuralRole>,
  relationships: readonly GarmentGroup[],
): string | undefined {
  const groups = relationships.filter(group =>
    group.relationshipType === 'coordinated_set' && group.confirmationStatus === 'user_confirmed',
  );

  for (const group of groups) {
    const members = new Set(group.members.map(member => member.garmentId));
    const includedMembers = [...members].filter(id => ids.has(id));
    if (includedMembers.length === 0) continue;
    if (includedMembers.length !== members.size) return 'confirmed coordinated set is incomplete';

    for (const id of ids) {
      if (members.has(id)) continue;
      const role = roles.get(id) ?? 'unknown';
      if (role === 'base-top' || role === 'base-bottom' || role === 'one-piece') {
        return 'confirmed coordinated set is paired with an unrelated base garment';
      }
      if (role === 'unknown') return 'unknown item role prevents confirming set integrity';
    }
  }
  return undefined;
}

function structuralStatus(
  components: readonly OutfitComponent[],
  wardrobeById: ReadonlyMap<string, WardrobeItem>,
  input: NigerianStylingV1Input,
): Pick<NigerianStylingV1Decision, 'status' | 'reason'> {
  const ids = itemIds(components);
  const roles = new Map(ids.map(id => [id, roleFor(wardrobeById.get(id), input.rolesByItemId)]));
  const knownIds = new Set(ids);
  const setReason = coordinatedSetReason(knownIds, roles, input.relationships);
  if (setReason) return { status: 'rejected', reason: setReason };

  let tops = 0;
  let bottoms = 0;
  let onePieces = 0;
  let unknown = components.some(component => !component.matchedItemId);

  for (const role of roles.values()) {
    if (role === 'base-top') tops++;
    else if (role === 'base-bottom') bottoms++;
    else if (role === 'one-piece') onePieces++;
    else if (role === 'unknown') unknown = true;
  }

  if (tops > 1 || bottoms > 1 || onePieces > 1 || (onePieces > 0 && (tops > 0 || bottoms > 0))) {
    return { status: 'rejected', reason: 'look has an incompatible base-garment structure' };
  }
  const hasCompleteBase = onePieces === 1 || (tops === 1 && bottoms === 1);
  if (!hasCompleteBase && !unknown) {
    return { status: 'rejected', reason: 'look has no complete one-piece or top-and-bottom base' };
  }
  if (unknown) return { status: 'unknown', reason: 'one or more item roles remain unknown' };
  return { status: 'eligible' };
}

/**
 * Structural-only v1 pass over v3.7 candidates. It does not score or add items.
 * Unknown structures remain in the output unchanged and are labelled unknown.
 */
export function applyNigerianStylingV1(
  candidates: readonly OutfitSet[],
  input: NigerianStylingV1Input,
): NigerianStylingV1Result {
  const wardrobeById = new Map(input.wardrobe.map(item => [item.id, item]));
  const decisions: NigerianStylingV1Decision[] = [];
  const outfits: OutfitSet[] = [];

  for (const source of candidates) {
    const removedHeadwearIds: string[] = [];
    const components = source.components.filter(component => {
      const id = component.matchedItemId;
      const role = roleFor(id ? wardrobeById.get(id) : undefined, input.rolesByItemId);
      if (role === 'headwear' && input.includeHeadwear !== true) {
        if (id) removedHeadwearIds.push(id);
        return false;
      }
      return true;
    });

    const result = structuralStatus(components, wardrobeById, input);
    decisions.push({
      sourceOutfitId: source.id,
      ...result,
      removedHeadwearIds,
    });
    if (result.status === 'rejected') continue;

    if (removedHeadwearIds.length === 0) {
      outfits.push(source);
      continue;
    }
    const remainingIds = itemIds(components).sort();
    outfits.push({
      ...source,
      id: `nigerian-v1-${source.id}-${remainingIds.join('|')}`,
      components,
      rationale: undefined,
      heroId: source.heroId && remainingIds.includes(source.heroId) ? source.heroId : undefined,
    });
  }

  return { outfits, decisions };
}
