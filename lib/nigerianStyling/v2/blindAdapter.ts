import type { Band, EventBrief, ItemFacts, LookFacts } from './types';

type Observed<T> = { [K in keyof T]-?: Exclude<T[K], undefined> | null };

/** Observation shape only: no fixture IDs, source descriptions or ratings are read. */
export type BlindObservation = Omit<Observed<LookFacts>, 'items' | 'brief' | 'v1'> & {
  items: Observed<ItemFacts>[];
  brief: Observed<EventBrief>;
  v1: LookFacts['v1'];
};

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

export function adaptBlindLookFacts(observation: BlindObservation): LookFacts {
  const brief: EventBrief = known(observation.brief);
  if (brief.formalityBand == null && brief.occasion && brief.role) {
    brief.formalityBand = EVENT_BANDS[brief.occasion]?.[brief.role];
  }
  return {
    items: observation.items.map(item => {
      if (item.id == null) throw new Error('A blind item needs a stable identifier.');
      return { ...known(item), id: item.id, key: keyGarment(item.kind) };
    }),
    brief,
    traditionalWear: observation.traditionalWear ?? undefined,
    printDominance: observation.printDominance ?? undefined,
    // No structural relationships are encoded in these fixtures. Named/co-ordinated
    // garments do not prove confirmed membership or covering satisfaction.
    // Only a supplied fact-backed V1 decision can replace this unknown.
    v1: observation.v1,
  };
}
