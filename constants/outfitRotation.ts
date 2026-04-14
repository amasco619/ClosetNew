import { WardrobeItem, OutfitSet, OutfitComponent, OccasionTag, UserProfile } from './types';

// ─── Config ────────────────────────────────────────────────────────────────────

export const SCENARIOS: OccasionTag[] = [
  'work', 'casual', 'date', 'event', 'interview', 'wedding', 'travel',
];

/** How many outfit variants to show per scenario each day */
const OUTFITS_PER_SCENARIO_PER_DAY = 2;

/** Max outfits to generate per scenario in the pool */
const MAX_PER_SCENARIO = 24;

// ─── Colour / scoring (mirrors outfitGenerator, kept local to avoid coupling) ─

const NEUTRAL_COLORS = new Set([
  'black', 'white', 'grey', 'beige', 'cream', 'navy', 'camel', 'brown', 'olive',
]);
const isNeutral = (c: string): boolean => NEUTRAL_COLORS.has(c);
const colorsHarmonize = (c1: string, c2: string): boolean =>
  c1 === c2 || isNeutral(c1) || isNeutral(c2);

const SCENARIO_AFFINITY: Record<OccasionTag, string[]> = {
  casual:    ['t-shirt','long-sleeve','henley','sweater','jeans','chinos','shorts','leggings','sneakers','flats','crossbody','backpack','hoodie','cardigan','denim-jacket'],
  work:      ['blouse','shirt','polo-shirt','sweater','trousers','chinos','midi-skirt','blazer','coat','heels','flats','loafers','tote','shoulder-bag','earrings','watch'],
  date:      ['blouse','camisole','midi-dress','wrap-dress','mini-dress','midi-skirt','heels','mules','flats','clutch','mini-bag','crossbody','earrings','necklace'],
  event:     ['cocktail-dress','midi-dress','maxi-dress','blouse','wide-leg','blazer','heels','clutch','mini-bag','earrings','necklace','bracelet'],
  interview: ['blouse','shirt','blazer','trousers','midi-skirt','midi-dress','coat','heels','flats','loafers','tote','shoulder-bag','earrings','watch'],
  wedding:   ['midi-dress','maxi-dress','cocktail-dress','wrap-dress','midi-skirt','blouse','heels','clutch','mini-bag','earrings','necklace','bracelet'],
  travel:    ['t-shirt','long-sleeve','sweater','shirt','jeans','chinos','trousers','sneakers','flats','boots','crossbody','backpack','tote','blazer','cardigan','denim-jacket'],
};

const STYLE_PREFERRED_COLORS: Record<string, string[]> = {
  minimal:  ['black','white','grey','beige','cream'],
  elevated: ['black','navy','cream','camel','burgundy'],
  bold:     ['red','blue','green','pink','coral','burgundy'],
  romantic: ['pink','lavender','cream','beige','white'],
  classic:  ['navy','black','white','camel','grey'],
  youthful: ['pink','blue','green','red','coral','lavender'],
};

function passesConstraints(item: WardrobeItem, profile: UserProfile): boolean {
  if (profile.constraints.noSleeveless && item.subType === 'tank-top') return false;
  if (profile.constraints.noShortSkirts && (item.subType === 'mini-skirt' || item.subType === 'mini-dress')) return false;
  if ((profile.constraints.maxHeelHeight === 'flat' || profile.constraints.maxHeelHeight === 'low') && item.subType === 'heels') return false;
  return true;
}

function scoreForScenario(item: WardrobeItem, scenario: OccasionTag, profile: UserProfile): number {
  let score = 0;
  if (item.occasionTags.includes(scenario)) score += 4;
  if (SCENARIO_AFFINITY[scenario].includes(item.subType)) score += 2;
  const preferred = STYLE_PREFERRED_COLORS[profile.styleGoalPrimary ?? ''] ?? [];
  if (preferred.includes(item.colorFamily)) score += 1;
  return score;
}

function toComponent(item: WardrobeItem): OutfitComponent {
  return {
    category: item.category,
    subType: item.subType,
    colorFamily: item.colorFamily,
    owned: true,
    matchedItemId: item.id,
    photoUri: item.photoUri,
  };
}

