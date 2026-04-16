/**
 * Palette-typed colour harmony engine.
 *
 * Classifies a set of colours into harmony types (mono, analogous, complementary,
 * triadic, neutral-bridge, clash) and returns a score signal for the scoring engine.
 *
 * Each colour name maps to an approximate hue on a 12-slot wheel (0-11) and a
 * saturation/lightness class. Neutrals have null hue and act as bridges.
 */

export type PaletteType =
  | 'mono'            // single hue or shades of it
  | 'analogous'       // adjacent hues (within 2 slots)
  | 'complementary'   // opposite hues
  | 'triadic'         // evenly spaced
  | 'neutral-only'    // all neutrals
  | 'neutral-bridge'  // neutrals + 1-2 accent colours
  | 'clash';          // none of the above — disharmonious

// Wheel positions (12-slot colour wheel, 0 = red, goes clockwise)
// Neutrals have hue = null
const COLOR_WHEEL: Record<string, { hue: number | null; neutral: boolean; warm?: boolean }> = {
  // Neutrals
  black:     { hue: null, neutral: true },
  white:     { hue: null, neutral: true },
  grey:      { hue: null, neutral: true },
  cream:     { hue: null, neutral: true, warm: true },
  beige:     { hue: null, neutral: true, warm: true },
  camel:     { hue: null, neutral: true, warm: true },
  brown:     { hue: null, neutral: true, warm: true },
  navy:      { hue: null, neutral: true },
  olive:     { hue: null, neutral: true, warm: true },
  // Chromatic
  red:       { hue: 0,  neutral: false, warm: true },
  coral:     { hue: 1,  neutral: false, warm: true },
  orange:    { hue: 1,  neutral: false, warm: true },
  terracotta:{ hue: 1,  neutral: false, warm: true },
  peach:     { hue: 1,  neutral: false, warm: true },
  mustard:   { hue: 2,  neutral: false, warm: true },
  yellow:    { hue: 2,  neutral: false, warm: true },
  gold:      { hue: 2,  neutral: false, warm: true },
  green:     { hue: 4,  neutral: false },
  emerald:   { hue: 4,  neutral: false },
  blue:      { hue: 7,  neutral: false },
  lavender:  { hue: 9,  neutral: false },
  purple:    { hue: 9,  neutral: false },
  pink:      { hue: 11, neutral: false, warm: true },
  blush:     { hue: 11, neutral: false, warm: true },
  rose:      { hue: 11, neutral: false, warm: true },
  burgundy:  { hue: 0,  neutral: false, warm: true },
};

function getWheel(color: string) {
  return COLOR_WHEEL[color] ?? { hue: null, neutral: true };
}

export function isNeutralColor(color: string): boolean {
  return getWheel(color).neutral;
}

export function isWarmColor(color: string): boolean {
  return getWheel(color).warm === true;
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 12 - diff);
}

/** Classify a palette of colours into a harmony type. */
export function classifyPalette(colors: string[]): PaletteType {
  const uniq = Array.from(new Set(colors));
  const wheeled = uniq.map(getWheel);

  const chromatic = wheeled.filter(w => !w.neutral && w.hue !== null);
  const neutrals = wheeled.filter(w => w.neutral);

  if (chromatic.length === 0) return 'neutral-only';

  // Single chromatic colour → mono (rest are neutrals)
  const uniqueHues = Array.from(new Set(chromatic.map(c => c.hue!)));

  if (uniqueHues.length === 1) {
    return neutrals.length > 0 ? 'neutral-bridge' : 'mono';
  }

  if (uniqueHues.length === 2) {
    const d = hueDistance(uniqueHues[0], uniqueHues[1]);
    if (d <= 2) return neutrals.length > 0 ? 'neutral-bridge' : 'analogous';
    if (d >= 5 && d <= 6) return 'complementary';
    // Mid-distance with neutrals to bridge = still workable
    if (neutrals.length >= 1) return 'neutral-bridge';
    return 'clash';
  }

  if (uniqueHues.length === 3) {
    // Check triadic: all pairs ~4 apart
    const d01 = hueDistance(uniqueHues[0], uniqueHues[1]);
    const d12 = hueDistance(uniqueHues[1], uniqueHues[2]);
    const d02 = hueDistance(uniqueHues[0], uniqueHues[2]);
    const dists = [d01, d12, d02].sort((a, b) => a - b);
    if (dists[0] >= 3 && dists[2] <= 5) return 'triadic';
    // Check analogous: all within a 3-slot arc
    const maxD = Math.max(d01, d12, d02);
    if (maxD <= 2) return 'analogous';
    if (neutrals.length >= 1) return 'neutral-bridge';
    return 'clash';
  }

  // 4+ unique chromatic hues is always busy unless heavily bridged
  return neutrals.length >= chromatic.length ? 'neutral-bridge' : 'clash';
}

/** Score a palette type. Higher = more harmonious. */
export function scorePaletteType(t: PaletteType): number {
  switch (t) {
    case 'mono':           return 6;
    case 'neutral-only':   return 5;
    case 'analogous':      return 5;
    case 'neutral-bridge': return 4;
    case 'complementary':  return 4;
    case 'triadic':        return 3;
    case 'clash':          return 0;
  }
}

/** Legacy harmony check — two colours compatible. Kept for callers that only
 *  reason pairwise. Uses palette classifier under the hood. */
export function colorsHarmonize(c1: string, c2: string): boolean {
  if (c1 === c2) return true;
  const type = classifyPalette([c1, c2]);
  return type !== 'clash';
}

export function isNeutral(color: string): boolean {
  return isNeutralColor(color);
}
