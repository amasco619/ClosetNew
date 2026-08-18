/**
 * One-time AsyncStorage key migration: @auracloset_* → @amodka_*
 * (Phase 5A.1 — AuraCloset → Amodka rebrand)
 *
 * Isolated from lib/database.ts so tests can import this module without
 * pulling in react-native via the @react-native-async-storage/async-storage
 * static import.  AsyncStorage is loaded lazily (require inside function body)
 * so the module is importable in any Node/tsx environment.
 */

/** Minimal interface satisfied by both the real AsyncStorage and in-memory mocks. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

/**
 * Test-only injection point.
 * Set `asyncStorage` to a mock before calling migrateStorage() in tests.
 * Never set in production — the lazy require below loads the real module.
 */
export const _migrateStorageOverrides: { asyncStorage?: AsyncStorageLike } = {}

/** All old → new key pairs that must be migrated. */
const MIGRATION_MAP: Array<[string, string]> = [
  ['@auracloset_item_ids',               '@amodka_item_ids'],
  ['@auracloset_wear_log',               '@amodka_wear_log'],
  // Phase 5A.2 — AppContext storage keys renamed from @auracloset_ → @amodka_
  ['@auracloset_profile',                '@amodka_profile'],
  ['@auracloset_wardrobe',               '@amodka_wardrobe'],
  ['@auracloset_premium',                '@amodka_premium'],
  ['@auracloset_slots',                  '@amodka_slots'],
  ['@auracloset_rotation',               '@amodka_rotation'],
  ['@auracloset_wear_history',           '@amodka_wear_history'],
  ['@auracloset_reactions',              '@amodka_reactions'],
  ['@auracloset_mood',                   '@amodka_mood'],
  ['@auracloset_saved_looks',            '@amodka_saved_looks'],
]

/**
 * One-shot migration: for each renamed AsyncStorage key, if the old key has data
 * and the new key is absent, copy old → new and remove old.
 *
 * Safe to call multiple times — a no-op once migration is complete.
 * Called once at app startup from app/_layout.tsx.
 */
export async function migrateStorage(): Promise<void> {
  // Lazy require keeps react-native out of the static dep graph for tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store: AsyncStorageLike =
    _migrateStorageOverrides.asyncStorage ??
    (require('@react-native-async-storage/async-storage').default as AsyncStorageLike)

  for (const [oldKey, newKey] of MIGRATION_MAP) {
    try {
      const [oldRaw, newRaw] = await Promise.all([
        store.getItem(oldKey),
        store.getItem(newKey),
      ])
      if (oldRaw !== null && newRaw === null) {
        await store.setItem(newKey, oldRaw)
      }
      if (oldRaw !== null) {
        await store.removeItem(oldKey)
      }
    } catch {
      // Non-fatal — if migration fails, the app falls back to an empty local
      // cache while Supabase remains the source of truth for persisted data.
    }
  }
}
