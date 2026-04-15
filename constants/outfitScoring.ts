/**
 * Outfit Confidence Scoring Engine
 *
 * Every outfit is evaluated across 7 dimensions that influence confidence,
 * mood, empowerment, and style identity. Higher scores surface first in the
 * daily rotation, ensuring the user always sees their most flattering looks.
 *
 * Dimensions:
 *  1. Scenario fit — occasion tags + sub-type affinity
 *  2. Formality band — item formality vs scenario expectation
 *  3. Style goal alignment — preferred colors + silhouette types per goal
 *  4. Complexion harmony — undertone → flattering color families
 *  5. Skin depth contrast — very light / very dark skin → high-contrast colors
 *  6. Eye color complementary — colors that make the eye color pop
 *  7. Body type silhouette — cuts/shapes proven to flatter each body type
 *
 * Plus outfit-level bonuses:
 *  - Completeness (shoes, bag, jewelry, outerwear)
 *  - Full color harmony across all pieces
 */

import { WardrobeItem, OutfitComponent, OutfitSet, OccasionTag, UserProfile } from './types';

// ─── Color harmony helpers ────────────────────────────────────────────────────

export const NEUTRAL_COLORS = new Set([
  'black', 'white', 'grey', 'beige', 'cream', 'navy', 'camel', 'brown', 'olive',
]);

export function isNeutral(color: string): boolean {
  return NEUTRAL_COLORS.has(color);
}

export function colorsHarmonize(c1: string, c2: string): boolean {
  return c1 === c2 || isNeutral(c1) || isNeutral(c2);
}

// ─── Scenario sub-type affinity ───────────────────────────────────────────────

export const SCENARIO_AFFINITY: Record<OccasionTag, string[]> = {
  casual:    [
    't-shirt', 'long-sleeve', 'henley', 'sweater', 'jeans', 'chinos', 'shorts',
    'leggings', 'sneakers', 'flats', 'crossbody', 'backpack', 'hoodie', 'cardigan',
    'denim-jacket', 'polo-shirt', 'rugby-shirt', 'joggers',
  ],
  work:      [
    'blouse', 'shirt', 'polo-shirt', 'sweater', 'trousers', 'chinos', 'midi-skirt',
    'blazer', 'coat', 'heels', 'flats', 'loafers', 'tote', 'shoulder-bag',
    'earrings', 'watch', 'turtleneck',
  ],
  date:      [
    'blouse', 'camisole', 'midi-dress', 'wrap-dress', 'mini-dress', 'midi-skirt',
    'heels', 'mules', 'flats', 'clutch', 'mini-bag', 'crossbody', 'earrings',
    'necklace', 'dress',
  ],
  event:     [
    'cocktail-dress', 'midi-dress', 'maxi-dress', 'blouse', 'wide-leg', 'blazer',
    'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet',
  ],
  interview: [
    'blouse', 'shirt', 'blazer', 'trousers', 'midi-skirt', 'midi-dress', 'coat',
    'heels', 'flats', 'loafers', 'tote', 'shoulder-bag', 'earrings', 'watch',
    'turtleneck',
  ],
  wedding:   [
    'midi-dress', 'maxi-dress', 'cocktail-dress', 'wrap-dress', 'midi-skirt',
    'blouse', 'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet',
  ],
  travel:    [
    't-shirt', 'long-sleeve', 'sweater', 'shirt', 'jeans', 'chinos', 'trousers',
    'sneakers', 'flats', 'boots', 'crossbody', 'backpack', 'tote', 'blazer',
    'cardigan', 'denim-jacket', 'wide-leg',
  ],
};

// ─── Style goal → preferred color families ────────────────────────────────────

export const STYLE_PREFERRED_COLORS: Record<string, string[]> = {
  minimal:  ['black', 'white', 'grey', 'beige', 'cream'],
  elevated: ['black', 'navy', 'cream', 'camel', 'burgundy'],
  bold:     ['red', 'blue', 'green', 'pink', 'coral', 'burgundy', 'orange'],
  romantic: ['pink', 'lavender', 'cream', 'beige', 'white', 'blush'],
  classic:  ['navy', 'black', 'white', 'camel', 'grey', 'burgundy'],
  youthful: ['pink', 'blue', 'green', 'red', 'coral', 'lavender', 'yellow'],
};

// ─── Style goal → flattering sub-type silhouettes ─────────────────────────────
// Each goal has an aesthetic "shape vocabulary" beyond color.

