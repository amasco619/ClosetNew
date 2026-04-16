/**
 * Daily Rotation Engine
 *
 * Generates all valid outfit combinations (the "pool"), ranks each one by a
 * multi-dimensional confidence score, then applies a seeded daily shuffle so
 * the user sees a fresh selection every day — always from their most flattering
 * looks first.
 *
 * Confidence score dimensions (see outfitScoring.ts):
 *  Item-level: scenario fit, formality band, style goal (color + silhouette),
 *              undertone harmony, skin depth contrast, eye complementary, body type.
 *  Outfit-level: completeness (shoes/bag/jewelry), full color harmony, piece count.
 *
 * Freshness: outfits worn within the last 7 days are moved to the back of the
 * pool so every day feels like a new discovery.
 */

import { WardrobeItem, OutfitSet, OutfitComponent, OccasionTag, UserProfile } from './types';
import {
  isNeutral, colorsHarmonize, passesConstraints, toComponent,
  SCENARIO_AFFINITY, STYLE_PREFERRED_COLORS,
  scoreItemForProfile, scoreOutfitCombo,
} from './outfitScoring';

// ─── Config ────────────────────────────────────────────────────────────────────

export const SCENARIOS: OccasionTag[] = [
  'work', 'casual', 'date', 'event', 'interview', 'wedding', 'travel',
];

const OUTFITS_PER_SCENARIO_PER_DAY = 2;
const MAX_PER_SCENARIO = 30;

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

/**
 * Tiered shuffle: preserves quality ordering while adding variety.
 * Divides pool into thirds by confidence score, shuffles within each tier,
 * then concatenates. Top-tier outfits always surface before mid/low-tier ones.
 */
function tieredShuffle(pool: OutfitSet[], seed: number): OutfitSet[] {
  if (pool.length <= 3) return seededShuffle(pool, seed);
  const third = Math.ceil(pool.length / 3);
  const top = pool.slice(0, third);
  const mid = pool.slice(third, third * 2);
  const low = pool.slice(third * 2);
  return [
    ...seededShuffle(top, seed),
    ...seededShuffle(mid, seed + 1),
    ...seededShuffle(low, seed + 2),
  ];
}

// ─── Fingerprint ──────────────────────────────────────────────────────────────

function fingerprint(components: OutfitComponent[]): string {
  return components
    .map(c => c.matchedItemId)
    .filter(Boolean)
    .sort()
    .join('|');
}

// ─── Rotation State ────────────────────────────────────────────────────────────

export interface RotationState {
  poolHash: string;
  shuffleSeed: number;
  todayCursors: Partial<Record<OccasionTag, number>>;
  nextCursors: Partial<Record<OccasionTag, number>>;
  lastDate: string;
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

// ─── Pool hash ─────────────────────────────────────────────────────────────────

/**
 * Stable hash that changes whenever wardrobe contents OR any profile dimension
 * that affects scoring changes. Triggers full pool rebuild.
 */
export function computePoolHash(items: WardrobeItem[], profile: UserProfile): string {
  const itemSig = items
    .map(i => `${i.id}:${i.category}:${i.subType}:${i.colorFamily}:${i.formalityLevel}`)
    .sort()
    .join(',');
  const profileSig = [
    profile.styleGoalPrimary ?? '',
    profile.styleGoalSecondary ?? '',
    profile.bodyType ?? '',
    profile.skinTone ?? '',
    profile.undertone ?? '',
    profile.eyeColor ?? '',
    String(profile.constraints.noSleeveless),
    String(profile.constraints.noShortSkirts),
    profile.constraints.maxHeelHeight,
  ].join(':');
  return `${itemSig}|${profileSig}`;
}

// ─── Pool generation ──────────────────────────────────────────────────────────

/**
 * Generates all valid outfit combinations grouped by scenario, ranked by
 * multi-dimensional confidence score. The highest-scoring outfits appear first.
 *
 * Algorithm per scenario:
 *  1. Filter items by constraints.
 *  2. Score and sort each category by scoreItemForProfile.
 *  3. Build cores: dress-only OR top+harmonious-bottom pairs.
 *  4. For each core, try multiple shoe options (shoes are required — no shoes = no outfit).
 *  5. Add best harmonious bag and jewelry.
 *  6. Score each assembled outfit (item scores + combo bonus).
 *  7. Sort pool by confidence score descending.
 */
export function generateOutfitPool(
  items: WardrobeItem[],
  profile: UserProfile,
): Record<OccasionTag, OutfitSet[]> {
  const result = {} as Record<OccasionTag, OutfitSet[]>;
  const eligible = items.filter(i => passesConstraints(i, profile));

  for (const scenario of SCENARIOS) {
    const seen = new Set<string>();

    // ── Sort each category by scenario+profile confidence score ──────────────
    const byCategory: Record<string, WardrobeItem[]> = {};
    for (const item of eligible) {
      if (!byCategory[item.category]) byCategory[item.category] = [];
      byCategory[item.category].push(item);
    }
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].sort(
        (a, b) =>
          scoreItemForProfile(b, scenario, profile) -
          scoreItemForProfile(a, scenario, profile),
      );
    }

