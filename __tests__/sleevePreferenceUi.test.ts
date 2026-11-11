import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import { defaultProfile } from '../shared/profile-personalization';
import { minimumSleeveLength, type SleeveConstraints } from '../shared/sleevePreference';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mocks: Record<string, string> = {
  'react-native': `import React from 'react';
    const host=name=>({children,...props})=>React.createElement(name,props,children);
    export const View=host('View'),Text=host('Text'),Pressable=host('Pressable'),
      ScrollView=host('ScrollView'),Switch=host('Switch');
    export const LayoutAnimation={configureNext(){}};
    export const StyleSheet={create:value=>value,hairlineWidth:1};`,
  '@expo/vector-icons': `export const Ionicons=()=>null;`,
  'expo-router': `export const router={back(){}};`,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
  'expo-haptics': `export const selectionAsync=async()=>{};`,
  'react-native-reanimated': `export const useReducedMotion=()=>true;`,
  '@/contexts/AppContext': `export const useApp=()=>globalThis.__sleeveTestApp;`,
};

async function main() {
  const bundled = await build({
    entryPoints: ['app/refinements.tsx'], bundle: true, platform: 'node', format: 'cjs',
    write: false, jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
    plugins: [{
      name: 'sleeve-native-mocks',
      setup(bundle) {
        bundle.onResolve({ filter: /.*/ }, args =>
          Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'mock' } : undefined);
        bundle.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({
          contents: mocks[args.path], loader: 'js',
        }));
      },
    }],
  });
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const module = { exports: {} as { default: React.ComponentType } };
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(require, module, module.exports);
  const renderer = require('react-test-renderer');
  for (const legacy of [true, false, undefined]) {
    let constraints: SleeveConstraints = { ...defaultProfile.constraints };
    if (legacy === undefined) delete constraints.noSleeveless;
    else constraints.noSleeveless = legacy;
    const updates: SleeveConstraints[] = [];
    const context = {
      profile: { ...defaultProfile, constraints },
      updateProfile(update: { constraints: SleeveConstraints }) {
        updates.push(update.constraints);
        context.profile = { ...context.profile, constraints: update.constraints };
      },
    };
    Object.assign(globalThis, { __sleeveTestApp: context });
    let screen: any;
    await React.act(async () => { screen = renderer.create(React.createElement(module.exports.default)); });
    const buttons = () => screen.root.findAllByType('Pressable');
    const textOf = (node: any) => node.findAllByType('Text').map((text: any) => text.children.join('')).join(' ');
    await React.act(async () => { buttons().find((node: any) => textOf(node).startsWith('Style')).props.onPress(); });
    const chip = (label: string) => buttons().find((node: any) => textOf(node) === label);
    assert.equal(chip(legacy ? 'Short sleeves' : 'No preference').props.accessibilityState.selected, true);
    assert.equal(updates.length, 0, 'opening the screen must not persist the fallback');
    assert.equal(chip('No sleeveless'), undefined, 'the old toggle is superseded');
    for (const [label, value] of [
      ['Long sleeves', 'long'], ['Three-quarter sleeves', 'three-quarter'],
      ['Short sleeves', 'short'], ['No preference', 'none'],
    ] as const) {
      await React.act(async () => { chip(label).props.onPress(); });
      assert.equal(minimumSleeveLength(context.profile.constraints), value);
      assert.equal(context.profile.constraints.noSleeveless, value !== 'none');
      await React.act(async () => { screen.update(React.createElement(module.exports.default)); });
      assert.equal(chip(label).props.accessibilityState.selected, true);
    }
    await React.act(async () => { screen.unmount(); });
  }
  Reflect.deleteProperty(globalThis, '__sleeveTestApp');
  console.log('Shortest sleeve Refinements: legacy display, no mount writes and all four edits passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
