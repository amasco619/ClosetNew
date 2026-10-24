import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { transform } from 'esbuild';
import {
  classificationFailurePresentation, isContentGuardrailError, PHOTO_REFUSAL_TITLE, PHOTO_REFUSAL_BODY,
} from '../lib/classificationRefusal';
import { runClassifyUri, selectRetryableClassificationUris, type BulkItemCore } from '../lib/bulkClassifyCore';
import { B3ConstructionError } from '../lib/multiItemConstruction';

const add = readFileSync('app/add-item.tsx', 'utf8');
const bulk = readFileSync('app/bulk-review.tsx', 'utf8');
const multi = readFileSync('app/multi-item-review.tsx', 'utf8');
function between(source: string, start: string, end: string) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert(first >= 0 && last > first, `real screen fragment exists: ${start}`);
  return source.slice(first, last);
}
async function compile(code: string, env: Record<string, unknown>, result: string) {
  const output = await transform(code, {
    loader: 'tsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  });
  return new Function(...Object.keys(env), `${output.code}\nreturn ${result};`)(...Object.values(env));
}
const noop = () => {};

async function main() {
  const cases: [string, number | undefined, string][] = [
    ['APP_RATE_LIMIT', 429, 'rate-limit'], ['PROVIDER_QUOTA', 429, 'busy'],
    ['PROVIDER_UNAVAILABLE', 502, 'busy'], ['PROVIDER_TIMEOUT', 504, 'busy'],
    ['MALFORMED_RESPONSE', 502, 'busy'], ['AUTH_REQUIRED', 401, 'session'],
    ['CONSENT_REQUIRED', 403, 'consent'], ['UNREADABLE_PHOTO', 422, 'unreadable'],
    ['', undefined, 'generic'],
  ];
  for (const [error, expected] of [
    [{ kind: 'network' }, 'network'], [{ kind: 'timeout' }, 'busy'],
    [{ kind: 'non_json' }, 'busy'], [new SyntaxError('bad JSON'), 'busy'],
    ...[408, 429, 500, 502, 503, 504].map(status => [{ status }, 'busy']),
    [{ status: 401 }, 'session'], [{ status: 403 }, 'consent'],
    [new Error('422: {"error":"multi_item_invalid"}'), 'unreadable'],
  ] as [unknown, string][]) {
    assert.equal(classificationFailurePresentation(error).kind, expected);
  }
  for (const [code, , expected] of cases.filter(([code]) => code)) {
    assert.equal(classificationFailurePresentation({ code, status: 401, kind: 'network' }).kind,
      expected, 'a stable code wins over ambiguous status/kind');
  }
  assert.equal(classificationFailurePresentation(new Error('Loading bitmap failed'), { localPreparation: true }).kind, 'unreadable');
  assert.equal(classificationFailurePresentation({ code: 'APP_RATE_LIMIT', retryAfter: 7 }).hint, 'Try again in 7 seconds.');
  assert.equal(classificationFailurePresentation({ code: 'APP_RATE_LIMIT' }).hint, 'Try again in a moment.');

  // Execute the real catch branches and mount their real JSX fragments with
  // native hosts mocked. These are not physical-device or live-provider tests.
  const renderer = createRequire(`${process.cwd()}/package.json`)('react-test-renderer');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = (name: string) => (props: any) => React.createElement(name, props, props.children);
  const viewEnv = {
    React, View: host('View'), Text: host('Text'), Pressable: host('Pressable'),
    Ionicons: () => null, styles: new Proxy({}, { get: () => ({}) }), Colors: {},
    __DEV__: false, UPLOAD_DIAGNOSTICS_ENABLED: false,
    PhotoRefusalNotice: () => React.createElement('Text', null, `${PHOTO_REFUSAL_TITLE} ${PHOTO_REFUSAL_BODY}`),
  };
  const addCatch = between(add, 'const failure = classificationFailurePresentation(classifyErr);', '\n          }\n        } else {');
  const multiCatch = between(multi, 'if (caughtError instanceof B3ConstructionError', '\n        }\n      }\n    })();');
  const addJsx = between(add, '{analysisFailure && (', '\n            )}') + '\n            )}';
  const bulkJsx = between(bulk, '{isError && item.retryable !== false', '\n      )}') + '\n      )}';
  const multiJsx = between(multi, "{phase === 'error' && (", '\n        )}') + '\n        )}';
  const retryPhotoRef = { current: { uri: 'retained-photo' } };
  for (const [code, status, kind] of cases) {
    const caughtError = Object.assign(new Error('PRIVATE PROVIDER DETAIL'), { code, status, retryAfter: 7 });
    const expected = classificationFailurePresentation(caughtError);
    assert.equal(expected.kind, kind);
    let singleFailure: any; let singleConsent = false; let unreadable = false;
    await compile(`const run = async () => { ${addCatch} };`, {
      classifyErr: caughtError, classificationFailurePresentation, isContentGuardrailError,
      setClassifying: noop, setClassifyFlash: noop, reportUploadError: noop, finishClassifying: noop,
      setShowPhotoRefusal: (value: boolean) => { unreadable = value; },
      setAnalysisFailure: (value: unknown) => { singleFailure = value; },
      setShowAiConsent: (value: boolean) => { singleConsent = value; },
      retryPhotoRef, setPendingAiAsset: noop,
    }, 'run()');
    let multiFailure: any; let phase = ''; let countError = '';
    await compile(`const run = async () => { ${multiCatch} };`, {
      caughtError, B3ConstructionError, classificationFailurePresentation, stage: 'classification',
      started: { current: true },
      setFailure: (value: unknown) => { multiFailure = value; },
      setPhase: (value: string) => { phase = value; },
      setError: (value: string) => { countError = value; },
    }, 'run()');
    assert.equal(countError, '', 'provider/session errors cannot become the 2–6 garment count message');
    let items: BulkItemCore[] = [{ uri: 'retained-photo', status: 'pending', classification: null }];
    let bulkConsent = false;
    await runClassifyUri(items[0].uri, { current: true }, {
      resize: async () => ({ base64: 'fixture' }), removeBg: async () => null,
      writePngToCache: async () => 'unused', classify: async () => { throw caughtError; },
      setItems: fn => { items = fn(items); }, onHaptic: noop,
      onFailure: failure => { bulkConsent = failure.kind === 'consent'; },
    });
    assert.equal(items[0].failurePresentation?.kind, kind);
    assert.equal(items[0].uri, 'retained-photo');
    if (kind === 'consent') {
      assert(singleConsent && bulkConsent && phase === 'consent', 'all three screens enter the existing consent flow');
      continue;
    }
    if (kind === 'unreadable') {
      assert(unreadable && items[0].status === 'refused' && multiFailure.kind === 'unreadable');
      assert.match(bulk, /showUnreadable[\s\S]*?<PhotoRefusalNotice/);
      continue; // Existing mounted notice/dialog assertions live in classifierRefusal.test.ts.
    }
    for (const [name, jsx, extra] of [
      ['single', addJsx, { analysisFailure: singleFailure, retryPhotoRef, pickImage: noop, setAnalysisFailure: noop }],
      ['bulk', bulkJsx, { isError: true, item: items[0], failure: items[0].failurePresentation, onRetry: noop }],
      ['multi', multiJsx, { phase, failure: multiFailure, error: countError, started: { current: true },
        setPhase: noop, setFailure: noop, setError: noop }],
    ] as const) {
      let signedIn = false;
      const element = await compile(`const render = () => (<>${jsx}</>);`,
        { ...viewEnv, ...extra, router: { push: () => { signedIn = true; }, back: noop } }, 'render()');
      let tree: any;
      await renderer.act(async () => { tree = renderer.create(element); });
      const rendered = JSON.stringify(tree.toJSON());
      assert(rendered.includes(expected.title) && rendered.includes(expected.hint) && rendered.includes(expected.action),
        `${name} renders the ${code || 'generic'} title, hint and button`);
      assert(!rendered.includes('PRIVATE PROVIDER DETAIL'));
      if (kind === 'session') {
        await renderer.act(async () => { tree.root.findAllByType('Pressable')[0].props.onPress(); });
        assert(signedIn, `${name} sign-in action navigates`);
      }
      await renderer.act(async () => { tree.unmount(); });
    }
  }

  let items: BulkItemCore[] = ['good', 'bad', 'refused'].map(uri => ({ uri, status: 'pending', classification: null }));
  const calls: Record<string, number> = {};
  const attempt = (uri: string) => runClassifyUri(uri, { current: true }, {
    resize: async () => ({ base64: uri }), removeBg: async () => null, writePngToCache: async () => 'unused',
    classify: async () => {
      calls[uri] = (calls[uri] ?? 0) + 1;
      if (uri === 'refused') throw { code: 'UNREADABLE_PHOTO', status: 422 };
      if (uri === 'bad' && calls[uri] === 1) throw { code: 'PROVIDER_UNAVAILABLE', status: 502 };
      return { category: 'top', subType: 't-shirt', colorFamily: 'blue' };
    }, setItems: fn => { items = fn(items); }, onHaptic: noop,
  });
  for (const uri of ['good', 'bad', 'refused']) await attempt(uri);
  assert.deepEqual(selectRetryableClassificationUris(items), ['bad']);
  for (const uri of selectRetryableClassificationUris(items)) await attempt(uri);
  assert.deepEqual(calls, { good: 1, bad: 2, refused: 1 });
  assert.deepEqual(items.map(item => item.status), ['settled', 'settled', 'refused']);
  assert.match(bulk, /const uris = selectRetryableClassificationUris\(itemsRef.current\)/);
  for (const [file, source] of [['single', add], ['bulk', bulk], ['multi', multi],
    ['mapping', readFileSync('lib/classificationRefusal.ts', 'utf8')]]) {
    assert.doesNotMatch(source, /Connection paused|Something went wrong/, `${file}: old classification copy is absent`);
  }
  console.log('Classification copy: all eight codes on all three screen branches, mounted copy/actions, fallbacks and mixed-batch failed-only retry passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
