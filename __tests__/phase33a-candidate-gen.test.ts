/**
 * Phase 3.3A — Candidate Generation Robustness
 *
 * Regression guard for the two SUBTYPE_FORMALITY fixes and the hero-inclusion
 * improvement in the outerwear/shoe hero branch.
 *
 * Checks:
 *   A. Previously-zero → now-viable scenarios (7 false empties fixed)
 *   B. Correct-empty scenarios unchanged (SC2, SC3, SC4, AD4, AD5)
 *   C. Phase 3.1 signals (freshness penalty, riseHarmony) still fire
 *   D. generationPath metadata set correctly on relaxed-path outfits
 *   E. SUBTYPE_FORMALITY spot-checks for blouse and shirt
 */

import assert from 'assert';
import {
  WardrobeItem, UserProfile, OccasionTag, OutfitSet, WearEntry, OutfitReaction,
} from '../constants/types';
import { generateOutfitPool } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';
import { effectiveFormality } from '../constants/outfitScoring';

// ─── helpers ─────────────────────────────────────────────────────────────────

let _id = 0;
function uid() { return `i${++_id}`; }

function item(overrides: Partial<WardrobeItem> & Pick<WardrobeItem, 'category' | 'subType'>): WardrobeItem {
  return {
    id: uid(),
    name: `${overrides.subType}-${_id}`,
    colorFamily: 'black',
    pattern: 'solid',
    fabric: 'cotton',
    weight: 'medium',
    fit: undefined,
    formalityLevel: 3,
    occasionTags: [],
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    owned: true,
    photoUri: undefined,
    ...overrides,
  } as WardrobeItem;
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
    constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any', colorAversions: [] },
    ...overrides,
  } as UserProfile;
}

/** Call generateOutfitPool and return outfits for one scenario. */
function pool(
  items: WardrobeItem[],
  scenario: OccasionTag,
  prof: UserProfile = profile(),
  wearHistory: WearEntry[] = [],
  reactions: OutfitReaction[] = [],
): OutfitSet[] {
  const result = generateOutfitPool(
    items,
    prof,
    null,        // mood
    reactions,
    '2026-08-12',
    wearHistory,
    EMPTY_AFFINITY,
    null,        // weather
    true,        // isPremium
  );
  return result[scenario] ?? [];
}

// ─── shared pieces ────────────────────────────────────────────────────────────

function brunchBlouse(colorFamily: string): WardrobeItem {
  return item({ category: 'top', subType: 'blouse', colorFamily, fabric: 'linen', formalityLevel: 3, occasionTags: ['brunch', 'casual'] });
}

function baseWardrobe(extras: WardrobeItem[] = []): WardrobeItem[] {
  return [
    ...extras,
    item({ category: 'shoes',   subType: 'sneakers', colorFamily: 'white', formalityLevel: 1, occasionTags: ['casual', 'brunch'] }),
    item({ category: 'bag',     subType: 'tote',     colorFamily: 'black', formalityLevel: 4, occasionTags: ['casual', 'brunch', 'work'] }),
    item({ category: 'jewelry', subType: 'earrings', colorFamily: 'gold',  formalityLevel: 4, occasionTags: ['casual', 'brunch'] }),
  ];
}

// ─── A. Previously-zero → now viable ─────────────────────────────────────────

console.log('\n=== Phase 3.3A — A. False-empty fixes ===');

// A.1 — brunch with linen blouse + jeans
// SUBTYPE_FORMALITY['blouse'] was 6; avg(6,3)=4.5 passes [3,5] but avg(6+spread) caused
// other failures.  At F4: avg(4,3)=3.5 within brunch [3,5] ✓.
{
  const wardrobe = baseWardrobe([
    brunchBlouse('sage'),
    item({ category: 'bottom', subType: 'jeans', colorFamily: 'olive', formalityLevel: 3, occasionTags: ['casual', 'brunch'] }),
  ]);
  const outfits = pool(wardrobe, 'brunch');
  assert(outfits.length >= 1, `A.1: brunch linen blouse+jeans must generate ≥1 outfit (got ${outfits.length})`);
  console.log(`  ✓ A.1: brunch linen blouse+jeans → ${outfits.length} outfit(s)`);
}

