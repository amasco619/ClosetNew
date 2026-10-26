import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateRationale } from '../constants/rationale';
import type { MoodGoal, OutfitSet, UserProfile, WardrobeItem } from '../constants/types';
import { getLookRationale } from '../lib/lookCardPresentation';

const PALETTE_TEMPLATES = [
  { colors: ['red'], phrases: ['a quiet monochrome', 'a single-tone palette', 'tonal layering'] },
  { colors: ['black', 'white'], phrases: ['quiet neutrals', 'a soft neutral palette', 'understated neutrals'] },
  { colors: ['red', 'coral'], phrases: ['analogous tones', 'closely related colours', 'a calm colour family'] },
  { colors: ['black', 'red'], phrases: ['a neutral-bridged palette', 'a grounded neutral base', 'neutrals anchoring the colour'] },
  { colors: ['red', 'blue'], phrases: ['a balanced complementary palette', 'two colours that play off each other', 'contrast that holds'] },
  { colors: ['red', 'green', 'blue'], phrases: ['a triadic accent', 'three colours in quiet balance', 'a considered triad'] },
  { colors: ['red', 'lavender'], phrases: ['an unexpected mix', 'a brave palette'] },
];
const MOOD_TEMPLATES: Record<MoodGoal, string[]> = {
  confident: ['reads confident', 'gives presence', 'lands with authority'],
  soft: ['feels softly put-together', 'reads gentle and intentional', 'has a quiet ease'],
  joyful: ['brings a lift', 'reads playful', 'feels bright and easy'],
  grounded: ['feels grounded', 'reads steady and calm', 'is quietly anchored'],
  romantic: ['feels romantic', 'has a quiet femininity', 'reads softly romantic'],
  powerful: ['feels powerful', 'gives command', 'reads strong'],
};
const BODY_TEMPLATES: Record<NonNullable<UserProfile['bodyType']>, string> = {
  hourglass: 'cinches and flows where it should',
  pear: 'balances your shoulders and hips',
  apple: 'skims your midsection with ease',
  rectangle: 'adds gentle shape and movement',
  'inverted-triangle': 'softens the shoulders and widens the line',
  athletic: 'softens and drapes beautifully',
};
const FABRIC_TEMPLATES: Record<string, string> = {
  leather: 'with the leather as the anchor',
  silk: 'letting the silk do the talking',
  satin: 'with the satin catching the light',
  cashmere: 'with the cashmere softening the line',
};
const BODY_TYPES = Object.keys(BODY_TEMPLATES) as NonNullable<UserProfile['bodyType']>[];
const MOODS = Object.keys(MOOD_TEMPLATES) as MoodGoal[];

function profile(bodyType: UserProfile['bodyType'] = null, undertone: UserProfile['undertone'] = null): UserProfile {
  return {
    name: 'A',
    bodyType,
    eyeColor: null,
    skinTone: null,
    undertone,
    styleGoalPrimary: null,
    styleGoalSecondary: null,
    lifestyleWork: 0,
    lifestyleCasual: 0,
    lifestyleEvents: 0,
    lifestyleActive: 0,
    lifestyleBrunch: 0,
    constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
    onboardingComplete: true,
  };
}

function wardrobeItem(id: string, colorFamily: string, fabric?: WardrobeItem['fabric']): WardrobeItem {
  return {
    id,
    photoUri: `file://${id}.jpg`,
    category: 'dress',
    subType: 'wrap-dress',
    colorFamily,
    occasionTags: [],
    seasonTags: [],
    createdAt: '2026-01-01',
    fabric,
  };
}

function grammarIssues(text: string): string[] {
  const issues: string[] = [];
  if (!/^[A-Z].*[.!?]$/.test(text)) issues.push('not a punctuated sentence');
  if (/ {2,}/.test(text)) issues.push('double spaces');
  if (/,\s*(?:[.!?]|$)|[,;:]\s*[.!?]/.test(text)) issues.push('dangling punctuation');
  if (/\b(?:that|and)\s+(?:with|letting)\b/i.test(text)) issues.push('statement-fabric phrase has an invalid connector');
  if (/^(?:Quiet neutrals|Analogous tones|Closely related colours|Neutrals anchoring the colour|Two colours that play off each other|Three colours in quiet balance)\s+that\s+(?:cinches|balances|skims|adds|softens|reads|feels|gives|lands|is|has|brings)\b/i.test(text)) {
    issues.push('plural palette has a singular predicate');
  }
  if (/^[^.!?]+,\s*built around your [^.]+\.$/i.test(text) && !/\b(?:is|are|has|have|reads|feels|brings|gives|lands|balances|softens|cinches)\b/i.test(text.split(', built around')[0])) {
    issues.push('hero-only rationale is a sentence fragment');
  }
  return issues;
}

