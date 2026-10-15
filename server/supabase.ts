import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

if (!supabaseUrl || !supabaseSecretKey || !supabasePublishableKey) {
  throw new Error(
    '[server/supabase] Missing SUPABASE_URL, SUPABASE_SECRET_KEY, or ' +
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  )
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey
)

// User-facing Auth endpoints use the publishable key; the secret key is reserved
// for supabaseAdmin. Keep this client separate and stateless for server proxies.
export const supabaseAuth = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

// Anon client — used for user-facing OTP flows (e.g. account-deletion web
// form) where the request must be scoped to the authenticated user, not the
// service role.  Uses the publishable (anon) key so Supabase sends OTP emails
// via its own email delivery infrastructure.
export const supabaseAnon = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
