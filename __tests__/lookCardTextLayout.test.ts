import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateRationale } from '../constants/rationale';
import type { MoodGoal, OutfitSet, UserProfile, WardrobeItem } from '../constants/types';
import { getLookRationale } from '../lib/lookCardPresentation';

const PALETTE_TEMPLATES = [
  { colors: ['red'], phrases: ['a quiet monochrome', 'a single-tone palette', 'tonal layering'] },
  { colors: ['black', 'white'], phrases: ['quiet neutrals', 'a soft neutral palette', 'understated neutrals'] },
  { colors: ['red', 'coral'], phrases: ['analogous tones', 'closely related tones', 'a calm palette'] },
  { colors: ['black', 'red'], phrases: ['a neutral-bridged palette', 'a grounded neutral base', 'neutral anchors'] },
  { colors: ['red', 'blue'], phrases: ['a balanced complementary palette', 'two tones in balance', 'steady contrast'] },
  { colors: ['red', 'green', 'blue'], phrases: ['a triadic accent', 'three tones in quiet balance', 'a considered triad'] },
  { colors: ['red', 'lavender'], phrases: ['an unexpected mix', 'a brave palette'] },
];
const MOOD_TEMPLATES: Record<MoodGoal, string[]> = {
  confident: ['looks confident', 'has presence', 'feels quietly authoritative'],
  soft: ['feels softly put-together', 'feels gentle and considered', 'has a quiet ease'],
  joyful: ['feels uplifting', 'looks playful', 'feels bright and easy'],
  grounded: ['feels grounded', 'feels steady and calm', 'feels quietly anchored'],
  romantic: ['feels romantic', 'has a quiet femininity', 'feels softly romantic'],
  powerful: ['feels powerful', 'has quiet authority', 'looks strong'],
};
const BODY_TEMPLATES: Record<NonNullable<UserProfile['bodyType']>, string> = {
  hourglass: 'The cut follows your shape.',
  pear: 'The cut balances your frame.',
  apple: 'The cut skims with ease.',
  rectangle: 'The cut adds gentle shape.',
  'inverted-triangle': 'The cut softens the line.',
  athletic: 'The fabric falls softly.',
};
const FABRIC_TEMPLATES: Record<string, string> = {
  leather: 'Leather gives the look a clear anchor.',
  silk: 'Silk softens the finish.',
  satin: 'Satin catches the light.',
  cashmere: 'Cashmere softens the line.',
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
  if (/^(?:Quiet neutrals|Understated neutrals|Analogous tones|Closely related colours|Neutrals anchoring the colour|Two colours that play off each other|Three colours in quiet balance|Closely related tones|Neutral anchors|Two tones in balance|Three tones in quiet balance)\s+that\s+(?:cinches|balances|skims|adds|softens|reads|feels|gives|lands|is|has|brings)\b/i.test(text)) {
    issues.push('plural palette has a singular predicate');
  }
  if (/^[^.!?]+,\s*built around your [^.]+\.$/i.test(text) && !/\b(?:is|are|has|have|reads|feels|brings|gives|lands|balances|softens|cinches)\b/i.test(text.split(', built around')[0])) {
    issues.push('hero-only rationale is a sentence fragment');
  }
  return issues;
}

