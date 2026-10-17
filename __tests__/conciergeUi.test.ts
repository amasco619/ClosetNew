import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { build, type Plugin } from 'esbuild';
import { CONCIERGE_OCCASIONS } from '../lib/concierge';
import { traditionalGroups, traditionalProfile, traditionalWardrobe } from './fixtures/traditionalWardrobe';
import { generateOutfitPool, applyDailyRotation, INITIAL_ROTATION_STATE } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';
import { projectWardrobeForStyling } from '../lib/stylingWardrobe';
import { projectRelationshipsForStyling, annotateStylingRelationships } from '../lib/stylingRelationships';
import { buildStylingContextCandidates, asTraditionalOutfits } from '../lib/traditionalStyling';

const date = '2026-10-13';
const model = {
  owner: 'fixture-owner', authenticated: true, premium: true, unavailable: false,
  profile: { ...traditionalProfile, weatherEnabled: true, tempUnit: 'C' as 'C' | 'F' },
  items: [...traditionalWardrobe,
    { ...traditionalWardrobe[2], id: 'work-top', subType: 'custom-work-top', formalityLevel: 6 },
    { ...traditionalWardrobe[3], id: 'work-bottom', subType: 'custom-work-bottom', formalityLevel: 6 }],
  weather: { fetchedAt: Date.now(), lat: 51.5, lon: -0.1, currentTempC: 20, lowC: 12, highC: 24, precipProbability: 0, source: 'gps' as const },
  more: false, total: 11, dataFailure: false, groupFailure: false,
};
let authority: 'premium' | 'denied' | 'unavailable' = 'premium';
let entitlementPending: Promise<void> | undefined, stylingPending: Promise<void> | undefined, wardrobePending: Promise<void> | undefined;
let checks = 0, groupReads = 0;
const mutations: string[] = [], navigation: unknown[] = [];
let blur: (() => void) | undefined;
const generic = () => applyDailyRotation(
  generateOutfitPool(projectWardrobeForStyling(model.items).v37Items, model.profile, null, [], date, [], EMPTY_AFFINITY, model.weather, model.premium),
  INITIAL_ROTATION_STATE, date, new Set(), model.premium, false,
).outfits;
const getTraditional = async () => {
  groupReads++;
  const result = buildStylingContextCandidates(
    projectRelationshipsForStyling(projectWardrobeForStyling(model.items, traditionalGroups), 'fixture-owner'),
    'traditional', model.profile, null, [], date, [], EMPTY_AFFINITY, model.weather, model.premium,
  );
  if (stylingPending) await stylingPending;
  if (model.groupFailure) throw new Error('controlled group read failure');
  const daily = applyDailyRotation(result.pool, INITIAL_ROTATION_STATE, date, new Set(), model.premium, false);
  return { outfits: annotateStylingRelationships(asTraditionalOutfits(daily.outfits), result.relationshipUnits ?? []), notice: result.notice };
};
const fixture = {
  push: (route: unknown) => navigation.push(route),
  focus: (cleanup: () => void) => { blur = cleanup; },
  state: () => ({
    profile: model.profile, weather: model.weather, isAuthenticated: model.authenticated, authenticatedUserId: model.owner,
    isPremium: model.premium, entitlementUnavailable: model.unavailable, appReady: true, isLoading: false,
    dataUnavailable: model.dataFailure, startupError: false, retryInitialization: () => { model.dataFailure = false; },
    refreshPremiumEntitlement: async (rejectUnavailable = false) => {
      assert.equal(rejectUnavailable, true, 'Concierge requests an unambiguous authoritative result');
      checks++;
      if (entitlementPending) await entitlementPending;
      model.unavailable = authority === 'unavailable';
      model.premium = authority === 'premium';
      if (authority === 'unavailable' && rejectUnavailable) throw new Error('controlled entitlement service unavailable');
      return model.premium;
    },
    outfitSets: generic(), getStylingRecommendations: getTraditional,
    wardrobeItems: model.items, activeWardrobeItems: model.items,
    wardrobeTotalCount: model.total, wardrobeHasMore: model.more,
    loadAllWardrobeItems: async () => { if (wardrobePending) await wardrobePending; },
    lastAddedSuggestions: [], clearLastAddedSuggestions: () => mutations.push('suggestions'),
    todaysWear: [], wearHistory: [], logWear: () => mutations.push('wear'), undoWear: () => mutations.push('undo'),
    isWornToday: () => false, todayMood: null, setTodayMood: () => mutations.push('mood'),
    reactToOutfit: () => mutations.push('reaction'), getOutfitReaction: () => null,
    profileCompleteness: 1, shouldShowProfileNudge: false, dismissProfileNudge: () => mutations.push('profile'),
    missingDimensions: [], getItemWearCount: () => 0,
  }),
};
Object.assign(globalThis, { __conciergeUi: fixture, IS_REACT_ACT_ENVIRONMENT: true });
const mocks: Record<string, string> = {
  '../../components/TravelPlanner': `export default ()=>null;`,
  '@/contexts/LuxuryFeedbackContext': `export const useDialog=()=>({confirm:async()=>false,notify:()=>{},alert:()=>{}});export const useToast=()=>({show:()=>{}});`,
  '@/components/GarmentTile': `import React from 'react';export const GarmentTile=({uri,...props})=>React.createElement('Image',{...props,source:{uri}});`,
  'react-native': `import React from 'react';const host=n=>({children,...p})=>React.createElement(n,p,children);
    export const View=host('View'),Text=host('Text'),Pressable=host('Pressable'),Image=host('Image'),
    ScrollView=host('ScrollView'),ActivityIndicator=host('ActivityIndicator'),Modal=host('Modal');
    export const Platform={OS:'web'},StyleSheet={create:s=>s},Alert={alert:()=>{}};`,
  'react-native-reanimated': `import React from 'react';const chain={delay:()=>chain,duration:()=>chain};
    export const FadeInDown=chain,FadeInUp=chain;export default {View:({children,...p})=>React.createElement('View',p,children)};`,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:24,bottom:20});`,
  'expo-router': `import React from 'react';export const router={push:globalThis.__conciergeUi.push};
    export const useFocusEffect=cb=>React.useEffect(()=>{const cleanup=cb();globalThis.__conciergeUi.focus(cleanup);return cleanup;},[cb]);`,
  '@expo/vector-icons': `export const Ionicons=()=>null;`,
  'expo-haptics': `export const selectionAsync=async()=>{},notificationAsync=async()=>{},impactAsync=async()=>{};
    export const NotificationFeedbackType={Warning:'warning',Success:'success'},ImpactFeedbackStyle={Light:'light'};`,
  'react-native-view-shot': `export const captureRef=async()=>'';`,
  'expo-sharing': `export const isAvailableAsync=async()=>false,shareAsync=async()=>{};`,
  '@/components/OOTDStoryCard': `export default ()=>null;`,
  '../../lib/responsive': `export const rs=x=>x;`, '@/lib/responsive': `export const rs=x=>x;`,
  '@/constants/weather': `export const defaultTempUnit=()=>'C';export {formatTemp,formatTempValue} from '${path.join(process.cwd(), 'constants/weatherPure.ts')}';`,
  '@/contexts/AppContext': `export const useApp=()=>globalThis.__conciergeUi.state();`,
};
const plugin: Plugin = { name: 'concierge-native-fixtures', setup(bundle) {
  bundle.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
  bundle.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
} };
type Node = { children: (Node | string)[]; props: Record<string, unknown>; findAllByType(type: string): Node[] };
const words = (node: Node | string): string => typeof node === 'string' ? node : node.children.map(words).join('');
const requireProject = createRequire(path.join(process.cwd(), 'package.json'));
const renderer = requireProject('react-test-renderer');

async function main() {
  const bundled = await build({
    entryPoints: ['app/(tabs)/outfits.tsx'], bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic',
    plugins: [plugin], external: ['react', 'react/jsx-runtime'],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(requireProject, module, module.exports);
  const Screen = (module.exports as { default: React.ComponentType }).default;
  let screen!: { root: Node; update(node: React.ReactNode): void; unmount(): void };
  await React.act(async () => { screen = renderer.create(React.createElement(Screen)); });
  const ids = (id: string) => screen.root.findAllByType('Pressable').filter(node => node.props.testID === id);
  const status = (name: string) => screen.root.findAllByType('View').some(node => node.props.testID === `concierge-result-${name}`);
  const text = (value: string) => screen.root.findAllByType('Text').some(node => words(node).includes(value));
  const click = async (id: string) => React.act(async () => {
    const node = ids(id)[0]; assert.ok(node, `missing ${id}`);
    assert.notEqual(node.props.disabled, true, `${id} is disabled`);
    (node.props.onPress as () => void)();
  });
  const rerender = async () => React.act(async () => { screen.update(React.createElement(Screen)); });
  const plan = async (occasion: string) => {
    await click('concierge-entry');
    assert.equal(ids('concierge-submit')[0].props.disabled, true);
    assert.equal(screen.root.findAllByType('Modal')[0].props['aria-label'], 'Plan an occasion today');
    assert.ok(screen.root.findAllByType('Text').some(node => node.props.role === 'heading' && words(node) === 'What’s the occasion?'));
    await click(`concierge-option-${occasion}`);
    assert.deepEqual(ids(`concierge-option-${occasion}`)[0].props.accessibilityState, { checked: true });
    assert.equal(ids(`concierge-option-${occasion}`)[0].props['aria-checked'], true);
    await click('concierge-submit');
  };
  const snapshot = JSON.stringify({ items: model.items, profile: model.profile });
  for (const option of CONCIERGE_OCCASIONS) {
    const beforeChecks = checks, beforeReads = groupReads;
    await plan(option.id);
    assert.equal(checks, beforeChecks + 2, 'entry and handoff both use fresh authority');
    assert.equal(ids('concierge-submit').length, 0, 'modal dismissed after real handoff');
    const images = screen.root.findAllByType('Image').map(node => (node.props.source as { uri: string })?.uri).sort();
    if (option.id !== 'traditional-event') {
      const expected = generic().filter(outfit => outfit.scenario === option.id).flatMap(outfit => outfit.components.map(component => component.photoUri)).filter(Boolean).sort();
      assert.deepEqual(images, expected, `${option.id} shows exact existing selected-scenario results, not previous cards`);
      assert.equal(groupReads, beforeReads);
      assert.ok(status(expected.length ? 'ready' : 'empty'));
    } else {
      assert.equal(groupReads, beforeReads + 1);
      assert.ok(status('ready') && text('Styled as a set'));
      assert.ok(images.includes('test://wardrobe-buba') && images.includes('test://wardrobe-iro'));
    }
    await click('concierge-exit');
  }
  assert.deepEqual(mutations, []);
  assert.equal(JSON.stringify({ items: model.items, profile: model.profile }), snapshot);
  await plan('traditional-event');
  assert.ok(text('20°C'));
  model.profile = { ...model.profile, tempUnit: 'F' };
  await rerender();
  assert.ok(text('68°F'));
  model.profile = { ...model.profile, weatherEnabled: false };
  await rerender();
  assert.ok(text('Weather guidance is switched off.'));
  const beforeRepeat = groupReads;
  await plan('traditional-event');
  assert.equal(groupReads, beforeRepeat + 1, 'same occasion makes a fresh Traditional request');
  model.groupFailure = true;
  await plan('traditional-event');
  assert.ok(status('failure') && !status('empty'));
  model.groupFailure = false;
  await click('concierge-result-retry');
  assert.ok(status('ready'));

  await click('concierge-exit');
  authority = 'unavailable';
  await click('concierge-entry');
  assert.ok(ids('concierge-access-retry').length && !ids('concierge-upgrade').length);
  authority = 'premium';
  await click('concierge-access-retry');
  authority = 'denied'; // Losing entitlement between entry and submission must not show results.
  await click('concierge-option-wedding');
  await click('concierge-submit');
  assert.ok(ids('concierge-upgrade').length && !status('ready'));
  await click('concierge-upgrade');
  assert.ok(navigation.includes('/premium'));
  model.authenticated = false;
  await rerender();
  const beforeGuest = checks;
  await click('concierge-entry');
  assert.ok(ids('concierge-sign-in').length);
  assert.equal(checks, beforeGuest);
  await click('concierge-sign-in');
  assert.ok(navigation.includes('/sign-in'));

  model.authenticated = true; model.premium = true; authority = 'premium'; model.unavailable = false;
  await rerender();
  let release = () => {};
  entitlementPending = new Promise<void>(resolve => { release = resolve; });
  await click('concierge-entry');
  assert.ok(text('Checking access'));
  await click('concierge-close');
  await React.act(async () => { release(); await entitlementPending; });
  entitlementPending = undefined;
  assert.equal(ids('concierge-submit').length, 0, 'closed planner rejects late authority response');
  stylingPending = new Promise<void>(resolve => { release = resolve; });
  await plan('traditional-event');
  assert.ok(status('loading') && !status('empty'));
  model.owner = 'different-owner';
  await rerender();
  await React.act(async () => { release(); await stylingPending; });
  stylingPending = undefined;
  assert.ok(!status('ready') && !text('Styled as a set'), 'account switch clears intent and rejects old results');

  model.owner = 'fixture-owner';
  await rerender();
  const savedItems = model.items;
  model.items = []; model.total = 1; model.more = true;
  wardrobePending = new Promise<void>(resolve => { release = resolve; });
  await rerender();
  await plan('work');
  assert.ok(status('loading') && !status('insufficient'));
  model.total = 0; model.more = false;
  await rerender();
  await React.act(async () => { release(); await wardrobePending; });
  wardrobePending = undefined;
  assert.ok(status('insufficient'));
  model.dataFailure = true;
  await rerender();
  assert.ok(status('failure'));
  await click('concierge-result-retry');
  await rerender();
  assert.ok(status('insufficient'));
  model.items = savedItems; model.total = savedItems.length;
  await rerender();
  await plan('traditional-event');
  await React.act(async () => { blur?.(); });
  assert.ok(!status('ready'), 'tab exit discards transient plan');
  assert.deepEqual(mutations, []);
  await React.act(async () => screen.unmount());
  console.log('Real mounted planner/Outfits: five exact handoffs, fresh dual gates, ownership, pending/retry/empty/insufficient/failure, same-request refresh, blur, C/F and no incidental mutations passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
