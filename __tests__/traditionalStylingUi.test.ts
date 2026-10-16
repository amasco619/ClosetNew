import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { build, type Plugin } from 'esbuild';
import { traditionalGroups, traditionalProfile, traditionalWardrobe } from './fixtures/traditionalWardrobe';
import { projectWardrobeForStyling } from '../lib/stylingWardrobe';
import { buildStylingContextCandidates, asTraditionalOutfits } from '../lib/traditionalStyling';
import { applyDailyRotation, INITIAL_ROTATION_STATE } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';
import { annotateStylingRelationships } from '../lib/stylingRelationships';

let premium = true, failure = false, empty = false, grouped = true;
let pending: Promise<void> | undefined;
const calls: string[] = [], navigation: unknown[] = [];
const request = async (context: 'traditional') => {
  calls.push(context);
  if (pending) await pending;
  if (failure) throw new Error('controlled group-read failure');
  const result = buildStylingContextCandidates(
    projectWardrobeForStyling(empty ? [] : traditionalWardrobe, empty || !grouped ? [] : traditionalGroups),
    context, traditionalProfile, null, [], '2026-10-12', [], EMPTY_AFFINITY, null, true,
  );
  const daily = applyDailyRotation(result.pool, INITIAL_ROTATION_STATE, '2026-10-12', new Set(), true, false);
  return { outfits: annotateStylingRelationships(asTraditionalOutfits(daily.outfits), result.relationshipUnits ?? []), notice: result.notice };
};
const m = {
  push: (route: unknown) => navigation.push(route),
  state: () => ({
    outfitSets: [], getStylingRecommendations: request,
    wardrobeItems: traditionalWardrobe, activeWardrobeItems: traditionalWardrobe,
    wardrobeTotalCount: traditionalWardrobe.length, wardrobeHasMore: false,
    loadAllWardrobeItems: async () => {}, isPremium: premium,
    lastAddedSuggestions: [], clearLastAddedSuggestions: () => {}, todaysWear: [],
    logWear: () => {}, undoWear: () => {}, isWornToday: () => false,
    wearHistory: [], todayMood: null, setTodayMood: () => {},
    reactToOutfit: () => {}, getOutfitReaction: () => null,
    profileCompleteness: 1, shouldShowProfileNudge: false, dismissProfileNudge: () => {},
    missingDimensions: [], getItemWearCount: () => 0,
  }),
};
Object.assign(globalThis, { __traditionalUi: m, IS_REACT_ACT_ENVIRONMENT: true });
const modules: Record<string, string> = {
  '../../components/TravelPlanner': `export default ()=>null;`,
  '@/components/GarmentTile': `import React from 'react';export const GarmentTile=({uri,...props})=>React.createElement('Image',{...props,source:{uri}});`,
  'react-native': `
    import React from 'react';const host=n=>({children,...p})=>React.createElement(n,p,children);
    export const View=host('View'),Text=host('Text'),Pressable=host('Pressable'),Image=host('Image'),
      ScrollView=host('ScrollView'),ActivityIndicator=host('ActivityIndicator'),Modal=host('Modal');
    export const Platform={OS:'web'},StyleSheet={create:s=>s},Alert={alert:()=>{}};
  `,
  'react-native-reanimated': `
    import React from 'react';const chain={delay:()=>chain,duration:()=>chain};
    export const FadeInDown=chain,FadeInUp=chain;
    export default {View:({children,...p})=>React.createElement('View',p,children)};
  `,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:0,bottom:0});`,
  'expo-router': `import React from 'react';export const router={push:globalThis.__traditionalUi.push};export const useFocusEffect=cb=>React.useEffect(cb,[cb]);`,
  '@expo/vector-icons': `export const Ionicons=()=>null;`,
  'expo-haptics': `export const selectionAsync=async()=>{},notificationAsync=async()=>{},impactAsync=async()=>{},
    NotificationFeedbackType={Warning:'warning',Success:'success'},ImpactFeedbackStyle={Light:'light'};`,
  'react-native-view-shot': `export const captureRef=async()=>'';`,
  'expo-sharing': `export const isAvailableAsync=async()=>false,shareAsync=async()=>{};`,
  '@/components/OOTDStoryCard': `export default ()=>null;`,
  '../../lib/responsive': `export const rs=x=>x;`,
  '@/lib/responsive': `export const rs=x=>x;`,
  '@/constants/weather': `export const defaultTempUnit=()=>'C';export {formatTemp,formatTempValue} from '${path.join(process.cwd(), 'constants/weatherPure.ts')}';`,
  '@/contexts/AppContext': `export const useApp=()=>globalThis.__traditionalUi.state();`,
};
const plugin: Plugin = { name: 'traditional-native-boundaries', setup(bundle) {
  bundle.onResolve({ filter: /.*/ }, args => Object.hasOwn(modules, args.path)
    ? { path: args.path, namespace: 'traditional-mock' } : undefined);
  bundle.onLoad({ filter: /.*/, namespace: 'traditional-mock' }, args => ({ contents: modules[args.path], loader: 'js', resolveDir: process.cwd() }));
} };
type Node = { children: (Node | string)[]; props: Record<string, unknown>; findAllByType(type: string): Node[] };
const words = (node: Node | string): string => typeof node === 'string' ? node : node.children.map(words).join('');
const requireProject = createRequire(path.join(process.cwd(), 'package.json'));
const renderer = requireProject('react-test-renderer');
async function main() {
  const built = await build({
    stdin: { contents: `export {default as Screen} from './app/(tabs)/outfits';`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', packages: 'external', plugins: [plugin],
  });
  const mod = { exports: {} as { Screen: React.ComponentType } };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(requireProject, mod, mod.exports);
  let tree: { root: Node; unmount(): void };
  const button = (label: string) => {
    const found = tree.root.findAllByType('Pressable').find(node =>
      node.props.accessibilityLabel === label || words(node).trim() === label);
    assert.ok(found, `actual screen button ${label}`);
    return found;
  };
  const press = (label: string) => (button(label).props.onPress as () => void)();
  const hasText = (text: string) => tree.root.findAllByType('Text').some(node => words(node).toLowerCase().includes(text.toLowerCase()));
  const hasPhoto = (id: string) => tree.root.findAllByType('Image').some(node =>
    (node.props.source as { uri?: string })?.uri === `test://wardrobe-${id}`);
  await React.act(async () => { tree = renderer.create(React.createElement(mod.exports.Screen)); });
  assert.equal(calls.length, 0, 'African wardrobe never auto-selects Traditional');
  let release!: () => void;
  pending = new Promise<void>(resolve => { release = resolve; });
  await React.act(async () => press('Traditional styling'));
  assert.deepEqual(calls, ['traditional'], 'existing chip reaches real semantic adapter');
  assert.ok(hasText('Styling from your wardrobe'));
  assert.ok(hasText('African-first traditional occasion'));
  await React.act(async () => { release(); await pending; });
  pending = undefined;
  assert.ok(!hasText('Styling from your wardrobe'));
  assert.ok(hasPhoto('buba') && hasPhoto('iro'), 'real generated coordinated owned photos appear on actual screen');
  assert.ok(hasText('Styled as a set'), 'confirmed set is communicated naturally on the existing card');
  await React.act(async () => press('Casual'));
  assert.ok(!hasText('African-first traditional occasion'));
  assert.equal(calls.length, 1, 'generic styling never enters Traditional boundary');

  failure = true;
  await React.act(async () => press('Traditional styling'));
  assert.ok(hasText('could not be loaded'));
  assert.ok(button('Retry loading traditional looks'));
  failure = false;
  await React.act(async () => press('Retry loading traditional looks'));
  assert.ok(!hasText('could not be loaded'));
  assert.ok(hasPhoto('buba') && hasPhoto('iro'));

  await React.act(async () => press('Casual'));
  grouped = false;
  await React.act(async () => press('Traditional styling'));
  assert.ok(hasPhoto('buba') && hasPhoto('iro'), 'ordinary compatible pairing still allowed without group');
  assert.ok(!hasText('Styled as a set'), 'matching garments do not fabricate a relationship cue');
  grouped = true;

  await React.act(async () => press('Casual'));
  pending = new Promise<void>(resolve => { release = resolve; });
  await React.act(async () => press('Traditional styling'));
  await React.act(async () => press('Casual'));
  await React.act(async () => { release(); await pending; });
  pending = undefined;
  assert.ok(!hasText('African-first traditional occasion'), 'late Traditional result cannot change selected context');
  empty = true;
  await React.act(async () => press('Traditional styling'));
  assert.ok(hasText('footwear'), 'actual adapter gap is visible');
  assert.ok(!hasPhoto('buba'), 'no fabricated complete outfit in gap state');
  await React.act(async () => { tree.unmount(); });

  premium = false; empty = false;
  const before = calls.length;
  await React.act(async () => { tree = renderer.create(React.createElement(mod.exports.Screen)); });
  await React.act(async () => press('Traditional styling'));
  assert.equal(calls.length, before, 'existing premium gate cannot be bypassed by chip');
  assert.equal(navigation.at(-1), '/premium');
  await React.act(async () => { tree.unmount(); });
  console.log('Actual Traditional screen: explicit choice, real generated set, pending, error/retry, stale response, gap and unchanged premium gate passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
