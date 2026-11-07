import assert from 'node:assert/strict';
import type { GarmentGroup, WardrobeItem } from '../constants/types';
import {
  guardCheckLook,
  type CheckLookBrief,
  type CheckLookGuardInput,
} from '../lib/checkLookGuard';

function item(
  id: string,
  category: WardrobeItem['category'],
  subType: string,
  overrides: Partial<WardrobeItem> = {},
): WardrobeItem {
  return {
    id, photoUri: `test://${id}`, category, subType, colorFamily: 'navy',
    occasionTags: [], seasonTags: [], createdAt: '',
    ...overrides,
  };
}

function group(ids: string[], id = 'aso-ebi'): GarmentGroup {
  return {
    id, userId: 'owner', relationshipType: 'coordinated_set',
    confirmationStatus: 'user_confirmed', sharedAttributes: {}, createdAt: '', updatedAt: '',
    members: ids.map(garmentId => ({ garmentId, groupId: id, userId: 'owner', createdAt: '' })),
  };
}

const top = item('top', 'top', 'blouse', { sleeveLength: 'long' });
const bottom = item('bottom', 'bottom', 'trousers');
const shoes = item('shoes', 'shoes', 'loafers');

function run(
  brief: CheckLookBrief = { context: 'work' },
  overrides: Partial<CheckLookGuardInput> = {},
) {
  const items = overrides.items ?? [top, bottom, shoes];
  return guardCheckLook({
    selection: { itemIds: ['top', 'bottom'], occasion: 'work' },
    brief,
    items,
    groups: [],
    ...overrides,
  });
}

const validBriefs: CheckLookBrief[] = [
  { context: 'church', denomination: 'anglican' },
  { context: 'funeral', announcedColours: { kind: 'none' }, assignedGroupId: 'none' },
  { context: 'traditional-wedding', role: 'guest', asoEbiGroupId: 'none' },
];
for (const brief of validBriefs) {
  const guard = run(brief, {
    garmentFacts: { top: { backless: false, strapless: false } },
  });
  if (brief.context !== 'church') assert.equal(guard.pass, true);
}

const notSureChurch = run({
  context: 'church', denomination: 'not-sure',
});
assert.ok(notSureChurch.missing.includes('church denomination'));
assert.ok(notSureChurch.missing.some(value => value.includes('back coverage')));
assert.ok(notSureChurch.missing.some(value => value.includes('strap coverage')));
const otherChurch = run({
  context: 'church', denomination: 'other',
});
assert.ok(otherChurch.missing.includes('church coverage rules for this denomination'));

const catholicSleeveless = run(
  { context: 'church', denomination: 'catholic' },
  {
    items: [item('top', 'top', 'blouse', { sleeveLength: 'sleeveless' }), bottom],
    garmentFacts: { top: { backless: false, strapless: false } },
  },
);
assert.ok(catholicSleeveless.failures.some(value => value.includes('sleeveless')));
assert.ok(catholicSleeveless.missing.length === 0);

const pentecostalUnknown = run(
  { context: 'church', denomination: 'pentecostal' },
  {
    items: [item('top', 'top', 'blouse', { sleeveLength: 'sleeveless' }), bottom],
    garmentFacts: { top: { backless: false, strapless: false } },
  },
);
assert.ok(pentecostalUnknown.missing.some(value => value.includes('modesty')));
const pentecostalModest = run(
  { context: 'church', denomination: 'pentecostal' },
  {
    items: [item('top', 'top', 'blouse', { sleeveLength: 'sleeveless' }), bottom],
    garmentFacts: { top: { backless: false, strapless: false, modestForChurch: true } },
  },
);
assert.equal(pentecostalModest.failures.length, 0);
assert.equal(pentecostalModest.missing.length, 0);
const pentecostalNotModest = run(
  { context: 'church', denomination: 'pentecostal' },
  {
    items: [item('top', 'top', 'blouse', { sleeveLength: 'sleeveless' }), bottom],
    garmentFacts: { top: { backless: false, strapless: false, modestForChurch: false } },
  },
);
assert.ok(pentecostalNotModest.failures.some(value => value.includes('not marked modest')));

const churchUnknownGarmentFacts = run(
  { context: 'church', denomination: 'anglican' },
);
assert.ok(churchUnknownGarmentFacts.missing.some(value => value.includes('back coverage')));
assert.ok(churchUnknownGarmentFacts.missing.some(value => value.includes('strap coverage')));
const churchShortSleeve = run(
  { context: 'church', denomination: 'anglican' },
  {
    items: [item('top', 'top', 'blouse', { sleeveLength: 'short' }), bottom],
    garmentFacts: { top: { backless: false, strapless: false } },
  },
);
assert.equal(churchShortSleeve.failures.length, 0, 'short sleeves alone do not fail');

