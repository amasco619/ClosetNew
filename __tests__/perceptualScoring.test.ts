/**
 * Fixture-based ranking verification for the perceptual colour scorers.
 *
 * Defines nine outfit fixtures grouped into three intuitive bands:
 *   - "good"     — temperature-coherent, pleasing value spread, single hero
 *   - "muddy"    — flat all-mid-tone looks (every piece in the same value band)
 *   - "clashing" — mixed warm + cool with no bridging neutrals, or two
 *                  competing high-saturation pieces
 *
 * The combined perceptual sub-score (temperatureHarmony + valueSpread +
 * saturationDominance) must rank good > muddy > clashing on average. This
 * gives us a deterministic regression guard for the new scoring layer.
 *
 * Run: `npx tsx __tests__/perceptualScoring.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  centroidHsl,
  temperatureHarmony,
  valueSpread,
  saturationDominance,
} from '../constants/colorPerceptual';

type Fixture = { name: string; families: string[] };

const goodFixtures: Fixture[] = [
  // Cream + camel + brown + gold — all warm, clear value spread, one hero.
  { name: 'warm capsule',     families: ['cream', 'camel', 'brown', 'gold'] },
  // Black hero against white + grey + navy — single chromatic, clean spread.
  { name: 'navy + neutrals',  families: ['white', 'grey', 'navy', 'black'] },
  // Single emerald hero against off-white + black — high contrast, clean.
  { name: 'emerald moment',   families: ['cream', 'black', 'emerald'] },
];

const muddyFixtures: Fixture[] = [
  // All mid-tone earth — olive + camel + brown + maroon. Same value band.
  { name: 'mid earth',        families: ['olive', 'camel', 'brown', 'maroon'] },
  // Mid blues — navy + teal + green. Cohesive temp but flat value.
  { name: 'mid cool',         families: ['navy', 'teal', 'green'] },
  // Mid mid mid — burgundy + olive + brown. No light, no spark.
  { name: 'autumn mush',      families: ['burgundy', 'olive', 'brown'] },
];

const clashingFixtures: Fixture[] = [
  // Warm terracotta + cool teal at the same value — every signal wrong.
  { name: 'terracotta vs teal', families: ['terracotta', 'teal'] },
  // Two high-saturation heroes competing — red + emerald.
  { name: 'red + emerald',    families: ['red', 'emerald'] },
  // Mustard + lavender + pink — mixed warm/cool, two saturated.
  { name: 'mustard + lavender', families: ['mustard', 'lavender', 'pink'] },
];

function score(f: Fixture): number {
  const hsls = f.families.map(centroidHsl);
  return temperatureHarmony(hsls) + valueSpread(hsls) + saturationDominance(hsls);
}

function avg(fs: Fixture[]): number {
  return fs.reduce((s, f) => s + score(f), 0) / fs.length;
}

function fmt(fs: Fixture[]): string {
  return fs.map(f => `    ${f.name.padEnd(20)} → ${score(f).toFixed(2)}`).join('\n');
}

const goodAvg = avg(goodFixtures);
const muddyAvg = avg(muddyFixtures);
const clashAvg = avg(clashingFixtures);

console.log('good fixtures:');
console.log(fmt(goodFixtures));
console.log(`  avg: ${goodAvg.toFixed(2)}`);
console.log('muddy fixtures:');
console.log(fmt(muddyFixtures));
console.log(`  avg: ${muddyAvg.toFixed(2)}`);
console.log('clashing fixtures:');
console.log(fmt(clashingFixtures));
console.log(`  avg: ${clashAvg.toFixed(2)}`);

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { console.error(`  ✗ ${msg}`); failed++; }
}

console.log('\nassertions:');
assert(goodAvg > muddyAvg, `good avg (${goodAvg.toFixed(2)}) > muddy avg (${muddyAvg.toFixed(2)})`);
assert(muddyAvg > clashAvg, `muddy avg (${muddyAvg.toFixed(2)}) > clashing avg (${clashAvg.toFixed(2)})`);
assert(goodAvg > clashAvg, `good avg (${goodAvg.toFixed(2)}) > clashing avg (${clashAvg.toFixed(2)})`);
assert(goodFixtures.every(f => score(f) >= 0), 'every good fixture scores ≥ 0');
assert(clashingFixtures.every(f => score(f) <= 0), 'every clashing fixture scores ≤ 0');

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall perceptual-scoring assertions passed');
