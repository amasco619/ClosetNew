import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import type { GarmentGroup, WardrobeItem, UserProfile } from '../constants/types';
import { projectWardrobeForStyling } from '../lib/stylingWardrobe';
import { SEMANTIC_FIELDS, mergeWardrobeCorrection, serializeRecommendationSemantics } from '../lib/wardrobeSemantics';
import { mapDbRowToWardrobeItem } from '../lib/wardrobeMapper';
import { mapDbRowToGarmentGroup } from '../lib/garmentGroupMapper';
import { generateOutfitPool, applyDailyRotation, INITIAL_ROTATION_STATE, computePoolHash } from '../constants/outfitRotation';
import { generateOutfitsForItem } from '../constants/outfitGenerator';
import { EMPTY_AFFINITY } from '../constants/affinity';

const item: WardrobeItem = {
  id: 'buba', photoUri: 'test://photo', storagePath: 'owner/buba.jpg', createdAt: '2026-01-01',
  category: 'top', subType: 'buba', colorFamily: 'blue', accentColor: 'gold',
  pattern: 'wax-print', patternScale: 'large', fabric: 'lace', fit: 'loose', weight: 'light',
  neckline: 'boat', sleeveLength: 'three-quarter', warmthBand: 'warm', formalityLevel: 8,
  occasionTags: ['wedding', 'traditional-event'], seasonTags: ['summer'], metalTone: 'gold',
  dominantHsl: { h: 221, s: 0.65, l: 0.42 }, dominantLab: { L: 43, a: 9, b: -32 },
  confirmedFields: ['subType', 'fabric'], modelConfidence: 0.95,
};
const originalItem = JSON.stringify(item);

const hydrated = mapDbRowToWardrobeItem({
  id: item.id, garment_type: item.category, sub_type: item.subType, color_family: item.colorFamily,
  image_url: item.storagePath, created_at: item.createdAt, occasion_tag: item.occasionTags,
  fabric: item.fabric, fit: item.fit, pattern: item.pattern, pattern_scale: item.patternScale,
  recommendation_semantics: serializeRecommendationSemantics(item),
});
const projected = projectWardrobeForStyling([hydrated]);
for (const field of SEMANTIC_FIELDS) {
  assert.deepEqual(projected.garments[0][field], hydrated[field], `canonical ${field} survives projection`);
}
assert.equal(projected.relationships, undefined, 'unloaded relationships are unknown, not absent');
assert.equal(projected.garments[0].groupIds, undefined);
assert.deepEqual(projectWardrobeForStyling([item], []).garments[0].groupIds, []);
assert.deepEqual(projected.v37Items, [hydrated], 'compatibility is lossless');

for (const subType of ['buba', 'iro', 'wrapper', 'iro-and-buba', 'boubou', 'aso-ebi',
  'gele', 'headwrap', 'head-scarf', 'structured-headpiece', 'kaftan']) {
  const category = ['iro', 'wrapper'].includes(subType) ? 'bottom'
    : ['gele', 'headwrap', 'head-scarf', 'structured-headpiece'].includes(subType) ? 'jewelry' : item.category;
  const result = projectWardrobeForStyling([{ ...item, category, subType }]).garments[0];
  assert.equal(result.subType, subType, 'no Western aliasing or taxonomy expansion');
  assert.equal(result.category, category);
}
for (const fabric of ['lace', 'chiffon'] as const) {
  assert.equal(projectWardrobeForStyling([{ ...item, fabric }]).garments[0].fabric, fabric);
}

