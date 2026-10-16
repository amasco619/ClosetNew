import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { build, type Plugin } from 'esbuild';
import { saveWardrobeCorrection } from '../lib/wardrobeSemantics';
import { mapDbRowToWardrobeItem } from '../lib/wardrobeMapper';
import type { WardrobeItem } from '../constants/types';

// Exercise the actual draft response/subtype blocks without a native runtime.
// Only the external classifier and setter boundaries are controlled.
const addSource = readFileSync('app/add-item.tsx', 'utf8');
const setters = ['Category', 'SubType', 'ColorFamily', 'Description', 'Occasions', 'Seasons',
  'Pattern', 'PatternScale', 'Fabric', 'Weight', 'AccentColor', 'DominantHsl',
  'DominantLab', 'ModelConfidence', 'Fit', 'Neckline', 'SleeveLength', 'Rise', 'WarmthBand'];
const classifyCall = addSource.indexOf('const classified = await classifyWithServer');
const responseStart = addSource.indexOf('if (requestId !== photoRequestRef.current) return;', classifyCall);
const responseBlock = addSource.slice(
  responseStart,
  addSource.indexOf('finishClassifying(true);', classifyCall),
);
function suggestions(confirmed: string[], stale = false) {
  const changes: Record<string, unknown> = {};
  const env: Record<string, unknown> = {
    requestId: 1, photoRequestRef: { current: stale ? 2 : 1 },
    correctedFieldsRef: { current: new Set(confirmed) },
    categoryRef: { current: 'top' }, subTypeRef: { current: 'buba' },
    subTypes: { top: ['buba', 'blouse'], dress: ['kaftan'] }, colorFamilies: ['red', 'blue'],
    fabric: undefined, weight: undefined, neckline: undefined, rise: undefined, warmthBand: undefined,
    classified: {
      category: 'dress', subType: 'kaftan', colorFamily: 'blue', fabric: 'silk',
      neckline: 'boat', formalityLevel: 3, modelConfidence: 0.9,
      description: '', occasionTags: ['casual'], seasonTags: ['summer'],
      dominantHsl: { h: 220, s: 0.5, l: 0.5 },
    },
    inferFabric: () => 'cotton', inferFabricWeight: () => 'mid',
    SUBTYPE_NECKLINE: { buba: 'crew' }, SUBTYPE_RISE: {}, SUBTYPE_WARMTH: {},
  };
  for (const setter of setters) env[`set${setter}`] = (value: unknown) => { changes[setter] = value; };
  runInNewContext(`(function(){ ${responseBlock} })()`, env);
  return changes;
}
const correctedFields = ['category', 'subType', 'colorFamily', 'fabric', 'neckline', 'seasonTags', 'occasionTags'];
const late = suggestions(correctedFields);
for (const key of ['Category', 'SubType', 'ColorFamily', 'Fabric', 'Neckline', 'Seasons', 'Occasions', 'DominantHsl', 'ModelConfidence']) {
  assert.ok(!Object.hasOwn(late, key), `${key}: a late AI result cannot overwrite a correction/explicit unknown`);
}
assert.equal(suggestions([]).SubType, 'kaftan', 'uncorrected AI proposal remains available');
assert.equal(Object.keys(suggestions([], true)).length, 0, 'old photo response is ignored entirely');
assert.doesNotMatch(addSource, /if \((fit|fabric|weight|neckline|sleeveLength|rise|warmthBand|metalTone|accentColor) === \w+\) correctedFieldsRef\.current\.delete/);
assert.match(addSource, /if \(isNewPhoto\) setFormalityLevel\(undefined\)/);
assert.doesNotMatch(addSource, /inferFabric(?:Weight)?\(/, 'generic subtype guesses must not become stored material facts');
assert.doesNotMatch(readFileSync('app/bulk-review.tsx', 'utf8'), /c\.seasonTags\.length \? c\.seasonTags : \['all-season'\]/);

let row: Record<string, unknown> = {
  id: 'owned-item', user_id: 'authenticated-owner', garment_type: 'top',
  sub_type: 'shirt', color_family: 'blue', image_url: 'owner/item.jpg',
  occasion: ['casual'], recommendation_semantics: { seasonTags: ['summer'], neckline: 'crew' },
  created_at: '2026-10-12',
};
let items = [mapDbRowToWardrobeItem(row)];
let failure = false;
let pending: Promise<void> | undefined;
let refresh = () => {};
let persist!: (user: string, item: WardrobeItem) => Promise<void>;
const m = {
  items: () => items,
  subscribe: (callback: () => void) => { refresh = callback; },
  update: async (id: string, updates: Partial<WardrobeItem>) => {
    const saved = await saveWardrobeCorrection(items.find(item => item.id === id)!, updates,
      item => persist('authenticated-owner', item));
    items = items.map(item => item.id === id ? saved : item);
    refresh();
  },
  from: (table: string) => {
    assert.equal(table, 'wardrobe_items');
    let payload: Record<string, unknown>;
    const filters: Record<string, unknown> = {};
    const builder = {
      update: (value: Record<string, unknown>) => { payload = value; return builder; },
      eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
      select: () => builder,
      maybeSingle: async () => {
        if (pending) await pending;
        assert.deepEqual(filters, { id: 'owned-item', user_id: 'authenticated-owner' });
        if (failure) return { data: null, error: { message: 'rejected', code: '23514' } };
        row = { ...row, ...payload! };
        return { data: { id: row.id }, error: null };
      },
    };
    return builder;
  },
};
Object.assign(globalThis, { __canonicalUi: m, IS_REACT_ACT_ENVIRONMENT: true });
const modules: Record<string, string> = {
  'react-native': `
    import React from 'react';
    const host = name => ({children,...props}) => React.createElement(name,props,children);
    export const View=host('View'),Text=host('Text'),TextInput=host('TextInput'),Pressable=host('Pressable'),
      ActivityIndicator=host('ActivityIndicator'),ScrollView=host('ScrollView');
    export const Platform={OS:'web'},StyleSheet={create:s=>s},Alert={alert:()=>{}};
  `,
  'expo-router': `export const router={back:()=>{},push:()=>{}},useLocalSearchParams=()=>({id:'owned-item'});`,
  'expo-status-bar': `export const StatusBar=()=>null;`,
  'expo-image': `export const Image=()=>null;`,
  '@/components/GarmentTile': `import React from 'react';export const GarmentTile=({uri,...props})=>React.createElement('Image',{...props,source:{uri}});`,
  '@expo/vector-icons': `export const Ionicons=()=>null;`,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:0,bottom:0});`,
  'expo-haptics': `export const notificationAsync=async()=>{},selectionAsync=async()=>{},NotificationFeedbackType={Success:'success'};`,
  '@/components/SwipeToDismiss': `export default function Wrapper({children}){return children;}`,
  '../lib/responsive': `export const rs=x=>x;`,
  '@react-native-async-storage/async-storage': `export default {};`,
  './supabase': `export const supabase={from:globalThis.__canonicalUi.from};`,
  '@/contexts/AppContext': `
    import {useState} from 'react';
    const m=globalThis.__canonicalUi;
    export const subTypes={top:['shirt','blouse','buba']},colorFamilies=['blue','red'];
    export function useApp(){
      const [,tick]=useState(0);m.subscribe(()=>tick(x=>x+1));
      return {wardrobeItems:m.items(),getItemWearCount:()=>0,loadAllWardrobeItems:async()=>{},removeWardrobeItem:()=>{},updateWardrobeItem:m.update,isGuest:false};
    }
  `,
};
const plugin: Plugin = { name: 'canonical-ui-boundaries', setup(bundle) {
  bundle.onResolve({ filter: /.*/ }, args => Object.hasOwn(modules, args.path)
    ? { path: args.path, namespace: 'canonical-mock' } : undefined);
  bundle.onLoad({ filter: /.*/, namespace: 'canonical-mock' }, args => ({ contents: modules[args.path], loader: 'js' }));
} };
const requireProject = createRequire(path.join(process.cwd(), 'package.json'));
const renderer = requireProject('react-test-renderer');
type TreeNode = { children: (TreeNode | string)[]; props: Record<string, any>; findAllByType(type: string): TreeNode[] };
const words = (node: TreeNode | string): string => typeof node === 'string' ? node : node.children.map(words).join('');
async function main() {
  const built = await build({
    stdin: { contents: `export {default as Screen} from './app/item-detail';export {updateWardrobeItemSemantics as persist} from './lib/database';`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
    packages: 'external', plugins: [plugin],
  });
  const mod = { exports: {} as { Screen: React.ComponentType; persist: typeof persist } };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(requireProject, mod, mod.exports);
  persist = mod.exports.persist;
  let tree: { root: TreeNode; unmount(): void };
  const button = (label: string) => {
    const node = tree.root.findAllByType('Pressable').find(node => words(node).toLowerCase() === label.toLowerCase());
    assert.ok(node, `rendered button ${label}`); return node;
  };
  const hasText = (label: string) => tree.root.findAllByType('Text').some(node => words(node).includes(label));
  await React.act(async () => { tree = renderer.create(React.createElement(mod.exports.Screen)); });
  await React.act(async () => button('shirt').props.onPress());
  let resolve!: () => void;
  pending = new Promise<void>(yes => { resolve = yes; });
  await React.act(async () => button('buba').props.onPress());
  assert.ok(hasText('Saving your change'));
  assert.equal(row.sub_type, 'shirt', 'UI selection has not crossed the save barrier');
  assert.equal(items[0].subType, 'shirt');
  assert.equal(button('buba').props.disabled, true);
  await React.act(async () => { resolve(); await pending; });
  pending = undefined;
  assert.equal(row.sub_type, 'buba');
  assert.equal(items[0].subType, 'buba');
  assert.ok(!hasText('Saving your change'));
  assert.equal(button('buba').props.disabled, undefined, 'editor closed after cloud success');
  await React.act(async () => { tree.unmount(); });

  // Cold-start hydration uses the actual mapper, not the optimistic UI object.
  items = [mapDbRowToWardrobeItem(row)];
  await React.act(async () => { tree = renderer.create(React.createElement(mod.exports.Screen)); });
  assert.ok(hasText('buba'));
  await React.act(async () => button('buba').props.onPress());
  failure = true;
  await React.act(async () => button('blouse').props.onPress());
  assert.equal(row.sub_type, 'buba');
  assert.equal(items[0].subType, 'buba');
  assert.ok(hasText('Your change wasn’t saved'));
  assert.ok(button('blouse'), 'failed correction keeps editor available for retry');
  failure = false;
  await React.act(async () => button('blouse').props.onPress());
  assert.equal(mapDbRowToWardrobeItem(row).subType, 'blouse');
  assert.equal(items[0].storagePath, 'owner/item.jpg');
  await React.act(async () => tree.unmount());
  console.log('Canonical Add Item late-AI/unknown guards and mounted authenticated saved-item cloud contract, reload, failure and retry passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
