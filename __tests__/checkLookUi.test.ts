import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build, type Plugin } from 'esbuild';
import React from 'react';
import type { WardrobeItem } from '../constants/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks: Record<string, string> = {
  '@expo/vector-icons': `import React from 'react'; export const Feather=props=>React.createElement('Icon',props);`,
  './query-client': `export class ApiRequestError extends Error {}
    export const authenticatedApiRequest=()=>{throw Error('Unexpected feedback request')};`,
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
  let lastCheckRequest: unknown;
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
      onOpen() {}, onClose() {}, onCheck(request) { checkCalls++; lastCheckRequest = request; },
      onRetryMembership() { membershipRetries++; },
      onUpgrade() { upgradeCalls++; }, onClearResult() {},
  };
  await React.act(async () => { screen = renderer.create(React.createElement(Component, props)); });
  const pressable = (id: string) => screen.root.findAllByType('Pressable')
    .find(node => node.props.testID === id);
  assert.equal(pressable('check-my-look-paywall'), undefined,
    'old device allowance must not block a server-owned check');
  assert.equal(pressable('check-my-look-submit')?.props.disabled, true,
    'an incomplete selection remains disabled');
  assert.equal(upgradeCalls, 0);
  assert.equal(checkCalls, 0);
  const textContent = () => screen.root.findAllByType('Text').map(node =>
    node.children.map(child => typeof child === 'string' ? child : '').join(''),
  ).join(' ');
  const text = textContent();
  assert.match(text, /Your verdict/);
  assert.match(text, /Free includes 5 look checks a day/);
  assert.doesNotMatch(text, /What works|Worth reconsidering|Possible swaps/);

  const press = async (id: string) => {
    const node = pressable(id);
    assert.ok(node, `expected ${id}`);
    await React.act(async () => { (node.props.onPress as () => void)(); });
  };
  assert.equal(pressable('check-my-look-brief-occasion-role'), undefined,
    'role chips stay hidden before an occasion is chosen');
  assert.equal(pressable('check-my-look-brief-time-of-day'), undefined,
    'time-of-day chips stay hidden before an occasion is chosen');
  assert.equal(screen.root.findAllByType('View')
    .some(node => String(node.props.testID ?? '').startsWith('check-my-look-fact-question-')), false,
  'church garment questions stay hidden before an occasion is chosen');
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
  assert.ok(pressable('check-my-look-brief-time-of-day'));
  assert.ok(pressable('check-my-look-brief-venue'));
  assert.ok(pressable('check-my-look-brief-dress-code'));
  assert.doesNotMatch(textContent(), /Denomination/);
  await press('check-my-look-brief-occasion-role');
  for (const value of ['guest', 'family', 'host', 'bridal-party', 'not-sure']) {
    assert.ok(pressable(`check-my-look-brief-occasion-role-${value}`), `role option ${value}`);
  }
  await press('check-my-look-brief-occasion-role-guest');
  await press('check-my-look-brief-time-of-day');
  for (const value of ['daytime', 'evening', 'not-sure']) {
    assert.ok(pressable(`check-my-look-brief-time-of-day-${value}`), `time option ${value}`);
  }
  await press('check-my-look-brief-time-of-day-evening');
  await press('check-my-look-brief-aso-ebi-set');
  assert.ok(pressable('check-my-look-brief-aso-ebi-set-not-sure'));
  assert.ok(pressable('check-my-look-brief-aso-ebi-set-none'));

  await press('check-my-look-occasion-funeral');
  assert.match(textContent(), /Announced colours/);
  assert.match(textContent(), /Assigned group fabric/);
  assert.match(textContent(), /Your role/);
  assert.doesNotMatch(textContent(), /Denomination/);
  assert.ok(pressable('check-my-look-brief-time-of-day'));
  await press('check-my-look-brief-occasion-role');
  assert.ok(pressable('check-my-look-brief-occasion-role-not-sure'));
  await press('check-my-look-brief-occasion-role-not-sure');
  await press('check-my-look-brief-time-of-day');
  assert.ok(pressable('check-my-look-brief-time-of-day-not-sure'));
  await press('check-my-look-brief-time-of-day-not-sure');
  await press('check-my-look-brief-announced-colours');
  assert.ok(pressable('check-my-look-brief-announced-colours-not-sure'));
  assert.ok(pressable('check-my-look-brief-announced-colours-none'));
  assert.ok(pressable('check-my-look-brief-colour-red'));
  for (const colour of ['black', 'white', 'grey', 'cream', 'beige', 'camel', 'brown', 'red']) {
    await press(`check-my-look-brief-colour-${colour}`);
  }
  assert.equal(pressable('check-my-look-brief-colour-coral')?.props.disabled, true,
    'additional funeral colours are disabled after eight selections');
  assert.match(textContent(), /Choose up to eight colours/);
  await press('check-my-look-brief-colour-black');
  assert.equal(pressable('check-my-look-brief-colour-coral')?.props.disabled, false,
    'removing a selected colour allows another choice');
  await press('check-my-look-brief-colour-coral');
  await press('check-my-look-brief-announced-colours-not-sure');
  await press('check-my-look-brief-funeral-set');
  assert.ok(pressable('check-my-look-brief-funeral-set-not-sure'));
  assert.ok(pressable('check-my-look-brief-funeral-set-none'));
  assert.ok(pressable('check-my-look-brief-funeral-set-marked-set'));
  assert.ok(pressable('check-my-look-brief-venue'));
  assert.ok(pressable('check-my-look-brief-dress-code'));

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
  await press('check-my-look-slot-top');
  await press('check-my-look-item-test-top');
  await press('check-my-look-slot-bottom');
  await press('check-my-look-item-test-bottom');

  await React.act(async () => {
    screen.update(React.createElement(Component, {
      ...props,
      items: [
        { id: 'test-top', photoUri: 'test://top', category: 'top', subType: 'blouse', colorFamily: 'navy', occasionTags: [], seasonTags: [], createdAt: '' },
        { id: 'test-bottom', photoUri: 'test://bottom', category: 'bottom', subType: 'trousers', colorFamily: 'black', occasionTags: [], seasonTags: [], createdAt: '' },
      ] as WardrobeItem[],
      freeRemaining: 3,
      membershipUnavailable: false,
    }));
  });
  await press('check-my-look-occasion-interview');
  await press('check-my-look-brief-venue');
  await press('check-my-look-brief-venue-upscale-restaurant');
  await press('check-my-look-brief-dress-code');
  await press('check-my-look-brief-dress-code-conservative');
  await press('check-my-look-slot-top');
  await press('check-my-look-item-test-top');
  await press('check-my-look-slot-bottom');
  await press('check-my-look-item-test-bottom');
  await press('check-my-look-submit');
  assert.deepEqual(lastCheckRequest, {
    selection: { itemIds: ['test-top', 'test-bottom'], occasion: 'interview' },
    brief: {
      context: 'interview', venue: 'upscale-restaurant', dressCode: 'conservative',
    },
  }, 'the transient sheet choices are forwarded with the request');
  await press('check-my-look-brief-venue');
  await press('check-my-look-brief-venue-not-sure');
  await press('check-my-look-brief-dress-code');
  await press('check-my-look-brief-dress-code-not-sure');
  await press('check-my-look-submit');
  assert.equal(checkCalls, 2, 'Not sure is optional and never blocks a check');
  await press('check-my-look-brief-venue');
  await press('check-my-look-brief-venue-upscale-restaurant');
  await press('check-my-look-brief-dress-code');
  await press('check-my-look-brief-dress-code-conservative');
  await press('check-my-look-occasion-work');
  assert.equal(pressable('check-my-look-brief-venue')?.props.accessibilityLabel, 'Venue · optional: Choose');
  assert.equal(pressable('check-my-look-brief-dress-code')?.props.accessibilityLabel, 'Dress code · optional: Choose');
  await press('check-my-look-brief-venue');
  await press('check-my-look-brief-venue-workplace');
  await press('check-my-look-brief-dress-code');
  await press('check-my-look-brief-dress-code-business');
  await press('check-my-look-backdrop');
  assert.equal(pressable('check-my-look-brief-venue')?.props.accessibilityLabel, 'Venue · optional: Choose');
  assert.equal(pressable('check-my-look-brief-dress-code')?.props.accessibilityLabel, 'Dress code · optional: Choose');

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

  const churchDress = {
    id: 'test-church-dress', photoUri: 'test://dress', category: 'dress' as const,
    subType: 'gown', colorFamily: 'navy', fabric: 'chiffon' as const,
    sleeveLength: 'long' as const, occasionTags: [], seasonTags: [], createdAt: '',
  };
  await React.act(async () => {
    screen.update(React.createElement(Component, {
      ...props, items: [churchDress], freeRemaining: 3, result: null,
    }));
  });
  await press('check-my-look-occasion-church');
  await press('check-my-look-slot-dress');
  await press('check-my-look-item-test-church-dress');
  await press('check-my-look-brief-denomination');
  await press('check-my-look-brief-denomination-anglican');
  assert.ok(pressable('check-my-look-fact-test-church-dress-hemPosition-field'));
  await press('check-my-look-fact-test-church-dress-hemPosition-field');
  assert.ok(pressable('check-my-look-fact-test-church-dress-hemPosition-above-knee'));
  assert.ok(pressable('check-my-look-fact-test-church-dress-hemPosition-at-knee'));
  assert.ok(pressable('check-my-look-fact-test-church-dress-hemPosition-below-knee'));
  assert.ok(pressable('check-my-look-fact-test-church-dress-hemPosition-floor-length'));
  assert.ok(pressable('check-my-look-fact-test-church-dress-hemPosition-not-sure'));
  await press('check-my-look-fact-test-church-dress-hemPosition-at-knee');
  await press('check-my-look-fact-test-church-dress-backAndStraps-field');
  assert.ok(pressable('check-my-look-fact-test-church-dress-backAndStraps-covered'));
  assert.ok(pressable('check-my-look-fact-test-church-dress-backAndStraps-covered-layer'));
  assert.ok(pressable('check-my-look-fact-test-church-dress-backAndStraps-no-cover'));
  assert.ok(pressable('check-my-look-fact-test-church-dress-backAndStraps-not-sure'));
  await press('check-my-look-fact-test-church-dress-backAndStraps-covered');
  await press('check-my-look-fact-test-church-dress-sleeveLining-field');
  assert.ok(pressable('check-my-look-fact-test-church-dress-sleeveLining-lined'));
  assert.ok(pressable('check-my-look-fact-test-church-dress-sleeveLining-sheer'));
  assert.ok(pressable('check-my-look-fact-test-church-dress-sleeveLining-not-sure'));
  await press('check-my-look-fact-test-church-dress-sleeveLining-lined');
  await press('check-my-look-submit');
  assert.deepEqual(lastCheckRequest, {
    selection: { itemIds: ['test-church-dress'], occasion: 'event', temperatureC: 22 },
    brief: {
      context: 'church', denomination: 'anglican',
    },
    garmentFacts: {
      'test-church-dress': {
        hemPosition: 'at-or-below-knee', backOrStrapCoverage: 'covered', sleeveLining: 'lined',
      },
    },
  }, 'church chip values map to the transient route garmentFacts structure');

  const unknownDress = { ...churchDress, id: 'test-unknown-dress' };
  await React.act(async () => {
    screen.update(React.createElement(Component, {
      ...props, items: [unknownDress], freeRemaining: 3, result: null,
    }));
  });
  await press('check-my-look-occasion-church');
  await press('check-my-look-item-test-unknown-dress');
  await press('check-my-look-brief-denomination');
  await press('check-my-look-brief-denomination-anglican');
  await press('check-my-look-fact-test-unknown-dress-hemPosition-field');
  await press('check-my-look-fact-test-unknown-dress-hemPosition-not-sure');
  await press('check-my-look-fact-test-unknown-dress-backAndStraps-field');
  await press('check-my-look-fact-test-unknown-dress-backAndStraps-not-sure');
  await press('check-my-look-fact-test-unknown-dress-sleeveLining-field');
  await press('check-my-look-fact-test-unknown-dress-sleeveLining-not-sure');
  await press('check-my-look-submit');
  assert.equal(checkCalls, 4, 'Not sure allows the server to ask, without fabricating garment facts');
  assert.deepEqual((lastCheckRequest as { garmentFacts: unknown }).garmentFacts, {
    'test-unknown-dress': { sleeveLining: 'not-sure' },
  }, 'unknown hem and back/strap facts remain absent; explicit lining uncertainty is retained');

  await press('check-my-look-occasion-wedding');
  await press('check-my-look-brief-occasion-role');
  assert.ok(pressable('check-my-look-brief-occasion-role-not-sure'));
  await press('check-my-look-brief-occasion-role-family');
  await press('check-my-look-brief-time-of-day');
  await press('check-my-look-brief-time-of-day-daytime');
  await press('check-my-look-submit');
  assert.deepEqual((lastCheckRequest as { brief: unknown }).brief, {
    context: 'wedding', role: 'family', timeOfDay: 'daytime',
  }, 'the selected optional role and time of day remain transient in the request');
  await press('check-my-look-occasion-owambe');
  await press('check-my-look-brief-occasion-role');
  await press('check-my-look-brief-occasion-role-guest');
  await press('check-my-look-brief-aso-ebi-set');
  await press('check-my-look-brief-aso-ebi-set-none');
  await press('check-my-look-brief-time-of-day');
  await press('check-my-look-brief-time-of-day-evening');
  await press('check-my-look-submit');
  assert.deepEqual((lastCheckRequest as { brief: unknown }).brief, {
    context: 'owambe', role: 'guest', asoEbiGroupId: 'none', timeOfDay: 'evening',
  }, 'Owambe chips use the route brief fields without persistence');
  assert.equal((lastCheckRequest as { garmentFacts?: unknown }).garmentFacts, undefined,
    'church-only facts are cleared when the occasion changes');
  await React.act(async () => { screen.unmount(); });

  const shortsTop = {
    id: 'test-shorts-top', photoUri: 'test://top', category: 'top' as const,
    subType: 'blouse', colorFamily: 'navy', sleeveLength: 'long' as const,
    occasionTags: [], seasonTags: [], createdAt: '',
  };
  const shortsBottom = {
    id: 'test-church-shorts', photoUri: 'test://shorts', category: 'bottom' as const,
    subType: 'shorts', colorFamily: 'black', occasionTags: [], seasonTags: [], createdAt: '',
  };
  await React.act(async () => {
    screen = renderer.create(React.createElement(Component, {
      ...props, items: [shortsTop, shortsBottom] as WardrobeItem[], result: null,
    }));
  });
  await press('check-my-look-slot-top');
  await press(`check-my-look-item-${shortsTop.id}`);
  await press('check-my-look-slot-bottom');
  await press(`check-my-look-item-${shortsBottom.id}`);
  await press('check-my-look-occasion-church');
  await press('check-my-look-brief-denomination');
  await press('check-my-look-brief-denomination-anglican');
  await press(`check-my-look-fact-${shortsTop.id}-backAndStraps-field`);
  await press(`check-my-look-fact-${shortsTop.id}-backAndStraps-not-sure`);
  assert.ok(pressable(`check-my-look-fact-${shortsBottom.id}-hemPosition-field`),
    'shorts expose the church hem question');
  await press(`check-my-look-fact-${shortsBottom.id}-hemPosition-field`);
  for (const value of ['above-knee', 'at-knee', 'below-knee', 'floor-length', 'not-sure']) {
    assert.ok(pressable(`check-my-look-fact-${shortsBottom.id}-hemPosition-${value}`),
      `${value} hem choice is shown for shorts`);
  }
  await React.act(async () => { screen.unmount(); });
  console.log('Check My Look free verdict privacy, transient chip payloads and server-owned quota entry passed.');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
