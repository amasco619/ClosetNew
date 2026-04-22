/**
 * Outfit Confidence Scoring Engine — v2 (Sophisticated Stylist)
 *
 * Extends v1's 7 personal dimensions with:
 *  - Mood alignment (daily mood chip)
 *  - Proportion balance (fit / silhouette mix)
 *  - Formality cohesion across pieces
 *  - Pattern-mixing safety (≤1 bold pattern)
 *  - Hair × clothing colour harmony
 *  - Personal contrast × outfit contrast match
 *  - Metal tone × undertone / preference
 *  - Hard aversion filter (never recommend a colour the user hates)
 *  - Reaction memory (love boost / not-today decay)
 *
 * All new signals are OPTIONAL on UserProfile & WardrobeItem.  When missing,
 * the scorer falls back to v1 behaviour — existing installs keep working.
 */

import {
  WardrobeItem, OutfitComponent, OccasionTag, UserProfile,
  MoodGoal, OutfitReaction, WearEntry, Fabric, FabricWeight,
} from './types';
import {
  classifyPalette, scorePaletteType,
  isNeutralColor,
} from './colorTheory';
import {
  Hsl, centroidHsl,
  temperatureHarmony, valueSpread, saturationDominance,
} from './colorPerceptual';

/** Resolve a usable HSL for an item — prefer captured value, fall back to centroid. */
function itemHsl(item: WardrobeItem): Hsl {
  return item.dominantHsl ?? centroidHsl(item.colorFamily);
}

// Re-export for backward compatibility
export { colorsHarmonize } from './colorTheory';
export const NEUTRAL_COLORS = new Set([
  'black', 'white', 'grey', 'beige', 'cream', 'navy', 'camel', 'brown', 'olive',
]);
export function isNeutral(color: string): boolean {
  return isNeutralColor(color);
}

// ─── Scenario sub-type affinity ───────────────────────────────────────────────

