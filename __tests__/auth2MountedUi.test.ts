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
  stack: [] as string[],
  backHandlers: [] as Array<() => boolean>,
  dismisses: 0,
  signInCalls: 0,
  platformOS: 'web',
  appState: {
    isAuthenticated: false,
    isGuest: false,
    wardrobeTotalCount: 0,
    appReady: false,
    startupError: null,
    retryInitialization: () => {},
    profile: {} as Record<string, unknown>,
  },
  confirm: (_url: string): Promise<unknown> => Promise.resolve({}),
  recover: (_url: string): Promise<unknown> => Promise.resolve({}),
  signIn: (_email: string, _password: string): Promise<void> => Promise.resolve(),
  signUp: (_email: string, _password: string): Promise<void> => Promise.resolve(),
  signInWithGoogle: (): Promise<void> => Promise.resolve(),
  signInWithApple: (): Promise<void> => Promise.resolve(),
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
    const m = globalThis.__auth2MountedMocks
    export const Platform = { get OS() { return m.platformOS } }
    export const BackHandler = {
      addEventListener: (_event, handler) => {
        m.backHandlers.push(handler)
        return { remove: () => { m.backHandlers = m.backHandlers.filter(item => item !== handler) } }
      },
    }
    export const StyleSheet = { create: styles => styles, absoluteFill: {} }
  `,
  'expo-router': `
    const m = globalThis.__auth2MountedMocks
    export const router = {
      replace: path => {
        m.routes.push(path)
        if (m.stack.length) m.stack[m.stack.length - 1] = path
        else m.stack.push(path)
      },
      dismissAll: () => { m.dismisses++; m.stack.splice(1) },
      push: path => { m.stack.push(path) },
    }
    export const useLocalSearchParams = () => m.params
  `,
  'expo-status-bar': `export const StatusBar = () => null`,
  'expo-image': `import React from 'react'; export const Image = props => React.createElement('Image', props)`,
  'expo-linear-gradient': `import React from 'react'; export const LinearGradient = props => React.createElement('LinearGradient', props)`,
  'expo-blur': `import React from 'react'; export const BlurView = props => React.createElement('BlurView', props)`,
  'react-native-safe-area-context': `export const useSafeAreaInsets = () => ({ top: 0, bottom: 0 })`,
  'expo-linking': `export const useLinkingURL = () => null`,
  'expo-splash-screen': `export const hideAsync = async () => {}`,
  'expo-haptics': `export const selectionAsync = async () => {}; export const impactAsync = async () => {}; export const ImpactFeedbackStyle = { Light: 'light' }`,
  '@expo/vector-icons': `export const Ionicons = () => null`,
  'react-native-reanimated': `
    import React from 'react'
    const View = props => React.createElement('AnimatedView', props)
    const Text = props => React.createElement('AnimatedText', props)
    const Animated = { View, Text }
    export default Animated
    export const FadeInDown = { delay: () => ({ duration: () => null }) }
    export const FadeInUp = { delay: () => ({ duration: () => null }) }
    export const useSharedValue = value => ({ value })
    export const useAnimatedStyle = callback => callback()
    export const withRepeat = value => value
    export const withTiming = (value, _config, callback) => {
      if (callback) callback(true)
      return value
    }
    export const runOnJS = callback => callback
    export const Easing = { in: value => value, inOut: value => value, out: value => value, quad: {}, ease: {}, cubic: {} }
    export const withSpring = value => value
  `,
  '../../lib/auth': `
    const m = globalThis.__auth2MountedMocks
    export const createEmailConfirmationSessionFromUrl = url => m.confirm(url)
    export const createPasswordRecoverySessionFromUrl = url => m.recover(url)
    export const updatePassword = password => m.update(password)
    export const validatePassword = password => password.length >= 8 ? null : 'Password too short.'
  `,
  '../lib/auth': `
    const m = globalThis.__auth2MountedMocks
    export const signInWithEmail = (email, password) => {
      m.signInCalls++
      return m.signIn(email, password)
    }
    export const signUpWithEmail = (email, password) => m.signUp(email, password)
    export const signInWithGoogle = () => m.signInWithGoogle()
    export const signInWithApple = () => m.signInWithApple()
    export const requestPasswordReset = _email => Promise.resolve()
    export const createSessionFromUrl = async () => {}
    export const isValidEmail = email => email.includes('@')
    export const validatePassword = password => password.length >= 8 ? null : 'Password too short.'
  `,
  '../lib/oauth-callback': `export const NATIVE_OAUTH_CALLBACK_URL = ''; export const isOAuthCallbackUrl = () => false`,
  '@/contexts/AppContext': `const m = globalThis.__auth2MountedMocks; export const useApp = () => m.appState`,
  '@/constants/colors': `export default new Proxy({}, { get: () => '#000000' })`,
  '@/components/AuthNotice': `export const AuthNotice = () => null`,
  '@/components/AmodkaErrorState': `export const AmodkaErrorState = () => null`,
  '@/shared/observability': `export const reportError = () => {}`,
  '@/lib/authErrors': `export const normalizeAuthError = error => ({ code: 'unknown', message: String(error) })`,
  '../assets/images/closet.jpg': `export default { uri: 'closet' }`,
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
type MountedTree = {
  root: Node
  update: (element: React.ReactElement) => void
  unmount: () => void
}

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

async function signInScreen() {
  const built = await build({
    entryPoints: [path.join(process.cwd(), 'app/sign-in.tsx')],
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
  assert.ok(mod.exports.default, 'loaded sign-in screen')
  return mod.exports.default
}

async function indexScreen() {
  const built = await build({
    entryPoints: [path.join(process.cwd(), 'app/index.tsx')],
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
  assert.ok(mod.exports.default, 'loaded profile-based index route')
  return mod.exports.default
}

async function forgotPasswordScreen() {
  const built = await build({
    entryPoints: [path.join(process.cwd(), 'app/forgot-password.tsx')],
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
  assert.ok(mod.exports.default, 'loaded forgot-password screen')
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
  mocks.stack = []
  mocks.backHandlers = []
  mocks.dismisses = 0
  mocks.signInCalls = 0
  mocks.platformOS = 'web'
  mocks.appState = {
    isAuthenticated: false,
    isGuest: false,
    wardrobeTotalCount: 0,
    appReady: false,
    startupError: null,
    retryInitialization: () => {},
    profile: {},
  }
  mocks.confirm = async () => ({})
  mocks.recover = async () => ({})
  mocks.signIn = async () => {}
  mocks.signUp = async () => {}
  mocks.signInWithGoogle = async () => {}
  mocks.signInWithApple = async () => {}
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
  const ForgotPassword = await forgotPasswordScreen()
  const Index = await indexScreen()
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

  for (const failure of ['expired link', 'invalid link']) {
    reset({ code: 'expired-recovery-code', type: 'recovery', error: failure })
    mocks.stack = ['/(tabs)', '/auth/update-password']
    const tree = await mount(UpdatePassword)
    assert.ok(hasText(tree, 'Recovery link unavailable'))
    assert.ok(hasText(tree, 'This password recovery link is invalid or has expired.'))
    assert.equal(mocks.backHandlers.length, 1, 'failed recovery intercepts Android Back')
    await React.act(async () => {
      assert.equal(mocks.backHandlers[0](), true)
    })
    assert.deepEqual(mocks.stack, ['/sign-in'], 'Android Back cannot return to authenticated routes')
    await unmount(tree)
  }

  {
    reset()
    mocks.stack = ['/(tabs)', '/auth/update-password']
    const tree = await mount(UpdatePassword)
    await React.act(async () => button(tree, 'Request another link').props.onPress())
    assert.deepEqual(mocks.stack, ['/forgot-password'], 'requesting another link clears private history')
    await unmount(tree)

    reset()
    mocks.stack = ['/(tabs)', '/forgot-password']
    const forgotTree = await mount(ForgotPassword)
    assert.equal(mocks.backHandlers.length, 1, 'forgot-password intercepts Android Back')
    await React.act(async () => {
      assert.equal(mocks.backHandlers[0](), true)
    })
    assert.deepEqual(mocks.stack, ['/sign-in'], 'Android Back from recovery cannot reveal private routes')
    await unmount(forgotTree)
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
    const submit = button(tree, 'Update password')
    await React.act(async () => { submit.props.onPress() })
    assert.equal(submittedPassword, 'ValidPass1')
    assert.equal(submit.props.disabled, true)
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

  for (const method of ['email', 'google', 'apple'] as const) {
    reset()
    mocks.stack = ['/welcome', '/sign-in']
    const SignIn = await signInScreen()
    const tree = await mount(SignIn)
    if (method === 'email') {
      const [email, password] = tree.root.findAllByType('TextInput')
      await React.act(async () => {
        email.props.onChangeText('user@example.com')
        password.props.onChangeText('ValidPass1')
      })
      const submit = tree.root.findAllByType('TouchableOpacity')
        .filter(node => words(node).trim() === 'Sign in')
        .pop()
      assert.ok(submit, 'email sign-in button is rendered')
      await React.act(async () => submit.props.onPress())
      assert.equal(mocks.signInCalls, 1, 'submits credentials before profile hydration')
    } else {
      const provider = method === 'google' ? 'Google' : 'Apple'
      await React.act(async () => button(tree, `Continue with ${provider}`).props.onPress())
    }

    assert.deepEqual(mocks.routes, [], `${method} sign-in waits for profile hydration`)
    assert.equal(mocks.dismisses, 0)
    assert.deepEqual(mocks.stack, ['/welcome', '/sign-in'])

    await React.act(async () => {
      mocks.appState.isAuthenticated = true
      tree.update(React.createElement(SignIn))
    })
    assert.deepEqual(mocks.routes, ['/'])
    assert.equal(mocks.dismisses, 1, 'clears routes before entering the authenticated index')
    assert.deepEqual(mocks.stack, ['/'], `Android Back cannot reveal sign-in after ${method} auth`)
    await unmount(tree)
  }

  const { StackRouter, StackActions } = requireFromProject(
    'expo-router/build/react-navigation/routers/StackRouter',
  )
  const stackRouter = StackRouter({})
  const stackOptions = { routeParamList: {}, routeGetIdList: {} }
  const hydratedProfiles = [
    {
      name: 'Amodka User',
      bodyType: 'hourglass',
      eyeColor: 'brown',
      skinTone: 'medium',
      undertone: 'warm',
      styleGoalPrimary: 'classic',
      onboardingComplete: true,
      expectedRoute: '/(tabs)',
      expectedStackRoute: '(tabs)',
    },
    {
      name: 'Amodka User',
      bodyType: 'hourglass',
      eyeColor: 'brown',
      skinTone: 'medium',
      undertone: 'warm',
      styleGoalPrimary: null,
      onboardingComplete: true,
      expectedRoute: '/onboarding',
      expectedStackRoute: 'onboarding',
    },
    {
      name: 'Amodka User',
      bodyType: 'hourglass',
      eyeColor: 'brown',
      skinTone: 'medium',
      undertone: 'warm',
      styleGoalPrimary: 'classic',
      onboardingComplete: false,
      expectedRoute: '/onboarding',
      expectedStackRoute: 'onboarding',
    },
    {
      name: '',
      bodyType: null,
      eyeColor: null,
      skinTone: null,
      undertone: null,
      styleGoalPrimary: null,
      onboardingComplete: false,
      expectedRoute: '/onboarding',
      expectedStackRoute: 'onboarding',
    },
  ]

  for (const profile of hydratedProfiles) {
    reset()
    mocks.platformOS = 'android'
    mocks.stack = ['/welcome', '/sign-in']
    const SignIn = await signInScreen()
    const signInTree = await mount(SignIn)
    const [email, password] = signInTree.root.findAllByType('TextInput')
    await React.act(async () => {
      email.props.onChangeText('user@example.com')
      password.props.onChangeText('ValidPass1')
    })
    const submit = signInTree.root.findAllByType('TouchableOpacity')
      .filter(node => words(node).trim() === 'Sign in')
      .pop()
    assert.ok(submit, 'email sign-in button is rendered')
    await React.act(async () => submit.props.onPress())
    await React.act(async () => {
      mocks.appState = {
        ...mocks.appState,
        isAuthenticated: true,
        appReady: true,
        profile,
      }
      signInTree.update(React.createElement(SignIn))
    })
    assert.deepEqual(mocks.stack, ['/'], 'sign-in history is cleared after profile hydration')
    assert.equal(mocks.dismisses, 1)

    const indexTree = await mount(Index)
    assert.deepEqual(
      mocks.routes,
      ['/', profile.expectedRoute],
      `hydrated profile navigates to ${profile.expectedRoute}`,
    )
    assert.deepEqual(
      mocks.stack,
      [profile.expectedRoute],
      `Android Back cannot restore sign-in from ${profile.expectedRoute}`,
    )

    let backState = stackRouter.getInitialState({
      routeNames: ['welcome', 'sign-in', 'index', '(tabs)', 'onboarding'],
      routeParamList: {},
    })
    backState = stackRouter.getStateForAction(
      backState,
      StackActions.push('sign-in'),
      stackOptions,
    )
    backState = stackRouter.getStateForAction(
      backState,
      StackActions.popToTop(),
      stackOptions,
    )
    backState = stackRouter.getStateForAction(
      backState,
      StackActions.replace('index'),
      stackOptions,
    )
    backState = stackRouter.getStateForAction(
      backState,
      StackActions.replace(profile.expectedStackRoute),
      stackOptions,
    )
    assert.deepEqual(
      backState.routes.map((route: { name: string }) => route.name),
      [profile.expectedStackRoute],
      'profile-based destination is the only route left in the Android stack',
    )
    assert.equal(
      stackRouter.getStateForAction(backState, { type: 'GO_BACK' }, stackOptions),
      null,
      'Android Back has no sign-in route to reveal',
    )
    await unmount(indexTree)
    await unmount(signInTree)
  }

  for (const method of ['google', 'apple'] as const) {
    reset()
    mocks.platformOS = 'android'
    mocks.stack = ['/welcome', '/sign-in']
    const SignIn = await signInScreen()
    const signInTree = await mount(SignIn)
    const provider = method === 'google' ? 'Google' : 'Apple'
    await React.act(async () => button(signInTree, `Continue with ${provider}`).props.onPress())
    await React.act(async () => {
      mocks.appState = {
        ...mocks.appState,
        isAuthenticated: true,
        appReady: true,
        profile: {
          name: '',
          bodyType: null,
          eyeColor: null,
          skinTone: null,
          undertone: null,
          styleGoalPrimary: null,
          onboardingComplete: false,
        },
      }
      signInTree.update(React.createElement(SignIn))
    })
    assert.deepEqual(mocks.stack, ['/'], `${provider} sign-in clears Android sign-in history`)

    const indexTree = await mount(Index)
    assert.deepEqual(
      mocks.routes,
      ['/', '/onboarding'],
      `${provider} sign-in with an incomplete hydrated profile reaches onboarding`,
    )
    assert.deepEqual(
      mocks.stack,
      ['/onboarding'],
      `Android Back cannot restore sign-in after ${provider} routes to onboarding`,
    )

    let backState = stackRouter.getInitialState({
      routeNames: ['welcome', 'sign-in', 'index', '(tabs)', 'onboarding'],
      routeParamList: {},
    })
    backState = stackRouter.getStateForAction(backState, StackActions.push('sign-in'), stackOptions)
    backState = stackRouter.getStateForAction(backState, StackActions.popToTop(), stackOptions)
    backState = stackRouter.getStateForAction(backState, StackActions.replace('index'), stackOptions)
    backState = stackRouter.getStateForAction(backState, StackActions.replace('onboarding'), stackOptions)
    assert.deepEqual(
      backState.routes.map((route: { name: string }) => route.name),
      ['onboarding'],
      `${provider} onboarding is the only route left in the Android stack`,
    )
    assert.equal(
      stackRouter.getStateForAction(backState, { type: 'GO_BACK' }, stackOptions),
      null,
      `Android Back has no sign-in route to reveal after ${provider} sign-in`,
    )
    await unmount(indexTree)
    await unmount(signInTree)
  }

  for (const method of ['google', 'apple'] as const) {
    reset()
    mocks.platformOS = 'android'
    mocks.stack = ['/welcome', '/sign-in']
    const SignIn = await signInScreen()
    const signInTree = await mount(SignIn)
    const provider = method === 'google' ? 'Google' : 'Apple'
    await React.act(async () => button(signInTree, `Continue with ${provider}`).props.onPress())
    await React.act(async () => {
      mocks.appState = {
        ...mocks.appState,
        isAuthenticated: true,
        appReady: true,
        profile: {
          name: 'Amodka User',
          bodyType: 'hourglass',
          eyeColor: 'brown',
          skinTone: 'medium',
          undertone: 'warm',
          styleGoalPrimary: 'classic',
          onboardingComplete: true,
        },
      }
      signInTree.update(React.createElement(SignIn))
    })
    assert.deepEqual(mocks.stack, ['/'], `${provider} sign-in clears Android sign-in history`)

    const indexTree = await mount(Index)
    assert.deepEqual(
      mocks.routes,
      ['/', '/(tabs)'],
      `${provider} sign-in with a complete hydrated profile reaches the wardrobe`,
    )
    assert.deepEqual(
      mocks.stack,
      ['/(tabs)'],
      `Android Back cannot restore sign-in after ${provider} routes to the wardrobe`,
    )

    let backState = stackRouter.getInitialState({
      routeNames: ['welcome', 'sign-in', 'index', '(tabs)', 'onboarding'],
      routeParamList: {},
    })
    backState = stackRouter.getStateForAction(backState, StackActions.push('sign-in'), stackOptions)
    backState = stackRouter.getStateForAction(backState, StackActions.popToTop(), stackOptions)
    backState = stackRouter.getStateForAction(backState, StackActions.replace('index'), stackOptions)
    backState = stackRouter.getStateForAction(backState, StackActions.replace('(tabs)'), stackOptions)
    assert.deepEqual(
      backState.routes.map((route: { name: string }) => route.name),
      ['(tabs)'],
      `${provider} wardrobe is the only route left in the Android stack`,
    )
    assert.equal(
      stackRouter.getStateForAction(backState, { type: 'GO_BACK' }, stackOptions),
      null,
      `Android Back has no sign-in route to reveal after ${provider} sign-in`,
    )
    await unmount(indexTree)
    await unmount(signInTree)
  }

  console.log('AUTH-2 mounted confirmation, recovery, and sign-in navigation UI: all states passed')
}

void main().catch(error => { console.error(error); process.exitCode = 1 })