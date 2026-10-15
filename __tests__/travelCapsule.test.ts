import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { GarmentGroup, OutfitSet, WardrobeItem } from '../constants/types';
import {
  TRAVEL_ACTIVITIES, travelChoices, travelLookKey, validTravelOutfit, travelChecklist,
  travelCoverage, travelGroupRevision, travelWardrobeRevision,
} from '../lib/travelCapsule';
import { SCENARIOS } from '../constants/outfitRotation';

const items: WardrobeItem[] = ['top', 'bottom', 'shoes', 'partner'].map((id, index) => ({
  id, photoUri: `test://${id}`, category: index === 0 ? 'top' : index === 2 ? 'shoes' : 'bottom',
  subType: id, colorFamily: 'navy', occasionTags: ['casual'], seasonTags: [], createdAt: '',
}));
const outfit = (scenario: OutfitSet['scenario'], ids = ['top', 'bottom', 'shoes']): OutfitSet => ({
  id: 'unstable-daily-index', scenario, components: ids.map(id => ({
    category: items.find(item => item.id === id)!.category, subType: id, colorFamily: 'navy', owned: true, matchedItemId: id,
  })),
});
const group: GarmentGroup = {
  id: 'confirmed', userId: 'owner', relationshipType: 'coordinated_set', confirmationStatus: 'user_confirmed',
  sharedAttributes: {}, createdAt: '', updatedAt: '',
  members: ['top', 'partner'].map(garmentId => ({ garmentId, groupId: 'confirmed', userId: 'owner', createdAt: '' })),
};
const generic = [outfit('casual'), outfit('work')], traditional = [outfit('traditional-event', ['top', 'partner', 'shoes'])];
const snapshot = JSON.stringify({ items, generic, traditional, group });
for (const activity of TRAVEL_ACTIVITIES) {
  if (activity.scenario && activity.scenario !== 'traditional-event') assert.ok(SCENARIOS.includes(activity.scenario));
  const choices = travelChoices(activity.id, generic, traditional, items, [group], 'owner');
  assert.ok(choices.every(choice => choice.outfit.scenario === activity.scenario));
}
assert.equal(travelChoices('casual', [], traditional, items, [], 'owner').length, 0, 'Traditional cannot fill generic activity');
assert.equal(travelChoices('traditional-event', [outfit('traditional-event')], [], items, [], 'owner').length, 0, 'generic cannot fill Traditional');
assert.equal(travelChoices('other', generic, traditional, items, [], 'owner').length, 0);
assert.equal(travelChoices('work', [outfit('casual')], [], items, [], 'owner').length, 0, 'no approximate matching');
const valid = outfit('casual');
assert.ok(validTravelOutfit(valid, items));
for (const component of [
  { ...valid.components[0], owned: false },
  { ...valid.components[0], matchedItemId: undefined },
  { ...valid.components[0], matchedItemId: ' ' },
  { ...valid.components[0], matchedItemId: 'foreign-or-deleted' },
]) assert.equal(validTravelOutfit({ ...valid, components: [component] }, items), false);
assert.equal(validTravelOutfit({ ...valid, components: [] }, items), false);
assert.equal(validTravelOutfit(valid, items.slice(1)), false, 'inactive item cannot be selected');
assert.equal(travelLookKey(valid), travelLookKey({ ...valid, id: 'another-index', components: [...valid.components].reverse() }));
assert.notEqual(travelLookKey(valid), travelLookKey(outfit('work')));
assert.notEqual(travelLookKey(valid), travelLookKey(outfit('casual', ['top', 'partner', 'shoes'])));
assert.equal(travelChoices('casual', [valid, { ...valid, id: 'duplicate' }], [], items, [], 'owner').length, 1);
const partial = travelChoices('casual', generic, traditional, items, [group], 'owner')[0];
assert.ok(partial.disclosures.some(text => text.includes('Partial confirmed coordinated set: 1 of 2')));
assert.ok(partial.disclosures.some(text => text.includes('not constructed with Traditional')));
const intact = travelChoices('traditional-event', generic, traditional, items, [group], 'owner')[0];
assert.ok(intact.disclosures.some(text => text.includes('all 2 pieces')));
assert.equal(intact.outfit, traditional[0], 'service provenance object is preserved');
const provenanceOutfit = {
  ...traditional[0],
  stylingRelationships: [{
    groupId: group.id, relationshipType: group.relationshipType, confirmationStatus: group.confirmationStatus,
    memberIds: ['top', 'partner'], participatingMemberIds: ['top', 'partner'],
  }],
};
assert.equal(travelChoices('traditional-event', [], [provenanceOutfit], items, [], 'owner').length, 0,
  'Traditional provenance cannot outlive authoritative membership');
assert.equal(travelChoices('traditional-event', [], [provenanceOutfit], items, [group], 'owner')[0].outfit,
  provenanceOutfit, 'all dedicated provenance is preserved, not replaced with generic annotation');
assert.equal(travelChoices('traditional-event', [], [outfit('traditional-event')], items, [group], 'owner').length, 0);
for (const changed of [
  { ...group, userId: 'foreign' },
  { ...group, confirmationStatus: 'ai_inferred' as const },
  { ...group, relationshipType: 'layered' as const },
  { ...group, members: group.members.map(member => ({ ...member, userId: 'foreign' })) },
]) assert.ok(!travelChoices('casual', generic, [], items, [changed], 'owner')[0].disclosures.some(text => text.includes('confirmed coordinated set')));
assert.ok(!travelChoices('casual', generic, [], items, [], 'owner')[0].disclosures.some(text => text.includes('Partial')));
const slots = [
  { id: '1', day: 1, activity: 'casual' as const, look: partial },
  { id: '2', day: 2, activity: 'casual' as const, look: partial },
  { id: '3', day: 3, activity: 'other' as const },
  { id: '4', day: 4, activity: 'wedding' as const },
];
assert.deepEqual(travelCoverage(slots), { planned: 2, total: 4 });
assert.deepEqual(travelCoverage([]), { planned: 0, total: 0 });
assert.deepEqual(travelChecklist(slots, items).map(item => item.id), ['top', 'bottom', 'shoes']);
assert.deepEqual(travelChecklist(slots, items.slice(1)), [], 'invalid assigned look contributes no partial checklist');
assert.equal(travelWardrobeRevision(items), travelWardrobeRevision(items.map(item => ({ ...item, photoUri: 'renewed-url' }))));
assert.notEqual(travelWardrobeRevision(items), travelWardrobeRevision(items.slice(1)));
assert.notEqual(travelGroupRevision([group]), travelGroupRevision([{ ...group, members: group.members.slice(1) }]));
assert.equal(JSON.stringify({ items, generic, traditional, group }), snapshot, 'no input mutation');

// Import/access boundary: only selected public results + named Traditional service and group reads.
const source = readFileSync('components/TravelPlanner.tsx', 'utf8');
for (const forbidden of ['generateOutfitPool', 'applyDailyRotation', 'outfitPool', 'AsyncStorage', 'setTodayMood',
  'reactToOutfit', 'logWear(', 'saveLook', 'updateProfile', 'upsert', 'insert', 'fetch(']) {
  assert.ok(!source.includes(forbidden), `planner must not use ${forbidden}`);
}
assert.ok(source.includes('refreshPremiumEntitlement(true)'));
assert.ok(source.includes("getStylingRecommendations('traditional')"));
console.log('travelCapsule: mapping, source separation, ownership, stable identity, relationships, checklist, partial coverage and side-effect boundaries passed');
