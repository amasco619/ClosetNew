/**
 * Rationale generator — produces short explanations of why an outfit works.
 * Pulls from the strongest signals in the score breakdown (palette type, mood,
 * formality cohesion, complexion harmony).
 */

import { WardrobeItem, OutfitComponent, UserProfile, MoodGoal, Fabric } from './types';
import { classifyPalette } from './colorTheory';
import { inferFabric } from './outfitScoring';

type PalettePhrase = { text: string; number: 'singular' | 'plural' };

const PALETTE_PHRASES: Record<string, PalettePhrase[]> = {
  mono: [
    { text: 'a quiet monochrome', number: 'singular' },
    { text: 'a single-tone palette', number: 'singular' },
    { text: 'tonal layering', number: 'singular' },
  ],
  'neutral-only': [
    { text: 'quiet neutrals', number: 'plural' },
    { text: 'a soft neutral palette', number: 'singular' },
    { text: 'understated neutrals', number: 'plural' },
  ],
  analogous: [
    { text: 'analogous tones', number: 'plural' },
    { text: 'closely related tones', number: 'plural' },
    { text: 'a calm palette', number: 'singular' },
  ],
  'neutral-bridge': [
    { text: 'a neutral-bridged palette', number: 'singular' },
    { text: 'a grounded neutral base', number: 'singular' },
    { text: 'neutral anchors', number: 'plural' },
  ],
  complementary: [
    { text: 'a balanced complementary palette', number: 'singular' },
    { text: 'two tones in balance', number: 'plural' },
    { text: 'steady contrast', number: 'singular' },
  ],
  triadic: [
    { text: 'a triadic accent', number: 'singular' },
    { text: 'three tones in quiet balance', number: 'plural' },
    { text: 'a considered triad', number: 'singular' },
  ],
  clash: [
    { text: 'an unexpected mix', number: 'singular' },
    { text: 'a brave palette', number: 'singular' },
  ],
};

const PALETTE_SINGULAR_ENDINGS = [
  'suits the look.',
  'keeps things balanced.',
  'brings the pieces together.',
];
const PALETTE_PLURAL_ENDINGS = [
  'sit well together.',
  'keep things balanced.',
  'bring the pieces together.',
];

const MAX_RATIONALE_LENGTH = 120;

const FABRIC_SENTENCES: Record<string, string> = {
  leather: 'Leather gives the look a clear anchor.',
  silk: 'Silk softens the finish.',
  satin: 'Satin catches the light.',
  cashmere: 'Cashmere softens the line.',
};

const MOOD_PHRASES: Record<MoodGoal, string[]> = {
  confident: ['looks confident', 'has presence', 'feels quietly authoritative'],
  soft:      ['feels softly put-together', 'feels gentle and considered', 'has a quiet ease'],
  joyful:    ['feels uplifting', 'looks playful', 'feels bright and easy'],
  grounded:  ['feels grounded', 'feels steady and calm', 'feels quietly anchored'],
  romantic:  ['feels romantic', 'has a quiet femininity', 'feels softly romantic'],
  powerful:  ['feels powerful', 'has quiet authority', 'looks strong'],
};

