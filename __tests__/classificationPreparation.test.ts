import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { classificationImagePayload } from '../lib/classifyPath';
import { runClassifyUri, type BulkItemCore } from '../lib/bulkClassifyCore';

async function main() {
  const state = {
    width: 3000, height: 4000, fail: '', missingBase64: false,
    actions: [] as object[], options: [] as object[], releases: [] as string[],
  };
  (globalThis as any).__classificationPrepNative = state;
  const built = await build({
    entryPoints: ['lib/prepareClassificationImage.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs',
    plugins: [{
      name: 'native-image-boundary',
      setup(builder) {
        builder.onResolve({ filter: /^expo-image-manipulator$/ }, () => ({ path: 'native', namespace: 'mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
          contents: `
            const s=globalThis.__classificationPrepNative;
            exports.SaveFormat={JPEG:'jpeg'};
            exports.ImageManipulator={manipulate(uri) {
              let axis=null, renders=0;
              return {
                resize(size) { axis=size; s.actions.push(size); return this; },
                async renderAsync() {
                  renders++;
                  if(s.fail==='decode'||(s.fail==='resize'&&renders===2))throw Error(s.fail);
                  const scale=axis ? (axis.width||axis.height)/Math.max(s.width,s.height) : 1;
                  const width=Math.round(s.width*scale),height=Math.round(s.height*scale);
                  const label=renders===1?'source':'resized';
                  return {
                    width,height,
                    async saveAsync(options) {
                      s.options.push(options);
                      if(s.fail==='save')throw Error('save');
                      return {uri:'file:///encoded.jpg',width,height,
                        base64:s.missingBase64?undefined:'/9j/'+Buffer.from(JSON.stringify({width,height,options})).toString('base64')};
                    },
                    release() { s.releases.push(label); }
                  };
                },
                release() { s.releases.push('context'); }
              };
            }};
          `,
          loader: 'js',
        }));
      },
    }],
  });
  const module = { exports: {} as typeof import('../lib/prepareClassificationImage') };
  const require = createRequire(`${process.cwd()}/package.json`);
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports);
  const { prepareClassificationImage } = module.exports;
  const reset = () => {
    state.actions = []; state.options = []; state.releases = [];
    state.fail = ''; state.missingBase64 = false;
  };
  for (const [width, height, expectedAxis, expectedWidth, expectedHeight] of [
    [3000, 4000, 'height', 768, 1024],
    [4000, 3000, 'width', 1024, 768],
    [2048, 2048, 'width', 1024, 1024],
    [768, 1024, '', 768, 1024],
    [240, 320, '', 240, 320],
  ] as const) {
    state.width = width; state.height = height;
    reset();
    const single = await prepareClassificationImage('file:///picked-photo.jpg');
    const singleActions = [...state.actions];
    reset();
    const bulk = await prepareClassificationImage('file:///bulk-staging/photo.jpg');
    assert.deepEqual(state.actions, singleActions, 'route/file URI cannot select different resize policy');
    assert.deepEqual(state.actions, expectedAxis ? [{ [expectedAxis]: 1024 }] : []);
    assert.equal(bulk.width, expectedWidth); assert.equal(bulk.height, expectedHeight);
    assert.deepEqual(classificationImagePayload(single.base64!), classificationImagePayload(bulk.base64!));
    assert.deepEqual(state.options, [{ compress: 0.8, format: 'jpeg', base64: true }], 'one final encoding');
    assert.deepEqual(state.releases.sort(), expectedAxis
      ? ['context', 'resized', 'source'] : ['context', 'source']);
  }
  // Exercise the actual bulk controller's payload selection against the single-entry contract.
  state.width = 3000; state.height = 4000;
  for (const background of ['cutout', 'unavailable', 'cache-failure']) {
    reset();
    const single = await prepareClassificationImage('file:///picked.jpg');
    const png = 'iVBORw0KGgo' + Buffer.from(single.base64!).toString('base64');
    const expected = classificationImagePayload(background === 'cutout' ? png : single.base64!);
    let items: BulkItemCore[] = [{ uri: 'file:///staged.jpg', status: 'pending', classification: null }];
    await runClassifyUri(items[0].uri, { current: true }, {
      resize: prepareClassificationImage,
      removeBg: async () => background === 'unavailable' ? null : png,
      writePngToCache: async () => {
        if (background === 'cache-failure') throw new Error('cache unavailable');
        return 'file:///cutout.png';
      },
      classify: async (base64, mimeType) => {
        assert.deepEqual(classificationImagePayload(base64), expected);
        assert.equal(mimeType, expected.imageMimeType);
        return { category: 'bottom', subType: 'joggers', colorFamily: 'grey', description: 'Grey joggers', occasionTags: [], seasonTags: [] };
      },
      setItems: updater => { items = updater(items); }, onHaptic: () => {},
    });
    assert.equal(items[0].status, 'settled');
  }
  for (const fail of ['decode', 'resize', 'save', 'missing-data', 'invalid-dimensions']) {
    reset(); state.width = fail === 'invalid-dimensions' ? 0 : 3000;
    state.fail = fail; state.missingBase64 = fail === 'missing-data';
    await assert.rejects(prepareClassificationImage('file:///photo.jpg'));
    assert.equal(state.releases.filter(value => value === 'context').length, 1);
    if (fail !== 'decode') assert.equal(state.releases.filter(value => value === 'source').length, 1);
    if (fail === 'save' || fail === 'missing-data') assert(state.releases.includes('resized'));
  }
  const singleSource = readFileSync('app/add-item.tsx', 'utf8');
  const bulkSource = readFileSync('app/bulk-review.tsx', 'utf8');
  assert.match(singleSource, /await prepareClassificationImage\(asset\.uri\)/);
  assert.match(bulkSource, /resize: \(u\) => imageResizeQueue[\s\S]*?return prepareClassificationImage\(u\)/);
  assert.doesNotMatch(singleSource, /MAX_CLASSIFY_PX/);
  assert.doesNotMatch(bulkSource, /resize: \{ width: 1024 \}/);
  console.log('Classification preparation: shared native policy, dimensions/no-upscale, one encoding, payload parity, fallbacks and failure/resource cleanup passed (mock native decoder).');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
