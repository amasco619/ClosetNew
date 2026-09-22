import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  B3ConstructionError,
  constructMultiItemDraft,
  type B3RelationshipType,
  type MultiItemClassificationResult,
} from '../lib/multiItemConstruction'

let passed = 0
function test(name: string, run: () => void): void {
  run()
  passed++
  console.log(`  ✓ ${name}`)
}

const classification = (subType: string, optional = false) => ({
  category: 'top' as const,
  subType,
  colorFamily: 'blue',
  description: `Blue ${subType}`,
  occasionTags: ['casual'] as Array<'casual'>,
  seasonTags: ['all-season'] as Array<'all-season'>,
  modelConfidence: 0.91,
  source: 'gemini' as const,
  ...(optional && {
    accentColor: 'white',
    pattern: 'wax-print' as const,
    patternScale: 'medium' as const,
    fabric: 'cotton' as const,
    weight: 'light' as const,
    fit: 'tailored' as const,
    neckline: 'v-neck' as const,
    sleeveLength: 'long' as const,
    rise: 'mid' as const,
    warmthBand: 'mild' as const,
    dominantHsl: { h: 220, s: 0.5, l: 0.4 },
    dominantLab: { L: 45, a: 8, b: -30 },
  }),
})

function envelope(
  count = 2,
  type: B3RelationshipType = 'coordinated_set',
): MultiItemClassificationResult {
  const items = Array.from({ length: count }, (_, index) => ({
    detectionId: `det-${String(index + 1).padStart(3, '0')}`,
    source: { region: { x: index / count, y: 0.1, width: 0.1, height: 0.3 } },
    classification: classification(index === 0 ? 'blouse' : 't-shirt', index === 0),
  }))
  return {
    schemaVersion: 'b1b2-v1',
    source: { ref: 'source-0' },
    items,
    validation: { count, max: 6, order: 'region-y-x-height-width-detection-id' },
    relationship: {
      type,
      confidence: 0.84,
      memberDetectionIds: items.map(item => item.detectionId),
      sharedAttributes: {
        colorFamily: 'blue',
        pattern: 'wax-print',
        fabric: 'cotton',
        occasion: 'casual',
      },
    },
  }
}

function expectError(
  input: MultiItemClassificationResult,
  code: B3ConstructionError['code'],
): void {
  assert.throws(
    () => constructMultiItemDraft(input),
    error => error instanceof B3ConstructionError && error.code === code,
  )
}

console.log('\nB3 pure multi-item construction:')

test('valid 2-item coordinated_set, multi_item, and layered results', () => {
  for (const type of ['coordinated_set', 'multi_item', 'layered'] as const) {
    const result = constructMultiItemDraft(envelope(2, type))
    assert.equal(result.group.relationshipType, type)
    assert.equal(result.items.length, 2)
  }
})

test('valid 3-item and maximum 6-item results preserve one output per item', () => {
  for (const count of [3, 6]) {
    const result = constructMultiItemDraft(envelope(count))
    assert.equal(result.items.length, count)
    assert.equal(result.group.memberDetectionIds.length, count)
  }
})

test('required wardrobe fields copy exactly and formality is deterministic', () => {
  const result = constructMultiItemDraft(envelope())
  const fields = result.items[0].wardrobeFields
  assert.deepEqual(fields.occasionTags, ['casual'])
  assert.deepEqual(fields.seasonTags, ['all-season'])
  assert.equal(fields.category, 'top')
  assert.equal(fields.subType, 'blouse')
  assert.equal(fields.colorFamily, 'blue')
  assert.equal(fields.description, 'Blue blouse')
  assert.equal(fields.modelConfidence, 0.91)
  assert.equal(fields.formalityLevel, 4)

  const unknown = envelope()
  unknown.items[0].classification.subType = 'future-subtype'
  assert.equal(constructMultiItemDraft(unknown).items[0].wardrobeFields.formalityLevel, 5)
})

test('optional wardrobe fields and perceptual values copy without mutable references', () => {
  const input = envelope()
  const result = constructMultiItemDraft(input)
  const fields = result.items[0].wardrobeFields
  assert.equal(fields.pattern, 'wax-print')
  assert.equal(fields.fabric, 'cotton')
  assert.equal(fields.weight, 'light')
  assert.equal(fields.fit, 'tailored')
  assert.equal(fields.neckline, 'v-neck')
  assert.equal(fields.sleeveLength, 'long')
  assert.equal(fields.rise, 'mid')
  assert.equal(fields.warmthBand, 'mild')
  assert.deepEqual(fields.dominantHsl, { h: 220, s: 0.5, l: 0.4 })
  assert.deepEqual(fields.dominantLab, { L: 45, a: 8, b: -30 })
  assert.notEqual(fields.dominantHsl, input.items[0].classification.dominantHsl)
  assert.notEqual(fields.dominantLab, input.items[0].classification.dominantLab)
})

