import type { Band, EventBrief, ItemFacts, LookFacts } from './types';
import type { OutfitSet, WardrobeItem } from '../../../constants/types';
import { applyNigerianStylingV1, type NigerianStylingContext } from '../v1';

type Observed<T> = { [K in keyof T]?: Exclude<T[K], undefined> | null };

/** Observation shape only. No fixture IDs, ratings or intended outcomes are read. */
export type BlindObservation = Omit<Observed<LookFacts>, 'items' | 'brief' | 'v1'> & {
  items: Observed<ItemFacts>[];
  brief: Observed<EventBrief>;
  v1: LookFacts['v1'];
};

/** Exact supporting phrases, not the whole description attached to every item. */
export interface BlindSourceFacts {
  context: string;
  itemPhrases: readonly string[];
  look: string;
}

/** Exactly the reviewer-supplied table; no nearest role/event substitution. */
type RoleBands = Readonly<Partial<Record<NonNullable<EventBrief['role']>, Band>>>;
export const EVENT_BANDS: Readonly<Partial<Record<NonNullable<EventBrief['occasion']>, RoleBands>>> = {
  owambe: { guest: [7, 8], family: [8, 9], host: [9, 10] },
  traditionalWedding: { guest: [8, 8], family: [9, 9], bride: [10, 10] },
  funeral: { guest: [7, 7], closeFamily: [8, 8] },
  naming: { mother: [8, 8] },
};

const KEY_KINDS = new Set([
  'dress', 'jumpsuit', 'abaya', 'kaftan', 'bubu', 'top', 'ankara-top', 'buba',
  'bottom', 'trousers', 'skirt', 'ankara-skirt', 'iro', 'wrapper', 'double-wrapper',
  'jeans', 'shorts', 'set', 'set-piece', 'two-piece-set', 'co-ord', 'suit',
  'skirt-suit', 'trouser-suit', 'outerwear', 'blazer', 'jacket', 'layer', 'zani',
  'dashiki',
]);
const NON_KEY_KINDS = new Set([
  'footwear', 'shoes', 'bag', 'clutch', 'box-bag', 'jewellery', 'earrings',
  'necklace', 'coral', 'ivory-odu', 'belt', 'headwear', 'gele', 'ichafu', 'head-tie',
  'gyale', 'kallabi', 'mayafi', 'hijab', 'scarf', 'turban', 'headwrap', 'head-scarf',
  'hat', 'fascinator', 'baseball-cap', 'veil', 'ipele', 'hand-fan',
]);

function known<T extends object>(value: T): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(Object.entries(value).filter(([, fact]) => fact != null)) as {
    [K in keyof T]?: NonNullable<T[K]>;
  };
}

/** Approved lexical role convention, not a judgement of an item's importance. */
export function keyGarment(kind: string | null | undefined): boolean | undefined {
  if (kind && KEY_KINDS.has(kind)) return true;
  if (kind && NON_KEY_KINDS.has(kind)) return false;
  return undefined;
}

const V1_CATEGORIES: Readonly<Record<string, WardrobeItem['category']>> = {
  dress: 'dress', jumpsuit: 'dress', abaya: 'dress', kaftan: 'dress', bubu: 'dress',
  top: 'top', 'ankara-top': 'top', buba: 'top',
  bottom: 'bottom', trousers: 'bottom', skirt: 'bottom', 'ankara-skirt': 'bottom',
  iro: 'bottom', wrapper: 'bottom', jeans: 'bottom', shorts: 'bottom',
  outerwear: 'outerwear', blazer: 'outerwear', jacket: 'outerwear', layer: 'outerwear',
  shoes: 'shoes', footwear: 'shoes', bag: 'bag', clutch: 'bag', 'box-bag': 'bag',
  jewellery: 'jewelry', earrings: 'jewelry', necklace: 'jewelry', coral: 'jewelry',
  'ivory-odu': 'jewelry', belt: 'jewelry', gele: 'jewelry', ichafu: 'jewelry',
  gyale: 'jewelry', kallabi: 'jewelry', mayafi: 'jewelry', hijab: 'jewelry',
  scarf: 'jewelry', turban: 'jewelry', headwrap: 'jewelry', 'head-scarf': 'jewelry',
  hat: 'jewelry', fascinator: 'jewelry', 'baseball-cap': 'jewelry', veil: 'jewelry',
  'hand-fan': 'jewelry',
};

