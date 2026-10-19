import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapDbRowToWardrobeItem } from '../lib/wardrobeMapper'

const migration = readFileSync(
  'supabase/migrations/20261001000000_wardrobe_group_batch_insert.sql',
  'utf8',
)
const database = readFileSync('lib/database.ts', 'utf8')
const context = readFileSync('contexts/AppContext.tsx', 'utf8')

assert.match(migration, /CREATE FUNCTION public\.insert_wardrobe_group_items\([\s\S]*?p_items jsonb,[\s\S]*?p_relationship_type text,[\s\S]*?p_relationship_confidence double precision,[\s\S]*?p_shared_attributes jsonb/)
assert.match(migration, /jsonb_array_length\(p_items\) NOT BETWEEN 2 AND 6/)
assert.match(migration, /p_relationship_type NOT IN \('coordinated_set', 'multi_item', 'layered'\)/)
assert.match(migration, /public\.insert_wardrobe_items\(p_items\)/)
assert.match(migration, /public\.create_garment_group\([\s\S]*?'user_confirmed'/)
assert.match(migration, /SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.insert_wardrobe_group_items[\s\S]*?FROM PUBLIC, anon/)
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.insert_wardrobe_group_items[\s\S]*?TO authenticated/)

assert.match(database, /supabase\.rpc\('insert_wardrobe_group_items',\s*\{[\s\S]*?p_items: items,[\s\S]*?p_relationship_type: relationship\.relationshipType/)
assert.match(database, /p_relationship_confidence: relationship\.relationshipConfidence \?\? null/)
assert.match(database, /p_shared_attributes: relationship\.sharedAttributes \?\? \{\}/)
assert.match(context, /addWardrobeGroupItems:\s*\([\s\S]*?relationshipType: GarmentRelationshipType/)
assert.match(context, /const addWardrobeGroupItems = useCallback/)
assert.match(context, /filter\(item => item\.storagePath\)[\s\S]*?hydrateWardrobePhoto\(item, resolveWardrobeImageUrl\)/)
const groupSaveStart = context.indexOf('const addWardrobeGroupItems =')
const groupSaveEnd = context.indexOf('const replaceWardrobeItem =', groupSaveStart)
const groupSave = context.slice(groupSaveStart, groupSaveEnd)
assert.match(groupSave, /await insertWardrobeGroupItems\(payloads, relationship\)[\s\S]*?commitAddedWardrobeItems\(prepared/)
assert.match(groupSave, /image_url: item\.storagePath \?\? item\.photoUri/)
assert.match(groupSave, /fabric: item\.fabric[\s\S]*fit: item\.fit[\s\S]*pattern: item\.pattern[\s\S]*pattern_scale: item\.patternScale/)

const legacy = mapDbRowToWardrobeItem({
  id: 'legacy',
  image_url: 'https://example.com/legacy.jpg',
  garment_type: 'top',
  sub_type: 'shirt',
  color_family: 'blue',
  fabric: null,
  fit: null,
  pattern: null,
  pattern_scale: null,
})
assert.deepEqual(
  [legacy.fabric, legacy.fit, legacy.pattern, legacy.patternScale],
  [undefined, undefined, undefined, undefined],
  'legacy null metadata hydrates neutrally',
)
assert.equal(legacy.storagePath, undefined)

const durable = mapDbRowToWardrobeItem({
  id: 'durable',
  image_url: 'user/item.jpg',
  cleaned_image_url: 'https://signed.example/item.jpg',
  garment_type: 'top',
  sub_type: 'shirt',
  color_family: 'blue',
})
assert.equal(durable.photoUri, 'https://signed.example/item.jpg')
assert.equal(durable.storagePath, 'user/item.jpg')

console.log('Wardrobe group batch and metadata hydration contracts passed')
