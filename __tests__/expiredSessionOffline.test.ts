import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { build, type Plugin } from 'esbuild';
import { virtualMockModule } from './helpers/virtualMockModule';

const appContextSource = readFileSync('contexts/AppContext.tsx', 'utf8');
const mockNames = new Map<string, string>();
for (const match of appContextSource.matchAll(/\bimport\s+(?:type\s+)?\{([\s\S]*?)\}\s+from/g)) {
  for (const entry of match[1].split(',')) {
    const tokens = entry.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
    if (tokens[0]) mockNames.set(tokens[1] ?? tokens[0], tokens[0]);
  }
}
for (const match of appContextSource.matchAll(/\b(?:FileSystem|Crypto)\.([A-Za-z_$][\w$]*)/g)) {
  mockNames.set(match[1], match[1]);
}

const testMocks: Record<string, any> = {
  defaultProfile: {
    isGuest: false,
    weatherEnabled: false,
    constraints: {},
    name: '',
    onboardingComplete: true,
  },
  BLUEPRINT_SUBTYPES_BY_CATEGORY: {},
  INITIAL_ROTATION_STATE: {},
  AsyncStorage: {
    getItem: async () => null,
    setItem: async () => {},
    multiRemove: async () => {},
  },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Crypto: { randomUUID: () => 'test-id' },
  documentDirectory: null,
  getInfoAsync: async () => ({ exists: false }),
  deleteAsync: async () => {},
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            expires_at: 0,
            user: { id: 'offline-user', user_metadata: {} },
          },
        },
        error: null,
      }),
      refreshSession: async () => ({
        data: { session: null },
        error: new Error('temporary network failure'),
      }),
      onAuthStateChange: (callback: (event: string, session: unknown) => unknown) => {
        testMocks.authCallback = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
  authCallback: null,
  guestWardrobeSync: {
    list: async () => [],
    getDecision: async () => null,
    decide: async () => 'discard',
    discardOwner: async () => [],
    completeDecision: async () => {},
  },
  getUserProfile: async () => null,
  getWardrobeItems: async () => ({ items: [], totalCount: 0 }),
  getFreeWardrobeSelection: async () => [],
  getSlotStatuses: async () => [],
  getWearLogs: async () => [],
  getRotationCursors: async () => [],
  getAffinitySignals: async () => [],
  getPairAffinitySignals: async () => [],
  getWardrobePhotoCleanupReceipts: async () => [],
  getSelectedWardrobeItems: async () => [],
  getSavedLooks: async () => [],
  fetchAuthoritativeEntitlement: async () => ({ isPremium: false }),
  hydrateAccountProfile: (_profile: unknown, name: string) => ({
    ...testMocks.defaultProfile,
    name: name ?? '',
  }),
  mergeProfile: (profile: Record<string, unknown>) => ({ ...testMocks.defaultProfile, ...profile }),
  initializeSlots: () => [],
  getProfileBlueprint: () => ({}),
  getFirstNeededByCategory: () => ({}),
  getLifestyleGatedSlots: () => [],
  getCachedWeather: async () => null,
  loadWeather: async () => null,
  clearCachedWeather: () => {},
  parsePendingPhotoCleanups: () => [],
  retryPhotoCleanups: async () => [],
  getReclaimableGuestPhotoSources: () => [],
  getActiveManagedPhotoReferences: () => new Set(),
  isStoragePath: () => false,
  detectNoPhotoOrphans: () => [],
  subscribeToManagedPhotoReferenceRelease: () => () => {},
  shouldClaimStartupHydration: () => true,
  isCurrentStartupGeneration: () => true,
  canCommitStartupHydration: () => true,
  computeAffinity: () => ({}),
  topAffinityItems: () => [],
  topAffinityPairs: () => [],
  MIN_SIGNALS_TO_APPLY: 5,
  generateOutfitPool: () => [],
  applyDailyRotation: () => [],
  computePoolHash: () => '',
  todayString: () => '2026-10-22',
  reportError: () => {},
};
for (const name of mockNames.keys()) {
  if (!(name in testMocks)) testMocks[name] = () => Promise.resolve(undefined);
}

