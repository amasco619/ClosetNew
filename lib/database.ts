import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

// ══ USER PROFILE ════════════════════════════════════════════════════════════

export async function upsertUserProfile(profile: {
  id: string
  name?: string
  body_type?: string
  eye_color?: string
  skin_tone?: string
  undertone?: string
  style_goals?: string[]
  secondary_goal?: string
  lifestyle?: Record<string, any>
  constraints?: Record<string, any>
  location_lat?: number
  location_lon?: number
  premium?: boolean
  onboarding_complete?: boolean
  is_guest?: boolean
}): Promise<void> {
  const { error } = await supabase
    .from('user_profiles')
    .upsert(profile, { onConflict: 'id' })
  if (error) throw new Error(`[upsertUserProfile] ${error.message}`)
}

export async function getUserProfile(userId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error && error.code !== 'PGRST116') {
    throw new Error(`[getUserProfile] ${error.message}`)
  }
  return data ?? null
}

// ══ WARDROBE ITEMS ═══════════════════════════════════════════════════════════

export async function insertWardrobeItem(item: {
  id?: string
  user_id: string
  garment_type: string
  sub_type?: string
  color_family?: string
  description?: string
  occasion?: string[]
  image_url?: string
  cleaned_image_url?: string
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .insert(item)
    .select('id')
    .single()
  if (error) throw new Error(`[insertWardrobeItem] ${error.message}`)
  const raw = await AsyncStorage.getItem('@auracloset_item_ids')
  const ids: string[] = raw ? JSON.parse(raw) : []
  ids.push(data.id)
  await AsyncStorage.setItem('@auracloset_item_ids', JSON.stringify(ids))
  return { id: data.id }
}

export async function getWardrobeItems(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`[getWardrobeItems] ${error.message}`)
  return data ?? []
}

export async function deleteWardrobeItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('wardrobe_items')
    .delete()
    .eq('id', itemId)
  if (error) throw new Error(`[deleteWardrobeItem] ${error.message}`)
}

export async function updateWardrobeItemAffinity(
  itemId: string,
  affinity: number
): Promise<void> {
  const clamped = Math.min(1.3, Math.max(0.7, affinity))
  const { error } = await supabase
    .from('wardrobe_items')
    .update({ item_affinity: clamped, updated_at: new Date().toISOString() })
    .eq('id', itemId)
  if (error) throw new Error(`[updateWardrobeItemAffinity] ${error.message}`)
}

// ══ SLOT STATUSES ════════════════════════════════════════════════════════════

