import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { build, type Plugin } from 'esbuild';
import { virtualMockModule } from './helpers/virtualMockModule';

const mocks = {
  params: {} as { guest?: string },
  routes: [] as string[],
  backCalls: 0,
  app: {
    isAuthenticated: false,
    profile: {
      name: '',
      bodyType: null,
      faceShape: null,
      eyeColor: null,
      skinTone: null,
      undertone: null,
      styleGoalPrimary: null,
      styleGoalSecondary: null,
      hairColor: null,
      heightBand: null,
      contrastLevel: null,
      defaultMood: null,
      industry: 'unspecified',
      lifePhase: null,
      metalPreference: null,
      constraints: { colorAversions: [] },
      lifestyleWork: 40,
      lifestyleCasual: 40,
      lifestyleEvents: 20,
      lifestyleActive: 0,
      lifestyleBrunch: 0,
      isGuest: false,
    },
    updateProfile: () => {},
  },
};

Object.assign(globalThis, {
  __onboardingNavigationMocks: mocks,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const modules: Record<string, string> = {
  'react-native': `
    import React from 'react'
    const host = name => ({ children, ...props }) => React.createElement(name, props, children)
    export const View = host('View')
    export const Text = host('Text')
    export const Pressable = host('Pressable')
    export const TextInput = host('TextInput')
    export const ScrollView = host('ScrollView')
    export const Dimensions = { get: () => ({ width: 390, height: 844 }) }
    export const Platform = { OS: 'ios' }
    export const StyleSheet = { create: styles => styles, absoluteFill: {} }
  `,
  'expo-router': `
    const m = globalThis.__onboardingNavigationMocks
    export const router = {
      replace: route => m.routes.push(route),
      back: () => { m.backCalls++ },
    }
    export const useLocalSearchParams = () => m.params
  `,
  'expo-status-bar': `export const StatusBar = () => null`,
  'react-native-svg': `
    import React from 'react'
    const host = name => ({ children, ...props }) => React.createElement(name, props, children)
    export default host('Svg')
    export const Circle = host('Circle')
    export const Path = host('Path')
    export const Line = host('Line')
    export const Ellipse = host('Ellipse')
    export const Rect = host('Rect')
  `,
  'react-native-safe-area-context': `export const useSafeAreaInsets = () => ({ top: 10, bottom: 10, left: 0, right: 0 })`,
  '@expo/vector-icons': `export const Ionicons = () => null`,
  '@/contexts/AppContext': `
    const m = globalThis.__onboardingNavigationMocks
    export const useApp = () => m.app
  `,
  'expo-haptics': `
    export const impactAsync = async () => {}
    export const selectionAsync = async () => {}
    export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium' }
  `,
  'react-native-reanimated': `
    import React from 'react'
    const host = name => ({ children, ...props }) => React.createElement(name, props, children)
    const chain = { delay: () => chain, duration: () => chain }
    const Animated = { View: host('AnimatedView') }
    export default Animated
    export const FadeInDown = chain
    export const FadeInRight = chain
    export const FadeInUp = chain
    export const useSharedValue = value => ({ value })
    export const useAnimatedStyle = create => create()
    export const withRepeat = value => value
    export const withTiming = value => value
    export const withSpring = value => value
    export const Easing = { in: value => value, out: value => value, inOut: value => value, ease: 'ease', quad: 'quad' }
  `,
  '@/constants/lifestyle': `
    export const LIFESTYLE_OPTIONS = [{ value: 20, label: '20%' }]
    export const LIFESTYLE_SCENARIOS = [{ key: 'work', label: 'Work', desc: '' }]
  `,
  '../lib/responsive': `export const rs = value => value`,
  '@/constants/colors': `export default new Proxy({}, { get: (_, key) => String(key) })`,
  'expo-image': `
    import React from 'react'
    export const Image = ({ children, ...props }) => React.createElement('Image', props, children)
  `,
  'expo-linear-gradient': `
    import React from 'react'
    export const LinearGradient = ({ children, ...props }) => React.createElement('LinearGradient', props, children)
  `,
  'expo-blur': `
    import React from 'react'
    export const BlurView = ({ children, ...props }) => React.createElement('BlurView', props, children)
  `,
};

const boundaryMocks: Plugin = {
  name: 'onboarding-navigation-boundaries',
  setup(build) {
    build.onResolve({ filter: /.*/ }, args =>
      Object.hasOwn(modules, args.path)
        ? { path: args.path, namespace: 'onboarding-mock' }
        : undefined);
    build.onLoad({ filter: /.*/, namespace: 'onboarding-mock' }, args =>
      virtualMockModule(modules[args.path]));
    build.onResolve({ filter: /\.(jpg|png)$/ }, args => ({
      path: args.path,
      namespace: 'onboarding-asset',
    }));
    build.onLoad({ filter: /.*/, namespace: 'onboarding-asset' }, () => ({
      contents: 'export default "mock-image"',
      loader: 'js',
    }));
  },
};

const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'));
const renderer = requireFromProject('react-test-renderer') as {
  create: (element: React.ReactElement) => MountedTree;
};
type Node = {
  children: Array<Node | string>;
  props: Record<string, any>;
  findAllByType: (type: string) => Node[];
};
type MountedTree = { root: Node; unmount: () => void };

async function screen(filename: 'welcome.tsx' | 'onboarding.tsx') {
  const built = await build({
    entryPoints: [path.join(process.cwd(), 'app', filename)],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
    plugins: [boundaryMocks],
  });
  const mod: { exports: { default?: React.ComponentType } } = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    requireFromProject, mod, mod.exports);
  assert.ok(mod.exports.default, `loaded ${filename}`);
  return mod.exports.default;
}

function reset(params: typeof mocks.params = {}) {
  mocks.params = params;
  mocks.routes = [];
  mocks.backCalls = 0;
  mocks.app.profile = {
    name: '',
    bodyType: null,
    faceShape: null,
    eyeColor: null,
    skinTone: null,
    undertone: null,
    styleGoalPrimary: null,
    styleGoalSecondary: null,
    hairColor: null,
    heightBand: null,
    contrastLevel: null,
    defaultMood: null,
    industry: 'unspecified',
    lifePhase: null,
    metalPreference: null,
    constraints: { colorAversions: [] },
    lifestyleWork: 40,
    lifestyleCasual: 40,
    lifestyleEvents: 20,
    lifestyleActive: 0,
    lifestyleBrunch: 0,
    isGuest: false,
  };
}

async function mount(Component: React.ComponentType): Promise<MountedTree> {
  let tree!: MountedTree;
  await React.act(async () => { tree = renderer.create(React.createElement(Component)); });
  return tree;
}

async function unmount(tree: MountedTree) {
  await React.act(async () => tree.unmount());
}

function words(node: Node | string): string {
  return typeof node === 'string' ? node : node.children.map(words).join('');
}

function pressableWithText(tree: MountedTree, text: string): Node {
  const found = tree.root.findAllByType('Pressable').find(node => words(node).includes(text));
  assert.ok(found, `button "${text}" is rendered`);
  return found;
}

async function main() {
  const [Welcome, Onboarding] = await Promise.all([
    screen('welcome.tsx'),
    screen('onboarding.tsx'),
  ]);

  reset();
  const welcome = await mount(Welcome);
  await React.act(async () => pressableWithText(welcome, 'Get started').props.onPress());
  assert.deepEqual(mocks.routes, ['/onboarding?guest=true'], 'Get started replaces Welcome with onboarding');
  await unmount(welcome);

  mocks.params = { guest: 'true' };
  const onboarding = await mount(Onboarding);
  const backButton = onboarding.root.findAllByType('Pressable').find(node => node.props.hitSlop === 12);
  assert.ok(backButton, 'guest onboarding displays its back button');
  await React.act(async () => backButton.props.onPress());
  assert.deepEqual(mocks.routes, ['/onboarding?guest=true', '/welcome'], 'first-step back replaces to Welcome');
  assert.equal(mocks.backCalls, 0, 'first-step back does not require navigation history');
  await unmount(onboarding);

  reset();
  const signInWelcome = await mount(Welcome);
  await React.act(async () => pressableWithText(signInWelcome, 'I already have an account').props.onPress());
  assert.deepEqual(mocks.routes, ['/sign-in'], 'Welcome still routes existing users to sign-in');
  await unmount(signInWelcome);

  reset({ guest: 'true' });
  const laterStep = await mount(Onboarding);
  const nameInput = laterStep.root.findAllByType('TextInput')[0];
  await React.act(async () => nameInput.props.onChangeText('Ava'));
  await React.act(async () => pressableWithText(laterStep, 'Continue').props.onPress());
  assert.ok(laterStep.root.findAllByType('Text').some(node => words(node).includes('STEP 2 OF 9')));
  const laterBackButton = laterStep.root.findAllByType('Pressable').find(node => node.props.hitSlop === 12);
  assert.ok(laterBackButton);
  await React.act(async () => laterBackButton.props.onPress());
  assert.ok(laterStep.root.findAllByType('Text').some(node => words(node).includes('STEP 1 OF 9')));
  assert.deepEqual(mocks.routes, [], 'later-step back remains inside onboarding');
  assert.equal(mocks.backCalls, 0);
  await unmount(laterStep);

  reset();
  Object.assign(mocks.app.profile, {
    name: 'Ava',
    bodyType: 'pear',
  });
  const returningUser = await mount(Onboarding);
  assert.ok(returningUser.root.findAllByType('Text').some(node => words(node).includes('STEP 4 OF 9')));
  assert.ok(returningUser.root.findAllByType('Text').some(node => words(node).includes('Eye Colour')));
  for (let i = 0; i < 3; i++) {
    const backButton = returningUser.root.findAllByType('Pressable').find(node => node.props.hitSlop === 12);
    assert.ok(backButton);
    await React.act(async () => backButton.props.onPress());
  }
  assert.equal(returningUser.root.findAllByType('TextInput')[0].props.value, 'Ava', 'saved answers remain prefilled when navigating back');
  await unmount(returningUser);

  reset();
  Object.assign(mocks.app.profile, {
    name: 'Ava',
    bodyType: 'pear',
    eyeColor: 'blue',
    skinTone: 'light',
    undertone: 'cool',
    styleGoalPrimary: 'romantic',
  });
  const fullyAnswered = await mount(Onboarding);
  assert.ok(fullyAnswered.root.findAllByType('Text').some(node => words(node).includes('STEP 1 OF 9')));
  await unmount(fullyAnswered);

  console.log('Onboarding navigation: replaced-route return, Welcome choices, in-flow back, and resume step passed');
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