// A.2 — brunch with cream silk blouse + chinos
{
  const wardrobe = baseWardrobe([
    item({ category: 'top',    subType: 'blouse', colorFamily: 'cream', fabric: 'silk',   formalityLevel: 3, occasionTags: ['work', 'brunch'] }),
    item({ category: 'bottom', subType: 'chinos', colorFamily: 'cream', formalityLevel: 4, occasionTags: ['casual', 'brunch'] }),
  ]);
  const outfits = pool(wardrobe, 'brunch');
  assert(outfits.length >= 1, `A.2: brunch cream blouse+chinos must generate ≥1 outfit (got ${outfits.length})`);
  console.log(`  ✓ A.2: brunch cream blouse+chinos → ${outfits.length} outfit(s)`);
}

// A.3 — brunch with white blouse + midi-skirt + blazer hero
// blazer(F6) is in HERO_SIGNATURE_SUBTYPES; hero-path is used.
// Shoes must be mid-formality (loafers F5) so spread(6−5=1) passes the ≤3 gate.
{
  const wardrobe = [
    item({ category: 'top',       subType: 'blouse',    colorFamily: 'white', fabric: 'cotton', formalityLevel: 3, occasionTags: ['casual', 'brunch'] }),
    item({ category: 'bottom',    subType: 'midi-skirt', colorFamily: 'black', formalityLevel: 5, occasionTags: ['casual', 'brunch', 'work'] }),
    item({ category: 'outerwear', subType: 'blazer',    colorFamily: 'black', formalityLevel: 6, occasionTags: ['work', 'brunch'] }),
    item({ category: 'shoes',     subType: 'loafers',   colorFamily: 'black', formalityLevel: 5, occasionTags: ['work', 'brunch'] }),
    item({ category: 'bag',       subType: 'tote',      colorFamily: 'black', formalityLevel: 4, occasionTags: ['casual', 'brunch', 'work'] }),
    item({ category: 'jewelry',   subType: 'earrings',  colorFamily: 'gold',  formalityLevel: 4, occasionTags: ['casual', 'brunch'] }),
  ];
  const outfits = pool(wardrobe, 'brunch');
  assert(outfits.length >= 1, `A.3: brunch blouse+midi-skirt+blazer must generate ≥1 outfit (got ${outfits.length})`);
  console.log(`  ✓ A.3: brunch blouse+midi-skirt+blazer → ${outfits.length} outfit(s)`);
}

// A.4 — brunch via fallback-cores path (no hero qualifies)
// linen blouse + midi-dress wardrobe, no HERO_SIGNATURE_SUBTYPES items → fallback.
{
  const wardrobe = baseWardrobe([
    item({ category: 'top',    subType: 'blouse',    colorFamily: 'white', fabric: 'linen', formalityLevel: 3, occasionTags: ['casual', 'brunch', 'date-casual'] }),
    item({ category: 'dress',  subType: 'midi-dress', colorFamily: 'blue',  fabric: 'cotton', formalityLevel: 3, occasionTags: ['brunch', 'casual', 'date-casual'] }),
    item({ category: 'bottom', subType: 'jeans',     colorFamily: 'blue',  formalityLevel: 3, occasionTags: ['casual', 'brunch'] }),
  ]);
  const outfits = pool(wardrobe, 'brunch');
  assert(outfits.length >= 1, `A.4: brunch linen blouse+midi-dress (fallback-cores path) must generate ≥1 outfit (got ${outfits.length})`);
  console.log(`  ✓ A.4: brunch linen blouse+midi-dress (fallback-cores) → ${outfits.length} outfit(s)`);
}