const BODY_FLATTERING_NOTE: Record<string, string> = {
  hourglass: 'The cut follows your shape.',
  pear: 'The cut balances your frame.',
  apple: 'The cut skims with ease.',
  rectangle: 'The cut adds gentle shape.',
  'inverted-triangle': 'The cut softens the line.',
  athletic: 'The fabric falls softly.',
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
 * Friendly subtype label for the focal piece. Avoids naming a colour that may
 * not describe a printed garment.
 */
function describeHero(item: WardrobeItem): string {
  const SUBTYPE_LABELS: Record<string, string> = {
    'leather-jacket': 'leather jacket', 'denim-jacket': 'denim jacket',
    'bomber-jacket': 'bomber', 'trench': 'trench', 'blazer': 'blazer',
    'coat': 'coat', 'peacoat': 'peacoat', 'puffer': 'puffer',
    'slip-dress': 'slip dress', 'cocktail-dress': 'cocktail dress',
    'wrap-dress': 'wrap dress', 'midi-dress': 'midi dress',
    'maxi-dress': 'maxi dress', 'mini-dress': 'mini dress',
    'shirt-dress': 'shirt dress', 'knit-dress': 'knit dress',
    'wide-leg': 'wide-leg trousers', 'pencil-skirt': 'pencil skirt',
    'midi-skirt': 'midi skirt', 'maxi-skirt': 'maxi skirt',
    'mini-skirt': 'mini skirt', 'turtleneck': 'turtleneck',
    'camisole': 'camisole', 'blouse': 'blouse', 'shirt': 'shirt',
    'sweater': 'sweater', 'cardigan': 'cardigan',
    'heels': 'heels', 'stilettos': 'stilettos', 'mules': 'mules',
    'loafers': 'loafers', 'boots': 'boots', 'sneakers': 'sneakers',
    'clutch': 'clutch', 'tote': 'tote', 'shoulder-bag': 'shoulder bag',
    'mini-bag': 'mini bag', 'crossbody': 'crossbody',
  };
  const sub = SUBTYPE_LABELS[item.subType] ?? item.subType.replace(/-/g, ' ');
  return sub;
}

/**
 * Build a one-line rationale for the outfit.
 * Deterministic given the outfit fingerprint so copy is stable day to day.
 *
 * `heroId` (optional) names the focal piece the look was built around so the
 * copy can read like a stylist's note ("The focus is your trench.").
 */
export function generateRationale(
  components: OutfitComponent[],
  items: WardrobeItem[],
  profile: UserProfile,
  mood?: MoodGoal | null,
  heroId?: string,
  undertoneScore?: number,
): string {
  const resolved = components
    .map(c => items.find(i => i.id === c.matchedItemId))
    .filter((i): i is WardrobeItem => Boolean(i));

  const colors = components.map(c => c.colorFamily);
  const paletteType = classifyPalette(colors);
  const fingerprint = components.map(c => c.matchedItemId).filter(Boolean).sort().join('|');
  const seed = stringHash(fingerprint);

  const palettePhrase = pick(PALETTE_PHRASES[paletteType] ?? PALETTE_PHRASES['neutral-bridge'], seed);
  const paletteEndings = palettePhrase.number === 'plural'
    ? PALETTE_PLURAL_ENDINGS
    : PALETTE_SINGULAR_ENDINGS;
  const paletteSentence = `${cap(palettePhrase.text)} ${pick(paletteEndings, seed + 3)}`;

  // Body-type note if we have a flattering silhouette
  const bodyNote = profile.bodyType ? BODY_FLATTERING_NOTE[profile.bodyType] : null;
  const bodySentence = bodyNote && resolved.some(i =>
    i.category === 'dress' || i.subType === 'wrap-dress' || i.subType === 'wide-leg' ||
    i.subType === 'midi-skirt' || i.subType === 'blazer'
  ) ? bodyNote : undefined;

  // Mood phrase, if mood applied
  const moodSentence = mood ? `The look ${pick(MOOD_PHRASES[mood], seed + 7)}.` : undefined;

  // Hero and fabric are separate sentence slots; a focal piece remains the
  // preferred observation when present.
  const effectiveFabric = (i: WardrobeItem): Fabric | undefined => i.fabric ?? inferFabric(i.subType);
  const heroItem = heroId ? resolved.find(i => i.id === heroId) : undefined;
  let focalSentence: string | undefined;
  if (heroItem) {
    focalSentence = `The focus is your ${describeHero(heroItem)}.`;
  } else {
    const statementItems = resolved.filter(i => {
      const f = effectiveFabric(i);
      return f === 'leather' || f === 'silk' || f === 'satin' || f === 'cashmere';
    });
    if (statementItems.length === 1) {
      const f = effectiveFabric(statementItems[0]) as string;
      focalSentence = FABRIC_SENTENCES[f];
    }
  }

  const undertoneSentence =
    undertoneScore !== undefined && undertoneScore >= 2 &&
    profile.undertone && profile.undertone !== 'neutral'
      ? 'The look is in tones that work with your complexion.'
      : undefined;

  const sentences = [paletteSentence];
  // Keep the undertone observation when warranted, then add optional notes
  // only while the complete, deterministic copy remains within the limit.
  const required = undertoneSentence ? [undertoneSentence] : [];
  for (const sentence of required) {
    if (`${sentences.join(' ')} ${sentence}`.length <= MAX_RATIONALE_LENGTH) {
      sentences.push(sentence);
    }
  }
  for (const sentence of [bodySentence, moodSentence, focalSentence]) {
    if (!sentence) continue;
    if (`${sentences.join(' ')} ${sentence}`.length <= MAX_RATIONALE_LENGTH) {
      sentences.push(sentence);
    }
  }

  return sentences.join(' ');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