function fingerprint(components: OutfitComponent[]): string {
  return components
    .map(c => c.matchedItemId)
    .filter(Boolean)
    .sort()
    .join('|');
}

// ─── Seeded PRNG (Mulberry32) ─────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  const rand = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Rotation State ────────────────────────────────────────────────────────────

export interface RotationState {
  /** Changes when wardrobe or constraints change — triggers pool reset */
  poolHash: string;
  /** Stable random seed used to shuffle this pool's order */
  shuffleSeed: number;
  /** Per-scenario cursor: index of first outfit shown TODAY */
  todayCursors: Partial<Record<OccasionTag, number>>;
  /** Per-scenario cursor: index to start from TOMORROW */
  nextCursors: Partial<Record<OccasionTag, number>>;
  /** ISO date string (YYYY-MM-DD) when cursors were last advanced */
  lastDate: string;
  /** How many full cycles through the pool have been completed */
  cycleCount: number;
}

export const INITIAL_ROTATION_STATE: RotationState = {
  poolHash: '',
  shuffleSeed: 1,
  todayCursors: {},
  nextCursors: {},
  lastDate: '',
  cycleCount: 0,
};

// ─── Pool hash ────────────────────────────────────────────────────────────────

/** Produces a stable string that changes whenever wardrobe contents or constraints change */
export function computePoolHash(items: WardrobeItem[], profile: UserProfile): string {
  const itemSig = items
    .map(i => `${i.id}:${i.category}:${i.subType}:${i.colorFamily}`)
    .sort()
    .join(',');
  const profileSig = [
    profile.styleGoalPrimary ?? '',
    String(profile.constraints.noSleeveless),
    String(profile.constraints.noShortSkirts),
    profile.constraints.maxHeelHeight,
  ].join(':');
  return `${itemSig}|${profileSig}`;
}

// ─── Pool generation ──────────────────────────────────────────────────────────

/**
 * Generates all valid outfit combinations grouped by scenario.
 * Returns more combinations than will ever be shown in a day — this is the
 * full pool the rotation cursor cycles through.
 */
export function generateOutfitPool(
  items: WardrobeItem[],
  profile: UserProfile,
): Record<OccasionTag, OutfitSet[]> {
  const result = {} as Record<OccasionTag, OutfitSet[]>;
  const eligible = items.filter(i => passesConstraints(i, profile));

  for (const scenario of SCENARIOS) {
    const seen = new Set<string>();
    const pool: OutfitSet[] = [];

    const byCategory: Record<string, WardrobeItem[]> = {};
    for (const item of eligible) {
      if (!byCategory[item.category]) byCategory[item.category] = [];
      byCategory[item.category].push(item);
    }
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].sort(
        (a, b) => scoreForScenario(b, scenario, profile) - scoreForScenario(a, scenario, profile),
      );
    }

    const tops     = byCategory['top']      ?? [];
    const bottoms  = byCategory['bottom']   ?? [];
    const dresses  = byCategory['dress']    ?? [];
    const shoesAll = byCategory['shoes']    ?? [];
    const bagsAll  = byCategory['bag']      ?? [];
    const jewelAll = byCategory['jewelry']  ?? [];

    // ── Build cores (dress -or- top+bottom pair) ──────────────────────────────

    type Core = { coreItems: WardrobeItem[]; baseColor: string };
    const cores: Core[] = [];

    for (const dress of dresses.slice(0, 6)) {
      cores.push({ coreItems: [dress], baseColor: dress.colorFamily });
    }

    if (bottoms.length === 0) {
      for (const top of tops.slice(0, 6)) {
        cores.push({ coreItems: [top], baseColor: top.colorFamily });
      }
    } else {
      for (const top of tops.slice(0, 6)) {
        let addedPair = false;
        for (const bottom of bottoms.slice(0, 5)) {
          if (colorsHarmonize(top.colorFamily, bottom.colorFamily)) {
            cores.push({ coreItems: [top, bottom], baseColor: top.colorFamily });
            addedPair = true;
          }
        }
        // Fallback: top-only if no harmonious bottom found
        if (!addedPair) {
          cores.push({ coreItems: [top], baseColor: top.colorFamily });
        }
      }
    }

    // ── For each core, try different shoe options ─────────────────────────────

    for (const core of cores) {
      if (pool.length >= MAX_PER_SCENARIO) break;

      const coreIds = new Set(core.coreItems.map(i => i.id));

      const harmShoes = shoesAll.filter(
        s => !coreIds.has(s.id) && colorsHarmonize(core.baseColor, s.colorFamily),
      );
      const otherShoes = shoesAll.filter(
        s => !coreIds.has(s.id) && !harmShoes.includes(s),
      );

      // Try harmonious shoes first, then neutral fallbacks
      const shoeOptions: (WardrobeItem | null)[] =
        harmShoes.length > 0
          ? harmShoes.slice(0, 3)
          : otherShoes.length > 0
          ? otherShoes.slice(0, 2)
          : [null];

      for (const shoe of shoeOptions) {
        if (pool.length >= MAX_PER_SCENARIO) break;

        const outfit: OutfitComponent[] = core.coreItems.map(toComponent);
        const usedIds = new Set(coreIds);

        if (shoe) {
          outfit.push(toComponent(shoe));
          usedIds.add(shoe.id);
        }

        // Best harmonious bag
        const bag =
          bagsAll.find(b => !usedIds.has(b.id) && colorsHarmonize(core.baseColor, b.colorFamily)) ??
          bagsAll.find(b => !usedIds.has(b.id));
        if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }

        // Best jewelry
        const jewel = jewelAll.find(j => !usedIds.has(j.id));
        if (jewel) { outfit.push(toComponent(jewel)); }

        const fp = fingerprint(outfit);
        if (!fp || seen.has(fp)) continue;
        seen.add(fp);

        pool.push({
          id: `pool-${scenario}-${pool.length}`,
          scenario,
          components: outfit,
        });
      }
    }

    result[scenario] = pool;
  }

  return result;
}

