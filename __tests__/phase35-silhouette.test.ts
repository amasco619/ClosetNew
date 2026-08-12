/**
 * Phase 3.5B — Silhouette / body-proportion weighting
 *
 * Tests targeted new signals and existing bodyTypeProportion + heightProportion
 * rules. Validates that signals fire in the right direction without encoding
 * rigid "always better" rules (context matters — same item can score 0, +1, or
 * negative depending on the rest of the outfit and the user's profile).
 *
 * Run: `npx tsx __tests__/phase35-silhouette.test.ts`
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
    lifestyleActive: 0,
    lifestyleBrunch: 0,
    constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
    onboardingComplete: true,
    ...overrides,
  } as UserProfile;
}

// ── heightProportion: petite rules ────────────────────────────────────────────

console.log('\nheightProportion — petite (Phase 3.5B):');

// B1. Petite + slim trousers + heels → +1 (elongating combination, new rule)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'slim' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'navy',  fit: 'slim' }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',    colorFamily: 'nude'              }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'navy'),
    makeComponent('sh', 'shoes',  'nude'),
  ];
  const prof = baseProfile({ heightBand: 'petite' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.heightProportion === 1,
    `petite: slim trousers + heels → elongating combination → heightProportion +1 (got ${result.heightProportion})`);
}

// B2. Petite + wide-leg + sneakers → −1 (maxi-equivalent + flat shoe)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'wide-leg', colorFamily: 'black' }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'sneakers', colorFamily: 'white' }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'black'),
    makeComponent('sh', 'shoes',  'white'),
  ];
  const prof = baseProfile({ heightBand: 'petite' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.heightProportion === -1,
    `petite: wide-leg + sneakers → maxi+flat penalty → heightProportion -1 (got ${result.heightProportion})`);
}

// B3. Petite + monochromatic column → +2 (strongest elongation technique)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'navy' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'navy', fit: 'regular' }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'mules',    colorFamily: 'black' }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'navy'),
    makeComponent('bt', 'bottom', 'navy'),
    makeComponent('sh', 'shoes',  'black'),
  ];
  const prof = baseProfile({ heightBand: 'petite' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.heightProportion === 2,
    `petite: same-color top+bottom (navy/navy) → monochromatic column → heightProportion +2 (got ${result.heightProportion})`);
}

// B4. Petite + tailored trousers + loafers → +1 (loafers are elongating)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'slim'     }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'camel', fit: 'tailored' }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'loafers',  colorFamily: 'tan'                    }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'camel'),
    makeComponent('sh', 'shoes',  'tan'),
  ];
  const prof = baseProfile({ heightBand: 'petite' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.heightProportion === 1,
    `petite: tailored trousers + loafers → elongating combo → heightProportion +1 (got ${result.heightProportion})`);
}

// B5. Petite + slim trousers + sneakers → 0 (slim without elongating shoe)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'slim' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'black', fit: 'slim' }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'sneakers', colorFamily: 'white'              }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'black'),
    makeComponent('sh', 'shoes',  'white'),
  ];
  const prof = baseProfile({ heightBand: 'petite' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.heightProportion === 0,
    `petite: slim trousers + sneakers → no elongation signal → heightProportion 0 (got ${result.heightProportion})`);
}

// B6. Average height → heightProportion is always 0 (no-op)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'slim' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'navy',  fit: 'slim' }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',    colorFamily: 'nude'              }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'navy'),
    makeComponent('sh', 'shoes',  'nude'),
  ];
  const prof = baseProfile({ heightBand: 'average' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.heightProportion === 0,
    `average height: height rules inactive → heightProportion 0 (got ${result.heightProportion})`);
}

// B7. No profile → heightProportion is 0 (no-op)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'slim' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'navy',  fit: 'slim' }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',    colorFamily: 'nude'              }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'navy'),
    makeComponent('sh', 'shoes',  'nude'),
  ];
  const result = scoreOutfitCombo(comps, items);  // no profile
  assert(result.heightProportion === 0,
    `no profile → heightProportion 0 (got ${result.heightProportion})`);
}

// ── bodyTypeProportion: pear / A-line (Phase 3.5B new rule) ──────────────────

console.log('\nbodyTypeProportion — pear A-line rule (Phase 3.5B):');

// B8. Pear + A-line midi skirt + slim top → +1 (new rule)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'cream', fit: 'slim' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'navy'              }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',      colorFamily: 'black'              }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'navy'),
    makeComponent('sh', 'shoes',  'black'),
  ];
  const prof = baseProfile({ bodyType: 'pear' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.bodyTypeProportion === 1,
    `pear: fitted top + A-line midi skirt → pear-flattering combo → bodyTypeProportion +1 (got ${result.bodyTypeProportion})`);
}

// B9. Pear + wide-leg + slim top → +2 (existing WIDE_BOTTOM rule, unchanged)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'slim' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'wide-leg', colorFamily: 'black'              }),
    makeItem({ id: 'sh', category: 'shoes',  subType: 'heels',    colorFamily: 'nude'               }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'black'),
    makeComponent('sh', 'shoes',  'nude'),
  ];
  const prof = baseProfile({ bodyType: 'pear' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.bodyTypeProportion === 2,
    `pear: fitted top + wide-leg → WIDE_BOTTOM anchored by slim top → bodyTypeProportion +2 (got ${result.bodyTypeProportion})`);
}

// B10. Pear + wide-leg + loose top → −2 (existing rule: two volumes = wrong)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'loose' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'wide-leg', colorFamily: 'black'              }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'black'),
  ];
  const prof = baseProfile({ bodyType: 'pear' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.bodyTypeProportion === -2,
    `pear: oversized top + wide-leg → two volumes overwhelm → bodyTypeProportion -2 (got ${result.bodyTypeProportion})`);
}

// B11. Pear + A-line midi skirt + loose top → 0 (new rule requires slim top)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'cream', fit: 'loose' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'navy'              }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'navy'),
  ];
  const prof = baseProfile({ bodyType: 'pear' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.bodyTypeProportion === 0,
    `pear: loose top + A-line midi → A-line rule requires slim top → bodyTypeProportion 0 (got ${result.bodyTypeProportion})`);
}

// B12. No profile → bodyTypeProportion is 0 (no-op)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'cream', fit: 'slim' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'navy'              }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'navy'),
  ];
  const result = scoreOutfitCombo(comps, items);  // no profile
  assert(result.bodyTypeProportion === 0,
    `no profile → bodyTypeProportion 0 (got ${result.bodyTypeProportion})`);
}

// ── bodyTypeProportion: existing rules (regression guards) ───────────────────

console.log('\nbodyTypeProportion — existing rules (regression guards):');

// B13. Inverted-triangle + midi-skirt (A-line subtype) → +1 (balance shoulders)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'cream', fit: 'slim' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'navy'              }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'navy'),
  ];
  const prof = baseProfile({ bodyType: 'inverted-triangle' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.bodyTypeProportion === 1,
    `inverted-triangle: A-line-subtype bottom → volume below balances shoulders → bodyTypeProportion +1 (got ${result.bodyTypeProportion})`);
}

// B14. Rectangle + midi-skirt (curve subtype) → +1
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',     colorFamily: 'cream' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'midi-skirt', colorFamily: 'navy'  }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'navy'),
  ];
  const prof = baseProfile({ bodyType: 'rectangle' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.bodyTypeProportion === 1,
    `rectangle: midi-skirt (curve subtype) → creates perceived curve → bodyTypeProportion +1 (got ${result.bodyTypeProportion})`);
}

// B15. Hourglass + slim top + slim trousers → +1 (tailored combo honours waist)
{
  const items: WardrobeItem[] = [
    makeItem({ id: 'tp', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'slim' }),
    makeItem({ id: 'bt', category: 'bottom', subType: 'trousers', colorFamily: 'black', fit: 'slim' }),
  ];
  const comps = [
    makeComponent('tp', 'top',    'cream'),
    makeComponent('bt', 'bottom', 'black'),
  ];
  const prof = baseProfile({ bodyType: 'hourglass' });
  const result = scoreOutfitCombo(comps, items, prof);
  assert(result.bodyTypeProportion === 1,
    `hourglass: slim top + slim trousers → fully tailored → bodyTypeProportion +1 (got ${result.bodyTypeProportion})`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('all Phase 3.5B silhouette assertions passed');
  process.exit(0);
}
