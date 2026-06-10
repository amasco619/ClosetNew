import type { Express, Request, Response } from 'express'
import { supabaseAdmin } from './supabase'

async function verifyUser(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return null
    return user.id
  } catch {
    return null
  }
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: 'Unauthorized' })
}

export function registerDbRoutes(app: Express): void {

  // ── USER PROFILE ─────────────────────────────────────────

  app.get('/api/db/profile', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { data, error } = await supabaseAdmin
      .from('user_profiles').select('*').eq('id', userId).single()
    if (error && error.code !== 'PGRST116') {
      res.status(500).json({ error: error.message }); return
    }
    res.json({ data: data ?? null })
  })

  app.post('/api/db/profile', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { error } = await supabaseAdmin
      .from('user_profiles')
      .upsert({ ...req.body, id: userId }, { onConflict: 'id' })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  // ── WARDROBE ITEMS ────────────────────────────────────────

  app.get('/api/db/wardrobe', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { data, error } = await supabaseAdmin
      .from('wardrobe_items').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ data: data ?? [] })
  })

  app.post('/api/db/wardrobe', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { data, error } = await supabaseAdmin
      .from('wardrobe_items')
      .insert({ ...req.body, user_id: userId })
      .select('id').single()
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ id: data.id })
  })

  app.delete('/api/db/wardrobe/:itemId', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { error } = await supabaseAdmin
      .from('wardrobe_items').delete()
      .eq('id', req.params.itemId).eq('user_id', userId)
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  app.patch('/api/db/wardrobe/:itemId/affinity', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const clamped = Math.min(1.3, Math.max(0.7, Number(req.body.affinity)))
    const { error } = await supabaseAdmin
      .from('wardrobe_items')
      .update({ item_affinity: clamped, updated_at: new Date().toISOString() })
      .eq('id', req.params.itemId).eq('user_id', userId)
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  // ── SLOT STATUSES ─────────────────────────────────────────

  app.get('/api/db/slot-statuses', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { data, error } = await supabaseAdmin
      .from('slot_statuses').select('*').eq('user_id', userId)
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ data: data ?? [] })
  })

  app.post('/api/db/slot-statuses', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { error } = await supabaseAdmin
      .from('slot_statuses')
      .upsert({ ...req.body, user_id: userId }, { onConflict: 'user_id,slot_id' })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  app.post('/api/db/slot-statuses/bulk', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const slots: any[] = (req.body.slots ?? []).map((s: any) => ({ ...s, user_id: userId }))
    if (slots.length === 0) { res.json({ success: true }); return }
    const { error } = await supabaseAdmin
      .from('slot_statuses')
      .upsert(slots, { onConflict: 'user_id,slot_id' })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  // ── WEAR LOGS ─────────────────────────────────────────────

  app.get('/api/db/wear-logs', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { data, error } = await supabaseAdmin
      .from('wear_logs').select('*').eq('user_id', userId)
      .order('logged_at', { ascending: false })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ data: data ?? [] })
  })

  app.post('/api/db/wear-logs', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { error } = await supabaseAdmin
      .from('wear_logs').insert({ ...req.body, user_id: userId })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  app.delete('/api/db/wear-logs/:logId', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { error } = await supabaseAdmin
      .from('wear_logs').delete()
      .eq('id', req.params.logId).eq('user_id', userId)
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  // ── AFFINITY SIGNALS ──────────────────────────────────────

  app.get('/api/db/affinity', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { data, error } = await supabaseAdmin
      .from('affinity_signals').select('*').eq('user_id', userId)
      .order('logged_at', { ascending: false })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ data: data ?? [] })
  })

  app.post('/api/db/affinity', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { error } = await supabaseAdmin
      .from('affinity_signals').insert({ ...req.body, user_id: userId })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  // ── PAIR AFFINITY SIGNALS ─────────────────────────────────

  app.get('/api/db/pair-affinity', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { data, error } = await supabaseAdmin
      .from('pair_affinity_signals').select('*').eq('user_id', userId)
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ data: data ?? [] })
  })

  app.post('/api/db/pair-affinity', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { error } = await supabaseAdmin
      .from('pair_affinity_signals').insert({ ...req.body, user_id: userId })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  // ── ROTATION CURSORS ──────────────────────────────────────

  app.get('/api/db/rotation', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { data, error } = await supabaseAdmin
      .from('rotation_cursors').select('*').eq('user_id', userId)
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ data: data ?? [] })
  })

  app.post('/api/db/rotation', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { error } = await supabaseAdmin
      .from('rotation_cursors')
      .upsert({ ...req.body, user_id: userId }, { onConflict: 'user_id,scenario' })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })

  // ── TRYON PROFILES ────────────────────────────────────────

  app.get('/api/db/tryon-profile', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { data, error } = await supabaseAdmin
      .from('tryon_profiles').select('*').eq('user_id', userId)
      .eq('is_active', true).single()
    if (error && error.code !== 'PGRST116') {
      res.status(500).json({ error: error.message }); return
    }
    res.json({ data: data ?? null })
  })

  app.post('/api/db/tryon-profile', async (req: Request, res: Response) => {
    const userId = await verifyUser(req.headers.authorization)
    if (!userId) { unauthorized(res); return }
    const { error } = await supabaseAdmin
      .from('tryon_profiles')
      .upsert({ ...req.body, user_id: userId }, { onConflict: 'user_id' })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
  })
}
