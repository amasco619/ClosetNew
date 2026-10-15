import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { build, type Plugin } from 'esbuild';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const emptyArray: unknown[] = [];
const emptyObject = {};
const profile = { name: '', styleGoalPrimary: '', styleGoalSecondary: '', weatherEnabled: false };
const noop = () => {};
const getStylingRecommendations = async () => ({ outfits: [], notice: null });
const setFreeWardrobeSelection = async () => {};
const refreshPremiumEntitlement = async () => false;
const model = {
  wardrobeItems: [] as unknown[],
  wardrobeTotalCount: 1,
  wardrobeHasMore: true,
  authenticatedUserId: null as string | null,
  requests: [] as Deferred[],
  loadAllWardrobeItems: async () => {
    const request = model.requests.shift();
    assert.ok(request, 'each screen request is controlled by the mounted test');
    return request.promise;
  },
  push: () => {},
  back: () => {},
  state: () => ({
    profile,
    wardrobeItems: model.wardrobeItems,
    activeWardrobeItems: model.wardrobeItems,
    wardrobeTotalCount: model.wardrobeTotalCount,
    wardrobeHasMore: model.wardrobeHasMore,
    loadAllWardrobeItems: model.loadAllWardrobeItems,
    outfitSets: emptyArray,
    isPremium: false,
    isAuthenticated: false,
    authenticatedUserId: model.authenticatedUserId,
    canAddItem: false,
    lastAddedSuggestions: emptyArray,
    clearLastAddedSuggestions: noop,
    starterRecommendations: emptyObject,
    lifestyleSlotGroups: emptyArray,
    recommendationSlots: emptyObject,
    todaysWear: emptyArray,
    wearHistory: emptyArray,
    reactToOutfit: noop,
    getOutfitReaction: noop,
    logWear: noop,
    undoWear: noop,
    isWornToday: () => false,
    todayMood: null,
    setTodayMood: noop,
    weather: null,
    weatherLoading: false,
    isGuest: false,
    orphanedItems: emptyArray,
    resolveOrphan: noop,
    affinitySignalCount: 0,
    affinityActive: false,
    freeSelectedItemIds: emptyArray,
    setFreeWardrobeSelection,
    getItemWearCount: () => 0,
    profileCompleteness: 0,
    shouldShowProfileNudge: false,
    dismissProfileNudge: noop,
    missingDimensions: emptyArray,
    getStylingRecommendations,
    refreshPremiumEntitlement,
    entitlementUnavailable: false,
    appReady: true,
    isLoading: false,
    dataUnavailable: false,
    startupError: false,
    retryInitialization: noop,
  }),
};

Object.assign(globalThis, { __wardrobeRetryUi: model, IS_REACT_ACT_ENVIRONMENT: true });

