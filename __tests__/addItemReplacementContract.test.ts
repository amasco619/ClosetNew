import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync('app/add-item.tsx', 'utf8');

assert.match(source, /const \{[^}]*addWardrobeItem,[^}]*replaceWardrobeItem,[^}]*isPremium,[^}]*isGuest,[^}]*wardrobeItems,[^}]*\} = useApp\(\);/);
assert.match(source, /<SwipeToDismiss scrollTopRef=\{sheetScrollTopRef\} onDismiss=\{handleDismiss\}>/);
assert.match(source, /await cleanupStagedSelection\(\)/);
assert.match(
  source,
  /if \(replaceItemId\) \{\s*await replaceWardrobeItem\(replaceItemId, wardrobeItem\);\s*\} else \{\s*await addWardrobeItem\(\{ id: itemId, \.\.\.wardrobeItem \}\);\s*\}/,
);
assert.match(source, /removeWardrobeItem\(itemId, finalUri, expectedUserId\)/);

console.log('addItemReplacementContract: all assertions passed');