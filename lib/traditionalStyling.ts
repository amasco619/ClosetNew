import type { OutfitSet } from '../constants/types';
import { generateOutfitPool } from '../constants/outfitRotation';
import { getScenarioFormality } from '../constants/outfitScoring';
import type { StylingGarment, StylingWardrobe } from './stylingWardrobe';
import { coordinatedCandidateScopes, projectRelationshipsForStyling, type RelationshipAwareStylingWardrobe } from './stylingRelationships';

export type StylingContext = 'generic' | 'traditional';
type EvaluationArguments = Parameters<typeof generateOutfitPool> extends [unknown, ...infer Rest] ? Rest : never;

export interface StylingContextCandidates {
  context: StylingContext;
  pool: ReturnType<typeof generateOutfitPool>;
  /** Existing occasion evaluator/rotation slot; never a claim about ceremony. */
  sourceScenario?: 'wedding' | 'event';
  relationships: StylingWardrobe['relationships'];
  relationshipUnits: RelationshipAwareStylingWardrobe['relationshipUnits'];
  notice?: string;
}

const CORE = new Set(['top', 'bottom', 'dress']);
// Existing identifiers, not a new taxonomy or inferred event/identity label.
const AFRICAN_CORE = new Set(['buba', 'iro', 'wrapper', 'iro-and-buba', 'boubou', 'aso-ebi', 'kaftan']);

function isTraditionalAnchor(item: StylingGarment): boolean {
  return CORE.has(item.category) && (
    item.occasionTags.includes('traditional-event') ||
    AFRICAN_CORE.has(item.subType) || item.pattern === 'wax-print'
  );
}

/**
 * Explicit user context only. Canonical values/Phase A records are never edited.
 * Context guides eligibility; frozen v3.7 still generates, evaluates and ranks.
 */
