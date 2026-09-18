import fs from 'node:fs'
import path from 'node:path'
import {
  mapDbRowToGarmentGroup,
  mapDbRowToGarmentGroupMember,
} from '../lib/garmentGroupMapper'
import { mapDbRowToWardrobeItem } from '../lib/wardrobeMapper'

let failed = 0
function assert(condition: unknown, message: string): void {
  if (condition) console.log(`  ✓ ${message}`)
  else {
    console.error(`  ✗ ${message}`)
    failed++
  }
}

const root = path.resolve(__dirname, '..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260918000000_garment_groups.sql'),
  'utf8',
)
const routes = fs.readFileSync(path.join(root, 'server/routes.ts'), 'utf8')
const database = fs.readFileSync(path.join(root, 'lib/database.ts'), 'utf8')

console.log('\nDomain mapping')
const member = mapDbRowToGarmentGroupMember({
  user_id: 'user-a',
  group_id: 'group-a',
  garment_id: 'garment-a',
  created_at: '2026-09-18T00:00:00Z',
})
const group = mapDbRowToGarmentGroup({
  id: 'group-a',
  user_id: 'user-a',
  relationship_type: 'coordinated_set',
  relationship_confidence: 0.8,
  confirmation_status: 'ai_inferred',
  shared_attributes: { fabric: 'ankara' },
  source_image_path: null,
  garment_group_members: [{
    user_id: 'user-a',
    group_id: 'group-a',
    garment_id: 'garment-a',
    created_at: '2026-09-18T00:00:00Z',
  }],
  created_at: '2026-09-18T00:00:00Z',
  updated_at: '2026-09-18T00:00:00Z',
})
assert(member.garmentId === 'garment-a', 'member fields map to camel case')
assert(group.relationshipType === 'coordinated_set', 'relationship type maps')
assert(group.relationshipConfidence === 0.8, 'confidence maps')
assert(group.sourceImagePath === undefined, 'nullable source path maps to undefined')
assert(group.members.length === 1, 'nested members map')

console.log('\nSchema and ownership contract')
for (const value of ['coordinated_set', 'multi_item', 'layered']) {
  assert(migration.includes(`'${value}'`), `approved relationship type ${value} exists`)
}
for (const value of ['ai_inferred', 'user_confirmed', 'user_rejected']) {
  assert(migration.includes(`'${value}'`), `approved status ${value} exists`)
}
assert(
  migration.includes('relationship_confidence BETWEEN 0 AND 1'),
  'confidence range is constrained',
)
assert(
  migration.includes("confirmation_status <> 'ai_inferred'") &&
    migration.includes('relationship_confidence IS NOT NULL'),
  'AI inference requires confidence',
)
assert(
  migration.includes("jsonb_typeof(shared_attributes) = 'object'"),
  'shared attributes must be an object',
)
assert(
  migration.includes("source_image_path !~* '^https?://'"),
  'source provenance rejects persisted URLs',
)
assert(
  migration.includes('PRIMARY KEY (group_id, garment_id)'),
  'duplicate group membership is prevented',
)
assert(
  migration.includes('FOREIGN KEY (user_id, group_id)') &&
    migration.includes('FOREIGN KEY (user_id, garment_id)'),
  'group and garment ownership use composite foreign keys',
)
assert(
  !/UNIQUE\s*\(\s*garment_id\s*\)/i.test(migration),
  'one garment may belong to multiple groups',
)

console.log('\nAtomic creation and RLS contract')
assert(
  migration.includes('SECURITY INVOKER') &&
    migration.includes('v_user_id uuid := auth.uid()'),
  'RPC derives ownership from auth.uid as invoker',
)
assert(
  migration.includes('cardinality(p_garment_ids) < 2'),
  'initial group requires at least two garments',
)
assert(
  migration.includes('count(DISTINCT garment_id)') &&
    migration.includes('duplicate garment ids are not allowed'),
  'duplicate initial garment ids fail',
)
assert(
  migration.includes('all garments must belong to the authenticated user'),
  'cross-owner initial membership fails',
)
assert(
  migration.indexOf('INSERT INTO public.garment_groups') <
    migration.indexOf('INSERT INTO public.garment_group_members'),
  'group and memberships are inserted by one transactional function',
)
assert(
  (migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 2,
  'RLS is enabled on both new tables',
)
assert(
  (migration.match(/auth\.uid\(\) = user_id/g) ?? []).length >= 8 &&
    (migration.match(/CREATE POLICY/g) ?? []).length === 8,
  'all eight table policies enforce authenticated ownership',
)
assert(
  !/TO public\s+FOR ALL/i.test(migration),
  'no broad public policy exists',
)
assert(
  (migration.match(/REVOKE ALL ON TABLE .* FROM anon/g) ?? []).length === 2,
  'anonymous table access is revoked',
)

console.log('\nLifecycle and account deletion contract')
assert(
  (migration.match(/ON DELETE CASCADE/g) ?? []).length === 3,
  'user, group, and garment deletions cascade only to relationship rows',
)
assert(
  migration.includes('garment_group_members_delete_empty_group') &&
    migration.includes('FOR UPDATE') &&
    migration.includes('NOT EXISTS'),
  'final membership cleanup locks its group before checking emptiness',
)
assert(
  !/REFERENCES public\.garment_group_members/i.test(migration),
  'no relationship cascade can delete wardrobe items',
)
const accountLists = routes.match(/const userIdTables = \[[\s\S]*?\];/g) ?? []
assert(accountLists.length === 2, 'both account-deletion table lists exist')
for (const [index, list] of accountLists.entries()) {
  assert(
    list.indexOf('"garment_group_members"') < list.indexOf('"garment_groups"'),
    `account deletion flow ${index + 1} processes members before groups`,
  )
}

console.log('\nWardrobe compatibility')
const wardrobe = mapDbRowToWardrobeItem({
  id: 'garment-a',
  image_url: 'user-a/garment-a.jpg',
  garment_type: 'top',
  sub_type: 'blouse',
  color_family: 'blue',
  occasion: [],
  created_at: '2026-09-18T00:00:00Z',
  relationship_type: 'coordinated_set',
})
assert(!('relationshipType' in wardrobe), 'group metadata is not mapped into WardrobeItem')
assert(wardrobe.id === 'garment-a', 'existing WardrobeItem mapping remains functional')
assert(!migration.includes('source_images'), 'no source-image table is created')
assert(
  database.includes("supabase.rpc('create_garment_group'") &&
    database.includes('}).single()') &&
    database.includes('if (!createdGroupId)'),
  'RPC consumes one returned composite row and rejects an empty response',
)

console.log(`\n=== garmentGroups: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`)
if (failed > 0) process.exit(1)