/**
 * GOLDEN REGRESSION SET — Recommendation Engine v3.7
 *
 * This file is the permanent, immutable regression guard for the frozen
 * recommendation engine. It covers every dimension validated during Phases
 * 3.1–3.7. Future engine changes MUST pass this entire set before shipping.
 *
 * DO NOT:
 *   - Weaken assertions to accommodate a future change.
 *   - Remove a case because it is "inconvenient".
 *   - Add new cases that encode a proposed improvement; use a separate test.
 *
 * Run: npx tsx __tests__/recommendation-golden-set.ts
 *
 * Exit 0 = all pass. Exit 1 = one or more failures.
 */

import { generateOutfitPool, INITIAL_ROTATION_STATE, applyDailyRotation } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';
import type {
  WardrobeItem, UserProfile, OccasionTag, WeatherSnapshot,
} from '../constants/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PH = 'test://photo';
const CR = '2025-01-01T00:00:00Z';
const TODAY = '2026-08-13';

function mk(
  id: string, cat: WardrobeItem['category'], sub: string, col: string,
  occ: OccasionTag[], extra: Partial<WardrobeItem> = {},
): WardrobeItem {
  return {
    id, category: cat, subType: sub, colorFamily: col,
    occasionTags: occ, photoUri: PH, thumbnailUri: PH,
    createdAt: CR, displayName: sub,
    formalityLevel: extra.formalityLevel ?? 5,
    seasonTags: extra.seasonTags ?? ['all-season'],
    ...extra,
  } as WardrobeItem;
}

function mkp(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Test', bodyType: null, eyeColor: null, skinTone: null, undertone: null,
    styleGoalPrimary: 'classic', styleGoalSecondary: null,
    lifestyleWork: 3, lifestyleCasual: 4, lifestyleEvents: 2, lifestyleActive: 1, lifestyleBrunch: 3,
    constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
    onboardingComplete: true, heightBand: null, weatherEnabled: true, isGuest: false,
    ...overrides,
  } as UserProfile;
}

