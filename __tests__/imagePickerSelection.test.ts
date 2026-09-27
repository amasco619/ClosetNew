import assert from 'node:assert/strict';
import { selectedSingleAsset } from '../lib/imagePickerSelection';

const photo = { uri: 'file:///selected-photo.jpg' };
assert.equal(selectedSingleAsset({ canceled: false, assets: [photo] }), photo,
  'a single library photo must reach the consent check and remain available for retry');
assert.equal(selectedSingleAsset({ canceled: false, assets: [photo, { uri: 'file:///two.jpg' }] }), undefined,
  'a multi-selection is handled by Bulk Review instead');
assert.equal(selectedSingleAsset({ canceled: true, assets: [photo] }), undefined);
assert.equal(selectedSingleAsset({ canceled: false, assets: [] }), undefined);
console.log('Image selection: single-photo path preserved, bulk/cancel excluded');