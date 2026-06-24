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

// Separate stateless client for auth proxy operations.
// persistSession: false ensures sign-in/reset calls never mutate the shared
// admin session, keeping the admin client clean for privileged operations.
export const supabaseAuth = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
