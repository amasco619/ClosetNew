import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'
import * as SecureStore from 'expo-secure-store'
import { createClient, processLock } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    '[lib/supabase] Missing EXPO_PUBLIC_SUPABASE_URL or ' +
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  )
}

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

// When the Expo Go OAuth relay is active, the web app loads inside
// ASWebAuthenticationSession carrying ?nativeCallback=<exp-url>&code=<code>.
// Suppress detectSessionInUrl so Supabase doesn't try to exchange the PKCE
// code with a missing verifier (the verifier lives in native SecureStore, not
// in the in-app browser's storage). The _layout.tsx relay useEffect handles
// the redirect instead.
const isNativeCallbackRelay =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.location.search.includes('nativeCallback')

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      ...(Platform.OS !== 'web'
        ? { storage: SecureStoreAdapter }
        : {}),
      autoRefreshToken: true,
      persistSession: true,
      // On web: true so Supabase auto-processes the PKCE code (or hash tokens)
      // in the URL after an OAuth redirect and exchanges it for a session.
      // Disabled during the native relay to avoid consuming the PKCE code
      // before the native app can exchange it.
      // On native: false because deep-link URL parsing is handled manually
      // via createSessionFromUrl() in lib/auth.ts.
      detectSessionInUrl: Platform.OS === 'web' && !isNativeCallbackRelay,
      lock: processLock,
    },
  }
)

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}
