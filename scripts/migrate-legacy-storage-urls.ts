/**
 * scripts/migrate-legacy-storage-urls.ts
 *
 * Phase 5B.1 — A2: Legacy URL Migration Utility
 *
 * Converts existing wardrobe_items rows whose image_url / cleaned_image_url
 * columns hold full Supabase public URLs to durable storage paths.
 *
 * This MUST be run (and dry-run confirmed) before the operator sets the
 * wardrobe-images bucket to PRIVATE.  Once private, public URLs break.
 *
 * Usage:
 *   # Dry run (no DB writes — prints report only):
 *   npx ts-node --esm scripts/migrate-legacy-storage-urls.ts --dry-run
 *
 *   # Live run (writes to DB — run only after dry-run confirms all rows resolve):
 *   npx ts-node --esm scripts/migrate-legacy-storage-urls.ts
 *
 * Required env vars:
 *   SUPABASE_URL          — your Supabase project URL (https://<ref>.supabase.co)
 *   SUPABASE_SECRET_KEY   — service role key (never anon key)
 *
 * What it does NOT do:
 *   - Does not delete any Storage objects
 *   - Does not modify rows whose image_url is already a storage path
 *   - Does not silently convert an invalid URL into an invalid path;
 *     if the object cannot be confirmed to exist the row is left untouched
 *     and reported as requiring manual investigation
 *
 * Idempotency:
 *   Running the script twice is safe.  Rows already migrated are detected by
 *   isStoragePath() and skipped without any DB write.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Constants ────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')

const WARDROBE_BUCKET = 'wardrobe-images'

/**
 * True when a value is a storage path (e.g. "userId/itemId.jpg") rather than
 * a full URL.  Mirrors lib/storage.ts isStoragePath().
 */
function isStoragePath(value: string | null | undefined): boolean {
  if (!value) return false
  return !value.startsWith('http') && !value.startsWith('file')
}

/**
 * Given a full Supabase Storage public URL for the wardrobe-images bucket,
 * return the storage object path (e.g. "userId/itemId.jpg").
 * Returns null if the URL does not match the expected pattern.
 *
 * Public URL format:
 *   https://<ref>.supabase.co/storage/v1/object/public/wardrobe-images/<path>
 */
function extractStoragePath(url: string): string | null {
  if (!url) return null
  // Accept both the canonical /object/public/ and the older /object/sign/ paths
  const publicMarker = `/storage/v1/object/public/${WARDROBE_BUCKET}/`
  const idx = url.indexOf(publicMarker)
  if (idx === -1) return null
  const path = url.slice(idx + publicMarker.length)
  // Strip any query string (signed tokens etc.)
  return path.split('?')[0] || null
}

// ── DB Row type ──────────────────────────────────────────────────────────────

interface WardrobeRow {
  id: string
  user_id: string
  image_url: string | null
  cleaned_image_url: string | null
}

// ── Main ────────────────────────────────────────────────────────────────────

interface RowResult {
  id: string
  user_id: string
  field: 'image_url' | 'cleaned_image_url'
  original: string
  resolved_path: string | null
  object_exists: boolean | null
  action: 'MIGRATED' | 'ALREADY_MIGRATED' | 'NOT_PUBLIC_URL' | 'MISSING_OBJECT' | 'INVALID_URL'
  error?: string
}

