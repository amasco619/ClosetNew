/**
 * Pure helpers for the ghost-item recovery card.
 *
 * Keeping this logic out of AppContext (a React module) lets it run in plain
 * Node/tsx during tests without mocking React, FileSystem, or Supabase.
 *
 * Three surfaces:
 *   detectNoPhotoOrphans  — synchronous; items that never had a photo URI
 *   isGuestPhotoUri       — predicate for guest-mode `wardrobe_*.jpg` filenames
 *   detectFileOrphans     — async; file:// items whose file is gone & unrecoverable
 *   applyOrphanResolution — pure; drives the 'remove' vs 'dismiss' choice
 */

import { WardrobeItem } from './types';

export type FileInfoFn = (uri: string) => Promise<{ exists: boolean }>;
export type RecoverUrlFn = (userId: string, itemId: string) => Promise<string | null>;

/**
 * Returns wardrobe items that have no photoUri at all.
 * These indicate a save that was interrupted before the URI was ever written.
 */
export function detectNoPhotoOrphans(items: WardrobeItem[]): WardrobeItem[] {
  return items.filter(it => !it.photoUri);
}

/**
 * Returns true when the URI matches the guest photo naming convention
 * (`wardrobe_<something>.jpg|png`).
 * Guest photos are managed by the Android rebase path and must be skipped
 * by the file-existence check — they are never candidates for orphan status
 * via this path.
 */
export function isGuestPhotoUri(uri: string): boolean {
  const filename = uri.split('/').pop() ?? '';
  return /^wardrobe_[^/]+\.(jpg|png)$/i.test(filename);
}

export interface OrphanScanResult {
  orphans: WardrobeItem[];
  recovered: Record<string, string>;
}

/**
 * Checks which non-guest file:// items are orphans (local file missing and
 * not recoverable from cloud storage).
 *
 * Design decisions that tests must pin:
 * - If `getInfo` throws, the item is NOT surfaced as an orphan (we cannot
 *   distinguish a transient error from a permanent loss; silence is safer).
 * - If the file is missing and `userId` is null (guest), the item IS surfaced
 *   because there is no cloud fallback.
 * - If the file is missing and `recover` returns a URL, the item is NOT
 *   surfaced; instead its new URL is returned in `recovered`.
 *
 * @param items   Items with a non-guest `file://` photoUri
 * @param getInfo Resolves to `{ exists: boolean }` for a local URI
 * @param recover Returns the remote URL for an item, or null if absent
 * @param userId  Authenticated user id; null for guests
 */
export async function detectFileOrphans(
  items: WardrobeItem[],
  getInfo: FileInfoFn,
  recover: RecoverUrlFn,
  userId: string | null,
): Promise<OrphanScanResult> {
  const recovered: Record<string, string> = {};
  const orphans: WardrobeItem[] = [];

  for (const item of items) {
    try {
      const info = await getInfo(item.photoUri);
      if (!info.exists) {
        if (userId) {
          const remoteUrl = await recover(userId, item.id).catch(() => null);
          if (remoteUrl) {
            recovered[item.id] = remoteUrl;
          } else {
            orphans.push(item);
          }
        } else {
          orphans.push(item);
        }
      }
    } catch {
      // getInfo threw — we cannot determine whether the file is truly gone, so
      // do NOT surface the item as an orphan. A transient I/O error should not
      // destroy the user's wardrobe entry.
    }
  }

  return { orphans, recovered };
}

/**
 * Executes the ghost-item recovery action chosen by the user.
 *
 * 'remove'  → calls `removeItem(id)` so the DB row and local state are deleted.
 * 'dismiss' → only clears the UI card; the item is left in the wardrobe intact.
 *
 * Deliberately stateless: the caller (`AppContext`) is responsible for
 * removing the item from `orphanedItems` state in both cases.
 */
export function applyOrphanResolution(
  id: string,
  action: 'remove' | 'dismiss',
  removeItem: (id: string) => void,
): void {
  if (action === 'remove') {
    removeItem(id);
  }
}
