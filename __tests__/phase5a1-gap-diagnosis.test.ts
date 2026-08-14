/**
 * Phase 5A.1 — Correction 1: Wardrobe Gap Diagnosis Tests
 *
 * Tests the diagnoseWeatherGap pure function against the four required cases
 * from the Phase 5A.1 spec:
 *
 *   Test A — genuine cold/rain gap: engine found no outfit + no warm layer → gap card
 *   Test B — valid rainy-weather outfit: engine found outfit → no gap card
 *   Test C — non-weather failure: engine found no outfit + mild dry weather → no gap card
 *   Test D — unconventional weather-compatible garment: item not in 'outerwear' but
 *             its metadata satisfies weather requirements → no gap card (two sub-cases)
 */

import { diagnoseWeatherGap, hasWarmLayer, hasRainLayer } from '../lib/wardrobeGapDiagnosis';
import type { WardrobeItem, WeatherSnapshot } from '../constants/types';

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};

let passed = 0;
let failed = 0;
const results: string[] = [];

function check(label: string, cond: boolean): void {
  if (cond) {
    passed++;
    results.push(`  ✓ ${label}`);
  } else {
    failed++;
    results.push(`  ✗ ${label}`);
  }
}

// ── Minimal fixtures ──────────────────────────────────────────────────────────

let _seq = 0;
function makeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  const id = `item-${++_seq}`;
  return {
    id,
    photoUri: `https://example.com/${id}.jpg`,
    category: 'top',
    subType: 'tank-top',
    colorFamily: 'black',
    occasionTags: ['casual'],
    seasonTags: ['all-season'],
    formalityLevel: 1,
    pattern: 'solid',
    weight: 'light',
    description: '',
    createdAt: '2025-01-15T00:00:00.000Z',
    accentColor: undefined,
    dominantHsl: undefined,
    dominantLab: undefined,
    modelConfidence: undefined,
    fit: undefined,
    neckline: undefined,
    sleeveLength: undefined,
    rise: undefined,
    warmthBand: undefined,
    patternScale: undefined,
    ...overrides,
  };
}

function makeWeather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    fetchedAt: Date.now(),
    lat: 51.5,
    lon: -0.1,
    currentTempC: 20,
    highC: 24,
    lowC: 16,
    precipProbability: 0.1,
    source: 'gps',
    ...overrides,
  };
}

const COLD_RAINY = makeWeather({ currentTempC: 5, lowC: 3, highC: 8, precipProbability: 0.8 });
const COLD_DRY   = makeWeather({ currentTempC: 5, lowC: 3, highC: 8, precipProbability: 0.1 });
const RAINY_MILD = makeWeather({ currentTempC: 18, precipProbability: 0.8 });
const MILD_DRY   = makeWeather({ currentTempC: 20, precipProbability: 0.1 });

// ── Test A: genuine cold/rain gap ─────────────────────────────────────────────

console.log('\n=== Phase 5A.1 — Wardrobe Gap Diagnosis ===');
console.log('\n--- Test A: genuine cold/rain gap ---');
{
  const lightWardrobe = [
    makeItem({ category: 'top',    subType: 'tank-top', weight: 'light', fabric: 'cotton' }),
    makeItem({ category: 'bottom', subType: 'shorts',   weight: 'light', fabric: 'cotton' }),
    makeItem({ category: 'shoes',  subType: 'sneakers', weight: 'light' }),
  ];

  // A.1 — cold-rain condition diagnosed
  const r1 = diagnoseWeatherGap(false, COLD_RAINY, lightWardrobe, true);
  check('A.1: cold-rain gap diagnosed correctly', r1 === 'cold-rain');

  // A.2 — cold-only condition diagnosed
  const r2 = diagnoseWeatherGap(false, COLD_DRY, lightWardrobe, true);
  check('A.2: cold-only gap diagnosed correctly', r2 === 'cold');

  // A.3 — rain-only condition diagnosed
  const r3 = diagnoseWeatherGap(false, RAINY_MILD, lightWardrobe, true);
  check('A.3: rain-only gap diagnosed correctly', r3 === 'rain');

  // A.4 — empty wardrobe is NOT a gap (onboarding state)
  const r4 = diagnoseWeatherGap(false, COLD_RAINY, [], true);
  check('A.4: empty wardrobe → null (not a gap)', r4 === null);

  // A.5 — weather disabled → no gap diagnosis
  const r5 = diagnoseWeatherGap(false, COLD_RAINY, lightWardrobe, false);
  check('A.5: weather disabled → null', r5 === null);

  // A.6 — weather unavailable → no gap diagnosis
  const r6 = diagnoseWeatherGap(false, null, lightWardrobe, true);
  check('A.6: weather null → null', r6 === null);
}
results.forEach(r => console.log(r));

// ── Test B: valid rainy-weather outfit found by engine ────────────────────────

