/**
 * Perceptual colour utilities — undertone temperature, value contrast,
 * saturation dominance.
 *
 * The combo scorers below operate on the per-item HSL/Lab values captured at
 * upload time (or backfilled from a colour-family centroid for legacy items).
 * They let the engine reason about colour the way a stylist actually does:
 * "this cream is too warm against that icy grey", "everything is mid-tone —
 * the look reads muddy", "two pieces are competing for the eye".
 */

export interface Hsl { h: number; s: number; l: number; }
export interface Lab { L: number; a: number; b: number; }

// ─── Conversions ─────────────────────────────────────────────────────────────

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if      (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else             { r1 = c; b1 = x; }
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

// sRGB → CIE Lab (D65). Standard formulas; values clamped for safety.
export function rgbToLab(r: number, g: number, b: number): Lab {
  const srgb = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  // D65 reference matrix
  const X = (srgb[0] * 0.4124564 + srgb[1] * 0.3575761 + srgb[2] * 0.1804375) / 0.95047;
  const Y = (srgb[0] * 0.2126729 + srgb[1] * 0.7151522 + srgb[2] * 0.0721750) / 1.00000;
  const Z = (srgb[0] * 0.0193339 + srgb[1] * 0.1191920 + srgb[2] * 0.9503041) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function hslToLab(h: number, s: number, l: number): Lab {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToLab(r, g, b);
}

// ─── Colour-family centroids ─────────────────────────────────────────────────
// Representative HSL per family. Used to backfill perceptual values on legacy
// items — the user already chose the family, so a centroid is a faithful
// approximation. New uploads get the precise per-pixel values from the
// classifier; this table only fills the gap for items added before this
// release.
export const FAMILY_CENTROID_HSL: Record<string, Hsl> = {
  // Neutrals (s = 0 except warm beige/cream/camel/brown)
  black:      { h:   0, s: 0.00, l: 0.05 },
  white:      { h:   0, s: 0.00, l: 0.97 },
  grey:       { h:   0, s: 0.00, l: 0.55 },
  silver:     { h:   0, s: 0.00, l: 0.75 },
  cream:      { h:  42, s: 0.45, l: 0.92 },
  beige:      { h:  36, s: 0.30, l: 0.78 },
  camel:      { h:  33, s: 0.45, l: 0.55 },
  brown:      { h:  25, s: 0.50, l: 0.30 },
  khaki:      { h:  50, s: 0.30, l: 0.55 },
  navy:       { h: 220, s: 0.55, l: 0.20 },
  olive:      { h:  75, s: 0.45, l: 0.35 },
  // Warm chromatic
  mustard:    { h:  48, s: 0.75, l: 0.50 },
  gold:       { h:  48, s: 0.85, l: 0.55 },
  red:        { h:   0, s: 0.85, l: 0.45 },
  maroon:     { h:   0, s: 0.70, l: 0.30 },
  burgundy:   { h: 345, s: 0.65, l: 0.30 },
  coral:      { h:  10, s: 0.80, l: 0.65 },
  orange:     { h:  25, s: 0.85, l: 0.55 },
  yellow:     { h:  55, s: 0.90, l: 0.60 },
  terracotta: { h:  15, s: 0.55, l: 0.50 },
  peach:      { h:  25, s: 0.65, l: 0.78 },
  // Cool chromatic
  green:      { h: 140, s: 0.50, l: 0.40 },
  emerald:    { h: 155, s: 0.65, l: 0.40 },
  mint:       { h: 150, s: 0.40, l: 0.80 },
  teal:       { h: 175, s: 0.55, l: 0.40 },
  blue:       { h: 215, s: 0.70, l: 0.50 },
  lavender:   { h: 265, s: 0.40, l: 0.75 },
  purple:     { h: 275, s: 0.55, l: 0.45 },
  pink:       { h: 340, s: 0.55, l: 0.75 },
  blush:      { h:   5, s: 0.40, l: 0.85 },
  rose:       { h: 340, s: 0.50, l: 0.65 },
};

export function centroidHsl(family: string): Hsl {
  return FAMILY_CENTROID_HSL[family] ?? { h: 0, s: 0, l: 0.5 };
}

export function centroidLab(family: string): Lab {
  const { h, s, l } = centroidHsl(family);
  return hslToLab(h, s, l);
}

// ─── Per-colour classification helpers ───────────────────────────────────────

/** True when the colour is essentially achromatic (low saturation OR very dark / very light). */
export function isAchromatic(hsl: Hsl): boolean {
  if (hsl.s < 0.18) return true;
  if (hsl.l < 0.10 || hsl.l > 0.92) return true;
  return false;
}

export type Temperature = 'warm' | 'cool' | 'neutral';

/** Classify a colour by undertone temperature. Achromatics are neutral. */
export function temperatureOf(hsl: Hsl): Temperature {
  if (isAchromatic(hsl)) return 'neutral';
  const h = hsl.h;
  // Warm arc: red/orange/yellow + warm-leaning pink (rose/blush). Cool arc:
  // green/teal/blue/indigo/violet. Magentas (300-330) are intentionally cool —
  // a dusty mauve clashes with terracotta in a way a stylist would feel.
  if (h < 75 || h >= 330) return 'warm';
  if (h >= 75 && h < 165) return 'cool';   // green family is cool-leaning
  if (h >= 165 && h < 280) return 'cool';
  return 'cool'; // 280-330: violets/magentas
}

// ─── Combo-level scorers ─────────────────────────────────────────────────────

/**
 * Reward outfits whose chromatic pieces share an undertone temperature
 * (warm-with-warm or cool-with-cool); tolerate mixed temperatures when neutrals
 * bridge them; penalise mixed-temperature combos with no bridging neutrals.
 */
export function temperatureHarmony(itemHsls: Hsl[]): number {
  if (itemHsls.length < 2) return 0;
  const temps = itemHsls.map(temperatureOf);
  const warm = temps.filter(t => t === 'warm').length;
  const cool = temps.filter(t => t === 'cool').length;
  const neutral = temps.filter(t => t === 'neutral').length;
  if (warm === 0 && cool === 0) return 1;          // all neutrals — clean and quiet
  if (warm === 0 || cool === 0) return 2;          // single-temperature look — cohesive
  // Mixed temperatures.
  if (neutral >= warm + cool) return 0;            // heavily bridged — workable
  if (neutral >= 1) return -1;                     // some bridging — slight clash
  return -2;                                       // unbridged warm/cool clash
}

/**
 * Reward outfits with a pleasing value (lightness) spread. Stylists almost
 * never put together looks where every piece sits in the same mid-tone band —
 * the result reads muddy. A clean spread of light + mid + dark, or even two
 * tones with meaningful contrast, looks deliberate.
 */
export function valueSpread(itemHsls: Hsl[]): number {
  if (itemHsls.length < 2) return 0;
  const ls = itemHsls.map(c => c.l);
  const spread = Math.max(...ls) - Math.min(...ls);
  if (spread < 0.10) return -2;          // all mid-on-mid → muddy
  if (spread < 0.20) return 0;
  if (spread <= 0.50) return 2;          // sweet spot
  if (spread <= 0.70) return 1;          // strong contrast — good for some looks
  return 0;                              // extreme contrast — neither penalised nor rewarded
}

/**
 * Reward outfits with a single saturated focal piece (the rest recede); penalise
 * looks where two or more pieces are high-saturation and competing for the eye.
 */
export function saturationDominance(itemHsls: Hsl[]): number {
  // Only consider chromatic items (achromatics naturally recede)
  const chromatic = itemHsls.filter(c => !isAchromatic(c));
  if (chromatic.length === 0) return 0;
  const sats = chromatic.map(c => c.s).sort((a, b) => b - a);
  const top = sats[0];
  const second = sats[1] ?? 0;
  if (chromatic.length === 1 && top >= 0.55) return 2;     // clean hero
  if (chromatic.length === 1) return 1;                    // single chromatic, soft
  // Multiple chromatic pieces.
  if (top - second >= 0.20) return 1;                      // clear hero, others recede
  if (top >= 0.55 && second >= 0.50) return -2;            // two loud pieces fighting
  if (top >= 0.50 && second >= 0.45) return -1;            // borderline competing
  return 0;
}
