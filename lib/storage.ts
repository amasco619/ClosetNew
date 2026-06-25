import { supabase } from './supabase'
import { decode } from 'base64-arraybuffer'

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
    .upload(fileName, decode(imageBase64), {
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
    .upload(fileName, decode(imageBase64), {
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