export async function upsertSlotStatus(slot: {
  user_id: string
  slot_id: string
  status: 'needed' | 'owned'
  matched_item_id?: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('slot_statuses')
    .upsert(slot, { onConflict: 'user_id,slot_id' })
  if (error) throw new Error(`[upsertSlotStatus] ${error.message}`)
}

export async function getSlotStatuses(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('slot_statuses')
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(`[getSlotStatuses] ${error.message}`)
  return data ?? []
}

export async function bulkUpsertSlotStatuses(
  slots: Array<{
    user_id: string
    slot_id: string
    status: 'needed' | 'owned'
    matched_item_id?: string | null
  }>
): Promise<void> {
  if (slots.length === 0) return
  const { error } = await supabase
    .from('slot_statuses')
    .upsert(slots, { onConflict: 'user_id,slot_id' })
  if (error) throw new Error(`[bulkUpsertSlotStatuses] ${error.message}`)
}

// ══ WEAR LOGS ════════════════════════════════════════════════════════════════

export async function insertWearLog(entry: {
  user_id: string
  outfit_fingerprint: string
  item_ids: string[]
  occasion?: string
}): Promise<void> {
  const raw = await AsyncStorage.getItem('@auracloset_wear_log')
  const logs = raw ? JSON.parse(raw) : []
  logs.push({ ...entry, logged_at: new Date().toISOString() })
  await AsyncStorage.setItem('@auracloset_wear_log', JSON.stringify(logs))
  const { error } = await supabase.from('wear_logs').insert(entry)
  if (error) throw new Error(`[insertWearLog] ${error.message}`)
}

export async function getWearLogs(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('wear_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
  if (error) throw new Error(`[getWearLogs] ${error.message}`)
  return data ?? []
}

export async function deleteWearLog(logId: string): Promise<void> {
  const { error } = await supabase
    .from('wear_logs')
    .delete()
    .eq('id', logId)
  if (error) throw new Error(`[deleteWearLog] ${error.message}`)
}

// ══ AFFINITY SIGNALS ═════════════════════════════════════════════════════════

export async function insertAffinitySignal(signal: {
  user_id: string
  item_id: string
  signal_type: 'love' | 'not_today' | 'worn'
  weight?: number
}): Promise<void> {
  const { error } = await supabase.from('affinity_signals').insert(signal)
  if (error) throw new Error(`[insertAffinitySignal] ${error.message}`)
}

export async function getAffinitySignals(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('affinity_signals')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
  if (error) throw new Error(`[getAffinitySignals] ${error.message}`)
  return data ?? []
}

// ══ PAIR AFFINITY SIGNALS ════════════════════════════════════════════════════

export async function insertPairAffinitySignal(signal: {
  user_id: string
  item_id_a: string
  item_id_b: string
  signal_type: 'love' | 'not_today' | 'worn'
  weight?: number
}): Promise<void> {
  const { error } = await supabase.from('pair_affinity_signals').insert(signal)
  if (error) throw new Error(`[insertPairAffinitySignal] ${error.message}`)
}

export async function getPairAffinitySignals(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('pair_affinity_signals')
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(`[getPairAffinitySignals] ${error.message}`)
  return data ?? []
}

// ══ ROTATION CURSORS ═════════════════════════════════════════════════════════

export async function upsertRotationCursor(cursor: {
  user_id: string
  scenario: string
  cursor_index: number
  seed_date: string
}): Promise<void> {
  const { error } = await supabase
    .from('rotation_cursors')
    .upsert(cursor, { onConflict: 'user_id,scenario' })
  if (error) throw new Error(`[upsertRotationCursor] ${error.message}`)
}

export async function getRotationCursors(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('rotation_cursors')
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(`[getRotationCursors] ${error.message}`)
  return data ?? []
}

// ══ TRYON PROFILES ═══════════════════════════════════════════════════════════

export async function upsertTryonProfile(profile: {
  user_id: string
  photo_url: string
  is_active?: boolean
}): Promise<void> {
  const { error } = await supabase
    .from('tryon_profiles')
    .upsert(profile, { onConflict: 'user_id' })
  if (error) throw new Error(`[upsertTryonProfile] ${error.message}`)
}

export async function getTryonProfile(userId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('tryon_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()
  if (error && error.code !== 'PGRST116') {
    throw new Error(`[getTryonProfile] ${error.message}`)
  }
  return data ?? null
}

// ══ SAVED LOOKS ══════════════════════════════════════════════════════════════

export async function getSavedLooks(userId: string): Promise<Array<{
  id: string
  custom_name?: string
  saved_at: string
}>> {
  const { data, error } = await supabase
    .from('saved_looks')
    .select('id, custom_name, saved_at')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false })
  if (error) throw new Error(`[getSavedLooks] ${error.message}`)
  return data ?? []
}

export async function upsertSavedLook(look: {
  user_id: string
  id: string
  custom_name?: string | null
  saved_at: string
}): Promise<void> {
  const { error } = await supabase
    .from('saved_looks')
    .upsert(look, { onConflict: 'user_id,id' })
  if (error) throw new Error(`[upsertSavedLook] ${error.message}`)
}

export async function deleteSavedLook(
  userId: string,
  lookId: string
): Promise<void> {
  const { error } = await supabase
    .from('saved_looks')
    .delete()
    .eq('user_id', userId)
    .eq('id', lookId)
  if (error) throw new Error(`[deleteSavedLook] ${error.message}`)
}
