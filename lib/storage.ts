import { supabase } from './supabase'
import { decode } from 'base64-arraybuffer'
import { stripDataUriPrefix } from './uploadArg'

export { stripDataUriPrefix } from './uploadArg'

// ─── Signed URL cache ─────────────────────────────────────────────────────────
// In-memory cache for wardrobe-images signed URLs.
// Key: storage path (e.g. "userId/itemId.jpg")
// Value: {url, expiresAt (ms epoch)}
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()
const SIGNED_URL_TTL_SECONDS = 3600 // 1 hour; refresh buffer of 60 s applied at read time

/**
 * Generate a short-lived signed URL for a wardrobe-images storage path.
 * Results are cached for SIGNED_URL_TTL_SECONDS with a 60-second refresh buffer
 * so the cache never serves an already-expired token.
 *
 * Required once the wardrobe-images bucket is set to PRIVATE in the Supabase
 * dashboard (Track C). Works on public buckets too — the signed URL is simply
 * one of multiple valid access methods.
 */
export async function getSignedWardrobeUrl(storagePath: string): Promise<string> {
  const cached = signedUrlCache.get(storagePath)
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.url
  }
  const { data, error } = await supabase.storage
    .from('wardrobe-images')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    throw new Error(`[getSignedWardrobeUrl] ${error?.message ?? 'no signed URL returned'}`)
  }
  signedUrlCache.set(storagePath, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  })
  return data.signedUrl
}

/**
 * True when value is a storage path (e.g. "userId/itemId.jpg") rather than a
 * full URL.  Storage paths do not start with "http" or "file".
 */
export function isStoragePath(value: string): boolean {
  return Boolean(value) && !value.startsWith('http') && !value.startsWith('file')
}

/**
 * Resolve a wardrobe image value to a displayable URL:
 *   - Storage paths (new items) → signed URL (correct for private bucket)
 *   - https:// URLs (legacy items) → returned as-is while bucket is public;
 *     these will break when the Supabase operator sets the bucket to PRIVATE
 *     without first running a DB migration to convert stored URLs to paths.
 *   - file:// URIs (guest / upload-failed fallback) → returned as-is
 */
export async function resolveWardrobeImageUrl(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return ''
  if (!isStoragePath(pathOrUrl)) return pathOrUrl
  return getSignedWardrobeUrl(pathOrUrl)
}

/**
 * Upload a wardrobe image to Supabase Storage.
 *
 * Returns BOTH the short-lived signed URL (for immediate display) and the
 * durable storage path (for persistence in the DB).  Callers must store the
 * storagePath in the database and use it to regenerate signed URLs on future
 * app sessions.  Never store the signedUrl in the database — it expires.
 */
export async function uploadWardrobeImage(
  userId: string,
  imageBase64: string,
  itemId: string,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<{ signedUrl: string; storagePath: string }> {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const storagePath = `${userId}/${itemId}.${ext}`
  const { error } = await supabase.storage
    .from('wardrobe-images')
    .upload(storagePath, decode(stripDataUriPrefix(imageBase64)), {
      contentType: mimeType,
      upsert: true,
    })
  if (error) throw new Error(`[uploadWardrobeImage] ${error.message}`)
  const signedUrl = await getSignedWardrobeUrl(storagePath)
  return { signedUrl, storagePath }
}

/**
 * Generate a short-lived signed URL for a tryon-photos storage path.
 * Used when the tryon-photos bucket is set to PRIVATE.
 * Falls back to a 1h signed URL (same TTL as wardrobe-images).
 */
export async function getSignedTryonPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('tryon-photos')
    .createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) {
    throw new Error(`[getSignedTryonPhotoUrl] ${error?.message ?? 'no signed URL returned'}`)
  }
  return data.signedUrl
}

/**
 * Upload a try-on reference photo.
 *
 * Returns the storage PATH (e.g. "userId/reference.jpg") — not a public URL.
 * Callers should generate a signed URL via getSignedTryonPhotoUrl() when needed
 * for display.  The path is safe to persist in the DB; it remains valid after
 * the bucket is set to PRIVATE.
 *
 * NOTE (Phase 5B.1 audit): uploadTryonPhoto is currently UNUSED by any
 * application screen.  The tryon-photos bucket exists in the schema and the
 * account-deletion cleanup route handles it, but the Virtual Try-On feature
 * itself is deferred to a later phase.  This function is retained so the
 * cleanup and RLS migration remain consistent.
 */
export async function uploadTryonPhoto(
  userId: string,
  imageBase64: string
): Promise<string> {
  const storagePath = `${userId}/reference.jpg`
  const { error } = await supabase.storage
    .from('tryon-photos')
    .upload(storagePath, decode(stripDataUriPrefix(imageBase64)), {
      contentType: 'image/jpeg',
      upsert: true,
    })
  if (error) throw new Error(`[uploadTryonPhoto] ${error.message}`)
  // Return storage path, not a public URL.  Callers must use getSignedTryonPhotoUrl()
  // to generate a display URL once the bucket is set to PRIVATE.
  return storagePath
}

export async function deleteWardrobeImage(
  userId: string,
  itemId: string
): Promise<void> {
  const { error } = await supabase.storage
    .from('wardrobe-images')
    .remove([`${userId}/${itemId}.jpg`, `${userId}/${itemId}.png`])
  if (error) throw new Error(`[deleteWardrobeImage] ${error.message}`)
}

/**
 * Attempt to recover a wardrobe item's photo from Supabase Storage.
 * Checks for both .jpg and .png variants under the {userId}/{itemId} path.
 * Returns a signed URL for the first matching file found, or null if neither
 * variant exists in Storage.
 */
export async function recoverWardrobeImageUrl(
  userId: string,
  itemId: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('wardrobe-images')
    .list(userId, { search: itemId })
  if (error || !data || data.length === 0) return null
  const exts = ['jpg', 'png'] as const
  for (const ext of exts) {
    const match = data.find(f => f.name === `${itemId}.${ext}`)
    if (match) {
      const storagePath = `${userId}/${itemId}.${ext}`
      try {
        return await getSignedWardrobeUrl(storagePath)
      } catch {
        return null
      }
    }
  }
  return null
}
