import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { dismissAllIfPossible } from '../lib/navigation';

const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'));
const { StackRouter, StackActions } = requireFromProject(
  'expo-router/build/react-navigation/routers/StackRouter',
);
const stack = StackRouter({});
const options = { routeParamList: {}, routeGetIdList: {} };

function navigationWithRoutes(names: string[]) {
  let state = stack.getInitialState({
    routeNames: names,
    routeParamList: {},
  });
  for (const name of names.slice(1)) {
    state = stack.getStateForAction(state, StackActions.push(name), options)!;
  }
  let dismissCalls = 0;
  return {
    canDismiss: () => state.routes.length > 1,
    dismissAll: () => {
      dismissCalls++;
      state = stack.getStateForAction(state, StackActions.popToTop(), options)!;
    },
    get state() { return state; },
    get dismissCalls() { return dismissCalls; },
  };
}

const singleRoute = navigationWithRoutes(['sign-in']);
assert.equal(dismissAllIfPossible(singleRoute), false);
assert.equal(singleRoute.dismissCalls, 0, 'a sole route never dispatches POP_TO_TOP');
assert.deepEqual(
  singleRoute.state.routes.map((route: any) => route.name),
  ['sign-in'],
);

const multipleRoutes = navigationWithRoutes(['(tabs)', 'sign-in', 'forgot-password']);
assert.equal(dismissAllIfPossible(multipleRoutes), true);
assert.equal(multipleRoutes.dismissCalls, 1);
assert.deepEqual(
  multipleRoutes.state.routes.map((route: any) => route.name),
  ['(tabs)'],
  'a multi-route stack is reduced to its root route',
);
assert.equal(dismissAllIfPossible(multipleRoutes), false);
assert.equal(multipleRoutes.dismissCalls, 1, 'a repeated reset becomes a no-op after the first pop');

console.log('Guarded dismissAll handles single-route and multi-route navigation stacks.');
