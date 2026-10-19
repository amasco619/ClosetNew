import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { build } from 'esbuild';
import { bulkCardActivity } from '../lib/aiProcessingPreferenceState';

type Preference = 'not_asked' | 'declined' | 'allowed';
const model = {
  stored: 'not_asked' as Preference,
  calls: [] as string[],
  transport: async (_method: string, _data?: { state: Preference }): Promise<Response> => new Response(),
};
Object.assign(globalThis, { __aiPreferenceTest: model, IS_REACT_ACT_ENVIRONMENT: true });
const mocks: Record<string, string> = {
  'expo-router': `import React from 'react'; export const useFocusEffect=cb=>React.useEffect(cb,[cb]);`,
  '@/lib/query-client': `
    export class ApiRequestError extends Error {
      constructor(message,kind,status){super(message);this.kind=kind;this.status=status;}
    }
    export const authenticatedApiRequest=(method,route,data)=>globalThis.__aiPreferenceTest.transport(method,data);
  `,
  '@/lib/uploadErrors': `export const UPLOAD_DIAGNOSTICS_ENABLED=false;`,
  'react-native': `
    import React from 'react';
    const host=name=>({children,...props})=>React.createElement(name,props,children);
    export const View=host('View'), Text=host('Text'), ScrollView=host('ScrollView'), Pressable=host('Pressable'), Modal=host('Modal');
    export const StyleSheet={create:x=>x,absoluteFill:{}}, Dimensions={get:()=>({height:800})}, Linking={};
    export const PanResponder={create:()=>({panHandlers:{}})};
    class Value {setValue(){} interpolate(){return 1;}}
    const animation=()=>({start:cb=>cb?.({finished:true})});
    export const Animated={Value,View:host('AnimatedView'),timing:animation,spring:animation};
  `,
};

