/**
 * Daily Rotation Engine — v2
 *
 * Adds mood-of-day and reaction feedback to the confidence-ranked pool.
 */

import {
  WardrobeItem, OutfitSet, OutfitComponent, OccasionTag, UserProfile,
  MoodGoal, OutfitReaction, WearEntry, WeatherSnapshot,
} from './types';
import {
  outerwearRule, outerwearWeatherScore, weatherSignature, isRainy, isRainFriendly,
  effectiveWarmth, neededWarmth,
} from './weatherPure';
import {
  colorsHarmonize, passesConstraints, toComponent,
  scoreItemForProfile, scoreOutfitCombo, adjustScoreForReactions,
  wornHistoryBoost, effectiveFormality, getScenarioFormality,
  itemMatchesMood, itemContradictsMood,
  currentSeason, itemFitsSeason,
  pickHeroCandidates, recedeScore,
  SCENARIO_HERO_SUBTYPES, ACTIVE_HERO_COMPANION_BAGS,
} from './outfitScoring';
import { generateRationale } from './rationale';
import {
  AffinityState, EMPTY_AFFINITY,
  itemAffinityMultiplier, comboPairAffinityMultiplier,
} from './affinity';

export const SCENARIOS: OccasionTag[] = [
  // Free tier scenarios
  'work', 'casual', 'date-casual', 'date-dressy', 'event', 'brunch', 'active',
  // Premium scenarios
  'interview', 'wedding', 'travel', 'resort', 'night-out',
];

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