const churchAboveKnee = run(
  { context: 'church', denomination: 'anglican' },
  {
    selection: { itemIds: ['top', 'skirt'], occasion: 'event' },
    items: [top, item('skirt', 'bottom', 'midi-skirt')],
    garmentFacts: { top: { backless: false, strapless: false }, skirt: { hemPosition: 'above-knee' } },
  },
);
assert.ok(churchAboveKnee.failures.some(value => value.includes('hem')));
const pentecostalAboveKnee = run(
  { context: 'church', denomination: 'pentecostal' },
  {
    selection: { itemIds: ['top', 'skirt'], occasion: 'event' },
    items: [top, item('skirt', 'bottom', 'midi-skirt')],
    garmentFacts: { top: { backless: false, strapless: false }, skirt: { hemPosition: 'above-knee' } },
  },
);
assert.ok(pentecostalAboveKnee.failures.some(value => value.includes('hem')));

const backlessNoCover = run(
  { context: 'church', denomination: 'catholic' },
  {
    items: [top, bottom],
    garmentFacts: { top: { backless: true, strapless: false } },
  },
);
assert.ok(backlessNoCover.failures.some(value => value.includes('backless')));
const backlessWithStole = run(
  { context: 'church', denomination: 'catholic' },
  {
    selection: { itemIds: ['top', 'bottom', 'stole'], occasion: 'event' },
    items: [top, bottom, item('stole', 'jewelry', 'stole')],
    garmentFacts: { top: { backless: true, strapless: false } },
  },
);
assert.equal(backlessWithStole.failures.length, 0);
const straplessNoCover = run(
  { context: 'church', denomination: 'anglican' },
  {
    items: [top, bottom],
    garmentFacts: { top: { backless: false, strapless: true } },
  },
);
assert.ok(straplessNoCover.failures.some(value => value.includes('strapless')));

const noSleeveless = run({ context: 'work' }, {
  items: [item('top', 'top', 'blouse', { sleeveLength: 'sleeveless' }), bottom],
  constraints: { noSleeveless: true },
});
assert.ok(noSleeveless.failures.some(value => value.includes('no-sleeveless')));
assert.ok(run({ context: 'work' }, {
  items: [item('top', 'top', 'blouse'), bottom],
  constraints: { noSleeveless: true },
}).missing.some(value => value.includes('sleeve length')));

const aboveKneeSkirt = item('skirt', 'bottom', 'mini-skirt');
assert.ok(run({ context: 'work' }, {
  selection: { itemIds: ['top', 'skirt'], occasion: 'work' },
  items: [top, aboveKneeSkirt],
  constraints: { noShortSkirts: true },
}).missing.some(value => value.includes('hem position')));
assert.ok(run({ context: 'work' }, {
  selection: { itemIds: ['top', 'skirt'], occasion: 'work' },
  items: [top, aboveKneeSkirt],
  constraints: { noShortSkirts: true },
  garmentFacts: { skirt: { hemPosition: 'above-knee' } },
}).failures.some(value => value.includes('short-skirt preference')));
assert.ok(run({ context: 'work' }, {
  selection: { itemIds: ['top', 'unknown-bottom'], occasion: 'work' },
  items: [top, item('unknown-bottom', 'bottom', '')],
  constraints: { noShortSkirts: true },
}).missing.some(value => value.includes('whether a selected bottom is a skirt')));
const miniDress = item('dress', 'dress', 'mini-dress');
assert.ok(run({ context: 'work' }, {
  selection: { itemIds: ['dress'], occasion: 'work' },
  items: [miniDress],
  constraints: { noShortSkirts: true },
  garmentFacts: { dress: { hemPosition: 'above-knee' } },
}).failures.some(value => value.includes('short-skirt preference')));
assert.ok(run({ context: 'work' }, {
  selection: { itemIds: ['dress'], occasion: 'work' },
  items: [miniDress],
  constraints: { noShortSkirts: true },
}).missing.some(value => value.includes('hem position')));