export const STYLE_GOAL_SUBTYPES: Record<string, Set<string>> = {
  minimal:  new Set([
    't-shirt', 'long-sleeve', 'wide-leg', 'trousers', 'midi-skirt', 'tote',
    'flats', 'loafers', 'blazer',
  ]),
  elevated: new Set([
    'blouse', 'blazer', 'coat', 'trousers', 'midi-skirt', 'heels', 'tote',
    'shoulder-bag', 'necklace', 'turtleneck',
  ]),
  bold: new Set([
    'maxi-dress', 'midi-dress', 'blazer', 'wide-leg', 'heels', 'earrings',
    'necklace', 'bracelet', 'camisole',
  ]),
  romantic: new Set([
    'midi-dress', 'wrap-dress', 'blouse', 'camisole', 'midi-skirt', 'heels',
    'mules', 'earrings', 'necklace', 'maxi-dress',
  ]),
  classic: new Set([
    'blazer', 'trousers', 'midi-skirt', 'blouse', 'loafers', 'tote', 'watch',
    'shirt', 'coat',
  ]),
  youthful: new Set([
    't-shirt', 'mini-skirt', 'sneakers', 'jeans', 'shorts', 'crossbody',
    'earrings', 'hoodie', 'mini-dress', 'crop-top',
  ]),
};

// ─── Scenario formality bands [min, max] on a 1–10 scale ─────────────────────

export const SCENARIO_FORMALITY: Record<OccasionTag, [number, number]> = {
  casual:    [1, 4],
  travel:    [1, 5],
  date:      [3, 7],
  work:      [4, 7],
  event:     [5, 8],
  interview: [6, 9],
  wedding:   [6, 9],
};

// ─── Complexion — undertone to flattering color families ──────────────────────
// Based on seasonal color theory: cool tones suit cool undertones, etc.

const UNDERTONE_FLATTERING: Record<string, Set<string>> = {
  cool:    new Set([
    'navy', 'burgundy', 'lavender', 'grey', 'white', 'blue', 'pink', 'black',
    'emerald', 'purple', 'rose',
  ]),
  warm:    new Set([
    'camel', 'olive', 'coral', 'cream', 'brown', 'red', 'orange', 'beige',
    'terracotta', 'gold', 'mustard',
  ]),
  neutral: new Set([
    'black', 'navy', 'beige', 'white', 'grey', 'camel', 'pink', 'blue',
    'lavender', 'cream', 'burgundy',
  ]),
};

// ─── Complexion — high-contrast colors for high-contrast skin tones ───────────
// Very light and dark skin tones look striking in high-contrast, saturated colors.

const HIGH_CONTRAST_COLORS = new Set([
  'black', 'white', 'navy', 'red', 'emerald', 'blue', 'burgundy', 'coral',
]);

const HIGH_CONTRAST_SKIN_TONES = new Set([
  'very-light', 'very-dark', 'dark',
]);

// ─── Complexion — eye color complementary accent colors ───────────────────────
// Colors in clothing that visually enhance and frame the eye color.
// Based on complementary color wheel applied to fashion.

const EYE_COMPLEMENTARY: Record<string, Set<string>> = {
  'dark-brown': new Set(['camel', 'brown', 'olive', 'coral', 'cream', 'beige', 'terracotta']),
  'light-brown': new Set(['camel', 'olive', 'green', 'cream', 'coral', 'brown', 'mustard']),
  hazel:         new Set(['olive', 'burgundy', 'green', 'brown', 'purple', 'lavender', 'terracotta']),
  green:         new Set(['burgundy', 'coral', 'brown', 'olive', 'red', 'pink', 'peach']),
  blue:          new Set(['coral', 'orange', 'camel', 'beige', 'brown', 'cream', 'terracotta']),
  grey:          new Set(['lavender', 'pink', 'blue', 'purple', 'navy', 'white', 'rose']),
};

// ─── Body type — flattering garment silhouettes ───────────────────────────────
// Research-backed styling principles for each body shape.

const BODY_TYPE_FLATTERING: Record<string, Set<string>> = {
  hourglass: new Set([
    'wrap-dress', 'midi-dress', 'midi-skirt', 'blouse', 'heels', 'mules',
    'camisole', 'shirt', 'bodycon-dress', 'trousers', 'wide-leg',
  ]),
  pear: new Set([
    'blouse', 'shirt', 'midi-skirt', 'maxi-skirt', 'wide-leg', 'trousers',
    'heels', 'shoulder-bag', 'tote', 'blazer', 'sweater', 'coat',
  ]),
  apple: new Set([
    'maxi-dress', 'wrap-dress', 'midi-dress', 'blouse', 'wide-leg', 'trousers',
    'flats', 'cardigan', 'tote', 'long-sleeve', 'turtleneck',
  ]),
  rectangle: new Set([
    'wrap-dress', 'midi-skirt', 'wide-leg', 'blazer', 'cardigan', 'heels',
    'midi-dress', 'blouse', 'camisole', 'maxi-dress',
  ]),
  'inverted-triangle': new Set([
    'wide-leg', 'maxi-skirt', 'midi-skirt', 'flats', 'sneakers', 'midi-dress',
    'trousers', 'flared', 'maxi-dress',
  ]),
  athletic: new Set([
    'midi-dress', 'wrap-dress', 'midi-skirt', 'blouse', 'camisole', 'heels',
    'mules', 'flared', 'maxi-dress', 'midi-skirt',
  ]),
};

