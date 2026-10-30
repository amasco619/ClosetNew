import type {
  GarmentGroup, HeadCoveringPreference, OutfitComponent, OutfitSet, WardrobeItem,
} from '../../../constants/types';
export type { HeadCoveringPreference } from '../../../constants/types';

export type StructuralRole =
  | 'base-top'
  | 'base-bottom'
  | 'one-piece'
  | 'layer'
  | 'style-headwear'
  | 'covering-item'
  | 'accessory'
  | 'unknown';

export type NigerianStylingContext = 'work' | 'casual' | 'event' | 'traditional';

export interface NigerianStylingV1Input {
  wardrobe: readonly WardrobeItem[];
  /** Required: an empty array means membership was loaded and no sets exist. */
  relationships: readonly GarmentGroup[];
  context: NigerianStylingContext;
  /** Explicit structural labels take precedence over the canonical category. */
  rolesByItemId?: Readonly<Record<string, StructuralRole>>;
  /** Set IDs explicitly marked as aso-ebi for this event. */
  asoEbiSetIds?: readonly string[];
  /** A user constraint, independent of optional style headwear. */
  headCoveringPreference?: HeadCoveringPreference;
  /** Style headwear is retained only when explicitly requested. */
  includeStyleHeadwear?: boolean;
}

export interface NigerianStylingV1Decision {
  sourceOutfitId: string;
  outputOutfitId: string;
  status: 'eligible' | 'unknown' | 'rejected';
  reason?: string;
  removedStyleHeadwearIds: string[];
  removedCoveringItemIds: string[];
  addedCoveringItemIds: string[];
  headCoveringSatisfied: boolean;
}

export interface NigerianStylingV1Result {
  outfits: OutfitSet[];
  decisions: NigerianStylingV1Decision[];
  gapNotes: string[];
}

const STYLE_HEADWEAR_SUBTYPES = new Set(['gele', 'ichafu']);
const COVERING_ITEM_SUBTYPES = new Set([
  'gyale', 'kallabi', 'mayafi', 'hijab', 'scarf', 'head-scarf', 'headwrap', 'turban',
]);
const WRAPPER_SUBTYPES = new Set(['wrapper', 'iro']);

