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
  pickHeroCandidates, recedeScore,
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

    // ── Hero-piece seeding ───────────────────────────────────────────────
    // A real stylist starts every outfit by choosing the focal piece, then
    // builds quietly around it. We pick the most distinctive items in the
    // wardrobe (statement texture, vivid colour, signature silhouette,
    // style-goal alignment) and seed each candidate core with one of them.
    // Bottoms / outerwear / shoes can act as heroes too, not just dresses.
    type Core = { coreItems: WardrobeItem[]; baseColor: string; hero: WardrobeItem };
    const cores: Core[] = [];

    const heroes = pickHeroCandidates(eligible, scenario, profile, 6);

    // Helper: best supporting partner for a hero, by recede + harmony + score.
    const pickSupport = (
      hero: WardrobeItem,
      pool: WardrobeItem[],
      excludeIds: Set<string>,
    ): WardrobeItem | null => {
      const harm = pool.filter(p =>
        !excludeIds.has(p.id) && colorsHarmonize(hero.colorFamily, p.colorFamily),
      );
      const candidates = harm.length > 0 ? harm : pool.filter(p => !excludeIds.has(p.id));
      if (candidates.length === 0) return null;
      return [...candidates].sort((a, b) => {
        const ra = recedeScore(a, hero) + 0.15 * scoreItemForProfile(a, scenario, profile, mood);
        const rb = recedeScore(b, hero) + 0.15 * scoreItemForProfile(b, scenario, profile, mood);
        return rb - ra;
      })[0] ?? null;
    };

    for (const hero of heroes) {
      const heroIds = new Set([hero.id]);

      if (hero.category === 'dress') {
        if (!coreFitsScenario([hero])) continue;
        if (!coreFitsMood([hero])) continue;
        cores.push({ coreItems: [hero], baseColor: hero.colorFamily, hero });

      } else if (hero.category === 'top') {
        // Try the top 3 receding bottoms so the hero gets a few shots.
        const harmoniousBottoms = bottoms.filter(b => colorsHarmonize(hero.colorFamily, b.colorFamily));
        const bottomPool = (harmoniousBottoms.length > 0 ? harmoniousBottoms : bottoms.slice(0, 4));
        const ranked = [...bottomPool]
          .sort((a, b) => recedeScore(b, hero) - recedeScore(a, hero))
          .slice(0, 3);
        for (const bottom of ranked) {
          if (!coreFitsScenario([hero, bottom])) continue;
          if (!coreFitsMood([hero, bottom])) continue;
          cores.push({ coreItems: [hero, bottom], baseColor: hero.colorFamily, hero });
        }

      } else if (hero.category === 'bottom') {
        const harmoniousTops = tops.filter(t => colorsHarmonize(hero.colorFamily, t.colorFamily));
        const topPool = harmoniousTops.length > 0 ? harmoniousTops : tops.slice(0, 4);
        const ranked = [...topPool]
          .sort((a, b) => recedeScore(b, hero) - recedeScore(a, hero))
          .slice(0, 3);
        for (const top of ranked) {
          if (!coreFitsScenario([top, hero])) continue;
          if (!coreFitsMood([top, hero])) continue;
          cores.push({ coreItems: [top, hero], baseColor: top.colorFamily, hero });
        }

      } else if (hero.category === 'outerwear' || hero.category === 'shoes') {
        // Outer / shoe heroes still need a core (top+bottom or dress) to sit
        // over. The hero itself joins as an accessory in the support pass.
        // Prefer a dress base if one harmonises and recedes well; else build
        // a top+bottom pair that quietly supports the hero.
        const dressOpt = [...dresses]
          .filter(d => colorsHarmonize(hero.colorFamily, d.colorFamily))
          .sort((a, b) => recedeScore(b, hero) - recedeScore(a, hero))[0];
        if (dressOpt && coreFitsScenario([dressOpt]) && coreFitsMood([dressOpt])) {
          cores.push({ coreItems: [dressOpt], baseColor: dressOpt.colorFamily, hero });
        }
        const topOpt = pickSupport(hero, tops, heroIds);
        if (topOpt) {
          const bottomOpt = pickSupport(hero, bottoms, new Set([...heroIds, topOpt.id]));
          if (bottomOpt && coreFitsScenario([topOpt, bottomOpt]) && coreFitsMood([topOpt, bottomOpt])) {
            cores.push({ coreItems: [topOpt, bottomOpt], baseColor: topOpt.colorFamily, hero });
          }
        }
      }
    }

    // ── Fallback cores when no heroes qualify ────────────────────────────
    // Ensures wardrobes light on statement pieces still get a populated pool.
    if (cores.length === 0) {
      for (const dress of dresses.slice(0, 6)) {
        if (!coreFitsScenario([dress])) continue;
        if (!coreFitsMood([dress])) continue;
        cores.push({ coreItems: [dress], baseColor: dress.colorFamily, hero: dress });
      }
      for (const top of tops.slice(0, 6)) {
        const harmoniousBottoms = bottoms.filter(b => colorsHarmonize(top.colorFamily, b.colorFamily));
        const bottomList = harmoniousBottoms.length > 0 ? harmoniousBottoms.slice(0, 2) : bottoms.slice(0, 1);
        for (const bottom of bottomList) {
          if (!coreFitsScenario([top, bottom])) continue;
          if (!coreFitsMood([top, bottom])) continue;
          cores.push({ coreItems: [top, bottom], baseColor: top.colorFamily, hero: top });
        }
      }
    }

    type ScoredOutfit = { outfit: OutfitSet; score: number };
    const scoredPool: ScoredOutfit[] = [];

    for (const core of cores) {
      if (scoredPool.length >= MAX_PER_SCENARIO) break;

      const coreIds = new Set(core.coreItems.map(i => i.id));
      const hero = core.hero;

      // Shoe selection — if the hero IS a shoe, it's the only option. Else
      // sort by recede-around-hero so quieter shoes win when the look already
      // has a focal point.
      let shoeOptions: WardrobeItem[];
      if (hero.category === 'shoes' && !coreIds.has(hero.id)) {
        shoeOptions = [hero];
      } else if (hero.category === 'shoes' && coreIds.has(hero.id)) {
        shoeOptions = [];   // already in core (shouldn't happen, defensive)
      } else {
        const harmShoes = shoesAll.filter(
          s => !coreIds.has(s.id) && colorsHarmonize(core.baseColor, s.colorFamily),
        );
        const otherShoes = shoesAll.filter(
          s => !coreIds.has(s.id) && !harmShoes.includes(s),
        );
        const pool = harmShoes.length > 0 ? harmShoes : otherShoes;
        shoeOptions = [...pool]
          .sort((a, b) => recedeScore(b, hero) - recedeScore(a, hero))
          .slice(0, 3);
      }

      if (shoeOptions.length === 0) continue;

      for (const shoe of shoeOptions) {
        if (scoredPool.length >= MAX_PER_SCENARIO) break;

        const outfit: OutfitComponent[] = core.coreItems.map(toComponent);
        const usedIds = new Set(coreIds);

        outfit.push(toComponent(shoe)); usedIds.add(shoe.id);

        // Outerwear — only added when the hero IS outerwear (otherwise we
        // keep the existing "no coat" default to avoid over-stacking layers).
        let coat: WardrobeItem | null = null;
        if (hero.category === 'outerwear' && !usedIds.has(hero.id)) {
          coat = hero;
          outfit.push(toComponent(coat)); usedIds.add(coat.id);
        }

        // Bag — recede-aware. No bag-as-hero today (out of scope), so bag
        // always plays a supporting role.
        const bagPool = bagsAll.filter(b => !usedIds.has(b.id));
        const bagHarm = bagPool.filter(b => colorsHarmonize(core.baseColor, b.colorFamily));
        const bagSorted = (bagHarm.length > 0 ? bagHarm : bagPool)
          .sort((a, b) => recedeScore(b, hero) - recedeScore(a, hero));
        const bag = bagSorted[0];
        if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }

        const jewel = jewelAll.find(j => !usedIds.has(j.id));
        if (jewel) { outfit.push(toComponent(jewel)); }

        const fp = fingerprint(outfit);
        if (!fp || seen.has(fp)) continue;
        seen.add(fp);

        const allItems = [
          ...core.coreItems,
          shoe ?? null,
          coat ?? null,
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

        const rationale = generateRationale(outfit, items, profile, mood, hero.id);

        scoredPool.push({
          score: totalScore,
          outfit: {
            id: `pool-${scenario}-${scoredPool.length}`,
            scenario,
            components: outfit,
            rationale,
            confidenceScore: Math.round(totalScore),
            heroId: hero.id,
          },
        });
      }
    }

    scoredPool.sort((a, b) => b.score - a.score);

    // ── Hero diversification (round-robin) ───────────────────────────────
    // Group by heroId, then interleave one outfit per hero in turn so the
    // top of the pool surfaces multiple heroes instead of stacking the same
    // hero's variants. Within each hero group, original score order is kept,
    // so each hero still leads with its strongest combo.
    const byHero = new Map<string, OutfitSet[]>();
    for (const s of scoredPool) {
      const key = s.outfit.heroId ?? '';
      if (!byHero.has(key)) byHero.set(key, []);
      byHero.get(key)!.push(s.outfit);
    }
    // Order hero groups by their best score so the round-robin starts with
    // the strongest hero on every rebuild — keeps top-line quality intact.
    const heroOrder = Array.from(byHero.keys()).sort((a, b) => {
      const ax = byHero.get(a)![0]?.confidenceScore ?? 0;
      const bx = byHero.get(b)![0]?.confidenceScore ?? 0;
      return bx - ax;
    });
    const interleaved: OutfitSet[] = [];
    let drained = false;
    while (!drained) {
      drained = true;
      for (const key of heroOrder) {
        const group = byHero.get(key)!;
        if (group.length > 0) {
          interleaved.push(group.shift()!);
          drained = false;
        }
      }
    }
    result[scenario] = interleaved;
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
