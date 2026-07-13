import { supabase } from './supabase'
import { decode } from 'base64-arraybuffer'
import { stripDataUriPrefix } from './uploadArg'

export { stripDataUriPrefix } from './uploadArg'

export async function uploadWardrobeImage(
  userId: string,
  imageBase64: string,
  itemId: string,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<string> {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const fileName = `${userId}/${itemId}.${ext}`
  const { error } = await supabase.storage
    .from('wardrobe-images')
    .upload(fileName, decode(stripDataUriPrefix(imageBase64)), {
      contentType: mimeType,
      upsert: true,
    })
  if (error) throw new Error(`[uploadWardrobeImage] ${error.message}`)
  const { data } = supabase.storage
    .from('wardrobe-images')
    .getPublicUrl(fileName)
  return data.publicUrl
}

export async function uploadTryonPhoto(
  userId: string,
  imageBase64: string
): Promise<string> {
  const fileName = `${userId}/reference.jpg`
  const { error } = await supabase.storage
    .from('tryon-photos')
    .upload(fileName, decode(stripDataUriPrefix(imageBase64)), {
      contentType: 'image/jpeg',
      upsert: true,
    })
  if (error) throw new Error(`[uploadTryonPhoto] ${error.message}`)
  const { data } = supabase.storage
    .from('tryon-photos')
    .getPublicUrl(fileName)
  return data.publicUrl
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
 * Attempt to recover a wardrobe item's photo URL from Supabase Storage.
 * Checks for both .jpg and .png variants under the {userId}/{itemId} path.
 * Returns the public URL of the first matching file found, or null if neither
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
      const { data: urlData } = supabase.storage
        .from('wardrobe-images')
        .getPublicUrl(`${userId}/${itemId}.${ext}`)
      return urlData.publicUrl
    }
  }
  return null
}