export const SCENARIO_AFFINITY: Record<OccasionTag, string[]> = {
  casual:        ['t-shirt', 'long-sleeve', 'henley', 'sweater', 'jeans', 'chinos', 'shorts', 'leggings', 'sneakers', 'flats', 'crossbody', 'backpack', 'hoodie', 'cardigan', 'denim-jacket', 'polo-shirt', 'rugby-shirt', 'joggers'],
  work:          ['blouse', 'shirt', 'polo-shirt', 'sweater', 'trousers', 'chinos', 'midi-skirt', 'blazer', 'coat', 'heels', 'flats', 'loafers', 'tote', 'shoulder-bag', 'earrings', 'watch', 'turtleneck'],
  // Coffee / lunch / low-key first dates — keep it relaxed but considered.
  'date-casual': ['blouse', 'camisole', 't-shirt', 'long-sleeve', 'sweater', 'cardigan', 'jeans', 'chinos', 'wide-leg', 'midi-skirt', 'midi-dress', 'wrap-dress', 'sundress', 'flats', 'mules', 'sneakers', 'loafers', 'crossbody', 'mini-bag', 'earrings'],
  // Dinner / wine bar / something to dress for.
  'date-dressy': ['blouse', 'camisole', 'midi-dress', 'wrap-dress', 'mini-dress', 'maxi-dress', 'midi-skirt', 'heels', 'mules', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet', 'dress', 'blazer'],
  event:         ['cocktail-dress', 'midi-dress', 'maxi-dress', 'blouse', 'wide-leg', 'blazer', 'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet'],
  interview:     ['blouse', 'shirt', 'blazer', 'trousers', 'midi-skirt', 'midi-dress', 'coat', 'heels', 'flats', 'loafers', 'tote', 'shoulder-bag', 'earrings', 'watch', 'turtleneck'],
  wedding:       ['midi-dress', 'maxi-dress', 'cocktail-dress', 'wrap-dress', 'midi-skirt', 'blouse', 'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet'],
  travel:        ['t-shirt', 'long-sleeve', 'sweater', 'shirt', 'jeans', 'chinos', 'trousers', 'sneakers', 'flats', 'boots', 'crossbody', 'backpack', 'tote', 'blazer', 'cardigan', 'denim-jacket', 'wide-leg'],
};

export const STYLE_PREFERRED_COLORS: Record<string, string[]> = {
  minimal:  ['black', 'white', 'grey', 'beige', 'cream'],
  elevated: ['black', 'navy', 'cream', 'camel', 'burgundy'],
  bold:     ['red', 'blue', 'green', 'pink', 'coral', 'burgundy', 'orange'],
  romantic: ['pink', 'lavender', 'cream', 'beige', 'white', 'blush'],
  classic:  ['navy', 'black', 'white', 'camel', 'grey', 'burgundy'],
  youthful: ['pink', 'blue', 'green', 'red', 'coral', 'lavender', 'yellow'],
};

export const STYLE_GOAL_SUBTYPES: Record<string, Set<string>> = {
  minimal:  new Set(['t-shirt', 'long-sleeve', 'wide-leg', 'trousers', 'midi-skirt', 'tote', 'flats', 'loafers', 'blazer']),
  elevated: new Set(['blouse', 'blazer', 'coat', 'trousers', 'midi-skirt', 'heels', 'tote', 'shoulder-bag', 'necklace', 'turtleneck']),
  bold:     new Set(['maxi-dress', 'midi-dress', 'blazer', 'wide-leg', 'heels', 'earrings', 'necklace', 'bracelet', 'camisole']),
  romantic: new Set(['midi-dress', 'wrap-dress', 'blouse', 'camisole', 'midi-skirt', 'heels', 'mules', 'earrings', 'necklace', 'maxi-dress']),
  classic:  new Set(['blazer', 'trousers', 'midi-skirt', 'blouse', 'loafers', 'tote', 'watch', 'shirt', 'coat']),
  youthful: new Set(['t-shirt', 'mini-skirt', 'sneakers', 'jeans', 'shorts', 'crossbody', 'earrings', 'hoodie', 'mini-dress', 'crop-top']),
};

// ─── Scenario formality bands ────────────────────────────────────────────────
// Each scenario has a [min, max] formality band (1=loungewear, 9=black-tie).
// The scorer awards +2 for in-band, +1 for one-step-off-band, 0 otherwise.
// Audit (April 2026) — every band justified explicitly:
//   casual        [1, 5]  Anchors weekend wear; widened from [1,4] so smart
//                         casual (f=5: shirt, turtleneck) qualifies — coffee,
//                         park, errands, casual-Friday office.
//   travel        [1, 5]  Comfort-first but a polished blazer/loafer is still
//                         airport-appropriate.
//   date-casual   [3, 5]  Coffee / lunch / low-key first date. Excludes pure
//                         loungewear (f<3) and dressy heels-and-clutch.
//   date-dressy   [5, 8]  Dinner / wine bar — smart casual to cocktail.
//                         Replaces the legacy single `date` (was [3,7]).
//   work          [4, 7]  Business casual through traditional office; sweater,
//                         blouse, blazer, tailored trouser.
//   event         [5, 8]  Cocktail-leaning gathering — birthday, gallery.
//   interview     varies  Defaults to [6, 9] (sharp, conservative) but is
//                         relaxed by `getScenarioFormality` when the user's
//                         profile.industry is `creative` (band [4, 7]) or
//                         `tech` (band [5, 8]). Corporate and unspecified
//                         keep the conservative default. See helper below.
//   wedding       [6, 9]  Cocktail through formal — never casual.
export const SCENARIO_FORMALITY: Record<OccasionTag, [number, number]> = {
  casual:        [1, 5],
  travel:        [1, 5],
  'date-casual': [3, 5],
  'date-dressy': [5, 8],
  work:          [4, 7],
  event:         [5, 8],
  interview:     [6, 9],
  wedding:       [6, 9],
};

/**
 * Industry-aware formality lookup. For most scenarios this just returns the
 * static band, but `interview` is relaxed for creative/tech industries where
 * a force-suited candidate would actually feel off.
 */
export function getScenarioFormality(
  scenario: OccasionTag,
  profile?: Pick<UserProfile, 'industry'> | null,
): [number, number] {
  if (scenario === 'interview') {
    const ind = profile?.industry ?? 'unspecified';
    if (ind === 'creative') return [4, 7];
    if (ind === 'tech')     return [5, 8];
    // corporate + unspecified keep the conservative default.
    return [6, 9];
  }
  return SCENARIO_FORMALITY[scenario];
}

// ─── Sub-type → default formality ─────────────────────────────────────────────
// 1 = athleisure / loungewear, 5 = smart casual, 9 = black-tie.
// Used to derive a reliable formality for items even when the user didn't tag
// one explicitly. Looked up via `effectiveFormality(item)` below.
export const SUBTYPE_FORMALITY: Record<string, number> = {
  // tops
  'tank-top': 2, 't-shirt': 2, 'tee': 2, 'henley': 2, 'long-sleeve': 3,
  'polo-shirt': 3, 'rugby-shirt': 3, 'hoodie': 1, 'sweatshirt': 1,
  'sweater': 4, 'knit-top': 4, 'cardigan': 4, 'turtleneck': 5,
  'shirt': 5, 'button-down': 5, 'blouse': 6, 'camisole': 5, 'crop-top': 3,
  // bottoms
  'joggers': 1, 'leggings': 2, 'shorts': 2, 'jeans': 3, 'chinos': 4,
  'wide-leg': 5, 'trousers': 6, 'pencil-skirt': 6,
  'mini-skirt': 4, 'midi-skirt': 5, 'maxi-skirt': 5,
  // dresses
  'shirt-dress': 4, 'knit-dress': 4, 'mini-dress': 4,
  'midi-dress': 5, 'wrap-dress': 6, 'maxi-dress': 6,
  'slip-dress': 6, 'cocktail-dress': 7, 'gown': 9,
  // outerwear
  'denim-jacket': 3, 'jacket': 4, 'leather-jacket': 4,
  'trench': 5, 'blazer': 6, 'coat': 6,
  // shoes
  'sneakers': 1, 'sandals': 3, 'boots': 4, 'ankle-boots': 4, 'flats': 4,
  'mules': 5, 'loafers': 5, 'heels': 6, 'pumps': 6, 'stilettos': 7,
  // bags
  'backpack': 1, 'crossbody': 3, 'tote': 4, 'shoulder-bag': 5,
  'mini-bag': 5, 'clutch': 6,
  // jewelry — neutral
  'earrings': 4, 'necklace': 4, 'bracelet': 4, 'watch': 4, 'ring': 4,
};

/**
 * Returns the most reliable formality level for an item: the sub-type default
 * if known, otherwise the user-tagged value, otherwise 5 (mid).
 *
 * The stored `formalityLevel` field has historically been hard-coded to 3 for
 * every item, which makes it useless for scenario filtering. The sub-type is a
 * far more reliable signal, so we prefer it.
 */
export function effectiveFormality(item: WardrobeItem): number {
  return SUBTYPE_FORMALITY[item.subType] ?? item.formalityLevel ?? 5;
}

// ─── Sub-type → fabric / weight defaults ──────────────────────────────────────
// Used to backfill legacy items that were saved before fabric/weight capture
// landed, and as a fallback inside the scorer when a user skips those chips.
// Picks the most likely fabric for each silhouette — denim for jeans,
// cashmere/wool for sweaters, satin for cocktail dresses, etc. The aim isn't
// perfect coverage (a velvet midi-skirt won't be guessed) but a sensible
// default that the texture scorer can reason against.
const SUBTYPE_FABRIC: Record<string, Fabric> = {
  // tops
  't-shirt': 'cotton', 'tank-top': 'cotton', 'tee': 'cotton', 'henley': 'cotton',
  'long-sleeve': 'cotton', 'polo-shirt': 'cotton', 'rugby-shirt': 'cotton',
  'crop-top': 'cotton', 'hoodie': 'knit', 'sweatshirt': 'knit',
  'sweater': 'knit', 'knit-top': 'knit', 'cardigan': 'knit', 'turtleneck': 'knit',
  'shirt': 'cotton', 'button-down': 'cotton', 'blouse': 'silk', 'camisole': 'silk',
  // bottoms
  'jeans': 'denim', 'chinos': 'cotton', 'shorts': 'cotton', 'leggings': 'synthetic',
  'joggers': 'cotton', 'wide-leg': 'wool', 'trousers': 'wool',
  'pencil-skirt': 'wool', 'mini-skirt': 'cotton', 'midi-skirt': 'wool', 'maxi-skirt': 'cotton',
  // dresses
  'shirt-dress': 'cotton', 'knit-dress': 'knit', 'mini-dress': 'cotton',
  'midi-dress': 'silk', 'wrap-dress': 'silk', 'maxi-dress': 'cotton',
  'slip-dress': 'satin', 'cocktail-dress': 'satin', 'gown': 'satin',
  // outerwear
  'denim-jacket': 'denim', 'jacket': 'cotton', 'leather-jacket': 'leather',
  'bomber-jacket': 'synthetic', 'trench': 'cotton', 'blazer': 'wool',
  'coat': 'wool', 'peacoat': 'wool', 'puffer': 'synthetic', 'raincoat': 'synthetic',
  // shoes / bags / jewelry are texture-secondary in the scorer, but a denim-
  // ish fabric default for sneakers wouldn't help — leave undefined.
};

const SUBTYPE_WEIGHT: Record<string, FabricWeight> = {
  // light — silks, cotton tees, summer linens
  't-shirt': 'light', 'tank-top': 'light', 'tee': 'light', 'henley': 'light',
  'crop-top': 'light', 'blouse': 'light', 'camisole': 'light',
  'shirt': 'light', 'button-down': 'light', 'shorts': 'light',
  'mini-skirt': 'light', 'mini-dress': 'light', 'shirt-dress': 'light',
  'wrap-dress': 'light', 'slip-dress': 'light',
  // mid — chinos, denim, knit tops, midi pieces
  'long-sleeve': 'mid', 'polo-shirt': 'mid', 'rugby-shirt': 'mid',
  'sweater': 'mid', 'knit-top': 'mid', 'cardigan': 'mid', 'turtleneck': 'mid',
  'jeans': 'mid', 'chinos': 'mid', 'wide-leg': 'mid', 'trousers': 'mid',
  'pencil-skirt': 'mid', 'midi-skirt': 'mid', 'maxi-skirt': 'mid',
  'midi-dress': 'mid', 'maxi-dress': 'mid', 'cocktail-dress': 'mid',
  'denim-jacket': 'mid', 'jacket': 'mid', 'leather-jacket': 'mid',
  'bomber-jacket': 'mid', 'trench': 'mid', 'blazer': 'mid',
  'leggings': 'mid', 'knit-dress': 'mid',
  // heavy — wool overcoats, hoodies, puffers, gowns with structure
  'hoodie': 'heavy', 'sweatshirt': 'heavy', 'joggers': 'heavy',
  'coat': 'heavy', 'peacoat': 'heavy', 'puffer': 'heavy', 'raincoat': 'heavy',
  'gown': 'heavy',
};

/** Best-guess fabric for a sub-type (undefined when truly unclear). */
export function inferFabric(subType: string): Fabric | undefined {
  return SUBTYPE_FABRIC[subType];
}

/** Best-guess perceived weight for a sub-type (defaults to mid). */
export function inferFabricWeight(subType: string): FabricWeight {
  return SUBTYPE_WEIGHT[subType] ?? 'mid';
}

/** Resolve fabric for an item, preferring user-tagged value. */
function effectiveFabric(item: WardrobeItem): Fabric | undefined {
  return item.fabric ?? SUBTYPE_FABRIC[item.subType];
}

/** Resolve perceived weight for an item, preferring user-tagged value. */
function effectiveWeight(item: WardrobeItem): FabricWeight {
  return item.weight ?? SUBTYPE_WEIGHT[item.subType] ?? 'mid';
}

// ─── Texture taxonomy ────────────────────────────────────────────────────────
// "Statement" textures are fabrics that carry their own visual weight — a
// stylist will build around exactly one of them (a leather jacket, a silk
// slip, a satin skirt) and let the rest of the look stay flat. Two statement
// textures fight for attention; zero statement textures (all flat cotton +
// denim) reads underdeveloped.
const STATEMENT_FABRICS: Set<Fabric> = new Set(['leather', 'silk', 'satin', 'cashmere']);
// "Flat" textures read as plain background — every look needs at least some,
// but a pure-flat outfit has no tactile interest. Denim counts as flat in this
// taxonomy because while it has visible weave, paired with cotton/synthetic it
// still reads tactile-monotone (jeans + tee + cotton jacket).
const FLAT_FABRICS: Set<Fabric> = new Set(['cotton', 'synthetic', 'denim']);
// "Shiny" subset of statement textures — two shinies side-by-side reads
// over-the-top (silk top + satin skirt = bridal/costume).
const SHINY_FABRICS: Set<Fabric> = new Set(['silk', 'satin', 'leather']);

/**
 * Texture-harmony scorer. Returns a small integer [-3, +4] applied to the
 * combo total. Rules a stylist actually obeys:
 *   +3  exactly one statement texture in the look (the "hero")
 *   -3  two or more statement textures (over-styled / loud)
 *   -2  every piece is flat (no tactile interest)
 *   -2  two shiny pieces side-by-side (silk-on-satin etc.)
 *   +1  cool-season weight progression: lighter top + heavier bottom or
 *        heavier outerwear over a lighter base. Awarded once.
 *   -1  identical-weight stack across all 3+ core pieces (looks lumpy).
 * Items without a captured fabric fall back to sub-type inference, so even
 * legacy wardrobes get useful texture reasoning.
 */
export function textureHarmony(
  items: WardrobeItem[],
  season?: Season,
): number {
  if (items.length < 2) return 0;
  const core = items.filter(i =>
    i.category === 'top' || i.category === 'bottom' ||
    i.category === 'dress' || i.category === 'outerwear',
  );
  if (core.length === 0) return 0;
  const fabrics = core.map(effectiveFabric);
  const weights = core.map(effectiveWeight);

  let score = 0;

  const statementCount = fabrics.filter(f => f && STATEMENT_FABRICS.has(f)).length;
  if (statementCount === 1) score += 3;
  else if (statementCount >= 2) score -= 3;

  const knownFabrics = fabrics.filter((f): f is Fabric => Boolean(f));
  if (knownFabrics.length >= 2 && knownFabrics.every(f => FLAT_FABRICS.has(f))) {
    score -= 2;
  }

  const shinyCount = fabrics.filter(f => f && SHINY_FABRICS.has(f)).length;
  if (shinyCount >= 2) score -= 2;

  const top = core.find(i => i.category === 'top');
  const bottom = core.find(i => i.category === 'bottom');
  const outer = core.find(i => i.category === 'outerwear');
  const base = top ?? core.find(i => i.category === 'dress');
  const ord = (w: FabricWeight) => w === 'light' ? 0 : w === 'mid' ? 1 : 2;
  const isCool = season === 'fall' || season === 'winter';
  if (isCool) {
    // Award the cool-season progression bonus when EITHER axis qualifies:
    //   (a) lighter top sitting under a heavier bottom, OR
    //   (b) heavier outerwear layered over a lighter base.
    // Capped at +1 — we only want to reward the layering instinct once.
    const topOverBottom = !!(top && bottom && ord(effectiveWeight(top)) < ord(effectiveWeight(bottom)));
    const outerOverBase = !!(outer && base && ord(effectiveWeight(outer)) > ord(effectiveWeight(base)));
    if (topOverBottom || outerOverBase) score += 1;
  }

  if (core.length >= 3) {
    const allSame = weights.every(w => w === weights[0]);
    if (allSame) score -= 1;
  }

  return score;
}

// ─── Hero-piece distinctiveness ──────────────────────────────────────────────
// A real stylist builds outfits *around* one statement piece — the camel
// trench, the leather jacket, the silk slip, the bright cocktail dress — and
// lets every other piece quietly support it. `pickHero` selects the most
// distinctive item per scenario so the rotation engine can seed cores around
// it; `recedeScore` rewards supporting pieces that step back instead of
// fighting the hero for attention.
//
// Distinctiveness axes (independent, additive):
//   • Saturation        — vivid garments naturally pull the eye.
//   • Statement texture — leather / silk / satin / cashmere always read first.
//   • Signature silhouette — pieces with their own architecture (trench,
//                            blazer, leather-jacket, cocktail-dress, slip,
//                            wide-leg, gown) anchor a look on their own.
//   • Bold pattern       — a large/animal/floral pattern is itself a hero.
//   • Style-goal lift    — the user's primary style goal shapes which heroes
//                          feel "intentional" vs random.
// Pure neutrals (black/white/grey/cream/beige/navy) take a small dampener so
// they don't accidentally win as heroes when they're really meant to support.

const HERO_SIGNATURE_SUBTYPES: Set<string> = new Set([
  'leather-jacket', 'trench', 'blazer', 'coat', 'peacoat',
  'slip-dress', 'cocktail-dress', 'gown', 'maxi-dress', 'wrap-dress',
  'wide-leg', 'pencil-skirt', 'maxi-skirt',
  'camisole',                          // when silk, a statement on its own
  'turtleneck',                        // sculptural neckline
  'stilettos', 'heels',                // the "shoes carry the look" case
  'clutch',                            // jewel-toned clutch as the spark
]);

const NEUTRAL_HERO_DAMPENERS = new Set([
  'black', 'white', 'grey', 'cream', 'beige', 'navy',
]);

/**
 * Score how visually distinctive an item is — i.e. how well it can carry the
 * role of "the one piece you build the outfit around".
 *
 * Returns a number roughly in [-3, 16]. Items below ~3 are unlikely to read
 * as a hero on their own.
 */
export function distinctivenessScore(
  item: WardrobeItem,
  profile?: Pick<UserProfile, 'styleGoalPrimary' | 'styleGoalSecondary'> | null,
): number {
  let score = 0;

  // 1. Saturation — vivid colours pull the eye. HSL.s is 0..1.
  const sat = itemHsl(item).s;
  if (sat >= 0.55) score += 5;
  else if (sat >= 0.35) score += 3;
  else if (sat >= 0.18) score += 1;

  // 2. Statement texture (resolved fabric, falling back to sub-type guess).
  const fab = effectiveFabric(item);
  if (fab && STATEMENT_FABRICS.has(fab)) score += 5;
  else if (fab && FLAT_FABRICS.has(fab)) score -= 1;

  // 3. Signature silhouette.
  if (HERO_SIGNATURE_SUBTYPES.has(item.subType)) score += 3;

  // 4. Bold pattern — a single large/animal/floral piece is itself a hero.
  if (
    item.pattern && item.pattern !== 'solid' &&
    (item.patternScale === 'large' || item.pattern === 'animal' || item.pattern === 'floral')
  ) score += 4;

  // 5. Style-goal lift — heroes that align with the user's primary goal feel
  //    "on brief" and read more intentional. Secondary goal worth less.
  const primaryHero = STYLE_GOAL_SUBTYPES[profile?.styleGoalPrimary ?? '']?.has(item.subType);
  if (primaryHero) score += 2;
  const secHero = profile?.styleGoalSecondary
    ? STYLE_GOAL_SUBTYPES[profile.styleGoalSecondary]?.has(item.subType)
    : false;
  if (secHero) score += 1;

  // 6. Pure-neutral dampener — a flat-cotton black tee shouldn't beat a silk
  //    slip just because we're scoring atomically. Doesn't apply to jewelry.
  if (item.category !== 'jewelry' && NEUTRAL_HERO_DAMPENERS.has(item.colorFamily) && sat < 0.18) {
    // Only dampen when we have NO other reason to consider it distinctive.
    if (!fab || !STATEMENT_FABRICS.has(fab)) score -= 2;
  }

  return score;
}

/**
 * Pick up to `limit` candidate hero items for a scenario, sorted by
 * distinctiveness × scenario fit. Drops items that read as supporting-only
 * (low distinctiveness) and items that sit clearly outside the scenario
 * formality band so a leather jacket isn't picked as the hero of a wedding.
 *
 * Heroes are restricted to the categories that can visibly anchor a look:
 *   top, bottom, dress, outerwear, shoes (when statement). Bags and jewelry
 * rarely drive an outfit and we keep them as accents.
 */
export function pickHeroCandidates(
  items: WardrobeItem[],
  scenario: OccasionTag,
  profile: UserProfile,
  limit = 6,
): WardrobeItem[] {
  const [minF, maxF] = getScenarioFormality(scenario, profile);
  const HERO_CATEGORIES = new Set(['top', 'bottom', 'dress', 'outerwear', 'shoes']);
  const eligible = items.filter(i => {
    if (!HERO_CATEGORIES.has(i.category)) return false;
    const f = effectiveFormality(i);
    // Allow one step outside band — band-strict cores still gate the final
    // outfit, but heroes can stretch slightly (e.g. an elevated blazer worn
    // with jeans for a date-casual brief).
    return f >= minF - 1 && f <= maxF + 1;
  });
  const scored = eligible
    .map(i => ({
      item: i,
      score: distinctivenessScore(i, profile) + 0.1 * scoreItemForProfile(i, scenario, profile),
    }))
    .filter(s => s.score >= 4)               // weed out clearly-supporting pieces
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.item);
}

