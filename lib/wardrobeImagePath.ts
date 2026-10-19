/**
 * Cleanup accepts only a single image object directly inside its owner's folder.
 * No URL decoding, nested folders or traversal is permitted.
 */
export function isOwnedWardrobeImagePath(userId: string, path: unknown): path is string {
  return /^[A-Za-z0-9_-]+$/.test(userId) &&
    typeof path === 'string' && path.startsWith(`${userId}/`) &&
    /^[A-Za-z0-9_-]+\.(?:jpg|png)$/.test(path.slice(userId.length + 1));
}

export function wardrobeImageCleanupPaths(
  userId: string,
  itemId: string,
  storagePath?: string,
): string[] {
  if (!/^[A-Za-z0-9_-]+$/.test(userId) || !/^[A-Za-z0-9_-]+$/.test(itemId)) {
    throw new Error('Invalid wardrobe photo owner or item id');
  }
  if (storagePath !== undefined) {
    // Legacy rows may still persist a public or signed Storage URL.
    const path = /^https?:\/\//.test(storagePath)
      ? storagePath.match(
        /^https?:\/\/[^/?#]+\/storage\/v1\/object\/(?:public|sign)\/wardrobe-images\/([^?#]+)(?:[?#].*)?$/,
      )?.[1]
      : storagePath;
    if (!isOwnedWardrobeImagePath(userId, path)) {
      throw new Error('Invalid owned wardrobe photo storage path');
    }
    return [path];
  }
  // Old retry entries predate persisted paths; preserve their ID-based cleanup.
  return [`${userId}/${itemId}.jpg`, `${userId}/${itemId}.png`];
}