function normaliseSubtype(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function roleFor(
  item: WardrobeItem | undefined,
  rolesByItemId: NigerianStylingV1Input['rolesByItemId'],
): StructuralRole {
  if (!item) return 'unknown';
  const explicit = rolesByItemId?.[item.id];
  if (explicit) return explicit;
  const subtype = normaliseSubtype(item.subType);
  if (STYLE_HEADWEAR_SUBTYPES.has(subtype)) return 'style-headwear';
  if (COVERING_ITEM_SUBTYPES.has(subtype)) return 'covering-item';
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

function isStrictSetContext(group: GarmentGroup, input: NigerianStylingV1Input): boolean {
  return input.context === 'traditional'
    || (input.context === 'event' && input.asoEbiSetIds?.includes(group.id) === true);
}

function coordinatedSetReason(
  ids: ReadonlySet<string>,
  roles: ReadonlyMap<string, StructuralRole>,
  relationships: readonly GarmentGroup[],
  input: NigerianStylingV1Input,
): string | undefined {
  const groups = relationships.filter(group =>
    group.relationshipType === 'coordinated_set'
      && group.confirmationStatus === 'user_confirmed'
      && isStrictSetContext(group, input),
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
  const setReason = coordinatedSetReason(new Set(ids), roles, input.relationships, input);
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

function hasSubtype(
  components: readonly OutfitComponent[],
  wardrobeById: ReadonlyMap<string, WardrobeItem>,
  wanted: string,
): boolean {
  return components.some(component => {
    const item = component.matchedItemId ? wardrobeById.get(component.matchedItemId) : undefined;
    return normaliseSubtype(item?.subType ?? component.subType) === wanted;
  });
}

function isWrapperBased(
  components: readonly OutfitComponent[],
  wardrobeById: ReadonlyMap<string, WardrobeItem>,
): boolean {
  return components.some(component => {
    const item = component.matchedItemId ? wardrobeById.get(component.matchedItemId) : undefined;
    if (item?.category !== 'bottom') return false;
    const subtype = normaliseSubtype(item.subType);
    return WRAPPER_SUBTYPES.has(subtype) || subtype.endsWith('-wrapper');
  });
}

const MISSING_COVERING_GAP_NOTE = 'Add a covering item to your wardrobe to complete this preference.';

function coveringItemsWanted(
  components: readonly OutfitComponent[],
  wardrobeById: ReadonlyMap<string, WardrobeItem>,
  preference: HeadCoveringPreference | undefined,
  context: NigerianStylingContext,
): boolean {
  if (preference === 'never') return false;
  if (preference === 'always') return true;
  if (preference === 'events') return context === 'event' || context === 'traditional';
  return context === 'traditional'
    && isWrapperBased(components, wardrobeById)
    && !hasSubtype(components, wardrobeById, 'blazer')
    && !hasSubtype(components, wardrobeById, 'jeans');
}

function styleHeadwearIsAllowed(
  components: readonly OutfitComponent[],
  wardrobeById: ReadonlyMap<string, WardrobeItem>,
  input: NigerianStylingV1Input,
): boolean {
  return input.context !== 'casual' &&
    !hasSubtype(components, wardrobeById, 'blazer') &&
    !hasSubtype(components, wardrobeById, 'jeans');
}

function asCoveringItemComponent(item: WardrobeItem): OutfitComponent {
  return {
    category: item.category,
    subType: item.subType,
    colorFamily: item.colorFamily,
    owned: true,
    matchedItemId: item.id,
    photoUri: item.photoUri,
  };
}

/**
 * Structural-only pass over v3.7 candidates. It does not score or generate base looks.
 * Owned covering items can add deterministic variants; gele and ichafu remain
 * separately classified style headwear and are never substituted for coverings.
 */
export function applyNigerianStylingV1(
  candidates: readonly OutfitSet[],
  input: NigerianStylingV1Input,
): NigerianStylingV1Result {
  const wardrobeById = new Map(input.wardrobe.map(item => [item.id, item]));
  const ownedCoveringItems = input.wardrobe.filter(item =>
    roleFor(item, input.rolesByItemId) === 'covering-item',
  );
  const decisions: NigerianStylingV1Decision[] = [];
  const outfits: OutfitSet[] = [];
  const gapNotes = new Set<string>();

  for (const source of candidates) {
    const removedStyleHeadwearIds: string[] = [];
    const removedCoveringItemIds: string[] = [];
    const baseComponents = source.components.filter(component => {
      const id = component.matchedItemId;
      const role = roleFor(id ? wardrobeById.get(id) : undefined, input.rolesByItemId);
      const itemAllowed = role !== 'style-headwear' ||
        (input.includeStyleHeadwear === true &&
          styleHeadwearIsAllowed(source.components, wardrobeById, input));
      if (role === 'covering-item' || !itemAllowed) {
        if (id && role === 'style-headwear') removedStyleHeadwearIds.push(id);
        if (id && role === 'covering-item') removedCoveringItemIds.push(id);
        return false;
      }
      return true;
    });

    const wantsCovering = coveringItemsWanted(
      baseComponents, wardrobeById, input.headCoveringPreference, input.context,
    );
    const selectedCoverings: Array<WardrobeItem | undefined> = wantsCovering && ownedCoveringItems.length > 0
      ? ownedCoveringItems
      : [undefined];
    const headCoveringSatisfied = !wantsCovering || ownedCoveringItems.length > 0;
    const coveringReason = wantsCovering && ownedCoveringItems.length === 0
      ? 'requested covering item is not owned'
      : undefined;
    if (coveringReason) gapNotes.add(MISSING_COVERING_GAP_NOTE);

    for (const covering of selectedCoverings) {
      const components = covering
        ? [...baseComponents, asCoveringItemComponent(covering)]
        : baseComponents;
      const changed = removedStyleHeadwearIds.length > 0 ||
        removedCoveringItemIds.length > 0 || covering !== undefined;
      const remainingIds = itemIds(components);
      const outputId = changed
        ? `nigerian-v1-${source.id}-${covering?.id ?? 'no-covering'}`
        : source.id;
      const outfit: OutfitSet = changed
        ? {
          ...source,
          id: outputId,
          components,
          rationale: undefined,
          heroId: source.heroId && remainingIds.includes(source.heroId) ? source.heroId : undefined,
        }
        : source;
      const status = structuralStatus(outfit.components, wardrobeById, input);
      const reason = status.reason ?? coveringReason;

      decisions.push({
        sourceOutfitId: source.id,
        outputOutfitId: outfit.id,
        ...status,
        reason,
        removedStyleHeadwearIds,
        removedCoveringItemIds,
        addedCoveringItemIds: covering ? [covering.id] : [],
        headCoveringSatisfied,
      });
      if (status.status !== 'rejected') outfits.push(outfit);
    }
  }

  return { outfits, decisions, gapNotes: [...gapNotes] };
}
