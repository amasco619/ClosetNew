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
  WardrobeItem, OutfitComponent, OutfitSet, OccasionTag, UserProfile,
  MoodGoal, OutfitReaction,
} from './types';
import {
  classifyPalette, scorePaletteType, colorsHarmonize as paletteHarmonize,
  isNeutralColor, isWarmColor,
} from './colorTheory';

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
  casual:    ['t-shirt', 'long-sleeve', 'henley', 'sweater', 'jeans', 'chinos', 'shorts', 'leggings', 'sneakers', 'flats', 'crossbody', 'backpack', 'hoodie', 'cardigan', 'denim-jacket', 'polo-shirt', 'rugby-shirt', 'joggers'],
  work:      ['blouse', 'shirt', 'polo-shirt', 'sweater', 'trousers', 'chinos', 'midi-skirt', 'blazer', 'coat', 'heels', 'flats', 'loafers', 'tote', 'shoulder-bag', 'earrings', 'watch', 'turtleneck'],
  date:      ['blouse', 'camisole', 'midi-dress', 'wrap-dress', 'mini-dress', 'midi-skirt', 'heels', 'mules', 'flats', 'clutch', 'mini-bag', 'crossbody', 'earrings', 'necklace', 'dress'],
  event:     ['cocktail-dress', 'midi-dress', 'maxi-dress', 'blouse', 'wide-leg', 'blazer', 'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet'],
  interview: ['blouse', 'shirt', 'blazer', 'trousers', 'midi-skirt', 'midi-dress', 'coat', 'heels', 'flats', 'loafers', 'tote', 'shoulder-bag', 'earrings', 'watch', 'turtleneck'],
  wedding:   ['midi-dress', 'maxi-dress', 'cocktail-dress', 'wrap-dress', 'midi-skirt', 'blouse', 'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet'],
  travel:    ['t-shirt', 'long-sleeve', 'sweater', 'shirt', 'jeans', 'chinos', 'trousers', 'sneakers', 'flats', 'boots', 'crossbody', 'backpack', 'tote', 'blazer', 'cardigan', 'denim-jacket', 'wide-leg'],
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

export const SCENARIO_FORMALITY: Record<OccasionTag, [number, number]> = {
  casual:    [1, 4],
  travel:    [1, 5],
  date:      [3, 7],
  work:      [4, 7],
  event:     [5, 8],
  interview: [6, 9],
  wedding:   [6, 9],
};

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

  // 2. Formality band (max +2)
  const [minF, maxF] = SCENARIO_FORMALITY[scenario];
  const f = item.formalityLevel ?? 5;
  if (f >= minF && f <= maxF) score += 2;
  else if (f >= minF - 1 && f <= maxF + 1) score += 1;

  // 3. Style goal — colour (max +4)
  const primaryColors = STYLE_PREFERRED_COLORS[profile.styleGoalPrimary ?? ''] ?? [];
  if (primaryColors.includes(item.colorFamily)) score += 3;
  if (profile.styleGoalSecondary) {
    const secColors = STYLE_PREFERRED_COLORS[profile.styleGoalSecondary] ?? [];
    if (secColors.includes(item.colorFamily)) score += 1;
  }

  // 4. Style goal — silhouette (max +2)
  const primarySubtypes = STYLE_GOAL_SUBTYPES[profile.styleGoalPrimary ?? ''];
  if (primarySubtypes?.has(item.subType)) score += 2;

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

  // 11. Mood alignment (max +3)
  if (mood) {
    const moodColors = MOOD_COLORS[mood];
    if (moodColors.has(item.colorFamily)) score += 1;
    const moodSubs = MOOD_SUBTYPES[mood];
    if (moodSubs.has(item.subType)) score += 1;
    if (item.fabric && MOOD_FABRICS[mood].has(item.fabric)) score += 1;
    if (item.mood && item.mood.includes(mood)) score += 1;
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
}

export function scoreOutfitCombo(
  components: OutfitComponent[],
  items?: WardrobeItem[],     // lookup for pattern/fabric/formality signals
  profile?: UserProfile,
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
    const fs = resolved.map(i => i.formalityLevel ?? 5);
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

  const total = completeness + palette + formalityCohesion + patternSafety + contrastMatch + pieces;

  return { total, completeness, palette, paletteType, formalityCohesion, patternSafety, contrastMatch, pieces };
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
