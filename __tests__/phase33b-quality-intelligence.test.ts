/**
 * Phase 3.3B — Recommendation Quality Intelligence
 *
 * Regression guard for the textureHarmony refinement shipped in Phase 3.3B.
 * The core change: `statementCount >= 2` is no longer a blanket -3 penalty.
 * Two statement fabrics where only one is high-gloss (silk/satin) now read as
 * intentional material contrast (+1) rather than "over-styled / loud" (-3).
 * Two high-gloss fabrics (silk + satin) still score -3 (competing shininess).
 *
 * Checks:
 *   A. Material relationships — the +1 contrast signal fires for the right pairs
 *   B. Competing gloss — silk+satin still penalised at -3 (no regression)
 *   C. All-flat penalty — cotton+denim still -2 (no regression)
 *   D. Single statement hero — still +3 (no regression)
 *   E. Tonal sophistication — QL1-style outfit (silk+cashmere) outranks QL2
 *      (cotton+cotton) in a head-to-head score comparison
 *   F. Visual hierarchy regression — leather+cotton single-hero still +3
 *   G. Context: silk+cashmere in work scenario produces non-zero outfits
 */

import assert from 'assert';
import { WardrobeItem, UserProfile, OutfitComponent } from '../constants/types';
import { textureHarmony, scoreOutfitCombo } from '../constants/outfitScoring';
import { generateOutfitPool } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';

// ─── helpers ─────────────────────────────────────────────────────────────────

let _id = 0;
function uid() { return `q${++_id}`; }

function item(overrides: Partial<WardrobeItem> & Pick<WardrobeItem, 'category' | 'subType' | 'fabric'>): WardrobeItem {
  return {
    id: uid(),
    name: `${overrides.subType}-${_id}`,
    colorFamily: 'black',
    pattern: 'solid',
    weight: 'medium',
    fit: 'regular',
    formalityLevel: 4,
    occasionTags: ['work', 'brunch'],
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    owned: true,
    photoUri: undefined,
    ...overrides,
  } as WardrobeItem;
}

function component(id: string, category: WardrobeItem['category']): OutfitComponent {
  return { matchedItemId: id, category, subType: '', colorFamily: 'black', owned: true };
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    name: 'Test',
    colorPalette: 'neutral',
    styleGoalPrimary: 'classic',
    bodyType: null,
    heightBand: null,
    industry: undefined,
    metalPreference: undefined,
    isPremium: true,
    isGuest: false,
    constraints: {
      noSleeveless: false,
      noShortSkirts: false,
      maxHeelHeight: 'any',
      colorAversions: [],
    },
    ...overrides,
  } as UserProfile;
}

// ─── A. Material relationships — intentional contrast (Phase 3.3B) ─────────

// A1: silk + cashmere (classic quiet-luxury pairing) → +1 intentional contrast
{
  const silk    = item({ category: 'top',    subType: 'blouse',     fabric: 'silk'    });
  const cashmere = item({ category: 'bottom', subType: 'trousers',   fabric: 'cashmere' });
  const score = textureHarmony([silk, cashmere]);
  assert(score === 1, `A1: silk+cashmere → +1 intentional contrast (got ${score})`);
}

// A2: velvet + silk (plush/fluid — matte statement + gloss statement) → +1
{
  const velvet = item({ category: 'top',    subType: 'blouse',     fabric: 'velvet' });
  const silk   = item({ category: 'bottom', subType: 'midi-skirt', fabric: 'silk'   });
  const score = textureHarmony([velvet, silk]);
  assert(score === 1, `A2: velvet+silk → +1 intentional contrast (got ${score})`);
}

// A3: leather + cashmere (hard/soft — both statement, 0 gloss) → +1
{
  const leather  = item({ category: 'outerwear', subType: 'leather-jacket', fabric: 'leather' });
  const cashmere = item({ category: 'top',       subType: 'sweater',        fabric: 'cashmere' });
  const score = textureHarmony([leather, cashmere]);
  assert(score === 1, `A3: leather+cashmere → +1 intentional contrast (got ${score})`);
}

// A4: cashmere + velvet (two matt statements, 0 gloss — rich quiet-luxury) → +1
{
  const cashmere = item({ category: 'top',    subType: 'sweater',    fabric: 'cashmere' });
  const velvet   = item({ category: 'bottom', subType: 'midi-skirt', fabric: 'velvet'   });
  const score = textureHarmony([cashmere, velvet]);
  assert(score === 1, `A4: cashmere+velvet → +1 intentional contrast (got ${score})`);
}

// A5: leather + velvet (both non-gloss statements) → +1
{
  const leather = item({ category: 'outerwear', subType: 'leather-jacket', fabric: 'leather' });
  const velvet  = item({ category: 'bottom',    subType: 'midi-skirt',     fabric: 'velvet'  });
  const score = textureHarmony([leather, velvet]);
  assert(score === 1, `A5: leather+velvet → +1 intentional contrast (got ${score})`);
}

// ─── B. Competing gloss — silk+satin still penalised (regression guard) ──────

