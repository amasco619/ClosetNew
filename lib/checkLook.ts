import type { GarmentGroup, OccasionTag, UserProfile, WardrobeItem } from '../constants/types';
import {
  effectiveFormality, getScenarioFormality, scoreOutfitCombo,
} from '../constants/outfitScoring';
import { projectRelationshipsForStyling } from './stylingRelationships';
import { projectWardrobeForStyling } from './stylingWardrobe';
import { warmthMatchScore } from '../constants/weatherPure';

export type CheckLookVerdict = 'Works' | 'Almost' | 'Rethink';

export interface CheckLookSelection {
  itemIds: string[];
  occasion: OccasionTag;
  temperatureC?: number;
}

export type CheckLookResult =
  | { tier: 'free'; verdict: CheckLookVerdict }
  | {
      tier: 'premium';
      verdict: CheckLookVerdict;
      working: string[];
      clashes: string[];
      swaps: Array<{ replacesId: string; replacement: WardrobeItem }>;
      notes: string[];
    };

interface CheckLookSignals {
  score: number;
  spread: number;
  largePrintCount: number;
  printCount: number;
  shoeMismatch: boolean;
  bagMismatch: boolean;
  occasionMismatch: boolean;
  weatherMismatch: boolean;
  formalityMismatch: boolean;
}

const PATTERNED = new Set(['stripe', 'floral', 'check', 'print', 'wax-print', 'geometric', 'animal']);
const LARGE_PATTERNS = new Set(['floral', 'animal']);

export function isValidCheckLookSelection(items: readonly WardrobeItem[], ids: readonly string[]): boolean {
  const selected = ids.map(id => items.find(item => item.id === id)).filter((item): item is WardrobeItem => !!item);
  const categories = new Set(selected.map(item => item.category));
  return selected.length === new Set(ids).size &&
    (categories.has('dress') || (categories.has('top') && categories.has('bottom'))) &&
    !(categories.has('dress') && (categories.has('top') || categories.has('bottom')));
}

function signalsForLook(
  items: WardrobeItem[],
  occasion: OccasionTag,
  temperatureC: number | undefined,
  profile?: UserProfile,
): CheckLookSignals {
  const components = items.map(item => ({
    category: item.category,
    subType: item.subType,
    colorFamily: item.colorFamily,
    owned: true,
    matchedItemId: item.id,
  }));
  const score = scoreOutfitCombo(components, items, profile).total;
  const levels = items.map(effectiveFormality);
  const spread = levels.length > 1 ? Math.max(...levels) - Math.min(...levels) : 0;
  const patterned = items.filter(item => item.pattern && PATTERNED.has(item.pattern));
  const largePrintCount = items.filter(item =>
    item.patternScale === 'large' || (item.pattern && LARGE_PATTERNS.has(item.pattern)),
  ).length;
  const [minFormality, maxFormality] = getScenarioFormality(occasion, profile);
  const outsideOccasionBand = (item: WardrobeItem | undefined) =>
    !!item && (effectiveFormality(item) < minFormality - 1 || effectiveFormality(item) > maxFormality + 1);
  const mainPiece = items.find(item => item.category === 'dress') ?? items.find(item => item.category === 'top');
  const shoe = items.find(item => item.category === 'shoes');
  const bag = items.find(item => item.category === 'bag');
  const weatherItems = items.filter(item =>
    item.category === 'top' || item.category === 'bottom' ||
    item.category === 'dress' || item.category === 'outerwear',
  );
  const hasColdLayer = weatherItems.some(item => item.warmthBand === 'cold');
  const weatherMismatch = temperatureC === undefined
    ? false
    : weatherItems.some(item => warmthMatchScore(item, temperatureC) < 0) ||
      (temperatureC < 12 && !items.some(item => item.category === 'outerwear') && !hasColdLayer);

  return {
    score, spread, largePrintCount, printCount: patterned.length,
    shoeMismatch: outsideOccasionBand(shoe),
    bagMismatch: outsideOccasionBand(bag),
    occasionMismatch: !!mainPiece?.occasionTags.length && !mainPiece.occasionTags.includes(occasion),
    weatherMismatch,
    formalityMismatch: spread > 3,
  };
}

function verdictFor(signals: CheckLookSignals): CheckLookVerdict {
  if (signals.occasionMismatch || signals.largePrintCount >= 3 ||
      signals.spread >= 5 || signals.shoeMismatch || signals.bagMismatch ||
      signals.score < 2) return 'Rethink';
  if (signals.formalityMismatch || signals.printCount >= 2 ||
      signals.weatherMismatch || signals.score < 8) return 'Almost';
  return 'Works';
}

function confirmedCoordinatedUnits(items: WardrobeItem[], groups: readonly GarmentGroup[], ownerId?: string) {
  const projected = projectRelationshipsForStyling(
    projectWardrobeForStyling(items, [...groups]), ownerId,
  );
  return (projected.relationshipUnits ?? []).filter(unit =>
    unit.relationshipType === 'coordinated_set' &&
    unit.confirmationStatus === 'user_confirmed' &&
    unit.memberIds.length > 1,
  );
}

