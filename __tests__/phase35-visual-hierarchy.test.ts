/**
 * Phase 3.5A — Visual-weight / focal-point competition
 *
 * Tests the `focalCompetition` signal added in Phase 3.5A.
 * Signal range: 0 (no competition) to −4 (both garment + accessory overload).
 *
 * Run: `npx tsx __tests__/phase35-visual-hierarchy.test.ts`
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

// ── Factory helpers — mirrors outfitComboScorer.test.ts ───────────────────────

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

// ── 3.5A: focalCompetition ────────────────────────────────────────────────────

console.log('\nfocalCompetition (Phase 3.5A):');

// ── A1. Single hero + quiet supports → no competition ─────────────────────────
// Leather jacket (statement + sig silhouette) with black cotton jeans and
// white cotton tee. Only 1 focal garment (leather jacket) → no penalty.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'oj', category: 'outerwear', subType: 'leather-jacket', colorFamily: 'black', fabric: 'leather' }),
    makeItem({ id: 'bt', category: 'bottom',    subType: 'jeans',          colorFamily: 'black', fabric: 'denim'   }),
    makeItem({ id: 'tp', category: 'top',       subType: 't-shirt',        colorFamily: 'white', fabric: 'cotton'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('oj', 'outerwear', 'black'),
    makeComponent('bt', 'bottom',   'black'),
    makeComponent('tp', 'top',      'white'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.focalCompetition === 0,
    `single leather hero + quiet supports → focalCompetition 0 (got ${result.focalCompetition})`);
}

// ── A2. Two focal garment heroes → −2 penalty ─────────────────────────────────
// Leather jacket (statement + sig silhouette = structure-led focal) +
// gold satin midi skirt (statement + high-sat gold = color-led focal).
// Two competing focal garments → −2.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'oj', category: 'outerwear', subType: 'leather-jacket', colorFamily: 'black', fabric: 'leather' }),
    makeItem({ id: 'sk', category: 'bottom',    subType: 'midi-skirt',     colorFamily: 'gold',  fabric: 'satin'   }),
    makeItem({ id: 'sh', category: 'shoes',     subType: 'heels',          colorFamily: 'nude',  fabric: 'leather' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('oj', 'outerwear', 'black'),
    makeComponent('sk', 'bottom',   'gold'),
    makeComponent('sh', 'shoes',    'nude'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.focalCompetition === -2,
    `leather jacket + gold satin skirt (two focal heroes) → focalCompetition -2 (got ${result.focalCompetition})`);
}

// ── A3. Bold pattern garment = inherently focal ───────────────────────────────
// Large floral top (bold pattern) + velvet blazer (statement + sig silhouette).
// Both are focal garments → −2.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',       subType: 'blouse', colorFamily: 'multicolour', fabric: 'cotton', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'oj', category: 'outerwear', subType: 'blazer', colorFamily: 'black',       fabric: 'velvet' }),
    makeItem({ id: 'bt', category: 'bottom',    subType: 'trousers', colorFamily: 'black',     fabric: 'wool'   }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('tp', 'top',       'multicolour'),
    makeComponent('oj', 'outerwear', 'black'),
    makeComponent('bt', 'bottom',    'black'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.focalCompetition === -2,
    `large floral top + velvet blazer (pattern-led + structure-led) → focalCompetition -2 (got ${result.focalCompetition})`);
}

// ── A4. Three focal garments — garment penalty does not stack beyond −2 ───────
// Leather jacket + gold satin skirt + large floral top: 3 focal garments.
// The garment competition fires once → −2 (not −4).
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'oj', category: 'outerwear', subType: 'leather-jacket', colorFamily: 'black',       fabric: 'leather' }),
    makeItem({ id: 'sk', category: 'bottom',    subType: 'midi-skirt',     colorFamily: 'gold',        fabric: 'satin'   }),
    makeItem({ id: 'tp', category: 'top',       subType: 'blouse',         colorFamily: 'multicolour', fabric: 'cotton',  pattern: 'floral', patternScale: 'large' }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('oj', 'outerwear', 'black'),
    makeComponent('sk', 'bottom',   'gold'),
    makeComponent('tp', 'top',      'multicolour'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.focalCompetition === -2,
    `three focal garments → garment penalty fires once at −2 (does not stack) (got ${result.focalCompetition})`);
}

// ── A5. Statement fabric + quiet colour → not color-led focal ─────────────────
// Cream silk blouse: statement fabric but cream has low saturation → not
// color-led. Blouse subType not in HERO_SIGNATURE_SUBTYPES → not structure-led.
// Only the cashmere wide-leg (statement + sig silhouette) is focal → 1 focal → 0.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream',  fabric: 'silk'     }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'black',  fabric: 'wool'     }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',    colorFamily: 'nude',   fabric: 'leather'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'black'),
    makeComponent('sh', 'shoes',  'nude'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.focalCompetition === 0,
    `cream silk blouse (quiet colour) + quiet supports → at most 1 focal garment → focalCompetition 0 (got ${result.focalCompetition})`);
}

// ── A6. Two vivid accessories (below threshold) → no overload penalty ─────────
// Red bag + red heels: 2 vivid accessories. Threshold is 3. No penalty.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'cream' }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',    colorFamily: 'red'   }),
    makeItem({ id: 'bg', category: 'bag',    subType: 'tote',     colorFamily: 'red'   }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'cream'),
    makeComponent('sh', 'shoes',  'red'),
    makeComponent('bg', 'bag',    'red'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.focalCompetition === 0,
    `2 vivid accessories (red bag + red heels) → below 3-piece threshold → focalCompetition 0 (got ${result.focalCompetition})`);
}

// ── A7. Three vivid accessories → −2 accessory overload ──────────────────────
// Red bag + red heels + gold earrings: 3 vivid accessories (all sat ≥ 0.55).
// Accessory overload penalty fires: −2.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',     subType: 'blouse',             colorFamily: 'cream' }),
    makeItem({ id: 'bt', category: 'bottom',  subType: 'trousers',           colorFamily: 'cream' }),
    makeItem({ id: 'sh', category: 'shoes',   subType: 'heels',              colorFamily: 'red'   }),
    makeItem({ id: 'bg', category: 'bag',     subType: 'tote',               colorFamily: 'red'   }),
    makeItem({ id: 'jw', category: 'jewelry', subType: 'statement-earrings', colorFamily: 'gold'  }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('tp', 'top',     'cream'),
    makeComponent('bt', 'bottom',  'cream'),
    makeComponent('sh', 'shoes',   'red'),
    makeComponent('bg', 'bag',     'red'),
    makeComponent('jw', 'jewelry', 'gold'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.focalCompetition === -2,
    `3 vivid accessories (red shoes + red bag + gold earrings) → accessory overload → focalCompetition -2 (got ${result.focalCompetition})`);
}

// ── A8. Both garment competition + accessory overload → −4 total ──────────────
// Leather jacket + gold satin skirt (two focal garments) AND three vivid
// accessories (red heels + red bag + gold earrings). Both penalties fire.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'oj', category: 'outerwear', subType: 'leather-jacket', colorFamily: 'black', fabric: 'leather' }),
    makeItem({ id: 'sk', category: 'bottom',    subType: 'midi-skirt',     colorFamily: 'gold',  fabric: 'satin'   }),
    makeItem({ id: 'sh', category: 'shoes',     subType: 'heels',          colorFamily: 'red'    }),
    makeItem({ id: 'bg', category: 'bag',       subType: 'tote',           colorFamily: 'red'    }),
    makeItem({ id: 'jw', category: 'jewelry',   subType: 'earrings',       colorFamily: 'gold'   }),
  ];
  const components: OutfitComponent[] = [
    makeComponent('oj', 'outerwear', 'black'),
    makeComponent('sk', 'bottom',   'gold'),
    makeComponent('sh', 'shoes',    'red'),
    makeComponent('bg', 'bag',      'red'),
    makeComponent('jw', 'jewelry',  'gold'),
  ];
  const result = scoreOutfitCombo(components, items);
  assert(result.focalCompetition === -4,
    `two focal garments + three vivid accessories → both penalties → focalCompetition -4 (got ${result.focalCompetition})`);
}

// ── A9. Single item outfit — no competition possible ─────────────────────────
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'dr', category: 'dress', subType: 'midi-dress', colorFamily: 'black', fabric: 'silk' }),
  ];
  const components: OutfitComponent[] = [makeComponent('dr', 'dress', 'black')];
  const result = scoreOutfitCombo(components, items);
  assert(result.focalCompetition === 0,
    `single item outfit → no focal competition possible → focalCompetition 0 (got ${result.focalCompetition})`);
}

// ── A10. focalCompetition is reflected in the total ───────────────────────────
// Same base outfit: leather jacket + gold satin skirt (competing) vs
// leather jacket + black jeans (single hero). The penalty reduces the total.
{
  const competingItems: WardrobeItem[] = [
    makeItem({ id: 'oj', category: 'outerwear', subType: 'leather-jacket', colorFamily: 'black', fabric: 'leather' }),
    makeItem({ id: 'sk', category: 'bottom',    subType: 'midi-skirt',     colorFamily: 'gold',  fabric: 'satin'   }),
  ];
  const quietItems: WardrobeItem[] = [
    makeItem({ id: 'oj', category: 'outerwear', subType: 'leather-jacket', colorFamily: 'black', fabric: 'leather' }),
    makeItem({ id: 'bt', category: 'bottom',    subType: 'jeans',          colorFamily: 'black', fabric: 'denim'   }),
  ];
  const competingComps: OutfitComponent[] = [makeComponent('oj', 'outerwear', 'black'), makeComponent('sk', 'bottom', 'gold')];
  const quietComps: OutfitComponent[] = [makeComponent('oj', 'outerwear', 'black'), makeComponent('bt', 'bottom', 'black')];

  const competing = scoreOutfitCombo(competingComps, competingItems);
  const quiet     = scoreOutfitCombo(quietComps, quietItems);

  assert(competing.focalCompetition === -2,
    `competing outfit: focalCompetition -2 (got ${competing.focalCompetition})`);
  assert(quiet.focalCompetition === 0,
    `quiet outfit: focalCompetition 0 (got ${quiet.focalCompetition})`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('all Phase 3.5A visual-hierarchy assertions passed');
  process.exit(0);
}
