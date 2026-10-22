import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
const normalSignOut = profile.match(/const handleSignOut = async \(\) => \{([\s\S]*?)\n  \};/)?.[1];
assert.ok(normalSignOut, 'normal profile sign-out handler exists');
assert.match(
  normalSignOut,
  /try \{\s*await signOut\(\);\s*router\.dismissAll\(\);\s*router\.replace\('\/sign-in'\);\s*\} catch/,
  'normal sign-out clears the old tab stack only after sign-out succeeds',
);
assert.match(
  profile,
  /if \(signedOut\) \{\s*\/\/ Remove the old tabs from navigation history so Android Back cannot reopen deleted account UI\.\s*router\.dismissAll\(\);\s*router\.replace\('\/sign-in'\);\s*\}/,
  'successful deletion and sign-out clear the stale tab stack before showing sign-in',
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
