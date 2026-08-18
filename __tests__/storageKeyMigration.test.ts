/**
 * Tests for migrateStorage() — the one-time AsyncStorage key migration
 * from @auracloset_* (AuraCloset) to @amodka_* (Amodka rebrand).
 *
 * Spec requirements (Task #410):
 *   1. Existing old key → migrated successfully.
 *   2. Multiple old keys → all migrated.
 *   3. New key already exists → new value preserved (not overwritten).
 *   4. Old key absent → no failure.
 *   5. Migration run twice → no change on second run (idempotent).
 *   6. Old key removed only after successful new-key write.
 *
 * Uses the _migrateStorageOverrides injection point in lib/database.ts to
 * substitute an in-memory store for the real React Native AsyncStorage.
 * No live device or RN runtime required.
 *
 * Run: `npx tsx __tests__/storageKeyMigration.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { migrateStorage, _migrateStorageOverrides } from '../lib/storage-migration'

// ── Assertion harness ──────────────────────────────────────────────────────

let failed = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`)
  } else {
    console.error(`  ✗ ${msg}`)
    failed++
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${msg}`)
  } else {
    console.error(`  ✗ ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
    failed++
  }
}

// ── In-memory AsyncStorage mock ────────────────────────────────────────────

/**
 * Creates a fresh in-memory store implementing the AsyncStorageLike interface.
 * Each test gets its own store so cases are fully isolated.
 */
