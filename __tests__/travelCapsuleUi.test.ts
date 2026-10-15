import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build, type Plugin } from 'esbuild';
import React from 'react';
import type { GarmentGroup, OutfitSet, WardrobeItem } from '../constants/types';

const items: WardrobeItem[] = ['top', 'bottom', 'shoes', 'partner'].map((id, index) => ({
  id, photoUri: `test://${id}`, category: index === 0 ? 'top' : index === 2 ? 'shoes' : 'bottom',
  subType: id, colorFamily: 'navy', occasionTags: ['casual'], seasonTags: [], createdAt: '',
}));
function outfit(scenario: OutfitSet['scenario'], ids = ['top', 'bottom', 'shoes']): OutfitSet {
  return { id: `daily-${scenario}-0`, scenario, components: ids.map(id => ({
    category: items.find(item => item.id === id)!.category, subType: id, colorFamily: 'navy', owned: true, matchedItemId: id,
  })) };
}
const group: GarmentGroup = {
  id: 'set', userId: 'owner', relationshipType: 'coordinated_set', confirmationStatus: 'user_confirmed',
  sharedAttributes: {}, createdAt: '', updatedAt: '',
  members: ['top', 'partner'].map(garmentId => ({ garmentId, groupId: 'set', userId: 'owner', createdAt: '' })),
};
let owner: string | null = 'owner', premium = true, unavailable = false, ready = true, failed = false;
let wardrobe = items, groups = [group], groupFailure = false, traditionalFailure = false;
let authority: 'yes' | 'no' | 'error' = 'yes';
let hold: Promise<void> | undefined, groupHold: Promise<void> | undefined;
let checks = 0, reads = 0, traditionalCalls = 0, closed = 0, loads = 0;
let focusCleanup: (() => void) | undefined, foreground: ((state: string) => void) | undefined;
let poll: (() => void) | undefined;
const mutations: string[] = [];
const generic = [outfit('casual'), outfit('work')];
const state = () => ({
  profile: { isGuest: false }, isAuthenticated: !!owner, authenticatedUserId: owner, isPremium: premium,
  entitlementUnavailable: unavailable, appReady: ready, isLoading: !ready, wardrobeHasMore: !ready,
  wardrobeItems: wardrobe, activeWardrobeItems: wardrobe, wardrobeTotalCount: items.length,
  startupError: failed, dataUnavailable: failed, weather: null, outfitSets: generic,
  refreshPremiumEntitlement: async (strict: boolean) => {
    assert.equal(strict, true); checks++;
    if (hold) await hold;
    if (authority === 'error') { unavailable = true; throw new Error('unavailable'); }
    unavailable = false; premium = authority === 'yes'; return premium;
  },
  getStylingRecommendations: async (context: string) => {
    assert.equal(context, 'traditional'); traditionalCalls++;
    if (groupHold) await groupHold;
    if (traditionalFailure) throw new Error('failed Traditional service');
    return { outfits: [outfit('traditional-event', ['top', 'partner', 'shoes'])], notice: 'Existing Traditional service notice' };
  },
  loadAllWardrobeItems: async () => { loads++; },
  retryInitialization: () => { loads++; },
  logWear: () => mutations.push('wear'), setTodayMood: () => mutations.push('mood'),
  reactToOutfit: () => mutations.push('reaction'), saveLook: () => mutations.push('saved'),
  updateProfile: () => mutations.push('profile'),
  rotationState: { cursor: 7 }, wearHistory: [], todayMood: null, reactions: [], savedLooks: [],
});
const fixture = {
  state,
  groups: async (userId: string) => {
    const expectedOwner = owner;
    assert.equal(userId, expectedOwner); reads++;
    if (groupHold) await groupHold;
    if (groupFailure) throw new Error('group read failure');
    return groups;
  },
  focus: (fn: () => void) => { focusCleanup = fn; },
  foreground: (fn: (state: string) => void) => { foreground = fn; },
};
Object.assign(globalThis, { __travelUi: fixture, IS_REACT_ACT_ENVIRONMENT: true });
const mocks: Record<string, string> = {
  'react-native': `import React from 'react';const host=n=>({children,...p})=>React.createElement(n,p,children);
    export const View=host('View'),Text=host('Text'),Pressable=host('Pressable'),Image=host('Image'),
    ScrollView=host('ScrollView'),Modal=host('Modal');export const StyleSheet={create:s=>s};
    export const AppState={addEventListener:(_,fn)=>{globalThis.__travelUi.foreground(fn);return{remove:()=>{}}}};`,
  'expo-router': `import React from 'react';export const router={push:()=>{}};
    export const useFocusEffect=cb=>React.useEffect(()=>{const cleanup=cb();globalThis.__travelUi.focus(cleanup);return cleanup;},[cb]);`,
  '@expo/vector-icons': `export const Ionicons=()=>null;`,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:24,bottom:20});`,
  '@/lib/responsive': `export const rs=x=>x;`,
  '@/contexts/AppContext': `export const useApp=()=>globalThis.__travelUi.state();`,
  '@/lib/database': `export const getGarmentGroups=id=>globalThis.__travelUi.groups(id);`,
  '@react-native-async-storage/async-storage': `throw new Error('Planner imported persistence');`,
};
const plugin: Plugin = { name: 'travel-native-fixtures', setup(bundle) {
  bundle.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
  bundle.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
} };
type Node = { children: (Node | string)[]; props: Record<string, unknown>; findAllByType(type: string): Node[] };
const words = (node: Node | string): string => typeof node === 'string' ? node : node.children.map(words).join('');
const requireProject = createRequire(path.join(process.cwd(), 'package.json'));
const renderer = requireProject('react-test-renderer');

async function main() {
  const bundled = await build({
    entryPoints: ['components/TravelPlanner.tsx'], bundle: true, platform: 'node', format: 'cjs',
    write: false, jsx: 'automatic', plugins: [plugin], external: ['react', 'react/jsx-runtime'],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setInterval', 'clearInterval', bundled.outputFiles[0].text)(
    requireProject, module, module.exports, (fn: () => void) => { poll = fn; return 1; }, () => {},
  );
  const Screen = (module.exports as { default: React.ComponentType<{ onClose: () => void }> }).default;
  let screen!: { root: Node; update(node: React.ReactNode): void; unmount(): void };
  const onClose = () => { closed++; };
  const element = () => React.createElement(Screen, { onClose });
  const mount = () => React.act(async () => { screen = renderer.create(element()); });
  const render = () => React.act(async () => { screen.update(element()); });
  const ids = (id: string) => screen.root.findAllByType('Pressable').filter(node => node.props.testID === id);
  const text = (value: string) => screen.root.findAllByType('Text').some(node => words(node).includes(value));
  const click = (id: string) => React.act(async () => {
    const node = ids(id)[0]; assert.ok(node, `missing ${id}`);
    assert.notEqual(node.props.disabled, true); (node.props.onPress as () => void)();
  });
  const unmount = () => React.act(async () => { screen.unmount(); });
  const protectedSnapshot = () => JSON.stringify({
    wardrobe, generic, rotation: state().rotationState, wear: state().wearHistory,
    mood: state().todayMood, reactions: state().reactions, saved: state().savedLooks,
  });
  const baseline = protectedSnapshot();
  await mount();
  assert.equal(checks, 1);
  assert.ok(text('0 of 1 activities'));
  assert.ok(text('Partial confirmed coordinated set: 1 of 2'));
  assert.equal(traditionalCalls, 0);
  await click('travel-choice-0');
  assert.equal(checks, 2, 'fresh authority before accepting a choice');
  assert.ok(text('1 of 1 activities'));
  assert.equal(screen.root.findAllByType('Pressable').filter(n => String(n.props.testID).startsWith('travel-packed-')).length, 3);
  await click('travel-packed-top');
  assert.equal(ids('travel-packed-top')[0].props['aria-checked'], true);
  await click('travel-essential-0');
  assert.equal(ids('travel-essential-0')[0].props['aria-checked'], true);
  await click('travel-days-plus');
  await click('travel-add-2');
  assert.ok(text('Reuse this look'));
  await click('travel-choice-0');
  assert.ok(text('2 of 2 activities'));
  assert.equal(screen.root.findAllByType('Pressable').filter(n => String(n.props.testID).startsWith('travel-packed-')).length, 3);
  await click('travel-activity-other-2');
  await click('travel-add-2');
  assert.ok(text('2 of 3 activities'));
  assert.ok(text('Unsupported activity'));
  assert.equal(ids('travel-choice-0').length, 0);
  await click('travel-activity-wedding-2');
  await click('travel-add-2');
  assert.ok(text('2 of 4 activities'));
  assert.equal(ids('travel-choice-0').length, 0, 'no generic fallback/backfill');
  await click('travel-activity-traditional-event-2');
  await click('travel-add-2');
  assert.equal(traditionalCalls, 1);
  assert.ok(text('Existing Traditional service notice'));
  assert.ok(text('Includes all 2 pieces'));
  await click('travel-choice-0');
  assert.ok(text('3 of 5 activities'));
  assert.equal(traditionalCalls, 2, 'assignment uses current dedicated service');
  await click('travel-slot-slot-1');
  assert.ok(text('Existing Traditional service notice'), 'assigned Traditional notice survives changing selected activity');
  assert.equal(protectedSnapshot(), baseline);
  assert.deepEqual(mutations, []);

  // A failed read is not an empty set list and cannot accept a selected look.
  groupFailure = true;
  await click('travel-choice-0');
  assert.ok(text('Could not verify garment-group'));
  assert.equal(ids('travel-choice-0').length, 0);
  assert.equal(ids('travel-packed-top').length, 0, 'protected review paused');
  groupFailure = false;
  await click('travel-retry');
  assert.ok(text('3 of 5 activities'));
  groups = [];
  await React.act(async () => { poll!(); });
  assert.ok(text('membership changed'));
  await click('travel-retry');
  assert.ok(text('0 of 5 activities'), 'group changes invalidate ALL assigned choices');
  await click('travel-slot-slot-1');
  await click('travel-choice-0');
  assert.ok(text('1 of 5 activities'));

  // Same owned ID with changed canonical truth still invalidates.
  wardrobe = items.map(item => ({ ...item, fabric: 'cotton' }));
  await render();
  assert.ok(text('0 of 5 activities'));
  ready = false;
  await render();
  assert.ok(text('Loading your wardrobe'));
  assert.equal(ids('travel-choice-0').length, 0);
  await click('travel-retry');
  assert.ok(loads > 0);
  ready = true;
  await render();
  assert.ok(text('0 of 5 activities'));
  failed = true;
  await render();
  assert.equal(ids('travel-choice-0').length, 0);
  failed = false;
  await render();

  // Unavailable verification is distinct from a successful denial.
  authority = 'error';
  await click('travel-choice-0');
  assert.ok(text('Verification or styling is unavailable'));
  assert.ok(!text('A little more access'));
  authority = 'yes';
  await click('travel-retry');
  await click('travel-choice-0');
  assert.ok(text('1 of 5 activities'));
  authority = 'no';
  await click('travel-choice-0');
  assert.ok(text('A little more access'));
  assert.equal(ids('travel-packed-top').length, 0);
  authority = 'yes';
  premium = true;
  await click('travel-retry');
  assert.ok(text('0 of 1 activities'), 'confirmed loss erased the entire draft');
  await click('travel-choice-0');
  premium = false;
  unavailable = true;
  await render();
  assert.equal(ids('travel-packed-top').length, 0, 'outage pauses protected review');
  unavailable = false;
  await render();
  assert.ok(text('A little more access'), 'confirmed loss after an outage is not left as a paused grant');
  premium = true;
  await click('travel-retry');
  assert.ok(text('0 of 1 activities'), 'loss after outage also erased protected draft');

  // Account switch during verification: previous user's response must not commit.
  let release!: () => void;
  hold = new Promise<void>(resolve => { release = resolve; });
  await click('travel-choice-0');
  owner = 'another-owner';
  await render();
  await React.act(async () => { hold = undefined; release(); });
  assert.ok(text('0 of 1 activities'), 'account change resets entire draft');
  assert.equal(ids('travel-packed-top').length, 0);
  owner = null;
  await render();
  assert.ok(text('Sign in to continue'));
  assert.equal(ids('travel-choice-0').length, 0);
  owner = 'owner';
  groups = [group];
  await render();
  // Membership request completing after foreground supersession is ignored.
  let releaseGroups!: () => void;
  groupHold = new Promise<void>(resolve => { releaseGroups = resolve; });
  await click('travel-choice-0');
  wardrobe = items.map(item => ({ ...item, pattern: 'solid' }));
  await render();
  await React.act(async () => { groupHold = undefined; releaseGroups(); });
  assert.ok(text('0 of 1 activities'));
  await click('travel-choice-0');
  assert.ok(text('1 of 1 activities'));
  premium = false;
  await render();
  assert.equal(ids('travel-packed-top').length, 0, 'external confirmed entitlement loss hides immediately');
  authority = 'yes';
  premium = true;
  await click('travel-retry');
  await React.act(async () => { foreground!('active'); });
  assert.ok(text('0 of 1 activities'));
  assert.deepEqual(mutations, []);
  await React.act(async () => { focusCleanup!(); });
  assert.ok(closed > 0, 'tab blur dismisses session draft');
  await unmount();
  // New mount has no previous checklist/essentials.
  await mount();
  assert.ok(text('0 of 1 activities'));
  assert.equal(ids('travel-essential-0')[0].props['aria-checked'], false);
  await click('travel-close');
  await unmount();
  console.log(`travelCapsuleUi: mounted journey, reuse, empty coverage, ${checks} strict checks, ${reads} group reads, failures/retry, stale/account/entitlement/blur cleanup and no domain mutations passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
