/**
 * Daily Rotation Engine — v2
 *
 * Adds mood-of-day and reaction feedback to the confidence-ranked pool.
 */

import {
  WardrobeItem, OutfitSet, OutfitComponent, OccasionTag, UserProfile,
  MoodGoal, OutfitReaction, WearEntry,
} from './types';
import {
  colorsHarmonize, passesConstraints, toComponent,
  scoreItemForProfile, scoreOutfitCombo, adjustScoreForReactions,
  wornHistoryBoost, effectiveFormality, getScenarioFormality,
  itemMatchesMood, itemContradictsMood,
  currentSeason, itemFitsSeason,
} from './outfitScoring';
import { generateRationale } from './rationale';

export const SCENARIOS: OccasionTag[] = [
  'work', 'casual', 'date-casual', 'date-dressy', 'event', 'interview', 'wedding', 'travel',
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
    .map(i => `${i.id}:${i.category}:${i.subType}:${i.colorFamily}:${effectiveFormality(i)}:${i.pattern ?? ''}:${i.fabric ?? ''}:${i.fit ?? ''}:${i.metalTone ?? ''}`)
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
    profile.industry ?? '',
    (profile.constraints.colorAversions ?? []).sort().join(','),
    String(profile.constraints.noSleeveless),
    String(profile.constraints.noShortSkirts),
    profile.constraints.maxHeelHeight,
  ].join(':');
  return `${itemSig}|${profileSig}|${mood ?? ''}|${currentSeason()}`;
}

export function generateOutfitPool(
  items: WardrobeItem[],
  profile: UserProfile,
  mood?: MoodGoal | null,
  reactions: OutfitReaction[] = [],
  today: string = todayString(),
  wearHistory: WearEntry[] = [],
): Record<OccasionTag, OutfitSet[]> {
  const result = {} as Record<OccasionTag, OutfitSet[]>;
  // Hard seasonal gate: respect user-supplied season tags. Untagged items and
  // items tagged 'all-season' always pass. A top stylist would never serve
  // tweed in July or linen shorts in December — once the user has told us a
  // piece is season-specific, we honour that strictly.
  const season = currentSeason();
  const eligible = items
    .filter(i => passesConstraints(i, profile))
    .filter(i => itemFitsSeason(i, season));

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

    // Hard scenario gate: drop any core whose average formality falls outside
    // the scenario's expected band. Strict — a top-tier stylist would never
    // suggest a casual piece for a wedding "because it's close enough".
    const [scenMinF, scenMaxF] = getScenarioFormality(scenario, profile);
    const coreFitsScenario = (coreItems: WardrobeItem[]): boolean => {
      const fs = coreItems.map(effectiveFormality);
      const avg = fs.reduce((a, b) => a + b, 0) / fs.length;
      return avg >= scenMinF && avg <= scenMaxF;
    };

    // Hard mood gate: when a mood is set, the core must (a) contain at least
    // one piece that naturally embodies the mood and (b) contain no piece
    // that visibly contradicts it. Mirrors the scenario gate so an empty
    // result is an honest "your wardrobe doesn't feel that way today" signal.
    const coreFitsMood = (coreItems: WardrobeItem[]): boolean => {
      if (!mood) return true;
      if (coreItems.some(i => itemContradictsMood(i, mood))) return false;
      return coreItems.some(i => itemMatchesMood(i, mood));
    };

    type Core = { coreItems: WardrobeItem[]; baseColor: string };
    const cores: Core[] = [];

    for (const dress of dresses.slice(0, 8)) {
      if (!coreFitsScenario([dress])) continue;
      if (!coreFitsMood([dress])) continue;
      cores.push({ coreItems: [dress], baseColor: dress.colorFamily });
    }

    for (const top of tops.slice(0, 8)) {
      const harmoniousBottoms = bottoms.filter(b =>
        colorsHarmonize(top.colorFamily, b.colorFamily),
      );
      if (harmoniousBottoms.length > 0) {
        for (const bottom of harmoniousBottoms.slice(0, 3)) {
          if (!coreFitsScenario([top, bottom])) continue;
          if (!coreFitsMood([top, bottom])) continue;
          cores.push({ coreItems: [top, bottom], baseColor: top.colorFamily });
        }
      } else if (bottoms.length > 0) {
        if (!coreFitsScenario([top, bottoms[0]])) continue;
        if (!coreFitsMood([top, bottoms[0]])) continue;
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
        const combo = scoreOutfitCombo(outfit, items, profile, season);

        // ── Hard gates — violations we never want to surface ─────────────
        // (soft penalties in scoreOutfitCombo surface near the bottom; these
        //  are the cases the scoring team explicitly wants eliminated.)
        const formalities = allItems.map(effectiveFormality);
        const formalitySpread = Math.max(...formalities) - Math.min(...formalities);
        if (formalitySpread > 3) continue;

        const bold = allItems.filter(i =>
          i.pattern && i.pattern !== 'solid' &&
          (i.patternScale === 'large' || i.pattern === 'animal' || i.pattern === 'floral')
        );
        if (bold.length >= 2) continue;

        const topI = allItems.find(i => i.category === 'top');
        const bottomI = allItems.find(i => i.category === 'bottom');
        const isVolumeFit = (f?: string) => f === 'loose' || f === 'oversized';
        if (topI?.fit && bottomI?.fit && isVolumeFit(topI.fit) && isVolumeFit(bottomI.fit)) continue;

        const hasCrop = allItems.some(i => i.subType === 'crop-top');
        const hasShort = allItems.some(i =>
          i.subType === 'mini-skirt' || i.subType === 'shorts' || i.subType === 'mini-dress');
        if (hasCrop && hasShort) continue;

        if (profile.metalPreference && profile.metalPreference !== 'mixed') {
          const metals = new Set(
            allItems.map(i => i.metalTone).filter((m): m is NonNullable<typeof m> => !!m && m !== 'none')
          );
          if (metals.size >= 2) continue;
        }

        const rawTotal = itemScore + combo.total;
        const itemIds = allItems.map(it => it.id);
        const reactionAdjusted = adjustScoreForReactions(rawTotal, fp, reactions, today, itemIds);
        const totalScore = reactionAdjusted + wornHistoryBoost(fp, wearHistory, today);

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
