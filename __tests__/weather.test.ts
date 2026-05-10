/**
 * Unit tests for the pure weather helpers in constants/weather.ts.
 *
 * These helpers carry zero IO — they just take a WeatherSnapshot / item
 * shape and return a bool or number, making them ideal for fast regression
 * guards. Mirrors the style of __tests__/perceptualScoring.test.ts.
 *
 * Run: `npx tsx __tests__/weather.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  outerwearRule,
  isRainy,
  isRainFriendly,
  warmthMatchScore,
  outerwearWeatherScore,
  neededWarmth,
  effectiveWarmth,
} from '../constants/weatherPure';
import type { WeatherSnapshot } from '../constants/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function snap(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    fetchedAt: Date.now(),
    lat: 51.5,
    lon: -0.1,
    currentTempC: 15,
    highC: 20,
    lowC: 15,
    precipProbability: 0,
    source: 'ip',
    ...overrides,
  };
}

// ── outerwearRule ─────────────────────────────────────────────────────────────

console.log('\nouterwearRule:');

assert(outerwearRule(null) === 'optional', 'null weather → optional');
assert(outerwearRule(undefined) === 'optional', 'undefined weather → optional');

// Threshold: lowC < 12 → required
assert(outerwearRule(snap({ lowC: 11.9, highC: 18 })) === 'required', 'lowC 11.9 → required');
assert(outerwearRule(snap({ lowC: 11,   highC: 18 })) === 'required', 'lowC 11 → required');
assert(outerwearRule(snap({ lowC: 0,    highC: 5  })) === 'required', 'lowC 0 → required');

// Exact boundary: lowC === 12 is NOT < 12, so it should not be required
assert(outerwearRule(snap({ lowC: 12, highC: 18 })) !== 'required', 'lowC 12 not required');

// Threshold: lowC > 18 AND highC > 24 → suppressed
assert(outerwearRule(snap({ lowC: 19, highC: 25 })) === 'suppressed', 'lowC 19, highC 25 → suppressed');
assert(outerwearRule(snap({ lowC: 22, highC: 30 })) === 'suppressed', 'lowC 22, highC 30 → suppressed');

// Both conditions must hold for suppressed
assert(outerwearRule(snap({ lowC: 19, highC: 24 })) !== 'suppressed', 'lowC 19, highC exactly 24 → not suppressed');
assert(outerwearRule(snap({ lowC: 18, highC: 30 })) !== 'suppressed', 'lowC exactly 18, highC 30 → not suppressed');

// Middle ground → optional
assert(outerwearRule(snap({ lowC: 14, highC: 22 })) === 'optional', 'lowC 14, highC 22 → optional');
assert(outerwearRule(snap({ lowC: 12, highC: 20 })) === 'optional', 'lowC 12, highC 20 → optional');

// ── isRainy ───────────────────────────────────────────────────────────────────

console.log('\nisRainy:');

assert(!isRainy(null), 'null weather → not rainy');
assert(!isRainy(undefined), 'undefined weather → not rainy');
assert(!isRainy(snap({ precipProbability: 0.59 })), 'precipProbability 0.59 → not rainy');
assert(isRainy(snap({ precipProbability: 0.6 })),   'precipProbability 0.6 → rainy (boundary)');
assert(isRainy(snap({ precipProbability: 0.61 })),  'precipProbability 0.61 → rainy');
assert(isRainy(snap({ precipProbability: 1.0 })),   'precipProbability 1.0 → rainy');
assert(!isRainy(snap({ precipProbability: 0 })),    'precipProbability 0 → not rainy');

// ── isRainFriendly ────────────────────────────────────────────────────────────

console.log('\nisRainFriendly:');

// Rain-friendly subtypes
assert(isRainFriendly({ subType: 'trench',        fabric: undefined }), 'trench → rain friendly');
assert(isRainFriendly({ subType: 'raincoat',      fabric: undefined }), 'raincoat → rain friendly');
assert(isRainFriendly({ subType: 'parka',         fabric: undefined }), 'parka → rain friendly');
assert(isRainFriendly({ subType: 'mac',           fabric: undefined }), 'mac → rain friendly');
assert(isRainFriendly({ subType: 'jacket',        fabric: undefined }), 'jacket → rain friendly');
assert(isRainFriendly({ subType: 'bomber-jacket', fabric: undefined }), 'bomber-jacket → rain friendly');

// Rain-averse fabrics override neutral subtype
assert(!isRainFriendly({ subType: 'coat',   fabric: 'wool'     }), 'wool coat → not rain friendly');
assert(!isRainFriendly({ subType: 'coat',   fabric: 'cashmere' }), 'cashmere coat → not rain friendly');
assert(!isRainFriendly({ subType: 'coat',   fabric: 'suede'    }), 'suede coat → not rain friendly');

// Rain-friendly subtype wins even with no fabric info
assert(isRainFriendly({ subType: 'raincoat', fabric: undefined }), 'raincoat with no fabric → friendly');

// Neutral subtype + neutral fabric → friendly (default)
assert(isRainFriendly({ subType: 'blazer', fabric: undefined }), 'blazer no fabric → default friendly');
assert(isRainFriendly({ subType: 'blazer', fabric: 'linen'   }), 'blazer linen → default friendly');

// ── neededWarmth ──────────────────────────────────────────────────────────────

console.log('\nneededWarmth:');

assert(neededWarmth(4)    === 'cold', 'lowC 4 → cold');
assert(neededWarmth(4.9)  === 'cold', 'lowC 4.9 → cold');
assert(neededWarmth(5)    === 'cool', 'lowC 5 → cool (boundary)');
assert(neededWarmth(11.9) === 'cool', 'lowC 11.9 → cool');
assert(neededWarmth(12)   === 'mild', 'lowC 12 → mild (boundary)');
assert(neededWarmth(17.9) === 'mild', 'lowC 17.9 → mild');
assert(neededWarmth(18)   === 'warm', 'lowC 18 → warm (boundary)');
assert(neededWarmth(25)   === 'warm', 'lowC 25 → warm');

// ── effectiveWarmth ───────────────────────────────────────────────────────────

console.log('\neffectiveWarmth:');

// Explicit warmthBand takes priority
assert(effectiveWarmth({ subType: 'puffer', warmthBand: 'mild' }) === 'mild', 'explicit warmthBand overrides subType');

// Falls back to SUBTYPE_WARMTH map
assert(effectiveWarmth({ subType: 'puffer',        warmthBand: undefined }) === 'cold', 'puffer → cold');
assert(effectiveWarmth({ subType: 'peacoat',       warmthBand: undefined }) === 'cold', 'peacoat → cold');
assert(effectiveWarmth({ subType: 'leather-jacket',warmthBand: undefined }) === 'cool', 'leather-jacket → cool');
assert(effectiveWarmth({ subType: 'trench',        warmthBand: undefined }) === 'cool', 'trench → cool');
assert(effectiveWarmth({ subType: 'blazer',        warmthBand: undefined }) === 'mild', 'blazer → mild');
assert(effectiveWarmth({ subType: 'cardigan',      warmthBand: undefined }) === 'mild', 'cardigan → mild');

// Unknown subtype with no warmthBand → default 'mild'
assert(effectiveWarmth({ subType: 'unknown-thing', warmthBand: undefined }) === 'mild', 'unknown subType → mild default');

// ── warmthMatchScore ──────────────────────────────────────────────────────────

console.log('\nwarmthMatchScore:');

// Perfect match (diff 0) → +3
// lowC 4 → neededWarmth = 'cold'; puffer effectiveWarmth = 'cold'
assert(warmthMatchScore({ subType: 'puffer', warmthBand: undefined }, 4) === 3, 'puffer at lowC 4 → +3 (perfect)');

// One band off (diff 1) → +1
// lowC 4 → need 'cold'; leather-jacket → 'cool' (1 step away)
assert(warmthMatchScore({ subType: 'leather-jacket', warmthBand: undefined }, 4) === 1, 'leather-jacket at lowC 4 → +1 (one off)');

// Two bands off (diff 2) → -2
// lowC 4 → need 'cold'; blazer → 'mild' (2 steps away)
assert(warmthMatchScore({ subType: 'blazer', warmthBand: undefined }, 4) === -2, 'blazer at lowC 4 → -2 (two off)');

// Three+ bands off → -4
// lowC 4 → need 'cold'; explicit warmthBand 'hot' (4 steps away)
assert(warmthMatchScore({ subType: 'coat', warmthBand: 'hot' }, 4) === -4, 'hot item at lowC 4 → -4 (three+ off)');

// Perfect mid-range: lowC 15 → need 'mild'; blazer → 'mild'
assert(warmthMatchScore({ subType: 'blazer', warmthBand: undefined }, 15) === 3, 'blazer at lowC 15 → +3 (perfect mild)');

// ── outerwearWeatherScore ─────────────────────────────────────────────────────

console.log('\nouterwearWeatherScore:');

// Dry day: score equals warmthMatchScore only
const drySnap = snap({ lowC: 4, precipProbability: 0 });
const trenchDry = outerwearWeatherScore({ subType: 'trench', warmthBand: undefined, fabric: undefined }, drySnap);
// trench → cool (1 band off from cold needed) → warmthMatchScore = +1, no rain bonus
assert(trenchDry === 1, `trench on dry cold day → 1 (got ${trenchDry})`);

// Rainy day: rain-friendly subtype gets +3 bonus
const rainSnap = snap({ lowC: 4, precipProbability: 0.8 });
const trenchRain = outerwearWeatherScore({ subType: 'trench', warmthBand: undefined, fabric: undefined }, rainSnap);
// warmthMatchScore(trench at 4°C) = +1, plus rain bonus +3 = 4
assert(trenchRain === 4, `trench on rainy cold day → 4 (got ${trenchRain})`);

// Rainy day: rain-averse fabric gets -4 penalty
const woolPufferRain = outerwearWeatherScore({ subType: 'puffer', warmthBand: undefined, fabric: 'wool' }, rainSnap);
// puffer = cold = perfect at lowC 4 → +3, rain averse fabric penalty -4 = -1
assert(woolPufferRain === -1, `wool puffer on rainy cold day → -1 (got ${woolPufferRain})`);

// Rainy day with neutral item: no bonus or penalty, just warmth score
const blazerRain = outerwearWeatherScore({ subType: 'blazer', warmthBand: undefined, fabric: 'cotton' }, rainSnap);
// blazer = mild, needed = cold (2 off) → -2; cotton not averse, blazer not rain-friendly → no modifier
assert(blazerRain === -2, `neutral blazer on rainy cold day → -2 (got ${blazerRain})`);

// Perfect scenario: raincoat on a rainy mild day
const mildRainSnap = snap({ lowC: 15, precipProbability: 0.75 });
const raincoatMild = outerwearWeatherScore({ subType: 'raincoat', warmthBand: undefined, fabric: undefined }, mildRainSnap);
// raincoat = mild, needed = mild → +3; rain-friendly → +3 = 6
assert(raincoatMild === 6, `raincoat on mild rainy day → 6 (got ${raincoatMild})`);

// ── Summary ───────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall weather assertions passed');
