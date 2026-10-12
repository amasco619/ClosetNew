import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import type { GarmentGroup, WardrobeItem } from '../constants/types';
import { generateOutfitPool, applyDailyRotation, INITIAL_ROTATION_STATE } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';
import { mapDbRowToGarmentGroup } from '../lib/garmentGroupMapper';
import { projectWardrobeForStyling } from '../lib/stylingWardrobe';
import { asTraditionalOutfits, buildStylingContextCandidates } from '../lib/traditionalStyling';
import {
  projectRelationshipsForStyling, coordinatedCandidateScopes,
  annotateStylingRelationships, usesConfirmedCoordinatedSet,
} from '../lib/stylingRelationships';
import { traditionalGroups, traditionalProfile as profile, traditionalWardrobe as items } from './fixtures/traditionalWardrobe';

const owner = 'fixture-owner', today = '2026-10-12';
const group = traditionalGroups[0];
const phaseGroups = (['coordinated_set', 'layered', 'multi_item'] as const).map(relationshipType =>
  mapDbRowToGarmentGroup({
    id: relationshipType, user_id: owner, relationship_type: relationshipType,
    confirmation_status: 'user_confirmed', shared_attributes: { fabric: 'wool', formalityLevel: 1 },
    created_at: today, updated_at: today,
    garment_group_members: ['buba', 'iro'].map(id => ({
      group_id: relationshipType, user_id: owner, garment_id: id, created_at: today,
    })),
  }));
const differentFacts = items.map(item => item.id === 'iro' ? { ...item, fabric: 'chiffon' as const } : item);
const before = JSON.stringify({ differentFacts, phaseGroups });
const canonical = projectWardrobeForStyling(differentFacts, phaseGroups);
const related = projectRelationshipsForStyling(canonical, owner);
assert.deepEqual(related.garments, canonical.garments);
assert.deepEqual(related.relationships, phaseGroups);
assert.deepEqual(related.relationshipUnits?.map(unit => unit.relationshipType), ['coordinated_set', 'layered', 'multi_item']);
for (const unit of related.relationshipUnits!) {
  assert.deepEqual(unit.memberIds, ['buba', 'iro']);
  assert.deepEqual(unit.availableMemberIds, ['buba', 'iro']);
  assert.deepEqual(unit.missingMemberIds, []);
  assert.equal(Object.hasOwn(unit, 'layerOrder'), false);
}
assert.equal(related.garments.find(item => item.id === 'buba')!.fabric, 'lace');
assert.equal(related.garments.find(item => item.id === 'iro')!.fabric, 'chiffon');
assert.equal(related.garments[0].formalityLevel, 8, 'shared attributes never become garment facts');
assert.equal(JSON.stringify({ differentFacts, phaseGroups }), before);
assert.equal(projectRelationshipsForStyling(projectWardrobeForStyling(items)).relationshipUnits, undefined);
assert.deepEqual(projectRelationshipsForStyling(projectWardrobeForStyling(items, [])).relationshipUnits, []);

const scoped = (wardrobe = items, groups: GarmentGroup[] = [group]) =>
  projectRelationshipsForStyling(projectWardrobeForStyling(wardrobe, groups), owner);
const style = (wardrobe = items, groups: GarmentGroup[] = [group], context: 'traditional' | 'generic' = 'traditional') =>
  buildStylingContextCandidates(scoped(wardrobe, groups), context, profile, null, [], today, [], EMPTY_AFFINITY, null, true);
const pool = (result: ReturnType<typeof style>) => result.pool[result.sourceScenario!];
const has = (outfit: ReturnType<typeof pool>[number], id: string) =>
  outfit.components.some(component => component.matchedItemId === id);

// Six equally compatible standalone bottoms precede the confirmed partner.
// Frozen hero/support shortlists miss the real partner without membership input.
const buba = items[0], iro = items[1];
const crowded: WardrobeItem[] = [
  buba, ...Array.from({ length: 6 }, (_, i) => ({ ...iro, id: `independent-bottom-${i}` })),
  iro, ...items.filter(item => ['shoes', 'bag'].includes(item.category)),
];
const snapshot = JSON.stringify({ crowded, group });
const linked = style(crowded), unlinked = style(crowded, []);
const plans = coordinatedCandidateScopes(scoped(crowded), new Set(crowded.map(item => item.id)), new Set(['buba', 'iro']));
assert.equal(plans.length, 1);
assert.deepEqual(plans[0].memberIds, ['buba', 'iro']);
assert.ok(plans[0].itemIds.includes('heels') && plans[0].itemIds.includes('day-bag'), 'Western supports survive construction');
assert.ok(!plans[0].itemIds.some(id => id.startsWith('independent-bottom')));
assert.equal(coordinatedCandidateScopes(scoped(crowded, []), new Set(crowded.map(item => item.id)), new Set(['buba', 'iro'])).length, 0);
assert.ok(pool(linked).length > 0);
assert.ok(pool(linked).every(outfit => has(outfit, 'buba') && has(outfit, 'iro')), 'relationship makes coherent candidate reach v3.7');
assert.ok(pool(unlinked).length > 0);
assert.ok(pool(unlinked).every(outfit => !has(outfit, 'iro')), 'removing relationship removes the construction benefit, despite matching subtypes/print/colour');
assert.ok(pool(unlinked).some(outfit => outfit.components.some(component => component.matchedItemId?.startsWith('independent-bottom'))));
assert.deepEqual(style(crowded), linked);
assert.equal(JSON.stringify({ crowded, group }), snapshot);
assert.ok(pool(linked).every(outfit => outfit.components.every(component => crowded.some(item => item.id === component.matchedItemId))));

