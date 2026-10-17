/**
 * Pure helpers for the guest-mode photo cleanup path in removeWardrobeItem.
 *
 * Extracted into their own module so they can be unit-tested without mounting
 * the React context. AppContext.tsx delegates to runGuestRemoval.
 *
 * Rules:
 *  - Only delete when no signed-in user is present (guest mode).
 *  - Only delete when the URI lives inside documentDirectory (local file).
 *  - https:// Supabase URIs must never trigger a local delete.
 *
 * `buildGuestPhotoDestPath` is the canonical path builder for guest uploads.
 * Using it in both add-item.tsx (write side) and tests (contract side) ensures
 * the two sides of the cleanup guard always agree on the path format.
 */

export type DeleteAsyncFn = (
  uri: string,
  options: { idempotent: boolean }
) => Promise<void>;

export interface PendingPhotoCleanup {
  ownerKey: string;
  itemId: string;
  guestPath?: string;
}

function isSafePathSegment(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
}

function isSafeGuestRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.split('/').every(segment =>
      segment !== '.' && segment !== '..' && /^[A-Za-z0-9._-]+$/.test(segment)
    );
}

export function parsePendingPhotoCleanups(raw: string | null): PendingPhotoCleanup[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: PendingPhotoCleanup[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<PendingPhotoCleanup>;
      if (!isSafePathSegment(candidate.ownerKey) || !isSafePathSegment(candidate.itemId)) continue;
      if (candidate.ownerKey === 'guest') {
        if (isSafeGuestRelativePath(candidate.guestPath)) {
          valid.push({
            ownerKey: candidate.ownerKey,
            itemId: candidate.itemId,
            guestPath: candidate.guestPath,
          });
        }
      } else if (candidate.guestPath === undefined) {
        valid.push({ ownerKey: candidate.ownerKey, itemId: candidate.itemId });
      }
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * Converts a document-directory URI into a safe relative path for persistence.
 * Each segment is constrained so a stored value cannot escape the directory.
 */
export function getGuestPhotoRelativePath(
  photoUri: string | undefined,
  documentDirectory: string | null | undefined,
): string | null {
  if (!photoUri || !documentDirectory) return null;
  const prefix = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  if (!photoUri.startsWith(prefix)) return null;
  const relativePath = photoUri.slice(prefix.length);
  return isSafeGuestRelativePath(relativePath) ? relativePath : null;
}

export async function retryPhotoCleanups(
  cleanups: ReadonlyArray<PendingPhotoCleanup>,
  ownerKey: string,
  documentDirectory: string | null | undefined,
  deleteAsync: DeleteAsyncFn,
  deleteStorage: (userId: string, itemId: string) => Promise<void>,
): Promise<PendingPhotoCleanup[]> {
  const remaining: PendingPhotoCleanup[] = [];
  for (const cleanup of cleanups) {
    if (cleanup.ownerKey !== ownerKey) {
      remaining.push(cleanup);
      continue;
    }
    try {
      if (ownerKey === 'guest') {
        if (!cleanup.guestPath || !isSafeGuestRelativePath(cleanup.guestPath) || !documentDirectory) {
          throw new Error('Guest photo cleanup path is unavailable');
        }
        const prefix = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
        await deleteGuestPhoto(`${prefix}${cleanup.guestPath}`, documentDirectory, deleteAsync);
      } else {
        if (!isSafePathSegment(ownerKey) || !isSafePathSegment(cleanup.itemId)) {
          throw new Error('Storage photo cleanup path is invalid');
        }
        await deleteStorage(ownerKey, cleanup.itemId);
      }
    } catch {
      remaining.push(cleanup);
    }
  }
  return remaining;
}

/**
 * Builds the destination path for a guest photo being copied into
 * documentDirectory during the add-item save flow.
 *
 * Keeping this function here — next to deleteGuestPhoto — makes both sides of
 * the cleanup contract live in one module and lets tests verify that the path
 * written by the upload path will always pass the startsWith(documentDirectory)
 * guard in deleteGuestPhoto.
 *
 * @param documentDirectory expo-file-system's FileSystem.documentDirectory.
 * @param itemId            The UUID for the new wardrobe item.
 * @param ext               File extension without the leading dot ('jpg' | 'png').
 */
export function buildGuestPhotoDestPath(
  documentDirectory: string,
  itemId: string,
  ext: 'jpg' | 'png'
): string {
  return `${documentDirectory}wardrobe_${itemId}.${ext}`;
}

/**
 * Deletes a locally-stored photo for a guest wardrobe item.
 *
 * This is the innermost guard: it checks whether the URI belongs to
 * documentDirectory before calling deleteAsync.
 *
 * @param photoUri          The item's photoUri (may be undefined).
 * @param documentDirectory expo-file-system's FileSystem.documentDirectory.
 * @param deleteAsync       The deletion function to call (injectable for testing).
 */
export async function deleteGuestPhoto(
  photoUri: string | undefined,
  documentDirectory: string | null | undefined,
  deleteAsync: DeleteAsyncFn
): Promise<void> {
  if (photoUri && getGuestPhotoRelativePath(photoUri, documentDirectory) !== null) {
    await deleteAsync(photoUri, { idempotent: true });
  }
}

/**
 * Mirrors the guest-mode branch of removeWardrobeItem in AppContext.tsx.
 *
 * Looks up the item by id in the provided wardrobe snapshot, then delegates
 * to deleteGuestPhoto. This is the function AppContext calls so that both the
 * item-lookup and the deleteAsync invocation are exercisable from tests without
 * mounting the React context.
 *
 * @param id                The wardrobe item id being removed.
 * @param wardrobeItems     A snapshot of the current wardrobe (plain array).
 * @param documentDirectory expo-file-system's FileSystem.documentDirectory.
 * @param deleteAsync       The deletion function to call (injectable for testing).
 */
export async function runGuestRemoval(
  id: string,
  wardrobeItems: ReadonlyArray<{ id: string; photoUri?: string }>,
  documentDirectory: string | null | undefined,
  deleteAsync: DeleteAsyncFn
): Promise<void> {
  const item = wardrobeItems.find(i => i.id === id);
  await deleteGuestPhoto(item?.photoUri, documentDirectory, deleteAsync);
}
