/**
 * Daily Rotation Engine — v2
 *
 * Adds mood-of-day and reaction feedback to the confidence-ranked pool.
 */

import {
  WardrobeItem, OutfitSet, OutfitComponent, OccasionTag, UserProfile,
  MoodGoal, OutfitReaction,
} from './types';
import {
  colorsHarmonize, passesConstraints, toComponent,
  scoreItemForProfile, scoreOutfitCombo, adjustScoreForReactions,
} from './outfitScoring';
import { generateRationale } from './rationale';

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

function fingerprint(components: OutfitComponent[]): string {
  return components
    .map(c => c.matchedItemId)
    .filter(Boolean)
    .sort()
    .join('|');
}

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

export function computePoolHash(
  items: WardrobeItem[],
  profile: UserProfile,
  mood?: MoodGoal | null,
): string {
  const itemSig = items
    .map(i => `${i.id}:${i.category}:${i.subType}:${i.colorFamily}:${i.formalityLevel}:${i.pattern ?? ''}:${i.fabric ?? ''}:${i.fit ?? ''}:${i.metalTone ?? ''}`)
    .sort()
    .join(',');
  const profileSig = [
    profile.styleGoalPrimary ?? '',
    profile.styleGoalSecondary ?? '',
    profile.bodyType ?? '',
    profile.skinTone ?? '',
    profile.undertone ?? '',
    profile.eyeColor ?? '',
    profile.hairColor ?? '',
    profile.heightBand ?? '',
    profile.contrastLevel ?? '',
    profile.metalPreference ?? '',
    profile.lifePhase ?? '',
    (profile.constraints.colorAversions ?? []).sort().join(','),
    String(profile.constraints.noSleeveless),
    String(profile.constraints.noShortSkirts),
    profile.constraints.maxHeelHeight,
  ].join(':');
  return `${itemSig}|${profileSig}|${mood ?? ''}`;
}

export function generateOutfitPool(
  items: WardrobeItem[],
  profile: UserProfile,
  mood?: MoodGoal | null,
  reactions: OutfitReaction[] = [],
  today: string = todayString(),
): Record<OccasionTag, OutfitSet[]> {
  const result = {} as Record<OccasionTag, OutfitSet[]>;
  const eligible = items.filter(i => passesConstraints(i, profile));

  for (const scenario of SCENARIOS) {
    const seen = new Set<string>();

    const byCategory: Record<string, WardrobeItem[]> = {};
    for (const item of eligible) {
      if (!byCategory[item.category]) byCategory[item.category] = [];
      byCategory[item.category].push(item);
    }
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].sort(
        (a, b) =>
          scoreItemForProfile(b, scenario, profile, mood) -
          scoreItemForProfile(a, scenario, profile, mood),
      );
    }

    const tops     = byCategory['top']      ?? [];
    const bottoms  = byCategory['bottom']   ?? [];
    const dresses  = byCategory['dress']    ?? [];
    const shoesAll = byCategory['shoes']    ?? [];
    const bagsAll  = byCategory['bag']      ?? [];
    const jewelAll = byCategory['jewelry']  ?? [];

    type Core = { coreItems: WardrobeItem[]; baseColor: string };
    const cores: Core[] = [];

    for (const dress of dresses.slice(0, 8)) {
      cores.push({ coreItems: [dress], baseColor: dress.colorFamily });
    }

    for (const top of tops.slice(0, 8)) {
      const harmoniousBottoms = bottoms.filter(b =>
        colorsHarmonize(top.colorFamily, b.colorFamily),
      );
      if (harmoniousBottoms.length > 0) {
        for (const bottom of harmoniousBottoms.slice(0, 3)) {
          cores.push({ coreItems: [top, bottom], baseColor: top.colorFamily });
        }
      } else if (bottoms.length > 0) {
        cores.push({ coreItems: [top, bottoms[0]], baseColor: top.colorFamily });
      }
    }

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

      const shoeOptions: WardrobeItem[] =
        harmShoes.length > 0 ? harmShoes.slice(0, 3) : otherShoes.slice(0, 2);

      if (shoeOptions.length === 0) continue;

      for (const shoe of shoeOptions) {
        if (scoredPool.length >= MAX_PER_SCENARIO) break;

        const outfit: OutfitComponent[] = core.coreItems.map(toComponent);
        const usedIds = new Set(coreIds);

        outfit.push(toComponent(shoe)); usedIds.add(shoe.id);

        const bag =
          bagsAll.find(b => !usedIds.has(b.id) && colorsHarmonize(core.baseColor, b.colorFamily)) ??
          bagsAll.find(b => !usedIds.has(b.id));
        if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }

        const jewel = jewelAll.find(j => !usedIds.has(j.id));
        if (jewel) { outfit.push(toComponent(jewel)); }

        const fp = fingerprint(outfit);
        if (!fp || seen.has(fp)) continue;
        seen.add(fp);

        const allItems = [
          ...core.coreItems,
          shoe ?? null,
          bag ?? null,
          jewel ?? null,
        ].filter(Boolean) as WardrobeItem[];

        const itemScore = allItems.reduce(
          (sum, item) => sum + scoreItemForProfile(item, scenario, profile, mood),
          0,
        );
        const combo = scoreOutfitCombo(outfit, items, profile);
        const rawTotal = itemScore + combo.total;
        const itemIds = allItems.map(it => it.id);
        const totalScore = adjustScoreForReactions(rawTotal, fp, reactions, today, itemIds);

        const rationale = generateRationale(outfit, items, profile, mood);

        scoredPool.push({
          score: totalScore,
          outfit: {
            id: `pool-${scenario}-${scoredPool.length}`,
            scenario,
            components: outfit,
            rationale,
            confidenceScore: Math.round(totalScore),
          },
        });
      }
    }

    scoredPool.sort((a, b) => b.score - a.score);
    result[scenario] = scoredPool.map(s => s.outfit);
  }

  return result;
}

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

export function todayString(): string {
  return new Date().toISOString().split('T')[0];
}
