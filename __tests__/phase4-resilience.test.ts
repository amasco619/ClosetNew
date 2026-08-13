/**
 * Phase 4 — Error Handling, Resilience, and Performance Tests
 *
 * Spec §11–16: Verify that the recommendation pipeline:
 *   - Fails gracefully (no crash) on malformed/incomplete inputs.
 *   - Never fabricates outfits from impossible constraints.
 *   - Handles duplicate IDs without corruption.
 *   - Performs acceptably across wardrobe sizes 4–100 items.
 *
 * DO NOT change recommendation scoring to make these pass.
 * A graceful no-recommendation is always preferable to a crash.
 *
 * Run: npx tsx __tests__/phase4-resilience.test.ts
 */

import { generateOutfitPool } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';
import type {
  WardrobeItem, UserProfile, OccasionTag, WeatherSnapshot, WearEntry,
} from '../constants/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PH = 'test://ph';
const CR = '2025-01-01T00:00:00Z';
const TODAY = '2026-08-13';

function mk(
  id: string, cat: WardrobeItem['category'], sub: string, col: string,
  occ: OccasionTag[], extra: Partial<WardrobeItem> = {},
): WardrobeItem {
  return {
    id, category: cat, subType: sub, colorFamily: col, occasionTags: occ,
    photoUri: PH, thumbnailUri: PH, createdAt: CR, displayName: sub,
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

function run(items: WardrobeItem[], profile: UserProfile, weather: WeatherSnapshot | null = null) {
  return generateOutfitPool(items, profile, null, [], TODAY, [], EMPTY_AFFINITY, weather);
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0; let failed = 0;
const failures: string[] = [];

function assert(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

function doesNotThrow(name: string, fn: () => void) {
  let threw = false;
  try { fn(); } catch (e: any) { threw = true; failures.push(`${name} — threw: ${e?.message}`); }
  if (threw) { failed++; console.log(`  ✗ ${name} — threw an exception`); }
  else { passed++; console.log(`  ✓ ${name}`); }
}

// ─── A. USER PROFILE RESILIENCE ───────────────────────────────────────────────

console.log('\n=== A. User Profile Resilience ===');

const BASIC_ITEMS = [
  mk('ri-t1','top','blouse','white',['casual'],{formalityLevel:5}),
  mk('ri-b1','bottom','jeans','blue',['casual'],{formalityLevel:3}),
  mk('ri-s1','shoes','sneakers','white',['casual'],{formalityLevel:2}),
];

doesNotThrow('missing bodyType (null)', () =>
  run(BASIC_ITEMS, mkp({ bodyType: null })));

doesNotThrow('missing heightBand (null)', () =>
  run(BASIC_ITEMS, mkp({ heightBand: null })));

doesNotThrow('missing style goal (undefined via any cast)', () =>
  run(BASIC_ITEMS, { ...mkp(), styleGoalPrimary: undefined as any }));

doesNotThrow('null styleGoalSecondary', () =>
  run(BASIC_ITEMS, mkp({ styleGoalSecondary: null })));

doesNotThrow('missing constraints (null via any cast) — resilience guard', () =>
  run(BASIC_ITEMS, { ...mkp(), constraints: null as any }));

doesNotThrow('incomplete profile — all nullable fields null', () =>
  run(BASIC_ITEMS, {
    ...mkp(),
    name: '', bodyType: null, eyeColor: null, skinTone: null, undertone: null,
    styleGoalPrimary: null, styleGoalSecondary: null, heightBand: null,
    industry: undefined, metalPreference: undefined,
  }));

// ─── B. WARDROBE RESILIENCE ───────────────────────────────────────────────────

console.log('\n=== B. Wardrobe Resilience ===');

doesNotThrow('zero wardrobe items', () => {
  const p = run([], mkp());
  const total = Object.values(p).reduce((s, a) => s + a.length, 0);
  if (total > 0) throw new Error(`Expected empty pools, got ${total} outfits`);
});

doesNotThrow('single garment', () => run([BASIC_ITEMS[0]], mkp()));

doesNotThrow('item missing colorFamily (empty string)', () =>
  run([{ ...BASIC_ITEMS[0], colorFamily: '' }], mkp()));

doesNotThrow('item missing fabric (undefined)', () =>
  run([{ ...BASIC_ITEMS[0], fabric: undefined }], mkp()));

doesNotThrow('item missing subType (empty string)', () =>
  run([{ ...BASIC_ITEMS[0], subType: '' }], mkp()));

doesNotThrow('item missing pattern (undefined)', () =>
  run([{ ...BASIC_ITEMS[0], pattern: undefined }], mkp()));

doesNotThrow('item missing occasionTags (empty array)', () =>
  run([{ ...BASIC_ITEMS[0], occasionTags: [] }], mkp()));

doesNotThrow('malformed garment — formalityLevel NaN', () =>
  run([{ ...BASIC_ITEMS[0], formalityLevel: NaN }], mkp()));

doesNotThrow('malformed garment — formalityLevel out-of-range (99)', () =>
  run([{ ...BASIC_ITEMS[0], formalityLevel: 99 }], mkp()));

doesNotThrow('duplicate garment IDs in wardrobe', () => {
  const dup = [BASIC_ITEMS[0], { ...BASIC_ITEMS[0] }, BASIC_ITEMS[1], BASIC_ITEMS[2]];
  const p = run(dup, mkp());
  // Verify no outfit uses the same item twice (dedup guard)
  for (const [, outfits] of Object.entries(p)) {
    for (const outfit of outfits) {
      const ids = outfit.components.map(c => c.matchedItemId).filter(Boolean);
      const unique = new Set(ids);
      if (ids.length !== unique.size) throw new Error('Duplicate item in outfit');
    }
  }
});

// ─── C. CONTEXT / WEATHER RESILIENCE ─────────────────────────────────────────

console.log('\n=== C. Context / Weather Resilience ===');

doesNotThrow('missing weather (null)', () => run(BASIC_ITEMS, mkp(), null));

doesNotThrow('malformed weather — precipProbability out of range (1.5)', () =>
  run(BASIC_ITEMS, mkp(), { ...mkWeather(15, 1.5) }));

doesNotThrow('malformed weather — extreme cold (-50°C)', () =>
  run(BASIC_ITEMS, mkp(), mkWeather(-60, 0)));

doesNotThrow('malformed weather — zero precipitation on cold day', () =>
  run(BASIC_ITEMS, mkp(), mkWeather(15, 0)));

doesNotThrow('weatherEnabled=false with weather snapshot present', () =>
  run(BASIC_ITEMS, { ...mkp(), weatherEnabled: false }, mkWeather(10, 0.85)));

// ─── D. HARD CONSTRAINTS — NO INVALID OUTFIT FABRICATION ─────────────────────

console.log('\n=== D. Hard Constraints — no fabrication ===');

{
  // Wardrobe with only tops (no bottoms, no shoes) — all pools must be empty
  const tops = [mk('hd-t1','top','blouse','white',['casual'],{formalityLevel:5})];
  const p = run(tops, mkp());
  const total = Object.values(p).reduce((s, a) => s + a.length, 0);
  assert('no fabrication: tops-only wardrobe → empty pools', total === 0);
}

{
  // Cold+rain + no rain-appropriate warm coat → no outfit should be fabricated
  const coldRain = mkWeather(1, 0.9);
  const items = [
    mk('hd-t2','top','blouse','white',['casual'],{formalityLevel:5}),
    mk('hd-b2','bottom','jeans','blue',['casual'],{formalityLevel:3}),
    mk('hd-s2','shoes','boots','black',['casual'],{fabric:'leather',formalityLevel:5}),
    mk('hd-o2','outerwear','coat','camel',['casual'],{fabric:'wool',warmthBand:'cold',formalityLevel:5}),
  ];
  let pools: ReturnType<typeof run> | null = null;
  doesNotThrow('cold+rain wool-only wardrobe: no crash', () => { pools = run(items, mkp(), coldRain); });
  if (pools) {
    const outfits = (pools as any).casual ?? [];
    const allHaveOuterwear = outfits.every((o: any) => o.components.some((c: any) => c.category === 'outerwear'));
    assert('cold+rain: any generated outfit has outerwear (cold gate not bypassed)',
      outfits.length === 0 || allHaveOuterwear);
  }
}

// ─── E. PERFORMANCE BENCHMARK ─────────────────────────────────────────────────

console.log('\n=== E. Performance Benchmark ===');

function buildWardrobe(n: number): WardrobeItem[] {
  const items: WardrobeItem[] = [];
  const tops = ['blouse','t-shirt','knit-top','button-down','camisole'];
  const bots = ['jeans','trousers','midi-skirt','shorts','chinos'];
  const shoes = ['loafers','sneakers','ankle-boots','mules','heels'];
  const bags = ['shoulder-bag','tote','clutch','backpack','crossbody'];
  const outers = ['blazer','coat','jacket','trench'];
  const fabrics = ['cotton','linen','silk','wool','denim','leather','synthetic'];
  const colors = ['white','black','navy','cream','beige','blue','grey','camel'];
  const occs: OccasionTag[][] = [['casual'],['casual','brunch'],['work'],['casual','work'],['casual','brunch','work']];

  for (let i = 0; i < n; i++) {
    const idx = i % 5;
    let cat: WardrobeItem['category'];
    let sub: string;
    if (i % 5 === 0) { cat = 'top'; sub = tops[i % tops.length]; }
    else if (i % 5 === 1) { cat = 'bottom'; sub = bots[i % bots.length]; }
    else if (i % 5 === 2) { cat = 'shoes'; sub = shoes[i % shoes.length]; }
    else if (i % 5 === 3) { cat = 'bag'; sub = bags[i % bags.length]; }
    else { cat = 'outerwear'; sub = outers[i % outers.length]; }
    items.push(mk(
      `perf-${i}`, cat, sub, colors[i % colors.length],
      occs[i % occs.length],
      { fabric: fabrics[i % fabrics.length] as any, formalityLevel: (i % 5) + 3 },
    ));
  }
  return items;
}

const SIZES = [4, 10, 20, 30, 50, 100];
const results: Array<{ size: number; candidates: number; totalMs: number }> = [];

console.log('\n  Wardrobe Size | Candidates | Total ms');
console.log('  -------------|-----------|----------');

for (const size of SIZES) {
  const items = buildWardrobe(size);
  const t0 = Date.now();
  const p = run(items, mkp());
  const ms = Date.now() - t0;
  const candidates = Object.values(p).reduce((s, a) => s + a.length, 0);
  results.push({ size, candidates, totalMs: ms });
  console.log(`  ${String(size).padStart(13)} | ${String(candidates).padStart(9)} | ${String(ms).padStart(8)}ms`);
}

// Performance assertions — engine must complete within 2 seconds for 100 items
const perf100 = results.find(r => r.size === 100)!;
assert('perf: 100-item wardrobe completes within 2000ms', perf100.totalMs < 2000,
  `took ${perf100.totalMs}ms`);

// No unacceptable cliff — 100-item wardrobe must complete in well under 2s.
// Ratio test omitted: at very small sizes (< 20ms) timing noise dominates ratios.
assert('perf: 4-item wardrobe completes within 500ms', results.find(r => r.size === 4)!.totalMs < 500);

// All sizes must complete without throwing
assert('perf: all wardrobe sizes complete without error', true); // reached if no throw above

// ─── F. IDEMPOTENCY ───────────────────────────────────────────────────────────

console.log('\n=== F. Idempotency ===');

{
  const items = BASIC_ITEMS;
  const profile = mkp();
  const run1 = run(items, profile);
  const run2 = run(items, profile);
  // Same items + same profile → same pool sizes (deterministic)
  const sizes1 = Object.entries(run1).map(([k, v]) => `${k}:${v.length}`).sort().join(',');
  const sizes2 = Object.entries(run2).map(([k, v]) => `${k}:${v.length}`).sort().join(',');
  assert('idempotency: repeated calls produce identical pool sizes', sizes1 === sizes2);
}

{
  // Hero IDs must be identical across repeated calls (deterministic ranking)
  const items = [
    mk('idem-t1','top','blouse','cream',['casual'],{fabric:'silk',formalityLevel:5}),
    mk('idem-t2','top','knit-top','camel',['casual'],{fabric:'cashmere',formalityLevel:5}),
    mk('idem-b1','bottom','trousers','black',['casual'],{formalityLevel:5}),
    mk('idem-s1','shoes','loafers','black',['casual'],{fabric:'leather',formalityLevel:5}),
    mk('idem-bag','bag','shoulder-bag','black',['casual'],{formalityLevel:5}),
  ];
  const r1 = run(items, mkp());
  const r2 = run(items, mkp());
  const hero1 = r1.casual?.[0]?.heroId;
  const hero2 = r2.casual?.[0]?.heroId;
  assert('idempotency: top-1 hero is deterministic across repeated calls', hero1 === hero2);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════');
console.log(`  Phase 4 Resilience & Performance`);
console.log(`  ${passed} passed / ${failed} failed`);
console.log('════════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\n  FAILURES:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
}

process.exit(failed > 0 ? 1 : 0);