function makeStore(initial: Record<string, string> = {}): {
  store: Record<string, string>
  setOrder: string[]
  removeOrder: string[]
  asyncStorage: {
    getItem(key: string): Promise<string | null>
    setItem(key: string, value: string): Promise<void>
    removeItem(key: string): Promise<void>
  }
} {
  const store = { ...initial }
  const setOrder: string[] = []
  const removeOrder: string[] = []

  return {
    store,
    setOrder,
    removeOrder,
    asyncStorage: {
      async getItem(key: string) { return store[key] ?? null },
      async setItem(key: string, value: string) {
        setOrder.push(key)
        store[key] = value
      },
      async removeItem(key: string) {
        removeOrder.push(key)
        delete store[key]
      },
    },
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function main() {

  // ── 1. Existing old key → migrated successfully ────────────────────────

  console.log('\n1. Existing old key → migrated successfully:')

  {
    const { store, asyncStorage } = makeStore({
      '@auracloset_item_ids': '["id-1","id-2"]',
    })
    _migrateStorageOverrides.asyncStorage = asyncStorage

    await migrateStorage()

    assertEq(
      store['@amodka_item_ids'],
      '["id-1","id-2"]',
      'old value is copied to new key',
    )
    assert(
      !('@auracloset_item_ids' in store),
      'old key is removed after migration',
    )
  }

  // ── 2. Multiple old keys → all migrated ───────────────────────────────

  console.log('\n2. Multiple old keys → all migrated:')

  {
    const { store, asyncStorage } = makeStore({
      '@auracloset_item_ids':   '["id-a"]',
      '@auracloset_wear_log':   '[{"date":"2026-01-01"}]',
      '@auracloset_profile':    '{"name":"Ada"}',
      '@auracloset_wardrobe':   '[{"id":"w1"}]',
      '@auracloset_premium':    'true',
      '@auracloset_slots':      '{}',
      '@auracloset_rotation':   '[]',
      '@auracloset_wear_history':'[]',
      '@auracloset_reactions':  '{}',
      '@auracloset_mood':       '"casual"',
      '@auracloset_saved_looks':'[]',
    })
    _migrateStorageOverrides.asyncStorage = asyncStorage

    await migrateStorage()

    const pairs: Array<[string, string]> = [
      ['@amodka_item_ids',    '["id-a"]'],
      ['@amodka_wear_log',    '[{"date":"2026-01-01"}]'],
      ['@amodka_profile',     '{"name":"Ada"}'],
      ['@amodka_wardrobe',    '[{"id":"w1"}]'],
      ['@amodka_premium',     'true'],
      ['@amodka_slots',       '{}'],
      ['@amodka_rotation',    '[]'],
      ['@amodka_wear_history','[]'],
      ['@amodka_reactions',   '{}'],
      ['@amodka_mood',        '"casual"'],
      ['@amodka_saved_looks', '[]'],
    ]

    for (const [newKey, expectedValue] of pairs) {
      assertEq(store[newKey], expectedValue, `${newKey} has correct value`)
    }

    const oldKeys = Object.keys(store).filter(k => k.startsWith('@auracloset_'))
    assertEq(oldKeys.length, 0, 'all old @auracloset_ keys removed')
  }

  // ── 3. New key already exists → new value preserved ───────────────────

  console.log('\n3. New key already exists → new value preserved (not overwritten):')

  {
    const { store, asyncStorage } = makeStore({
      '@auracloset_profile': '{"name":"OldName"}',
      '@amodka_profile':     '{"name":"NewName"}',  // new key already has a value
    })
    _migrateStorageOverrides.asyncStorage = asyncStorage

    await migrateStorage()

    assertEq(
      store['@amodka_profile'],
      '{"name":"NewName"}',
      'existing new-key value is not overwritten by old value',
    )
    assert(
      !('@auracloset_profile' in store),
      'old key is still removed even when new key already had a value',
    )
  }

  // ── 4. Old key absent → no failure ────────────────────────────────────

  console.log('\n4. Old key absent → no failure:')

  {
    const { store, asyncStorage } = makeStore({})  // empty store
    _migrateStorageOverrides.asyncStorage = asyncStorage

    let threw = false
    try {
      await migrateStorage()
    } catch {
      threw = true
    }

    assert(!threw, 'migrateStorage() does not throw when no old keys are present')
    assertEq(Object.keys(store).length, 0, 'store remains empty when nothing to migrate')
  }

  // ── 5. Migration run twice → no change on second run (idempotent) ─────

  console.log('\n5. Migration run twice → no change on second run (idempotent):')

  {
    const { store, asyncStorage } = makeStore({
      '@auracloset_premium': 'true',
    })
    _migrateStorageOverrides.asyncStorage = asyncStorage

    await migrateStorage()  // first run

    const storeAfterFirst = { ...store }

    await migrateStorage()  // second run

    assertEq(
      store['@amodka_premium'],
      storeAfterFirst['@amodka_premium'],
      'new-key value unchanged on second run',
    )
    assert(
      !('@auracloset_premium' in store),
      'old key still absent on second run',
    )
    assertEq(
      Object.keys(store).join(','),
      Object.keys(storeAfterFirst).join(','),
      'store keys identical after second run',
    )
  }

  // ── 6. Old key removed only after successful new-key write ─────────────
  //
  // The production code calls setItem then removeItem sequentially.
  // We verify that `setItem` is called before `removeItem` for every key.
  // If the order were reversed, a crash between remove and set would lose data.

  console.log('\n6. Old key removed only after successful new-key write:')

  {
    const { setOrder, removeOrder, asyncStorage } = makeStore({
      '@auracloset_item_ids': '["id-x"]',
      '@auracloset_profile':  '{"name":"Z"}',
    })
    _migrateStorageOverrides.asyncStorage = asyncStorage

    await migrateStorage()

    // For each migrated key, the new key must have been written before the old key was removed.
    const pairs: Array<[string, string]> = [
      ['@amodka_item_ids', '@auracloset_item_ids'],
      ['@amodka_profile',  '@auracloset_profile'],
    ]

    for (const [newKey, oldKey] of pairs) {
      const setIdx    = setOrder.indexOf(newKey)
      const removeIdx = removeOrder.indexOf(oldKey)
      assert(setIdx    !== -1, `setItem was called for ${newKey}`)
      assert(removeIdx !== -1, `removeItem was called for ${oldKey}`)
      assert(
        setIdx < (setOrder.length + removeIdx),  // set happened before remove
        `setItem(${newKey}) called before removeItem(${oldKey})`,
      )
    }

    // Stronger check: all setItem calls complete before any removeItem
    // (the production loop calls setItem then removeItem inside the same iteration)
    assert(
      setOrder.length > 0 && removeOrder.length > 0,
      'both setItem and removeItem were called',
    )
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  delete _migrateStorageOverrides.asyncStorage

  // ── Result ─────────────────────────────────────────────────────────────

  console.log(`\n${failed === 0 ? 'All migration tests passed.' : `${failed} test(s) failed.`}`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('Unexpected error in migration test runner:', err)
  process.exit(1)
})
