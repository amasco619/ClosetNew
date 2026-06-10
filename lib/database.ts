import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch } from 'expo/fetch'
import { supabase } from './supabase'
import { getApiUrl } from './query-client'

// ── AUTHENTICATED API HELPER ──────────────────────────────
// All DB operations route through the Express backend with the
// admin Supabase client so RLS is never an obstacle.

async function dbApi(method: string, path: string, body?: unknown): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')

  const baseUrl = getApiUrl()
  const url = new URL(`/api/db/${path}`, baseUrl)

  const isGet = method === 'GET'
  const res = await (fetch as any)(url.toString(), {
    method,
    headers: {
      ...(!isGet ? { 'Content-Type': 'application/json' } : {}),
      'Authorization': `Bearer ${token}`,
    },
    body: !isGet && body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })

  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? String(res.status))
  return json
}

// ══ USER PROFILE ════════════════════════════════════════

export async function upsertUserProfile(profile: {
  id: string
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
  await AsyncStorage.setItem(
    '@auracloset_profile',
    JSON.stringify(profile)
  )
  await dbApi('POST', 'profile', profile)
}

export async function getUserProfile(_userId: string): Promise<any | null> {
  const res = await dbApi('GET', 'profile')
  return res.data ?? null
}

// ══ WARDROBE ITEMS ═══════════════════════════════════════

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
  const res = await dbApi('POST', 'wardrobe', item)
  const raw = await AsyncStorage.getItem('@auracloset_item_ids')
  const ids: string[] = raw ? JSON.parse(raw) : []
  ids.push(res.id)
  await AsyncStorage.setItem('@auracloset_item_ids', JSON.stringify(ids))
  return { id: res.id }
}

export async function getWardrobeItems(_userId: string): Promise<any[]> {
  const res = await dbApi('GET', 'wardrobe')
  return res.data ?? []
}

export async function deleteWardrobeItem(itemId: string): Promise<void> {
  await dbApi('DELETE', `wardrobe/${itemId}`)
}

export async function updateWardrobeItemAffinity(
  itemId: string,
  affinity: number
): Promise<void> {
  await dbApi('PATCH', `wardrobe/${itemId}/affinity`, { affinity })
}

// ══ SLOT STATUSES ════════════════════════════════════════

export async function upsertSlotStatus(slot: {
  user_id: string
  slot_id: string
  status: 'needed' | 'owned'
  matched_item_id?: string | null
}): Promise<void> {
  await dbApi('POST', 'slot-statuses', slot)
}

export async function getSlotStatuses(_userId: string): Promise<any[]> {
  const res = await dbApi('GET', 'slot-statuses')
  return res.data ?? []
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
  await dbApi('POST', 'slot-statuses/bulk', { slots })
}

// ══ WEAR LOGS ════════════════════════════════════════════

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
  await dbApi('POST', 'wear-logs', entry)
}

export async function getWearLogs(_userId: string): Promise<any[]> {
  const res = await dbApi('GET', 'wear-logs')
  return res.data ?? []
}

export async function deleteWearLog(logId: string): Promise<void> {
  await dbApi('DELETE', `wear-logs/${logId}`)
}

// ══ AFFINITY SIGNALS ═════════════════════════════════════

export async function insertAffinitySignal(signal: {
  user_id: string
  item_id: string
  signal_type: 'love' | 'not_today' | 'worn'
  weight?: number
}): Promise<void> {
  await dbApi('POST', 'affinity', signal)
}

export async function getAffinitySignals(_userId: string): Promise<any[]> {
  const res = await dbApi('GET', 'affinity')
  return res.data ?? []
}

// ══ PAIR AFFINITY SIGNALS ════════════════════════════════

export async function insertPairAffinitySignal(signal: {
  user_id: string
  item_id_a: string
  item_id_b: string
  signal_type: 'love' | 'not_today' | 'worn'
  weight?: number
}): Promise<void> {
  await dbApi('POST', 'pair-affinity', signal)
}

export async function getPairAffinitySignals(_userId: string): Promise<any[]> {
  const res = await dbApi('GET', 'pair-affinity')
  return res.data ?? []
}

// ══ ROTATION CURSORS ═════════════════════════════════════

export async function upsertRotationCursor(cursor: {
  user_id: string
  scenario: string
  cursor_index: number
  seed_date: string
}): Promise<void> {
  await dbApi('POST', 'rotation', cursor)
}

export async function getRotationCursors(_userId: string): Promise<any[]> {
  const res = await dbApi('GET', 'rotation')
  return res.data ?? []
}

// ══ TRYON PROFILES ═══════════════════════════════════════

export async function upsertTryonProfile(profile: {
  user_id: string
  photo_url: string
  is_active?: boolean
}): Promise<void> {
  await dbApi('POST', 'tryon-profile', profile)
}

export async function getTryonProfile(_userId: string): Promise<any | null> {
  const res = await dbApi('GET', 'tryon-profile')
  return res.data ?? null
}
