import assert from 'node:assert/strict';
import type { GarmentGroup, OutfitComponent, OutfitSet, WardrobeItem } from '../constants/types';
import { EMPTY_AFFINITY } from '../constants/affinity';
import { generateOutfitPool } from '../constants/outfitRotation';
import { buildStylingContextCandidates, asTraditionalOutfits } from '../lib/traditionalStyling';
import { projectWardrobeForStyling } from '../lib/stylingWardrobe';
import { applyNigerianStylingV1, type StructuralRole } from '../lib/nigerianStyling/v1';
import { buildDemoInput } from '../scripts/stylist-intake-phase-a-shadow';

const item = (id: string, category: WardrobeItem['category'], subType = id): WardrobeItem => ({
  id, category, subType, colorFamily: 'navy', photoUri: `synthetic://${id}`,
  occasionTags: ['work', 'event', 'traditional-event'], seasonTags: ['all-season'],
  createdAt: '2026-10-27T12:00:00.000Z',
});

const component = (id: string, category: OutfitComponent['category'], subType = id): OutfitComponent => ({
  category, subType, colorFamily: 'navy', owned: true, matchedItemId: id,
});

const outfit = (id: string, components: OutfitComponent[]): OutfitSet => ({
  id, scenario: 'event', components, confidenceScore: 71, rationale: 'source text', heroId: 'top',
});

const noGroups: GarmentGroup[] = [];
const topBottomWardrobe = [item('top', 'top'), item('bottom', 'bottom'), item('shoes', 'shoes')];
const topBottom = outfit('valid', [
  component('top', 'top'), component('bottom', 'bottom'), component('shoes', 'shoes'),
]);

// A conventional base pair passes and the sidecar preserves its order and score.
const basic = applyNigerianStylingV1([topBottom], {
  wardrobe: topBottomWardrobe, relationships: noGroups,
});
assert.equal(basic.outfits.length, 1);
assert.equal(basic.decisions[0].status, 'eligible');
assert.equal(basic.outfits[0].confidenceScore, 71);
assert.deepEqual(basic.outfits[0].components, topBottom.components);

// A one-piece can stand alone with optional layers and accessories.
const onePiece = item('dress', 'dress');
const layered = outfit('one-piece', [
  component('dress', 'dress'), component('shoes', 'shoes'), component('blazer', 'outerwear'),
]);
assert.equal(applyNigerianStylingV1([layered], {
  wardrobe: [onePiece, item('shoes', 'shoes'), item('blazer', 'outerwear')],
  relationships: noGroups,
}).decisions[0].status, 'eligible');

// Multiple base pieces or a one-piece plus a base pair are structural conflicts.
const extraTop = outfit('two-tops', [
  component('top', 'top'), component('second-top', 'top'), component('bottom', 'bottom'),
]);
assert.equal(applyNigerianStylingV1([extraTop], {
  wardrobe: [...topBottomWardrobe, item('second-top', 'top')], relationships: noGroups,
}).outfits.length, 0);
const mixedBase = outfit('dress-and-pair', [
  component('dress', 'dress'), component('top', 'top'), component('bottom', 'bottom'),
]);
assert.equal(applyNigerianStylingV1([mixedBase], {
  wardrobe: [...topBottomWardrobe, item('dress', 'dress')], relationships: noGroups,
}).outfits.length, 0);

// Headwear is a separate role: omitted unless requested, never synthesized.
const headwear = item('gele', 'jewelry', 'gele');
const headwearLook = outfit('with-gele', [
  ...topBottom.components, component('gele', 'jewelry', 'gele'),
]);
const withoutHeadwear = applyNigerianStylingV1([headwearLook], {
  wardrobe: [...topBottomWardrobe, headwear], relationships: noGroups,
});
assert.equal(withoutHeadwear.outfits.length, 1);
assert.deepEqual(withoutHeadwear.outfits[0].components.map(value => value.matchedItemId), ['top', 'bottom', 'shoes']);
assert.deepEqual(withoutHeadwear.decisions[0].removedHeadwearIds, ['gele']);
assert.equal(withoutHeadwear.outfits[0].confidenceScore, headwearLook.confidenceScore);
assert.equal(withoutHeadwear.outfits[0].heroId, 'top');
const requestedHeadwear = applyNigerianStylingV1([headwearLook], {
  wardrobe: [...topBottomWardrobe, headwear], relationships: noGroups, includeHeadwear: true,
});
assert.deepEqual(requestedHeadwear.outfits[0].components, headwearLook.components);
assert.equal(requestedHeadwear.outfits[0].components.length, headwearLook.components.length);
const requestedButUnavailable = applyNigerianStylingV1([topBottom], {
  wardrobe: topBottomWardrobe, relationships: noGroups, includeHeadwear: true,
});
assert.deepEqual(requestedButUnavailable.outfits[0].components, topBottom.components);