const cleared = mergeWardrobeCorrection(item, {
  fabric: undefined, formalityLevel: undefined, seasonTags: [], occasionTags: [],
  accentColor: undefined, dominantHsl: undefined, dominantLab: undefined, rise: undefined,
});
const unknown = projectWardrobeForStyling([cleared]).garments[0];
for (const field of ['fabric', 'formalityLevel', 'accentColor', 'dominantHsl', 'dominantLab', 'rise'] as const) {
  assert.equal(unknown[field], undefined, `explicitly cleared ${field} stays unknown`);
}
assert.deepEqual(unknown.seasonTags, []);
assert.deepEqual(unknown.occasionTags, [], 'no traditional context inferred from buba');
const legacy = mapDbRowToWardrobeItem({
  id: 'legacy', garment_type: 'dress', sub_type: 'kaftan', color_family: '',
  image_url: 'test://legacy', created_at: '2026-01-01',
});
const legacySemantics = projectWardrobeForStyling([legacy]).garments[0];
assert.equal(legacySemantics.formalityLevel, undefined);
assert.equal(legacySemantics.fabric, undefined);
assert.equal(legacySemantics.colorFamily, '');
assert.deepEqual(legacySemantics.seasonTags, []);
assert.equal(legacySemantics.accentColor, undefined);

const relationships: GarmentGroup[] = ['coordinated_set', 'multi_item', 'layered'].map((relationshipType, index) =>
  mapDbRowToGarmentGroup({
    id: `group-${index}`, user_id: 'owner', relationship_type: relationshipType,
    relationship_confidence: 0.8, confirmation_status: ['user_confirmed', 'ai_inferred', 'user_rejected'][index],
    shared_attributes: { fabric: 'wool', nested: { colours: ['gold'] } },
    source_image_path: 'owner/source.jpg', created_at: '2026-01-01', updated_at: '2026-01-02',
    garment_group_members: [
      { group_id: `group-${index}`, garment_id: item.id, user_id: 'owner', created_at: '2026-01-01' },
      { group_id: `group-${index}`, garment_id: 'unloaded-member', user_id: 'owner', created_at: '2026-01-01' },
    ],
  }));
const originalRelationships = JSON.stringify(relationships);
const grouped = projectWardrobeForStyling([item], relationships);
assert.equal(JSON.stringify(item), originalItem, 'projection does not mutate canonical garments');
assert.equal(JSON.stringify(relationships), originalRelationships, 'projection does not mutate Phase A records');
assert.deepEqual(grouped.relationships, relationships, 'all existing relationship metadata retained');
assert.deepEqual(grouped.garments[0].groupIds, relationships.map(group => group.id));
assert.equal(grouped.garments[0].fabric, 'lace', 'shared attributes never overwrite garment truth');
assert.equal(grouped.relationships?.[2].confirmationStatus, 'user_rejected', 'membership does not imply approval');
assert.equal(grouped.relationships?.[0].members[1].garmentId, 'unloaded-member', 'partial wardrobe does not rewrite relationships');

const corrections = {
  subType: item.subType, colorFamily: item.colorFamily, fabric: item.fabric,
  pattern: item.pattern, formalityLevel: item.formalityLevel,
};
const manual = mergeWardrobeCorrection({ ...item, colorFamily: '' }, corrections);
const aiCorrected = mergeWardrobeCorrection({
  ...item, subType: 'blouse', colorFamily: 'red', fabric: 'cotton', pattern: 'solid',
  formalityLevel: 3, modelConfidence: 0.2, photoUri: 'test://different-photo', createdAt: '2026-02-01',
}, corrections);
// Both entry paths use the same P0.1 colour correction; no test-side repairs.
assert.deepEqual(
  projectWardrobeForStyling([manual], relationships).garments,
  projectWardrobeForStyling([aiCorrected], relationships).garments,
  'equivalent confirmed semantics ignore AI/photo/bookkeeping provenance',
);
assert.deepEqual(
  projectWardrobeForStyling([{ ...manual, modelConfidence: 0.99, confirmedFields: [] }]).garments,
  projectWardrobeForStyling([{ ...aiCorrected, modelConfidence: 0.1 }]).garments,
  'diagnostic confidence and correction provenance cannot affect equivalent styling truth',
);
assert.deepEqual(projectWardrobeForStyling([item], relationships), grouped, 'repeatable');
assert.deepEqual(projectWardrobeForStyling([], []), { garments: [], relationships: [], v37Items: [] });

