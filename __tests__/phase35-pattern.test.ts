/**
 * Phase 3.5C — Hero-pattern + solid-ground hierarchy
 *
 * Tests the updated `patternSafety` logic that rewards the "one intentional
 * pattern + solid canvas" design principle. A bold patterned hero with all
 * other core garments solid scores +3 (vs +2 for all-solid or ungrounded hero).
 *
 * Run: `npx tsx __tests__/phase35-pattern.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { scoreOutfitCombo } from '../constants/outfitScoring';
import type { OutfitComponent, WardrobeItem } from '../constants/types';

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

// ── 3.5C: patternSafety — hero + solid ground ─────────────────────────────────

console.log('\npatternSafety — hero-pattern + solid-ground hierarchy (Phase 3.5C):');

// C1. Bold floral hero + all solid core garments → +3 (hero + solid ground)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'multicolour', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'black',       pattern: 'solid'  }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'sandals',    colorFamily: 'tan'                            }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'multicolour'),
    makeComponent('bt', 'bottom', 'black'),
    makeComponent('sh', 'shoes',  'tan'),
  ];
  const result = scoreOutfitCombo(comps, items);
  assert(result.patternSafety === 3,
    `bold floral top + solid black midi + solid sandals → hero+solid-ground → patternSafety +3 (got ${result.patternSafety})`);
}

// C2. Animal print hero (bold) + solid black trousers → +3
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'multicolour', pattern: 'animal' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'black',       pattern: 'solid'  }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',    colorFamily: 'nude'                           }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'multicolour'),
    makeComponent('bt', 'bottom', 'black'),
    makeComponent('sh', 'shoes',  'nude'),
  ];
  const result = scoreOutfitCombo(comps, items);
  assert(result.patternSafety === 3,
    `animal print top + solid black trousers → hero+solid-ground → patternSafety +3 (got ${result.patternSafety})`);
}

// C3. Bold floral hero + one patterned companion (subtle stripe) → +1
//     Two patterned items = scale contrast, not hero+solid-ground.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'multicolour', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'navy',        pattern: 'stripe', patternScale: 'small' }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'multicolour'),
    makeComponent('bt', 'bottom', 'navy'),
  ];
  const result = scoreOutfitCombo(comps, items);
  // 2 patterned items: one large (floral) + one small (stripe) → scale contrast → +1
  assert(result.patternSafety === 1,
    `bold floral + subtle stripe → 2 patterns (scale contrast) → patternSafety +1 (got ${result.patternSafety})`);
}

// C4. Bold floral hero + patterned outerwear → +1 (outerwear breaks solid ground)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',      subType: 'blouse',        colorFamily: 'multicolour', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'oj', category: 'outerwear', subType: 'denim-jacket', colorFamily: 'blue',        pattern: 'stripe', patternScale: 'small' }),
    makeItem({ id: 'bt', category: 'bottom',   subType: 'jeans',         colorFamily: 'black',       pattern: 'solid'  }),
  ];
  const comps = [
    makeComponent('tp', 'top',       'multicolour'),
    makeComponent('oj', 'outerwear', 'blue'),
    makeComponent('bt', 'bottom',    'black'),
  ];
  const result = scoreOutfitCombo(comps, items);
  // 2 patterned items → scale contrast (+1); outerwear is a core garment, breaks solid-ground
  assert(result.patternSafety === 1,
    `bold floral + patterned outerwear → 2 patterns, outerwear breaks solid ground → patternSafety +1 (got ${result.patternSafety})`);
}

// C5. Small accent pattern (stripe, small scale) + solid → +1 (not bold)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'navy',  pattern: 'stripe', patternScale: 'small' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'black', pattern: 'solid'  }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'navy'),
    makeComponent('bt', 'bottom', 'black'),
  ];
  const result = scoreOutfitCombo(comps, items);
  assert(result.patternSafety === 1,
    `small stripe top + solid bottom → accent pattern, not bold → patternSafety +1 (got ${result.patternSafety})`);
}

// C6. All solid garments → +2 (clean, no pattern)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream', pattern: 'solid' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'black', pattern: 'solid' }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',    colorFamily: 'nude'                    }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'black'),
    makeComponent('sh', 'shoes',  'nude'),
  ];
  const result = scoreOutfitCombo(comps, items);
  assert(result.patternSafety === 2,
    `all solid → clean look → patternSafety +2 (got ${result.patternSafety})`);
}

// C7. Two bold florals → −3 (same pattern type clash, pre-existing rule)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'multicolour', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'multicolour', pattern: 'floral', patternScale: 'small' }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'multicolour'),
    makeComponent('bt', 'bottom', 'multicolour'),
  ];
  const result = scoreOutfitCombo(comps, items);
  assert(result.patternSafety === -3,
    `two florals (large + small) → same pattern type → patternSafety -3 (got ${result.patternSafety})`);
}

// C8. Two large bold patterns (animal + floral) → −3
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'multicolour', pattern: 'animal' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'multicolour', pattern: 'floral', patternScale: 'large' }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'multicolour'),
    makeComponent('bt', 'bottom', 'multicolour'),
  ];
  const result = scoreOutfitCombo(comps, items);
  assert(result.patternSafety === -3,
    `animal + large floral (two bold, different types) → patternSafety -3 (got ${result.patternSafety})`);
}

// C9. 3+ patterned items → −4 (always too busy)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',       subType: 'blouse',       colorFamily: 'multicolour', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'bt', category: 'bottom',    subType: 'midi-skirt',   colorFamily: 'navy',        pattern: 'stripe', patternScale: 'small' }),
    makeItem({ id: 'oj', category: 'outerwear', subType: 'denim-jacket', colorFamily: 'blue',        pattern: 'check',  patternScale: 'small' }),
  ];
  const comps = [
    makeComponent('tp', 'top',       'multicolour'),
    makeComponent('bt', 'bottom',    'navy'),
    makeComponent('oj', 'outerwear', 'blue'),
  ];
  const result = scoreOutfitCombo(comps, items);
  assert(result.patternSafety === -4,
    `3 patterned items (floral + stripe + check) → always too busy → patternSafety -4 (got ${result.patternSafety})`);
}

// C10. Bold hero + un-patterned accessories → +3
//      Accessories with no pattern field don't appear in the `patterned` tally
//      (they default to undefined, not 'solid'), so they don't affect the hero
//      condition or the solid-ground check. Real shoes and bags typically have
//      no pattern set, making this the common real-world case.
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'multicolour', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'black',       pattern: 'solid'  }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',    colorFamily: 'nude'                           }),  // no pattern field
    makeItem({ id: 'bg', category: 'bag',    subType: 'clutch',   colorFamily: 'gold'                           }),  // no pattern field
  ];
  const comps = [
    makeComponent('tp', 'top',    'multicolour'),
    makeComponent('bt', 'bottom', 'black'),
    makeComponent('sh', 'shoes',  'nude'),
    makeComponent('bg', 'bag',    'gold'),
  ];
  const result = scoreOutfitCombo(comps, items);
  assert(result.patternSafety === 3,
    `bold floral top + solid trousers + un-patterned shoes + bag → accessories don't disrupt hero → patternSafety +3 (got ${result.patternSafety})`);
}

// C11. Bold floral dress alone (no other core garments) → +3
//      Vacuously satisfies "all other core garments are solid" (there are none).
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'dr', category: 'dress', subType: 'midi-dress', colorFamily: 'multicolour', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'sh', category: 'shoes', subType: 'heels',      colorFamily: 'nude'                                                    }),
  ];
  const comps = [
    makeComponent('dr', 'dress', 'multicolour'),
    makeComponent('sh', 'shoes', 'nude'),
  ];
  const result = scoreOutfitCombo(comps, items);
  assert(result.patternSafety === 3,
    `bold floral midi dress alone (no other core garments) → hero-pattern hero → patternSafety +3 (got ${result.patternSafety})`);
}

// C12. patternSafety delta between hero+solid-ground vs all-solid
{
  const heroItems: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'multicolour', pattern: 'floral', patternScale: 'large' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'black',       pattern: 'solid'  }),
  ];
  const heroComps = [makeComponent('tp', 'top', 'multicolour'), makeComponent('bt', 'bottom', 'black')];
  const heroResult = scoreOutfitCombo(heroComps, heroItems);

  const solidItems: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'navy',  pattern: 'solid' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'black', pattern: 'solid' }),
  ];
  const solidComps = [makeComponent('tp', 'top', 'navy'), makeComponent('bt', 'bottom', 'black')];
  const solidResult = scoreOutfitCombo(solidComps, solidItems);

  assert(heroResult.patternSafety === 3,
    `hero+solid-ground → patternSafety +3 (got ${heroResult.patternSafety})`);
  assert(solidResult.patternSafety === 2,
    `all-solid → patternSafety +2 (got ${solidResult.patternSafety})`);
  assert(heroResult.patternSafety - solidResult.patternSafety === 1,
    `hero+solid-ground earns +1 over all-solid (got delta ${heroResult.patternSafety - solidResult.patternSafety})`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('all Phase 3.5C pattern assertions passed');
  process.exit(0);
}