test('absent optionals stay absent and forbidden wardrobe fields are never invented', () => {
  const fields = constructMultiItemDraft(envelope()).items[1].wardrobeFields
  for (const key of [
    'pattern', 'fabric', 'purchasePrice', 'metalTone', 'mood', 'id', 'photoUri',
    'storagePath', 'createdAt', 'sourceImagePath',
  ]) {
    assert.equal(key in fields, false, key)
  }
})

test('identity, canonical order, ordinals, regions, and membership are preserved', () => {
  const input = envelope(3)
  const result = constructMultiItemDraft(input)
  assert.deepEqual(result.items.map(item => item.detectionId), ['det-001', 'det-002', 'det-003'])
  assert.deepEqual(result.items.map(item => item.ordinal), [0, 1, 2])
  assert.deepEqual(result.group.memberDetectionIds, input.relationship!.memberDetectionIds)
  assert.deepEqual(result.items[1].source, { ref: 'source-0', region: input.items[1].source.region })
  assert.notEqual(result.items[1].source.region, input.items[1].source.region)
})

test('group metadata is separate, complete, canonical, and ai_inferred', () => {
  const input = envelope()
  const result = constructMultiItemDraft(input)
  assert.equal(result.group.relationshipConfidence, 0.84)
  assert.equal(result.group.confirmationStatus, 'ai_inferred')
  assert.deepEqual(result.group.sharedAttributes, input.relationship!.sharedAttributes)
  assert.notEqual(result.group.sharedAttributes, input.relationship!.sharedAttributes)
  assert.equal('members' in result.group, false)
  assert.equal('id' in result.group, false)
  assert.equal('sourceImagePath' in result.group, false)

  delete input.relationship!.sharedAttributes
  assert.deepEqual(constructMultiItemDraft(input).group.sharedAttributes, {})
})

test('repeated execution is deeply equal and input remains unchanged', () => {
  const input = envelope(3)
  const snapshot = structuredClone(input)
  const first = constructMultiItemDraft(input)
  const second = constructMultiItemDraft(input)
  assert.deepEqual(first, second)
  assert.deepEqual(input, snapshot)
})

test('result contains no IDs, time, URLs, paths, bytes, or provider-local data', () => {
  const serialized = JSON.stringify(constructMultiItemDraft(envelope()))
  for (const forbidden of [
    'provider-', 'http://', 'https://', 'signedUrl', 'photoUri', 'storagePath',
    'sourceImagePath', 'operationId', 'createdAt', 'updatedAt', 'imageBase64',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden)
  }
})

test('unsupported schema and order reject synchronously', () => {
  const schema = envelope()
  ;(schema as unknown as { schemaVersion: string }).schemaVersion = 'future'
  expectError(schema as MultiItemClassificationResult, 'unsupported_schema')

  const order = envelope()
  ;(order.validation as unknown as { order: string }).order = 'provider-order'
  expectError(order as MultiItemClassificationResult, 'invalid_order_contract')
})

test('zero, one, more than six, and count mismatch reject', () => {
  for (const count of [0, 1, 7]) expectError(envelope(count), 'invalid_item_count')
  const mismatch = envelope()
  mismatch.validation.count = 3
  expectError(mismatch, 'invalid_item_count')
})

test('duplicate IDs and missing required normalized fields reject', () => {
  const duplicate = envelope()
  duplicate.items[1].detectionId = duplicate.items[0].detectionId
  duplicate.relationship!.memberDetectionIds[1] = duplicate.items[0].detectionId
  expectError(duplicate, 'invalid_membership')

  for (const key of ['category', 'subType', 'colorFamily'] as const) {
    const invalid = envelope()
    delete (invalid.items[0].classification as unknown as Record<string, unknown>)[key]
    expectError(invalid, 'invalid_normalized_item')
  }
})

test('missing, duplicate, unknown, and incomplete membership reject without partial output', () => {
  const missingRelationship = envelope()
  delete missingRelationship.relationship
  expectError(missingRelationship, 'invalid_membership')

  for (const members of [
    ['det-001', 'det-001'],
    ['det-001', 'unknown'],
    ['det-001'],
  ]) {
    const invalid = envelope()
    invalid.relationship!.memberDetectionIds = members
    expectError(invalid, 'invalid_membership')
  }
})

test('module imports prove framework and I/O isolation by construction', () => {
  const source = fs.readFileSync('lib/multiItemConstruction.ts', 'utf8')
  for (const forbidden of [
    'react', 'supabase', 'AsyncStorage', 'FileSystem', 'Crypto.randomUUID',
    'Date.now', 'new Date', 'fetch(', 'axios', 'uploadWardrobeImage',
    'createGarmentGroup', 'addWardrobeItem', 'router', 'Haptics',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
})

console.log(`\nmultiItemConstruction: ${passed} focused checks passed`)