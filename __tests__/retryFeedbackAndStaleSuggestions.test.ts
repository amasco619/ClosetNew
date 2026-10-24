import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterLastAddedSuggestions } from '../lib/lastAddedSuggestions';
import type { OutfitSet } from '../constants/types';

const addItem = readFileSync('app/add-item.tsx', 'utf8');
const outfits = readFileSync('app/(tabs)/outfits.tsx', 'utf8');
const appContext = readFileSync('contexts/AppContext.tsx', 'utf8');

async function testRetryFeedback() {
  assert.match(addItem, /const \[retryingClassification, setRetryingClassification\] = useState\(false\)/);
  assert.match(addItem, /retryingClassificationRef\.current\) return/);
  assert.match(addItem, /disabled=\{retryingClassification\}/);
  assert.match(addItem, /retryingClassification \? 'Checking AI preference…'/);
  assert.match(addItem, /\(aiPreference !== 'allowed' \|\| !!aiPreferenceError\)/,
    'preference failures remain visible when cached state is allowed');

  const handler = addItem.match(/const retryClassification = async \(\) => \{([\s\S]*?)\n  \};/);
  assert(handler, 'retry handler is present in the screen');
  let resolvePick!: () => void;
  let calls = 0;
  const states: boolean[] = [];
  const retryingRef = { current: false };
  const runRetry = new Function(
    'retryPhotoRef', 'retryingClassificationRef', 'setRetryingClassification',
    'setAiPreferenceError', 'pickImage',
    `return async () => { ${handler[1]} };`,
  )(
    { current: { uri: 'local-photo' } },
    retryingRef,
    (value: boolean) => states.push(value),
    () => {},
    async (multiple: boolean, asset: { uri: string }) => {
      calls++;
      assert.equal(multiple, false);
      assert.equal(asset.uri, 'local-photo');
      return new Promise<void>(resolve => { resolvePick = resolve; });
    },
  ) as () => Promise<void>;

  const first = runRetry();
  assert.deepEqual(states, [true], 'retry feedback appears synchronously before photo processing');
  assert.equal(retryingRef.current, true);
  const second = runRetry();
  assert.equal(calls, 1, 'repeat taps while pending are ignored');
  resolvePick();
  await Promise.all([first, second]);
  assert.deepEqual(states, [true, false]);
  assert.equal(retryingRef.current, false);

  const preferenceGate = addItem.slice(
    addItem.indexOf('if (!preferenceChecked) {'),
    addItem.indexOf('setClassifying(true);'),
  );
  assert.match(preferenceGate, /await getAiProcessingPreference\(\)/);
  assert.match(preferenceGate, /setAiPreferenceError\('Your AI preference could not be checked\. This photo has not been sent\.'\);\s*setRetryingClassification\(false\);[\s\S]*?return;/);
  assert.doesNotMatch(preferenceGate, /classifyGarment|classifyImage/,
    'AI classification cannot run before the fresh preference lookup succeeds');
}

function testStaleSuggestions() {
  const anchor = 'new-item';
  const suggestions: OutfitSet[] = [{
    id: 'look-1',
    scenario: 'casual',
    heroId: anchor,
    components: [
      { category: 'top', subType: 't-shirt', colorFamily: 'beige', owned: true, matchedItemId: anchor },
      { category: 'bottom', subType: 'trousers', colorFamily: 'navy', owned: true, matchedItemId: 'bottom-1' },
    ],
  }, {
    id: 'look-2',
    scenario: 'work',
    heroId: anchor,
    components: [
      { category: 'top', subType: 't-shirt', colorFamily: 'beige', owned: true, matchedItemId: anchor },
      { category: 'shoes', subType: 'flats', colorFamily: 'black', owned: true, matchedItemId: 'missing-shoes' },
    ],
  }];

  assert.deepEqual(
    filterLastAddedSuggestions(suggestions, new Set([anchor, 'bottom-1'])).map(look => look.id),
    ['look-1'],
    'only complete suggestions whose owned items still exist remain visible',
  );
  assert.deepEqual(filterLastAddedSuggestions(suggestions, new Set(['bottom-1'])), [],
    'removing the anchor hides every suggestion');
  assert.match(outfits, /filterLastAddedSuggestions\(\s*lastAddedSuggestions,\s*new Set\(wardrobeItems\.map\(item => item\.id\)\)/);
  assert.match(outfits, /visibleLastAddedSuggestions\.length > 0/);
  assert.equal((appContext.match(/setLastAddedSuggestions\(prev => prev\.some\(suggestion => suggestion\.heroId === id\) \? \[\] : prev\)/g) ?? []).length, 2,
    'deleting an anchor clears the transient suggestions in both account and guest paths');
}

async function main() {
  await testRetryFeedback();
  testStaleSuggestions();
  console.log('Retry feedback, duplicate-tap guard, consent gate, stale suggestion filtering and anchor deletion passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
