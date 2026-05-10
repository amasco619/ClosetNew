/**
 * Regression tests for scoreOutfitCombo in constants/outfitScoring.ts.
 *
 * Covers the five dimensions called out in the task:
 *   1. formalityCohesion  — tight spread (+3) vs wide spread (-2)
 *   2. patternSafety      — two bold patterns (-3); one bold (+2)
 *   3. textureHarmony     — one statement fabric (+3), all-flat (-2), two shinies (-2)
 *   4. contrastMatch      — high-contrast profile + dark+light outfit (+2)
 *   5. completeness       — shoes (+4), bag (+3), jewelry (+3) bonuses
 *
 * Run: `npx tsx __tests__/outfitComboScorer.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { scoreOutfitCombo } from '../constants/outfitScoring';
import { generateRationale } from '../constants/rationale';
import type { OutfitComponent, WardrobeItem, UserProfile } from '../constants/types';

// ── Assertion harness ─────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeItem(overrides: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    photoUri: '',
    category: 'top',
    subType: 't-shirt',
    colorFamily: 'black',
    occasionTags: [],
    seasonTags: [],
    formalityLevel: 3,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function makeComponent(
  id: string,
  category: OutfitComponent['category'],
  colorFamily = 'black',
): OutfitComponent {
  return {
    category,
    subType: category === 'top' ? 't-shirt' : category,
    colorFamily,
    owned: true,
    matchedItemId: id,
  };
}

function baseProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Test',
    bodyType: null,
    eyeColor: null,
    skinTone: null,
    undertone: null,
    styleGoalPrimary: null,
    styleGoalSecondary: null,
    lifestyleWork: 40,
    lifestyleCasual: 40,
    lifestyleEvents: 20,
    constraints: {
      noSleeveless: false,
      noShortSkirts: false,
      maxHeelHeight: 'any',
    },
    onboardingComplete: true,
    ...overrides,
  };
}

// ── 1. formalityCohesion ──────────────────────────────────────────────────────

console.log('\nformalityCohesion:');

// Tight spread (≤1) → +3
// blouse = 6, trousers = 6 → spread 0
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'black' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'navy'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top', 'black'),
    makeComponent('b', 'bottom', 'navy'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.formalityCohesion === 3, `tight spread (blouse+trousers, spread=0) → formalityCohesion +3 (got ${result.formalityCohesion})`);
}

// Spread of 2 → +2
// blouse = 6, jeans = 3 → spread 3... let's use blouse(6) + chinos(4) → spread 2
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse', colorFamily: 'black' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'chinos', colorFamily: 'navy'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top', 'black'),
    makeComponent('b', 'bottom', 'navy'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.formalityCohesion === 2, `spread=2 (blouse f=6, chinos f=4) → formalityCohesion +2 (got ${result.formalityCohesion})`);
}

// Wide spread (>3) → -2
// hoodie = 1, cocktail-dress = 7 → spread 6
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',   subType: 'hoodie',          colorFamily: 'grey'  }),
    makeItem({ id: 'b', category: 'dress', subType: 'cocktail-dress',  colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',   'grey'),
    makeComponent('b', 'dress', 'black'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.formalityCohesion === -2, `wide spread (hoodie f=1, cocktail-dress f=7, spread=6) → formalityCohesion -2 (got ${result.formalityCohesion})`);
}

// Spread of 1 → still +3
// blouse = 6, blazer = 6 → spread 0. Use blazer(6) + midi-skirt(5) → spread 1
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'outerwear', subType: 'blazer',     colorFamily: 'black' }),
    makeItem({ id: 'b', category: 'bottom',    subType: 'midi-skirt', colorFamily: 'navy'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'outerwear', 'black'),
    makeComponent('b', 'bottom',    'navy'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.formalityCohesion === 3, `spread=1 (blazer f=6, midi-skirt f=5) → formalityCohesion +3 (got ${result.formalityCohesion})`);
}

// ── 2. patternSafety ──────────────────────────────────────────────────────────

console.log('\npatternSafety:');

// Two bold patterns → -3
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'red',  pattern: 'animal', patternScale: 'large' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'midi-skirt', colorFamily: 'navy', pattern: 'floral', patternScale: 'large' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'red'),
    makeComponent('b', 'bottom', 'navy'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.patternSafety === -3, `two bold patterns (animal + floral) → patternSafety -3 (got ${result.patternSafety})`);
}

// One bold pattern → +2
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',     colorFamily: 'white', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers',   colorFamily: 'black', pattern: 'solid'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.patternSafety === 2, `one bold pattern (floral large) → patternSafety +2 (got ${result.patternSafety})`);
}

// No bold patterns → +2 (solid items)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'white', pattern: 'solid' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'black', pattern: 'solid' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.patternSafety === 2, `no bold patterns (both solid) → patternSafety +2 (got ${result.patternSafety})`);
}

// Two small-pattern items — not bold (small scale, non-animal/floral) → +2
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'shirt',    colorFamily: 'white', pattern: 'stripe', patternScale: 'small' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'navy',  pattern: 'check',  patternScale: 'small' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'navy'),
  ];
  const result = scoreOutfitCombo(components, items);
  // Under the scale-contrast model, two small-scale different-type patterns score 0
  // (acceptable but not ideal — neither a clash nor a hero pattern moment).
  assert(result.patternSafety === 0, `two small-scale patterns (stripe+check) → patternSafety 0 under scale-contrast model (got ${result.patternSafety})`);
}

// ── 3. textureHarmony ─────────────────────────────────────────────────────────

console.log('\ntextureHarmony:');

// One statement fabric (silk) → +3
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fabric: 'silk'   }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool'   }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'cream'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.textureHarmony === 3, `one statement fabric (silk top) → textureHarmony +3 (got ${result.textureHarmony})`);
}

// Two statement fabrics (cashmere + silk) → -3
// cashmere is a statement fabric but NOT in SHINY_FABRICS, so no shiny penalty
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'sweater',  colorFamily: 'cream', fabric: 'cashmere' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'midi-skirt', colorFamily: 'ivory', fabric: 'silk'   }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'cream'),
    makeComponent('b', 'bottom', 'ivory'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.textureHarmony === -3, `two statement fabrics (cashmere + silk) → textureHarmony -3 (got ${result.textureHarmony})`);
}

// All-flat fabrics (cotton + denim) → -2
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 't-shirt', colorFamily: 'white', fabric: 'cotton' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'jeans',   colorFamily: 'blue',  fabric: 'denim'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'blue'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.textureHarmony === -2, `all-flat fabrics (cotton + denim) → textureHarmony -2 (got ${result.textureHarmony})`);
}

// Two shiny fabrics (silk + satin) → statement count = 2 → -3 (statement penalty fires first,
// then shiny penalty is additive: result is -3 + -2 = -5)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'camisole',  colorFamily: 'blush', fabric: 'silk'  }),
    makeItem({ id: 'b', category: 'dress',  subType: 'slip-dress', colorFamily: 'ivory', fabric: 'satin' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',   'blush'),
    makeComponent('b', 'dress', 'ivory'),
  ];
  const result = scoreOutfitCombo(components, items);
  // silk + satin: 2 statement fabrics → -3; 2 shiny → -2; total = -5
  assert(result.textureHarmony === -5, `two shiny statement fabrics (silk + satin) → textureHarmony -5 (statement -3 + shiny -2) (got ${result.textureHarmony})`);
}

// One statement + one shiny (leather-jacket only shiny statement) alongside flat →
// statement count=1 → +3; shiny count=1 → no shiny penalty → +3
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',      subType: 't-shirt',       colorFamily: 'white', fabric: 'cotton'  }),
    makeItem({ id: 'b', category: 'outerwear', subType: 'leather-jacket', colorFamily: 'black', fabric: 'leather' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',      'white'),
    makeComponent('b', 'outerwear', 'black'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.textureHarmony === 3, `cotton tee + leather jacket (one statement) → textureHarmony +3 (got ${result.textureHarmony})`);
}

// ── 4. contrastMatch ──────────────────────────────────────────────────────────

console.log('\ncontrastMatch:');

// High-contrast profile + dark (navy) and light (cream) combo → +2
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'navy'),
    makeComponent('b', 'bottom', 'cream'),
  ];
  const prof = baseProfile({ contrastLevel: 'high' });
  const result = scoreOutfitCombo(components, [], prof);
  assert(result.contrastMatch === 2, `high-contrast profile + navy+cream outfit → contrastMatch +2 (got ${result.contrastMatch})`);
}

// High-contrast profile + all-dark outfit → no dark+light combo → 0
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'navy'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const prof = baseProfile({ contrastLevel: 'high' });
  const result = scoreOutfitCombo(components, [], prof);
  assert(result.contrastMatch === 0, `high-contrast profile + all-dark outfit → contrastMatch 0 (got ${result.contrastMatch})`);
}

// Low-contrast profile + no dark+light combo → +1
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'camel'),
    makeComponent('b', 'bottom', 'beige'),
  ];
  const prof = baseProfile({ contrastLevel: 'low' });
  const result = scoreOutfitCombo(components, [], prof);
  assert(result.contrastMatch === 1, `low-contrast profile + no-contrast outfit → contrastMatch +1 (got ${result.contrastMatch})`);
}

// Low-contrast profile + high-contrast outfit → 0
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'white'),
  ];
  const prof = baseProfile({ contrastLevel: 'low' });
  const result = scoreOutfitCombo(components, [], prof);
  assert(result.contrastMatch === 0, `low-contrast profile + black+white outfit → contrastMatch 0 (got ${result.contrastMatch})`);
}

// Medium-contrast profile → always +1
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'navy'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const prof = baseProfile({ contrastLevel: 'medium' });
  const result = scoreOutfitCombo(components, [], prof);
  assert(result.contrastMatch === 1, `medium-contrast profile → contrastMatch +1 (got ${result.contrastMatch})`);
}

// No contrastLevel on profile → 0 (dimension not applicable)
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'white'),
  ];
  const prof = baseProfile();
  const result = scoreOutfitCombo(components, [], prof);
  assert(result.contrastMatch === 0, `no contrastLevel on profile → contrastMatch 0 (got ${result.contrastMatch})`);
}

// ── 5. completeness bonuses ───────────────────────────────────────────────────

console.log('\ncompleteness bonuses:');

// Baseline: top + bottom only → completeness 0
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'navy'),
  ];
  const result = scoreOutfitCombo(components);
  assert(result.completeness === 0, `top + bottom only → completeness 0 (got ${result.completeness})`);
}

// Adding shoes → completeness +4
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'navy'),
    makeComponent('c', 'shoes',  'black'),
  ];
  const result = scoreOutfitCombo(components);
  assert(result.completeness === 4, `top + bottom + shoes → completeness 4 (got ${result.completeness})`);
}

// Adding bag → completeness +3
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'navy'),
    makeComponent('c', 'bag',    'black'),
  ];
  const result = scoreOutfitCombo(components);
  assert(result.completeness === 3, `top + bottom + bag → completeness 3 (got ${result.completeness})`);
}

// Adding jewelry → completeness +3
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'navy'),
    makeComponent('c', 'jewelry', 'gold'),
  ];
  const result = scoreOutfitCombo(components);
  assert(result.completeness === 3, `top + bottom + jewelry → completeness 3 (got ${result.completeness})`);
}

// Full look: shoes + bag + jewelry + outerwear → completeness 4+3+3+1 = 11
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',      'black'),
    makeComponent('b', 'bottom',   'navy'),
    makeComponent('c', 'shoes',    'black'),
    makeComponent('d', 'bag',      'black'),
    makeComponent('e', 'jewelry',  'gold'),
    makeComponent('f', 'outerwear','camel'),
  ];
  const result = scoreOutfitCombo(components);
  assert(result.completeness === 11, `full look (shoes+bag+jewelry+outerwear) → completeness 11 (got ${result.completeness})`);
}

// Shoes only (no bag, no jewelry) → exactly 4
{
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',   'white'),
    makeComponent('b', 'shoes', 'black'),
  ];
  const result = scoreOutfitCombo(components);
  assert(result.completeness === 4, `top + shoes only → completeness 4 (got ${result.completeness})`);
}

// ── 6. total aggregates all dimensions correctly ──────────────────────────────

console.log('\ntotal aggregation:');

// Build a well-controlled outfit and verify total = sum of all breakdown fields.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'black', fabric: 'silk',   pattern: 'solid' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'white', fabric: 'wool',   pattern: 'solid' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'heels',    colorFamily: 'black', fabric: undefined, pattern: 'solid' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'white'),
    makeComponent('c', 'shoes',  'black'),
  ];
  const prof = baseProfile({ contrastLevel: 'high' });
  const br = scoreOutfitCombo(components, items, prof);
  const expectedTotal =
    br.completeness + br.palette + br.formalityCohesion + br.patternSafety +
    br.contrastMatch + br.pieces + br.proportionBalance + br.metalCohesion +
    br.temperatureHarmony + br.valueSpread + br.saturationDominance + br.textureHarmony +
    br.bodyTypeProportion + br.hemlineShoeHarmony;
  assert(br.total === expectedTotal, `total equals sum of all breakdown dimensions (got total=${br.total}, sum=${expectedTotal})`);
}

// ── 7. bodyTypeProportion ─────────────────────────────────────────────────────

console.log('\nbodyTypeProportion:');

// Pear + wide-leg bottom + loose top → −2 (volume on volume, wrong for this body type)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'white', fit: 'loose'   }),
    makeItem({ id: 'b', category: 'bottom', subType: 'wide-leg', colorFamily: 'black', fit: 'regular' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const prof = baseProfile({ bodyType: 'pear' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.bodyTypeProportion === -2, `pear + wide-leg + loose top → bodyTypeProportion -2 (got ${result.bodyTypeProportion})`);
}

// Pear + wide-leg bottom + slim top → +2 (correct: slim top balances wide hip)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'white', fit: 'slim'    }),
    makeItem({ id: 'b', category: 'bottom', subType: 'wide-leg', colorFamily: 'black', fit: 'regular' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const prof = baseProfile({ bodyType: 'pear' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.bodyTypeProportion === 2, `pear + wide-leg + slim top → bodyTypeProportion +2 (got ${result.bodyTypeProportion})`);
}

// Apple + maxi-skirt + tailored top → +2 (correct pairing for apple body)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',     colorFamily: 'cream', fit: 'tailored' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'maxi-skirt', colorFamily: 'black', fit: 'regular'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'cream'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const prof = baseProfile({ bodyType: 'apple' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.bodyTypeProportion === 2, `apple + maxi-skirt + tailored top → bodyTypeProportion +2 (got ${result.bodyTypeProportion})`);
}

// Inverted-triangle + A-line skirt → +1 (balances broad shoulders with volume below)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',       colorFamily: 'navy'  }),
    makeItem({ id: 'b', category: 'bottom', subType: 'flared-skirt', colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'navy'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const prof = baseProfile({ bodyType: 'inverted-triangle' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.bodyTypeProportion === 1, `inverted-triangle + A-line skirt → bodyTypeProportion +1 (got ${result.bodyTypeProportion})`);
}

// No body type set → 0 (scorer is a no-op when bodyType is null)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'white', fit: 'loose' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'wide-leg', colorFamily: 'black'               }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const prof = baseProfile({ bodyType: null });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.bodyTypeProportion === 0, `null bodyType → bodyTypeProportion 0 (got ${result.bodyTypeProportion})`);
}

// ── 8. hemlineShoeHarmony ─────────────────────────────────────────────────────

console.log('\nhemlineShoeHarmony:');

// Ankle boots + midi skirt → −2 (classic leg-shortener)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',      colorFamily: 'white' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'midi-skirt',  colorFamily: 'black' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'ankle-boots', colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
    makeComponent('c', 'shoes',  'black'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.hemlineShoeHarmony === -2, `ankle-boots + midi-skirt → hemlineShoeHarmony -2 (got ${result.hemlineShoeHarmony})`);
}

// Ankle boots + mini skirt → +1 (gap shows leg, reads intentional)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',      colorFamily: 'white' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'mini-skirt',  colorFamily: 'black' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'ankle-boots', colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
    makeComponent('c', 'shoes',  'black'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.hemlineShoeHarmony === 1, `ankle-boots + mini-skirt → hemlineShoeHarmony +1 (got ${result.hemlineShoeHarmony})`);
}

// Heels + midi skirt → +1 (classic proportion harmony)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',     colorFamily: 'white' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'midi-skirt', colorFamily: 'black' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'heels',      colorFamily: 'nude'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
    makeComponent('c', 'shoes',  'nude'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.hemlineShoeHarmony === 1, `heels + midi-skirt → hemlineShoeHarmony +1 (got ${result.hemlineShoeHarmony})`);
}

// Sneakers + midi skirt → 0 (flat shoe, no hemline rule applies)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',     colorFamily: 'white' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'midi-skirt', colorFamily: 'black' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'sneakers',   colorFamily: 'white' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
    makeComponent('c', 'shoes',  'white'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.hemlineShoeHarmony === 0, `sneakers + midi-skirt → hemlineShoeHarmony 0 (got ${result.hemlineShoeHarmony})`);
}

// Ankle boots + midi dress → −2 (same leg-shortener, via dress category)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'dress', subType: 'midi-dress',  colorFamily: 'navy'  }),
    makeItem({ id: 'b', category: 'shoes', subType: 'ankle-boots', colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'dress', 'navy'),
    makeComponent('b', 'shoes', 'black'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.hemlineShoeHarmony === -2, `ankle-boots + midi-dress → hemlineShoeHarmony -2 (got ${result.hemlineShoeHarmony})`);
}

// ── 9. Pattern scale contrast (extended cases) ────────────────────────────────

console.log('\npattern scale contrast (new rules):');

// One large + one small, different types → +1 (intentional scale contrast)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'white', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'navy',  pattern: 'stripe', patternScale: 'small' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'navy'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.patternSafety === 1, `large floral + small stripe → patternSafety +1 (scale contrast) (got ${result.patternSafety})`);
}

// Two items same pattern type → −3 (two florals — reads costume regardless of scale)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',     colorFamily: 'pink', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'midi-skirt', colorFamily: 'blue', pattern: 'floral', patternScale: 'small' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'pink'),
    makeComponent('b', 'bottom', 'blue'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.patternSafety === -3, `two florals (large + small) → patternSafety -3 (same type) (got ${result.patternSafety})`);
}

// Small accent pattern (single) → +1 (not bold enough to be a hero, but fine)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'shirt',    colorFamily: 'white', pattern: 'stripe', patternScale: 'small' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'navy',  pattern: 'solid'                         }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'navy'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.patternSafety === 1, `one small-scale pattern + solid → patternSafety +1 (got ${result.patternSafety})`);
}

// ── 10. undertoneHarmony ──────────────────────────────────────────────────────

console.log('\nundertoneHarmony:');

// (a) Full warm palette — top + bottom both in warm UNDERTONE_FLATTERING → +2
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'camel'     }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'terracotta' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'camel'),
    makeComponent('b', 'bottom', 'terracotta'),
  ];
  const prof = baseProfile({ undertone: 'warm' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.undertoneHarmony === 2, `warm undertone + all-warm palette (camel + terracotta) → undertoneHarmony +2 (got ${result.undertoneHarmony})`);
}

// (b) Neutral-anchored warm — one warm piece + black (true neutral) → +1
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'coral' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'coral'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const prof = baseProfile({ undertone: 'warm' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.undertoneHarmony === 1, `warm undertone + coral top + black trousers → undertoneHarmony +1 (got ${result.undertoneHarmony})`);
}

// (c) Clashing cool piece on warm undertone → −1
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'camel'  }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'lavender' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'camel'),
    makeComponent('b', 'bottom', 'lavender'),
  ];
  const prof = baseProfile({ undertone: 'warm' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.undertoneHarmony === -1, `warm undertone + lavender bottom → undertoneHarmony -1 (got ${result.undertoneHarmony})`);
}

// (d) null undertone → 0 (no-op)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'camel'     }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'terracotta' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'camel'),
    makeComponent('b', 'bottom', 'terracotta'),
  ];
  const prof = baseProfile({ undertone: null });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.undertoneHarmony === 0, `null undertone → undertoneHarmony 0 (got ${result.undertoneHarmony})`);
}

// (e) neutral undertone → 0 (no-op — neutral users are never penalised)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'coral'    }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'lavender' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'coral'),
    makeComponent('b', 'bottom', 'lavender'),
  ];
  const prof = baseProfile({ undertone: 'neutral' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.undertoneHarmony === 0, `neutral undertone → undertoneHarmony 0 (got ${result.undertoneHarmony})`);
}

// (f) Full cool palette → +2
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'lavender' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'navy'     }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'lavender'),
    makeComponent('b', 'bottom', 'navy'),
  ];
  const prof = baseProfile({ undertone: 'cool' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.undertoneHarmony === 2, `cool undertone + all-cool palette (lavender + navy) → undertoneHarmony +2 (got ${result.undertoneHarmony})`);
}

// (g) Clash cap — two clashing pieces on cool undertone → −2 (capped, not −3)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'camel'     }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'terracotta' }),
    makeItem({ id: 'c', category: 'dress',  subType: 'midi-dress', colorFamily: 'orange'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'camel'),
    makeComponent('b', 'bottom', 'terracotta'),
    makeComponent('c', 'dress',  'orange'),
  ];
  const prof = baseProfile({ undertone: 'cool' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.undertoneHarmony === -2, `cool undertone + 3 clashing warm pieces → undertoneHarmony −2 (capped) (got ${result.undertoneHarmony})`);
}

// ── 10b. Updated aggregation test (includes undertoneHarmony) ─────────────────

console.log('\ntotal aggregation (with undertoneHarmony):');

{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'black', fabric: 'silk',   pattern: 'solid' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'white', fabric: 'wool',   pattern: 'solid' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'heels',    colorFamily: 'black', fabric: undefined, pattern: 'solid' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'white'),
    makeComponent('c', 'shoes',  'black'),
  ];
  const prof = baseProfile({ contrastLevel: 'high', undertone: 'cool' });
  const br = scoreOutfitCombo(components, items, prof);
  const expectedTotal =
    br.completeness + br.palette + br.formalityCohesion + br.patternSafety +
    br.contrastMatch + br.pieces + br.proportionBalance + br.metalCohesion +
    br.temperatureHarmony + br.valueSpread + br.saturationDominance + br.textureHarmony +
    br.bodyTypeProportion + br.hemlineShoeHarmony + br.undertoneHarmony;
  assert(br.total === expectedTotal, `total equals sum of all breakdown dimensions including undertoneHarmony (got total=${br.total}, sum=${expectedTotal})`);
}

// ── 11. heightProportion ──────────────────────────────────────────────────────

console.log('\nheightProportion:');

// (a) Petite + monochromatic top/bottom → +2
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'black' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'black'),
  ];
  const prof = baseProfile({ heightBand: 'petite' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.heightProportion === 2, `petite + monochromatic (black/black) → heightProportion +2 (got ${result.heightProportion})`);
}

// (b) Petite + long loose blazer + wide-leg bottom → −1
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'outerwear', subType: 'blazer',   colorFamily: 'black', fit: 'loose' }),
    makeItem({ id: 'b', category: 'bottom',    subType: 'wide-leg', colorFamily: 'navy'               }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'outerwear', 'black'),
    makeComponent('b', 'bottom',    'navy'),
  ];
  const prof = baseProfile({ heightBand: 'petite' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.heightProportion === -1, `petite + loose blazer + wide-leg → heightProportion -1 (got ${result.heightProportion})`);
}

// (c) Petite + maxi skirt + flats → −1
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',     colorFamily: 'white' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'maxi-skirt', colorFamily: 'black' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'flats',      colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
    makeComponent('c', 'shoes',  'black'),
  ];
  const prof = baseProfile({ heightBand: 'petite' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.heightProportion === -1, `petite + maxi-skirt + flats → heightProportion -1 (got ${result.heightProportion})`);
}

// (d) Petite + horizontal wide stripe on top → −1
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'white', pattern: 'stripe', patternScale: 'large' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'navy'                                            }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'navy'),
  ];
  const prof = baseProfile({ heightBand: 'petite' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.heightProportion === -1, `petite + wide-stripe top → heightProportion -1 (got ${result.heightProportion})`);
}

// (e) Tall + maxi dress → +1
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'dress', subType: 'maxi-dress', colorFamily: 'navy' }),
    makeItem({ id: 'b', category: 'shoes', subType: 'heels',      colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'dress', 'navy'),
    makeComponent('b', 'shoes', 'black'),
  ];
  const prof = baseProfile({ heightBand: 'tall' });
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.heightProportion === 1, `tall + maxi-dress → heightProportion +1 (got ${result.heightProportion})`);
}

// (f) null heightBand → 0 (no-op)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',     colorFamily: 'white' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'maxi-skirt', colorFamily: 'black' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'flats',      colorFamily: 'black' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'white'),
    makeComponent('b', 'bottom', 'black'),
    makeComponent('c', 'shoes',  'black'),
  ];
  const prof = baseProfile({ heightBand: null } as Partial<UserProfile>);
  const result = scoreOutfitCombo(components, items, prof);
  assert(result.heightProportion === 0, `null heightBand → heightProportion 0 (got ${result.heightProportion})`);
}

// ── 11b. Aggregation test (includes heightProportion) ─────────────────────────

console.log('\ntotal aggregation (with heightProportion):');

{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'black', fabric: 'silk',   pattern: 'solid' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'white', fabric: 'wool',   pattern: 'solid' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'heels',    colorFamily: 'black', fabric: undefined, pattern: 'solid' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'white'),
    makeComponent('c', 'shoes',  'black'),
  ];
  const prof = baseProfile({ contrastLevel: 'high', undertone: 'cool', heightBand: 'petite' });
  const br = scoreOutfitCombo(components, items, prof);
  const expectedTotal =
    br.completeness + br.palette + br.formalityCohesion + br.patternSafety +
    br.contrastMatch + br.pieces + br.proportionBalance + br.metalCohesion +
    br.temperatureHarmony + br.valueSpread + br.saturationDominance + br.textureHarmony +
    br.bodyTypeProportion + br.hemlineShoeHarmony + br.heightProportion + br.undertoneHarmony;
  assert(br.total === expectedTotal, `total equals sum including heightProportion (got total=${br.total}, sum=${expectedTotal})`);
}

// ── 12. necklineJewelry ───────────────────────────────────────────────────────

console.log('\nnecklineJewelry:');

function makeJewelryItem(id: string, subType: string): WardrobeItem {
  return makeItem({ id, category: 'jewelry', subType, colorFamily: 'gold' });
}
function makeJewelryComponent(id: string, subType: string): OutfitComponent {
  return { category: 'jewelry', subType, colorFamily: 'gold', owned: true, matchedItemId: id };
}

// (a) Turtleneck + necklace → −2 (necklace physically blocked)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',     subType: 'turtleneck', colorFamily: 'black', neckline: 'turtleneck' }),
    makeJewelryItem('b', 'necklace'),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top', 'black'),
    makeJewelryComponent('b', 'necklace'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.necklineJewelry === -2, `turtleneck + necklace → necklineJewelry -2 (got ${result.necklineJewelry})`);
}

// (b) Turtleneck + earrings → +1 (earrings frame face when neck is covered)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',     subType: 'turtleneck', colorFamily: 'black', neckline: 'turtleneck' }),
    makeJewelryItem('b', 'earrings'),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top', 'black'),
    makeJewelryComponent('b', 'earrings'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.necklineJewelry === 1, `turtleneck + earrings → necklineJewelry +1 (got ${result.necklineJewelry})`);
}

// (c) V-neck + necklace → +1 (pendant follows the V-line beautifully)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',     subType: 'blouse', colorFamily: 'white', neckline: 'v-neck' }),
    makeJewelryItem('b', 'necklace'),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top', 'white'),
    makeJewelryComponent('b', 'necklace'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.necklineJewelry === 1, `v-neck + necklace → necklineJewelry +1 (got ${result.necklineJewelry})`);
}

// (d) Off-shoulder + necklace → −1 (clutters the collarbone area)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',     subType: 'blouse', colorFamily: 'blush', neckline: 'off-shoulder' }),
    makeJewelryItem('b', 'necklace'),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top', 'blush'),
    makeJewelryComponent('b', 'necklace'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.necklineJewelry === -1, `off-shoulder + necklace → necklineJewelry -1 (got ${result.necklineJewelry})`);
}

// (e) No neckline data → 0 (fully backward compatible)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',     subType: 'blouse', colorFamily: 'white' }),
    makeJewelryItem('b', 'necklace'),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top', 'white'),
    makeJewelryComponent('b', 'necklace'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.necklineJewelry === 0, `no neckline data → necklineJewelry 0 (got ${result.necklineJewelry})`);
}

// (f) Collared top + earrings → +1 (earrings work without cluttering collar)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',     subType: 'shirt', colorFamily: 'white', neckline: 'collared' }),
    makeJewelryItem('b', 'earrings'),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top', 'white'),
    makeJewelryComponent('b', 'earrings'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.necklineJewelry === 1, `collared + earrings → necklineJewelry +1 (got ${result.necklineJewelry})`);
}

// (g) Turtleneck + necklace + earrings → −2 + 1 = −1 (additive across jewelry pieces)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',     subType: 'turtleneck', colorFamily: 'black', neckline: 'turtleneck' }),
    makeJewelryItem('b', 'necklace'),
    makeJewelryItem('c', 'earrings'),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top', 'black'),
    makeJewelryComponent('b', 'necklace'),
    makeJewelryComponent('c', 'earrings'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.necklineJewelry === -1, `turtleneck + necklace + earrings → necklineJewelry -1 (additive: -2+1) (got ${result.necklineJewelry})`);
}

// ── 12b. Aggregation test (includes necklineJewelry) ─────────────────────────

console.log('\ntotal aggregation (with necklineJewelry):');

{
  const items: WardrobeItem[] = [
    makeItem({ id: 'a', category: 'top',    subType: 'blouse',   colorFamily: 'black', fabric: 'silk',   pattern: 'solid', neckline: 'v-neck' }),
    makeItem({ id: 'b', category: 'bottom', subType: 'trousers', colorFamily: 'white', fabric: 'wool',   pattern: 'solid' }),
    makeItem({ id: 'c', category: 'shoes',  subType: 'heels',    colorFamily: 'black', fabric: undefined, pattern: 'solid' }),
    makeJewelryItem('d', 'necklace'),
  ];
  const components: OutfitComponent[] = [
    makeComponent('a', 'top',    'black'),
    makeComponent('b', 'bottom', 'white'),
    makeComponent('c', 'shoes',  'black'),
    makeJewelryComponent('d', 'necklace'),
  ];
  const prof = baseProfile({ contrastLevel: 'high', undertone: 'cool', heightBand: 'petite' });
  const br = scoreOutfitCombo(components, items, prof);
  const expectedTotal =
    br.completeness + br.palette + br.formalityCohesion + br.patternSafety +
    br.contrastMatch + br.pieces + br.proportionBalance + br.metalCohesion +
    br.temperatureHarmony + br.valueSpread + br.saturationDominance + br.textureHarmony +
    br.bodyTypeProportion + br.hemlineShoeHarmony + br.heightProportion +
    br.undertoneHarmony + br.necklineJewelry;
  assert(br.total === expectedTotal, `total equals sum including necklineJewelry (got total=${br.total}, sum=${expectedTotal})`);
}

// ── 13. generateRationale — undertone phrase presence ─────────────────────────

console.log('\ngenerateRationale undertone phrase:');

// Helper: build a minimal item list + component list from the makeItem factory
function makeRationaleFixture(colorFamily: string): { items: WardrobeItem[]; comps: OutfitComponent[] } {
  const items: WardrobeItem[] = [
    makeItem({ id: 'x', category: 'top',    subType: 'blouse',   colorFamily }),
    makeItem({ id: 'y', category: 'bottom', subType: 'trousers', colorFamily: 'black' }),
  ];
  const comps: OutfitComponent[] = [
    makeComponent('x', 'top',    colorFamily),
    makeComponent('y', 'bottom', 'black'),
  ];
  return { items, comps };
}

// (a) undertoneScore >= 2 with warm undertone → phrase present (low-parts scenario)
{
  const { items, comps } = makeRationaleFixture('camel');
  const prof = baseProfile({ undertone: 'warm' });
  const rationale = generateRationale(comps, items, prof, null, undefined, 2);
  assert(
    rationale.includes('in tones that work with your complexion'),
    `undertoneScore=2 + warm undertone → undertone phrase present (got: "${rationale}")`,
  );
}

// (b) undertoneScore >= 2 with cool undertone + body/mood parts (high-parts scenario — 3 parts already)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'p', category: 'dress', subType: 'midi-skirt', colorFamily: 'navy' }),
    makeItem({ id: 'q', category: 'shoes', subType: 'heels',      colorFamily: 'black' }),
  ];
  const comps: OutfitComponent[] = [
    makeComponent('p', 'dress', 'navy'),
    makeComponent('q', 'shoes', 'black'),
  ];
  const prof = baseProfile({ undertone: 'cool', bodyType: 'hourglass' });
  // Pass mood to ensure at least 3 parts (palette + body + mood) before undertone
  const rationale = generateRationale(comps, items, prof, 'confident', undefined, 2);
  assert(
    rationale.includes('in tones that work with your complexion'),
    `undertoneScore=2 + 3 existing parts → undertone phrase still present (got: "${rationale}")`,
  );
}

// (c) undertoneScore < 2 → phrase absent
{
  const { items, comps } = makeRationaleFixture('camel');
  const prof = baseProfile({ undertone: 'warm' });
  const rationale = generateRationale(comps, items, prof, null, undefined, 1);
  assert(
    !rationale.includes('in tones that work with your complexion'),
    `undertoneScore=1 → undertone phrase absent (got: "${rationale}")`,
  );
}

// (d) undertoneScore >= 2 but neutral undertone → phrase absent
{
  const { items, comps } = makeRationaleFixture('camel');
  const prof = baseProfile({ undertone: 'neutral' });
  const rationale = generateRationale(comps, items, prof, null, undefined, 2);
  assert(
    !rationale.includes('in tones that work with your complexion'),
    `neutral undertone → undertone phrase absent (got: "${rationale}")`,
  );
}

// (e) undertoneScore undefined (caller did not pass it) → phrase absent, no crash
{
  const { items, comps } = makeRationaleFixture('camel');
  const prof = baseProfile({ undertone: 'warm' });
  const rationale = generateRationale(comps, items, prof);
  assert(
    !rationale.includes('in tones that work with your complexion'),
    `undertoneScore omitted → phrase absent, no crash (got: "${rationale}")`,
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall outfitComboScorer assertions passed');
