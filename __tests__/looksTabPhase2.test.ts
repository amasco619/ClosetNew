import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { OutfitComponent, OutfitSet } from '../constants/types';
import { addedLooksPromptCopy } from '../lib/addedLooksPromptCopy';
import {
  accessoryDisplayLabel,
  displayRationaleWithoutHeroColour,
  lookAccessoryOverflow,
  onePieceLayoutComponents,
  visibleLookAccessories,
} from '../lib/lookCardPresentation';

function component(
  category: OutfitComponent['category'],
  subType: string,
  id: string,
  colorFamily = 'black',
): OutfitComponent {
  return { category, subType, colorFamily, owned: true, matchedItemId: id, photoUri: `file://${id}.jpg` };
}

const shoe = component('shoes', 'ankle-boots', 'shoe');
const layer = component('outerwear', 'jacket', 'layer');
const dress = component('dress', 'gown', 'hero', 'beige');

function testOnePieceSlots() {
  const slots = onePieceLayoutComponents([shoe, layer, dress]);
  assert.equal(slots.dress, dress);
  assert.equal(slots.shoes, shoe);
  assert.equal(slots.layer, layer);
}

function testAccessoryLimitAndHeadwear() {
  const accessories = [
    component('bag', 'clutch', 'bag'),
    component('jewelry', 'earrings', 'earrings'),
    component('jewelry', 'gele', 'gele'),
    component('jewelry', 'headwrap', 'headwrap'),
    component('jewelry', 'necklace', 'necklace'),
    shoe,
  ];
  assert.deepEqual(
    visibleLookAccessories(accessories).map(item => item.subType),
    ['clutch', 'earrings', 'gele', 'headwrap'],
    'the card shows the first four bags, jewellery and headwear items',
  );
  assert.equal(lookAccessoryOverflow(accessories), 1, 'the overflow count includes every hidden accessory');
  assert.equal(accessoryDisplayLabel('gold-drop-earrings'), 'Drop Earrings',
    'accessory labels do not reintroduce colour names from legacy subtypes');
}

function testFreeTierRationaleHasNoHeroColour() {
  const outfit = {
    id: 'look',
    scenario: 'casual',
    heroId: 'hero',
    rationale: 'Built around your beige gown.',
    components: [dress, shoe, layer],
  } as OutfitSet;
  assert.equal(displayRationaleWithoutHeroColour(outfit), 'Built around your gown.');
  assert.equal(
    displayRationaleWithoutHeroColour({
      ...outfit,
      heroId: undefined,
      rationale: 'Built around your navy wide-leg trouser.',
      components: [],
    }),
    'Built around your wide-leg trouser.',
    'a colour in the hero coda is removed even if legacy data has no matching hero component',
  );
}

function testSingleAndBulkSheetCopy() {
  assert.deepEqual(addedLooksPromptCopy({ count: 1, itemName: 'Grey Joggers' }), {
    title: 'Grey Joggers added',
    message: 'Saved to your wardrobe. We have a few ways to wear it.',
    action: 'See looks with this piece',
    empty: 'No looks yet with this piece.',
  });
  assert.deepEqual(addedLooksPromptCopy({ count: 3 }), {
    title: '3 pieces added',
    message: 'Saved to your wardrobe. We have a few ways to wear them.',
    action: 'See your looks',
    empty: 'No looks yet with these pieces.',
  });
}

function testPromptAndFocusLifecycleWiring() {
  const context = readFileSync('contexts/AppContext.tsx', 'utf8');
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  const single = readFileSync('app/add-item.tsx', 'utf8');
  const bulk = readFileSync('app/bulk-review.tsx', 'utf8');
  const multi = readFileSync('app/multi-item-review.tsx', 'utf8');
  const outfits = readFileSync('app/(tabs)/outfits.tsx', 'utf8');
  const sheet = readFileSync('components/AddedLooksSheet.tsx', 'utf8');

  assert.match(layout, /<AddedLooksSheetHost\s*\/>/, 'the global sheet host covers all save routes');
  assert.match(sheet, /Modal[\s\S]*accessibilityViewIsModal/);
  assert.match(sheet, /activateLastAddedSuggestions\(addedLooksPrompt\.anchorItemId\)/);
  assert.match(single, /queueAddedLooksPrompt\(\{[\s\S]*?count: 1,[\s\S]*?anchorItemId: itemId/);
  assert.match(bulk, /queueAddedLooksPrompt\(\{[\s\S]*?count: savedItems\.length,[\s\S]*?anchorItemId: latest\.id/);
  assert.match(multi, /queueAddedLooksPrompt\(\{[\s\S]*?count: savedItems\.length,[\s\S]*?anchorItemId: latest\.id/);

  assert.match(outfits, /activeLastAddedAnchorId === lastAddedAnchorId/);
  assert.match(outfits, /onePieceSlots\.shoes/);
  assert.match(outfits, /onePieceSlots\.layer/);
  assert.match(outfits, /visibleLookAccessories\(outfit\.components\)/);
  assert.match(outfits, /lookAccessoryOverflow\(outfit\.components\)/);
  assert.match(outfits, /onPress=\{clearLastAddedSuggestions\}/, 'closing the chip restores the regular feed');
  assert.match(outfits, /router\.push\(\{ pathname: '\/item-detail', params: \{ id: itemId \} \}\)/);
  assert.match(context, /setActiveLastAddedAnchorId\(null\);[\s\S]*?setAddedLooksPrompt\(null\);/);
  assert.equal(
    (context.match(/setActiveLastAddedAnchorId\(prev => prev === id \? null : prev\)/g) ?? []).length,
    2,
    'deleting the anchor clears the focused chip for account and guest wardrobe paths',
  );
  assert.doesNotMatch(outfits, /JustAddedBanner|Styled for your/);
  assert.doesNotMatch(outfits, /generateOutfitsForItem|recommendationEngine|outfitScoring/,
    'the Looks screen only formats existing outfit data and does not import the recommendation engine');
}

testOnePieceSlots();
testAccessoryLimitAndHeadwear();
testFreeTierRationaleHasNoHeroColour();
testSingleAndBulkSheetCopy();
testPromptAndFocusLifecycleWiring();
console.log('Looks phase 2: one-piece support, accessory limit, free rationale, single/bulk sheet copy and transient focus lifecycle passed');
