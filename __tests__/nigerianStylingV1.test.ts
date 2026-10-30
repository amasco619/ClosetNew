import assert from 'node:assert/strict';
import type { GarmentGroup, OutfitComponent, OutfitSet, WardrobeItem } from '../constants/types';
import { EMPTY_AFFINITY } from '../constants/affinity';
import { generateOutfitPool } from '../constants/outfitRotation';
import { buildStylingContextCandidates, asTraditionalOutfits } from '../lib/traditionalStyling';
import { projectWardrobeForStyling } from '../lib/stylingWardrobe';
import {
  applyNigerianStylingV1,
  type NigerianStylingContext,
  type NigerianStylingV1Input,
} from '../lib/nigerianStyling/v1';
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
const top = item('top', 'top');
const bottom = item('bottom', 'bottom');
const shoes = item('shoes', 'shoes');
const topBottomWardrobe = [top, bottom, shoes];
const topBottom = outfit('valid', [
  component('top', 'top'), component('bottom', 'bottom'), component('shoes', 'shoes'),
]);
const run = (
  candidates: readonly OutfitSet[],
  context: NigerianStylingContext,
  wardrobe: readonly WardrobeItem[],
  relationships: readonly GarmentGroup[] = noGroups,
  options: Partial<NigerianStylingV1Input> = {},
) => applyNigerianStylingV1(candidates, {
  context, wardrobe, relationships, ...options,
});

const coveringTypes = [
  'gyale', 'kallabi', 'mayafi', 'hijab', 'scarf', 'head-scarf', 'headwrap', 'turban',
] as const;
const styleHeadwearTypes = ['gele', 'ichafu'] as const;
const ownedCoverings = coveringTypes.map(type => item(type, 'jewelry', type));
const ownedStyleHeadwear = styleHeadwearTypes.map(type => item(type, 'jewelry', type));

// Base structure stays structural and preserves the v3.7 score.
const basic = run([topBottom], 'work', topBottomWardrobe);
assert.equal(basic.outfits.length, 1);
assert.equal(basic.decisions[0].status, 'eligible');
assert.equal(basic.outfits[0].confidenceScore, 71);
assert.deepEqual(basic.outfits[0].components, topBottom.components);

const onePiece = item('dress', 'dress');
const layered = outfit('one-piece', [
  component('dress', 'dress'), component('shoes', 'shoes'), component('blazer', 'outerwear'),
]);
assert.equal(run([layered], 'event', [onePiece, shoes, item('blazer', 'outerwear')])
  .decisions[0].status, 'eligible');
const extraTop = outfit('two-tops', [
  component('top', 'top'), component('second-top', 'top'), component('bottom', 'bottom'),
]);
assert.equal(run([extraTop], 'work', [...topBottomWardrobe, item('second-top', 'top')])
  .outfits.length, 0);
const mixedBase = outfit('dress-and-pair', [
  component('dress', 'dress'), component('top', 'top'), component('bottom', 'bottom'),
]);
assert.equal(run([mixedBase], 'event', [...topBottomWardrobe, onePiece]).outfits.length, 0);

// Confirmed-set integrity is strict only in Traditional or a marked aso-ebi event.
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
  component('shoes', 'shoes'),
]);
const setWardrobe = [setTop, setBottom, strangerBottom, shoes];
for (const context of ['work', 'casual', 'event'] as const) {
  assert.equal(run([partialSet], context, setWardrobe, [set]).outfits.length, 1);
}
assert.equal(run([partialSet], 'event', setWardrobe, [set], {
  asoEbiSetIds: [set.id],
}).outfits.length, 0);
assert.equal(run([partialSet], 'traditional', setWardrobe, [set]).outfits.length, 0);
assert.equal(run([intactSet], 'event', setWardrobe, [set], {
  asoEbiSetIds: [set.id],
}).outfits.length, 1);
assert.equal(run([partialSet], 'traditional', setWardrobe, [{
  ...set, confirmationStatus: 'ai_inferred',
}]).outfits.length, 1);

// The unset preference retains the default: owned covering items on Traditional wrapper looks.
const wrapper = item('wrapper', 'bottom', 'wrapper');
const wrapperLook = outfit('wrapper-look', [
  component('top', 'top'), component('wrapper', 'bottom', 'wrapper'), component('shoes', 'shoes'),
]);
const wrapperWardrobe = [top, wrapper, shoes, ...ownedCoverings, ...ownedStyleHeadwear];
const traditionalWrapper = run([wrapperLook], 'traditional', wrapperWardrobe);
assert.equal(traditionalWrapper.outfits.length, coveringTypes.length);
assert.deepEqual(
  traditionalWrapper.outfits.map(look =>
    look.components.find(part => coveringTypes.includes(part.subType as typeof coveringTypes[number]))?.subType,
  ),
  [...coveringTypes],
);
assert.ok(traditionalWrapper.outfits.every(look => look.confidenceScore === wrapperLook.confidenceScore));
assert.ok(traditionalWrapper.decisions.every(decision => decision.addedCoveringItemIds.length === 1));

