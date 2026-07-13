/**
 * Pure helper — no Supabase/React-Native imports so it can be exercised in
 * a plain Node/tsx test environment without side effects.
 *
 * Encapsulates the upload-argument selection logic from handleSaveAll()
 * (app/bulk-review.tsx) and handleSave() (app/add-item.tsx) so the branch
 * that decides what gets passed to uploadWardrobeImage can be unit-tested
 * without mocking the full Supabase client.
 */

export interface WardrobeUploadArg {
  base64: string;
  mimeType: 'image/png' | 'image/jpeg';
}

/**
 * Given the two candidate base64 strings from the bulk-save upload branch,
 * returns the upload argument that should be passed to uploadWardrobeImage,
 * or null if neither source produced a usable value (upload should be skipped).
 *
 * Priority:
 *   1. cleanBase64  — plain PNG base64 from background removal (no data: prefix)
 *   2. shrunkBase64 — JPEG base64 from ImageManipulator resize
 *
 * Invariants enforced here so callers cannot accidentally pass a data: URI:
 *   - A value that starts with "data:" is treated as absent (returns null for
 *     that candidate), preventing a corrupted Storage upload.
 *   - An empty string is treated as absent.
 */
export function resolveWardrobeUploadArg(
  cleanBase64: string | null | undefined,
  shrunkBase64: string | null | undefined,
): WardrobeUploadArg | null {
  const clean = cleanBase64 && !cleanBase64.startsWith('data:') ? cleanBase64 : null;
  if (clean) return { base64: clean, mimeType: 'image/png' };

  const shrunk = shrunkBase64 && !shrunkBase64.startsWith('data:') ? shrunkBase64 : null;
  if (shrunk) return { base64: shrunk, mimeType: 'image/jpeg' };

  return null;
}