    const tops     = byCategory['top']      ?? [];
    const bottoms  = byCategory['bottom']   ?? [];
    const dresses  = byCategory['dress']    ?? [];
    const shoesAll = byCategory['shoes']    ?? [];
    const bagsAll  = byCategory['bag']      ?? [];
    const jewelAll = byCategory['jewelry']  ?? [];

    // ── Build core combinations ───────────────────────────────────────────────
    // A valid core is EITHER a dress (standalone) OR a top paired with a bottom.
    // A lone top is never a valid core — it does not constitute a complete outfit.
    type Core = { coreItems: WardrobeItem[]; baseColor: string };
    const cores: Core[] = [];

    // Dress-only cores — valid as complete looks on their own
    for (const dress of dresses.slice(0, 8)) {
      cores.push({ coreItems: [dress], baseColor: dress.colorFamily });
    }

    // Top + bottom pairs — tops MUST be paired with at least one bottom.
    // Harmonious colors are preferred; if none harmonise, use the
    // highest-scoring available bottom rather than skipping the top entirely.
    // If there are no bottoms in the wardrobe at all, tops are skipped.
    for (const top of tops.slice(0, 8)) {
      const harmoniousBottoms = bottoms.filter(b =>
        colorsHarmonize(top.colorFamily, b.colorFamily),
      );
      if (harmoniousBottoms.length > 0) {
        // Pair with up to 3 harmonious bottoms for variety
        for (const bottom of harmoniousBottoms.slice(0, 3)) {
          cores.push({ coreItems: [top, bottom], baseColor: top.colorFamily });
        }
      } else if (bottoms.length > 0) {
        // No harmonious match — still pair with the highest-scoring bottom
        cores.push({ coreItems: [top, bottoms[0]], baseColor: top.colorFamily });
      }
      // If bottoms is empty, this top is skipped — a lone top is not an outfit
    }

    // ── Expand cores with shoe variations, bag, jewelry ───────────────────────
    // Each assembled outfit is scored and tracked for sorting.
    type ScoredOutfit = { outfit: OutfitSet; score: number };
    const scoredPool: ScoredOutfit[] = [];

