import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build, type Plugin } from 'esbuild';
import React from 'react';
import type { WardrobeItem } from '../constants/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks: Record<string, string> = {
  'react-native': `import React from 'react';
    const host=name=>({children,...props})=>React.createElement(name,props,children);
    export const View=host('View'),Text=host('Text'),Pressable=host('Pressable'),
      ScrollView=host('ScrollView'),Modal=host('Modal'),TextInput=host('TextInput');
    export const Keyboard={dismiss(){}};
    export const StyleSheet={create:value=>value,absoluteFill:{position:'absolute',top:0,right:0,bottom:0,left:0}};`,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
  '@/constants/colors': `const Colors={primary:'#101826',secondary:'#D0B892',sage:'#8AA39B',background:'#F5F3F0',cardBackground:'#FFFFFF',textSecondary:'#626A73',textLight:'#9CA3AF',textOnDark:'#F5F3F0',border:'#E8E5E0',garmentStudioTop:'#F3F0EB',overlay:'rgba(16,24,38,.5)',success:'#6AAF7B',warning:'#E0A84D',error:'#D4605A'};export default Colors;`,
  '@/constants/wardrobeLabels': `export const wardrobeItemDisplayName=(colour,subtype)=>colour+' '+subtype;export const wardrobeValueLabel=value=>value;`,
  '@/lib/lookCardPresentation': `export const isHeadwearSubtype=value=>['gele','headwrap','head-scarf','headscarf','stole','hat','sunhat','cap'].includes(value);`,
};
const plugin: Plugin = {
  name: 'check-look-native-fixtures',
  setup(bundle) {
    bundle.onResolve({ filter: /.*/ }, args =>
      Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined,
    );
    bundle.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
      contents: mocks[args.path], loader: 'js', resolveDir: process.cwd(),
    }));
  },
};