// A.5 — casual with slim blouse + high-rise jeans + sneakers
// Formality spread: blouse(F4) − sneakers(F1) = 3 → passes spread gate (≤3).
// Previously: blouse(F6) − sneakers(F1) = 5 > 3 → rejected.
{
  const slimBlouse = item({ id: 'a5-slim', category: 'top',    subType: 'blouse',   colorFamily: 'white', fit: 'slim',     formalityLevel: 3, occasionTags: ['casual', 'brunch'] });
  const ovsBlouse  = item({ id: 'a5-ovs',  category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'oversized', formalityLevel: 3, occasionTags: ['casual', 'brunch'] });
  const highJeans  = item({ id: 'a5-hj',   category: 'bottom', subType: 'jeans',    colorFamily: 'blue',  rise: 'high',    formalityLevel: 3, occasionTags: ['casual'] });
  const sneakers   = item({ id: 'a5-sn',   category: 'shoes',  subType: 'sneakers', colorFamily: 'white', formalityLevel: 1, occasionTags: ['casual', 'active'] });
  const tote       = item({ id: 'a5-to',   category: 'bag',    subType: 'tote',     colorFamily: 'black', formalityLevel: 4, occasionTags: ['casual'] });
  const earrings   = item({ id: 'a5-er',   category: 'jewelry', subType: 'earrings', colorFamily: 'gold',  formalityLevel: 4, occasionTags: ['casual'] });
  const wardrobe = [slimBlouse, ovsBlouse, highJeans, sneakers, tote, earrings];

  const outfits = pool(wardrobe, 'casual');
  assert(outfits.length >= 1, `A.5: casual slim-blouse+jeans+sneakers must generate ≥1 outfit (got ${outfits.length})`);
  // riseHarmony: slim blouse + high-rise should rank above oversized + high-rise
  const rank1 = outfits[0];
  const rank1TopItem = wardrobe.find(w => w.id === rank1.components.find(c => c.category === 'top')?.matchedItemId);
  assert(rank1TopItem?.fit === 'slim', `A.5: riseHarmony — slim blouse should rank #1 over oversized (got fit=${rank1TopItem?.fit})`);
  console.log(`  ✓ A.5: casual blouse+jeans+sneakers → ${outfits.length} outfit(s); slim ranks #1 (riseHarmony) ✓`);
}

// A.6 — casual: navy silk blouse outranks grey t-shirt (quality signal)
// Spread: blouse(F4) + chinos(F4) + sneakers(F1) = 4−1 = 3 → passes gate.
// Previously: blouse(F6) + chinos(F4) + sneakers(F1) = 6−1 = 5 > 3 → rejected.
{
  const navyBlouse = item({ id: 'a6-nb', category: 'top',    subType: 'blouse',   colorFamily: 'navy', fabric: 'silk', fit: 'slim', formalityLevel: 3, occasionTags: ['work', 'brunch'] });
  const greyTee    = item({ id: 'a6-gt', category: 'top',    subType: 't-shirt',  colorFamily: 'grey', fabric: 'cotton', formalityLevel: 2, occasionTags: ['casual'] });
  const chinos     = item({ id: 'a6-ch', category: 'bottom', subType: 'chinos',   colorFamily: 'grey', formalityLevel: 4, occasionTags: ['casual', 'work'] });
  const sneakers   = item({ id: 'a6-sn', category: 'shoes',  subType: 'sneakers', colorFamily: 'grey', formalityLevel: 1, occasionTags: ['casual'] });
  const tote       = item({ id: 'a6-to', category: 'bag',    subType: 'tote',     colorFamily: 'black', formalityLevel: 4, occasionTags: ['casual'] });
  const earrings   = item({ id: 'a6-er', category: 'jewelry', subType: 'earrings', colorFamily: 'gold', formalityLevel: 4, occasionTags: ['casual'] });
  const wardrobe = [navyBlouse, greyTee, chinos, sneakers, tote, earrings];

  const outfits = pool(wardrobe, 'casual');
  assert(outfits.length >= 1, `A.6: casual navy-blouse+chinos+sneakers must generate ≥1 outfit (got ${outfits.length})`);
  const rank1TopItem = wardrobe.find(w => w.id === outfits[0].components.find(c => c.category === 'top')?.matchedItemId);
  assert(rank1TopItem?.subType === 'blouse', `A.6: silk blouse should outrank grey t-shirt (got ${rank1TopItem?.subType})`);
  console.log(`  ✓ A.6: casual navy-blouse+chinos+sneakers → ${outfits.length} outfit(s); silk blouse ranks #1 ✓`);
}