    for (const core of cores) {
      if (scoredPool.length >= MAX_PER_SCENARIO) break;

      const coreIds = new Set(core.coreItems.map(i => i.id));
      const harmShoes = shoesAll.filter(
        s => !coreIds.has(s.id) && colorsHarmonize(core.baseColor, s.colorFamily),
      );
      const otherShoes = shoesAll.filter(
        s => !coreIds.has(s.id) && !harmShoes.includes(s),
      );

      // Shoes are now part of the complete outfit core — outfits without shoes are not shown.
      const shoeOptions: WardrobeItem[] =
        harmShoes.length > 0
          ? harmShoes.slice(0, 3)
          : otherShoes.slice(0, 2);

      // No shoes in the wardrobe → skip this core entirely
      if (shoeOptions.length === 0) continue;

      for (const shoe of shoeOptions) {
        if (scoredPool.length >= MAX_PER_SCENARIO) break;

        const outfit: OutfitComponent[] = core.coreItems.map(toComponent);
        const usedIds = new Set(coreIds);

        outfit.push(toComponent(shoe)); usedIds.add(shoe.id);

        // Best harmonious bag
        const bag =
          bagsAll.find(b => !usedIds.has(b.id) && colorsHarmonize(core.baseColor, b.colorFamily)) ??
          bagsAll.find(b => !usedIds.has(b.id));
        if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }

        // Highest-scoring jewelry
        const jewel = jewelAll.find(j => !usedIds.has(j.id));
        if (jewel) { outfit.push(toComponent(jewel)); }

        const fp = fingerprint(outfit);
        if (!fp || seen.has(fp)) continue;
        seen.add(fp);

        // ── Compute confidence score ─────────────────────────────────────────
        // bag and jewel are already WardrobeItem references from find()
        const allItems = [
          ...core.coreItems,
          shoe ?? null,
          bag ?? null,
          jewel ?? null,
        ].filter(Boolean) as WardrobeItem[];

        const itemScore = allItems.reduce(
          (sum, item) => sum + scoreItemForProfile(item, scenario, profile),
          0,
        );
        const comboScore = scoreOutfitCombo(outfit);
        const totalScore = itemScore + comboScore;

        scoredPool.push({
          score: totalScore,
          outfit: {
            id: `pool-${scenario}-${scoredPool.length}`,
            scenario,
            components: outfit,
          },
        });
      }
    }

    // ── Sort by confidence score descending ───────────────────────────────────
    scoredPool.sort((a, b) => b.score - a.score);
    result[scenario] = scoredPool.map(s => s.outfit);
  }

  return result;
}

// ─── Daily rotation ───────────────────────────────────────────────────────────

/**
 * Given the full confidence-ranked pool and rotation state, returns today's
 * outfit selection.
 *
 * - Same day      → returns the same stable outfits
 * - New day       → advances each scenario cursor by OUTFITS_PER_SCENARIO_PER_DAY
 * - Freshness     → outfits matching recentWornFingerprints are moved to the
 *                   back so the user always sees a fresh look first
 * - Shuffle       → tiered shuffle preserves quality bands while adding variety
 */
export function applyDailyRotation(
  pool: Record<OccasionTag, OutfitSet[]>,
  state: RotationState,
  today: string,
  recentWornFingerprints?: Set<string>,
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

    // Apply freshness: push recently-worn outfits to the back.
    // The rest (already confidence-sorted) remain in their ranked order.
    let orderedPool = scenarioPool;
    if (recentWornFingerprints && recentWornFingerprints.size > 0) {
      const fresh = scenarioPool.filter(o => {
        const fp = fingerprint(o.components);
        return !recentWornFingerprints.has(fp);
      });
      const stale = scenarioPool.filter(o => {
        const fp = fingerprint(o.components);
        return recentWornFingerprints.has(fp);
      });
      orderedPool = [...fresh, ...stale];
    }

    // Tiered shuffle: preserves quality bands, each scenario gets its own seed
    const shuffled = tieredShuffle(orderedPool, state.shuffleSeed + si * 7919);

    const startCursor = isNewDay
      ? (state.nextCursors[scenario] ?? 0)
      : (state.todayCursors[scenario] ?? 0);

    todayCursors[scenario] = startCursor;

    const count = Math.min(n, shuffled.length);
    for (let i = 0; i < count; i++) {
      const idx = (startCursor + i) % shuffled.length;
      outfits.push({
        ...shuffled[idx],
        id: `daily-${scenario}-${i}`,
      });
    }

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function todayString(): string {
  return new Date().toISOString().split('T')[0];
}