const hostMocks: Record<string, string> = {
  'react-native': `
    import React from 'react';
    const host = name => ({children, ...props}) => React.createElement(name, props, children);
    export const View=host('View'), Text=host('Text'), ScrollView=host('ScrollView'),
      Pressable=host('Pressable'), Image=host('Image'), FlatList=host('FlatList'),
      Modal=host('Modal'), ActivityIndicator=host('ActivityIndicator');
    export const Platform={OS:'web'}, StyleSheet={create:styles=>styles},
      Alert={alert:()=>{}};
  `,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:0,bottom:0});`,
  '@expo/vector-icons': `export const Ionicons=()=>null, MaterialCommunityIcons=()=>null;`,
  'expo-router': `
    import React from 'react';
    export const router={push:globalThis.__wardrobeRetryUi.push,back:globalThis.__wardrobeRetryUi.back};
    export const useFocusEffect=()=>{};
  `,
  'expo-haptics': `export const selectionAsync=async()=>{},notificationAsync=async()=>{},impactAsync=async()=>{},
    NotificationFeedbackType={Warning:'warning',Success:'success'},ImpactFeedbackStyle={Light:'light'};`,
  'expo-status-bar': `export const StatusBar=()=>null;`,
  'expo-image': `import React from 'react';export const Image=props=>React.createElement('Image',props);`,
  '@react-native-async-storage/async-storage': `export default {getItem:async()=>null,removeItem:async()=>{}};`,
  'react-native-reanimated': `
    import React from 'react';
    const animation={delay:()=>animation,duration:()=>animation};
    export const FadeInDown=animation,FadeInUp=animation,FadeOutUp=animation;
    export default {View:({children,...props})=>React.createElement('View',props,children)};
  `,
  'react-native-view-shot': `export const captureRef=async()=>'';`,
  'expo-sharing': `export const isAvailableAsync=async()=>false,shareAsync=async()=>{};`,
  '@/contexts/AppContext': `export const useApp=()=>globalThis.__wardrobeRetryUi.state();`,
  '@/constants/colors': `export default new Proxy({}, {get:()=> '#555'});`,
  '@/constants/weather': `export const defaultTempUnit=()=>'C',formatTemp=()=>'',formatTempValue=()=>'';`,
  '@/constants/wardrobeBlueprint': `export const countRecommendedOutfits=()=>0;`,
  '@/lib/auth': `export const EMAIL_CONFIRMED_KEY='email-confirmed';`,
  '@/components/WardrobeGapCard': `export const WardrobeGapCard=()=>null;`,
  '@/lib/wardrobeGapDiagnosis': `export const diagnoseWeatherGap=()=>null;`,
  '@/components/OOTDStoryCard': `export default ()=>null;`,
  '../../components/OccasionPlanner': `export default ()=>null;`,
  '../../components/TravelPlanner': `export default ()=>null;`,
  '../components/OccasionPlanner': `export default ()=>null;`,
  '../components/TravelPlanner': `export default ()=>null;`,
  '@/lib/responsive': `export const rs=value=>value;`,
  '../../lib/responsive': `export const rs=value=>value;`,
  '../lib/responsive': `export const rs=value=>value;`,
  '@/constants/cpw': `export const computeItemCpw=()=>0,formatCpw=()=>'',computeWardrobeDividends=()=>[];`,
  '../../lib/stylingRelationships': `export const usesConfirmedCoordinatedSet=()=>false;`,
  '@/lib/concierge': `export const CONCIERGE_OCCASIONS=[],conciergeReadiness=()=> 'loading',parseConciergeIntent=()=>null;`,
};

const plugin: Plugin = {
  name: 'wardrobe-retry-mounted-fixtures',
  setup(bundle) {
    bundle.onResolve({ filter: /.*/ }, args => Object.hasOwn(hostMocks, args.path)
      ? { path: args.path, namespace: 'wardrobe-retry-mock' }
      : undefined);
    bundle.onLoad({ filter: /.*/, namespace: 'wardrobe-retry-mock' }, args => ({
      contents: hostMocks[args.path],
      loader: 'js',
      resolveDir: process.cwd(),
    }));
  },
};

type Node = {
  children: (Node | string)[];
  props: Record<string, unknown>;
  findAllByType(type: string): Node[];
};
type Mounted = { root: Node; update(element: React.ReactNode): void; unmount(): void };
const words = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(words).join('');
const requireProject = createRequire(path.join(process.cwd(), 'package.json'));
const renderer = requireProject('react-test-renderer');
const screens = [
  { name: 'Home', entry: './app/(tabs)/index.tsx', button: 'Load styles', error: 'full wardrobe could not be loaded' },
  { name: 'Outfits', entry: './app/(tabs)/outfits.tsx', button: 'Your full wardrobe could not be loaded. Tap to retry.', error: 'full wardrobe could not be loaded' },
  { name: 'Wear Log', entry: './app/wear-log.tsx', button: 'Item details could not be loaded. Tap to retry.', error: 'Item details could not be loaded' },
  { name: 'Choose 30', entry: './app/choose-30.tsx', button: 'Your wardrobe could not be loaded. Check your connection and try again. Tap to retry.', error: 'wardrobe could not be loaded' },
] as const;

async function loadScreen(entry: string): Promise<React.ComponentType> {
  const bundled = await build({
    stdin: { contents: `export {default as Screen} from '${entry}';`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    plugins: [plugin],
  });
  const mod = { exports: {} as { Screen: React.ComponentType } };
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(requireProject, mod, mod.exports);
  return mod.exports.Screen;
}

async function main() {
  for (const screenCase of screens) {
    model.wardrobeItems = [];
    model.wardrobeTotalCount = 1;
    model.wardrobeHasMore = true;
    model.requests = [];
    const Screen = await loadScreen(screenCase.entry);
    let mounted!: Mounted;
    const element = () => React.createElement(Screen);
    const text = (fragment: string) => mounted.root.findAllByType('Text')
      .some(node => words(node).toLowerCase().includes(fragment.toLowerCase()));
    const button = (fragment: string) => {
      const found = mounted.root.findAllByType('Pressable').find(node =>
        words(node).toLowerCase().includes(fragment.toLowerCase()));
      assert.ok(found, `${screenCase.name}: retry/load control is visible (${fragment})`);
      return found;
    };
    const press = async (fragment: string) => React.act(async () => {
      (button(fragment).props.onPress as () => void)();
    });
    const rerender = async () => React.act(async () => { mounted.update(element()); });
    const assertLoading = (message: string) => {
      if (screenCase.name === 'Home' || screenCase.name === 'Wear Log') {
        assert.ok(mounted.root.findAllByType('ActivityIndicator').length > 0, message);
      } else {
        assert.ok(text('loading your') || text('loading your full wardrobe'), message);
      }
    };

    if (screenCase.name === 'Home') {
      await React.act(async () => { mounted = renderer.create(element()); });
      const first = deferred();
      model.requests.push(first);
      await press('Load styles');
      first.reject(new Error('controlled failure'));
      await React.act(async () => { await first.promise.catch(() => {}); });
      assert.ok(text(screenCase.error), 'Home shows the failed full-wardrobe load');

      const retry = deferred();
      model.requests.push(retry);
      await press('Retry loading styles');
      assert.ok(!text(screenCase.error), 'Home hides the old failure while retry is pending');
      assertLoading('Home shows an active loading indicator during retry');

      model.wardrobeTotalCount = 0;
      model.wardrobeHasMore = false;
      retry.resolve();
      await React.act(async () => { await retry.promise; });
      await rerender();
      assert.ok(!text(screenCase.error), 'Home clears the failure after success');
      assert.equal(mounted.root.findAllByType('ActivityIndicator').length, 0, 'Home clears loading after success');
    } else {
      const first = deferred();
      model.requests.push(first);
      await React.act(async () => { mounted = renderer.create(element()); });

      // Changing the request key starts a newer load while the previous call is still pending.
      const current = deferred();
      model.requests.push(current);
      model.wardrobeTotalCount = 2;
      await rerender();
      assert.equal(model.requests.length, 0, `${screenCase.name}: new request starts for the updated key`);
      first.resolve();
      await React.act(async () => { await first.promise; });
      assertLoading(`${screenCase.name}: stale success cannot replace the current loading state`);
      assert.ok(!text(screenCase.error), `${screenCase.name}: stale success does not show an error`);

      current.reject(new Error('controlled failure'));
      await React.act(async () => { await current.promise.catch(() => {}); });
      assert.ok(text(screenCase.error), `${screenCase.name} shows the failed full-wardrobe load`);

      const retry = deferred();
      model.requests.push(retry);
      await press(screenCase.button);
      assert.ok(!text(screenCase.error), `${screenCase.name} hides the old failure while retry is pending`);
      assertLoading(`${screenCase.name} shows loading during retry`);
      assert.equal(model.requests.length, 0, `${screenCase.name}: retry starts a fresh request`);

      model.wardrobeTotalCount = 0;
      model.wardrobeHasMore = false;
      retry.resolve();
      await React.act(async () => { await retry.promise; });
      await rerender();
      assert.ok(!text(screenCase.error), `${screenCase.name} clears the failure after success`);
      assert.equal(mounted.root.findAllByType('ActivityIndicator').length, 0, `${screenCase.name} clears loading after success`);
    }
    await React.act(async () => mounted.unmount());
    console.log(`${screenCase.name}: failure, retry-pending, stale-request protection and recovery passed`);
  }

  for (const screenCase of screens) {
    model.authenticatedUserId = 'account-A';
    model.wardrobeItems = [];
    model.wardrobeTotalCount = 1;
    model.wardrobeHasMore = true;
    model.requests = [];
    const Screen = await loadScreen(screenCase.entry);
    let mounted!: Mounted;
    const element = () => React.createElement(Screen);
    const text = (fragment: string) => mounted.root.findAllByType('Text')
      .some(node => words(node).toLowerCase().includes(fragment.toLowerCase()));
    const button = (fragment: string) => {
      const found = mounted.root.findAllByType('Pressable').find(node =>
        words(node).toLowerCase().includes(fragment.toLowerCase()));
      assert.ok(found, `${screenCase.name}: load control is visible for the active account`);
      return found;
    };
    const press = async (fragment: string) => React.act(async () => {
      (button(fragment).props.onPress as () => void)();
    });
    const rerender = async () => React.act(async () => { mounted.update(element()); });
    const assertLoading = (message: string) => {
      if (screenCase.name === 'Home' || screenCase.name === 'Wear Log') {
        assert.ok(mounted.root.findAllByType('ActivityIndicator').length > 0, message);
      } else {
        assert.ok(text('loading your') || text('loading your full wardrobe'), message);
      }
    };

    const accountARequest = deferred();
    model.requests.push(accountARequest);
    await React.act(async () => { mounted = renderer.create(element()); });
    if (screenCase.name === 'Home') await press('Load styles');
    assert.equal(model.requests.length, 0, `${screenCase.name}: account A request started`);

    const accountBRequest = deferred();
    model.authenticatedUserId = 'account-B';
    model.requests.push(accountBRequest);
    await rerender();
    if (screenCase.name === 'Home') {
      assert.ok(!text(screenCase.error), `${screenCase.name}: account B does not inherit account A's error`);
      assert.notEqual(button('Load styles').props.disabled, true, `${screenCase.name}: account B can start its own load`);
    } else {
      assert.equal(model.requests.length, 0, `${screenCase.name}: same-count account switch starts a new request`);
      assertLoading(`${screenCase.name}: account B starts in its own loading state`);
    }

    accountARequest.resolve();
    await React.act(async () => { await accountARequest.promise; });
    assert.ok(!text(screenCase.error), `${screenCase.name}: late account A success cannot set account B's error`);
    if (screenCase.name === 'Home') {
      assert.notEqual(button('Load styles').props.disabled, true, `${screenCase.name}: late account A success cannot leave account B loading`);
      await press('Load styles');
    } else {
      assertLoading(`${screenCase.name}: late account A success cannot complete account B's load`);
    }

    const accountCRequest = deferred();
    model.authenticatedUserId = 'account-C';
    model.requests.push(accountCRequest);
    await rerender();
    if (screenCase.name === 'Home') await press('Load styles');
    else assert.equal(model.requests.length, 0, `${screenCase.name}: account C starts its own request`);

    accountBRequest.reject(new Error('late account B failure'));
    await React.act(async () => { await accountBRequest.promise.catch(() => {}); });
    assert.ok(!text(screenCase.error), `${screenCase.name}: late account B failure cannot show for account C`);
    assertLoading(`${screenCase.name}: late account B failure cannot stop account C loading`);

    model.wardrobeTotalCount = 0;
    model.wardrobeHasMore = false;
    await rerender();
    accountCRequest.resolve();
    await React.act(async () => { await accountCRequest.promise; });
    await rerender();
    assert.ok(!text(screenCase.error), `${screenCase.name}: account C completes without an old-account error`);
    assert.equal(mounted.root.findAllByType('ActivityIndicator').length, 0, `${screenCase.name}: account C completion clears loading`);
    await React.act(async () => mounted.unmount());
    console.log(`${screenCase.name}: same-count account switches ignore late success and failure`);
  }

  for (const screenCase of screens) {
    model.authenticatedUserId = 'account-partial';
    model.wardrobeItems = [];
    model.wardrobeTotalCount = 1;
    model.wardrobeHasMore = screenCase.name === 'Home' || screenCase.name === 'Wear Log';
    model.requests = [];
    const Screen = await loadScreen(screenCase.entry);
    let mounted!: Mounted;
    const element = () => React.createElement(Screen);
    const text = (fragment: string) => mounted.root.findAllByType('Text')
      .some(node => words(node).toLowerCase().includes(fragment.toLowerCase()));
    const button = (fragment: string) => {
      const found = mounted.root.findAllByType('Pressable').find(node =>
        words(node).toLowerCase().includes(fragment.toLowerCase()));
      assert.ok(found, `${screenCase.name}: incomplete wardrobe has a retry control`);
      return found;
    };
    const press = async (fragment: string) => React.act(async () => {
      (button(fragment).props.onPress as () => void)();
    });
    const rerender = async () => React.act(async () => { mounted.update(element()); });
    const assertLoading = (message: string) => {
      if (screenCase.name === 'Home' || screenCase.name === 'Wear Log') {
        assert.ok(mounted.root.findAllByType('ActivityIndicator').length > 0, message);
      } else {
        assert.ok(text('loading your') || text('loading your full wardrobe'), message);
      }
    };

    const partial = deferred();
    model.requests.push(partial);
    await React.act(async () => { mounted = renderer.create(element()); });
    if (screenCase.name === 'Home') await press('Load styles');
    assert.equal(model.requests.length, 0, `${screenCase.name}: partial-load request started`);
    partial.resolve();
    await React.act(async () => { await partial.promise; });
    await rerender();
    assert.ok(
      text(screenCase.name === 'Home' ? 'full wardrobe is still incomplete' : 'tap to retry'),
      `${screenCase.name}: successful partial load shows a retryable incomplete state`,
    );
    assert.equal(mounted.root.findAllByType('ActivityIndicator').length, 0, `${screenCase.name}: partial load stops spinning`);
    const retryLabel = screenCase.name === 'Home' ? 'Retry loading styles' : 'Tap to retry';
    button(retryLabel);

    const complete = deferred();
    model.requests.push(complete);
    await press(retryLabel);
    assertLoading(`${screenCase.name}: retry shows loading`);
    assert.equal(model.requests.length, 0, `${screenCase.name}: retry starts a fresh request`);
    model.wardrobeTotalCount = 0;
    model.wardrobeHasMore = false;
    await rerender();
    complete.resolve();
    await React.act(async () => { await complete.promise; });
    await rerender();
    assert.ok(!text('tap to retry') && !text('full wardrobe is still incomplete'), `${screenCase.name}: complete load clears incomplete state`);
    assert.equal(mounted.root.findAllByType('ActivityIndicator').length, 0, `${screenCase.name}: complete load clears loading`);
    await React.act(async () => mounted.unmount());
    console.log(`${screenCase.name}: partial success, retry, and complete recovery passed`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