const alwaysCovering = run({ context: 'casual' }, {
  constraints: { headCoveringPreference: 'always' },
});
assert.ok(alwaysCovering.failures.some(value => value.includes('head-covering')));
const styleHeadwearIsNotCovering = run({ context: 'casual' }, {
  items: [top, bottom, item('gele', 'jewelry', 'gele')],
  constraints: { headCoveringPreference: 'always' },
});
assert.ok(styleHeadwearIsNotCovering.failures.some(value => value.includes('head-covering')));
const coveringItem = item('hijab', 'jewelry', 'hijab');
assert.equal(run({ context: 'casual' }, {
  selection: { itemIds: ['top', 'bottom', 'hijab'], occasion: 'casual' },
  items: [top, bottom, coveringItem],
  constraints: { headCoveringPreference: 'always' },
}).pass, true);
assert.ok(run({ context: 'work' }, {
  constraints: { headCoveringPreference: 'events' },
}).pass);
assert.ok(run({ context: 'church', denomination: 'anglican' }, {
  constraints: { headCoveringPreference: 'events' },
  garmentFacts: { top: { backless: false, strapless: false } },
}).failures.some(value => value.includes('head-covering')));
assert.ok(run({ context: 'work' }, {
  selection: { itemIds: ['top', 'bottom', 'hijab'], occasion: 'work' },
  items: [top, bottom, coveringItem],
  constraints: { headCoveringPreference: 'never' },
}).failures.some(value => value.includes('head-covering')));

assert.ok(run({
  context: 'funeral', announcedColours: { kind: 'not-sure' }, assignedGroupId: 'none',
}).missing.some(value => value.includes('announced funeral colours')));
assert.equal(run({
  context: 'funeral', announcedColours: { kind: 'colours', values: ['navy'] }, assignedGroupId: 'none',
}).pass, true);
assert.ok(run({
  context: 'funeral', announcedColours: { kind: 'colours', values: ['red'] }, assignedGroupId: 'none',
}).failures.some(value => value.includes('announced funeral colour')));
const unknownColour = run(
  { context: 'funeral', announcedColours: { kind: 'colours', values: ['red'] }, assignedGroupId: 'none' },
  { items: [item('top', 'top', 'blouse', { colorFamily: '' }), bottom] },
);
assert.ok(unknownColour.missing.some(value => value.includes('colour of every selected piece')));
assert.equal(unknownColour.failures.some(value => value.includes('announced funeral colour')), false,
  'unknown garment colours are missing facts, not a mismatch');
assert.equal(run({
  context: 'funeral', announcedColours: { kind: 'none' }, assignedGroupId: 'none',
}).pass, true);

const asoEbiItems = [item('set-top', 'top', 'blouse'), item('set-bottom', 'bottom', 'wrapper')];
const asoEbi = group(['set-top', 'set-bottom']);
const assignedBrief: CheckLookBrief = {
  context: 'traditional-wedding', role: 'guest', asoEbiGroupId: asoEbi.id,
};
assert.equal(run(assignedBrief, {
  selection: { itemIds: ['set-top', 'set-bottom'], occasion: 'wedding' },
  items: asoEbiItems,
  groups: [asoEbi],
}).pass, true);
assert.ok(run({
  context: 'traditional-wedding', role: 'not-sure', asoEbiGroupId: 'not-sure',
}).missing.some(value => value.includes('your role')));
assert.ok(run({
  context: 'traditional-wedding', role: 'guest', asoEbiGroupId: 'not-sure',
}).missing.some(value => value.includes('assigned aso-ebi')));
assert.ok(run({
  context: 'funeral', announcedColours: { kind: 'none' }, assignedGroupId: 'not-sure',
}).missing.some(value => value.includes('assigned funeral set')));
const incompleteSet = run(assignedBrief, {
  selection: { itemIds: ['set-top'], occasion: 'wedding' },
  items: asoEbiItems,
  groups: [asoEbi],
});
assert.ok(incompleteSet.failures.some(value => value.includes('full assigned set')));
const extraBase = run(assignedBrief, {
  selection: { itemIds: ['set-top', 'set-bottom', 'stranger-dress'], occasion: 'wedding' },
  items: [...asoEbiItems, item('stranger-dress', 'dress', 'gown')],
  groups: [asoEbi],
});
assert.ok(extraBase.failures.some(value => value.includes('another base garment')));
assert.ok(run({ context: 'traditional-wedding', role: 'guest', asoEbiGroupId: 'stale' }, {
  selection: { itemIds: ['set-top', 'set-bottom'], occasion: 'wedding' },
  items: asoEbiItems,
  groups: [asoEbi],
}).missing.some(value => value.includes('membership')));

const precedence = run(
  { context: 'church', denomination: 'catholic' },
  {
    selection: { itemIds: ['top', 'skirt'], occasion: 'event' },
    items: [item('top', 'top', 'blouse', { sleeveLength: 'sleeveless' }), item('skirt', 'bottom', 'mini-skirt')],
    constraints: { noShortSkirts: true },
    garmentFacts: { top: { backless: false, strapless: false } },
  },
);
assert.ok(precedence.failures.some(value => value.includes('sleeveless')));
assert.ok(precedence.missing.some(value => value.includes('hem position')));
assert.equal(precedence.pass, false, 'known failure and missing fact are both retained');

console.log('Check my look deterministic guard rules, missing facts, Not sure handling and precedence passed.');