function testTemplateCoverageAndGrammar() {
  const observed = new Set<string>();
  const rationaleOutputs: string[] = [];
  let longestDisplayed = '';
  const colours = [
    'cream', 'beige', 'camel', 'brown', 'olive', 'navy', 'black', 'white', 'grey',
    'burgundy', 'red', 'pink', 'blush', 'coral', 'orange', 'yellow', 'mustard',
    'green', 'emerald', 'blue', 'lavender', 'purple', 'rose', 'terracotta', 'gold', 'peach',
  ];

  for (let seed = 0; seed < 1200; seed += 1) {
    for (const { colors } of PALETTE_TEMPLATES) {
      const items = colors.map((color, index) =>
        wardrobeItem(`item-${index}-${index === colors.length - 1 ? seed : 0}`, color, index === 0 ? 'silk' : undefined),
      );
      const components = items.map(item => ({
        category: item.category,
        subType: item.subType,
        colorFamily: item.colorFamily,
        owned: true,
        matchedItemId: item.id,
      }));
      const heroId = items[0].id;
      for (const mood of MOODS) {
        const bodyType = BODY_TYPES[(seed + colors.length + MOODS.indexOf(mood)) % BODY_TYPES.length];
        const raw = generateRationale(components, items, profile(bodyType, 'warm'), mood, heroId, 2);
        const displayed = getLookRationale({
          id: `look-${seed}`,
          scenario: 'casual',
          components,
          heroId,
          rationale: raw,
        });
        observed.add(raw);
        rationaleOutputs.push(displayed);
        if (displayed.length > longestDisplayed.length) longestDisplayed = displayed;
      }
      const heroOnly = generateRationale(components, items, profile(), null, heroId);
      const heroOnlyDisplayed = getLookRationale({
        id: `hero-only-${seed}`,
        scenario: 'casual',
        components,
        heroId,
        rationale: heroOnly,
      });
      observed.add(heroOnly);
      rationaleOutputs.push(heroOnlyDisplayed);
      if (heroOnlyDisplayed.length > longestDisplayed.length) longestDisplayed = heroOnlyDisplayed;
    }
  }

  for (const color of colours) {
    const item = wardrobeItem(`color-${color}`, color);
    const component = {
      category: item.category,
      subType: item.subType,
      colorFamily: item.colorFamily,
      owned: true,
      matchedItemId: item.id,
    };
    const raw = generateRationale([component], [item], profile(), null, item.id);
    const displayed = getLookRationale({
      id: `color-look-${color}`,
      scenario: 'casual',
      components: [component],
      heroId: item.id,
      rationale: raw,
    });
    assert.doesNotMatch(displayed, new RegExp(`built around your ${color}\\b`, 'i'));
    rationaleOutputs.push(displayed);
  }

  // Cover all non-hero fabric templates, including the shorter body/mood forms.
  for (let seed = 0; seed < 300; seed += 1) {
    for (const fabric of Object.keys(FABRIC_TEMPLATES) as NonNullable<WardrobeItem['fabric']>[]) {
      const item = wardrobeItem(`fabric-${fabric}-${seed}`, 'black', fabric);
      const component = {
        category: item.category,
        subType: item.subType,
        colorFamily: item.colorFamily,
        owned: true,
        matchedItemId: item.id,
      };
      for (const [bodyType, mood] of [
        [null, null],
        ['pear', null],
        [null, 'soft'],
      ] as const) {
        const raw = generateRationale([component], [item], profile(bodyType, null), mood);
        observed.add(raw);
        const displayed = getLookRationale({
          id: `fabric-look-${fabric}-${seed}`,
          scenario: 'casual',
          components: [component],
          rationale: raw,
        });
        rationaleOutputs.push(displayed);
        if (displayed.length > longestDisplayed.length) longestDisplayed = displayed;
      }
    }
  }

  const expectedPhrases = [
    ...PALETTE_TEMPLATES.flatMap(template => template.phrases),
    ...Object.values(MOOD_TEMPLATES).flat(),
    ...Object.values(BODY_TEMPLATES),
    ...Object.values(FABRIC_TEMPLATES),
    'in tones that work with your complexion',
  ];
  const missing = expectedPhrases.filter(phrase =>
    ![...observed].some(text => text.toLowerCase().includes(phrase.toLowerCase())),
  );
  assert.deepEqual(missing, [], 'the generated samples cover every rationale phrase template');

  for (const text of rationaleOutputs) {
    const mechanicalIssues = grammarIssues(text).filter(issue =>
      issue === 'not a punctuated sentence' || issue === 'double spaces' || issue === 'dangling punctuation',
    );
    assert.deepEqual(mechanicalIssues, [], `rationale formatting: ${text}`);
  }
  const grammarFailureExamples = new Map<string, string>();
  for (const text of rationaleOutputs) {
    for (const issue of grammarIssues(text)) {
      if (!grammarFailureExamples.has(issue)) grammarFailureExamples.set(issue, text);
    }
  }
  const knownGrammarFailures = [...grammarFailureExamples.keys()].filter(issue =>
    issue === 'statement-fabric phrase has an invalid connector' ||
    issue === 'plural palette has a singular predicate' ||
    issue === 'hero-only rationale is a sentence fragment',
  ).sort();
  console.log(`Rationale grammar audit: ${knownGrammarFailures.length} issue types; longest displayed sample ${longestDisplayed.length} characters.`);
  const pluralPaletteFailures = new Map<string, string>();
  const pluralPalettePhrases = [
    'quiet neutrals', 'analogous tones', 'closely related colours',
    'neutrals anchoring the colour', 'two colours that play off each other',
    'three colours in quiet balance',
  ];
  for (const text of rationaleOutputs) {
    const phrase = pluralPalettePhrases.find(value => text.toLowerCase().startsWith(value));
    if (phrase && /\bthat\s+(?:cinches|balances|skims|adds|softens|reads|feels|gives|lands|is|has|brings)\b/i.test(text)) {
      pluralPaletteFailures.set(phrase, text);
    }
  }
  if (pluralPaletteFailures.size) {
    console.log('Plural palette templates with singular predicates:');
    for (const [phrase, text] of pluralPaletteFailures) console.log(`- ${phrase}: ${text}`);
  }
  const fabricConnectorFailures = [...new Set(rationaleOutputs.flatMap(text => {
    const matches = text.match(/\b(?:that|and)\s+(?:with|letting)\s+the\s+(?:leather|silk|satin|cashmere)[^.]+/gi);
    return matches ?? [];
  }))];
  if (fabricConnectorFailures.length) {
    console.log('Statement-fabric connector templates:');
    for (const text of fabricConnectorFailures) console.log(`- ${text}`);
  }
  const fragment = grammarFailureExamples.get('hero-only rationale is a sentence fragment');
  if (fragment) console.log(`Hero-only palette template fragment: ${fragment}`);
  console.log(`Mechanical grammar/punctuation audit covered ${expectedPhrases.length} phrase templates and ${rationaleOutputs.length} generated displays.`);
  assert.deepEqual(knownGrammarFailures, [], 'every generated rationale is a grammatical sentence');

  assert.ok(longestDisplayed.length > 0);
}