function actualV1(items: readonly ItemFacts[], brief: EventBrief): LookFacts['v1'] {
  const unmapped = items.filter(item => !item.kind || !V1_CATEGORIES[item.kind]);
  if (unmapped.length) return {
    decision: {
      status: 'unknown', headCoveringSatisfied: false,
      reason: 'Described item cannot be mapped to a V1 subtype.',
    },
    gapNotes: unmapped.map(item => `V1 mapping unknown: ${item.id} (${item.kind ?? 'unknown kind'}).`),
  };
  const context: NigerianStylingContext = brief.occasion === 'work' ? 'work'
    : brief.occasion === 'casual' ? 'casual'
      : ['traditionalWedding', 'traditionalEvent', 'owambe', 'naming'].includes(brief.occasion ?? '')
        ? 'traditional' : 'event';
  const wardrobe: WardrobeItem[] = items.map(item => ({
    id: item.id, category: V1_CATEGORIES[item.kind!], subType: item.kind!,
    // Mechanical fields required by the V1 type, never used as styling facts.
    colorFamily: item.colour ?? 'unknown', photoUri: '', occasionTags: [], seasonTags: [],
    createdAt: '1970-01-01T00:00:00.000Z',
  }));
  const outfit: OutfitSet = {
    id: 'blind-described-look', scenario: context === 'traditional' ? 'traditional-event' : context,
    components: wardrobe.map(item => ({
      category: item.category, subType: item.subType, colorFamily: item.colorFamily,
      owned: true, matchedItemId: item.id,
    })),
  };
  const result = applyNigerianStylingV1([outfit], { wardrobe, relationships: [], context });
  const decision = result.decisions[0];
  if (!decision) throw new Error('V1 returned no decision for a described look.');
  if (result.decisions.some(other => other.status !== decision.status
    || other.headCoveringSatisfied !== decision.headCoveringSatisfied)) {
    return { decision: { status: 'unknown', headCoveringSatisfied: false,
      reason: 'V1 returned different decisions for covering variants.' }, gapNotes: result.gapNotes };
  }
  return { decision, gapNotes: [
    ...result.gapNotes,
    ...(decision.reason ? [decision.reason] : []),
    ...(decision.removedStyleHeadwearIds.length
      ? ['V1 removed described style headwear under its default request setting.'] : []),
    ...(decision.removedCoveringItemIds.length
      ? ['V1 removed/reselected described covering items under its default preference.'] : []),
  ] };
}

/** Only explicit lexical facts; a lack of descriptive words is not a negative fact. */
function sourceItemFacts(phrase: string): Partial<ItemFacts> {
  const facts: Partial<ItemFacts> = {};
  if (/\bbackless\b/i.test(phrase)) facts.backless = true;
  if (/\bstrapless\b/i.test(phrase)) facts.strapless = true;
  if (/\bsleeveless\b/i.test(phrase)) facts.sleeveLength = 'none';
  else if (/\bshort sleeves\b/i.test(phrase)) facts.sleeveLength = 'short';
  else if (/\belbow-length sleeves\b/i.test(phrase)) facts.sleeveLength = 'elbow';
  else if (/\blong sleeves\b/i.test(phrase)) facts.sleeveLength = 'long';
  if (/\bmodest\b/i.test(phrase)) facts.modest = true;
  if (/\bclearly above the knee\b/i.test(phrase)) facts.hem = 'clearlyAboveKnee';
  else if (/\bslightly above (?:the )?knee\b/i.test(phrase)) facts.hem = 'slightlyAboveKnee';
  if (/\bsequin(?:s|ned)?\b/i.test(phrase)) facts.finish = 'sequins';
  else if (/\bmetallic gold\b/i.test(phrase)) facts.finish = 'metallicGold';
  else if (/\bmetallic silver\b/i.test(phrase)) facts.finish = 'metallicSilver';
  else if (/\bhigh[- ]sheen gold\b/i.test(phrase)) facts.finish = 'highSheenGold';
  // Neither "small" nor a centimetre measurement proves all three shape facts.
  if (/\blow\b/i.test(phrase) && /\bclose to (?:the )?head\b/i.test(phrase)
    && /\b(?:unsculpted|no sculpted wings)\b/i.test(phrase)) {
    facts.headwearHeight = 'notTall';
    facts.headwearShape = 'lowCloseUnsculpted';
  }
  return facts;
}

