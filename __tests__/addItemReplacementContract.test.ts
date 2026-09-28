import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync('app/add-item.tsx', 'utf8');

assert.match(source, /const \{ addWardrobeItem, replaceWardrobeItem, isPremium, isGuest \} = useApp\(\);/);
assert.match(
  source,
  /if \(replaceItemId\) \{\s*await replaceWardrobeItem\(replaceItemId, wardrobeItem\);\s*\} else \{\s*await addWardrobeItem\(\{ id: itemId, \.\.\.wardrobeItem \}\);\s*\}/,
);
assert.doesNotMatch(source, /removeWardrobeItem/);

console.log('addItemReplacementContract: all assertions passed');