import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { traditionalGroups, traditionalProfile, traditionalWardrobe } from './fixtures/traditionalWardrobe';
import { projectWardrobeForStyling } from '../lib/stylingWardrobe';
import { buildStylingContextCandidates, asTraditionalOutfits } from '../lib/traditionalStyling';
import { applyDailyRotation, generateOutfitPool, INITIAL_ROTATION_STATE } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';
import { mergeWardrobeCorrection } from '../lib/wardrobeSemantics';
import type { OutfitSet, WardrobeItem } from '../constants/types';

const date = '2026-10-12';
const projection = projectWardrobeForStyling(traditionalWardrobe, traditionalGroups);
const original = JSON.stringify({ projection, traditionalWardrobe, traditionalGroups });
const generate = (items = traditionalWardrobe, groups = traditionalGroups, context: 'generic' | 'traditional' = 'traditional') =>
  buildStylingContextCandidates(projectWardrobeForStyling(items, groups), context,
    traditionalProfile, null, [], date, [], EMPTY_AFFINITY, null, true);
const result = generate();
const candidates = result.pool[result.sourceScenario!];
const ids = (outfit: OutfitSet) => outfit.components.map(component => component.matchedItemId);
assert.ok(candidates.length > 0, 'controlled fixture must produce real Traditional candidates');
assert.equal(result.context, 'traditional');
assert.deepEqual(result.relationships, traditionalGroups);
assert.ok(candidates.every(outfit => ids(outfit).includes('buba') && ids(outfit).includes('iro')), 'confirmed African set stays together');
assert.ok(candidates.every(outfit => !ids(outfit).includes('western-top') && !ids(outfit).includes('western-bottom')), 'stronger Traditional core changes eligibility');
assert.ok(candidates.some(outfit => ids(outfit).includes('heels') && outfit.components.some(component => component.category === 'bag')),
  'Western supports remain allowed without prescribing a particular bag');
assert.ok(candidates.every(outfit => ids(outfit).every(id => traditionalWardrobe.some(item => item.id === id))), 'no synthesized garments');
assert.ok(candidates.every(outfit => !outfit.components.some(component => ['gele', 'headwrap'].includes(component.subType))), 'headwear is not required');
const generic = generate(undefined, undefined, 'generic');
assert.deepEqual(generic.pool, generateOutfitPool(traditionalWardrobe, traditionalProfile, null, [], date, [], EMPTY_AFFINITY, null, true));
assert.equal(generic.sourceScenario, undefined, 'African wardrobe does not implicitly select Traditional');
assert.equal(generic.pool['traditional-event'], undefined);
assert.ok(generic.pool.casual.some(outfit => ids(outfit).includes('western-top')), 'fixture demonstrates materially different eligible results');
assert.deepEqual(generate(), result, 'repeatable result');
assert.equal(JSON.stringify({ projection, traditionalWardrobe, traditionalGroups }), original, 'no canonical/group/projection mutation');
buildStylingContextCandidates(projection, 'traditional', traditionalProfile, null, [], date, [], EMPTY_AFFINITY, null, true);
assert.equal(JSON.stringify({ projection, traditionalWardrobe, traditionalGroups }), original, 'the actual supplied semantic snapshot remains unchanged');
for (const field of ['category', 'subType', 'fabric', 'pattern', 'formalityLevel'] as const) {
  assert.deepEqual(projection.garments.map(item => item[field]), traditionalWardrobe.map(item => item[field]));
}
assert.throws(() => buildStylingContextCandidates(projectWardrobeForStyling(traditionalWardrobe), 'traditional',
  traditionalProfile, null, [], date), /relationships/, 'unloaded groups are not silently assumed absent');

const rotated = applyDailyRotation(result.pool, INITIAL_ROTATION_STATE, date, new Set(), true, false);
const visible = asTraditionalOutfits(rotated.outfits.filter(outfit => outfit.scenario === result.sourceScenario));
assert.ok(visible.length > 0, 'real existing daily selector produces visible recommendations');
assert.ok(visible.every(outfit => outfit.scenario === 'traditional-event'));
assert.ok(visible.every(outfit => ids(outfit).includes('buba') && ids(outfit).includes('iro')));
assert.deepEqual(asTraditionalOutfits(rotated.outfits), asTraditionalOutfits(rotated.outfits), 'stable display IDs');

const withoutIro = generate(traditionalWardrobe.filter(item => item.id !== 'iro'));
assert.ok(withoutIro.pool[withoutIro.sourceScenario!].every(outfit => !ids(outfit).includes('buba')), 'missing member cannot become a split coordinated candidate');
const onlySet = traditionalWardrobe.filter(item => !['western-top', 'western-bottom', 'western-dress'].includes(item.id));
const incompleteSet = generate(onlySet.filter(item => item.id !== 'iro'));
assert.equal(incompleteSet.pool[incompleteSet.sourceScenario!].length, 0);
assert.match(incompleteSet.notice!, /incomplete|not been split/);
const layered = [{ ...traditionalGroups[0], id: 'layered', relationshipType: 'layered' as const }];
assert.deepEqual(generate(traditionalWardrobe, layered).relationships, layered, 'layer information retained without invented order');
const westernBottom: WardrobeItem = {
  ...traditionalWardrobe[3], id: 'western-trousers', subType: 'wide-leg', formalityLevel: 7, fabric: 'silk',
};
for (const status of ['ai_inferred', 'user_rejected'] as const) {
  const group = [{ ...traditionalGroups[0], confirmationStatus: status }];
  const unconfirmed = generate([...traditionalWardrobe.filter(item => item.id !== 'iro'), westernBottom], group);
  assert.ok(unconfirmed.pool[unconfirmed.sourceScenario!].some(outfit => ids(outfit).includes('buba')), 'only confirmed sets impose atomicity');
}
const empty = generate([], []);
assert.equal(empty.pool[empty.sourceScenario!].length, 0);
assert.ok(empty.notice);
const noShoes = generate(traditionalWardrobe.filter(item => item.category !== 'shoes'));
assert.equal(noShoes.pool[noShoes.sourceScenario!].length, 0);
assert.match(noShoes.notice!, /footwear/);
const westernOnly = generate(traditionalWardrobe.filter(item => !['buba', 'iro'].includes(item.id)), []);
assert.ok(westernOnly.pool[westernOnly.sourceScenario!].length > 0, 'best valid occasion-aware owned fallback');
assert.match(westernOnly.notice!, /No Traditional-specific core/);
const mixed = generate(traditionalWardrobe.filter(item => item.id !== 'iro'), []);
assert.ok(mixed.pool[mixed.sourceScenario!].every(outfit => !ids(outfit).includes('western-bottom')),
  'canonical low-formality jeans are not misrepresented as occasion-ready');
