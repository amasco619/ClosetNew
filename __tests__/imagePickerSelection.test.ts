import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectedSingleAsset } from '../lib/imagePickerSelection';

const photo = { uri: 'file:///selected-photo.jpg' };
assert.equal(selectedSingleAsset({ canceled: false, assets: [photo] }), photo,
  'a single library photo must reach the consent check and remain available for retry');
assert.equal(selectedSingleAsset({ canceled: false, assets: [photo, { uri: 'file:///two.jpg' }] }), undefined,
  'a multi-selection is handled by Bulk Review instead');
assert.equal(selectedSingleAsset({ canceled: true, assets: [photo] }), undefined);
assert.equal(selectedSingleAsset({ canceled: false, assets: [] }), undefined);

const addItemSource = readFileSync('app/add-item.tsx', 'utf8');
const bulkPickerBranch = addItemSource.slice(
  addItemSource.indexOf('if (!result.canceled && result.assets.length > 1)'),
  addItemSource.indexOf('asset = selectedSingleAsset(result)'),
);
assert.match(bulkPickerBranch, /stagePickedPhotos\(assetsToStage/);
assert.match(bulkPickerBranch, /router\.push\(\{[\s\S]*pathname: '\/bulk-review',\s*params: \{[\s\S]*selectionId/);
assert.doesNotMatch(bulkPickerBranch, /params:\s*\{\s*uris\s*:/,
  'bulk photo URIs must not be serialized into Expo Router params');
assert.match(bulkPickerBranch, /if \(staged\.photos\.length === 0\)[\s\S]*setBulkStageNotice/,
  'all-copy-fail keeps the user on Add Item with an inline explanation');
console.log('Image selection: single-photo path preserved, bulk/cancel excluded');