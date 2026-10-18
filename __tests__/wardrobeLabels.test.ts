import assert from 'node:assert/strict';
import { wardrobeCategoryLabel, wardrobeValueLabel } from '../constants/wardrobeLabels';

assert.equal(wardrobeValueLabel('gray'), 'Grey');
assert.equal(wardrobeValueLabel('grey'), 'Grey');
assert.equal(wardrobeValueLabel('Jewelry'), 'Jewellery');
assert.equal(wardrobeValueLabel('Jewelry & accessories'), 'Jewellery & accessories');
assert.equal(wardrobeValueLabel('sneakers'), 'sneakers');

assert.equal(wardrobeCategoryLabel('jewelry', 'gele'), 'Jewellery');
assert.equal(wardrobeCategoryLabel('jewelry', 'stole'), 'Textile accessory');

console.log('Wardrobe display labels preserve stored values and use UK spelling');