// A.7 — interview with dress shirt + trousers
// SUBTYPE_FORMALITY['shirt'] was 5; avg(5,6)=5.5 < interview min [6,9] → rejected.
// Now SUBTYPE_FORMALITY['shirt'] = 6; avg(6,6)=6 = interview min → passes.
{
  const wardrobe = [
    item({ category: 'top',       subType: 'shirt',    colorFamily: 'white',    fabric: 'cotton', fit: 'tailored', formalityLevel: 6, occasionTags: ['work', 'interview', 'event'] }),
    item({ category: 'bottom',    subType: 'trousers', colorFamily: 'charcoal', fabric: 'wool',   formalityLevel: 6, occasionTags: ['work', 'interview'] }),
    item({ category: 'outerwear', subType: 'blazer',   colorFamily: 'charcoal', fabric: 'wool',   formalityLevel: 6, occasionTags: ['work', 'interview'] }),
    item({ category: 'shoes',     subType: 'pumps',    colorFamily: 'black',    fabric: 'leather', formalityLevel: 6, occasionTags: ['work', 'interview'] }),
    item({ category: 'bag',       subType: 'tote',     colorFamily: 'black',    formalityLevel: 4, occasionTags: ['work', 'interview'] }),
    item({ category: 'jewelry',   subType: 'earrings', colorFamily: 'gold',     formalityLevel: 4, occasionTags: ['work', 'interview'] }),
  ];
  const outfits = pool(wardrobe, 'interview');
  assert(outfits.length >= 1, `A.7: interview shirt+trousers+blazer must generate ≥1 outfit (got ${outfits.length})`);
  console.log(`  ✓ A.7: interview shirt+trousers+blazer → ${outfits.length} outfit(s)`);
}

// ─── B. Correct empty states remain empty ────────────────────────────────────

console.log('\n=== Phase 3.3A — B. Correct empties unchanged ===');

// B.1 — no footwear → shoe gate rejects all outfits
{
  const wardrobe = [
    item({ category: 'top',     subType: 'blouse',   colorFamily: 'white', formalityLevel: 3, occasionTags: ['casual', 'brunch'] }),
    item({ category: 'bottom',  subType: 'jeans',    colorFamily: 'blue',  formalityLevel: 3, occasionTags: ['casual', 'brunch'] }),
    item({ category: 'bag',     subType: 'tote',     colorFamily: 'black', formalityLevel: 4, occasionTags: ['casual'] }),
    item({ category: 'jewelry', subType: 'earrings', colorFamily: 'gold',  formalityLevel: 4, occasionTags: ['casual'] }),
  ];
  const outfits = pool(wardrobe, 'casual');
  assert(outfits.length === 0, `B.1: no shoes → must generate 0 outfits (got ${outfits.length})`);
  console.log(`  ✓ B.1: no footwear → 0 outfits (correct empty)`);
}

// B.2 — casual-only wardrobe (max F3); work requires [4,7]
{
  const wardrobe = [
    item({ category: 'top',     subType: 't-shirt',  colorFamily: 'white', formalityLevel: 2, occasionTags: ['casual'] }),
    item({ category: 'bottom',  subType: 'jeans',    colorFamily: 'blue',  formalityLevel: 3, occasionTags: ['casual'] }),
    item({ category: 'shoes',   subType: 'sneakers', colorFamily: 'white', formalityLevel: 1, occasionTags: ['casual'] }),
    item({ category: 'bag',     subType: 'backpack', colorFamily: 'black', formalityLevel: 1, occasionTags: ['casual'] }),
    item({ category: 'jewelry', subType: 'earrings', colorFamily: 'gold',  formalityLevel: 4, occasionTags: ['casual'] }),
  ];
  const outfits = pool(wardrobe, 'work');
  assert(outfits.length === 0, `B.2: casual-only wardrobe → 0 work outfits (got ${outfits.length})`);
  console.log(`  ✓ B.2: casual-only wardrobe → 0 work outfits (correct empty)`);
}

// B.3 — double-volume gate: oversized top + loose bottom → hard reject
// After blouse=F4 fix, brunch formality passes, but volume gate still fires.
{
  const wardrobe = [
    item({ category: 'top',     subType: 'blouse',   colorFamily: 'sage',  fit: 'oversized', formalityLevel: 3, occasionTags: ['casual', 'brunch'] }),
    item({ category: 'bottom',  subType: 'wide-leg', colorFamily: 'olive', fit: 'loose',     formalityLevel: 5, occasionTags: ['casual', 'brunch'] }),
    item({ category: 'shoes',   subType: 'sneakers', colorFamily: 'white', formalityLevel: 1, occasionTags: ['casual', 'brunch'] }),
    item({ category: 'bag',     subType: 'tote',     colorFamily: 'black', formalityLevel: 4, occasionTags: ['casual', 'brunch'] }),
    item({ category: 'jewelry', subType: 'earrings', colorFamily: 'gold',  formalityLevel: 4, occasionTags: ['casual', 'brunch'] }),
  ];
  const outfits = pool(wardrobe, 'brunch');
  assert(outfits.length === 0, `B.3: oversized+loose double-volume → 0 brunch outfits (got ${outfits.length})`);
  console.log(`  ✓ B.3: double-volume (oversized blouse + loose wide-leg) → 0 outfits (correct empty)`);
}

