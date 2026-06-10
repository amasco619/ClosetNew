import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    '[server/supabase] Missing SUPABASE_URL or ' +
    'SUPABASE_SECRET_KEY'
  )
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey
)