/**
 * Convenience: pick the single best hero for a scenario.
 */
export function pickHero(
  items: WardrobeItem[],
  scenario: OccasionTag,
  profile: UserProfile,
): WardrobeItem | null {
  return pickHeroCandidates(items, scenario, profile, 1)[0] ?? null;
}

/**
 * Score how well an item RECEDES around a given hero — i.e. how good a
 * supporting piece it is. Higher = quieter, more cooperative.
 *
 * Rules a stylist follows when supporting a hero:
 *   • Lower saturation than the hero (don't compete on colour intensity).
 *   • Non-statement texture (one statement per look — never two).
 *   • Neutral or harmonising colour family.
 *   • Complementary silhouette volume (slim under loose, tailored under
 *     boxy) so the hero's shape reads cleanly.
 *
 * Returns a number roughly in [-6, 8]. Neutral / 0 means "fine, no opinion".
 */
export function recedeScore(item: WardrobeItem, hero: WardrobeItem): number {
  if (item.id === hero.id) return 0;
  let score = 0;

  // 1. Saturation — supporting pieces should sit BELOW the hero.
  const heroSat = itemHsl(hero).s;
  const itemSat = itemHsl(item).s;
  const satGap = heroSat - itemSat;
  if (satGap >= 0.25) score += 3;
  else if (satGap >= 0.10) score += 1;
  else if (satGap <= -0.15) score -= 3;       // supporter brighter than hero
  else if (satGap <= -0.05) score -= 1;

  // 2. Texture — one statement per look. Penalise a second statement fabric.
  const heroFab = effectiveFabric(hero);
  const itemFab = effectiveFabric(item);
  const heroIsStatement = !!(heroFab && STATEMENT_FABRICS.has(heroFab));
  const itemIsStatement = !!(itemFab && STATEMENT_FABRICS.has(itemFab));
  if (heroIsStatement && itemIsStatement) score -= 4;
  else if (itemFab && FLAT_FABRICS.has(itemFab)) score += 2;

  // 3. Colour — neutrals and harmonising tones recede; off-key brights clash.
  if (isNeutralColor(item.colorFamily)) score += 2;
  // colorsHarmonize is checked elsewhere in the pipeline — we only add a
  // modest bonus here when the supporter shares a temperature with the hero.

  // 4. Silhouette balance — opposite volume reads deliberate.
  const isVolume = (f?: string) => f === 'loose' || f === 'oversized';
  const isSleek  = (f?: string) => f === 'slim' || f === 'tailored';
  if (hero.fit && item.fit) {
    if (isVolume(hero.fit) && isSleek(item.fit)) score += 2;
    else if (isSleek(hero.fit) && isVolume(item.fit)) score += 2;
    else if (isVolume(hero.fit) && isVolume(item.fit)) score -= 1;
  }

  // 5. Signature silhouette penalty — two architectural pieces fight.
  if (HERO_SIGNATURE_SUBTYPES.has(hero.subType) && HERO_SIGNATURE_SUBTYPES.has(item.subType)) {
    // Coats and jackets layered over a signature dress are fine — only
    // penalise pieces in the SAME silhouette role (e.g. trench + blazer).
    const layeringRoles = new Set(['leather-jacket', 'trench', 'blazer', 'coat', 'peacoat']);
    const heroIsOuter = layeringRoles.has(hero.subType);
    const itemIsOuter = layeringRoles.has(item.subType);
    if (heroIsOuter === itemIsOuter) score -= 2;
  }

  // 6. Bold pattern penalty — a hero already carries the look's visual load.
  if (
    item.pattern && item.pattern !== 'solid' &&
    (item.patternScale === 'large' || item.pattern === 'animal' || item.pattern === 'floral')
  ) score -= 2;

  return score;
}

