import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import type { CheckMyLookSheetProps } from '../components/CheckMyLookSheet';
import type { CheckLookRequest } from '../lib/checkLookGuard';
import { judgeRequestSchema } from '../server/checkLookJudgeInput';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mocks: Record<string, string> = {
  '@expo/vector-icons': `import React from 'react'; export const Feather=props=>React.createElement('Icon',props);`,
  'react-native': `import React from 'react';
    const host=name=>({children,...props})=>React.createElement(name,props,children);
    export const View=host('View'),Text=host('Text'),Pressable=host('Pressable'),
      ScrollView=host('ScrollView'),Modal=host('Modal'),TextInput=host('TextInput');
    export const Keyboard={dismiss(){}};
    export const AppState={currentState:'active',addEventListener(){return {remove(){}}}};
    export const StyleSheet={create:value=>value,absoluteFill:{}};`,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
  '@/lib/lookCardPresentation': `export const isHeadwearSubtype=value=>['gele','hijab'].includes(value);`,
  './query-client': `export class ApiRequestError extends Error {
    constructor(message,kind,status,code){super(message);this.kind=kind;this.status=status;this.code=code}
    } export const authenticatedApiRequest=()=>{throw Error('Missing test transport')};`,
};
async function main() {
  const built = await build({
    stdin: { contents: `
      export {CheckMyLookSheet} from './components/CheckMyLookSheet';
      export {useCheckLookReview} from './hooks/useCheckLookReview';
      export * from './lib/checkLookClient';
      export {ApiRequestError} from './lib/query-client';
    `, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    plugins: [{ name: 'judge-client-fixtures', setup(bundle) {
      bundle.onResolve({ filter: /.*/ }, args => {
        const key = args.path === './lib/query-client' ? './query-client' : args.path;
        return Object.hasOwn(mocks, key) ? { path: key, namespace: 'mock' } : undefined;
      });
      bundle.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({
        contents: mocks[args.path], loader: 'js', resolveDir: process.cwd(),
      }));
    } }],
  });
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports);
  const api = module.exports;
  const renderer = require('react-test-renderer');
  const top = { id: '00000000-0000-4000-8000-000000000001', category: 'top', subType: 'blouse',
    colorFamily: 'navy', sleeveLength: 'long', fabric: 'cotton', photoUri: '', occasionTags: [], seasonTags: [], createdAt: '' };
  const bottom = { ...top, id: '00000000-0000-4000-8000-000000000002', category: 'bottom', subType: 'trousers' };
  const replacement = { ...top, id: '00000000-0000-4000-8000-000000000003', colorFamily: 'cream' };
  const dress = { ...top, id: '00000000-0000-4000-8000-000000000004', category: 'dress', subType: 'midi-dress' };
  let calls: any[] = [];
  let localCalls = 0;
  let handler: () => Promise<Response>;
  let controls: any;
  let latestRequest: CheckLookRequest;
  let screen: any;
  let traditional = false;
  let ownerId = 'test-owner';
  const reply = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });
  const fail = (kind: string, status?: number, code?: string) => async () => {
    throw new api.ApiRequestError('DO NOT SHOW RAW SERVER DETAILS', kind, status, code);
  };
  function Harness({ premium = false, guardFailure = false }: { premium?: boolean; guardFailure?: boolean }) {
    controls = api.useCheckLookReview({
      premium, ownerId,
      localCheck: async () => {
        localCalls++;
        return traditional
          ? { tier: premium ? 'premium' : 'free', verdict: 'Not judged',
            message: "Traditional looks need a stylist's eye. We are still learning these." }
          : { tier: 'free', verdict: 'Works' };
      },
    });
    const props: CheckMyLookSheetProps = {
      visible: true, items: [
        guardFailure ? { ...top, sleeveLength: 'sleeveless' } : top,
        bottom, replacement, dress,
      ] as any,
      groups: [], isPremium: premium, freeRemaining: 0, allowanceLoading: false,
      membershipLoading: false, membershipUnavailable: false,
      constraints: guardFailure ? { noSleeveless: true } : undefined,
      checking: controls.checking, result: controls.result, error: controls.error,
      onOpen() {}, onClose: controls.cancel, onRetryMembership() {}, onUpgrade() {},
      onClearResult: controls.clear,
      onCheck(request) { latestRequest = request; void controls.run(request, traditional); },
    };
    return React.createElement(api.CheckMyLookSheet, props);
  }
  const node = (id: string) => screen.root.findAllByType('Pressable').find((value: any) => value.props.testID === id);
  const text = () => screen.root.findAllByType('Text').map((value: any) => value.children.join('')).join(' ');
  const press = async (id: string) => {
    assert.ok(node(id), id);
    assert.notEqual(node(id).props.disabled, true, `${id} should be enabled`);
    await React.act(async () => { node(id).props.onPress(); });
  };
  async function mount(premium = false, reset = true, guardFailure = false) {
    if (reset) api.resetJudgeClientForTests();
    calls = []; localCalls = 0;
    api._testOverrides.post = async (...args: any[]) => {
      if (args[1] === '/api/check-my-look') {
        assert.equal(judgeRequestSchema.safeParse(args[2]).success, true, 'every mounted request matches the real route schema');
      }
      calls.push(args);
      return handler();
    };
    await React.act(async () => { screen = renderer.create(React.createElement(Harness, { premium, guardFailure })); });
    assert.equal(node('check-my-look-submit').props.disabled, true);
    await press('check-my-look-slot-top');
    await press(`check-my-look-item-${top.id}`);
    await press('check-my-look-slot-bottom');
    await press(`check-my-look-item-${bottom.id}`);
    await press('check-my-look-occasion-casual');
  }
  async function unmount() { await React.act(async () => { screen.unmount(); }); }
  const submit = () => press('check-my-look-submit');

  handler = reply({ verdict: 'Almost', reason: 'PRIVATE PREMIUM REASON',
    swapSuggestion: { replacesId: top.id, replacementId: replacement.id } });
  await mount();
  await submit();
  assert.deepEqual(controls.result, { tier: 'free', verdict: 'Almost' });
  assert.doesNotMatch(text(), /PRIVATE PREMIUM REASON|Possible swaps/);
  assert.equal(localCalls, 0);
  assert.deepEqual(calls[0].slice(0, 3), ['POST', '/api/check-my-look', {
    selection: { itemIds: [top.id, bottom.id], occasion: 'casual' }, brief: { context: 'casual' },
  }]);
  assert.equal(calls[0][3].timeoutMs, 6000);
  await unmount();
  handler = reply({ verdict: 'Works' });
  await mount(); await submit();
  assert.deepEqual(controls.result, { tier: 'free', verdict: 'Works' });
  assert.equal(localCalls, 0);
  await unmount();

  for (const premium of [false, true]) {
    handler = reply({
      verdict: 'Almost',
      reason: 'The selected sleeves are shorter than your preference.',
      swapSuggestion: { replacesId: top.id, replacementId: replacement.id },
    });
    await mount(premium, true, true);
    await submit();
    assert.equal(calls.length, 1, 'a local guard failure is submitted to the server');
    assert.equal(localCalls, 0, 'a server verdict does not run the local check');
    assert.equal(controls.result.verdict, 'Almost');
    if (premium) {
      assert.match(text(), /shorter than your preference/);
      assert.match(text(), /try cream blouse/i);
    } else {
      assert.deepEqual(controls.result, { tier: 'free', verdict: 'Almost' });
      assert.doesNotMatch(text(), /shorter than your preference|try cream blouse/i);
    }
    await unmount();
  }

  handler = reply({ verdict: 'Works', reason: 'The pieces work well together.',
    swapSuggestion: { replacesId: top.id, replacementId: replacement.id } });
  await mount(true);
  await submit();
  assert.match(text(), /The pieces work well together/);
  assert.match(text(), /try cream blouse/i);
  await unmount();
  handler = reply({ verdict: 'Works', reason: 'A calm balance.', swapSuggestion: null });
  await mount(true);
  await submit();
  assert.match(text(), /A calm balance/);
  assert.doesNotMatch(text(), /try cream/);
  await unmount();

  for (const [kind, status, code, local, message] of [
    ['client', 401, 'authentication_required', true, null],
    ['client', 403, 'ai_processing_consent_required', true, null],
    ['client', 403, 'permission_denied', false, /try again/i],
    ['client', 400, 'invalid_check_look_request', false, /try again/i],
    ['client', 404, 'selected_items_unavailable', false, /try again/i],
    ['client', 429, 'check_look_daily_limit', false, /Free.*5 look checks/],
    ['server', 503, 'check_look_quota_unavailable', false, /try again/i],
    ['server', 503, 'check_look_details_unavailable', false, /try again/i],
    ['server', 503, 'ai_processing_preference_unavailable', false, /try again/i],
    ['timeout', undefined, undefined, false, /try again/i],
    ['network', undefined, undefined, false, /offline.*Reconnect/],
  ] as const) {
    handler = fail(kind, status, code);
    await mount();
    await submit();
    assert.equal(localCalls, local ? 1 : 0, `${status}/${code} local fallback`);
    if (message) assert.match(text(), message);
    else { assert.equal(controls.error, null); assert.equal(controls.result.verdict, 'Works'); }
    assert.doesNotMatch(text(), /DO NOT SHOW RAW|consent required/i);
    await unmount();
  }
  handler = fail('client', 429, 'check_look_daily_limit');
  await mount(true); await submit();
  assert.match(text(), /Premium.*30 look checks/); assert.equal(localCalls, 0);
  await unmount();

  for (const context of ['traditional-wedding', 'owambe', 'naming-ceremony']) {
    handler = reply({ verdict: 'Works' });
    await mount();
    await press(`check-my-look-occasion-${context}`);
    assert.equal(node('check-my-look-submit').props.disabled, true);
    await press('check-my-look-brief-occasion-role');
    assert.equal(node('check-my-look-brief-occasion-role-not-sure').props.accessibilityState.selected, false);
    await press('check-my-look-brief-occasion-role-not-sure');
    assert.equal(node('check-my-look-submit').props.disabled, true);
    await press('check-my-look-brief-aso-ebi-set');
    await press('check-my-look-brief-aso-ebi-set-none');
    await submit();
    assert.deepEqual(latestRequest!.brief, { context, role: 'not-sure', asoEbiGroupId: 'none' });
    await unmount();
  }

  handler = reply({ useLocalCheck: true, reason: 'unavailable' });
  await mount(); await submit(); await submit();
  assert.equal(calls.length, 2); assert.equal(localCalls, 2);
  assert.equal(controls.error, null); await unmount();

  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    handler = reply({ useLocalCheck: true, reason: 'disabled' });
    await mount(); await submit(); await submit();
    assert.equal(calls.length, 1, 'cached disabled directive sends no second request');
    now += 14 * 60_000;
    await submit(); assert.equal(calls.length, 1);
    api.recordJudgeActivity(false);
    now += 2 * 60 * 60_000;
    api.recordJudgeActivity(true);
    await submit(); assert.equal(calls.length, 1, 'background time does not expire capability');
    await unmount();
    await mount(false, false); await submit();
    assert.equal(calls.length, 0, 'disabled capability survives closing/reopening the sheet');
    now += 60_001;
    await submit(); assert.equal(calls.length, 1, '15 foreground minutes re-asks the server');
    await unmount();
  } finally { Date.now = realNow; }

  for (const fact of [
    'denomination', 'assigned_set', 'announced_colours', 'hem_position', 'sleeve_lining',
    'sleeve_length', 'back_strap_coverage',
  ]) {
    handler = reply({ verdict: 'Ask', reason: 'A detail is missing.',
      question: fact === 'sleeve_length' ? 'How long are the sleeves on this piece?' : 'Could you confirm this detail?',
      missing_fact: fact, swapSuggestion: null });
    await mount(true);
    if (fact === 'denomination' || fact === 'hem_position' || fact === 'sleeve_lining' ||
        fact === 'sleeve_length' || fact === 'back_strap_coverage') {
      await press('check-my-look-occasion-church');
      assert.equal(node('check-my-look-submit').props.disabled, true, 'required choice is not preselected');
      await press('check-my-look-brief-denomination');
      assert.equal(node('check-my-look-brief-denomination-not-sure').props.accessibilityState.selected, false);
      await press('check-my-look-brief-denomination-not-sure');
    } else {
      await press('check-my-look-occasion-funeral');
      await press('check-my-look-brief-announced-colours');
      await press('check-my-look-brief-announced-colours-not-sure');
      assert.equal(node('check-my-look-submit').props.disabled, true);
      await press('check-my-look-brief-funeral-set');
      await press('check-my-look-brief-funeral-set-not-sure');
    }
    if (fact === 'hem_position') {
      await press('check-my-look-slot-dress');
      await press(`check-my-look-item-${dress.id}`);
    }
    assert.equal(node('check-my-look-submit').props.disabled, false, 'Not sure counts as chosen');
    await submit();
    assert.equal(node('check-look-thumb-up'), undefined, 'Ask never has thumbs');
    assert.match(text(), fact === 'sleeve_length'
      ? /How long are the sleeves on this piece\?/
      : /Could you confirm this detail/);
    assert.doesNotMatch(text(), /Not judged|A detail is missing/);
    handler = reply({ verdict: 'Works', reason: 'Thank you.', swapSuggestion: null });
    if (fact === 'denomination') await press('check-my-look-answer-anglican');
    else if (fact === 'assigned_set') await press('check-my-look-answer-none');
    else if (fact === 'announced_colours') {
      await press('check-my-look-answer-black');
      await press('check-my-look-answer-white');
      assert.equal(calls.length, 1, 'all announced colours can be chosen before resubmitting');
      await press('check-my-look-answer-colours-confirm');
    }
    else if (fact === 'hem_position') await press(`check-my-look-answer-${dress.id}-below-knee`);
    else if (fact === 'sleeve_lining') await press(`check-my-look-answer-${top.id}-lined`);
    else if (fact === 'sleeve_length') {
      assert.match(text(), /How long are the sleeves on this piece\?/);
      for (const value of ['sleeveless', 'short', 'three-quarter', 'long', 'not-sure']) {
        assert.ok(node(`check-my-look-answer-${top.id}-${value}`), `${value} sleeve answer is shown`);
      }
      await press(`check-my-look-answer-${top.id}-short`);
    } else if (fact === 'back_strap_coverage') {
      assert.ok(node(`check-my-look-fact-${top.id}-backAndStraps-covered`));
      assert.ok(node(`check-my-look-fact-${top.id}-backAndStraps-no-cover`));
      assert.ok(node(`check-my-look-fact-${top.id}-backAndStraps-not-sure`));
      await press(`check-my-look-fact-${top.id}-backAndStraps-no-cover`);
    }
    assert.equal(calls.length, 2);
    if (fact === 'denomination') assert.equal((latestRequest!.brief as any).denomination, 'anglican');
    if (fact === 'assigned_set') assert.equal((latestRequest!.brief as any).assignedGroupId, 'none');
    if (fact === 'announced_colours') assert.deepEqual((latestRequest!.brief as any).announcedColours, { kind: 'colours', values: ['black', 'white'] });
    if (fact === 'sleeve_lining') assert.equal(latestRequest!.garmentFacts?.[top.id].sleeveLining, 'lined');
    if (fact === 'sleeve_length') assert.equal(latestRequest!.garmentFacts?.[top.id].sleeveLength, 'short');
    if (fact === 'back_strap_coverage') {
      assert.equal(latestRequest!.garmentFacts?.[top.id].backOrStrapCoverage, 'exposed-no-cover');
      assert.equal(latestRequest!.garmentFacts?.[top.id].sleeveLining, undefined);
    }
    if (fact === 'hem_position') assert.equal(latestRequest!.garmentFacts?.[dress.id].hemPosition, 'at-or-below-knee');
    await unmount();
  }

  for (const premium of [false, true]) {
    const requestId = '12345678-1234-4123-8123-123456789abc';
    handler = reply({ verdict: 'Works', ...(premium ? { reason: 'A balanced look.' } : {}), request_id: requestId });
    await mount(premium); await submit();
    assert.ok(screen.root.findAllByProps({ testID: 'check-look-feedback' }).length);
    assert.ok(node('check-look-thumb-up')); assert.ok(node('check-look-thumb-down'));
    let feedbackCalls = 0;
    handler = async () => { feedbackCalls++; return new Response('{"saved":true}'); };
    await press('check-look-thumb-down');
    assert.match(text(), /This helps us improve Check my look/);
    await press('check-look-reason-too_strict');
    await press('check-look-feedback-skip');
    assert.equal(feedbackCalls, 2);
    const feedback = calls.filter(call => call[1] === '/api/check-my-look/feedback');
    assert.equal(feedback.length, 2);
    assert.deepEqual(feedback[1][2], { request_id: requestId, thumbs: 'down', reason_chip: 'too_strict' });
    assert.match(text(), /Works/);
    await unmount();
  }
  let quietRetries = 0;
  api._testOverrides.post = async () => { quietRetries++; throw new api.ApiRequestError('offline', 'network'); };
  await api.sendLookFeedback('12345678-1234-4123-8123-123456789abc', 'down', null);
  assert.equal(quietRetries, 2, 'offline feedback retries exactly once and does not throw');

  handler = async () => new Response('not JSON');
  await mount(); await submit(); assert.equal(localCalls, 0); assert.match(text(), /try again/i); await unmount();
  handler = reply({ useLocalCheck: true }); // Missing reason is not a valid directive.
  await mount(); await submit(); assert.equal(localCalls, 0); assert.match(text(), /try again/i); await unmount();
  handler = async () => new Promise(() => {});
  api._testOverrides.budgetMs = 20;
  await mount();
  await submit();
  assert.equal(controls.checking, true); assert.match(text(), /Reviewing your look/);
  // Even direct duplicate callbacks cannot start a second request.
  await React.act(async () => { void controls.run(latestRequest!); });
  assert.equal(calls.length, 1);
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  assert.equal(controls.checking, false); assert.equal(localCalls, 0);
  assert.match(text(), /try again/i); await unmount();
  delete api._testOverrides.budgetMs;
  let release!: (value: Response) => void;
  handler = () => new Promise(resolve => { release = resolve; });
  await mount(); await submit();
  ownerId = 'another-owner';
  await React.act(async () => { screen.update(React.createElement(Harness)); });
  await React.act(async () => { release(new Response(JSON.stringify({ useLocalCheck: true, reason: 'unavailable' }))); });
  assert.equal(localCalls, 0, 'a late directive cannot consume the old local allowance after account switch');
  assert.equal(controls.result, null);
  await unmount();
  ownerId = 'test-owner';
  handler = () => new Promise(resolve => { release = resolve; });
  await mount(); await submit();
  await React.act(async () => { controls.cancel(); });
  await React.act(async () => { release(new Response(JSON.stringify({ verdict: 'Works' }))); });
  assert.equal(controls.result, null, 'a response arriving after close is discarded');
  assert.equal(controls.checking, false); await unmount();
  traditional = true;
  await mount(); await submit();
  assert.equal(calls.length, 0); assert.match(text(), /Traditional looks need a stylist/);
  await unmount();
  console.log('Mounted judge client: payload privacy, responses, errors, fallback scopes, foreground cache, Ask resubmission, loading and deadline passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
