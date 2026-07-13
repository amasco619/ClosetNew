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
  if (photoUri && documentDirectory && photoUri.startsWith(documentDirectory)) {
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