// ─── Season inference (month-based, Northern hemisphere) ─────────────────────
// We don't have a weather API, so seasons follow the calendar. A real stylist
// would never serve tweed in July or linen shorts in December — once a user
// has tagged an item with seasons, we honour those tags as a hard filter.

export type Season = 'winter' | 'spring' | 'summer' | 'fall';

const MONTH_TO_SEASON: Season[] = [
  'winter', 'winter',                                 // Jan, Feb
  'spring', 'spring', 'spring',                       // Mar, Apr, May
  'summer', 'summer', 'summer',                       // Jun, Jul, Aug
  'fall',   'fall',   'fall',                         // Sep, Oct, Nov
  'winter',                                           // Dec
];

export function currentSeason(date: Date = new Date()): Season {
  return MONTH_TO_SEASON[date.getMonth()];
}

/**
 * True if the item is appropriate for the current season. Untagged items pass
 * (the user hasn't told us either way — assume year-round). Items tagged
 * 'all-season' always pass. Otherwise the item must explicitly include the
 * current season.
 */
export function itemFitsSeason(item: WardrobeItem, season: Season): boolean {
  if (!item.seasonTags || item.seasonTags.length === 0) return true;
  if (item.seasonTags.includes('all-season')) return true;
  return item.seasonTags.includes(season);
}

