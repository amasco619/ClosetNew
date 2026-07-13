/**
 * rebaseGuestPhotoUri
 *
 * Rewrites an absolute `file://` path saved at install-time so it reflects
 * the current `documentDirectory` prefix. On Android, `documentDirectory`
 * can shift between app updates, which would silently break guest-mode
 * wardrobe thumbnails that were stored as absolute paths.
 *
 * Rules:
 *  - Non-file URIs (https://, data://, …) → returned unchanged.
 *  - file:// paths whose filename does NOT match the guest naming convention
 *    (`wardrobe_<uuid>.jpg|png`) → returned unchanged.
 *  - file:// paths that already have the correct prefix → returned unchanged.
 *  - file:// paths with an outdated prefix → rebased to currentDocDir + filename.
 */
export function rebaseGuestPhotoUri(uri: string, currentDocDir: string): string {
  if (!currentDocDir || !uri.startsWith('file://')) return uri;
  const filename = uri.split('/').pop() ?? '';
  if (!/^wardrobe_[^/]+\.(jpg|png)$/i.test(filename)) return uri;
  const expected = `${currentDocDir}${filename}`;
  return expected !== uri ? expected : uri;
}
