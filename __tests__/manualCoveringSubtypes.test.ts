import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { manualSubtypeOptions } from '../constants/manualSubtypeOptions';
import { VALID_SUBTYPES_BY_CATEGORY } from '../server/classify-garment';

const manualOnlyCoverings = ['gyale', 'kallabi', 'mayafi', 'hijab'];
const jewelryOptions = manualSubtypeOptions('jewelry', ['gele', 'headwrap', 'head-scarf']);

for (const subtype of manualOnlyCoverings) {
  assert.ok(jewelryOptions.includes(subtype), `${subtype} is available in the manual subtype picker`);
  assert.equal(
    VALID_SUBTYPES_BY_CATEGORY.jewelry.includes(subtype),
    false,
    `${subtype} is not added to classifier vocabulary`,
  );
}
assert.deepEqual(manualSubtypeOptions('top', ['buba']), ['buba']);
assert.ok(
  readFileSync('app/add-item.tsx', 'utf8').includes('manualSubtypeOptions(category, subTypes[category])'),
  'Add Item renders the manual-only options',
);
assert.ok(
  readFileSync('app/item-detail.tsx', 'utf8').includes('manualSubtypeOptions(item.category, subTypes[item.category])'),
  'Item Detail renders the manual-only options',
);

console.log('Manual covering subtype options remain separate from classifier vocabulary.');
