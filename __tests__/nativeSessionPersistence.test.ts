import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { build, type Plugin } from 'esbuild'

type NativeSessionState = {
  platform: 'ios' | 'android'
  store: Map<string, string>
}

const nativeState: NativeSessionState = { platform: 'ios', store: new Map() }
Object.assign(globalThis, { __nativeSessionPersistenceState: nativeState })

const modules: Record<string, string> = {
  'react-native': `
    const state = globalThis.__nativeSessionPersistenceState
    export const Platform = { OS: state.platform }
    export const AppState = { addEventListener: () => ({ remove() {} }) }
  `,
  'expo-secure-store': `
    const store = globalThis.__nativeSessionPersistenceState.store
    export const getItemAsync = async key => store.get(key) ?? null
    export const setItemAsync = async (key, value) => { store.set(key, value) }
    export const deleteItemAsync = async key => { store.delete(key) }
  `,
  'react-native-url-polyfill/auto': '',
}

const nativeBoundaries: Plugin = {
  name: 'native-session-persistence-boundaries',
  setup(build) {
    build.onResolve({ filter: /.*/ }, args =>
      Object.hasOwn(modules, args.path)
        ? { path: args.path, namespace: 'native-session-mock' }
        : undefined)
    build.onLoad({ filter: /.*/, namespace: 'native-session-mock' }, args => ({
      contents: modules[args.path],
      loader: 'js',
    }))
  },
}

const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'))

async function main() {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://session-test.supabase.co'
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'

  const built = await build({
    entryPoints: [path.join(process.cwd(), 'lib/supabase.ts')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    plugins: [nativeBoundaries],
  })

  function createSupabaseClient() {
    const mod: { exports: Record<string, any> } = { exports: {} }
    new Function('require', 'module', 'exports', built.outputFiles[0].text)(
      requireFromProject,
      mod,
      mod.exports,
    )
    return mod.exports.supabase as {
      auth: {
        setSession: (session: { access_token: string; refresh_token: string }) => Promise<any>
        getSession: () => Promise<any>
      }
    }
  }

  const user = {
    id: 'persisted-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'persisted@example.com',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  }
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const accessToken = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({
      sub: user.id,
      role: user.role,
      aud: user.aud,
      exp: expiresAt,
    })).toString('base64url'),
    'sig',
  ].join('.')

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify(user), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

  try {
    for (const platform of ['ios', 'android'] as const) {
      nativeState.platform = platform
      nativeState.store = new Map()

      const firstLaunchClient = createSupabaseClient()
      const saved = await firstLaunchClient.auth.setSession({
        access_token: accessToken,
        refresh_token: `refresh-${platform}`,
      })
      assert.equal(saved.error, null, `${platform}: sign-in stores the session successfully`)
      assert.equal(saved.data.session?.user.id, user.id, `${platform}: sign-in establishes the account`)

      const storedValue = [...nativeState.store.entries()].find(([key]) =>
        key.endsWith('-auth-token'),
      )?.[1]
      assert.ok(storedValue, `${platform}: Supabase writes the session through SecureStore`)

      // A new client instance models the app process being force-closed and reopened.
      const reopenedClient = createSupabaseClient()
      const restored = await reopenedClient.auth.getSession()
      assert.equal(restored.error, null, `${platform}: startup restores the saved session`)
      assert.equal(restored.data.session?.user.id, user.id, `${platform}: restored account stays signed in`)
      assert.equal(
        restored.data.session?.refresh_token,
        `refresh-${platform}`,
        `${platform}: refresh token survives client reinitialization`,
      )
    }
  } finally {
    globalThis.fetch = originalFetch
  }

  console.log('Native Supabase session persistence checks passed for iOS and Android.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