function premiumDetails(
  selected: WardrobeItem[],
  selection: CheckLookSelection,
  signals: CheckLookSignals,
  allItems: WardrobeItem[],
  profile: UserProfile | undefined,
  groups: readonly GarmentGroup[] | undefined,
  ownerId: string | undefined,
  membershipUnavailable: boolean,
): Extract<CheckLookResult, { tier: 'premium' }> {
  const [min, max] = getScenarioFormality(selection.occasion, profile);
  const working: string[] = [];
  const clashes: string[] = [];
  if (!signals.formalityMismatch && !signals.shoeMismatch && !signals.bagMismatch) {
    working.push(`The pieces sit comfortably within the occasion’s ${min}–${max} formality range.`);
  }
  if (!signals.occasionMismatch) working.push('The main piece suits the occasion.');
  if (!signals.printCount) working.push('A calm print mix lets the pieces work together.');
  if (!signals.weatherMismatch && selection.temperatureC !== undefined) {
    working.push('The selected pieces suit the temperature you entered.');
  }
  if (signals.formalityMismatch) clashes.push('The pieces have a wide spread of formality.');
  if (signals.largePrintCount >= 3) clashes.push('Three or more large prints compete for attention.');
  else if (signals.printCount >= 2) clashes.push('The look combines multiple prints.');
  if (signals.shoeMismatch) clashes.push('The shoes feel out of step with the occasion.');
  if (signals.bagMismatch) clashes.push('The bag feels out of step with the occasion.');
  if (signals.occasionMismatch) clashes.push('The main piece is not tagged for this occasion.');
  if (signals.weatherMismatch) clashes.push('One or more pieces may not suit the temperature entered.');
  if (signals.score < 8 && clashes.length === 0) {
    clashes.push('The overall styling balance could be stronger.');
  }

  const notes: string[] = [];
  let swaps: Array<{ replacesId: string; replacement: WardrobeItem }> = [];
  if (membershipUnavailable || !groups) {
    notes.push('Set membership could not be checked, so swaps are unavailable for this look.');
  } else {
    const units = confirmedCoordinatedUnits(allItems, groups, ownerId);
    const memberIds = new Set(units.flatMap(unit => unit.memberIds));
    for (const unit of units) {
      const selectedCount = unit.memberIds.filter(id => selection.itemIds.includes(id)).length;
      if (selectedCount > 0 && selectedCount < unit.memberIds.length) {
        notes.push(`Partial confirmed coordinated set: ${selectedCount} of ${unit.memberIds.length} pieces; the other pieces are not included.`);
      }
    }
    const candidates = allItems.filter(item =>
      !selection.itemIds.includes(item.id) && !memberIds.has(item.id),
    );
    const currentScore = signals.score;
    const options: Array<{ replacesId: string; replacement: WardrobeItem; improvement: number }> = [];
    for (const current of selected) {
      if (memberIds.has(current.id)) continue;
      for (const replacement of candidates) {
        if (replacement.category !== current.category) continue;
        const nextItems = selected.map(item => item.id === current.id ? replacement : item);
        const next = signalsForLook(nextItems, selection.occasion, selection.temperatureC, profile);
        const improvement = next.score - currentScore;
        if (improvement > 0) options.push({ replacesId: current.id, replacement, improvement });
      }
    }
    const usedReplacements = new Set<string>();
    swaps = options
      .sort((a, b) => b.improvement - a.improvement)
      .filter(option => {
        if (usedReplacements.has(option.replacement.id)) return false;
        usedReplacements.add(option.replacement.id);
        return true;
      })
      .slice(0, 2)
      .map(({ replacesId, replacement }) => ({ replacesId, replacement }));
  }
  return { tier: 'premium', verdict: verdictFor(signals), working, clashes, swaps, notes };
}

export function evaluateCheckLook(
  allItems: WardrobeItem[],
  selection: CheckLookSelection,
  options: {
    premium: boolean;
    profile?: UserProfile;
    groups?: readonly GarmentGroup[];
    ownerId?: string;
    membershipUnavailable?: boolean;
  },
): CheckLookResult {
  if (!isValidCheckLookSelection(allItems, selection.itemIds)) {
    throw new Error('Choose a dress or both a top and bottom from your wardrobe.');
  }
  const selected = selection.itemIds.map(id => allItems.find(item => item.id === id)!);
  const signals = signalsForLook(selected, selection.occasion, selection.temperatureC, options.profile);
  if (!options.premium) return { tier: 'free', verdict: verdictFor(signals) };
  return premiumDetails(
    selected, selection, signals, allItems, options.profile, options.groups,
    options.ownerId,
    options.membershipUnavailable ?? false,
  );
}