async function main() {
  const bundle = await build({
    stdin: {
      contents: `export {useAiProcessingPreference} from './lib/useAiProcessingPreference';
        export * from './lib/aiProcessingPreference';
        export {ApiRequestError} from '@/lib/query-client';
        export {AiProcessingConsent} from './components/AiProcessingConsent';`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    plugins: [{
      name: 'preference-io',
      setup(b) {
        b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path)
          ? { path: args.path, namespace: 'mock' } : undefined);
        b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
      },
    }],
  });
  const requireProject = createRequire(path.join(process.cwd(), 'package.json'));
  const mod = { exports: {} as any };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(requireProject, mod, mod.exports);
  const api = mod.exports;
  const renderer = requireProject('react-test-renderer');
  let state: ReturnType<typeof api.useAiProcessingPreference>;
  function Harness({ account = 'a' }: { account?: string }) {
    state = api.useAiProcessingPreference(false, account);
    return null;
  }
  const response = (saved: Preference) => new Response(JSON.stringify({ state: saved }));
  const normal = async (method: string, data?: { state: Preference }) => {
    model.calls.push(method);
    if (method === 'PUT') model.stored = data!.state;
    return response(model.stored);
  };
  const originalTimeout = globalThis.setTimeout;
  const deadlines: (() => void)[] = [];
  // Fire only the preference deadline explicitly, without waiting ten real seconds.
  globalThis.setTimeout = ((callback: () => void, ms: number, ...args: unknown[]) => {
    if (ms === api.AI_PREFERENCE_TIMEOUT_MS) deadlines.push(callback);
    return originalTimeout(callback, ms, ...args);
  }) as typeof setTimeout;
  let mounted: any;
  try {
    for (const initial of ['not_asked', 'declined', 'allowed'] as const) {
      for (const enabled of [true, false]) {
        for (const outcome of ['success', 'failure', 'timeout', '429'] as const) {
          model.stored = initial;
          model.calls = [];
          model.transport = normal;
          await React.act(async () => { mounted = renderer.create(React.createElement(Harness)); });
          const action = enabled
            ? initial === 'allowed' ? 'unchanged' : 'consent'
            : initial === 'declined' ? 'unchanged' : 'write';
          model.calls = [];
          if (action === 'consent') {
            await React.act(async () => state.toggle(true));
            assert.equal(state.showConsent, true);
            await React.act(async () => state.dismiss());
            assert.equal(state.showConsent, false);
            assert.deepEqual(model.calls, [], 'Not now writes nothing');
            await React.act(async () => state.toggle(true));
          }
          model.transport = async (method, data) => {
            if (method === 'PUT' && outcome !== 'success') {
              model.calls.push(method);
              if (outcome === 'timeout') return new Promise(() => {});
              throw new api.ApiRequestError('test', 'server', outcome === '429' ? 429 : 503);
            }
            return normal(method, data);
          };
          await React.act(async () => {
            if (action === 'consent') state.allow();
            else state.toggle(enabled);
          });
          if (action !== 'unchanged' && outcome === 'timeout') {
            assert.equal(state.saving, true);
            await React.act(async () => { deadlines.at(-1)!(); });
          }
          assert.equal(state.saving, false);
          if (action === 'unchanged') {
            assert.deepEqual(model.calls, []);
            assert.equal(state.preference, initial);
          } else if (outcome === 'success') {
            assert.equal(state.preference, enabled ? 'allowed' : 'declined');
            assert.deepEqual(model.calls, ['PUT', 'GET'], 'write is re-read authoritatively');
            assert.equal(state.error, null);
            assert.equal(state.showConsent, false);
          } else {
            assert.equal(state.preference, initial, 'failure cannot leave optimistic state');
            assert.ok(state.error);
            if (outcome === '429') assert.match(state.error, /Too many changes/);
            if (outcome === 'timeout') assert.match(state.error, /reach the server/);
            model.transport = normal;
            await React.act(async () => { await state.refresh(); });
            assert.equal(state.error, null);
            assert.equal(state.loading, false);
          }
          await React.act(async () => mounted.unmount());
        }
      }
    }

    // Covers offline body parsing, not only a fetch that never returns.
    model.transport = async () => ({ json: () => new Promise(() => {}) }) as Response;
    const stalled = api.getAiProcessingPreference();
    const timeoutCheck = assert.rejects(stalled, /timed out/);
    await React.act(async () => { await Promise.resolve(); deadlines.at(-1)!(); });
    await timeoutCheck;

    let resolveOld!: (response: Response) => void;
    model.transport = () => new Promise(resolve => { resolveOld = resolve; });
    await React.act(async () => { mounted = renderer.create(React.createElement(Harness)); });
    model.transport = normal;
    model.stored = 'declined';
    await React.act(async () => mounted.update(React.createElement(Harness, { account: 'b' })));
    await React.act(async () => resolveOld(response('allowed')));
    assert.equal(state.preference, 'declined', 'late previous-account read is ignored');
    // Focus refresh (same entry point used by useFocusEffect) sees bulk's change.
    model.stored = 'allowed';
    await React.act(async () => { await state.refresh(); });
    assert.equal(state.preference, 'allowed');

    // Save completion from an old account cannot alter the new account or sheet.
    let resolveWrite!: (response: Response) => void;
    model.transport = (method, data) => method === 'PUT'
      ? new Promise(resolve => { resolveWrite = resolve; }) : normal(method, data);
    await React.act(async () => state.toggle(false));
    assert.equal(state.saving, true);
    model.stored = 'declined';
    model.transport = normal;
    await React.act(async () => mounted.update(React.createElement(Harness, { account: 'c' })));
    await React.act(async () => resolveWrite(response('declined')));
    assert.equal(state.preference, 'declined');
    assert.equal(state.saving, false);
    assert.equal(state.showConsent, false);

    // A load failure is retryable and clears on the very next refresh.
    model.transport = async () => { throw new api.ApiRequestError('offline', 'network'); };
    await React.act(async () => { await state.refresh(); });
    assert.equal(state.unavailable, true);
    assert.equal(state.loading, false);
    assert.match(state.error, /reach the server/);
    model.transport = normal;
    await React.act(async () => { await state.refresh(); });
    assert.equal(state.unavailable, false);
    assert.equal(state.error, null);

    // Offline failure of both write and reconciliation must leave Allow
    // retryable inside the still-open sheet, not an enabled-but-dead button.
    await React.act(async () => state.toggle(true));
    model.transport = async () => { throw new api.ApiRequestError('offline', 'network'); };
    await React.act(async () => state.allow());
    assert.equal(state.showConsent, true);
    assert.equal(state.unavailable, true);
    assert.equal(state.saving, false);
    model.transport = normal;
    await React.act(async () => state.allow());
    assert.equal(state.preference, 'allowed');
    assert.equal(state.unavailable, false);
    assert.equal(state.showConsent, false);

    model.stored = 'not_asked';
    await React.act(async () => { await state.refresh(); state.toggle(true); });
    await React.act(async () => state.toggle(true));
    let finishSave!: (response: Response) => void;
    model.transport = (method, data) => method === 'PUT'
      ? new Promise(resolve => { finishSave = resolve; }) : normal(method, data);
    await React.act(async () => state.allow());
    assert.equal(state.saving, true);
    const beforeDismiss = model.calls.length;
    await React.act(async () => state.dismiss());
    assert.equal(state.showConsent, false);
    assert.equal(model.calls.length, beforeDismiss, 'Not now does not issue another write during a save');
    model.stored = 'allowed';
    await React.act(async () => finishSave(response('allowed')));
    assert.equal(state.saving, false);

    // An initial offline read cannot leave Profile loading forever.
    model.transport = () => new Promise(() => {});
    await React.act(async () => { void state.refresh(); });
    assert.equal(state.loading, true);
    await React.act(async () => deadlines.at(-1)!());
    assert.equal(state.loading, false);
    assert.equal(state.unavailable, true);

    // A successful acknowledgement with a different authoritative read cannot
    // grant ON; malformed data cannot silently become consent either.
    model.transport = async method => response(method === 'PUT' ? 'allowed' : 'declined');
    await assert.rejects(api.setAiProcessingPreference('allowed'), /could not be saved/);
    model.transport = async () => new Response('{"state":"unknown"}');
    await assert.rejects(api.getAiProcessingPreference(), /invalid/);

    // An actual disclosure with a busy save still permits Not now and exposes errors.
    await React.act(async () => mounted.unmount());
    let dismissed = 0;
    await React.act(async () => {
      mounted = renderer.create(React.createElement(api.AiProcessingConsent, {
        visible: true, context: 'profile', busy: true, error: 'Save failed',
        onAllow: () => {}, onDismiss: () => { dismissed++; },
      }));
    });
    const notNow = mounted.root.findAllByType('Pressable').find((n: any) =>
      n.findAllByType('Text').some((t: any) => t.children.includes('Not now')));
    assert.ok(notNow);
    assert.equal(notNow.props.disabled, false);
    await React.act(async () => notNow.props.onPress());
    assert.equal(dismissed, 1);
    assert.ok(mounted.root.findAllByType('Text').some((n: any) => n.props.accessibilityRole === 'alert'));
    await React.act(async () => mounted.unmount());

    for (const preference of ['checking', 'unavailable', 'not_asked', 'declined', 'allowed']) {
      for (const status of ['pending', 'classifying', 'manual', 'settled', 'error', 'saved']) {
        for (const inFlight of [false, true]) {
          const card = bulkCardActivity(status, preference, inFlight);
          assert.equal(card.processing, status === 'classifying' && preference === 'allowed' && inFlight);
          assert.equal(card.waiting, status === 'pending' || (status === 'classifying' && (preference !== 'allowed' || !inFlight)));
          if (preference === 'unavailable') assert.equal(card.label, 'Waiting for connection');
          if (preference === 'declined') assert.equal(card.label, 'Awaiting permission');
        }
      }
    }
    console.log('Preference matrix, read-back, errors/retry, ten-second deadline, account isolation, disclosure dismissal and card mapping passed');
  } finally {
    globalThis.setTimeout = originalTimeout;
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