// B.4 — formality-spread > 3 hard gate: silk(F7) + jeans(F3) + stilettos(F7)
// spread = max(SUBTYPE['blouse']=4, SUBTYPE['jeans']=3, SUBTYPE['stilettos']=7) − min = 7−3 = 4 > 3
{
  const wardrobe = [
    item({ category: 'top',     subType: 'blouse',    colorFamily: 'cream', fabric: 'silk',    formalityLevel: 7, occasionTags: ['event', 'work'] }),
    item({ category: 'bottom',  subType: 'jeans',     colorFamily: 'blue',  formalityLevel: 3, occasionTags: ['casual'] }),
    item({ category: 'shoes',   subType: 'stilettos', colorFamily: 'black', formalityLevel: 7, occasionTags: ['event'] }),
    item({ category: 'bag',     subType: 'clutch',    colorFamily: 'black', formalityLevel: 6, occasionTags: ['event'] }),
    item({ category: 'jewelry', subType: 'earrings',  colorFamily: 'gold',  formalityLevel: 4, occasionTags: ['event'] }),
  ];
  // All items have very different formality subtypes; spread will exceed 3.
  const outfits = pool(wardrobe, 'casual');
  assert(outfits.length === 0, `B.4: spread > 3 → 0 outfits (got ${outfits.length})`);
  console.log(`  ✓ B.4: silk+jeans+stilettos spread > 3 → 0 outfits (correct empty)`);
}

// ─── C. Phase 3.1 signals still fire ─────────────────────────────────────────

console.log('\n=== Phase 3.3A — C. Phase 3.1 signal preservation ===');

// C.1 — Freshness penalty: recently-worn outfit ranks below a fresh alternative
{
  const blouseWorn  = item({ id: 'c1-worn',  category: 'top',    subType: 'blouse',   colorFamily: 'cream', fabric: 'silk',   formalityLevel: 4, occasionTags: ['work', 'brunch'] });
  const blouseFresh = item({ id: 'c1-fresh', category: 'top',    subType: 'blouse',   colorFamily: 'navy',  fabric: 'cotton', formalityLevel: 4, occasionTags: ['work'] });
  const trousers    = item({ id: 'c1-trs',   category: 'bottom', subType: 'trousers', colorFamily: 'camel', fabric: 'linen',  formalityLevel: 4, occasionTags: ['work'] });
  const loafers     = item({ id: 'c1-loa',   category: 'shoes',  subType: 'loafers',  colorFamily: 'tan',   formalityLevel: 5, occasionTags: ['work'] });
  const tote        = item({ id: 'c1-to',    category: 'bag',    subType: 'tote',     colorFamily: 'black', formalityLevel: 4, occasionTags: ['work'] });
  const earrings    = item({ id: 'c1-er',    category: 'jewelry', subType: 'earrings', colorFamily: 'gold', formalityLevel: 4, occasionTags: ['work'] });

  const wornFp = [blouseWorn.id, trousers.id, loafers.id].sort().join('|');
  const wearHistory: WearEntry[] = [{
    id: 'w1',
    date: '2026-08-11',       // yesterday
    occasion: 'work',
    outfitFingerprint: wornFp,
    itemIds: [blouseWorn.id, trousers.id, loafers.id],
    loggedAt: '2026-08-11T09:00:00Z',
  }];

  const wardrobe = [blouseWorn, blouseFresh, trousers, loafers, tote, earrings];
  const outfits = pool(wardrobe, 'work', profile({ styleGoalPrimary: 'classic' }), wearHistory);

  assert(outfits.length >= 2, `C.1: need ≥2 work outfits for freshness test (got ${outfits.length})`);
  const rank1TopItem = wardrobe.find(w => w.id === outfits[0].components.find(c => c.category === 'top')?.matchedItemId);
  assert(rank1TopItem?.id === blouseFresh.id,
    `C.1: fresh navy blouse should rank #1 (rank 1 top: ${rank1TopItem?.colorFamily}/${rank1TopItem?.subType})`);
  console.log(`  ✓ C.1: freshness signal fires — fresh navy blouse ranks #1`);
}