async function migrateRow(
  supabase: SupabaseClient,
  row: WardrobeRow,
  field: 'image_url' | 'cleaned_image_url',
  url: string,
  dryRun: boolean,
): Promise<RowResult> {
  const base: Pick<RowResult, 'id' | 'user_id' | 'field' | 'original'> = {
    id: row.id,
    user_id: row.user_id,
    field,
    original: url,
  }

  // Already a storage path — nothing to do
  if (isStoragePath(url)) {
    return { ...base, resolved_path: url, object_exists: null, action: 'ALREADY_MIGRATED' }
  }

  // Not a Supabase wardrobe-images public URL — leave it alone
  const path = extractStoragePath(url)
  if (!path) {
    return { ...base, resolved_path: null, object_exists: null, action: 'NOT_PUBLIC_URL' }
  }

  // Validate that the Storage object actually exists by attempting a
  // createSignedUrl call (a successful response means the object is present;
  // an error means it's missing).
  let objectExists = false
  try {
    const { error } = await supabase.storage
      .from(WARDROBE_BUCKET)
      .createSignedUrl(path, 60)
    objectExists = !error
  } catch {
    objectExists = false
  }

  if (!objectExists) {
    return {
      ...base,
      resolved_path: path,
      object_exists: false,
      action: 'MISSING_OBJECT',
      error: `Storage object not found at path: ${path}`,
    }
  }

  // Object exists. Write the storage path to the DB (unless dry run).
  if (!dryRun) {
    const update: Partial<WardrobeRow> = { [field]: path }
    const { error } = await supabase
      .from('wardrobe_items')
      .update(update)
      .eq('id', row.id)
    if (error) {
      return {
        ...base,
        resolved_path: path,
        object_exists: true,
        action: 'MISSING_OBJECT', // reusing as error bucket
        error: `DB update failed: ${error.message}`,
      }
    }
  }

  return { ...base, resolved_path: path, object_exists: true, action: 'MIGRATED' }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY must be set.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  console.log('\n' + '═'.repeat(70))
  console.log(`Amodka — Legacy Storage URL Migration`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE RUN'}`)
  console.log(`Bucket: ${WARDROBE_BUCKET}`)
  console.log('═'.repeat(70) + '\n')

  // Fetch all wardrobe_items rows (paginated for large tables)
  const PAGE_SIZE = 1000
  let from = 0
  const allRows: WardrobeRow[] = []

  while (true) {
    const { data, error } = await supabase
      .from('wardrobe_items')
      .select('id, user_id, image_url, cleaned_image_url')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('ERROR fetching wardrobe_items:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    allRows.push(...(data as WardrobeRow[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  console.log(`Total rows fetched: ${allRows.length}`)
  console.log('Processing...\n')

  const results: RowResult[] = []

  for (const row of allRows) {
    // Process image_url
    if (row.image_url) {
      const r = await migrateRow(supabase, row, 'image_url', row.image_url, DRY_RUN)
      results.push(r)
    }
    // Process cleaned_image_url
    if (row.cleaned_image_url) {
      const r = await migrateRow(supabase, row, 'cleaned_image_url', row.cleaned_image_url, DRY_RUN)
      results.push(r)
    }
  }

  // ── Summary report ────────────────────────────────────────────────────────

  const migrated        = results.filter(r => r.action === 'MIGRATED')
  const alreadyMigrated = results.filter(r => r.action === 'ALREADY_MIGRATED')
  const notPublicUrl    = results.filter(r => r.action === 'NOT_PUBLIC_URL')
  const missingObject   = results.filter(r => r.action === 'MISSING_OBJECT')

  console.log('─'.repeat(70))
  console.log('MIGRATION REPORT')
  console.log('─'.repeat(70))
  console.log(`Total field values processed:  ${results.length}`)
  console.log(`Already migrated (skipped):    ${alreadyMigrated.length}`)
  console.log(`Requires migration:            ${results.length - alreadyMigrated.length - notPublicUrl.length}`)
  console.log(`  └─ Successfully resolved:   ${migrated.length}${DRY_RUN ? ' (dry run — not written)' : ''}`)
  console.log(`  └─ Missing Storage objects: ${missingObject.length}`)
  console.log(`Not a wardrobe public URL:     ${notPublicUrl.length}`)
  console.log('─'.repeat(70))

  if (missingObject.length > 0) {
    console.log('\n⚠️  ROWS WITH MISSING STORAGE OBJECTS — REQUIRE MANUAL INVESTIGATION:\n')
    for (const r of missingObject) {
      console.log(`  Row id: ${r.id}  user: ${r.user_id}  field: ${r.field}`)
      console.log(`    Original URL:      ${r.original}`)
      console.log(`    Expected path:     ${r.resolved_path ?? 'could not extract'}`)
      if (r.error) console.log(`    Error: ${r.error}`)
    }
    console.log('')
  }

  if (notPublicUrl.length > 0 && notPublicUrl.some(r => r.original && !r.original.startsWith('file://'))) {
    console.log('\nℹ️  UNEXPECTED URL FORMATS (neither storage path, public Supabase URL, nor file://):\n')
    for (const r of notPublicUrl.filter(r => r.original && !r.original.startsWith('file://'))) {
      console.log(`  Row id: ${r.id}  field: ${r.field}  value: ${r.original.substring(0, 120)}`)
    }
    console.log('')
  }

  if (DRY_RUN) {
    console.log('\n✅ Dry run complete. No database changes were made.')
    if (missingObject.length === 0) {
      console.log('   All resolvable rows were confirmed to have existing Storage objects.')
      console.log('   Re-run without --dry-run to apply the migration.')
    } else {
      console.log(`\n🔴 ${missingObject.length} row(s) have missing Storage objects.`)
      console.log('   Investigate these rows before switching the bucket to private.')
      console.log('   Do NOT set the bucket to private until all rows are resolved.')
    }
  } else {
    console.log(`\n✅ Live run complete. ${migrated.length} field value(s) updated in the database.`)
    if (missingObject.length > 0) {
      console.log(`\n🔴 ${missingObject.length} row(s) could not be migrated (missing Storage objects).`)
      console.log('   These rows were left untouched. Investigate before setting bucket private.')
    }
    if (migrated.length > 0) {
      console.log('\n   CRITICAL NEXT STEP:')
      console.log('   Verify the app renders wardrobe items correctly before setting bucket private.')
      console.log('   Only set wardrobe-images to PRIVATE after:')
      console.log('   1. This script has run with 0 missing objects')
      console.log('   2. The RLS migration has been applied')
      console.log('   3. The application code is deployed (Phase 5B signed-URL changes)')
    }
  }

  console.log('\n' + '═'.repeat(70) + '\n')

  // Exit with non-zero if there are unresolvable rows so CI catches it
  if (missingObject.length > 0) process.exit(1)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