async function main() {
  const bundled = await build({
    entryPoints: ['components/CheckMyLookSheet.tsx'],
    bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic',
    plugins: [plugin], external: ['react', 'react/jsx-runtime'],
  });
  const requireProject = createRequire(path.join(process.cwd(), 'package.json'));
  const module = { exports: {} as Record<string, unknown> };
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(
    requireProject, module, module.exports,
  );
  const Component = module.exports.CheckMyLookSheet as React.ComponentType<{
    visible: boolean;
    items: WardrobeItem[];
    isPremium: boolean;
    freeRemaining: number;
    allowanceLoading: boolean;
    membershipLoading: boolean;
    membershipUnavailable: boolean;
    groups: Array<Record<string, unknown>>;
    constraints?: Record<string, unknown>;
    checking: boolean;
    weatherTemperatureC?: number | null;
    result: { tier: 'free'; verdict: 'Works' | 'Almost' | 'Rethink' }
      | { tier: 'free'; verdict: 'Not judged'; message: string } | null;
    onOpen(): void;
    onClose(): void;
    onCheck(request?: unknown): void;
    onRetryMembership(): void;
    onUpgrade(): void;
    onClearResult(): void;
  }>;
  const renderer = requireProject('react-test-renderer');
  let upgradeCalls = 0;
  let checkCalls = 0;
  let membershipRetries = 0;
  let screen!: {
    root: { findAllByType(type: string): Array<{ props: Record<string, unknown>; children: unknown[] }> };
    update(element: React.ReactElement): void;
    unmount(): void;
  };
  const props: React.ComponentProps<typeof Component> = {
      visible: true, items: [], isPremium: false, freeRemaining: 0,
      allowanceLoading: false, membershipLoading: false, membershipUnavailable: false,
      groups: [{
        id: 'marked-set', relationshipType: 'coordinated_set',
        confirmationStatus: 'user_confirmed', members: [{ garmentId: 'test-top' }],
      }],
      checking: false, weatherTemperatureC: null as number | null, result: { tier: 'free' as const, verdict: 'Almost' as const },
      onOpen() {}, onClose() {}, onCheck() { checkCalls++; },
      onRetryMembership() { membershipRetries++; },
      onUpgrade() { upgradeCalls++; }, onClearResult() {},
  };
  await React.act(async () => { screen = renderer.create(React.createElement(Component, props)); });
  const pressable = (id: string) => screen.root.findAllByType('Pressable')
    .find(node => node.props.testID === id);
  const paywall = pressable('check-my-look-paywall');
  assert.ok(paywall, 'zero free allowance renders the paywall action');
  assert.notEqual(paywall.props.disabled, true);
  await React.act(async () => { (paywall.props.onPress as () => void)(); });
  assert.equal(upgradeCalls, 1);
  assert.equal(checkCalls, 0, 'zero allowance cannot compute another verdict');
  const textContent = () => screen.root.findAllByType('Text').map(node =>
    node.children.map(child => typeof child === 'string' ? child : '').join(''),
  ).join(' ');
  const text = textContent();
  assert.match(text, /Your verdict/);
  assert.match(text, /Premium offers a fuller review/);
  assert.doesNotMatch(text, /What works|Worth reconsidering|Possible swaps/);

  const press = async (id: string) => {
    const node = pressable(id);
    assert.ok(node, `expected ${id}`);
    await React.act(async () => { (node.props.onPress as () => void)(); });
  };
  await press('check-my-look-occasion-church');
  assert.match(textContent(), /Denomination/);
  assert.doesNotMatch(textContent(), /Announced colours|Your role|Assigned aso-ebi/);
  await press('check-my-look-brief-denomination');
  assert.ok(pressable('check-my-look-brief-denomination-not-sure'));
  assert.ok(pressable('check-my-look-brief-denomination-catholic'));
  await press('check-my-look-brief-denomination-not-sure');
  assert.match(textContent(), /Denomination Not sure/);

  await press('check-my-look-occasion-traditional-wedding');
  assert.match(textContent(), /Your role/);
  assert.match(textContent(), /Assigned aso-ebi/);
  assert.doesNotMatch(textContent(), /Denomination/);
  await press('check-my-look-brief-aso-ebi-set');
  assert.ok(pressable('check-my-look-brief-aso-ebi-set-not-sure'));
  assert.ok(pressable('check-my-look-brief-aso-ebi-set-none'));

  await press('check-my-look-occasion-funeral');
  assert.match(textContent(), /Announced colours/);
  assert.match(textContent(), /Assigned group fabric/);
  assert.doesNotMatch(textContent(), /Your role|Denomination/);
  await press('check-my-look-brief-announced-colours');
  assert.ok(pressable('check-my-look-brief-announced-colours-not-sure'));
  assert.ok(pressable('check-my-look-brief-announced-colours-none'));
  assert.ok(pressable('check-my-look-brief-colour-red'));
  await press('check-my-look-brief-funeral-set');
  assert.ok(pressable('check-my-look-brief-funeral-set-not-sure'));
  assert.ok(pressable('check-my-look-brief-funeral-set-none'));
  assert.ok(pressable('check-my-look-brief-funeral-set-marked-set'));

  await React.act(async () => {
    screen.update(React.createElement(Component, {
      ...props,
      items: [
        { id: 'test-top', photoUri: 'test://top', category: 'top', subType: 'blouse', colorFamily: 'navy', occasionTags: [], seasonTags: [], createdAt: '' },
        { id: 'test-bottom', photoUri: 'test://bottom', category: 'bottom', subType: 'trousers', colorFamily: 'black', occasionTags: [], seasonTags: [], createdAt: '' },
        { id: 'test-hijab', photoUri: 'test://hijab', category: 'jewelry', subType: 'hijab', colorFamily: 'navy', occasionTags: [], seasonTags: [], createdAt: '' },
      ] as WardrobeItem[],
      freeRemaining: 3,
      membershipUnavailable: true,
    }));
  });
  await press('check-my-look-slot-top');
  await press('check-my-look-item-test-top');
  await press('check-my-look-slot-bottom');
  await press('check-my-look-item-test-bottom');
  await press('check-my-look-slot-headwear');
  assert.ok(pressable('check-my-look-item-test-hijab'),
    'covering items can be selected in the headwear slot');
  await press('check-my-look-item-test-hijab');
  assert.equal(pressable('check-my-look-submit')?.props.disabled, true,
    'membership failure blocks an otherwise valid look');
  assert.match(textContent(), /Retry before reviewing this look/);
  await press('check-my-look-membership-retry');
  assert.equal(membershipRetries, 1);

  const temperatureInput = () => screen.root.findAllByType('TextInput')
    .find(node => node.props.accessibilityLabel === 'Temperature in degrees Celsius');
  assert.equal(temperatureInput()?.props.value, '', 'no forecast leaves the field empty');
  assert.equal(temperatureInput()?.props.placeholder, 'e.g. 18', 'empty temperature field has a useful placeholder');
  await React.act(async () => {
    screen.update(React.createElement(Component, { ...props, weatherTemperatureC: 19 }));
  });
  assert.equal(temperatureInput()?.props.value, '19', 'cached forecast temperature prefills the editable input');
  await React.act(async () => { (temperatureInput()?.props.onChangeText as (value: string) => void)('22'); });
  assert.equal(temperatureInput()?.props.value, '22', 'manual temperature edits replace the forecast value');
  await React.act(async () => {
    screen.update(React.createElement(Component, {
      ...props,
      weatherTemperatureC: null,
      result: { tier: 'free', verdict: 'Not judged', message: "Traditional looks need a stylist's eye. We are still learning these." },
    }));
  });
  const notJudgedText = screen.root.findAllByType('Text').map(node =>
    node.children.map(child => typeof child === 'string' ? child : '').join(''),
  ).join(' ');
  assert.match(notJudgedText, /Traditional looks need a stylist's eye\. We are still learning these\./);
  assert.doesNotMatch(notJudgedText, /What works|Worth reconsidering|Possible swaps/);
  await React.act(async () => { screen.unmount(); });
  console.log('Check My Look free verdict visibility and zero-allowance paywall passed.');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