function testTierIndependentTextAndSourceLayout() {
  const item = wardrobeItem('hero', 'beige');
  const component = {
    category: item.category,
    subType: item.subType,
    colorFamily: item.colorFamily,
    owned: true,
    matchedItemId: item.id,
  };
  const outfit = {
    id: 'same-look',
    scenario: 'casual',
    components: [component],
    heroId: item.id,
    rationale: 'A quiet monochrome, built around your beige wrap dress.',
  } as OutfitSet;
  const acrossTiers = ['guest', 'free', 'premium'].map(() => getLookRationale(outfit));
  assert.deepEqual(acrossTiers, Array(3).fill('A quiet monochrome, built around your wrap dress.'));

  const screen = readFileSync('app/(tabs)/outfits.tsx', 'utf8');
  const card = screen.slice(screen.indexOf('function OutfitCard'), screen.indexOf('export default function OutfitsScreen'));
  assert.match(card, /scenario\?\.mood \|\| scenario\?\.label/);
  assert.match(card, /getLookRationale\(outfit\)/);
  assert.doesNotMatch(card, /isPremium/);
  assert.match(card, /testID="look-rationale" style=\{styles\.lookRationale\}/);
  assert.doesNotMatch(card, /testID="look-rationale"[^>]*numberOfLines/);
  assert.match(screen, /lookRationale: \{[^}]*fontSize: rs\(13\)[^}]*lineHeight/);
  assert.match(screen, /lookName:\s*\{[\s\S]*?fontStyle: 'italic'/);
  assert.match(card, /size=\{100\}/, 'the grid image and label fit within a 152px half-row');
  assert.match(screen, /lookSlot: \{ width: '50%', height: '50%'/);
  const cellHeight = (340 - 2 * 18) / 2;
  const photoAndLabelHeight = 100 * 1.25 + 7 + 2 + 11;
  assert.ok(photoAndLabelHeight < cellHeight, 'TOP/BOTTOM labels fit below each image before the next row');

  assert.match(screen, /paddingBottom: Platform\.OS === 'ios' \? IOS_TAB_BAR_HEIGHT \+ insets\.bottom \+ 24 : 120/,
    'iOS includes tab-bar plus safe-area clearance; Android keeps the existing 120px spacer');
}

testTierIndependentTextAndSourceLayout();
testTemplateCoverageAndGrammar();