// B1: silk top + satin dress → 2 gloss statements → -3 (competing shininess)
//     plus 2 gloss count → -2 (belt-and-braces) → total -5
{
  const silk  = item({ category: 'top',   subType: 'camisole',  fabric: 'silk'  });
  const satin = item({ category: 'dress', subType: 'slip-dress', fabric: 'satin' });
  const score = textureHarmony([silk, satin]);
  assert(score === -5, `B1: silk+satin (two gloss) → -5 competing gloss (got ${score})`);
}

// B2: silk + velvet + satin (3 statements, 2 gloss, 3 equal-weight items) → -6
// Penalties: two-gloss → -3; belt-and-braces gloss → -2; all-same-weight stack → -1
{
  const silk   = item({ category: 'top',       subType: 'blouse',     fabric: 'silk'  });
  const velvet = item({ category: 'bottom',    subType: 'midi-skirt', fabric: 'velvet' });
  const satin  = item({ category: 'outerwear', subType: 'blazer',     fabric: 'satin'  });
  const score = textureHarmony([silk, velvet, satin]);
  assert(score === -6, `B2: silk+velvet+satin (3 statements, 2 gloss, same-weight stack) → -6 (got ${score})`);
}

// ─── C. All-flat penalty unchanged (regression guard) ────────────────────────

// C1: cotton + denim → all flat → -2
{
  const tee   = item({ category: 'top',    subType: 't-shirt', fabric: 'cotton' });
  const jeans = item({ category: 'bottom', subType: 'jeans',   fabric: 'denim'  });
  const score = textureHarmony([tee, jeans]);
  assert(score === -2, `C1: cotton+denim → -2 all-flat (got ${score})`);
}

// C2: synthetic + cotton + jersey → all flat → -2 all-flat penalty
// Give each item a distinct weight so the identical-weight-stack penalty does
// NOT fire — isolating the all-flat check.
{
  const top    = item({ category: 'top',       subType: 't-shirt',     fabric: 'synthetic', weight: 'light' });
  const bottom = item({ category: 'bottom',    subType: 'chinos',      fabric: 'cotton',    weight: 'mid'   });
  const outer  = item({ category: 'outerwear', subType: 'windbreaker', fabric: 'jersey',    weight: 'heavy' });
  const score = textureHarmony([top, bottom, outer]);
  assert(score === -2, `C2: synthetic+cotton+jersey (varied weights) → -2 all-flat (got ${score})`);
}

// ─── D. Single statement hero still +3 (regression guard) ────────────────────

// D1: silk top + wool trousers (1 statement, 1 non-statement) → +3
{
  const silk = item({ category: 'top',    subType: 'blouse',   fabric: 'silk' });
  const wool = item({ category: 'bottom', subType: 'trousers', fabric: 'wool' });
  const score = textureHarmony([silk, wool]);
  assert(score === 3, `D1: silk+wool → +3 single statement hero (got ${score})`);
}

// D2: cashmere top + wool trousers (1 statement) → +3
{
  const cashmere = item({ category: 'top',    subType: 'sweater',  fabric: 'cashmere' });
  const wool     = item({ category: 'bottom', subType: 'trousers', fabric: 'wool'     });
  const score = textureHarmony([cashmere, wool]);
  assert(score === 3, `D2: cashmere+wool → +3 single statement hero (got ${score})`);
}

// D3: velvet top + cotton trousers (1 statement) → +3
{
  const velvet = item({ category: 'top',    subType: 'blouse',   fabric: 'velvet' });
  const cotton = item({ category: 'bottom', subType: 'trousers', fabric: 'cotton' });
  const score = textureHarmony([velvet, cotton]);
  assert(score === 3, `D3: velvet+cotton → +3 single statement hero (got ${score})`);
}

// D4: leather jacket + cotton tee (1 statement in outerwear) → +3
{
  const leather = item({ category: 'outerwear', subType: 'leather-jacket', fabric: 'leather' });
  const tee     = item({ category: 'top',       subType: 't-shirt',        fabric: 'cotton'  });
  const score = textureHarmony([leather, tee]);
  assert(score === 3, `D4: leather+cotton → +3 single statement hero (got ${score})`);
}

// ─── E. Tonal sophistication — QL1 scores higher than QL2 ───────────────────

