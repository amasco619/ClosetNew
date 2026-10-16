import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const clientSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

const selectedProjectOrigin = 'https://garppyocfgdamdgfyfbr.supabase.co'

function supabaseProjectOrigin(input: string): string | null {
  try {
    const url = new URL(input)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return null
    return url.origin
  } catch {
    return null
  }
}

export function areSupabaseProjectUrlsAligned(serverUrl: string, clientUrl: string): boolean {
  const serverOrigin = supabaseProjectOrigin(serverUrl)
  const clientOrigin = supabaseProjectOrigin(clientUrl)
  return serverOrigin !== null && serverOrigin === clientOrigin
}

export function isSelectedSupabaseProjectUrl(url: string): boolean {
  return supabaseProjectOrigin(url) === selectedProjectOrigin
}

if (!supabaseUrl || !clientSupabaseUrl || !supabaseSecretKey || !supabasePublishableKey) {
  throw new Error(
    '[server/supabase] Missing SUPABASE_URL, EXPO_PUBLIC_SUPABASE_URL, ' +
    'SUPABASE_SECRET_KEY, or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  )
}

if (process.env.NODE_ENV !== 'test') {
  if (!areSupabaseProjectUrlsAligned(supabaseUrl, clientSupabaseUrl)) {
    throw new Error(
      '[server/supabase] SUPABASE_URL and EXPO_PUBLIC_SUPABASE_URL must be HTTPS project base URLs with no path, query, or fragment and target the same project'
    )
  }
  if (!isSelectedSupabaseProjectUrl(supabaseUrl)) {
    throw new Error(
      '[server/supabase] Configure Replit preview to use the selected Amodka Production Supabase project'
    )
  }
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
