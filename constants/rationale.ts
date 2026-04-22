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
 * Friendly description for naming the hero in copy. Prefers a colour + sub-type
 * pair ("camel trench", "burgundy slip dress") because that's what a stylist
 * actually says aloud — never "your top.id 7f3" or raw enum values.
 */
function describeHero(item: WardrobeItem): string {
  const COLOR_LABELS: Record<string, string> = {
    'cream': 'cream', 'beige': 'beige', 'camel': 'camel', 'brown': 'brown',
    'olive': 'olive', 'navy': 'navy', 'black': 'black', 'white': 'white',
    'grey': 'grey', 'burgundy': 'burgundy', 'red': 'red', 'pink': 'pink',
    'blush': 'blush', 'coral': 'coral', 'orange': 'orange', 'yellow': 'yellow',
    'mustard': 'mustard', 'green': 'green', 'emerald': 'emerald', 'blue': 'blue',
    'lavender': 'lavender', 'purple': 'purple', 'rose': 'rose',
    'terracotta': 'terracotta', 'gold': 'gold', 'peach': 'peach',
  };
  const SUBTYPE_LABELS: Record<string, string> = {
    'leather-jacket': 'leather jacket', 'denim-jacket': 'denim jacket',
    'bomber-jacket': 'bomber', 'trench': 'trench', 'blazer': 'blazer',
    'coat': 'coat', 'peacoat': 'peacoat', 'puffer': 'puffer',
    'slip-dress': 'slip dress', 'cocktail-dress': 'cocktail dress',
    'wrap-dress': 'wrap dress', 'midi-dress': 'midi dress',
    'maxi-dress': 'maxi dress', 'mini-dress': 'mini dress',
    'shirt-dress': 'shirt dress', 'knit-dress': 'knit dress',
    'wide-leg': 'wide-leg trouser', 'pencil-skirt': 'pencil skirt',
    'midi-skirt': 'midi skirt', 'maxi-skirt': 'maxi skirt',
    'mini-skirt': 'mini skirt', 'turtleneck': 'turtleneck',
    'camisole': 'camisole', 'blouse': 'blouse', 'shirt': 'shirt',
    'sweater': 'sweater', 'cardigan': 'cardigan',
    'heels': 'heels', 'stilettos': 'stilettos', 'mules': 'mules',
    'loafers': 'loafers', 'boots': 'boots', 'sneakers': 'sneakers',
    'clutch': 'clutch', 'tote': 'tote', 'shoulder-bag': 'shoulder bag',
    'mini-bag': 'mini bag', 'crossbody': 'crossbody',
  };
  const color = COLOR_LABELS[item.colorFamily] ?? item.colorFamily.replace(/-/g, ' ');
  const sub = SUBTYPE_LABELS[item.subType] ?? item.subType.replace(/-/g, ' ');
  return `${color} ${sub}`;
}

/**
 * Build a one-line rationale for the outfit.
 * Deterministic given the outfit fingerprint so copy is stable day to day.
 *
 * `heroId` (optional) names the focal piece the look was built around so the
 * copy can read like a stylist's note ("built around your camel trench").
 */
export function generateRationale(
  components: OutfitComponent[],
  items: WardrobeItem[],
  profile: UserProfile,
  mood?: MoodGoal | null,
  heroId?: string,
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

  // Hero / texture observation. When a heroId is provided we name the hero
  // explicitly ("built around your camel trench") — that's the language a
  // stylist actually uses. Falls back to the older statement-fabric phrase
  // when no hero is supplied (legacy callers, generator-driven previews
  // that haven't passed heroId yet) so existing copy still reads naturally.
  const STATEMENT_FABRIC_PHRASE: Record<string, string> = {
    leather:  'with the leather as the anchor',
    silk:     'letting the silk do the talking',
    satin:    'with the satin catching the light',
    cashmere: 'with the cashmere softening the line',
  };
  const effectiveFabric = (i: WardrobeItem): Fabric | undefined => i.fabric ?? inferFabric(i.subType);

  // The hero phrase reads as a coda ("..., built around your camel trench.")
  // rather than a clause ("X that built around Y" — ungrammatical), so we keep
  // it out of the parts array and append it at the end.
  const heroItem = heroId ? resolved.find(i => i.id === heroId) : undefined;
  let heroCoda = '';
  if (heroItem) {
    heroCoda = `built around your ${describeHero(heroItem)}`;
  } else {
    const statementItems = resolved.filter(i => {
      const f = effectiveFabric(i);
      return f === 'leather' || f === 'silk' || f === 'satin' || f === 'cashmere';
    });
    if (statementItems.length === 1) {
      const f = effectiveFabric(statementItems[0]) as string;
      parts.push(STATEMENT_FABRIC_PHRASE[f]);
    }
  }

  // Undertone note — only if outfit is strongly in undertone palette
  // (handled implicitly by selection, so we keep the sentence short)

  let body: string;
  if (parts.length === 1) {
    body = heroCoda
      ? `${cap(parts[0])}, ${heroCoda}.`
      : `${cap(parts[0])} — an easy, polished look.`;
  } else if (parts.length === 2) {
    body = heroCoda
      ? `${cap(parts[0])} that ${parts[1]}, ${heroCoda}.`
      : `${cap(parts[0])} that ${parts[1]}.`;
  } else {
    // 3+ parts
    body = heroCoda
      ? `${cap(parts[0])} that ${parts[1]} and ${parts[2]}, ${heroCoda}.`
      : `${cap(parts[0])} that ${parts[1]} and ${parts[2]}.`;
  }
  return body;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
