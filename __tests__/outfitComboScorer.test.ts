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
  assert(result.patternSafety === 2, `two small-scale patterns → patternSafety +2 (not bold) (got ${result.patternSafety})`);
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
    br.temperatureHarmony + br.valueSpread + br.saturationDominance + br.textureHarmony;
  assert(br.total === expectedTotal, `total equals sum of all breakdown dimensions (got total=${br.total}, sum=${expectedTotal})`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall outfitComboScorer assertions passed');
