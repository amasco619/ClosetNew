import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { build, type Plugin } from 'esbuild';
import { virtualMockModule } from './helpers/virtualMockModule';

const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
const appContext = readFileSync('contexts/AppContext.tsx', 'utf8');
const layout = readFileSync('app/_layout.tsx', 'utf8');
const normalSignOut = profile.match(/const handleSignOut = async \(\) => \{([\s\S]*?)\n  \};/)?.[1];
assert.ok(normalSignOut, 'normal profile sign-out handler exists');
assert.match(
  normalSignOut,
  /try \{\s*await signOut\(\);\s*router\.dismissAll\(\);\s*router\.replace\('\/sign-in'\);\s*\} catch/,
  'normal sign-out clears the old tab stack only after sign-out succeeds',
);
assert.match(
  profile,
  /\/\/ Deletion is confirmed; never leave deleted-account screens in the navigation history\.\s*router\.dismissAll\(\);\s*router\.replace\('\/sign-in'\);/,
  'confirmed deletion clears the stale tab stack even if local sign-out fails',
);
assert.match(
  appContext,
  /if \(event === 'SIGNED_OUT'\) \{\s*setAuthSessionEnded\(true\);/,
  'a confirmed Supabase sign-out records that the auth session ended',
);
const deletedAccountCleanup = appContext.match(
  /const clearDeletedAccountLocalData = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/,
)?.[1];
assert.ok(deletedAccountCleanup, 'deleted-account local cleanup exists');
assert.match(
  deletedAccountCleanup,
  /setAuthSessionEnded\(true\);[\s\S]*?setProfile\(defaultProfile\);[\s\S]*?setWardrobeItems\(\[\]\);[\s\S]*?let journalCleared = true;/,
  'confirmed deletion ends the app session and clears in-memory account data before asynchronous device cleanup',
);
assert.match(
  appContext,
  /if \(event === 'SIGNED_IN' && session\?\.user\) \{\s*setAuthSessionEnded\(false\);/,
  'a new authenticated session clears the prior ended-session signal',
);
assert.match(
  layout,
  /if \(!authSessionEnded\) return;[\s\S]*?router\.dismissAll\(\);\s*router\.replace\("\/sign-in"\);/,
  'an ended auth session resets navigation to sign-in',
);
assert.match(
  appContext,
  /const \{ data: \{ session: initSession \}, error: sessionError \} = await supabase\.auth\.getSession\(\);[\s\S]*?if \(sessionError\) throw sessionError;/,
  'a failed session read remains a startup error rather than being treated as sign-out',
);

const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'));
const { StackRouter, StackActions } = requireFromProject(
  'expo-router/build/react-navigation/routers/StackRouter',
);
const { TabRouter, TabActions } = requireFromProject(
  'expo-router/build/react-navigation/routers/TabRouter',
);
const stack = StackRouter({});
const tabs = TabRouter({});
const stackOptions = { routeParamList: {}, routeGetIdList: {} };
const tabOptions = { routeParamList: {}, routeGetIdList: {} };

let tabsState = tabs.getInitialState({
  routeNames: ['home', 'wardrobe', 'profile'],
  routeParamList: {},
});
tabsState = tabs.getStateForAction(
  tabsState,
  TabActions.jumpTo('profile'),
  tabOptions,
);

let state = stack.getInitialState({
  routeNames: ['(tabs)', 'sign-in'],
  routeParamList: {},
});
state = {
  ...state,
  routes: state.routes.map((route: any) =>
    route.name === '(tabs)' ? { ...route, state: tabsState } : route,
  ),
};
state = stack.getStateForAction(state, StackActions.push('sign-in'), stackOptions);

assert.equal(state.routes.length, 2, 'the stale tabs route is beneath sign-in before reset');
assert.equal(state.routes[0].state.routes[state.routes[0].state.index].name, 'profile');
assert.equal(state.routes[state.index].name, 'sign-in');

// Exercise Expo Router's actual React Navigation reducers with the actions used by the
// account-deletion handler: dismissAll is POP_TO_TOP, followed by replace('/sign-in').
state = stack.getStateForAction(state, StackActions.popToTop(), stackOptions);
state = stack.getStateForAction(state, StackActions.replace('sign-in'), stackOptions);

assert.deepEqual(
  state.routes.map((route: any) => route.name),
  ['sign-in'],
  'the reset leaves sign-in as the only route',
);
assert.equal(state.index, 0, 'sign-in is the active route');
assert.equal(
  stack.getStateForAction(state, { type: 'GO_BACK' }, stackOptions),
  null,
  'Android Back has no previous app route to reveal',
);

console.log('Account deletion navigation removes stale tabs and leaves no route for Back.');

const mountedMocks: any = {
  alerts: [] as Array<{ title: string; buttons: Array<{ text: string; onPress?: () => unknown }> }>,
  notifications: [] as Array<{ title: string; message: string }>,
  navigation: [] as string[],
  dismissAllCalls: 0,
  signOutCalls: 0,
  deleteRequests: [] as Array<{ method: string; path: string; body: unknown }>,
  localCleanupCalls: 0,
  localCleanupResult: true,
  signOutFails: true,
  appState: null as any,
};
Object.assign(globalThis, { __accountDeletionMountedMocks: mountedMocks, IS_REACT_ACT_ENVIRONMENT: true });

const mountedModules: Record<string, string> = {
  'react-native': `
    import React from 'react';
    const host = name => ({ children, ...props }) => React.createElement(name, props, children);
    export const ActivityIndicator = host('ActivityIndicator');
    export const Pressable = host('Pressable');
    export const ScrollView = host('ScrollView');
    export const StyleSheet = { create: styles => styles };
    export const Switch = host('Switch');
    export const Text = host('Text');
    export const TextInput = host('TextInput');
    export const View = host('View');
    export const Platform = { OS: 'web' };
  `,
  'react-native-safe-area-context': `export const useSafeAreaInsets = () => ({ top: 0, bottom: 0 });`,
  '@expo/vector-icons': `export const Ionicons = () => null; export const MaterialCommunityIcons = () => null;`,
  'expo-router': `
    const m = globalThis.__accountDeletionMountedMocks;
    export const router = {
      dismissAll: () => { m.dismissAllCalls++; },
      replace: path => { m.navigation.push(path); },
      push: path => { m.navigation.push(path); },
    };
  `,
  'expo-constants': `export default { expoConfig: { version: '1.0.0' } };`,
  'expo-haptics': `export const selectionAsync = async () => {};`,
  'react-native-reanimated': `
    import React from 'react';
    const Animated = { View: props => React.createElement('AnimatedView', props) };
    export default Animated;
    export const FadeInDown = { delay: () => ({ duration: () => null }) };
    export const useReducedMotion = () => true;
  `,
  '@/constants/colors': `export default new Proxy({}, { get: () => '#000000' });`,
  '@/contexts/AppContext': `
    const m = globalThis.__accountDeletionMountedMocks;
    export const useApp = () => m.appState;
  `,
  '@/lib/auth': `
    const m = globalThis.__accountDeletionMountedMocks;
    export const signOut = async () => {
      m.signOutCalls++;
      if (m.signOutFails) throw new Error('local sign-out failed');
    };
  `,
  '@/lib/query-client': `
    const m = globalThis.__accountDeletionMountedMocks;
    export const authenticatedApiRequest = async (method, path, body) => {
      m.deleteRequests.push({ method, path, body });
      return { json: async () => ({ success: true }) };
    };
  `,
  '@/lib/supabase': `export const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }) } };`,
  '@/constants/accountDeletionCleanup': `
    export const deleteAccountThenClearLocalData = async (deleteAccount, clearLocalData) => {
      await deleteAccount();
      try { return await clearLocalData(); } catch { return false; }
    };
    export const getAccountDeletionFailure = error => ({ title: 'Account deletion failed', message: String(error) });
  `,
  '@/constants/weather': `
    export const defaultTempUnit = () => 'C';
    export const formatTemp = value => String(value);
    export const formatTempValue = value => String(value);
  `,
  '@/components/AmodkaErrorState': `export const AmodkaErrorState = () => null;`,
  '@/contexts/LuxuryFeedbackContext': `
    const m = globalThis.__accountDeletionMountedMocks;
    export const useDialog = () => ({
      alert: (title, _message, buttons) => { m.alerts.push({ title, buttons }); },
      notify: notice => { m.notifications.push(notice); },
    });
  `,
  '@/components/AiProcessingConsent': `export const AiProcessingConsent = () => null;`,
  '@/lib/useAiProcessingPreference': `
    export const useAiProcessingPreference = () => ({
      preference: null, loading: false, saving: false, error: null, unavailable: false,
      showConsent: false, refresh: async () => {}, toggle: async () => {},
      allow: async () => {}, dismiss: () => {},
    });
  `,
  '@/lib/profilePresentation': `
    export const getAiProcessingDisplay = () => ({ value: false, caption: null });
    export const getPersonalIntelligenceSubtitle = () => '';
    export const getPlanPillLabel = () => 'Free';
    export const getProfileStyleDna = () => [];
    export const getRefinementCounts = () => ({});
    export const getRefinementSummary = () => '';
    export const shouldShowBeginWardrobe = () => false;
  `,
};

const mountedPlugin: Plugin = {
  name: 'account-deletion-mounted-boundaries',
  setup(bundle) {
    bundle.onResolve({ filter: /.*/ }, args => Object.hasOwn(mountedModules, args.path)
      ? { path: args.path, namespace: 'account-deletion-mock' }
      : undefined);
    bundle.onLoad({ filter: /.*/, namespace: 'account-deletion-mock' }, args =>
      virtualMockModule(mountedModules[args.path]));
  },
};

async function verifyDeletionNavigationInMountedProfile() {
  mountedMocks.alerts = [];
  mountedMocks.notifications = [];
  mountedMocks.navigation = [];
  mountedMocks.dismissAllCalls = 0;

  const built = await build({
    entryPoints: [path.join(process.cwd(), 'app/(tabs)/profile.tsx')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
    plugins: [mountedPlugin],
  });
  const module = { exports: {} as { default?: React.ComponentType } };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    requireFromProject, module, module.exports);
  assert.ok(module.exports.default, 'Profile screen loaded');

  const renderer = requireFromProject('react-test-renderer') as {
    create: (element: React.ReactElement) => {
      root: { findAllByType: (type: string) => Array<{ props: Record<string, any>; children: any[] }> };
      unmount: () => void;
    };
  };
  const words = (node: any): string => typeof node === 'string'
    ? node
    : (node.children ?? []).map(words).join('');
  const warning = {
    title: 'Account deleted — device cleanup incomplete',
    message: 'Your account was deleted, but this device could not fully clear its local data or session. Clear this app’s data before anyone else uses this device.',
  };

  for (const scenario of [
    {
      label: 'successful deletion and sign-out',
      cleanupResult: true,
      signOutFails: false,
      navigates: true,
      showsWarning: false,
    },
    {
      label: 'sign-out failure',
      cleanupResult: true,
      signOutFails: true,
      navigates: true,
      showsWarning: true,
    },
    {
      label: 'incomplete local cleanup',
      cleanupResult: false,
      signOutFails: false,
      navigates: true,
      showsWarning: true,
    },
  ]) {
    mountedMocks.alerts = [];
    mountedMocks.notifications = [];
    mountedMocks.navigation = [];
    mountedMocks.dismissAllCalls = 0;
    mountedMocks.signOutCalls = 0;
    mountedMocks.deleteRequests = [];
    mountedMocks.localCleanupCalls = 0;
    mountedMocks.localCleanupResult = scenario.cleanupResult;
    mountedMocks.signOutFails = scenario.signOutFails;

    const wardrobeItems: unknown[] = [];
    const wearHistory: unknown[] = [];
    mountedMocks.appState = {
      profile: { name: 'Test User', tempUnit: 'C', weatherEnabled: true },
      updateProfile: () => {},
      wardrobeItems,
      wardrobeTotalCount: 0,
      loadAllWardrobeItems: async () => {},
      isPremium: false,
      isGuest: false,
      authenticatedUserId: 'user-1',
      isLoading: false,
      wearHistory,
      affinityActive: false,
      affinitySignalCount: 0,
      weather: null,
      setWeatherEnabled: () => {},
      dataUnavailable: false,
      entitlementUnavailable: false,
      retryInitialization: () => {},
      clearDeletedAccountLocalData: async () => {
        mountedMocks.localCleanupCalls++;
        mountedMocks.appState.authSessionEnded = true;
        mountedMocks.appState.profile = { name: '' };
        mountedMocks.appState.wardrobeItems = [];
        return mountedMocks.localCleanupResult;
      },
    };

    let tree!: ReturnType<typeof renderer.create>;
    await React.act(async () => { tree = renderer.create(React.createElement(module.exports.default!)); });
    const deleteButton = tree.root.findAllByType('Pressable')
      .find(node => words(node).includes('Delete account'));
    assert.ok(deleteButton, 'mounted Profile displays the account deletion action');
    await React.act(async () => { deleteButton.props.onPress(); });
    assert.equal(mountedMocks.alerts.at(-1)?.title, 'Delete account', 'deletion confirmation is shown');
    const confirmDelete = mountedMocks.alerts.at(-1)?.buttons.find(
      (button: { text: string; onPress?: () => unknown }) => button.text === 'Delete',
    );
    assert.ok(confirmDelete?.onPress, 'confirmation includes the Delete action');
    await React.act(async () => { await confirmDelete.onPress?.(); });

    assert.deepEqual(mountedMocks.deleteRequests, [{
      method: 'DELETE',
      path: '/api/user/delete-account',
      body: { userId: 'user-1' },
    }], `${scenario.label}: server account deletion was confirmed successfully`);
    assert.equal(mountedMocks.localCleanupCalls, 1, `${scenario.label}: local account cleanup ran once`);
    assert.equal(mountedMocks.signOutCalls, 1, `${scenario.label}: local Supabase sign-out was attempted once`);
    assert.equal(mountedMocks.appState.authSessionEnded, true,
      `${scenario.label}: deleted account is marked ended independently of sign-out`);
    assert.deepEqual(mountedMocks.appState.profile, { name: '' },
      `${scenario.label}: cached profile data is inaccessible`);
    assert.deepEqual(mountedMocks.appState.wardrobeItems, [],
      `${scenario.label}: cached wardrobe data is inaccessible`);
    assert.deepEqual(
      mountedMocks.notifications,
      scenario.showsWarning ? [warning] : [],
      `${scenario.label}: device-cleanup warning state is correct`,
    );
    assert.equal(
      mountedMocks.dismissAllCalls,
      scenario.navigates ? 1 : 0,
      `${scenario.label}: deleted-account routes are removed regardless of sign-out result`,
    );
    assert.deepEqual(
      mountedMocks.navigation,
      scenario.navigates ? ['/sign-in'] : [],
      `${scenario.label}: sign-in replaces the deleted account screen`,
    );
    await React.act(async () => tree.unmount());
  }
}

void verifyDeletionNavigationInMountedProfile().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
