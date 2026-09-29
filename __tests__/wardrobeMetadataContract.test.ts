import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldShowFreeWardrobeChooser } from '../lib/freeWardrobeVisibility'
import { constructMultiItemDraft, type MultiItemClassificationResult } from '../lib/multiItemConstruction'

const wardrobe = readFileSync('app/(tabs)/wardrobe.tsx', 'utf8')
const context = readFileSync('contexts/AppContext.tsx', 'utf8')
const database = readFileSync('lib/database.ts', 'utf8')

assert.match(wardrobe, /shouldShowFreeWardrobeChooser\(isAuthenticated, isPremium, profile\.isGuest === true, wardrobeTotalCount, freeSelectedItemIds\.length\)/)
for (const [name, authenticated, premium, guest, total, selected, visible] of [
  ['partial Free selection below 30', true, false, false, 20, 12, true],
  ['empty Free selection', true, false, false, 20, 0, true],
  ['fully selected below 30', true, false, false, 20, 20, false],
  ['fully selected 30', true, false, false, 30, 30, false],
  ['more than 30 retained', true, false, false, 35, 30, true],
  ['Premium', true, true, false, 35, 0, false],
  ['guest', false, false, true, 8, 0, false],
  ['signed-out', false, false, false, 20, 0, false],
] as const) {
  assert.equal(shouldShowFreeWardrobeChooser(authenticated, premium, guest, total, selected), visible, name)
}

for (const field of ['fabric', 'fit', 'pattern'] as const) {
  assert.equal((context.match(new RegExp(`${field}: (newItem|item)\\.${field}`, 'g')) ?? []).length, 3,
    `single, bulk, and group payloads preserve ${field}`)
  assert.match(context, new RegExp(`${field}: replacement\\.${field} \\?\\? null`))
  assert.match(database, new RegExp(`${field}: replacement\\.${field} \\?\\? null`))
}
assert.match(context, /pattern_scale: newItem\.patternScale/)
assert.match(context, /pattern_scale: item\.patternScale/)
assert.match(context, /pattern_scale: replacement\.patternScale \?\? null/)
assert.match(database, /pattern_scale: replacement\.pattern_scale \?\? null/)

const classified: MultiItemClassificationResult = {
  schemaVersion: 'b1b2-v1',
  source: { ref: 'image' },
  items: [
    { detectionId: 'top', source: { region: { x: 0, y: 0, width: 0.4, height: 0.4 } },
      classification: { category: 'top', subType: 'blouse', colorFamily: 'blue',
        description: 'top', occasionTags: ['casual'], seasonTags: ['all-season'],
        modelConfidence: 0.9, source: 'gemini',
        fabric: 'lace', fit: 'tailored', pattern: 'floral', patternScale: 'large' } },
    { detectionId: 'bottom', source: { region: { x: 0.5, y: 0.5, width: 0.4, height: 0.4 } },
      classification: { category: 'bottom', subType: 'skirt', colorFamily: 'blue',
        description: 'bottom', occasionTags: ['casual'], seasonTags: ['all-season'],
        modelConfidence: 0.9, source: 'gemini',
        fabric: 'cotton', fit: 'loose', pattern: 'solid', patternScale: 'small' } },
  ],
  validation: { count: 2, max: 6, order: 'region-y-x-height-width-detection-id' },
  relationship: { type: 'coordinated_set', confidence: 0.9,
    memberDetectionIds: ['top', 'bottom'], sharedAttributes: { colorFamily: 'blue' } },
}
const draft = constructMultiItemDraft(classified)
assert.deepEqual(draft.items.map(({ wardrobeFields: item }) =>
  [item.fabric, item.fit, item.pattern, item.patternScale]), [
  ['lace', 'tailored', 'floral', 'large'],
  ['cotton', 'loose', 'solid', 'small'],
])
assert.deepEqual(draft.group.sharedAttributes, { colorFamily: 'blue' })

console.log('Wardrobe metadata payload and Free chooser regressions passed')