const UNDERTONE_FLATTERING: Record<string, Set<string>> = {
  cool:    new Set(['navy', 'burgundy', 'lavender', 'grey', 'white', 'blue', 'pink', 'black', 'emerald', 'purple', 'rose']),
  warm:    new Set(['camel', 'olive', 'coral', 'cream', 'brown', 'red', 'orange', 'beige', 'terracotta', 'gold', 'mustard']),
  neutral: new Set(['black', 'navy', 'beige', 'white', 'grey', 'camel', 'pink', 'blue', 'lavender', 'cream', 'burgundy']),
};

const HIGH_CONTRAST_COLORS = new Set(['black', 'white', 'navy', 'red', 'emerald', 'blue', 'burgundy', 'coral']);
const HIGH_CONTRAST_SKIN_TONES = new Set(['very-light', 'very-dark', 'dark']);

const EYE_COMPLEMENTARY: Record<string, Set<string>> = {
  'dark-brown':  new Set(['camel', 'brown', 'olive', 'coral', 'cream', 'beige', 'terracotta']),
  'light-brown': new Set(['camel', 'olive', 'green', 'cream', 'coral', 'brown', 'mustard']),
  hazel:         new Set(['olive', 'burgundy', 'green', 'brown', 'purple', 'lavender', 'terracotta']),
  green:         new Set(['burgundy', 'coral', 'brown', 'olive', 'red', 'pink', 'peach']),
  blue:          new Set(['coral', 'orange', 'camel', 'beige', 'brown', 'cream', 'terracotta']),
  grey:          new Set(['lavender', 'pink', 'blue', 'purple', 'navy', 'white', 'rose']),
};

const BODY_TYPE_FLATTERING: Record<string, Set<string>> = {
  hourglass: new Set(['wrap-dress', 'midi-dress', 'midi-skirt', 'blouse', 'heels', 'mules', 'camisole', 'shirt', 'bodycon-dress', 'trousers', 'wide-leg']),
  pear: new Set(['blouse', 'shirt', 'midi-skirt', 'maxi-skirt', 'wide-leg', 'trousers', 'heels', 'shoulder-bag', 'tote', 'blazer', 'sweater', 'coat']),
  apple: new Set(['maxi-dress', 'wrap-dress', 'midi-dress', 'blouse', 'wide-leg', 'trousers', 'flats', 'cardigan', 'tote', 'long-sleeve', 'turtleneck']),
  rectangle: new Set(['wrap-dress', 'midi-skirt', 'wide-leg', 'blazer', 'cardigan', 'heels', 'midi-dress', 'blouse', 'camisole', 'maxi-dress']),
  'inverted-triangle': new Set(['wide-leg', 'maxi-skirt', 'midi-skirt', 'flats', 'sneakers', 'midi-dress', 'trousers', 'flared', 'maxi-dress']),
  athletic: new Set(['midi-dress', 'wrap-dress', 'midi-skirt', 'blouse', 'camisole', 'heels', 'mules', 'flared', 'maxi-dress']),
};

// ─── Mood → subtype / fabric / color affinities ──────────────────────────────

const MOOD_COLORS: Record<MoodGoal, Set<string>> = {
  confident: new Set(['red', 'burgundy', 'black', 'navy', 'emerald']),
  soft:      new Set(['cream', 'beige', 'blush', 'lavender', 'pink', 'camel', 'white']),
  joyful:    new Set(['pink', 'coral', 'yellow', 'green', 'blue', 'orange', 'red']),
  grounded:  new Set(['olive', 'brown', 'camel', 'beige', 'navy', 'terracotta', 'black']),
  romantic:  new Set(['blush', 'pink', 'cream', 'lavender', 'burgundy', 'rose']),
  powerful:  new Set(['black', 'burgundy', 'navy', 'white', 'red']),
};

const MOOD_SUBTYPES: Record<MoodGoal, Set<string>> = {
  confident: new Set(['blazer', 'wide-leg', 'heels', 'trousers', 'midi-dress']),
  soft:      new Set(['wrap-dress', 'midi-skirt', 'cardigan', 'blouse', 'flats', 'camisole']),
  joyful:    new Set(['midi-dress', 'maxi-dress', 'mini-dress', 'skirt', 'sneakers']),
  grounded:  new Set(['trousers', 'loafers', 'sweater', 'blazer', 'coat', 'boots']),
  romantic:  new Set(['wrap-dress', 'midi-dress', 'blouse', 'camisole', 'mules', 'heels', 'maxi-dress']),
  powerful:  new Set(['blazer', 'coat', 'heels', 'trousers', 'wide-leg', 'turtleneck']),
};

const MOOD_FABRICS: Record<MoodGoal, Set<string>> = {
  confident: new Set(['wool', 'leather', 'silk']),
  soft:      new Set(['cashmere', 'silk', 'linen', 'knit', 'cotton']),
  joyful:    new Set(['cotton', 'linen', 'silk']),
  grounded:  new Set(['wool', 'denim', 'leather', 'cotton']),
  romantic:  new Set(['silk', 'satin', 'linen', 'cashmere']),
  powerful:  new Set(['wool', 'leather', 'satin', 'silk']),
};