// Default does not add coverings in Work, Casual, or non-wrapper Traditional looks.
for (const context of ['work', 'casual'] as const) {
  assert.equal(run([wrapperLook], context, wrapperWardrobe).outfits[0].components
    .some(part => coveringTypes.includes(part.subType as typeof coveringTypes[number])), false);
}
assert.equal(run([topBottom], 'traditional', [...topBottomWardrobe, ...ownedCoverings])
  .outfits[0].components.some(part => coveringTypes.includes(part.subType as typeof coveringTypes[number])), false);
const blazerWrapper = outfit('blazer-wrapper', [
  ...wrapperLook.components, component('blazer', 'outerwear'),
]);
assert.equal(run([blazerWrapper], 'traditional', [...wrapperWardrobe, item('blazer', 'outerwear')])
  .outfits[0].components.some(part => coveringTypes.includes(part.subType as typeof coveringTypes[number])), false);

// "Events" applies to owned covering items in Event and Traditional, including jeans/blazer looks.
const eventPreference = run([topBottom], 'event', [...topBottomWardrobe, ...ownedCoverings], noGroups, {
  headCoveringPreference: 'events',
});
assert.equal(eventPreference.outfits.length, coveringTypes.length);
const jeansLook = outfit('jeans-look', [
  component('top', 'top'), component('jeans', 'bottom', 'jeans'), component('shoes', 'shoes'),
]);
const jeansWardrobe = [top, item('jeans', 'bottom', 'jeans'), shoes, ...ownedCoverings];
const eventJeans = run([jeansLook], 'event', jeansWardrobe, noGroups, {
  headCoveringPreference: 'events',
});
assert.equal(eventJeans.outfits[0].components
  .some(part => coveringTypes.includes(part.subType as typeof coveringTypes[number])), true);
assert.equal(eventJeans.decisions[0].headCoveringSatisfied, true);
assert.equal(run([topBottom], 'casual', [...topBottomWardrobe, ...ownedCoverings], noGroups, {
  headCoveringPreference: 'events',
}).outfits.length, 1);
for (const context of ['work', 'casual', 'event', 'traditional'] as const) {
  const always = run([wrapperLook], context, wrapperWardrobe, noGroups, {
    headCoveringPreference: 'always',
  });
  assert.equal(always.outfits.length, coveringTypes.length, `always applies in ${context}`);
}

// "Always" applies to coverings in any context; "never" blocks even Traditional.
const jeansBlazerLook = outfit('jeans-blazer-look', [
  ...jeansLook.components, component('blazer', 'outerwear'),
]);
const alwaysCasualJeans = run([jeansBlazerLook], 'casual', [
  ...jeansWardrobe, item('blazer', 'outerwear'),
], noGroups, {
  headCoveringPreference: 'always',
});
assert.equal(alwaysCasualJeans.outfits.length, coveringTypes.length);
const neverTraditional = run([wrapperLook], 'traditional', wrapperWardrobe, noGroups, {
  headCoveringPreference: 'never',
});
assert.equal(neverTraditional.outfits.length, 1);
assert.equal(neverTraditional.outfits[0].components
  .some(part => coveringTypes.includes(part.subType as typeof coveringTypes[number])), false);
const unavailable = run([topBottom], 'work', topBottomWardrobe, noGroups, {
  headCoveringPreference: 'always',
});
assert.equal(unavailable.outfits.length, 1);
assert.equal(unavailable.decisions[0].headCoveringSatisfied, false);
assert.equal(unavailable.decisions[0].addedCoveringItemIds.length, 0);
assert.deepEqual(unavailable.gapNotes, [
  'Add a covering item to your wardrobe to complete this preference.',
]);