const before = JSON.stringify({ item, relationships });
grouped.v37Items[0].seasonTags.push('winter');
grouped.v37Items[0].dominantHsl!.h = 100;
// Even a consumer circumventing readonly types cannot mutate canonical nested data.
(grouped.relationships![0].sharedAttributes.nested as { colours: string[] }).colours.push('red');
assert.equal(JSON.stringify({ item, relationships }), before, 'canonical inputs are never mutated or aliased');
assert.deepEqual(grouped.garments[0].seasonTags, ['summer'], 'compatibility mutation cannot change semantic view');
assert.equal(grouped.garments[0].dominantHsl?.h, 221);
assert.notEqual(grouped.garments[0].dominantHsl, item.dominantHsl);

// Reuse the existing golden-set candidate-generation fixture without editing it
// or exporting its private fixtures just for this boundary test.
const golden = readFileSync('__tests__/recommendation-golden-set.ts', 'utf8');
const fixture = golden.slice(golden.indexOf("console.log('\\n1. Candidate Generation');"), golden.indexOf('// ─── 2. WEATHER'));
const rows = [...fixture.matchAll(/mk\('([^']+)','([^']+)','([^']+)','([^']+)',(\[[^\]]+\]),(\{[^}]+\})\)/g)];
assert.equal(rows.length, 4, 'frozen fixture extraction must not silently become an empty regression');
const items = rows.map(row => ({
  id: row[1], category: row[2], subType: row[3], colorFamily: row[4],
  occasionTags: JSON.parse(row[5].replace(/'/g, '"')), photoUri: 'test://photo',
  thumbnailUri: 'test://photo', displayName: row[3],
  createdAt: '2025-01-01T00:00:00Z', formalityLevel: Number(/formalityLevel:(\d+)/.exec(row[6])![1]),
  seasonTags: ['all-season'], fabric: /fabric:'([^']+)'/.exec(row[6])?.[1],
})) as WardrobeItem[];
const profile: UserProfile = {
  name: 'Test', bodyType: null, eyeColor: null, skinTone: null, undertone: null,
  styleGoalPrimary: 'classic', styleGoalSecondary: null, lifestyleWork: 3, lifestyleCasual: 4,
  lifestyleEvents: 2, lifestyleActive: 1, lifestyleBrunch: 3,
  constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
  onboardingComplete: true, heightBand: null, weatherEnabled: true, isGuest: false,
};
const date = '2026-08-13';
const compatibility = projectWardrobeForStyling(items, relationships).v37Items;
const pool = generateOutfitPool(items, profile, null, [], date, [], EMPTY_AFFINITY);
const projectedPool = generateOutfitPool(compatibility, profile, null, [], date, [], EMPTY_AFFINITY);
assert.ok(pool.casual.length > 0, 'non-empty existing fixture');
assert.deepEqual(projectedPool, pool, 'v3.7 candidates, scores, ranking and explanations unchanged');
assert.equal(computePoolHash(compatibility, profile), computePoolHash(items, profile));
assert.deepEqual(
  applyDailyRotation(projectedPool, INITIAL_ROTATION_STATE, date),
  applyDailyRotation(pool, INITIAL_ROTATION_STATE, date),
  'rotation outputs unchanged',
);
assert.deepEqual(
  generateOutfitsForItem(compatibility[0], compatibility, profile),
  generateOutfitsForItem(items[0], items, profile),
  'just-added suggestions unchanged',
);
const context = readFileSync('contexts/AppContext.tsx', 'utf8');
assert.match(context, /generateOutfitPool\(\s*projectWardrobeForStyling\(activeWardrobeItems\)\.v37Items/);
assert.match(context, /generateOutfitsForItem\(styling\.v37Items\[items\.length - 1\], styling\.v37Items/);

async function main() {
  const bundled = await build({ entryPoints: ['lib/stylingWardrobe.ts'], bundle: true, platform: 'node', write: false, metafile: true });
  for (const dependency of Object.keys(bundled.metafile!.inputs)) {
    assert.doesNotMatch(dependency, /supabase|query-client|photoroom|gemini|server\/|react-native|expo-/i,
      `no provider/network/native dependency: ${dependency}`);
  }
  console.log('P0.2 canonical styling projection, relationships, authority, isolation and frozen v3.7 regression passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