// C.2 — riseHarmony: slim top + high-rise ranks above oversized + high-rise
{
  const slimBlouse = item({ id: 'c2-sl', category: 'top',    subType: 'blouse',   colorFamily: 'white', fit: 'slim',     formalityLevel: 3, occasionTags: ['casual', 'brunch'] });
  const ovsBlouse  = item({ id: 'c2-ov', category: 'top',    subType: 'blouse',   colorFamily: 'cream', fit: 'oversized', formalityLevel: 3, occasionTags: ['casual', 'brunch'] });
  const highJeans  = item({ id: 'c2-hj', category: 'bottom', subType: 'jeans',    colorFamily: 'blue',  rise: 'high',    formalityLevel: 3, occasionTags: ['casual'] });
  const sneakers   = item({ id: 'c2-sn', category: 'shoes',  subType: 'sneakers', colorFamily: 'white', formalityLevel: 1, occasionTags: ['casual'] });
  const tote       = item({ id: 'c2-to', category: 'bag',    subType: 'tote',     colorFamily: 'black', formalityLevel: 4, occasionTags: ['casual'] });
  const earrings   = item({ id: 'c2-er', category: 'jewelry', subType: 'earrings', colorFamily: 'gold', formalityLevel: 4, occasionTags: ['casual'] });

  const wardrobe = [slimBlouse, ovsBlouse, highJeans, sneakers, tote, earrings];
  const outfits = pool(wardrobe, 'casual');

  assert(outfits.length >= 1, `C.2: need ≥1 casual outfit for riseHarmony test (got ${outfits.length})`);
  const rank1TopItem = wardrobe.find(w => w.id === outfits[0].components.find(c => c.category === 'top')?.matchedItemId);
  assert(rank1TopItem?.fit === 'slim',
    `C.2: riseHarmony — slim top should rank above oversized+high-rise (got fit=${rank1TopItem?.fit})`);
  console.log(`  ✓ C.2: riseHarmony fires — slim blouse + high-rise ranks #1`);
}

// ─── D. generationPath metadata ──────────────────────────────────────────────

console.log('\n=== Phase 3.3A — D. generationPath metadata ===');

// D.1 — Hero-seeded outfit: generationPath absent/undefined ('strict')
{
  const wardrobe = [
    item({ category: 'outerwear', subType: 'blazer',   colorFamily: 'black', fabric: 'wool',    formalityLevel: 6, occasionTags: ['work', 'brunch'] }),
    item({ category: 'top',       subType: 'blouse',   colorFamily: 'white', formalityLevel: 3, occasionTags: ['work', 'brunch'] }),
    item({ category: 'bottom',    subType: 'trousers', colorFamily: 'black', formalityLevel: 6, occasionTags: ['work'] }),
    item({ category: 'shoes',     subType: 'loafers',  colorFamily: 'black', formalityLevel: 5, occasionTags: ['work'] }),
    item({ category: 'bag',       subType: 'tote',     colorFamily: 'black', formalityLevel: 4, occasionTags: ['work'] }),
    item({ category: 'jewelry',   subType: 'earrings', colorFamily: 'gold',  formalityLevel: 4, occasionTags: ['work'] }),
  ];
  const outfits = pool(wardrobe, 'work');
  assert(outfits.length >= 1, `D.1: blazer wardrobe must generate ≥1 work outfit (got ${outfits.length})`);
  const strictOutfits = outfits.filter(o => o.generationPath === undefined || o.generationPath === 'strict');
  assert(strictOutfits.length >= 1, `D.1: expect ≥1 strict/hero-seeded outfit (got ${strictOutfits.length})`);
  const relaxed = outfits.filter(o => o.generationPath === 'relaxed');
  assert(relaxed.length === 0, `D.1: expect 0 relaxed outfits when blazer hero available (got ${relaxed.length})`);
  console.log(`  ✓ D.1: hero-seeded outfits: ${strictOutfits.length} strict; ${relaxed.length} relaxed`);
}

