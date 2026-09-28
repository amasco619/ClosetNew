import fs from 'node:fs'
import path from 'node:path'

let failed = 0
function assert(condition: unknown, message: string): void {
  if (condition) console.log(`  ✓ ${message}`)
  else {
    console.error(`  ✗ ${message}`)
    failed++
  }
}

const migration = fs.readFileSync(
  path.resolve(__dirname, '../supabase/migrations/20260928000000_free_wardrobe_selection.sql'),
  'utf8',
)

console.log('\nFree wardrobe SQL contract')
for (const signature of [
  'public.insert_wardrobe_item(p_item jsonb)',
  'RETURNS uuid',
  'public.insert_wardrobe_items(p_items jsonb)',
  'RETURNS uuid[]',
  'public.set_free_wardrobe_selection(p_ids uuid[])',
]) {
  assert(migration.includes(signature), `${signature} RPC contract exists`)
}
assert(
  (migration.match(/SECURITY DEFINER/g) ?? []).length === 3 &&
    (migration.match(/auth\.uid\(\)/g) ?? []).length === 3,
  'all three security-definer RPCs use authenticated ownership',
)
assert(
  (migration.match(/pg_advisory_xact_lock\(hashtextextended\(v_user_id::text, 0\)\)/g) ?? []).length === 2,
  'insert and selection mutations share a per-user transaction lock',
)
assert(
  migration.includes("MESSAGE = 'WARDROBE_CAPACITY_REACHED'") &&
    migration.includes("ERRCODE = 'P0001'") &&
    migration.includes('v_total_count + v_item_count > 2000') &&
    migration.includes('v_selected_count + v_item_count > 30'),
  'Premium total and Free selected limits fail with the capacity contract',
)
assert(
  migration.includes('premium_expires_at > now()') &&
    migration.includes("coalesce(\n  profiles.premium IS TRUE"),
  'premium status is expiry-aware in both backfill and RPC enforcement',
)
assert(
  migration.includes('jsonb_to_record(entry.value)') &&
    migration.includes("'id', 'user_id', 'garment_type', 'sub_type', 'color_family'") &&
    migration.includes("'description', 'occasion', 'image_url', 'cleaned_image_url'") &&
    migration.includes('normalized.id, v_user_id'),
  'inserts whitelist database.ts item fields and always use auth.uid ownership',
)
assert(
  migration.includes('INSERT INTO public.wardrobe_free_selections (user_id, item_id)') &&
    migration.includes('SELECT v_user_id, unnest(v_ids)'),
  'Free inserts auto-select their new item rows in the same transaction',
)
assert(
  migration.includes('HAVING count(*) <= 30') &&
    migration.includes('LEFT JOIN public.user_profiles AS profiles') &&
    migration.includes('profiles.premium_expires_at > now()'),
  'only existing Free wardrobes of at most 30 items are backfilled',
)
assert(
  migration.includes('cardinality(p_ids) > 30') &&
    migration.includes('count(DISTINCT requested.id)') &&
    migration.includes('items.id = requested.id AND items.user_id = v_user_id'),
  'selection RPC rejects oversized, duplicate, and unowned IDs',
)
assert(
  migration.includes('FOREIGN KEY (user_id, item_id)') &&
    migration.includes('REFERENCES public.wardrobe_items(user_id, id)') &&
    migration.includes('REFERENCES public.user_profiles(id) ON DELETE CASCADE'),
  'selection rows cascade with their owner and owned wardrobe item',
)
assert(
  migration.includes('FOR SELECT TO authenticated') &&
    migration.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') &&
    migration.includes('REVOKE INSERT ON TABLE public.wardrobe_items FROM authenticated, anon, PUBLIC') &&
    migration.includes('REVOKE INSERT (%s) ON TABLE public.wardrobe_items FROM authenticated, anon, PUBLIC'),
  'selections are read-only to clients and direct wardrobe inserts are revoked',
)
assert(
  migration.includes("has_table_privilege('authenticated', 'public.wardrobe_items', 'INSERT')") &&
    migration.includes("has_column_privilege('authenticated', 'public.wardrobe_items', 'id', 'INSERT')") &&
    migration.includes("has_column_privilege('authenticated', 'public.wardrobe_items', 'user_id', 'INSERT')") &&
    migration.includes("has_column_privilege('authenticated', 'public.wardrobe_items', 'garment_type', 'INSERT')") &&
    migration.includes("has_table_privilege('authenticated', 'public.wardrobe_items', 'SELECT')") &&
    migration.includes("has_table_privilege('authenticated', 'public.wardrobe_items', 'UPDATE')") &&
    migration.includes("has_table_privilege('authenticated', 'public.wardrobe_items', 'DELETE')"),
  'migration verifies INSERT is absent while SELECT/UPDATE/DELETE table privileges remain',
)
assert(
  migration.includes("'public.wardrobe_items'::regclass") &&
    migration.includes('attribute.attnum > 0') &&
    migration.includes('NOT attribute.attisdropped') &&
    migration.includes("'REVOKE INSERT (%s)"),
  'column-level INSERT revokes cover every live wardrobe_items column',
)
assert(
  !migration.includes('v_total_count + v_item_count > 30') &&
    !/DELETE\s+FROM public\.wardrobe_items/i.test(migration),
  'Free selection capacity does not cap or delete retained wardrobe rows',
)
assert(
  migration.includes('(user_id, created_at DESC, id DESC)') &&
    (migration.match(/CREATE INDEX/g) ?? []).length === 1,
  'the only added secondary index is the requested wardrobe ordering index',
)
assert(
  migration.includes('GRANT EXECUTE ON FUNCTION public.insert_wardrobe_item(jsonb) TO authenticated') &&
    migration.includes('GRANT EXECUTE ON FUNCTION public.insert_wardrobe_items(jsonb) TO authenticated') &&
    migration.includes('GRANT EXECUTE ON FUNCTION public.set_free_wardrobe_selection(uuid[]) TO authenticated'),
  'authenticated callers receive only the intended RPC entry points',
)

console.log(`\n=== freeWardrobeSelectionSql: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`)
if (failed > 0) process.exit(1)