// Style headwear is never automatic and is not a substitute for a missing covering item.
const gele = item('gele', 'jewelry', 'gele');
const geleLook = outfit('gele-look', [...topBottom.components, component('gele', 'jewelry', 'gele')]);
const noCoveringWithGele = run([wrapperLook], 'traditional', [top, wrapper, shoes, gele]);
assert.equal(noCoveringWithGele.outfits[0].components.some(part => part.matchedItemId === 'gele'), false);
assert.equal(noCoveringWithGele.decisions[0].headCoveringSatisfied, false);
assert.deepEqual(noCoveringWithGele.gapNotes, [
  'Add a covering item to your wardrobe to complete this preference.',
]);
assert.equal(run([geleLook], 'work', [...topBottomWardrobe, gele], noGroups, {
  headCoveringPreference: 'always',
}).outfits[0].components.some(part => part.matchedItemId === 'gele'), false);
assert.equal(run([geleLook], 'work', [...topBottomWardrobe, gele], noGroups, {
  includeStyleHeadwear: true,
}).outfits[0].components.some(part => part.matchedItemId === 'gele'), true);

// Explicit style headwear remains excluded from Casual, blazer and jeans looks,
// even when the covering preference is "always".
for (const headwear of ownedStyleHeadwear) {
  const headwearLook = outfit(`look-${headwear.id}`, [
    ...topBottom.components, component(headwear.id, 'jewelry', headwear.subType),
  ]);
  const headwearWardrobe = [...topBottomWardrobe, headwear];
  for (const context of ['casual', 'work', 'event'] as const) {
    const excluded = context === 'casual';
    const candidate = excluded
      ? headwearLook
      : outfit(`look-${headwear.id}-blazer`, [
        ...headwearLook.components, component('blazer', 'outerwear'),
      ]);
    const wardrobe = excluded ? headwearWardrobe : [...headwearWardrobe, item('blazer', 'outerwear')];
    assert.equal(run([candidate], context, wardrobe, noGroups, {
      includeStyleHeadwear: true, headCoveringPreference: 'always',
    }).outfits[0].components.some(part => part.matchedItemId === headwear.id), false);
  }
  const jeansCandidate = outfit(`look-${headwear.id}-jeans`, [
    component('top', 'top'), component('jeans', 'bottom', 'jeans'),
    component('shoes', 'shoes'), component(headwear.id, 'jewelry', headwear.subType),
  ]);
  assert.equal(run([jeansCandidate], 'event', [
    ...topBottomWardrobe, item('jeans', 'bottom', 'jeans'), headwear,
  ], noGroups, {
    includeStyleHeadwear: true, headCoveringPreference: 'always',
  }).outfits[0].components.some(part => part.matchedItemId === headwear.id), false);
}

// Unknown roles remain unjudged and retain the original score.
const unknownComponent: OutfitComponent = {
  category: 'jewelry', subType: 'unclassified', colorFamily: 'navy', owned: true, matchedItemId: 'unknown',
};
const unknownLook = outfit('unknown-role', [...topBottom.components, unknownComponent]);
const unknownResult = run([unknownLook], 'work', [
  ...topBottomWardrobe, item('unknown', 'jewelry', 'unclassified'),
], noGroups, { rolesByItemId: { unknown: 'unknown' } });
assert.equal(unknownResult.outfits.length, 1);
assert.equal(unknownResult.decisions[0].status, 'unknown');
assert.equal(unknownResult.outfits[0].confidenceScore, 71);

// Side-by-side pools use the existing 13-item synthetic fixture.
const demo = buildDemoInput();
const date = '2026-10-27';
const raw = generateOutfitPool(demo.wardrobe, demo.profile, null, [], date, [], EMPTY_AFFINITY, null, false);
const traditional = buildStylingContextCandidates(
  projectWardrobeForStyling(demo.wardrobe, demo.relationships),
  'traditional', demo.profile, null, [], date, [], EMPTY_AFFINITY, null, false,
);
const pools: Array<[NigerianStylingContext, OutfitSet[]]> = [
  ['work', raw.work],
  ['event', raw.event],
  ['traditional', asTraditionalOutfits(traditional.pool[traditional.sourceScenario ?? 'wedding'])],
];
for (const [context, candidates] of pools) {
  const result = run(candidates, context, demo.wardrobe, demo.relationships);
  assert.ok(result.outfits.length > 0);
  if (context !== 'traditional') {
    assert.ok(result.outfits.every(value => !value.components.some(part => part.matchedItemId === 'gele')));
  }
  assert.ok(result.outfits.every(value =>
    result.decisions.find(decision => decision.outputOutfitId === value.id)?.status !== 'rejected',
  ));
}
assert.equal(run(raw.event, 'event', demo.wardrobe, demo.relationships).outfits.length, 14);
assert.equal(run(pools[2][1], 'traditional', demo.wardrobe, demo.relationships).outfits.length, 4);

console.log('Nigerian styling v1: context rules, head-covering constraints and synthetic pools passed.');