// Confirmed sets are atomic in every context, and cannot be paired with a stranger base.
const setTop = item('set-top', 'top');
const setBottom = item('set-bottom', 'bottom');
const strangerBottom = item('stranger-bottom', 'bottom');
const set: GarmentGroup = {
  id: 'confirmed-set', userId: 'synthetic', relationshipType: 'coordinated_set',
  confirmationStatus: 'user_confirmed', sharedAttributes: {},
  members: ['set-top', 'set-bottom'].map(garmentId => ({
    userId: 'synthetic', groupId: 'confirmed-set', garmentId, createdAt: '2026-10-27T12:00:00.000Z',
  })),
  createdAt: '2026-10-27T12:00:00.000Z', updatedAt: '2026-10-27T12:00:00.000Z',
};
const partialSet = outfit('partial-set', [
  component('set-top', 'top'), component('stranger-bottom', 'bottom'),
]);
const intactSet = outfit('intact-set', [
  component('set-top', 'top'), component('set-bottom', 'bottom'),
  component('blazer', 'outerwear'), component('shoes', 'shoes'),
]);
for (const scenario of ['work', 'event', 'traditional-event'] as const) {
  assert.equal(applyNigerianStylingV1([{ ...partialSet, scenario }], {
    wardrobe: [setTop, setBottom, strangerBottom], relationships: [set],
  }).outfits.length, 0);
  assert.equal(applyNigerianStylingV1([{ ...intactSet, scenario }], {
    wardrobe: [setTop, setBottom, item('blazer', 'outerwear'), item('shoes', 'shoes')],
    relationships: [set],
  }).outfits.length, 1);
}

// AI-inferred groups are not treated as confirmed facts.
assert.equal(applyNigerianStylingV1([partialSet], {
  wardrobe: [setTop, setBottom, strangerBottom],
  relationships: [{ ...set, confirmationStatus: 'ai_inferred' }],
}).outfits.length, 1);

// Unknown roles are preserved, explicitly labelled unknown, and never penalized.
const unknownComponent: OutfitComponent = {
  category: 'jewelry', subType: 'unclassified', colorFamily: 'navy', owned: true, matchedItemId: 'unknown',
};
const unknownLook = outfit('unknown-role', [...topBottom.components, unknownComponent]);
const unknownResult = applyNigerianStylingV1([unknownLook], {
  wardrobe: [...topBottomWardrobe, item('unknown', 'jewelry', 'unclassified')],
  relationships: noGroups,
  rolesByItemId: { unknown: 'unknown' } satisfies Record<string, StructuralRole>,
});
assert.equal(unknownResult.outfits.length, 1);
assert.equal(unknownResult.decisions[0].status, 'unknown');
assert.equal(unknownResult.outfits[0].confidenceScore, 71);

// Side-by-side diagnostic on the established 13-item synthetic fixture.
const demo = buildDemoInput();
const rolesByItemId = { gele: 'headwear' } as const;
const date = '2026-10-27';
const raw = generateOutfitPool(demo.wardrobe, demo.profile, null, [], date, [], EMPTY_AFFINITY, null, false);
const traditional = buildStylingContextCandidates(
  projectWardrobeForStyling(demo.wardrobe, demo.relationships),
  'traditional', demo.profile, null, [], date, [], EMPTY_AFFINITY, null, false,
);
const pools = [
  ['work', raw.work],
  ['event', raw.event],
  ['traditional', asTraditionalOutfits(traditional.pool[traditional.sourceScenario ?? 'wedding'])],
] as const;
for (const [, candidates] of pools) {
  const result = applyNigerianStylingV1(candidates, {
    wardrobe: demo.wardrobe, relationships: demo.relationships, rolesByItemId,
  });
  assert.ok(result.outfits.length > 0);
  assert.ok(result.outfits.every(value => !value.components.some(part => part.matchedItemId === 'gele')));
  assert.ok(result.outfits.every(value => value.confidenceScore === candidates.find(source =>
    source.id === value.id || value.id.startsWith(`nigerian-v1-${source.id}-`),
  )?.confidenceScore));
}
assert.ok(pools.every(([scenario]) => ['work', 'event', 'traditional'].includes(scenario)));
console.log('Nigerian styling v1: structural invariants and 13-item side-by-side pools passed.');