export function tieredShuffle(pool: OutfitSet[], seed: number): OutfitSet[] {
  // Stable sort by score descending, using the outfit's original pool index as
  // the tie-breaker so equally-scored outfits always preserve the ordering that
  // upstream passes (freshness, hero-diversity, completeness-bias) deliberately
  // set up.  Without this a JS engine's unstable native sort could arbitrarily
  // reorder tied entries and silently undo those signals.
  const indexed = pool.map((outfit, idx) => ({ outfit, idx }));
  indexed.sort((a, b) => {
    const scoreDiff = (b.outfit.confidenceScore ?? 0) - (a.outfit.confidenceScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return a.idx - b.idx;
  });
  const sorted = indexed.map(({ outfit }) => outfit);
  if (sorted.length <= 3) return seededShuffle(sorted, seed);
  const third = Math.ceil(sorted.length / 3);
  const top = sorted.slice(0, third);
  const mid = sorted.slice(third, third * 2);
  const low = sorted.slice(third * 2);
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

/**
 * Pure hero-diversity ordering step: outfits whose hero piece appeared in
 * yesterday's daily batch for this scenario are pushed to the end of the pool
 * so the user sees a fresh focal piece first.  Exported for direct unit
 * testing so the guarantee can be verified independently of tieredShuffle or
 * quota — a pool-size or threshold change cannot silently break the invariant.
 */
export function applyHeroDiversityOrder(
  pool: OutfitSet[],
  prevDayHeroIds: Partial<Record<OccasionTag, string[]>>,
  scenario: OccasionTag,
): OutfitSet[] {
  const prevHeroes = new Set(prevDayHeroIds[scenario] ?? []);
  if (prevHeroes.size === 0) return pool;
  const freshHeroes = pool.filter(o => !o.heroId || !prevHeroes.has(o.heroId));
  const repeatedHeroes = pool.filter(o => !!o.heroId && prevHeroes.has(o.heroId));
  return [...freshHeroes, ...repeatedHeroes];
}

/**
 * Pure freshness-ordering step: moves recently-worn outfits to the end of the
 * pool so fresh alternatives surface first.  Exported for direct unit testing
 * so the guarantee can be verified independently of tieredShuffle or quota.
 */
export function applyFreshnessOrder(
  pool: OutfitSet[],
  recentWornFingerprints: Set<string>,
): OutfitSet[] {
  if (!recentWornFingerprints || recentWornFingerprints.size === 0) return pool;
  const fresh = pool.filter(o => !recentWornFingerprints.has(fingerprint(o.components)));
  const stale = pool.filter(o => recentWornFingerprints.has(fingerprint(o.components)));
  return [...fresh, ...stale];
}

/**
 * Pure completeness-bias step: awards +1 confidenceScore to outfits that carry
 * a full accessory stack (shoes + bag + jewelry) and re-sorts by score descending
 * so the most-styled outfits rise to the top of the pool.  Exported for direct
 * unit testing independently of tieredShuffle or quota behaviour.
 */
export function applyCompletenessBias(pool: OutfitSet[]): OutfitSet[] {
  const biased = pool.map((o, idx) => {
    const cats = new Set(o.components.map(c => c.category));
    const complete = cats.has('shoes') && cats.has('bag') && cats.has('jewelry');
    const bumped = complete ? { ...o, confidenceScore: (o.confidenceScore ?? 0) + 1 } : o;
    return { outfit: bumped, originalIndex: idx };
  });
  biased.sort((a, b) => {
    const scoreDiff = (b.outfit.confidenceScore ?? 0) - (a.outfit.confidenceScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return a.originalIndex - b.originalIndex;
  });
  return biased.map(({ outfit }) => outfit);
}

export interface RotationState {
  poolHash: string;
  shuffleSeed: number;
  todayCursors: Partial<Record<OccasionTag, number>>;
  nextCursors: Partial<Record<OccasionTag, number>>;
  lastDate: string;
  cycleCount: number;
  /** Hero IDs served the previous day per scenario — used for diversity enforcement. */
  prevDayHeroIds?: Partial<Record<OccasionTag, string[]>>;
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
  weather?: WeatherSnapshot | null,
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
  const weatherEnabled = profile.weatherEnabled !== false;
  const weatherSig = weatherEnabled ? weatherSignature(weather ?? null) : 'off';
  return `${itemSig}|${profileSig}|${mood ?? ''}|${currentSeason()}|w:${weatherSig}`;
}

export function generateOutfitPool(
  items: WardrobeItem[],
  profile: UserProfile,
  mood?: MoodGoal | null,
  reactions: OutfitReaction[] = [],
  today: string = todayString(),
  wearHistory: WearEntry[] = [],
  affinity: AffinityState = EMPTY_AFFINITY,
  weather: WeatherSnapshot | null = null,
): Record<OccasionTag, OutfitSet[]> {
  const weatherActive = profile.weatherEnabled !== false && !!weather;
  const wxRule = weatherActive ? outerwearRule(weather) : 'optional';
  const wxRainy = weatherActive && isRainy(weather);
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
    const eligibleIndex = new Map<string, number>(eligible.map((item, idx) => [item.id, idx]));
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].sort((a, b) => {
        const diff = scoreItemForProfile(b, scenario, profile, mood) -
                     scoreItemForProfile(a, scenario, profile, mood);
        if (diff !== 0) return diff;
        // Stable tie-breaker: preserve original eligible-array order so output
        // is deterministic across JS runtimes and repeated calls.
        return (eligibleIndex.get(a.id) ?? 0) - (eligibleIndex.get(b.id) ?? 0);
      });
    }

    const tops      = byCategory['top']       ?? [];
    const bottoms   = byCategory['bottom']    ?? [];
    const dresses   = byCategory['dress']     ?? [];
    const shoesAll  = byCategory['shoes']     ?? [];
    const bagsAll   = byCategory['bag']       ?? [];
    const jewelAll  = byCategory['jewelry']   ?? [];
    const outerAll  = byCategory['outerwear'] ?? [];

    // Weather-aware outerwear picker (used when wxRule === 'required'). Picks
    // the best harmonising coat by warmth + rain-fitness + colour harmony.
    const pickWeatherCoat = (
      baseColor: string,
      hero: WardrobeItem,
      excludeIds: Set<string>,
    ): WardrobeItem | null => {
      if (!weather) return null;
      const need = neededWarmth(weather.lowC);
      const ORDER = { cold: 0, cool: 1, mild: 2, warm: 3, hot: 4 } as const;
      // Hard filter: only allow coats whose effective warmth is within ±1
      // band of what the day actually needs. A summer blazer must not be
      // injected on a 2°C morning just because nothing better harmonises.
      const acceptable = outerAll.filter(o => {
        if (excludeIds.has(o.id)) return false;
        const diff = Math.abs(ORDER[effectiveWarmth(o)] - ORDER[need]);
        if (diff > 1) return false;
        if (wxRainy && !isRainFriendly(o)) return false;
        return true;
      });
      if (acceptable.length === 0) return null;
      const scored = acceptable.map(o => {
        let s = outerwearWeatherScore(o, weather);
        if (colorsHarmonize(baseColor, o.colorFamily)) s += 2;
        s += 0.3 * recedeScore(o, hero);
        return { item: o, s };
      });
      scored.sort((a, b) => b.s - a.s);
      return scored[0]?.item ?? null;
    };

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

    let heroes = pickHeroCandidates(eligible, scenario, profile, 6);
    // Weather gate for outerwear heroes:
    //  • suppressed (hot day) → no outerwear heroes
    //  • rainy → no rain-averse outerwear heroes (don't lead with suede)
    //  • required (cold day) → hero coat's warmth band must be within ±1 of
    //    what the day actually needs, so we never spotlight a summer blazer
    //    on a freezing morning when the user owns a real coat.
    if (weatherActive && weather) {
      const need = neededWarmth(weather.lowC);
      const ORDER = { cold: 0, cool: 1, mild: 2, warm: 3, hot: 4 } as const;
      heroes = heroes.filter(h => {
        if (h.category !== 'outerwear') return true;
        if (wxRule === 'suppressed') return false;
        if (wxRainy && !isRainFriendly(h)) return false;
        if (wxRule === 'required') {
          const diff = Math.abs(ORDER[effectiveWarmth(h)] - ORDER[need]);
          if (diff > 1) return false;
        }
        return true;
      });
    }

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

    type ScoredOutfit = { outfit: OutfitSet; score: number; fp: string };
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

        // Outerwear — added when the hero IS outerwear, OR when the day's
        // forecast demands a coat (weather rule = 'required'). Suppressed on
        // genuinely warm days so we never layer in heat. When the day
        // requires outerwear and we cannot satisfy it (no acceptable coat
        // available), drop the outfit candidate rather than serve a cold-day
        // look without a coat.
        let coat: WardrobeItem | null = null;
        if (wxRule !== 'suppressed') {
          if (hero.category === 'outerwear' && !usedIds.has(hero.id)) {
            coat = hero;
          } else if (wxRule === 'required') {
            coat = pickWeatherCoat(core.baseColor, hero, usedIds);
          }
          if (coat) { outfit.push(toComponent(coat)); usedIds.add(coat.id); }
        }
        if (wxRule === 'required' && !coat) continue;

        // Bag — recede-aware. No bag-as-hero today (out of scope), so bag
        // always plays a supporting role.
        const allBags = bagsAll.filter(b => !usedIds.has(b.id));
        // When the outfit is anchored by a signature active piece
        // (windbreaker / training-shoes / sports-hoodie), prefer gym-bag or
        // backpack so the complete kit reads sport-appropriate. Falls back to
        // the full bag supply when no companion bag is available.
        const activeBagCompanions =
          scenario === 'active' && SCENARIO_HERO_SUBTYPES.active?.has(hero.subType)
            ? allBags.filter(b => ACTIVE_HERO_COMPANION_BAGS.has(b.subType))
            : [];
        const bagPool = activeBagCompanions.length > 0 ? activeBagCompanions : allBags;
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
          (sum, item) =>
            sum +
            scoreItemForProfile(item, scenario, profile, mood) *
              itemAffinityMultiplier(affinity, item.id),
          0,
        );
        const combo = scoreOutfitCombo(outfit, items, profile, season);
        // Pair-affinity nudge — multiplies the combo's geometric "fit" score
        // by how well these items have played together for the user. Cold-
        // start safe: returns 1.0 until ≥5 signals have been logged.
        const pairMult = comboPairAffinityMultiplier(affinity, allItems.map(i => i.id));
        combo.total = combo.total * pairMult;

        // ── Hard gates — violations we never want to surface ─────────────
        // (soft penalties in scoreOutfitCombo surface near the bottom; these
        //  are the cases the scoring team explicitly wants eliminated.)
        const formalities = allItems.map(effectiveFormality);
        const formalitySpread = Math.max(...formalities) - Math.min(...formalities);
        if (formalitySpread > 3) continue;

        // Scale-contrast pattern pairs (one large + one small, different types)
        // are valid and rewarded by the scorer — the old "≥2 bold" gate was too
        // aggressive. We only hard-drop when 3 or more items independently qualify
        // as large-scale patterned (animal/floral/large-scale), which is always
        // too visually noisy regardless of any smaller-scale pieces in the outfit.
        const largePatterned = allItems.filter(i =>
          i.pattern && i.pattern !== 'solid' &&
          (i.patternScale === 'large' || i.pattern === 'animal' || i.pattern === 'floral')
        );
        if (largePatterned.length >= 3) continue;

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

        const rationale = generateRationale(outfit, items, profile, mood, hero.id, combo.undertoneHarmony);

        scoredPool.push({
          score: totalScore,
          fp,
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

    scoredPool.sort((a, b) => (b.score - a.score) || a.fp.localeCompare(b.fp));

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
      return (bx - ax) || a.localeCompare(b);
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
  isPremium?: boolean,
  isGuest?: boolean,
): { outfits: OutfitSet[]; newState: RotationState } {
  const isNewDay = today !== state.lastDate;
  // Guest: 1 outfit/scenario/day. Free: 2. Premium: 4.
  const n = isPremium ? 4 : isGuest ? 1 : 2;

  // Day-of-week context: 0 = Sunday, 6 = Saturday.
  const dayOfWeek = new Date(today + 'T12:00:00').getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const todayCursors: Partial<Record<OccasionTag, number>> = {};
  const nextCursors: Partial<Record<OccasionTag, number>> = {};
  const todayHeroIds: Partial<Record<OccasionTag, string[]>> = {};
  const outfitsPerScenario: Partial<Record<OccasionTag, OutfitSet[]>> = {};
  let cycleCount = state.cycleCount;

  const prevDayHeroIds = state.prevDayHeroIds ?? {};

  SCENARIOS.forEach((scenario, si) => {
    const scenarioPool = pool[scenario] ?? [];
    if (scenarioPool.length === 0) return;

    let orderedPool = scenarioPool;

    // ── Worn-fingerprint freshness ordering ─────────────────────────────────
    if (recentWornFingerprints && recentWornFingerprints.size > 0) {
      orderedPool = applyFreshnessOrder(scenarioPool, recentWornFingerprints);
    }

    // ── Hero diversity: deprioritise yesterday's heroes ─────────────────────
    // Outfits whose hero featured in yesterday's daily batch for this scenario
    // are pushed to the lower segment so the user sees a fresh focal piece.
    orderedPool = applyHeroDiversityOrder(orderedPool, prevDayHeroIds, scenario);

    // ── Completeness bias: full accessory stack earns +1 confidence ─────────
    // An outfit with shoes + bag + jewelry feels more styled than one that is
    // missing any of those layers. We nudge it up before the tiered shuffle so
    // it reliably lands in the top tier and surfaces first.
    const biased = applyCompletenessBias(orderedPool);

    const shuffled = tieredShuffle(biased, state.shuffleSeed + si * 7919);

    let startCursor = isNewDay
      ? (state.nextCursors[scenario] ?? 0)
      : (state.todayCursors[scenario] ?? 0);

    // ── Day-of-week cursor nudge ─────────────────────────────────────────────
    // On weekends the work scenario is less relevant — advance its cursor by
    // one extra step so weekend users see a fresher look when they do check it,
    // rather than Monday's leftover top-of-pool outfit.
    if (isNewDay && isWeekend && scenario === 'work' && shuffled.length > 1) {
      startCursor = (startCursor + 1) % shuffled.length;
    }

    todayCursors[scenario] = startCursor;

    const count = Math.min(n, shuffled.length);
    const slice: OutfitSet[] = [];
    for (let i = 0; i < count; i++) {
      const idx = (startCursor + i) % shuffled.length;
      slice.push({ ...shuffled[idx], id: `daily-${scenario}-${i}` });
    }

    // Record hero IDs for tomorrow's diversity pass.
    todayHeroIds[scenario] = slice.map(o => o.heroId).filter((h): h is string => !!h);
    outfitsPerScenario[scenario] = slice;

    const next = (startCursor + count) % shuffled.length;
    if (next < startCursor) cycleCount = cycleCount + 1;
    nextCursors[scenario] = next;
  });

  // ── Cross-scenario fingerprint dedup ────────────────────────────────────────
  // The same exact outfit (same item IDs) should not appear twice on one day
  // even if it scored highly for two different scenarios. First occurrence wins.
  const seenToday = new Set<string>();
  const outfits: OutfitSet[] = [];
  for (const scenario of SCENARIOS) {
    for (const outfit of outfitsPerScenario[scenario] ?? []) {
      const fp = fingerprint(outfit.components);
      if (fp && !seenToday.has(fp)) {
        seenToday.add(fp);
        outfits.push(outfit);
      }
    }
  }

  const newState: RotationState = {
    poolHash: state.poolHash,
    shuffleSeed: state.shuffleSeed,
    todayCursors,
    nextCursors,
    lastDate: today,
    cycleCount,
    prevDayHeroIds: isNewDay ? todayHeroIds : (state.prevDayHeroIds ?? {}),
  };

  return { outfits, newState };
}

export function todayString(): string {
  return new Date().toISOString().split('T')[0];
}
