import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, transform } from 'esbuild';
import { classificationFailurePresentation, isContentGuardrailError } from '../lib/classificationRefusal';
import { readCachedCutout } from '../lib/uploadPhotoSource';
import { classificationWaitMs, runSerialUploadRetries } from '../lib/uploadRetry';
import { runSaveAll, runClassifyUri, selectBulkProgress, type BulkItemCore, type SaveAllDeps } from '../lib/bulkClassifyCore';
import { getClassifierModelOrder } from '../server/classifierReliability';

const classification = { category: 'bottom' as const, subType: 'joggers', colorFamily: 'grey', description: 'Grey joggers', occasionTags: [], seasonTags: [] };
async function main() {
  for (const guest of [false, true]) {
    for (const cache of ['present', 'missing', 'empty']) {
      let resized = 0; let committed = 0; let uploaded = '';
      const deps: SaveAllDeps = {
        generateId: () => 'item', getSession: async () => guest ? null : 'owner',
        readPngBase64: async () => { if (cache === 'missing') throw new Error('ENOENT'); return cache === 'empty' ? '' : 'png'; },
        resize: async uri => { assert.equal(uri, 'original'); resized++; return { base64: 'jpeg' }; },
        resolveUploadArg: (clean, shrunk) => clean ? { base64: clean, mimeType: 'image/png' } : shrunk ? { base64: shrunk, mimeType: 'image/jpeg' } : null,
        upload: async (_user, data, _id, mime) => { uploaded = `${mime}:${data}`; return 'https://example.test/item'; },
        saveGuestImage: async (data, _id, mime) => { uploaded = `${mime}:${data}`; return 'file:///documents/item'; },
        addItems: async () => { committed++; }, setItems: () => {}, setSaving: () => {},
        onItemHaptic: () => {}, onDoneHaptic: () => {}, navigate: () => {},
      };
      await runSaveAll([{ uri: 'original', cutoutUri: 'cutout', classification }], { current: true }, deps);
      assert.equal(committed, 1);
      assert.equal(uploaded, cache === 'present' ? 'image/png:png' : 'image/jpeg:jpeg');
      assert.equal(resized, cache === 'present' ? 0 : 1);
    }
  }
  let resizeCalls = 0; let uploadCalls = 0; let dbCalls = 0; let pending = 0;
  await runSaveAll([{ uri: 'original', cutoutUri: 'cutout', classification }], { current: true }, {
    generateId: () => 'item', getSession: async () => 'owner', readPngBase64: async () => 'png',
    resize: async () => { resizeCalls++; return { base64: 'jpeg' }; },
    resolveUploadArg: clean => ({ base64: clean!, mimeType: 'image/png' }),
    upload: async () => { uploadCalls++; throw new Error('network'); },
    addItems: async () => { dbCalls++; }, setItems: () => {}, setSaving: () => {},
    onItemHaptic: () => {}, onDoneHaptic: () => {}, navigate: () => { throw new Error('must stay in review'); },
    onLocalOnlyComplete: () => { pending++; },
  });
  assert.deepEqual([resizeCalls, uploadCalls, dbCalls, pending], [0, 1, 0, 1],
    'cloud upload failure is not a cutout miss: no second upload/DB commit');
  assert.equal(await readCachedCutout('missing', async () => { throw new Error('private/path'); }), undefined);

  for (const status of [408, 429, 500, 503]) {
    assert.deepEqual(classificationFailurePresentation({ status }), {
      kind: 'transient', title: 'Connection paused', action: 'Tap to try again',
    });
  }
  assert.equal(classificationFailurePresentation({ kind: 'network' }).kind, 'transient');
  assert.equal(classificationFailurePresentation({ kind: 'timeout' }).kind, 'transient');
  assert.equal(classificationFailurePresentation(new Error('unknown')).title, 'Something went wrong');
  const refusal = Object.assign(new Error('422: {"error":"content_guardrail"}'), { status: 422 });
  assert(isContentGuardrailError(refusal));
  for (const cache of ['present', 'missing']) {
    let backgroundCalls = 0; let nativeCalls = 0;
    let items: BulkItemCore[] = [{ uri: 'original', cutoutUri: 'cutout', status: 'error', failureKind: 'transient', classification: null }];
    await runClassifyUri('original', { current: true }, {
      previousCutout: { uri: 'cutout', succeeded: true },
      readPngBase64: async () => { if (cache === 'missing') throw new Error('ENOENT'); return 'png'; },
      resize: async () => { nativeCalls++; return { base64: 'jpeg' }; },
      removeBg: async () => { backgroundCalls++; return 'new-png'; },
      writePngToCache: async () => 'unused',
      classify: async (base64, mime) => {
        assert.equal(base64, cache === 'present' ? 'png' : 'jpeg');
        assert.equal(mime, cache === 'present' ? 'image/png' : 'image/jpeg');
        return classification;
      },
      setItems: updater => { items = updater(items); }, onHaptic: () => {},
    });
    assert.equal(backgroundCalls, 0, 'successful PhotoRoom work is never repeated');
    assert.equal(nativeCalls, cache === 'present' ? 0 : 1);
    assert.equal(items[0].status, 'settled');
  }
  assert.equal(selectBulkProgress([{ uri: 'x', status: 'error', failureKind: 'transient', classification: null }]).transientCount, 1);
  const order: string[] = []; let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  const retries = runSerialUploadRetries(['a', 'removed', 'b'], {
    active: uri => uri !== 'removed',
    run: async uri => { order.push(`${uri}:start`); if (uri === 'a') await first; order.push(`${uri}:end`); },
  });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(order, ['a:start']);
  release(); await retries;
  assert.deepEqual(order, ['a:start', 'a:end', 'b:start', 'b:end']);
  assert.equal(classificationWaitMs(Array(10).fill(1000), 1000), 60001);
  assert.equal(classificationWaitMs(Array(9).fill(1000), 1000), 0);
  assert.equal(classificationWaitMs(Array(10).fill(1000), 61001), 0);

  for (const dev of [false, true]) {
    for (const flag of ['0', '1']) {
      const built = await build({
        entryPoints: ['lib/uploadErrors.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', minify: true,
        define: { __DEV__: String(dev), 'process.env.EXPO_PUBLIC_UPLOAD_DIAGNOSTICS': JSON.stringify(flag) },
      });
      const logs: unknown[] = [];
      const module = { exports: {} as any };
      new Function('module', 'exports', 'console', built.outputFiles[0].text)(module, module.exports, { log: (...args: unknown[]) => logs.push(args) });
      module.exports.reportUploadError({ stage: 'upload', code: 'FAILED' });
      module.exports.reportUploadError({ stage: 'file:///private', code: 'email@example.test' });
      assert.equal(logs.length, dev && flag === '1' ? 2 : 0);
      assert(!JSON.stringify(logs).includes('private') && !JSON.stringify(logs).includes('email@'));
      if (!dev) assert(!built.outputFiles[0].text.includes('[upload]'));
    }
  }
  const single = readFileSync('app/add-item.tsx', 'utf8');
  const bulk = readFileSync('app/bulk-review.tsx', 'utf8');
  assert.match(single, /await readCachedCutout\(photoBgRemoved/);
  assert.match(single, /currentPhotoUriRef\.current \?\? stagedSourceUriRef\.current/);
  assert.match(bulk, /transientCount >= 2/);
  assert.match(bulk, /runSerialUploadRetries/);
  assert(!single.includes('of 20 background removals left') && !bulk.includes('for today'));
  for (const source of [single, bulk]) {
    assert(!source.includes('console.warn'));
    const releaseCode = (await transform(source, { loader: 'tsx', minifySyntax: true, define: { __DEV__: 'false' } })).code;
    assert(!/formatPhotoPrepareDiagnostic\(/.test(releaseCode));
    assert(!/ApiRequestError|withDeadline|\.stack/.test(releaseCode));
  }
  const releaseCore = (await transform(readFileSync('lib/bulkClassifyCore.ts', 'utf8'), {
    loader: 'ts', minifySyntax: true, define: { __DEV__: 'false' },
  })).code;
  for (const token of ['pickerHash=', 'stagedAtPick=', 'sincePick=']) assert(!releaseCore.includes(token));
  assert.deepEqual(getClassifierModelOrder({}), ['gemini-3.5-flash-lite', 'gemini-2.5-flash']);
  assert.deepEqual(getClassifierModelOrder({ GEMINI_PRIMARY_MODEL: '  ' }), getClassifierModelOrder({}));
  assert.deepEqual(
    getClassifierModelOrder({ GEMINI_PRIMARY_MODEL: ' pinned-model ' }),
    ['pinned-model', 'gemini-2.5-flash'],
  );
  console.log('Upload cleanup: cache/save failure separation, calm states, cutout reuse, serial/paced retries, opt-in sanitized logs, release paths and model configuration passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