const mixedReady = generate([...onlySet.filter(item => item.id !== 'iro'), westernBottom], []);
assert.ok(mixedReady.pool[mixedReady.sourceScenario!].some(outfit => ids(outfit).includes('buba') && ids(outfit).includes('western-trousers')),
  'appropriate African + Western core pairing allowed');
const tooCasual = generate(onlySet.map(item => ['buba', 'iro'].includes(item.id) ? { ...item, formalityLevel: 2 } : item));
assert.equal(tooCasual.pool[tooCasual.sourceScenario!].length, 0, 'canonical formality guides suitability without rewriting it');
const unknown = onlySet.map(item => ['buba', 'iro'].includes(item.id)
  ? mergeWardrobeCorrection(item, { formalityLevel: undefined, seasonTags: [] }) : item);
const unknownResult = generate(unknown);
assert.ok(unknownResult.pool[unknownResult.sourceScenario!].length > 0, 'broader existing evaluator can provide an honest unknown-data fallback');
assert.ok(unknown.slice(0, 2).every(item => item.formalityLevel === undefined), 'unknown stays unknown');
const corrected = traditionalWardrobe.map(item => item.id === 'buba'
  ? mergeWardrobeCorrection({ ...item, subType: 'blouse', fabric: 'cotton' }, { subType: 'buba', fabric: 'lace' }) : item);
assert.deepEqual(generate(corrected), result, 'equivalent corrected canonical data has equivalent styling');
const kaftan: WardrobeItem = { ...traditionalWardrobe[4], id: 'kaftan', subType: 'kaftan', formalityLevel: 8 };
const kaftanOnly = generate([kaftan, ...traditionalWardrobe.filter(item => ['shoes', 'bag'].includes(item.category))], []);
assert.equal(kaftanOnly.pool[kaftanOnly.sourceScenario!].length, 0, 'frozen resort-formality precedence is not patched or bypassed');
assert.equal(kaftan.subType, 'kaftan');
assert.equal(kaftan.formalityLevel, 8);
assert.ok(kaftanOnly.notice, 'unsupported existing compatibility has an honest gap, not a Western alias');

const rainy = {
  fetchedAt: 1, lat: 0, lon: 0, currentTempC: 25, highC: 29, lowC: 24,
  precipProbability: 0.9, source: 'ip' as const,
};
const weatherWardrobe = [...unknown, { ...traditionalWardrobe[7], id: 'rain-sandals', subType: 'sandals', formalityLevel: 5 }];
const dryResult = generate(weatherWardrobe);
assert.ok(dryResult.pool[dryResult.sourceScenario!].some(outfit => outfit.components.some(component => component.subType === 'sandals')));
const weatherResult = buildStylingContextCandidates(projectWardrobeForStyling(weatherWardrobe, traditionalGroups), 'traditional',
  { ...traditionalProfile, weatherEnabled: true }, null, [], date, [], EMPTY_AFFINITY, rainy, true);
assert.ok(weatherResult.pool[weatherResult.sourceScenario!].every(outfit => !outfit.components.some(component => component.subType === 'sandals')),
  'existing weather evaluator remains in control');
const contextSource = readFileSync('contexts/AppContext.tsx', 'utf8');
assert.match(contextSource, /const groups = userId \? await getGarmentGroups\(userId\) : \[\]/);
assert.match(contextSource, /projectRelationshipsForStyling\(projectWardrobeForStyling\(activeWardrobeItems, groups\), userId \?\? undefined\), context/);
assert.match(contextSource, /currentUserIdRef\.current !== userId/);
assert.match(contextSource, /if \(!isPremium\) throw/);
const screen = readFileSync('app/(tabs)/outfits.tsx', 'utf8');
assert.match(screen, /getStylingRecommendations\('traditional'\)/);
assert.match(screen, /selectedScenario !== 'traditional-event'/);
assert.match(screen, /selectedScenario === 'traditional-event'\s*\? traditionalOutfits/);

async function main() {
  const bundled = await build({ entryPoints: ['lib/traditionalStyling.ts'], bundle: true, platform: 'node', write: false, metafile: true });
  for (const dependency of Object.keys(bundled.metafile!.inputs)) {
    assert.doesNotMatch(dependency, /gemini|supabase|query-client|photoroom|server\/|react-native|expo-/i);
  }
  console.log('Traditional context changes real eligible/visible outfits; canonical truth, sets, generic v3.7 and provider isolation preserved');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