const renamed = crowded.map(item => ['buba', 'iro'].includes(item.id)
  ? { ...item, subType: item.id === 'buba' ? 'custom-core-a' : 'custom-core-b', occasionTags: ['traditional-event' as const] } : item);
assert.ok(pool(style(renamed)).every(outfit => has(outfit, 'buba') && has(outfit, 'iro')));
assert.doesNotMatch(readFileSync('lib/stylingRelationships.ts', 'utf8'), /\bbuba\b|\biro\b|\bgele\b/, 'membership, not garment-name rules');
for (const status of ['ai_inferred', 'user_rejected'] as const) {
  const nonauthoritative = scoped(crowded, [{ ...group, confirmationStatus: status }]);
  assert.equal(coordinatedCandidateScopes(nonauthoritative, new Set(crowded.map(item => item.id)), new Set(['buba', 'iro'])).length, 0);
}
for (const type of ['layered', 'multi_item'] as const) {
  const metadataOnly = scoped(crowded, [{ ...group, relationshipType: type }]);
  assert.equal(coordinatedCandidateScopes(metadataOnly, new Set(crowded.map(item => item.id)), new Set(['buba', 'iro'])).length, 0);
  assert.deepEqual(metadataOnly.relationshipUnits![0].memberIds, ['buba', 'iro']);
}

const foreign = { ...group, userId: 'another-owner', members: group.members.map(member => ({ ...member, userId: 'another-owner' })) };
const wrongMember = { ...group, members: group.members.map((member, index) => index ? { ...member, userId: 'another-owner' } : member) };
const wrongParent = { ...group, members: group.members.map(member => ({ ...member, groupId: 'another-group' })) };
for (const unsafe of [foreign, wrongMember, wrongParent]) {
  const rejected = scoped(crowded, [unsafe]);
  assert.deepEqual(rejected.relationshipUnits, [], 'no unsafe membership enters construction');
  assert.deepEqual(rejected.relationships, [unsafe], 'canonical source truth is not rewritten');
}
const missing = scoped(crowded.filter(item => item.id !== 'iro'));
assert.deepEqual(missing.relationshipUnits![0].missingMemberIds, ['iro']);
assert.equal(coordinatedCandidateScopes(missing, new Set(missing.garments.map(item => item.id)), new Set(['buba'])).length, 0);
assert.ok(pool(style(crowded.filter(item => item.id !== 'iro'))).every(outfit => !has(outfit, 'buba')), 'missing member is not fabricated or split into Traditional candidates');

const generic = style(items, [], 'generic');
assert.deepEqual(generic.pool, generateOutfitPool(items, profile, null, [], today, [], EMPTY_AFFINITY, null, true));
assert.deepEqual(style(items, [group], 'generic').pool, generic.pool, 'generic does not impose Traditional all-or-none rules');
const ordinaryAlternative: WardrobeItem = { ...items[4], id: 'boubou', subType: 'boubou', formalityLevel: 8 };
const incompatible = [...items.map(item => ['buba', 'iro'].includes(item.id) ? { ...item, fit: 'loose' as const } : item), ordinaryAlternative];
assert.ok(pool(style(incompatible)).some(outfit => has(outfit, 'boubou')), 'a coordinated set is not mandatory; normal valid owned alternatives survive');

const daily = applyDailyRotation(linked.pool, INITIAL_ROTATION_STATE, today, new Set(), true, false);
const displayed = annotateStylingRelationships(asTraditionalOutfits(daily.outfits), linked.relationshipUnits!);
assert.ok(displayed.length > 0 && displayed.every(usesConfirmedCoordinatedSet));
assert.deepEqual(displayed[0].stylingRelationships[0].participatingMemberIds, ['buba', 'iro']);
const ungrouped = annotateStylingRelationships(asTraditionalOutfits(daily.outfits), []);
assert.ok(ungrouped.every(outfit => outfit.stylingRelationships.length === 0 && !usesConfirmedCoordinatedSet(outfit)));
const allTypes = annotateStylingRelationships(asTraditionalOutfits(daily.outfits), related.relationshipUnits!);
assert.deepEqual(allTypes[0].stylingRelationships.map(use => use.relationshipType), ['coordinated_set', 'layered', 'multi_item']);
assert.ok(allTypes[0].stylingRelationships.every(use => !Object.hasOwn(use, 'layerOrder')));
const nonCoordinated = annotateStylingRelationships(asTraditionalOutfits(daily.outfits), related.relationshipUnits!.filter(unit => unit.relationshipType !== 'coordinated_set'));
assert.ok(nonCoordinated.every(outfit => !usesConfirmedCoordinatedSet(outfit)), 'layered/multi_item do not become coordinated sets');
assert.equal(JSON.stringify({ differentFacts, phaseGroups }), before);

async function main() {
  const graph = await build({ entryPoints: ['lib/traditionalStyling.ts'], bundle: true, platform: 'node', write: false, metafile: true });
  for (const dependency of Object.keys(graph.metafile!.inputs)) assert.doesNotMatch(dependency, /gemini|supabase|query-client|photoroom|server\/|react-native|expo-/i);
  const context = readFileSync('contexts/AppContext.tsx', 'utf8');
  assert.match(context, /projectRelationshipsForStyling\(projectWardrobeForStyling\(activeWardrobeItems, groups\), userId \?\? undefined\)/);
  assert.match(context, /outfits: annotateStylingRelationships/);
  console.log('Phase A membership changes real pre-evaluation construction; all relation types, owner safety, generic stability, provenance and frozen v3.7 evaluation preserved');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