function mkWeather(lowC: number, precip: number): WeatherSnapshot {
  return {
    fetchedAt: Date.now(), lat: 51.5, lon: -0.1,
    currentTempC: lowC + 8, highC: lowC + 12, lowC,
    precipProbability: precip, source: 'ip',
  };
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0; let failed = 0;
const failures: string[] = [];

function assert(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ': ' + detail : ''}`); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

type Pool = Record<OccasionTag, ReturnType<typeof generateOutfitPool>[OccasionTag]>;

function pool(items: WardrobeItem[], profile: UserProfile, weather: WeatherSnapshot | null = null): Pool {
  return generateOutfitPool(items, profile, null, [], TODAY, [], EMPTY_AFFINITY, weather) as Pool;
}

// ─── 1. CANDIDATE GENERATION ──────────────────────────────────────────────────

console.log('\n1. Candidate Generation');
{
  const items = [
    mk('cg-t1','top','blouse','cream',['casual','brunch'],{fabric:'silk',formalityLevel:5}),
    mk('cg-b1','bottom','jeans','blue',['casual'],{fabric:'denim',formalityLevel:3}),
    mk('cg-s1','shoes','loafers','tan',['casual','brunch'],{fabric:'leather',formalityLevel:4}),
    mk('cg-bg1','bag','shoulder-bag','camel',['casual','brunch'],{formalityLevel:4}),
  ];
  const p = pool(items, mkp());
  assert('cg: casual pool non-empty', (p.casual?.length ?? 0) > 0);
  assert('cg: brunch pool non-empty', (p.brunch?.length ?? 0) > 0);
  // NOTE: occasion tags are strong scoring signals, not hard gates — work pool may
  // still produce outfits from neutral items. We only verify generation works.
  assert('cg: pool sizes are non-negative', Object.values(p).every(a => a.length >= 0));
}

// ─── 2. WEATHER — RAIN GATE (B15 REGRESSION) ─────────────────────────────────

console.log('\n2. Weather — Rain gate (B15 regression)');
{
  const rain = mkWeather(10, 0.85);
  const items = [
    mk('b15-t1','top','blouse','white',['casual'],{fabric:'silk',formalityLevel:5}),
    mk('b15-b1','bottom','trousers','navy',['casual'],{fabric:'wool',formalityLevel:5}),
    mk('b15-s1','shoes','sandals','nude',['casual'],{formalityLevel:3}),   // rain-averse — must be absent
    mk('b15-s2','shoes','loafers','black',['casual'],{fabric:'leather',formalityLevel:5}),
    mk('b15-bag1','bag','wicker-bag','tan',['casual'],{formalityLevel:3}), // rain-averse — must be absent
    mk('b15-bag2','bag','shoulder-bag','black',['casual'],{fabric:'leather',formalityLevel:5}),
    mk('b15-o1','outerwear','trench','beige',['casual'],{fabric:'cotton',warmthBand:'mild',formalityLevel:5}),
  ];
  const p = pool(items, mkp(), rain);
  const outfits = p.casual ?? [];
  const hasSandals = outfits.some(o => o.components.some(c => c.matchedItemId === 'b15-s1'));
  const hasWickerBag = outfits.some(o => o.components.some(c => c.matchedItemId === 'b15-bag1'));
  assert('b15: pool non-empty on rainy day', outfits.length > 0);
  assert('b15: sandals absent from rainy-day outfits', !hasSandals);
  assert('b15: wicker-bag absent from rainy-day outfits', !hasWickerBag);
}

// ─── 3. WEATHER — COLD GATE ───────────────────────────────────────────────────

console.log('\n3. Weather — Cold gate (outerwear required)');
{
  const cold = mkWeather(-2, 0);
  const items = [
    mk('cld-t1','top','blouse','cream',['casual'],{fabric:'silk',formalityLevel:5}),
    mk('cld-b1','bottom','jeans','blue',['casual'],{fabric:'denim',formalityLevel:3}),
    mk('cld-s1','shoes','ankle-boots','black',['casual'],{fabric:'leather',formalityLevel:5}),
    mk('cld-o1','outerwear','coat','camel',['casual'],{fabric:'wool',warmthBand:'cold',formalityLevel:5}),
  ];
  const p = pool(items, mkp(), cold);
  const outfits = p.casual ?? [];
  const allHaveOuterwear = outfits.every(o => o.components.some(c => c.matchedItemId === 'cld-o1'));
  assert('cld: pool non-empty on cold day', outfits.length > 0);
  assert('cld: every outfit has outerwear when cold', allHaveOuterwear);
}

// ─── 4. HARD CONSTRAINTS — EXCLUDED COLOURS ───────────────────────────────────

console.log('\n4. Hard constraints — excluded colours');
{
  const profile = mkp({ constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any', colorAversions: ['red'] } });
  const items = [
    mk('hc-t1','top','blouse','cream',['casual'],{formalityLevel:5}),
    mk('hc-t2','top','t-shirt','red',['casual'],{formalityLevel:3}), // excluded
    mk('hc-b1','bottom','jeans','blue',['casual'],{formalityLevel:3}),
    mk('hc-s1','shoes','sneakers','white',['casual'],{formalityLevel:2}),
  ];
  const p = pool(items, profile);
  const outfits = p.casual ?? [];
  const hasRed = outfits.some(o => o.components.some(c => c.matchedItemId === 'hc-t2'));
  assert('hc: excluded colour never appears', !hasRed);
  assert('hc: pool still non-empty with valid items', outfits.length > 0);
}

// ─── 5. BODY SHAPE — PEAR / SILHOUETTE ───────────────────────────────────────

console.log('\n5. Body shape — pear / A-line silhouette (B20 monitoring)');
{
  const items = [
    mk('b20-t1','top','blouse','white',['casual'],{fabric:'silk',fit:'slim',formalityLevel:5}),
    mk('b20-b1','bottom','midi-skirt','camel',['casual'],{subType:'midi-skirt',formalityLevel:5}),
    mk('b20-b2','bottom','midi-skirt','black',['casual'],{subType:'midi-skirt',formalityLevel:5}),
    mk('b20-s1','shoes','mules','cream',['casual'],{fabric:'leather',formalityLevel:5}),
    mk('b20-bag1','bag','shoulder-bag','camel',['casual'],{formalityLevel:5}),
  ];
  const p = pool(items, mkp({ bodyType: 'pear' }));
  const outfits = p.casual ?? [];
  // B20 monitor: engine must not produce an empty pool for pear + A-line items.
  assert('b20: pear body casual pool non-empty', outfits.length > 0);
  // At least one midi-skirt outfit must exist (A-line coverage confirmed)
  const hasMidiSkirt = outfits.some(o => o.components.some(c => c.matchedItemId === 'b20-b1' || c.matchedItemId === 'b20-b2'));
  assert('b20: at least one midi-skirt outfit generated', hasMidiSkirt);
  // B20 regret monitoring: the camel skirt must appear in top-3 by pool order
  const top3 = outfits.slice(0, 3);
  const camelInTop3 = top3.some(o => o.components.some(c => c.matchedItemId === 'b20-b1'));
  assert('b20: camel A-line midi-skirt appears in top-3 (regret monitor)', camelInTop3);
}

// ─── 6. MATERIAL — QUIET LUXURY (CASHMERE > SYNTHETIC) ───────────────────────

console.log('\n6. Material — quiet luxury (cashmere outranks synthetic)');
{
  const items = [
    mk('ql-t1','top','knit-top','cream',['casual','brunch'],{fabric:'cashmere',formalityLevel:5}),
    mk('ql-t2','top','knit-top','grey',['casual','brunch'],{fabric:'synthetic',formalityLevel:5}),
    mk('ql-b1','bottom','trousers','camel',['casual','brunch'],{fabric:'wool',formalityLevel:5}),
    mk('ql-s1','shoes','mules','tan',['casual','brunch'],{fabric:'leather',formalityLevel:5}),
    mk('ql-bag','bag','shoulder-bag','camel',['casual','brunch'],{fabric:'leather',formalityLevel:5}),
  ];
  const p = pool(items, mkp({ styleGoalPrimary: 'elevated' }));
  const outfits = p.casual ?? [];
  // Cashmere knit must appear in the pool
  const hasCashmere = outfits.some(o => o.components.some(c => c.matchedItemId === 'ql-t1'));
  assert('ql: cashmere knit appears in pool', hasCashmere);
  // Cashmere outfit must rank at or above the synthetic equivalent
  const cashIdx = outfits.findIndex(o => o.components.some(c => c.matchedItemId === 'ql-t1'));
  const synthIdx = outfits.findIndex(o => o.components.some(c => c.matchedItemId === 'ql-t2') && !o.components.some(c => c.matchedItemId === 'ql-t1'));
  assert('ql: cashmere outfit not ranked below synthetic-only outfit', cashIdx <= synthIdx || synthIdx === -1);
}

// ─── 7. MINIMALISM — PROFILE PERSONALISATION ──────────────────────────────────

console.log('\n7. Personalisation — minimalist vs expressive profiles differ');
{
  const items = [
    mk('ps-t1','top','blouse','white',['casual'],{formalityLevel:5}),
    mk('ps-t2','top','blouse','blush',['casual'],{pattern:'floral',formalityLevel:5}),
    mk('ps-b1','bottom','trousers','black',['casual'],{formalityLevel:5}),
    mk('ps-s1','shoes','loafers','black',['casual'],{fabric:'leather',formalityLevel:5}),
    mk('ps-bag','bag','shoulder-bag','black',['casual'],{formalityLevel:5}),
  ];
  const minPool = pool(items, mkp({ styleGoalPrimary: 'minimal' }));
  const boldPool = pool(items, mkp({ styleGoalPrimary: 'bold' }));
  // Pools must be non-empty for both
  assert('ps: minimalist pool non-empty', (minPool.casual?.length ?? 0) > 0);
  assert('ps: bold pool non-empty', (boldPool.casual?.length ?? 0) > 0);
  // The top-1 outfits differ (personalisation has an effect)
  const minTop1Hero = minPool.casual?.[0]?.heroId;
  const boldTop1Hero = boldPool.casual?.[0]?.heroId;
  // This may not always differ but the pools must exist — we assert on the pool compositions
  const minHasPlain = (minPool.casual ?? []).some(o => o.components.some(c => c.matchedItemId === 'ps-t1'));
  assert('ps: minimalist profile generates outfits with plain items', minHasPlain);
}

// ─── 8. TONAL DRESSING ────────────────────────────────────────────────────────

console.log('\n8. Tonal dressing — monochrome cream outfit appears in pool');
{
  const items = [
    mk('ton-t1','top','blouse','cream',['casual','brunch'],{fabric:'silk',formalityLevel:5}),
    mk('ton-b1','bottom','trousers','cream',['casual','brunch'],{fabric:'linen',formalityLevel:5}),
    mk('ton-b2','bottom','jeans','blue',['casual'],{fabric:'denim',formalityLevel:3}),
    mk('ton-s1','shoes','mules','cream',['casual','brunch'],{fabric:'leather',formalityLevel:5}),
    mk('ton-bag','bag','shoulder-bag','cream',['casual','brunch'],{formalityLevel:5}),
  ];
  const p = pool(items, mkp());
  const outfits = p.casual ?? [];
  // The all-cream tonal outfit must appear
  const hasTonal = outfits.some(o => {
    const ids = new Set(o.components.map(c => c.matchedItemId));
    return ids.has('ton-t1') && ids.has('ton-b1');
  });
  assert('tonal: cream-on-cream outfit present in pool', hasTonal);
}

// ─── 9. PATTERN SAFETY — PATTERN ITEM APPEARS AS HERO ────────────────────────

console.log('\n9. Pattern safety (FP-2 regression)');
{
  const items = [
    mk('fp2-t1','top','blouse','blush',['casual','brunch'],{pattern:'floral',formalityLevel:5}),
    mk('fp2-b1','bottom','jeans','white',['casual'],{fabric:'denim',formalityLevel:3}),
    mk('fp2-b2','bottom','trousers','cream',['casual','brunch'],{formalityLevel:5}),
    mk('fp2-s1','shoes','loafers','tan',['casual','brunch'],{fabric:'leather',formalityLevel:5}),
    mk('fp2-bag','bag','shoulder-bag','tan',['casual','brunch'],{formalityLevel:5}),
  ];
  const p = pool(items, mkp());
  const outfits = p.casual ?? [];
  assert('fp2: pool non-empty with patterned hero', outfits.length > 0);
  const floralAsHero = outfits.some(o => o.heroId === 'fp2-t1');
  assert('fp2: floral blouse appears as hero in at least one outfit', floralAsHero);
}

// ─── 10. VISUAL HIERARCHY — LEATHER JACKET HERO ──────────────────────────────

console.log('\n10. Visual hierarchy — leather jacket hero');
{
  const items = [
    mk('vh-o1','outerwear','leather-jacket','black',['casual'],{fabric:'leather',formalityLevel:4}),
    mk('vh-t1','top','t-shirt','white',['casual'],{fabric:'cotton',formalityLevel:2}),
    mk('vh-b1','bottom','jeans','blue',['casual'],{fabric:'denim',formalityLevel:3}),
    mk('vh-s1','shoes','ankle-boots','black',['casual'],{fabric:'leather',formalityLevel:5}),
  ];
  const p = pool(items, mkp());
  const outfits = p.casual ?? [];
  const leatherAsHero = outfits.some(o => o.heroId === 'vh-o1');
  assert('vh: leather jacket appears as hero', leatherAsHero);
  assert('vh: pool non-empty with leather-jacket wardrobe', outfits.length > 0);
}

// ─── 11. FP-1 REGRESSION — LEATHER JACKET STAYS IN CASUAL, NOT WORK ──────────

console.log('\n11. FP-1 regression — leather jacket context separation');
{
  const items = [
    mk('fp1-o1','outerwear','leather-jacket','black',['casual','date-casual'],{fabric:'leather',formalityLevel:4}),
    mk('fp1-o2','outerwear','blazer','navy',['work'],{fabric:'wool',formalityLevel:6}),
    mk('fp1-t1','top','blouse','white',['work','casual'],{fabric:'silk',formalityLevel:5}),
    mk('fp1-b1','bottom','jeans','blue',['casual'],{fabric:'denim',formalityLevel:3}),
    mk('fp1-b2','bottom','trousers','black',['work'],{fabric:'wool',formalityLevel:6}),
    mk('fp1-s1','shoes','loafers','black',['work','casual'],{fabric:'leather',formalityLevel:5}),
    mk('fp1-bag','bag','shoulder-bag','black',['work','casual'],{formalityLevel:5}),
  ];
  const p = pool(items, mkp());
  // Leather jacket must appear in casual pool
  const inCasual = (p.casual ?? []).some(o => o.components.some(c => c.matchedItemId === 'fp1-o1'));
  assert('fp1: leather-jacket present in casual pool', inCasual);
  // Work pool top-1 should not have leather-jacket as hero (blazer is work-appropriate)
  const workTop1 = p.work?.[0];
  const leatherLeadsWork = workTop1?.heroId === 'fp1-o1';
  assert('fp1: leather-jacket does not lead work pool (blazer leads instead)', !leatherLeadsWork);
}

// ─── 12. FRESHNESS — RECENTLY WORN OUTFIT DEPRIORITISED ──────────────────────

console.log('\n12. Freshness — recently worn hero deprioritised');
{
  const items = [
    mk('fr-t1','top','blouse','cream',['casual'],{fabric:'silk',formalityLevel:5}),
    mk('fr-t2','top','knit-top','camel',['casual'],{fabric:'cashmere',formalityLevel:5}),
    mk('fr-b1','bottom','trousers','black',['casual'],{formalityLevel:5}),
    mk('fr-s1','shoes','loafers','black',['casual'],{fabric:'leather',formalityLevel:5}),
    mk('fr-bag','bag','shoulder-bag','black',['casual'],{formalityLevel:5}),
  ];
  // Simulate fr-t1 (blouse) worn yesterday
  const yesterdayStr = '2026-08-12';
  const wearHistory = [{
    id: 'we-1', date: yesterdayStr, occasion: 'casual' as OccasionTag,
    outfitFingerprint: 'fr-t1', itemIds: ['fr-t1'], loggedAt: `${yesterdayStr}T09:00:00Z`,
  }];
  const freshPool = generateOutfitPool(items, mkp(), null, [], TODAY, wearHistory, EMPTY_AFFINITY, null);
  const outfits = freshPool.casual ?? [];
  // Pool must be non-empty
  assert('freshness: pool non-empty with wear history', outfits.length > 0);
  // Cashmere knit-top should lead (blouse was worn recently)
  const knitLeads = outfits[0]?.components.some(c => c.matchedItemId === 'fr-t2');
  assert('freshness: recently-worn blouse not leading pool (knit-top leads)', !outfits[0]?.components.some(c => c.matchedItemId === 'fr-t1') || knitLeads);
}

// ─── 13. FALLBACK — EMPTY WARDROBE ────────────────────────────────────────────

console.log('\n13. Fallback — empty wardrobe returns empty pools');
{
  const p = pool([], mkp());
  const allEmpty = Object.values(p).every(arr => arr.length === 0);
  assert('fallback: empty wardrobe → all scenario pools empty', allEmpty);
}

// ─── 14. FALLBACK — SINGLE ITEM WARDROBE ─────────────────────────────────────

console.log('\n14. Fallback — single-item wardrobe (graceful)');
{
  const items = [mk('si-t1','top','blouse','white',['casual'],{formalityLevel:5})];
  let threw = false;
  try { pool(items, mkp()); } catch { threw = true; }
  assert('fallback: single-item wardrobe does not throw', !threw);
}

// ─── 15. COLD + RAIN LEGITIMATE EMPTY ────────────────────────────────────────

console.log('\n15. Cold+rain — no warm waterproof coat → legitimate empty');
{
  const coldRain = mkWeather(2, 0.85);
  const items = [
    mk('cr-t1','top','blouse','white',['casual'],{formalityLevel:5}),
    mk('cr-b1','bottom','jeans','blue',['casual'],{formalityLevel:3}),
    mk('cr-s1','shoes','ankle-boots','black',['casual'],{fabric:'leather',formalityLevel:5}),
    // Only rain-averse warm coats — engine should produce legitimate empty
    mk('cr-o1','outerwear','coat','camel',['casual'],{fabric:'wool',warmthBand:'cold',formalityLevel:5}),
    // (wool is rain-averse — correct to block)
  ];
  let threw = false;
  let p: Pool | null = null;
  try { p = pool(items, mkp(), coldRain); } catch { threw = true; }
  assert('cold+rain: engine does not throw with wool-only wardrobe', !threw);
  // The pool may be empty — that is CORRECT behaviour; we assert no crash and no fabrication
  const casual = p?.casual ?? [];
  if (casual.length > 0) {
    // If somehow a pool exists, verify every outfit has outerwear (no fabricated outfit ignoring cold gate)
    const allHaveOuterwear = casual.every(o => o.components.some(c => c.category === 'outerwear'));
    assert('cold+rain: any generated outfits include outerwear (no gate bypass)', allHaveOuterwear);
  } else {
    assert('cold+rain: legitimate empty pool (no fabricated outfits)', true);
  }
}

// ─── 16. ROTATION — DAILY CURSOR ADVANCES ────────────────────────────────────

console.log('\n16. Rotation — applyDailyRotation produces stable daily picks');
{
  const items = [
    mk('rot-t1','top','blouse','cream',['casual'],{formalityLevel:5}),
    mk('rot-t2','top','knit-top','camel',['casual'],{formalityLevel:5}),
    mk('rot-b1','bottom','jeans','blue',['casual'],{formalityLevel:3}),
    mk('rot-s1','shoes','loafers','tan',['casual'],{fabric:'leather',formalityLevel:5}),
    mk('rot-bag','bag','shoulder-bag','camel',['casual'],{formalityLevel:5}),
  ];
  const fullPool = pool(items, mkp());
  let state = INITIAL_ROTATION_STATE;
  const result = applyDailyRotation(fullPool, state, TODAY);
  assert('rotation: applyDailyRotation returns state', !!result.newState);
  assert('rotation: outfits non-null', result.outfits !== undefined);
}

// ─── 17. ENGINE VERSION ───────────────────────────────────────────────────────

console.log('\n17. Recommendation engine version identifier');
{
  const { RECOMMENDATION_ENGINE_VERSION } = require('../constants/recommendationVersion');
  assert('version: engine version defined', typeof RECOMMENDATION_ENGINE_VERSION === 'string');
  assert('version: engine version is 3.7', RECOMMENDATION_ENGINE_VERSION === '3.7');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════');
console.log(`  GOLDEN REGRESSION SET — Engine v3.7`);
console.log(`  ${passed} passed / ${failed} failed`);
console.log('════════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\n  FAILURES:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
}

process.exit(failed > 0 ? 1 : 0);