// ─── Mood contradictions ──────────────────────────────────────────────────────
// Items that visibly clash with a mood. A real stylist would never serve a
// hoodie when the brief is "powerful", or all-black leather when the brief is
// "soft". A core piece in this set causes the outfit to be dropped from the
// mood-filtered pool entirely.
const MOOD_CONTRA_COLORS: Record<MoodGoal, Set<string>> = {
  confident: new Set([]),
  soft:      new Set(['black', 'red', 'burgundy']),
  joyful:    new Set(['black', 'grey', 'brown', 'olive']),
  grounded:  new Set(['pink', 'lavender', 'blush', 'coral']),
  romantic:  new Set(['black', 'olive', 'orange']),
  powerful:  new Set(['blush', 'pink', 'lavender', 'cream']),
};

const MOOD_CONTRA_SUBTYPES: Record<MoodGoal, Set<string>> = {
  confident: new Set(['hoodie', 'joggers', 'sweatshirt']),
  soft:      new Set(['leather-jacket', 'hoodie', 'joggers', 'sweatshirt']),
  joyful:    new Set(['blazer', 'trench', 'turtleneck', 'leather-jacket']),
  grounded:  new Set(['cocktail-dress', 'gown', 'stilettos', 'mini-dress']),
  romantic:  new Set(['hoodie', 'joggers', 'sweatshirt', 'leather-jacket', 'denim-jacket']),
  powerful:  new Set(['hoodie', 'joggers', 'sweatshirt', 'cardigan', 'sneakers']),
};

/** True if the item naturally embodies the mood (any one signal suffices). */
export function itemMatchesMood(item: WardrobeItem, mood: MoodGoal): boolean {
  if (MOOD_COLORS[mood].has(item.colorFamily)) return true;
  if (MOOD_SUBTYPES[mood].has(item.subType)) return true;
  if (item.fabric && MOOD_FABRICS[mood].has(item.fabric)) return true;
  if (item.mood && item.mood.includes(mood)) return true;
  return false;
}

/** True if the item visibly clashes with the mood (would be vetoed by a stylist). */
export function itemContradictsMood(item: WardrobeItem, mood: MoodGoal): boolean {
  if (MOOD_CONTRA_COLORS[mood].has(item.colorFamily)) return true;
  if (MOOD_CONTRA_SUBTYPES[mood].has(item.subType)) return true;
  return false;
}

// ─── Hair colour × clothing colour harmony ────────────────────────────────────

const HAIR_FLATTERING: Record<string, Set<string>> = {
  'black':        new Set(['white', 'red', 'emerald', 'blue', 'burgundy', 'pink', 'lavender']),
  'dark-brown':   new Set(['cream', 'camel', 'burgundy', 'emerald', 'navy', 'coral', 'olive']),
  'medium-brown': new Set(['camel', 'olive', 'terracotta', 'burgundy', 'cream', 'navy']),
  'light-brown':  new Set(['coral', 'olive', 'cream', 'burgundy', 'camel', 'pink']),
  'blonde':       new Set(['navy', 'burgundy', 'emerald', 'black', 'pink', 'lavender', 'coral']),
  'red':          new Set(['emerald', 'olive', 'navy', 'cream', 'camel', 'brown']),
  'grey':         new Set(['black', 'white', 'navy', 'burgundy', 'lavender', 'pink']),
  'silver':       new Set(['black', 'white', 'navy', 'grey', 'lavender', 'pink']),
};

// ─── Metal tone × undertone / preference ──────────────────────────────────────

const METAL_FOR_UNDERTONE: Record<string, Set<string>> = {
  cool:    new Set(['silver', 'rose-gold', 'mixed']),
  warm:    new Set(['gold', 'rose-gold', 'mixed']),
  neutral: new Set(['gold', 'silver', 'rose-gold', 'mixed']),
};

// ─── Constraint checks ────────────────────────────────────────────────────────

export function passesConstraints(item: WardrobeItem, profile: UserProfile): boolean {
  if (profile.constraints.noSleeveless && item.subType === 'tank-top') return false;
  if (profile.constraints.noShortSkirts &&
    (item.subType === 'mini-skirt' || item.subType === 'mini-dress')) return false;
  if ((profile.constraints.maxHeelHeight === 'flat' ||
    profile.constraints.maxHeelHeight === 'low') && item.subType === 'heels') return false;
  // Hard colour aversion filter — never recommend an item in a hated colour
  const aversions = profile.constraints.colorAversions ?? [];
  if (aversions.length > 0 &&
      (aversions.includes(item.colorFamily) ||
       (item.accentColor && aversions.includes(item.accentColor)))) return false;
  return true;
}

// ─── Core item scorer ─────────────────────────────────────────────────────────

export function scoreItemForProfile(
  item: WardrobeItem,
  scenario: OccasionTag,
  profile: UserProfile,
  mood?: MoodGoal | null,
): number {
  let score = 0;

  // 1. Scenario fit (max +8)
  if (item.occasionTags.includes(scenario)) score += 5;
  if (SCENARIO_AFFINITY[scenario].includes(item.subType)) score += 3;

  // 2. Formality band (max +2) — industry-aware for `interview`.
  const [minF, maxF] = getScenarioFormality(scenario, profile);
  const f = effectiveFormality(item);
  if (f >= minF && f <= maxF) score += 2;
  else if (f >= minF - 1 && f <= maxF + 1) score += 1;

  // 3. Style goal — colour (max +6)
  const primaryColors = STYLE_PREFERRED_COLORS[profile.styleGoalPrimary ?? ''] ?? [];
  const matchesPrimaryColor = primaryColors.includes(item.colorFamily);
  if (matchesPrimaryColor) score += 5;
  const secColors = profile.styleGoalSecondary
    ? STYLE_PREFERRED_COLORS[profile.styleGoalSecondary] ?? []
    : [];
  const matchesSecondaryColor = secColors.includes(item.colorFamily);
  if (matchesSecondaryColor) score += 1;

  // 4. Style goal — silhouette (max +3)
  const primarySubtypes = STYLE_GOAL_SUBTYPES[profile.styleGoalPrimary ?? ''];
  const matchesPrimarySubtype = primarySubtypes?.has(item.subType) ?? false;
  if (matchesPrimarySubtype) score += 3;
  const secondarySubtypes = profile.styleGoalSecondary
    ? STYLE_GOAL_SUBTYPES[profile.styleGoalSecondary]
    : undefined;
  const matchesSecondarySubtype = secondarySubtypes?.has(item.subType) ?? false;

  // 4b. Off-brief penalty — when a style goal is set and the item matches
  //     NONE of the goal's preferred colours OR signature silhouettes
  //     (primary OR secondary), a stylist would visibly demote it. Applied
  //     softly (-3) rather than as a hard veto so true neutrals
  //     (black/white/grey/cream/beige/navy) and accessories can still slot in.
  //     Skipped for jewelry (too small to read off-brief).
  if (profile.styleGoalPrimary && item.category !== 'jewelry') {
    const isTrueNeutral = ['black', 'white', 'grey', 'cream', 'beige', 'navy'].includes(item.colorFamily);
    const onBrief = matchesPrimaryColor || matchesPrimarySubtype ||
                    matchesSecondaryColor || matchesSecondarySubtype;
    if (!onBrief && !isTrueNeutral) {
      score -= 3;
    }
  }

  // 5. Undertone harmony (max +4)
  const undertoneColors = UNDERTONE_FLATTERING[profile.undertone ?? 'neutral'];
  if (undertoneColors?.has(item.colorFamily)) score += 4;

  // 6. Skin depth contrast (max +1)
  if (
    HIGH_CONTRAST_SKIN_TONES.has(profile.skinTone ?? '') &&
    HIGH_CONTRAST_COLORS.has(item.colorFamily)
  ) score += 1;

  // 7. Eye complementary (max +1)
  const eyeColors = EYE_COMPLEMENTARY[profile.eyeColor ?? ''];
  if (eyeColors?.has(item.colorFamily)) score += 1;

  // 8. Body type (max +3)
  const flattering = BODY_TYPE_FLATTERING[profile.bodyType ?? ''];
  if (flattering?.has(item.subType)) score += 3;

  // ── v2 dimensions (all guarded — each only fires when signals are present)

  // 9. Hair × colour (max +2)
  if (profile.hairColor) {
    const hairSet = HAIR_FLATTERING[profile.hairColor];
    if (hairSet?.has(item.colorFamily)) score += 2;
  }

  // 10. Metal × undertone / preference (max +2)
  if (item.category === 'jewelry' && item.metalTone && item.metalTone !== 'none') {
    if (profile.metalPreference && profile.metalPreference === item.metalTone) score += 2;
    else {
      const okMetals = METAL_FOR_UNDERTONE[profile.undertone ?? 'neutral'];
      if (okMetals?.has(item.metalTone)) score += 1;
    }
  }

  // 11. Mood alignment (max +10) — heavyweight so a clearly-on-mood piece can
  //     overtake a merely-on-scenario piece, the way a real stylist would
  //     prioritise feel over technical fit on a mood-driven day.
  if (mood) {
    if (MOOD_COLORS[mood].has(item.colorFamily)) score += 2;
    if (MOOD_SUBTYPES[mood].has(item.subType)) score += 3;
    if (item.fabric && MOOD_FABRICS[mood].has(item.fabric)) score += 2;
    if (item.mood && item.mood.includes(mood)) score += 3;
  }

  // 12. Life-phase comfort (soft bonus for forgiving silhouettes)
  if (profile.lifePhase && profile.lifePhase !== 'none') {
    const comfy = new Set(['wrap-dress', 'maxi-dress', 'wide-leg', 'cardigan', 'blazer', 'long-sleeve']);
    if (comfy.has(item.subType)) score += 1;
    if (item.fit === 'loose' || item.fit === 'oversized' || item.fit === 'regular') score += 1;
  }

  return score;
}