console.log('\n--- Test B: valid rainy-weather outfit (engine returned ≥1 outfit) ---');
{
  const lightWardrobe = [
    makeItem({ category: 'top',   subType: 'tank-top', weight: 'light', fabric: 'cotton' }),
    makeItem({ category: 'shoes', subType: 'sneakers', weight: 'light' }),
  ];

  // B.1 — engine found an outfit: gate holds, no gap card regardless of weather
  const r1 = diagnoseWeatherGap(true, COLD_RAINY, lightWardrobe, true);
  check('B.1: engine found outfit → null (no gap card)', r1 === null);

  // B.2 — same with rain-only
  const r2 = diagnoseWeatherGap(true, RAINY_MILD, lightWardrobe, true);
  check('B.2: engine found outfit (rain) → null', r2 === null);
}
results.slice(-2).forEach(r => console.log(r));

// ── Test C: non-weather failure ───────────────────────────────────────────────

console.log('\n--- Test C: no valid outfit, but cause is not weather ---');
{
  const mildDryWardrobe = [
    makeItem({ category: 'top',    subType: 'blouse', weight: 'light', fabric: 'silk' }),
    makeItem({ category: 'bottom', subType: 'trousers', weight: 'mid', fabric: 'linen' }),
    makeItem({ category: 'shoes',  subType: 'heels', weight: 'light' }),
  ];

  // C.1 — mild dry weather: formality/occasion issue, not weather → null
  const r1 = diagnoseWeatherGap(false, MILD_DRY, mildDryWardrobe, true);
  check('C.1: mild dry weather, engine no outfit → null (not a weather gap)', r1 === null);

  // C.2 — weather unavailable → null (cannot diagnose)
  const r2 = diagnoseWeatherGap(false, undefined, mildDryWardrobe, true);
  check('C.2: weather undefined, engine no outfit → null', r2 === null);
}
results.slice(-2).forEach(r => console.log(r));

// ── Test D: unconventional weather-compatible garment ─────────────────────────

console.log('\n--- Test D: unconventional weather-compatible garment ---');
{
  // D.1 — engine found outfit: no gap card even if wardrobe looks sparse
  const sparseWardrobe = [
    makeItem({ category: 'top', subType: 'windbreaker', weight: 'light', fabric: 'synthetic' }),
    makeItem({ category: 'bottom', subType: 'jeans', weight: 'mid', fabric: 'denim' }),
    makeItem({ category: 'shoes',  subType: 'boots', weight: 'heavy', fabric: 'leather' }),
  ];
  const r1 = diagnoseWeatherGap(true, COLD_RAINY, sparseWardrobe, true);
  check('D.1: engine found outfit (unconventional) → null (gate holds)', r1 === null);

  // D.2 — engine found no outfit, but wardrobe HAS a warm layer via fabric not category
  // A heavy wool cardigan categorised as 'top' (not 'outerwear') should suppress cold gap
  const woolCardigan = makeItem({ category: 'top', subType: 'cardigan', weight: 'heavy', fabric: 'wool' });
  const wardrobeWithWoolTop = [
    makeItem({ category: 'top',    subType: 'blouse',   weight: 'light', fabric: 'silk' }),
    woolCardigan,
    makeItem({ category: 'bottom', subType: 'trousers', weight: 'mid',   fabric: 'linen' }),
    makeItem({ category: 'shoes',  subType: 'boots',    weight: 'heavy', fabric: 'leather' }),
  ];
  const r2 = diagnoseWeatherGap(false, COLD_DRY, wardrobeWithWoolTop, true);
  check('D.2: heavy wool cardigan (category: top) → cold gap suppressed → null', r2 === null);

  // D.3 — hasWarmLayer recognises heavy weight regardless of category
  check('D.3: hasWarmLayer — heavy wool top is warm', hasWarmLayer([woolCardigan]));

  // D.4 — hasRainLayer recognises windbreaker subType regardless of category
  const windbreaker = makeItem({ category: 'top', subType: 'windbreaker', weight: 'light' });
  check('D.4: hasRainLayer — windbreaker (category: top) is rain layer', hasRainLayer([windbreaker]));

  // D.5 — hasRainLayer recognises heavy leather regardless of category
  const leatherJacket = makeItem({ category: 'top', subType: 'biker-jacket', weight: 'heavy', fabric: 'leather' });
  check('D.5: hasRainLayer — heavy leather jacket (category: top) is rain layer', hasRainLayer([leatherJacket]));

  // D.6 — category alone ('outerwear' with light synthetic) is NOT sufficient for warm layer
  const lightOuterwear = makeItem({ category: 'outerwear', subType: 'vest', weight: 'light', fabric: 'synthetic' });
  check('D.6: light synthetic outerwear vest is NOT a warm layer', !hasWarmLayer([lightOuterwear]));
}
results.slice(-6).forEach(r => console.log(r));

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n✅ Phase 5A.1 — Gap Diagnosis: ${passed} passed, ${failed} failed (${total} total)`);
assert(failed === 0, `${failed} gap diagnosis assertion(s) failed`);