const mockModule = `
  const m = globalThis.__expiredSessionOfflineMocks;
  ${[...new Set(mockNames.values())].map(imported => {
    const local = [...mockNames].find(([, sourceName]) => sourceName === imported)?.[0] ?? imported;
    return `export const ${imported} = m.${local} ?? m.${imported} ?? (() => Promise.resolve(undefined));`;
  }).join('\n')}
  export default m.AsyncStorage;
`;
Object.assign(globalThis, {
  __expiredSessionOfflineMocks: testMocks,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const mountedPlugin: Plugin = {
  name: 'expired-session-mounted-provider',
  setup(bundle) {
    bundle.onResolve({ filter: /.*/ }, args => {
      if (args.kind === 'entry-point') return undefined;
      if (args.path === 'react' || args.path === 'react/jsx-runtime') return { path: args.path, external: true };
      return { path: args.path, namespace: 'expired-session-mock' };
    });
    bundle.onLoad({ filter: /.*/, namespace: 'expired-session-mock' }, () =>
      virtualMockModule(mockModule));
  },
};

async function verifyOfflineRefreshKeepsAuthUntilConfirmedSignOut() {
  const built = await build({
    entryPoints: [path.join(process.cwd(), 'contexts/AppContext.tsx')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    plugins: [mountedPlugin],
  });
  const module = { exports: {} as { AppProvider?: React.ComponentType<{ children: React.ReactNode }>; useApp?: () => any } };
  const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'));
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    requireFromProject, module, module.exports);
  assert.ok(module.exports.AppProvider, 'actual AppContext provider is bundled');

  const renderer = requireFromProject('react-test-renderer') as {
    create: (element: React.ReactElement) => {
      unmount: () => void;
    };
  };
  let current: any;
  function ObserveSession() {
    current = module.exports.useApp!();
    return null;
  }

  let tree!: ReturnType<typeof renderer.create>;
  await React.act(async () => {
    tree = renderer.create(React.createElement(
      module.exports.AppProvider!,
      null,
      React.createElement(ObserveSession),
    ));
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  assert.equal(current.isAuthenticated, true, 'startup restores the existing authenticated session');
  assert.equal(current.authenticatedUserId, 'offline-user');
  assert.equal(current.authSessionEnded, false);

  const { StackRouter, StackActions } = requireFromProject(
    'expo-router/build/react-navigation/routers/StackRouter',
  );
  const router = StackRouter({});
  const options = { routeParamList: {}, routeGetIdList: {} };
  let routeState = router.getInitialState({ routeNames: ['(tabs)', 'item-detail', 'sign-in'], routeParamList: {} });
  routeState = router.getStateForAction(routeState, StackActions.push('(tabs)'), options);
  routeState = router.getStateForAction(routeState, StackActions.push('item-detail'), options) ?? routeState;
  const privateRoutesBeforeRefresh = routeState.routes.map((route: any) => route.name);

  await React.act(async () => {
    await testMocks.authCallback('TOKEN_REFRESHED', {
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'different-user', user_metadata: {} },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  assert.equal(current.isAuthenticated, true, 'a refresh for another account cannot replace the active session');
  assert.equal(current.authenticatedUserId, 'offline-user', 'the active account remains unchanged');
  assert.equal(current.authSessionEnded, false, 'another account refresh does not end the active session');
  assert.deepEqual(
    routeState.routes.map((route: any) => route.name),
    privateRoutesBeforeRefresh,
    'private navigation history remains intact after a refresh for another account',
  );

  const failedRefresh = await testMocks.supabase.auth.refreshSession();
  assert.match(failedRefresh.error.message, /temporary network failure/);
  assert.equal(current.isAuthenticated, true, 'a transient refresh failure preserves authentication');
  assert.equal(current.authenticatedUserId, 'offline-user');
  assert.equal(current.authSessionEnded, false, 'network failure is not treated as confirmed sign-out');
  assert.deepEqual(
    routeState.routes.map((route: any) => route.name),
    privateRoutesBeforeRefresh,
    'private navigation history remains intact while offline',
  );

  await React.act(async () => {
    await testMocks.authCallback('TOKEN_REFRESHED', {
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'offline-user', user_metadata: {} },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  assert.equal(current.isAuthenticated, true, 'a successful token refresh keeps authentication');
  assert.equal(current.authenticatedUserId, 'offline-user');
  assert.equal(current.authSessionEnded, false, 'a successful token refresh does not end the session');
  assert.deepEqual(
    routeState.routes.map((route: any) => route.name),
    privateRoutesBeforeRefresh,
    'private navigation history remains intact after connectivity recovers',
  );

  await React.act(async () => {
    await testMocks.authCallback('SIGNED_OUT', null);
  });
  assert.equal(current.isAuthenticated, false, 'confirmed sign-out clears authenticated state');
  assert.equal(current.authenticatedUserId, null);
  assert.equal(current.authSessionEnded, true, 'confirmed sign-out is published for navigation reset');

  routeState = router.getStateForAction(routeState, StackActions.popToTop(), options);
  routeState = router.getStateForAction(routeState, StackActions.replace('sign-in'), options);
  assert.deepEqual(
    routeState.routes.map((route: any) => route.name),
    ['sign-in'],
    'confirmed sign-out leaves sign-in as the only route',
  );

  await React.act(async () => {
    await testMocks.authCallback('TOKEN_REFRESHED', {
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'offline-user', user_metadata: {} },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  assert.equal(current.isAuthenticated, false, 'a delayed token refresh cannot restore authentication after sign-out');
  assert.equal(current.authenticatedUserId, null, 'the signed-out user remains cleared after a delayed refresh');
  assert.equal(current.authSessionEnded, true, 'a delayed token refresh cannot clear the ended-session signal');
  assert.deepEqual(
    routeState.routes.map((route: any) => route.name),
    ['sign-in'],
    'a delayed token refresh cannot restore private navigation history',
  );
  await React.act(async () => tree.unmount());
}

void verifyOfflineRefreshKeepsAuthUntilConfirmedSignOut().then(() => {
  console.log('Offline refresh recovery preserves auth, ignores another account, and rejects delayed refreshes after sign-out.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