// ─── Outfit combination scorer ────────────────────────────────────────────────

export interface OutfitScoreBreakdown {
  total: number;
  completeness: number;
  palette: number;
  paletteType: ReturnType<typeof classifyPalette>;
  formalityCohesion: number;
  patternSafety: number;
  contrastMatch: number;
  pieces: number;
  proportionBalance: number;
  metalCohesion: number;
  // Perceptual colour signals (v3) — operate on per-item HSL/Lab
  temperatureHarmony: number;
  valueSpread: number;
  saturationDominance: number;
  // Texture pairing (v4) — fabric weight + statement-texture interaction
  textureHarmony: number;
}

export function scoreOutfitCombo(
  components: OutfitComponent[],
  items?: WardrobeItem[],     // lookup for pattern/fabric/formality signals
  profile?: UserProfile,
  season?: Season,            // optional — enables cool-season weight bonus
): OutfitScoreBreakdown {
  const categories = new Set(components.map(c => c.category));
  const colors = components.map(c => c.colorFamily);
  let completeness = 0;
  if (categories.has('shoes'))    completeness += 4;
  if (categories.has('bag'))      completeness += 3;
  if (categories.has('jewelry'))  completeness += 3;
  if (categories.has('outerwear')) completeness += 1;

  // Palette score (replaces simple pairwise check)
  const paletteType = classifyPalette(colors);
  const palette = scorePaletteType(paletteType);

  // Lookup the full WardrobeItem for each component (for pattern/formality)
  const resolved: WardrobeItem[] = items
    ? components
        .map(c => items.find(i => i.id === c.matchedItemId))
        .filter((i): i is WardrobeItem => Boolean(i))
    : [];

  // Formality cohesion — items should sit within ±2 of each other
  let formalityCohesion = 0;
  if (resolved.length >= 2) {
    const fs = resolved.map(i => effectiveFormality(i));
    const spread = Math.max(...fs) - Math.min(...fs);
    if (spread <= 1) formalityCohesion = 3;
    else if (spread <= 2) formalityCohesion = 2;
    else if (spread <= 3) formalityCohesion = 1;
    else formalityCohesion = -2;
  }

  // Pattern safety — at most ONE bold/large pattern. Small/subtle patterns or
  // solids can mix freely.
  let patternSafety = 2;
  if (resolved.length > 0) {
    const bold = resolved.filter(i =>
      i.pattern && i.pattern !== 'solid' &&
      (i.patternScale === 'large' || i.pattern === 'animal' || i.pattern === 'floral')
    );
    if (bold.length >= 2) patternSafety = -3;
    else if (bold.length === 1) patternSafety = 2;
  }

  // Personal contrast match — bright/dark contrast outfits suit high-contrast
  // people; softer all-mid-tone outfits suit low-contrast people.
  let contrastMatch = 0;
  if (profile?.contrastLevel) {
    const hasDark = colors.some(c => ['black', 'navy', 'burgundy'].includes(c));
    const hasLight = colors.some(c => ['white', 'cream', 'beige'].includes(c));
    const outfitHighContrast = hasDark && hasLight;
    if (profile.contrastLevel === 'high' && outfitHighContrast) contrastMatch = 2;
    else if (profile.contrastLevel === 'low' && !outfitHighContrast) contrastMatch = 1;
    else if (profile.contrastLevel === 'medium') contrastMatch = 1;
  }

  let pieces = 0;
  if (components.length >= 4) pieces += 1;
  if (components.length >= 5) pieces += 1;

  // ─── Proportion balance ──────────────────────────────────────────────────
  // A silhouette reads deliberate when loose/oversized volume on one half is
  // paired with slim/tailored on the other half (and vice versa). Matching
  // volumes on both halves can look unbalanced; two cropped/short pieces
  // stacked also reads unpolished.
  let proportionBalance = 0;
  if (resolved.length >= 2) {
    const top = resolved.find(i => i.category === 'top');
    const bottom = resolved.find(i => i.category === 'bottom');
    const dress = resolved.find(i => i.category === 'dress');
    const isVolume = (f?: string) => f === 'loose' || f === 'oversized';
    const isSleek  = (f?: string) => f === 'slim' || f === 'tailored';
    if (top?.fit && bottom?.fit) {
      if (isVolume(top.fit) && isSleek(bottom.fit)) proportionBalance += 2;
      else if (isSleek(top.fit) && isVolume(bottom.fit)) proportionBalance += 2;
      else if (isVolume(top.fit) && isVolume(bottom.fit)) proportionBalance -= 2;
      else proportionBalance += 1;
    } else if (dress?.fit) {
      // Solo dress — tailored or regular reads confident; oversized can be moody.
      if (isSleek(dress.fit)) proportionBalance += 1;
    }
    // Cropped+short stacking penalty: crop-top + mini-skirt/shorts reads unstyled.
    const hasCrop = resolved.some(i => i.subType === 'crop-top');
    const hasShort = resolved.some(i =>
      i.subType === 'mini-skirt' || i.subType === 'shorts' || i.subType === 'mini-dress');
    if (hasCrop && hasShort) proportionBalance -= 2;
    // Height-awareness: petite + maxi + flat shoes can overwhelm proportions.
    if (profile?.heightBand === 'petite') {
      const hasMaxi = resolved.some(i => i.subType === 'maxi-dress' || i.subType === 'maxi-skirt');
      const hasFlats = resolved.some(i => i.subType === 'flats' || i.subType === 'sneakers');
      if (hasMaxi && hasFlats) proportionBalance -= 1;
    }
  }

  // ─── Metal cohesion ──────────────────────────────────────────────────────
  // Jewelry and hardware with conflicting metal tones jar a polished look
  // unless the user has explicitly opted into mixing metals.
  let metalCohesion = 0;
  const metals = resolved
    .map(i => i.metalTone)
    .filter((m): m is NonNullable<typeof m> => Boolean(m) && m !== 'none');
  const uniqueMetals = new Set(metals);
  if (uniqueMetals.size >= 2) {
    if (profile?.metalPreference === 'mixed') metalCohesion = 1;
    else metalCohesion = -2;
  } else if (uniqueMetals.size === 1) {
    const [only] = Array.from(uniqueMetals);
    if (!profile?.metalPreference || profile.metalPreference === 'mixed'
        || profile.metalPreference === only) {
      metalCohesion = 1;
    } else {
      // Wrong single metal vs user preference — small negative.
      metalCohesion = -1;
    }
  }

  // ─── Perceptual colour signals ───────────────────────────────────────────
  // Three combo-level scorers that read the per-item HSL captured at upload
  // time (or backfilled from the colour-family centroid for legacy items).
  // These let the engine reason about colour the way a stylist actually does:
  // temperature coherence, pleasing value spread, and one dominant focal piece.
  let tempHarmonyScore = 0;
  let valueSpreadScore = 0;
  let saturationDomScore = 0;
  if (resolved.length >= 2) {
    const hsls = resolved.map(itemHsl);
    tempHarmonyScore = temperatureHarmony(hsls);
    valueSpreadScore = valueSpread(hsls);
    saturationDomScore = saturationDominance(hsls);
  }

  // ─── Texture-harmony signal ──────────────────────────────────────────────
  // Reads each item's fabric (or sub-type fallback) and applies the
  // statement-texture / weight-progression rules a stylist follows.
  const textureScore = textureHarmony(resolved, season);

  const total = completeness + palette + formalityCohesion + patternSafety
    + contrastMatch + pieces + proportionBalance + metalCohesion
    + tempHarmonyScore + valueSpreadScore + saturationDomScore
    + textureScore;

  return {
    total, completeness, palette, paletteType,
    formalityCohesion, patternSafety, contrastMatch, pieces,
    proportionBalance, metalCohesion,
    temperatureHarmony: tempHarmonyScore,
    valueSpread: valueSpreadScore,
    saturationDominance: saturationDomScore,
    textureHarmony: textureScore,
  };
}