// ─── Daily rotation ───────────────────────────────────────────────────────────

/**
 * Given the full pool and stored rotation state, returns today's outfits.
 *
 * - Same day   → returns the same outfits as yesterday (stable within a day)
 * - New day    → advances each scenario cursor by OUTFITS_PER_SCENARIO_PER_DAY
 * - Pool empty → gracefully returns empty array
 *
 * Returns both the outfits to display and the updated state to persist.
 */
export function applyDailyRotation(
  pool: Record<OccasionTag, OutfitSet[]>,
  state: RotationState,
  today: string,
): { outfits: OutfitSet[]; newState: RotationState } {
  const isNewDay = today !== state.lastDate;
  const n = OUTFITS_PER_SCENARIO_PER_DAY;

  const todayCursors: Partial<Record<OccasionTag, number>> = {};
  const nextCursors: Partial<Record<OccasionTag, number>> = {};
  const outfits: OutfitSet[] = [];
  let cycleCount = state.cycleCount;

  SCENARIOS.forEach((scenario, si) => {
    const scenarioPool = pool[scenario] ?? [];
    if (scenarioPool.length === 0) return;

    // Each scenario gets a different shuffle by offsetting the seed
    const shuffled = seededShuffle(scenarioPool, state.shuffleSeed + si * 7919);

    // Determine today's starting cursor
    const startCursor = isNewDay
      ? (state.nextCursors[scenario] ?? 0)
      : (state.todayCursors[scenario] ?? 0);

    todayCursors[scenario] = startCursor;

    // Pick this day's outfits
    const count = Math.min(n, shuffled.length);
    for (let i = 0; i < count; i++) {
      const idx = (startCursor + i) % shuffled.length;
      outfits.push({
        ...shuffled[idx],
        id: `daily-${scenario}-${i}`,
      });
    }

    // Compute next day's cursor (wraps around)
    const next = (startCursor + count) % shuffled.length;
    if (next < startCursor) cycleCount = cycleCount + 1;
    nextCursors[scenario] = next;
  });

  const newState: RotationState = {
    poolHash: state.poolHash,
    shuffleSeed: state.shuffleSeed,
    todayCursors,
    nextCursors,
    lastDate: today,
    cycleCount,
  };

  return { outfits, newState };
}

/** Today's date string in YYYY-MM-DD format */
export function todayString(): string {
  return new Date().toISOString().split('T')[0];
}
