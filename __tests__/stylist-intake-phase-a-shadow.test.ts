import assert from 'node:assert/strict';
import type { OutfitSet, WardrobeItem } from '../constants/types';
import {
  buildDemoInput,
  rerankWithinV37Band,
  runScenario,
} from '../scripts/stylist-intake-phase-a-shadow';

const item = (
  id: string,
  category: WardrobeItem['category'],
  subType: string,
  fabric?: WardrobeItem['fabric'],
): WardrobeItem => ({
  id, category, subType, colorFamily: 'navy', fabric,
  photoUri: `synthetic://${id}`, createdAt: '2026-10-27T12:00:00.000Z',
  occasionTags: ['work'], seasonTags: ['all-season'],
});

const look = (id: string, itemId: string, score: number): OutfitSet => ({
  id, scenario: 'work', confidenceScore: score,
  components: [{
    category: 'top', subType: 'buba', colorFamily: 'navy',
    owned: true, matchedItemId: itemId,
  }],
});

const wardrobe = [
  item('plain', 'top', 'blouse', 'linen'),
  item('loved', 'top', 'buba', 'lace'),
  item('traditional', 'bottom', 'wrapper'),
  item('low-eligible', 'bottom', 'iro'),
  item('outside-band', 'top', 'shirt'),
];
const candidates = [
  look('plain-look', 'plain', 100),
  look('lace-look', 'loved', 90),
  look('traditional-look', 'traditional', 85),
  look('low-eligible-look', 'low-eligible', 80),
  look('outside-band-look', 'outside-band', 70),
];

const preferenceRun = rerankWithinV37Band(candidates, wardrobe, {
  fabricPreferences: { lace: 'love' },
});
assert.equal(preferenceRun.shadowTopFive[0].fingerprint, 'loved');
assert.equal(preferenceRun.candidatesInV37Band, 3);
assert.equal(
  preferenceRun.shadowTopFive.some(candidate => candidate.fingerprint === 'outside-band'),
  false,
  'taste cannot bring a candidate back from outside the 15-point v3.7 band',
);

const gateBeforeBand = rerankWithinV37Band(candidates, wardrobe, {
  neverWearSubtypes: ['blouse'],
});
assert.equal(gateBeforeBand.bestV37Score, 90);
assert.equal(gateBeforeBand.bandFloor, 75);
assert.ok(
  gateBeforeBand.shadowTopFive.some(candidate => candidate.fingerprint === 'low-eligible'),
  'the band is anchored to the best score after explicit appropriateness gates',
);
assert.equal(
  gateBeforeBand.shadowTopFive.some(candidate => candidate.fingerprint === 'outside-band'),
  false,
);

const gated = rerankWithinV37Band(candidates, wardrobe, {
  neverWearSubtypes: ['blouse'],
  requiredItemIds: ['traditional'],
});
assert.deepEqual(gated.shadowTopFive.map(candidate => candidate.fingerprint), ['traditional']);

const noCulturalAssumption = rerankWithinV37Band(
  [look('traditional-look', 'traditional', 85)],
  wardrobe,
  {},
);
assert.equal(noCulturalAssumption.shadowTopFive.length, 1);
assert.equal(noCulturalAssumption.gatedOut.length, 0);

const synthetic = buildDemoInput();
const work = runScenario(synthetic, 'work');
const event = runScenario(synthetic, 'event');
const traditional = runScenario(synthetic, 'traditional');
assert.ok(work.candidateCount > 0);
assert.ok(event.candidateCount > 0);
assert.equal(traditional.sourceScenario, 'wedding');
assert.ok(traditional.baselineTopFive.every(candidate =>
  candidate.items.includes('aso-oke-buba') && candidate.items.includes('aso-oke-wrapper'),
));
assert.deepEqual(
  runScenario(synthetic, 'event').shadowTopFive,
  event.shadowTopFive,
  'repeated synthetic runs are deterministic',
);

console.log('Phase A shadow harness: band, explicit gate, cultural non-inference and deterministic pools passed');
