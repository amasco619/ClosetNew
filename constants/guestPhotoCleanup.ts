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
 */

export type DeleteAsyncFn = (
  uri: string,
  options: { idempotent: boolean }
) => Promise<void>;

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