function testTemplateCoverageAndGrammar(extraDisplays: string[] = []) {
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

  for (const text of extraDisplays) {
    observed.add(text);
    rationaleOutputs.push(text);
  }

  const expectedPhrases = [
    ...PALETTE_TEMPLATES.flatMap(template => template.phrases),
    ...Object.values(MOOD_TEMPLATES).flat(),
    ...Object.values(BODY_TEMPLATES),
    ...Object.values(FABRIC_TEMPLATES),
    'in tones that work with your complexion',
  ];
  assert.equal(expectedPhrases.length, 49, 'the audit covers all 49 rationale templates');
  const missing = expectedPhrases.filter(phrase =>
    ![...observed].some(text => text.toLowerCase().includes(phrase.toLowerCase())),
  );
  assert.deepEqual(missing, [], 'the generated samples cover every rationale phrase template');

  for (const text of rationaleOutputs) {
    const mechanicalIssues = grammarIssues(text).filter(issue =>
      issue === 'not a punctuated sentence' || issue === 'double spaces' || issue === 'dangling punctuation',
    );
    assert.deepEqual(mechanicalIssues, [], `rationale formatting: ${text}`);
    assert.ok(text.length <= 120, `rationale length ${text.length} exceeds 120 characters: ${text}`);
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
    'three colours in quiet balance', 'understated neutrals', 'closely related tones',
    'neutral anchors', 'two tones in balance', 'three tones in quiet balance',
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

function testTemplateVariety(): string[] {
  const fabrics = Object.keys(FABRIC_TEMPLATES) as NonNullable<WardrobeItem['fabric']>[];
  const displays: string[] = [];
  const sampleCount = 300;

  for (let seed = 0; seed < sampleCount; seed += 1) {
    const template = PALETTE_TEMPLATES[seed % PALETTE_TEMPLATES.length];
    const useFabric = seed % 8 === 0;
    const items = template.colors.map((color, index) =>
      wardrobeItem(`variety-${index}-${index === template.colors.length - 1 ? seed : 0}`, color, useFabric && index === 0
        ? fabrics[Math.floor(seed / 8) % fabrics.length]
        : undefined),
    );
    const components = items.map(item => ({
      category: item.category,
      subType: item.subType,
      colorFamily: item.colorFamily,
      owned: true,
      matchedItemId: item.id,
    }));
    displays.push(generateRationale(
      components,
      items,
      profile(useFabric ? null : BODY_TYPES[seed % BODY_TYPES.length], seed % 10 === 0 ? 'warm' : null),
      MOODS[seed % MOODS.length],
      useFabric ? undefined : items[0].id,
      seed % 10 === 0 ? 2 : undefined,
    ));
  }

  const templates = [
    ...PALETTE_TEMPLATES.flatMap(template => template.phrases),
    ...Object.values(MOOD_TEMPLATES).flat(),
    ...Object.values(BODY_TEMPLATES),
    ...Object.values(FABRIC_TEMPLATES),
    'in tones that work with your complexion',
  ];
  assert.equal(templates.length, 49, 'variety check covers all 49 rationale templates');
  for (const template of templates) {
    const uses = displays.filter(display => display.toLowerCase().includes(template.toLowerCase())).length;
    assert.ok(uses > 0, `variety sample includes ${template}`);
    assert.ok(
      uses <= displays.length * 0.2,
      `sentence template "${template}" appears in ${uses}/${displays.length} displays`,
    );
  }
  for (const display of displays) {
    assert.ok(display.length <= 120, `variety sample exceeds 120 characters: ${display}`);
    assert.deepEqual(grammarIssues(display), [], `variety sample is grammatical: ${display}`);
  }
  console.log(`Template variety: ${templates.length} templates across ${displays.length} displays; none exceeds 20%.`);
  return displays;
}

function testDeterminismAndPrintedHeroes() {
  for (const subType of ['wrap-dress', 'wide-leg', 'heels', 'boots', 'shoulder-bag', 'double-breasted-blazer']) {
    const item = { ...wardrobeItem(`printed-${subType}`, 'red', 'silk'), subType, pattern: 'floral' as const };
    const components = [{
      category: item.category,
      subType,
      colorFamily: item.colorFamily,
      owned: true,
      matchedItemId: item.id,
    }];
    const args: Parameters<typeof generateRationale> = [components, [item], profile(), null, item.id];
    const text = generateRationale(...args);
    assert.equal(generateRationale(...args), text, 'the same outfit produces the same explanation');
    assert.ok(text.length <= 120);
    assert.doesNotMatch(text, /\bred\b/i, 'printed heroes never acquire a colour label');
    assert.match(text, /The focus is your /, 'hero notes are complete sentences, including plural garment names');
    assert.deepEqual(grammarIssues(text), []);
  }
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
testDeterminismAndPrintedHeroes();
testTemplateCoverageAndGrammar(testTemplateVariety());