// D.2 — generationPath is always a valid value when present.
// We verify: (a) every outfit has generationPath ∈ {undefined, 'strict', 'relaxed'},
// and (b) the field is defined on the OutfitSet type (compile-time).
// The full fallback-cores path is exercised in the benchmark (F5 scenario).
{
  const d2wardrobe = baseWardrobe([
    item({ category: 'top',    subType: 'blouse',    colorFamily: 'white', fabric: 'linen', formalityLevel: 3, occasionTags: ['casual', 'brunch'] }),
    item({ category: 'bottom', subType: 'jeans',     colorFamily: 'blue',  formalityLevel: 3, occasionTags: ['casual', 'brunch'] }),
  ]);
  const outfits = pool(d2wardrobe, 'brunch');
  // compile-time: verify OutfitSet accepts generationPath
  const _typeCheck: typeof outfits[0]['generationPath'] extends ('strict' | 'relaxed' | undefined) ? true : never = true;
  void _typeCheck;

  assert(outfits.length >= 1, `D.2: brunch wardrobe must generate ≥1 outfit (got ${outfits.length})`);
  const VALID = new Set(['strict', 'relaxed', undefined]);
  for (const o of outfits) {
    assert(VALID.has(o.generationPath),
      `D.2: generationPath must be 'strict' | 'relaxed' | undefined (got ${JSON.stringify(o.generationPath)})`);
  }
  console.log(`  ✓ D.2: generationPath is always a valid value (verified ${outfits.length} outfit(s))`);
}

// ─── E. SUBTYPE_FORMALITY spot-checks ────────────────────────────────────────

console.log('\n=== Phase 3.3A — E. SUBTYPE_FORMALITY spot-checks ===');

// E.1 — blouse is F4 (smart-casual centre of its F3–F7 range)
{
  const blouseItem = item({ category: 'top', subType: 'blouse' });
  assert(effectiveFormality(blouseItem) === 4,
    `E.1: SUBTYPE_FORMALITY['blouse'] must be 4 (got ${effectiveFormality(blouseItem)})`);
  console.log(`  ✓ E.1: blouse → F4`);
}

// E.2 — shirt is F6 (dress shirt / Oxford is business-formal)
{
  const shirtItem = item({ category: 'top', subType: 'shirt' });
  assert(effectiveFormality(shirtItem) === 6,
    `E.2: SUBTYPE_FORMALITY['shirt'] must be 6 (got ${effectiveFormality(shirtItem)})`);
  console.log(`  ✓ E.2: shirt → F6`);
}

// E.3 — blouse(F4) is within brunch formality band [3,5]
{
  const f = effectiveFormality(item({ category: 'top', subType: 'blouse', colorFamily: 'white' }));
  assert(f >= 3 && f <= 5, `E.3: blouse formality must be within brunch band [3,5] (got ${f})`);
  console.log(`  ✓ E.3: blouse F${f} ∈ brunch [3,5]`);
}

// E.4 — shirt(F6) is within interview formality band [6,9]
{
  const f = effectiveFormality(item({ category: 'top', subType: 'shirt', colorFamily: 'white' }));
  assert(f >= 6 && f <= 9, `E.4: shirt formality must be within interview band [6,9] (got ${f})`);
  console.log(`  ✓ E.4: shirt F${f} ∈ interview [6,9]`);
}

// E.5 — blouse(F4) + sneakers(F1) spread = 3 (at boundary, passes ≤3 gate)
{
  const blouseF = effectiveFormality(item({ category: 'top',   subType: 'blouse' }));
  const snkrF   = effectiveFormality(item({ category: 'shoes', subType: 'sneakers' }));
  const spread  = blouseF - snkrF;
  assert(spread === 3, `E.5: blouse(F${blouseF}) − sneakers(F${snkrF}) must be 3 (got ${spread})`);
  console.log(`  ✓ E.5: blouse−sneakers spread = ${spread} (passes ≤3 gate)`);
}

// ─── done ─────────────────────────────────────────────────────────────────────

console.log('\n=== Phase 3.3A: all tests passed ===');
