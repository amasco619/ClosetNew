import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import React from 'react'
import { build, type Plugin } from 'esbuild'
import { virtualMockModule } from './helpers/virtualMockModule'

// Bundle the real screens, replacing only their native and external boundaries.
// Nothing in this test imports the live Supabase client or makes network calls.
const mocks = {
  params: {} as { code?: string; type?: string; error?: string },
  routes: [] as string[],
  confirm: (_url: string): Promise<unknown> => Promise.resolve({}),
  recover: (_url: string): Promise<unknown> => Promise.resolve({}),
  getClaims: (): Promise<{ data: { claims?: unknown } | null; error: unknown }> =>
    Promise.resolve({ data: { claims: {} }, error: null }),
  update: (_password: string): Promise<void> => Promise.resolve(),
}
Object.assign(globalThis, {
  __auth2MountedMocks: mocks,
  IS_REACT_ACT_ENVIRONMENT: true,
})

const modules: Record<string, string> = {
  'react-native': `
    import React from 'react'
    const host = name => ({ children, ...props }) => React.createElement(name, props, children)
    export const View = host('View')
    export const Text = host('Text')
    export const TextInput = host('TextInput')
    export const TouchableOpacity = host('TouchableOpacity')
    export const Pressable = host('Pressable')
    export const ActivityIndicator = host('ActivityIndicator')
    export const KeyboardAvoidingView = host('KeyboardAvoidingView')
    export const ScrollView = host('ScrollView')
    export const Platform = { OS: 'web' }
    export const StyleSheet = { create: styles => styles }
  `,
  'expo-router': `
    const m = globalThis.__auth2MountedMocks
    export const router = { replace: path => m.routes.push(path) }
    export const useLocalSearchParams = () => m.params
  `,
  'expo-status-bar': `export const StatusBar = () => null`,
  '@expo/vector-icons': `export const Ionicons = () => null`,
  '../../lib/auth': `
    const m = globalThis.__auth2MountedMocks
    export const createEmailConfirmationSessionFromUrl = url => m.confirm(url)
    export const createPasswordRecoverySessionFromUrl = url => m.recover(url)
    export const updatePassword = password => m.update(password)
    export const validatePassword = password => password.length >= 8 ? null : 'Password too short.'
  `,
  '../../lib/supabase': `
    const m = globalThis.__auth2MountedMocks
    export const supabase = { auth: { getClaims: () => m.getClaims() } }
  `,
}

const boundaryMocks: Plugin = {
  name: 'auth2-mounted-boundaries',
  setup(build) {
    build.onResolve({ filter: /.*/ }, args =>
      Object.hasOwn(modules, args.path)
        ? { path: args.path, namespace: 'auth2-mock' }
        : undefined)
    build.onLoad({ filter: /.*/, namespace: 'auth2-mock' }, args =>
      virtualMockModule(modules[args.path]))
  },
}

const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'))
const renderer = requireFromProject('react-test-renderer') as {
  create: (element: React.ReactElement) => MountedTree
}
type Node = {
  children: Array<Node | string>
  props: Record<string, any>
  findAllByType: (type: string) => Node[]
}
type MountedTree = { root: Node; unmount: () => void }

async function screen(filename: 'confirm.tsx' | 'update-password.tsx') {
  const built = await build({
    entryPoints: [path.join(process.cwd(), 'app/auth', filename)],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
    plugins: [boundaryMocks],
  })
  const mod: { exports: { default?: React.ComponentType } } = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    requireFromProject, mod, mod.exports)
  assert.ok(mod.exports.default, `loaded ${filename}`)
  return mod.exports.default
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function reset(params: typeof mocks.params = {}) {
  mocks.params = params
  mocks.routes = []
  mocks.confirm = async () => ({})
  mocks.recover = async () => ({})
  mocks.getClaims = async () => ({ data: { claims: {} }, error: null })
  mocks.update = async () => {}
}

async function mount(Component: React.ComponentType): Promise<MountedTree> {
  let tree!: MountedTree
  await React.act(async () => { tree = renderer.create(React.createElement(Component)) })
  return tree
}

async function unmount(tree: MountedTree) {
  await React.act(async () => tree.unmount())
}

function words(node: Node | string): string {
  return typeof node === 'string' ? node : node.children.map(words).join('')
}

function hasText(tree: MountedTree, text: string) {
  return tree.root.findAllByType('Text').some(node => words(node).includes(text))
}

function button(tree: MountedTree, label: string): Node {
  const found = tree.root.findAllByType('Pressable')
    .concat(tree.root.findAllByType('TouchableOpacity'))
    .find(node => words(node).includes(label))
  assert.ok(found, `button "${label}" is rendered`)
  return found
}