// ─── Constraint checks ────────────────────────────────────────────────────────

export function passesConstraints(item: WardrobeItem, profile: UserProfile): boolean {
  if (profile.constraints.noSleeveless && item.subType === 'tank-top') return false;
  if (profile.constraints.noShortSkirts &&
    (item.subType === 'mini-skirt' || item.subType === 'mini-dress')) return false;
  if ((profile.constraints.maxHeelHeight === 'flat' ||
    profile.constraints.maxHeelHeight === 'low') && item.subType === 'heels') return false;
  return true;
}

// ─── Core item scorer ─────────────────────────────────────────────────────────

/**
 * Scores a single wardrobe item for a given scenario and user profile.
 * Combines 7 confidence dimensions. Higher = more flattering, empowering, aligned.
 *
 * Max theoretical score: ~27 points per item.
 */
export function scoreItemForProfile(
  item: WardrobeItem,
  scenario: OccasionTag,
  profile: UserProfile,
): number {
  let score = 0;

  // ── 1. Scenario fit (max +8) ───────────────────────────────────────────────
  if (item.occasionTags.includes(scenario)) score += 5;
  if (SCENARIO_AFFINITY[scenario].includes(item.subType)) score += 3;

  // ── 2. Formality band (max +2) ────────────────────────────────────────────
  const [minF, maxF] = SCENARIO_FORMALITY[scenario];
  const f = item.formalityLevel ?? 5;
  if (f >= minF && f <= maxF) score += 2;
  else if (f >= minF - 1 && f <= maxF + 1) score += 1;

  // ── 3. Style goal alignment — color (max +4) ──────────────────────────────
  const primaryColors = STYLE_PREFERRED_COLORS[profile.styleGoalPrimary ?? ''] ?? [];
  if (primaryColors.includes(item.colorFamily)) score += 3;
  if (profile.styleGoalSecondary) {
    const secColors = STYLE_PREFERRED_COLORS[profile.styleGoalSecondary] ?? [];
    if (secColors.includes(item.colorFamily)) score += 1;
  }

  // ── 4. Style goal alignment — silhouette (max +2) ─────────────────────────
  const primarySubtypes = STYLE_GOAL_SUBTYPES[profile.styleGoalPrimary ?? ''];
  if (primarySubtypes?.has(item.subType)) score += 2;

  // ── 5. Complexion — undertone harmony (max +4) ───────────────────────────
  // This is the highest-weighted personal dimension: wearing your undertone's
  // colors makes your skin glow and gives an immediate confidence boost.
  const undertoneColors = UNDERTONE_FLATTERING[profile.undertone ?? 'neutral'];
  if (undertoneColors?.has(item.colorFamily)) score += 4;

  // ── 6. Complexion — skin depth contrast (max +1) ──────────────────────────
  if (
    HIGH_CONTRAST_SKIN_TONES.has(profile.skinTone ?? '') &&
    HIGH_CONTRAST_COLORS.has(item.colorFamily)
  ) score += 1;

  // ── 7. Complexion — eye color complementary accent (max +1) ───────────────
  const eyeColors = EYE_COMPLEMENTARY[profile.eyeColor ?? ''];
  if (eyeColors?.has(item.colorFamily)) score += 1;

  // ── 8. Body type silhouette fit (max +3) ──────────────────────────────────
  // Garments that complement the user's body shape create the feeling of
  // being "dressed right" — a key driver of daily confidence.
  const flattering = BODY_TYPE_FLATTERING[profile.bodyType ?? ''];
  if (flattering?.has(item.subType)) score += 3;

  return score;
}

// ─── Outfit combination scorer ────────────────────────────────────────────────

/**
 * Scores the assembled outfit for completeness, harmony, and polish.
 * A complete, harmonious look creates the strongest sense of empowerment.
 *
 * Max theoretical bonus: ~17 points.
 */
export function scoreOutfitCombo(components: OutfitComponent[]): number {
  let score = 0;
  const categories = new Set(components.map(c => c.category));

  // Completeness — each layer of polish adds to the "put-together" feeling
  if (categories.has('shoes'))    score += 4; // shoes are essential to any complete look
  if (categories.has('bag'))      score += 3; // bag frames and completes
  if (categories.has('jewelry'))  score += 3; // jewelry elevates and personalises
  if (categories.has('outerwear')) score += 1; // layering adds intentionality

  // Full color harmony — when all pieces harmonise, the outfit reads as effortless
  const colors = components.map(c => c.colorFamily);
  let allHarmonise = true;
  outer: for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (!colorsHarmonize(colors[i], colors[j])) {
        allHarmonise = false;
        break outer;
      }
    }
  }
  if (allHarmonise) score += 5; // full palette harmony
  else score += 1;               // partial — still workable

  // Multi-piece richness — more owned pieces = more variety and story
  if (components.length >= 4) score += 1;
  if (components.length >= 5) score += 1;

  return score;
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
