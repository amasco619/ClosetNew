/**
 * Rationale generator — produces one-sentence explanations of why an outfit works.
 * Pulls from the strongest signals in the score breakdown (palette type, mood,
 * formality cohesion, complexion harmony).
 */

import { WardrobeItem, OutfitComponent, UserProfile, MoodGoal, Fabric } from './types';
import { classifyPalette } from './colorTheory';
import { inferFabric } from './outfitScoring';

const PALETTE_PHRASES: Record<string, string[]> = {
  'mono':           ['a quiet monochrome', 'a single-tone palette', 'tonal layering'],
  'neutral-only':   ['quiet neutrals', 'a soft neutral palette', 'understated neutrals'],
  'analogous':      ['analogous tones', 'closely related colours', 'a calm colour family'],
  'neutral-bridge': ['a neutral-bridged palette', 'a grounded neutral base', 'neutrals anchoring the colour'],
  'complementary':  ['a balanced complementary palette', 'two colours that play off each other', 'contrast that holds'],
  'triadic':        ['a triadic accent', 'three colours in quiet balance', 'a considered triad'],
  'clash':          ['an unexpected mix', 'a brave palette'],
};

const MOOD_PHRASES: Record<MoodGoal, string[]> = {
  confident: ['reads confident', 'gives presence', 'lands with authority'],
  soft:      ['feels softly put-together', 'reads gentle and intentional', 'has a quiet ease'],
  joyful:    ['brings a lift', 'reads playful', 'feels bright and easy'],
  grounded:  ['feels grounded', 'reads steady and calm', 'is quietly anchored'],
  romantic:  ['feels romantic', 'has a quiet femininity', 'reads softly romantic'],
  powerful:  ['feels powerful', 'gives command', 'reads strong'],
};

const BODY_FLATTERING_NOTE: Record<string, string> = {
  hourglass:            'cinches and flows where it should',
  pear:                 'balances your shoulders and hips',
  apple:                'skims your midsection with ease',
  rectangle:            'adds gentle shape and movement',
  'inverted-triangle':  'softens the shoulders and widens the line',
  athletic:             'softens and drapes beautifully',
};

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function stringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Build a one-line rationale for the outfit.
 * Deterministic given the outfit fingerprint so copy is stable day to day.
 */
export function generateRationale(
  components: OutfitComponent[],
  items: WardrobeItem[],
  profile: UserProfile,
  mood?: MoodGoal | null,
): string {
  const resolved = components
    .map(c => items.find(i => i.id === c.matchedItemId))
    .filter((i): i is WardrobeItem => Boolean(i));

  const colors = components.map(c => c.colorFamily);
  const paletteType = classifyPalette(colors);
  const fingerprint = components.map(c => c.matchedItemId).filter(Boolean).sort().join('|');
  const seed = stringHash(fingerprint);

  const palettePhrase = pick(PALETTE_PHRASES[paletteType] ?? PALETTE_PHRASES['neutral-bridge'], seed);

  const parts: string[] = [palettePhrase];

  // Body-type note if we have a flattering silhouette
  const bodyNote = profile.bodyType ? BODY_FLATTERING_NOTE[profile.bodyType] : null;
  if (bodyNote && resolved.some(i =>
    i.category === 'dress' || i.subType === 'wrap-dress' || i.subType === 'wide-leg' ||
    i.subType === 'midi-skirt' || i.subType === 'blazer'
  )) {
    parts.push(bodyNote);
  }

  // Mood phrase, if mood applied
  if (mood) {
    parts.push(pick(MOOD_PHRASES[mood], seed + 7));
  }

  // Texture observation — if exactly one statement-fabric piece anchors the
  // look, name it as the hero. This mirrors the +3 textureHarmony bonus and
  // gives the rationale tactile vocabulary to use.
  // Mirrors textureHarmony's effective-fabric resolution so the phrase fires
  // for backfilled items too (e.g. an unlabelled "leather-jacket" sub-type).
  const STATEMENT_FABRIC_PHRASE: Record<string, string> = {
    leather:  'with the leather as the anchor',
    silk:     'letting the silk do the talking',
    satin:    'with the satin catching the light',
    cashmere: 'with the cashmere softening the line',
  };
  const effectiveFabric = (i: WardrobeItem): Fabric | undefined => i.fabric ?? inferFabric(i.subType);
  const statementItems = resolved.filter(i => {
    const f = effectiveFabric(i);
    return f === 'leather' || f === 'silk' || f === 'satin' || f === 'cashmere';
  });
  if (statementItems.length === 1) {
    const f = effectiveFabric(statementItems[0]) as string;
    parts.push(STATEMENT_FABRIC_PHRASE[f]);
  }

  // Undertone note — only if outfit is strongly in undertone palette
  // (handled implicitly by selection, so we keep the sentence short)

  if (parts.length === 1) {
    return `${cap(parts[0])} — an easy, polished look.`;
  }
  if (parts.length === 2) {
    return `${cap(parts[0])} that ${parts[1]}.`;
  }
  // 3+ parts
  return `${cap(parts[0])} that ${parts[1]} and ${parts[2]}.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