// A silk+cashmere outfit must score higher than a cotton+cotton outfit.
// Pre-3.3B: both could score identically; post-3.3B the silk+cashmere outfit
// gets +4 more texture points (−3 → +1), so QL1-style > QL2-style.
{
  const ql1Items: WardrobeItem[] = [
    item({ id: 'ql1-top', category: 'top',    subType: 'blouse',     fabric: 'silk',     colorFamily: 'cream', formalityLevel: 5, occasionTags: ['work'] }),
    item({ id: 'ql1-bot', category: 'bottom', subType: 'wide-leg',   fabric: 'cashmere', colorFamily: 'camel', formalityLevel: 5, occasionTags: ['work'] }),
    item({ id: 'ql1-shj', category: 'shoes',  subType: 'mules',      fabric: 'leather',  colorFamily: 'tan',   formalityLevel: 5, occasionTags: ['work'] }),
    item({ id: 'ql1-bag', category: 'bag',    subType: 'shoulder-bag', fabric: 'leather', colorFamily: 'tan',  formalityLevel: 5, occasionTags: ['work'] }),
  ];
  const ql2Items: WardrobeItem[] = [
    item({ id: 'ql2-top', category: 'top',    subType: 't-shirt',  fabric: 'cotton',    colorFamily: 'grey',  formalityLevel: 2, occasionTags: ['casual'] }),
    item({ id: 'ql2-bot', category: 'bottom', subType: 'chinos',   fabric: 'cotton',    colorFamily: 'beige', formalityLevel: 3, occasionTags: ['casual'] }),
    item({ id: 'ql2-shj', category: 'shoes',  subType: 'sneakers', fabric: 'synthetic', colorFamily: 'white', formalityLevel: 1, occasionTags: ['casual'] }),
    item({ id: 'ql2-bag', category: 'bag',    subType: 'backpack', fabric: 'synthetic', colorFamily: 'black', formalityLevel: 1, occasionTags: ['casual'] }),
  ];

  // matchedItemId is required for scoreOutfitCombo to resolve item fabrics
  const ql1Comps: OutfitComponent[] = ql1Items.map(i => ({ category: i.category, subType: i.subType, colorFamily: i.colorFamily, matchedItemId: i.id, owned: true }));
  const ql2Comps: OutfitComponent[] = ql2Items.map(i => ({ category: i.category, subType: i.subType, colorFamily: i.colorFamily, matchedItemId: i.id, owned: true }));

  const ql1Score = scoreOutfitCombo(ql1Comps, ql1Items);
  const ql2Score = scoreOutfitCombo(ql2Comps, ql2Items);

  assert(
    ql1Score.textureHarmony > ql2Score.textureHarmony,
    `E1: silk+cashmere textureHarmony (${ql1Score.textureHarmony}) must exceed cotton+cotton (${ql2Score.textureHarmony})`,
  );
  assert(
    ql1Score.total > ql2Score.total,
    `E2: QL1 total (${ql1Score.total}) must exceed QL2 total (${ql2Score.total}) post-3.3B`,
  );
}

// ─── F. Visual hierarchy — leather single-hero still best-in-class ───────────
// scoreOutfitCombo round-trip: leather jacket + cotton tee → textureHarmony = 3
{
  // Varied weights so the all-same-weight-stack penalty does not fire,
  // isolating the single-statement-hero (+3) signal.
  const leather = item({
    id: 'f-lj', category: 'outerwear', subType: 'leather-jacket',
    fabric: 'leather', colorFamily: 'black', formalityLevel: 4, occasionTags: ['casual'], weight: 'heavy',
  });
  const tee = item({
    id: 'f-tee', category: 'top', subType: 't-shirt',
    fabric: 'cotton', colorFamily: 'white', formalityLevel: 2, occasionTags: ['casual'], weight: 'light',
  });
  const jeans = item({
    id: 'f-jns', category: 'bottom', subType: 'jeans',
    fabric: 'denim', colorFamily: 'blue', formalityLevel: 2, occasionTags: ['casual'], weight: 'mid',
  });
  const comps: OutfitComponent[] = [leather, tee, jeans].map(i => ({ category: i.category, subType: i.subType, colorFamily: i.colorFamily, matchedItemId: i.id, owned: true }));
  const result = scoreOutfitCombo(comps, [leather, tee, jeans]);
  assert(result.textureHarmony === 3, `F1: leather hero + flat pieces → textureHarmony +3 (got ${result.textureHarmony})`);
}

// ─── G. Context — silk+cashmere work wardrobe produces outfits ───────────────
// A wardrobe containing silk top + cashmere trouser + leather mules should
// produce at least one outfit for a work scenario (not empty).
{
  const silkTop = item({
    id: 'g-top', category: 'top', subType: 'blouse',
    fabric: 'silk', colorFamily: 'cream', formalityLevel: 5, occasionTags: ['work'],
  });
  const cashTrousers = item({
    id: 'g-bot', category: 'bottom', subType: 'trousers',
    fabric: 'cashmere', colorFamily: 'navy', formalityLevel: 5, occasionTags: ['work'],
  });
  const leatherShoes = item({
    id: 'g-shj', category: 'shoes', subType: 'mules',
    fabric: 'leather', colorFamily: 'tan', formalityLevel: 5, occasionTags: ['work'],
  });
  const wardrobe = [silkTop, cashTrousers, leatherShoes];
  // generateOutfitPool signature: (items, profile, mood, reactions, today, wearHistory, affinity, weather, isPremium)
  const poolByScenario = generateOutfitPool(
    wardrobe,
    profile({ styleGoalPrimary: 'classic' }),
    null,             // mood
    [],               // reactions
    '2026-08-12',     // today
    [],               // wearHistory
    EMPTY_AFFINITY,
    null,             // weather
    true,             // isPremium
  );
  const workOutfits = poolByScenario['work'] ?? [];
  assert(workOutfits.length > 0, `G1: silk+cashmere+leather for work should produce ≥1 outfit (got ${workOutfits.length})`);
}

console.log('phase33b-quality-intelligence: all checks passed');
