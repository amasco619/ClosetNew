/** Only a confirmed missing object is recoverable through re-photographing. */
export class MissingWardrobePhotoError extends Error {}

/**
 * Keep the garment and its durable path, but never pass a missing Storage path
 * to the image renderer. Network/auth failures must still reach the caller.
 */
export async function hydrateWardrobePhoto(
  item: { photoUri: string; storagePath?: string },
  resolve: (path: string) => Promise<string>,
): Promise<boolean> {
  if (!item.storagePath) return false;
  try {
    item.photoUri = await resolve(item.storagePath);
    return false;
  } catch (error) {
    if (!(error instanceof MissingWardrobePhotoError)) throw error;
    item.photoUri = '';
    return true;
  }
}