async function main() {
  const [Confirm, UpdatePassword] = await Promise.all([
    screen('confirm.tsx'), screen('update-password.tsx'),
  ])
  {
    reset({ code: 'confirmation-code', type: 'signup' })
    const pending = deferred<unknown>()
    let passedUrl = ''
    mocks.confirm = url => { passedUrl = url; return pending.promise }
    const tree = await mount(Confirm)
    assert.ok(hasText(tree, 'Confirming your email...'))
    assert.deepEqual(mocks.routes, [])
    assert.ok(passedUrl.includes('code=confirmation-code'))
    await React.act(async () => pending.resolve({ session: {} }))
    assert.deepEqual(mocks.routes, ['/'], 'confirmed session hands off to app index')
    await unmount(tree)
  }

  for (const failure of ['expired code', 'exchange failed']) {
    reset({ code: 'invalid-code' })
    mocks.confirm = async () => { throw new Error(failure) }
    const tree = await mount(Confirm)
    assert.ok(hasText(tree, 'This confirmation link is invalid or has expired.'))
    assert.ok(!hasText(tree, failure), 'provider detail is not displayed')
    assert.deepEqual(mocks.routes, [])
    await React.act(async () => button(tree, 'Back to sign in').props.onPress())
    assert.deepEqual(mocks.routes, ['/sign-in'])
    await unmount(tree)
  }

  {
    reset({ code: 'recovery-code', type: 'recovery' })
    const exchange = deferred<unknown>()
    const claims = deferred<{ data: { claims?: unknown } | null; error: unknown }>()
    let updateCalls = 0
    mocks.recover = () => exchange.promise
    mocks.getClaims = () => claims.promise
    mocks.update = async () => { updateCalls++ }
    const tree = await mount(UpdatePassword)
    assert.ok(hasText(tree, 'Checking your recovery link...'))
    assert.equal(tree.root.findAllByType('TextInput').length, 0, 'form cannot submit before exchange')
    await React.act(async () => exchange.resolve({ session: {} }))
    assert.equal(tree.root.findAllByType('TextInput').length, 0, 'form waits for claims too')
    assert.equal(updateCalls, 0)
    await React.act(async () => claims.resolve({ data: { claims: { sub: 'test-user' } }, error: null }))
    assert.ok(hasText(tree, 'Set a new password'))
    assert.equal(tree.root.findAllByType('TextInput').length, 2)
    await unmount(tree)
  }

  for (const claimsResult of [
    { data: null, error: null },
    { data: { claims: undefined }, error: new Error('invalid claims') },
  ]) {
    reset({ code: 'bad-claims' })
    mocks.getClaims = async () => claimsResult
    const tree = await mount(UpdatePassword)
    assert.ok(hasText(tree, 'Recovery link unavailable'))
    assert.equal(tree.root.findAllByType('TextInput').length, 0)
    await unmount(tree)
  }

  {
    reset()
    let exchangeCalls = 0
    mocks.recover = async () => { exchangeCalls++; return {} }
    const tree = await mount(UpdatePassword)
    assert.ok(hasText(tree, 'Recovery link unavailable'))
    assert.equal(exchangeCalls, 0, 'missing code is rejected before exchange')
    await React.act(async () => button(tree, 'Request another link').props.onPress())
    assert.deepEqual(mocks.routes, ['/forgot-password'])
    await unmount(tree)
  }

  for (const outcome of ['failure', 'success']) {
    reset({ code: 'valid-recovery-code' })
    const tree = await mount(UpdatePassword)
    const [password, confirmation] = tree.root.findAllByType('TextInput')
    await React.act(async () => {
      password.props.onChangeText('ValidPass1')
      confirmation.props.onChangeText('ValidPass1')
    })
    const pending = deferred<void>()
    let submittedPassword = ''
    mocks.update = value => { submittedPassword = value; return pending.promise }
    await React.act(async () => button(tree, 'Update password').props.onPress())
    assert.equal(submittedPassword, 'ValidPass1')
    assert.equal(button(tree, 'Update password').props.disabled, true)
    if (outcome === 'failure') {
      await React.act(async () => pending.reject(new Error('[updatePassword] Password could not be updated. Please try again.')))
      assert.ok(hasText(tree, 'Password could not be updated. Please try again.'))
      assert.ok(hasText(tree, 'Set a new password'))
      assert.deepEqual(mocks.routes, [])
    } else {
      await React.act(async () => pending.resolve())
      assert.ok(hasText(tree, 'Password updated'))
      await React.act(async () => button(tree, 'Go to my wardrobe').props.onPress())
      assert.deepEqual(mocks.routes, ['/(tabs)'])
    }
    await unmount(tree)
  }

  console.log('AUTH-2 mounted confirmation and recovery UI: all states passed')
}

void main().catch(error => { console.error(error); process.exitCode = 1 })