// ─── Reaction adjustment ──────────────────────────────────────────────────────

/**
 * Adjust a raw outfit score by user feedback:
 *   - love        →  big boost (keeps surfacing)
 *   - not-today   →  large decay for 14 days, then gradual return
 */
export function adjustScoreForReactions(
  baseScore: number,
  fingerprint: string,
  reactions: OutfitReaction[],
  today: string,
  itemIds: string[] = [],
): number {
  if (reactions.length === 0) return baseScore;

  const todayMs = new Date(today + 'T12:00:00').getTime();
  const ageDaysOf = (date: string) => Math.max(0, Math.round(
    (todayMs - new Date(date + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)
  ));

  let bonus = 0;

  // 1. Exact-outfit fingerprint reactions — strong signal
  for (const r of reactions.filter(r => r.outfitFingerprint === fingerprint)) {
    const ageDays = ageDaysOf(r.date);
    if (r.type === 'love') {
      if (ageDays <= 14) bonus += 8;
      else bonus += Math.max(2, 8 - Math.floor((ageDays - 14) / 7));
    } else {
      if (ageDays <= 3)  bonus -= 20;
      else if (ageDays <= 7)  bonus -= 12;
      else if (ageDays <= 14) bonus -= 6;
      else if (ageDays <= 28) bonus -= 2;
    }
  }

  // 2. Item-level preference learning: tally each item's reactions across any
  //    outfit it has appeared in. Loved items lift new combinations they are
  //    part of; not-today items dampen them.
  if (itemIds.length > 0) {
    const itemSet = new Set(itemIds);
    const itemScores: Record<string, number> = {};
    for (const r of reactions) {
      const ageDays = ageDaysOf(r.date);
      const parts = r.outfitFingerprint ? r.outfitFingerprint.split('|') : [];
      const weight = r.type === 'love'
        ? (ageDays <= 14 ? 1.5 : Math.max(0.4, 1.5 - (ageDays - 14) / 21))
        : (ageDays <= 7 ? -2.2 : ageDays <= 21 ? -1.2 : -0.4);
      for (const id of parts) {
        if (!itemSet.has(id)) continue;
        itemScores[id] = (itemScores[id] ?? 0) + weight;
      }
    }
    for (const id of itemIds) {
      const s = itemScores[id];
      if (!s) continue;
      // Clamp per-item contribution so a single item can't dominate.
      bonus += Math.max(-6, Math.min(6, s));
    }
  }

  return baseScore + bonus;
}

/**
 * Worn-history positive weighting.
 *
 * Per spec, outfits the user has actually worn remain the strongest positive
 * signal — stronger than a "love" tap — because the user has committed to them
 * in real life. This boost is additive on top of reaction adjustments, and is
 * applied by the rotation engine to the exact outfit fingerprint.
 *
 *   +10 if worn in the last 60 days
 *   +6  if worn earlier than that
 *   +2 per additional wear (capped so a single look can't fully dominate)
 *
 * A mild recency damper (−2) kicks in only if worn in the last 2 days, so the
 * user still sees fresh ideas alongside reliable favourites.
 */
export function wornHistoryBoost(
  fingerprint: string,
  wearHistory: WearEntry[],
  today: string,
): number {
  if (!fingerprint || wearHistory.length === 0) return 0;
  const todayMs = new Date(today + 'T12:00:00').getTime();
  const matches = wearHistory.filter(w => w.outfitFingerprint === fingerprint);
  if (matches.length === 0) return 0;

  let mostRecentDays = Infinity;
  for (const w of matches) {
    const ageDays = Math.max(0, Math.round(
      (todayMs - new Date(w.date + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)
    ));
    if (ageDays < mostRecentDays) mostRecentDays = ageDays;
  }

  let boost = mostRecentDays <= 60 ? 10 : 6;
  boost += Math.min(6, Math.max(0, matches.length - 1) * 2);
  if (mostRecentDays <= 2) boost -= 2;
  return boost;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export function toComponent(item: WardrobeItem): OutfitComponent {
  return {
    category: item.category,
    subType: item.subType,
    colorFamily: item.colorFamily,
    owned: true,
    matchedItemId: item.id,
    photoUri: item.photoUri,
  };
}
