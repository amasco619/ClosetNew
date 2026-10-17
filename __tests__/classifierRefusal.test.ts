import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { build, transform } from 'esbuild';
import {
  isContentGuardrailError, isTransientClassificationError, PHOTO_REFUSAL_BODY, PHOTO_REFUSAL_TITLE,
} from '../lib/classificationRefusal';
import { runClassifyUri, runRedirectSingle, selectBulkProgress, type BulkItemCore, type ClassifyDeps } from '../lib/bulkClassifyCore';

async function main() {
  const refusal = Object.assign(new Error('422: {"error":"content_guardrail","reason":"PRIVATE PROVIDER REASON"}'), { status: 422 });
  assert.equal(isContentGuardrailError(refusal), true);
  assert.equal(isContentGuardrailError({ status: 500, message: refusal.message }), false);
  assert.equal(isContentGuardrailError(new Error('422: invalid JSON')), false);
  assert.equal(isContentGuardrailError(new Error('422: {"error":"other"}')), false);
  const analyse = async (error: unknown, prepareFailure = false) => {
    let items: BulkItemCore[] = [{ uri: 'file:///batch.jpg', status: 'pending', classification: null }];
    const diagnostics: unknown[] = [];
    const deps: ClassifyDeps = {
      resize: async () => { if (prepareFailure) throw error; return { base64: 'photo' }; },
      removeBg: async () => null,
      writePngToCache: async () => 'file:///cutout.png',
      classify: async () => { throw error; },
      setItems: updater => { items = updater(items); },
      onHaptic: () => {},
      diagnostics: { enabled: true, usedSerialResizeQueue: true },
      onDiagnostic: diagnostic => { diagnostics.push(diagnostic); },
    };
    await runClassifyUri(items[0].uri, { current: true }, deps);
    return { item: items[0], diagnostics };
  };
  const refused = await analyse(refusal);
  assert.equal(refused.item.status, 'refused');
  assert.equal(refused.item.retryable, false);
  assert.equal(refused.item.diagnostic, undefined);
  assert.equal(refused.diagnostics.length, 0, 'raw refusal reason is not even included in a dev card');
  for (const error of [
    Object.assign(new Error('408: deadline'), { status: 408 }),
    Object.assign(new Error('429: limited'), { status: 429 }),
    Object.assign(new Error('503: unavailable'), { status: 503 }),
    { kind: 'network', message: 'offline' }, { kind: 'timeout', message: 'deadline' },
  ]) {
    assert.equal(isTransientClassificationError(error), true);
    const { item } = await analyse(error);
    assert.equal(item.status, 'error');
    assert.equal(item.retryable, true);
  }
  assert.equal(isTransientClassificationError(new Error('image_mime_mismatch')), false);
  assert.equal(isTransientClassificationError(new SyntaxError('Invalid JSON')), false);
  for (const status of [400, 401, 403, 422]) {
    const { item } = await analyse(Object.assign(new Error(`${status}: {"error":"other"}`), { status }));
    assert.equal(item.status, 'error');
    assert.equal(item.retryable, true, 'unexpected errors now have an explicit manual retry action');
    assert.equal(item.failureKind, 'unexpected');
  }
  assert.equal((await analyse(new Error('Loading bitmap failed'), true)).item.failureKind, 'unexpected');
  const progress = selectBulkProgress([
    ...Array.from({ length: 3 }, (_, i) => ({ uri: String(i), status: 'settled', classification: null })),
    { uri: 'pair', status: 'refused', classification: null },
    { uri: 'removed', status: 'removed', classification: null },
  ]);
  assert.deepEqual(progress, { classifiedCount: 3, failedCount: 0, refusedCount: 1, transientCount: 0, totalCount: 4, progressRatio: 1 });
  assert.equal(selectBulkProgress([]).progressRatio, 0);
  let route: any;
  runRedirectSingle(refused.item, false, { current: true }, { current: false }, {
    bulkSelectionId: 'selection', manualPhotoIndex: 2, replace: value => { route = value; },
  });
  assert.deepEqual(route, {
    pathname: '/add-item',
    params: { bulkSelectionId: 'selection', bulkPhotoIndex: '2', manualEntry: 'true', returnToBulk: 'true' },
  });
  assert.equal(JSON.stringify(route).includes('file:///'), false);

  const add = readFileSync('app/add-item.tsx', 'utf8');
  const bulk = readFileSync('app/bulk-review.tsx', 'utf8');
  assert.doesNotMatch(add, /Photo not accepted|classifyErr\.reason|class ContentGuardrailError/);
  assert.match(add, /manualEntry === 'true' && resolvedInitialUri/);
  assert.match(add, /if \(!selectionId \|\| returnToBulk === 'true'\) return/,
    'dismissal of a borrowed manual photo cannot clean the underlying batch');
  assert.match(add, /uploadedPhoto = null;\s*if \(returnToBulk === 'true'[\s\S]*router\.dismissTo/);
  assert.match(bulk, /isError && item\.retryable !== false/);
  assert.match(bulk, /item\?\.status === 'refused' \|\| item\?\.retryable === false/);
  assert.match(bulk, /status === 'pending' \|\| item\.status === 'classifying'/,
    'single-photo timeout cannot redirect a refused card');
  assert.match(bulk, /onManual=\{handleManual\}/);
  assert.match(bulk, /manualSavedPhotoIndex[\s\S]*status: 'removed'/,
    'acknowledged manual save leaves the batch without invoking wardrobe deletion');

  for (const filename of ['app/add-item.tsx', 'app/bulk-review.tsx']) {
    const release = await transform(readFileSync(filename, 'utf8'), {
      loader: 'tsx', minifySyntax: true,
      define: { __DEV__: 'false', 'process.env.EXPO_PUBLIC_AMODKA_BUILD_STAMP': '"AMODKA_RELEASE_TEST_SENTINEL"' },
    });
    assert.doesNotMatch(release.code, /formatPhotoPrepareDiagnostic\(/, `${filename}: no release diagnostic render call`);
    assert.doesNotMatch(release.code, /AMODKA_RELEASE_TEST_SENTINEL|DEV build stamp unavailable/,
      `${filename}: build-stamp JSX is eliminated`);
  }

  // Mounted shared notice/dialog: JS semantics only, not native device/screen-reader evidence.
  const require = createRequire(`${process.cwd()}/package.json`);
  const renderer = require('react-test-renderer');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const built = await build({
    entryPoints: ['components/PhotoRefusalNotice.tsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
    plugins: [{
      name: 'refusal-hosts',
      setup(builder) {
        builder.onResolve({ filter: /^react-native$/ }, () => ({ path: 'rn', namespace: 'mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
          contents: `const React=require('react');
            const host=name=>props=>React.createElement(name,props,props.children);
            exports.View=host('View');exports.Text=host('Text');exports.Pressable=host('Pressable');
            exports.Modal=props=>props.visible?React.createElement('Modal',props,props.children):null;
            exports.StyleSheet={create:x=>x};`,
          loader: 'js',
        }));
      },
    }],
  });
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports);
  const { PhotoRefusalNotice, PhotoRefusalDialog } = module.exports;
  let manual = 0; let removed = 0; let tree: any;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(PhotoRefusalNotice, {
      onManual: () => { manual++; }, onRemove: () => { removed++; },
    }));
  });
  const text = JSON.stringify(tree.toJSON());
  assert(text.includes(PHOTO_REFUSAL_TITLE) && text.includes(PHOTO_REFUSAL_BODY));
  assert(!text.includes('Tap to retry') && !text.includes('PRIVATE PROVIDER REASON'));
  const buttons = tree.root.findAllByType('Pressable');
  assert.equal(buttons.length, 2);
  assert(buttons.every((button: any) => button.props.accessibilityRole === 'button'));
  await renderer.act(async () => { buttons[0].props.onPress(); buttons[1].props.onPress(); });
  assert.equal(manual, 1); assert.equal(removed, 1);
  await renderer.act(async () => { tree.unmount(); });
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(PhotoRefusalDialog, {
      visible: true, onManual: () => { manual++; }, onChoosePhoto: () => { removed++; },
    }));
  });
  assert(JSON.stringify(tree.toJSON()).includes('Choose another photo'));
  await renderer.act(async () => { tree.root.findByType('Modal').props.onRequestClose(); });
  assert.equal(manual, 2, 'Android back keeps the photo and enters manual details');
  await renderer.act(async () => { tree.unmount(); });
  console.log('Classifier refusal: status/retry, calm mounted actions, manual ID-only handoff, counters and release JSX checks passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
