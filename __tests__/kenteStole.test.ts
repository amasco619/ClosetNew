import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { processGeminiResult, normalizeGarmentSubType, normalizeGarmentPattern } from '../server/classify-garment';
import { validateMultiItemResult } from '../server/classify-multi-item';
import { constructMultiItemDraft } from '../lib/multiItemConstruction';
import type { MultiItemClassificationResult } from '../lib/multiItemConstruction';
import { mapDbRowToWardrobeItem } from '../lib/wardrobeMapper';
import { wardrobeCategoryLabel } from '../constants/wardrobeLabels';

const classify = (subType: string, extra: Record<string, unknown> = {}) =>
  processGeminiResult({
    category: 'jewelry', subType, colorFamily: 'blue',
    displayName: 'Stole', wearPosition: 'shoulder-neck',
    ...extra,
  } as Parameters<typeof processGeminiResult>[0]);

for (const label of ['stole', 'kente stole', 'kente-pattern stole', 'woven stole']) {
  const result = classify(label, { displayName: label === 'stole' ? 'Stole' : 'Kente-pattern stole',
    pattern: 'geometric', patternScale: 'large' });
  assert.ok(!('refused' in result), `${label} is accepted when identified as shoulder/neck wear`);
  if (!('refused' in result)) {
    assert.equal(result.category, 'jewelry');
    assert.equal(result.subType, 'stole');
    assert.equal(result.pattern, 'geometric');
    assert.equal(result.patternScale, 'large');
    assert.notEqual(result.fabric, 'cotton', 'no inferred cotton');
    assert.notEqual(result.fabric, 'silk', 'no inferred silk');
    assert.notEqual(result.pattern, 'wax-print', 'Kente is not Ankara');
  }
}

for (const label of ['Kente', 'kente cloth', 'scarf', 'sash', 'wrapper', 'gele', 'headwrap']) {
  assert.notEqual(normalizeGarmentSubType(label), 'stole', `${label} is not a stole alias`);
}
assert.notEqual(normalizeGarmentPattern('Kente'), 'wax-print');
const printedBlouse = processGeminiResult({
  category: 'top', subType: 'blouse', colorFamily: 'blue',
  displayName: 'Kente-pattern printed blouse', pattern: 'print',
});
assert.ok(!('refused' in printedBlouse));
if (!('refused' in printedBlouse)) {
  assert.deepEqual([printedBlouse.category, printedBlouse.subType, printedBlouse.pattern],
    ['top', 'blouse', 'print'], 'a Kente-pattern printed garment is not a stole or wax-print');
}

for (const [label, extra] of [
  ['loose Kente cloth', { wearPosition: undefined }],
  ['decorative textile', { wearPosition: 'decorative' }],
  ['waist sash', { wearPosition: 'waist' }],
  ['uncertain neck scarf', { wearPosition: undefined }],
] as const) {
  assert.equal('refused' in classify('kente stole', extra), true, `${label} cannot be saved as a stole`);
}
assert.equal('refused' in processGeminiResult({ refused: true, reason: 'Non-wearable textile' }), true);
for (const [category, subType] of [['bottom', 'wrapper'], ['jewelry', 'gele'], ['jewelry', 'headwrap'], ['jewelry', 'head-scarf']]) {
  const result = processGeminiResult({ category, subType, colorFamily: 'blue' });
  assert.ok(!('refused' in result));
  if (!('refused' in result)) assert.equal(result.subType, subType);
}

const multi = validateMultiItemResult({
  items: [
    { detectionId: 'a', region: { x: 0, y: 0, width: 0.4, height: 0.4 },
      classification: { category: 'jewelry', subType: 'kente stole', colorFamily: 'blue',
        displayName: 'Kente-pattern stole', wearPosition: 'shoulder-neck',
        fabric: 'linen', pattern: 'geometric', patternScale: 'large', modelConfidence: 0.9 } },
    { detectionId: 'b', region: { x: 0.5, y: 0, width: 0.4, height: 0.4 },
      classification: { category: 'top', subType: 'blouse', colorFamily: 'white',
        displayName: 'Blouse', modelConfidence: 0.9 } },
  ],
  relationship: { type: 'multi_item', confidence: 0.9, memberDetectionIds: ['a', 'b'] },
});
assert.ok(multi, 'worn stole is a valid independent member of a multi-item outfit');
assert.equal(validateMultiItemResult({
  items: [
    { detectionId: 'a', region: { x: 0, y: 0, width: 0.4, height: 0.4 },
      classification: { category: 'jewelry', subType: 'kente stole',
        colorFamily: 'blue', displayName: 'Kente cloth' } },
    { detectionId: 'b', region: { x: 0.5, y: 0, width: 0.4, height: 0.4 },
      classification: { category: 'top', subType: 'blouse',
        colorFamily: 'white', displayName: 'Blouse' } },
  ],
  relationship: { type: 'multi_item', confidence: 0.9, memberDetectionIds: ['a', 'b'] },
}), null, 'loose Kente textile cannot become a multi-item member');
const draft = constructMultiItemDraft(multi as unknown as MultiItemClassificationResult);
const stole = draft.items.find(item => item.wardrobeFields.subType === 'stole')!.wardrobeFields;
assert.equal(stole.category, 'jewelry');
assert.deepEqual([stole.fabric, stole.pattern, stole.patternScale], ['linen', 'geometric', 'large']);
const hydrated = mapDbRowToWardrobeItem({
  id: 'test-stole', garment_type: stole.category, sub_type: stole.subType, color_family: stole.colorFamily,
  image_url: 'owner/test-stole.jpg', fabric: stole.fabric, fit: stole.fit ?? null,
  pattern: stole.pattern, pattern_scale: stole.patternScale, occasion: stole.occasionTags,
});
assert.deepEqual([hydrated.category, hydrated.subType, hydrated.fabric, hydrated.pattern, hydrated.patternScale],
  ['jewelry', 'stole', 'linen', 'geometric', 'large'], 'existing save/reload mapping retains subtype and metadata');
assert.equal(hydrated.storagePath, 'owner/test-stole.jpg');
assert.equal(wardrobeCategoryLabel(hydrated.category, hydrated.subType), 'Textile accessory');
assert.equal(wardrobeCategoryLabel('jewelry', 'gele'), 'Jewelry');

const blueprint = readFileSync('constants/wardrobeBlueprint.ts', 'utf8');
const ui = readFileSync('app/add-item.tsx', 'utf8');
const review = readFileSync('app/multi-item-review.tsx', 'utf8');
const wardrobe = readFileSync('app/(tabs)/wardrobe.tsx', 'utf8');
assert.match(blueprint, /jewelry:\s*\[[\s\S]*?'stole'/);
assert.match(ui, /showsTextileFields = isCore \|\| \(category === 'jewelry' && subType === 'stole'\)/);
assert.match(review, /wardrobeCategoryLabel\(piece\.classification\.category, piece\.classification\.subType\)/);
assert.match(wardrobe, /Stole · textile accessory/);

console.log('Kente stole taxonomy, multi-item and save/reload regressions passed');