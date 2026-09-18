import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { mapDbRowToGarmentGroup } from './garmentGroupMapper'
import type {
  GarmentGroup,
  GarmentGroupConfirmationStatus,
  GarmentRelationshipType,
} from '../constants/types'

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
  onboarding_complete?: boolean
  is_guest?: boolean
}): Promise<void> {
  // `premium` is intentionally absent from this function's parameter type.
  // Client code must never elevate its own premium status. Future verified
  // payment handling is restricted to the server-only entitlement boundary.
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
  const raw = await AsyncStorage.getItem('@amodka_item_ids')
  const ids: string[] = raw ? JSON.parse(raw) : []
  ids.push(data.id)
  await AsyncStorage.setItem('@amodka_item_ids', JSON.stringify(ids))
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

export async function deleteWardrobeItem(userId: string, itemId: string): Promise<void> {
  // NH-1: always scope the delete to the owning user so a caller cannot delete
  // another user's item even if they somehow obtain a foreign item ID.
  const { error } = await supabase
    .from('wardrobe_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId)
  if (error) throw new Error(`[deleteWardrobeItem] ${error.message}`)
}

export async function updateWardrobeItemAffinity(
  userId: string,
  itemId: string,
  affinity: number
): Promise<void> {
  // NH-1: scope update to the owning user.
  const clamped = Math.min(1.3, Math.max(0.7, affinity))
  const { error } = await supabase
    .from('wardrobe_items')
    .update({ item_affinity: clamped, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('user_id', userId)
  if (error) throw new Error(`[updateWardrobeItemAffinity] ${error.message}`)
}

// ══ GARMENT GROUPS ═══════════════════════════════════════════════════════════

export interface CreateGarmentGroupInput {
  relationshipType: GarmentRelationshipType
  relationshipConfidence?: number
  confirmationStatus: GarmentGroupConfirmationStatus
  sharedAttributes?: Record<string, unknown>
  sourceImagePath?: string
}

export async function createGarmentGroup(
  input: CreateGarmentGroupInput,
  garmentIds: string[],
): Promise<GarmentGroup> {
  const { data, error } = await supabase.rpc('create_garment_group', {
    p_garment_ids: garmentIds,
    p_relationship_type: input.relationshipType,
    p_relationship_confidence: input.relationshipConfidence ?? null,
    p_confirmation_status: input.confirmationStatus,
    p_shared_attributes: input.sharedAttributes ?? {},
    p_source_image_path: input.sourceImagePath ?? null,
  }).single()
  if (error) throw new Error(`[createGarmentGroup] ${error.message}`)
  const createdGroupId = (data as { id?: string } | null)?.id
  if (!createdGroupId) throw new Error('[createGarmentGroup] no group returned')
  const { data: created, error: readError } = await supabase
    .from('garment_groups')
    .select('*, garment_group_members(*)')
    .eq('id', createdGroupId)
    .single()
  if (readError) throw new Error(`[createGarmentGroup] ${readError.message}`)
  return mapDbRowToGarmentGroup(created)
}

export async function getGarmentGroups(userId: string): Promise<GarmentGroup[]> {
  const { data, error } = await supabase
    .from('garment_groups')
    .select('*, garment_group_members(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`[getGarmentGroups] ${error.message}`)
  return (data ?? []).map(mapDbRowToGarmentGroup)
}

export async function updateGarmentGroup(
  userId: string,
  groupId: string,
  updates: {
    relationshipType?: GarmentRelationshipType
    relationshipConfidence?: number | null
    confirmationStatus?: GarmentGroupConfirmationStatus
    sharedAttributes?: Record<string, unknown>
    sourceImagePath?: string | null
  },
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (updates.relationshipType !== undefined) row.relationship_type = updates.relationshipType
  if (updates.relationshipConfidence !== undefined) row.relationship_confidence = updates.relationshipConfidence
  if (updates.confirmationStatus !== undefined) row.confirmation_status = updates.confirmationStatus
  if (updates.sharedAttributes !== undefined) row.shared_attributes = updates.sharedAttributes
  if (updates.sourceImagePath !== undefined) row.source_image_path = updates.sourceImagePath
  if (Object.keys(row).length === 0) return

  const { error } = await supabase
    .from('garment_groups')
    .update(row)
    .eq('id', groupId)
    .eq('user_id', userId)
  if (error) throw new Error(`[updateGarmentGroup] ${error.message}`)
}

export async function addGarmentGroupMembers(
  userId: string,
  groupId: string,
  garmentIds: string[],
): Promise<void> {
  if (garmentIds.length === 0) return
  const { error } = await supabase
    .from('garment_group_members')
    .insert(garmentIds.map(garmentId => ({
      user_id: userId,
      group_id: groupId,
      garment_id: garmentId,
    })))
  if (error) throw new Error(`[addGarmentGroupMembers] ${error.message}`)
}

export async function removeGarmentGroupMember(
  userId: string,
  groupId: string,
  garmentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('garment_group_members')
    .delete()
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .eq('garment_id', garmentId)
  if (error) throw new Error(`[removeGarmentGroupMember] ${error.message}`)
}

export async function deleteGarmentGroup(
  userId: string,
  groupId: string,
): Promise<void> {
  const { error } = await supabase
    .from('garment_groups')
    .delete()
    .eq('id', groupId)
    .eq('user_id', userId)
  if (error) throw new Error(`[deleteGarmentGroup] ${error.message}`)
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
  const raw = await AsyncStorage.getItem('@amodka_wear_log')
  const logs = raw ? JSON.parse(raw) : []
  logs.push({ ...entry, logged_at: new Date().toISOString() })
  await AsyncStorage.setItem('@amodka_wear_log', JSON.stringify(logs))
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

export async function deleteWearLog(userId: string, logId: string): Promise<void> {
  // NH-1: scope the delete to the owning user.
  const { error } = await supabase
    .from('wear_logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId)
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
  // P-A: only load signals from the past 90 days (the affinity engine uses a
  // 60-day half-life, so older signals contribute < 0.25% weight anyway).
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('affinity_signals')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', cutoff)
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
  // P-A: mirror the 90-day window applied to item-level affinity signals.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('pair_affinity_signals')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', cutoff)
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

// ══ STORAGE MIGRATION (Phase 5A.1 — AuraCloset → Amodka rebrand) ═════════════
// Implementation lives in lib/storage-migration.ts (lazy AsyncStorage require
// keeps react-native out of the test dep graph).  Re-exported here so existing
// callers (app/_layout.tsx) need no import-path changes.
export { migrateStorage, _migrateStorageOverrides } from './storage-migration'