export function buildStylingContextCandidates(
  wardrobe: StylingWardrobe,
  context: StylingContext,
  ...evaluation: EvaluationArguments
): StylingContextCandidates {
  const relatedWardrobe = 'relationshipUnits' in wardrobe
    ? wardrobe as RelationshipAwareStylingWardrobe
    : projectRelationshipsForStyling(wardrobe);
  const relationshipUnits = relatedWardrobe.relationshipUnits;
  if (context === 'generic') {
    return { context, pool: generateOutfitPool(wardrobe.v37Items, ...evaluation), relationships: wardrobe.relationships, relationshipUnits };
  }
  if (wardrobe.relationships === undefined) {
    throw new Error('Load wardrobe relationships before styling Traditional looks.');
  }
  const [min, max] = getScenarioFormality('traditional-event', evaluation[0]);
  const eligible = wardrobe.garments.filter(item =>
    !CORE.has(item.category) || item.formalityLevel === undefined ||
    (item.formalityLevel >= min && item.formalityLevel <= max),
  );
  const eligibleIds = new Set(eligible.map(item => item.id));
  const anchors = eligible.filter(isTraditionalAnchor);
  const anchorIds = new Set(anchors.map(item => item.id));
  const preferredCategories = new Set(anchors.map(item => item.category));
  const preferredIds = new Set(eligible.filter(item =>
    !CORE.has(item.category) || !preferredCategories.has(item.category) || anchorIds.has(item.id),
  ).map(item => item.id));
  const coordinated = (relationshipUnits ?? []).filter(unit =>
    unit.relationshipType === 'coordinated_set' && unit.confirmationStatus === 'user_confirmed',
  );
  const ownedIds = new Set(wardrobe.garments.map(item => item.id));
  const intact = (outfit: OutfitSet) => {
    const ids = new Set(outfit.components.map(component => component.matchedItemId));
    if (outfit.components.some(component => !component.matchedItemId || !ownedIds.has(component.matchedItemId))) return false;
    return coordinated.every(unit =>
      !unit.memberIds.some(id => ids.has(id)) ||
      unit.memberIds.every(id => ids.has(id)),
    );
  };
  const contextPool = (pool: ReturnType<typeof generateOutfitPool>, source: 'wedding' | 'event', candidates: OutfitSet[]) =>
    Object.fromEntries(Object.keys(pool).map(scenario => [scenario, scenario === source ? candidates : []])) as ReturnType<typeof generateOutfitPool>;
  const evaluate = (ids: Set<string>, requireAnchor: boolean, requiredMembers: readonly string[] = []) => {
    const pool = generateOutfitPool(wardrobe.v37Items.filter(item => ids.has(item.id)), ...evaluation);
    // Traditional's existing canonical band is 6–9, matching the wedding
    // evaluator. Event is an honest broader fallback for sparse/unknown data.
    // Neither mapping changes canonical formality or the frozen subtype rules.
    for (const sourceScenario of ['wedding', 'event'] as const) {
      const candidates = pool[sourceScenario].filter(outfit => intact(outfit) &&
        requiredMembers.every(id => outfit.components.some(component => component.matchedItemId === id)) &&
        (!requireAnchor || outfit.components.some(component => component.matchedItemId && anchorIds.has(component.matchedItemId))),
      );
      // Frozen daily rotation deduplicates across scenarios, first occurrence
      // wins. Isolate this selected context so a generic scenario cannot consume
      // its fingerprints before the bridge slot is reached.
      if (candidates.length) return { pool: contextPool(pool, sourceScenario, candidates), sourceScenario };
    }
    return { pool: contextPool(pool, 'wedding', []), sourceScenario: 'wedding' as const };
  };

  // Relationship-guided construction, not a relationship score/bonus.
  // Each cohort is evaluated/ranked by v3.7; concatenate its existing ordering
  // in supplied group order, deduplicating only identical owned combinations.
  const setCandidates = coordinatedCandidateScopes(relatedWardrobe, eligibleIds, anchorIds)
    .map(scope => evaluate(new Set(scope.itemIds), anchors.length > 0, scope.memberIds));
  for (const sourceScenario of ['wedding', 'event'] as const) {
    const seen = new Set<string>();
    const candidates = setCandidates.filter(result => result.sourceScenario === sourceScenario)
      .flatMap(result => result.pool[sourceScenario]).filter(outfit => {
        const key = outfit.components.map(component => component.matchedItemId).sort().join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (candidates.length) {
      return {
        context, sourceScenario, pool: contextPool(setCandidates[0].pool, sourceScenario, candidates),
        relationships: wardrobe.relationships, relationshipUnits,
        notice: anchors.length ? undefined : 'No Traditional-specific core piece is available. These looks use your occasion-ready wardrobe pieces.',
      };
    }
  }
  const preferred = evaluate(preferredIds, anchors.length > 0);
  if (preferred.pool[preferred.sourceScenario].length) {
    return {
      context, ...preferred, relationships: wardrobe.relationships, relationshipUnits,
      notice: anchors.length ? undefined : 'No Traditional-specific core piece is available. These looks use your occasion-ready wardrobe pieces.',
    };
  }
  // Narrowing may leave no valid combination (weather, constraints, a missing
  // group member, or frozen compatibility). Try owned eligible alternatives;
  // never relax coordinated-set integrity or synthesize a missing garment.
  const fallback = evaluate(eligibleIds, false);
  const hasResult = fallback.pool[fallback.sourceScenario].length > 0;
  const missingSetMember = coordinated.some(unit =>
    unit.availableMemberIds.length > 0 && unit.missingMemberIds.length > 0,
  );
  const notice = hasResult
    ? 'Your stronger Traditional pieces did not form a valid complete look today. These are compatible occasion-ready alternatives from your wardrobe.'
    : missingSetMember
      ? 'A confirmed coordinated set is incomplete in your active wardrobe. Restore its pieces or add another occasion-ready option; the set has not been split.'
      : !eligible.some(item => item.category === 'shoes')
        ? 'Add compatible footwear to complete a Traditional look from your wardrobe.'
        : 'Your available pieces do not form a complete Traditional look under the current compatibility, mood and weather rules. Add an occasion-ready core piece or review its styling details.';
  return { context, ...fallback, relationships: wardrobe.relationships, relationshipUnits, notice };
}

/** Only presentation context changes; identities and engine explanations survive. */
export function asTraditionalOutfits(outfits: readonly OutfitSet[]): OutfitSet[] {
  return outfits.map(outfit => ({
    ...outfit,
    id: `traditional-${outfit.id}-${outfit.components.map(component => component.matchedItemId).sort().join('|')}`,
    scenario: 'traditional-event',
    mood: 'African-first occasion styling',
  }));
}