export function adaptBlindLookFacts(
  observation: BlindObservation, source?: BlindSourceFacts,
): LookFacts {
  const brief: EventBrief = known(observation.brief);
  if (brief.formalityBand == null && brief.occasion && brief.role) {
    brief.formalityBand = EVENT_BANDS[brief.occasion]?.[brief.role];
  }
  const items = observation.items.map((item, index) => {
      if (item.id == null) throw new Error('A blind item needs a stable identifier.');
      return {
        ...known(item), ...(source ? sourceItemFacts(source.itemPhrases[index] ?? '') : {}),
        id: item.id, key: keyGarment(item.kind),
      };
    });
  const extras: Partial<LookFacts> = known({
    wornCover: observation.wornCover, armsCovered: observation.armsCovered,
    shouldersCovered: observation.shouldersCovered, kneesCovered: observation.kneesCovered,
    headCovered: observation.headCovered,
  });
  if (source) {
    // A same-garment description can override inherited evidence. Only a single
    // key garment makes that grammatical subject unambiguous.
    const keys = items.filter(item => item.key);
    if (keys.length === 1 && /^the same\b/i.test(source.look)) {
      Object.assign(keys[0], sourceItemFacts(source.look));
    }
    const requirement = /\b(?:always covers|always covers her) ([^.]+)/i.exec(source.context)?.[1];
    if (requirement) {
      const stated: NonNullable<EventBrief['statedCoverage']>[number][] = [];
      if (/\barms\b/i.test(requirement)) stated.push('arms');
      if (/\bshoulders\b/i.test(requirement)) stated.push('shoulders');
      if (/\b(?:knees|legs|long hems)\b/i.test(requirement)) stated.push('knees');
      if (/\b(?:head|hair)\b/i.test(requirement)) stated.push('head');
      if (stated.length) brief.statedCoverage = stated;
    }
    const family = /\b(?:family has asked for|group has been assigned a) ([^.]+?) (?:and is|George wrapper)/i
      .exec(source.context)?.[1];
    if (family) brief.familyColours = family.toLowerCase().split(/\s+and\s+/);
    if (/\bno (?:head covering|head cover)\b/i.test(source.look)) extras.headCovered = false;
    if (/\bno (?:jacket|wrap|shawl|cover)\b/i.test(source.look)) extras.wornCover = false;
    if (items.some(item => ['jacket', 'blazer', 'shawl'].includes(item.kind ?? ''))) {
      extras.wornCover = true;
    }
    // Presence proves coverage only where the wording does; shape alone is not coverage.
    if (source.itemPhrases.some(phrase => /\b(?:over her head|over (?:the )?head)\b/i.test(phrase))
      || items.some(item => item.kind === 'hijab')) extras.headCovered = true;
    if (extras.wornCover !== true) {
      if (items.some(item => item.key && ['none', 'short'].includes(item.sleeveLength ?? ''))) {
        extras.armsCovered = false;
      }
      if (items.some(item => item.key && item.shoulderCoverage === 'uncovered')) extras.shouldersCovered = false;
    }
    if (items.some(item => item.key && ['aboveKnee', 'clearlyAboveKnee', 'slightlyAboveKnee'].includes(item.hem ?? ''))) {
      extras.kneesCovered = false;
    }
  }
  return {
    ...extras, items,
    brief,
    traditionalWear: observation.traditionalWear ?? undefined,
    printDominance: observation.printDominance ?? undefined,
    // Reviewer-authorised structural experiment: no manufactured set relationships,
    // no personal covering override, and no default-eligible shortcut.
    v1: actualV1(items, brief),
  };
}
