import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

async function main() {
  const state = {
    width: 3000, height: 4500, failSave: false,
    actions: [] as unknown[], releases: [] as string[], sourceUris: [] as string[],
  };
  Object.assign(globalThis, { __bulkSaveResize: state });
  const mocks: Record<string, string> = {
    'react-native': `const s=globalThis.__bulkSaveResize;
      exports.Image={getSize:async uri=>{
        s.actions.push(['dimensions',uri]);s.sourceUris.push(uri);
        return {width:s.width,height:s.height};
      }};`,
    'expo-image-manipulator': `const s=globalThis.__bulkSaveResize;
      exports.SaveFormat={JPEG:'jpeg'};
      exports.ImageManipulator={manipulate(uri){
        s.actions.push(['manipulate',uri]);
        let width=s.width,height=s.height;
        return {
          resize(axis){
            s.actions.push(['resize',axis]);
            const edge=axis.width??axis.height, sourceEdge=Math.max(width,height);
            const scale=edge/sourceEdge;
            width=Math.round(width*scale);height=Math.round(height*scale);
          },
          async renderAsync(){
            s.actions.push(['render',width,height]);
            if(Math.max(width,height)>1600)throw Error('unresized source render');
            return {
              width,height,
              async saveAsync(options){
                s.actions.push(['save',options]);
                if(s.failSave)throw Error('synthetic save failure');
                return {uri:'file:///cache/bulk-output.jpg',width,height,base64:'bounded'};
              },
              release(){s.releases.push('image');},
            };
          },
          release(){s.releases.push('context');},
        };
      }};`,
  };
  const bundled = await build({
    entryPoints: ['lib/prepareBulkSaveImage.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs',
    plugins: [{ name: 'bulk-save-native', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path)
        ? { path: args.path, namespace: 'mock' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({
        contents: mocks[args.path], loader: 'js',
      }));
    } }],
  });
  const module = { exports: {} as typeof import('../lib/prepareBulkSaveImage') };
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(
    createRequire(`${process.cwd()}/package.json`), module, module.exports);
  const reset = (width: number, height: number) => {
    state.width = width; state.height = height; state.failSave = false;
    state.actions = []; state.releases = []; state.sourceUris = [];
  };
  const source = 'file:///bulk/original.jpg';

  for (const [width, height, expectedResize, outputWidth, outputHeight] of [
    [3000, 4500, { height: 1600 }, 1067, 1600],
    [4500, 3000, { width: 1600 }, 1600, 1067],
  ] as const) {
    reset(width, height);
    const result = await module.exports.prepareBulkSaveImage(source);
    assert.deepEqual(state.actions.slice(0, 3), [
      ['dimensions', source], ['manipulate', source], ['resize', expectedResize],
    ], 'metadata probe and longest-edge resize happen before the first render');
    assert.deepEqual(state.actions[3], ['render', outputWidth, outputHeight]);
    assert.deepEqual(result, {
      uri: 'file:///cache/bulk-output.jpg', width: outputWidth, height: outputHeight, base64: 'bounded',
    });
    assert.deepEqual(state.actions[4], ['save', { compress: 0.85, format: 'jpeg', base64: true }]);
    assert.deepEqual(state.releases, ['image', 'context']);
    assert.deepEqual(state.sourceUris, [source], 'the selected source is probed and retained, not copied or deleted');
  }

  for (const [width, height] of [[1600, 900], [800, 1200]] as const) {
    reset(width, height);
    await module.exports.prepareBulkSaveImage(source);
    assert.deepEqual(state.actions[2], ['render', width, height], 'small images are rendered without upscaling');
    assert.equal(state.actions.some(action => Array.isArray(action) && action[0] === 'resize'), false);
    assert.deepEqual(state.releases, ['image', 'context']);
  }

  reset(3000, 4500);
  state.failSave = true;
  await assert.rejects(module.exports.prepareBulkSaveImage(source), /synthetic save failure/);
  assert.deepEqual(state.releases, ['image', 'context'], 'rendered image and context release after save failure');
  assert.equal(state.sourceUris.includes(source), true, 'failed preparation never removes the source');

  const screen = readFileSync('app/bulk-review.tsx', 'utf8');
  assert.match(screen, /resize:\s*prepareBulkSaveImage/);
  assert.match(screen, /readPngBase64:\s*\(uri\)\s*=>\s*FileSystem\.readAsStringAsync/);
  assert.match(screen, /upload:\s*async \(userId, base64, itemId, mimeType, sourceUri\)[\s\S]*?uploadWardrobeImage/);
  delete (globalThis as any).__bulkSaveResize;
  console.log('Bulk-save image preparation: metadata-before-render ordering, longest-edge bounds, no-upscale behavior, JPEG encoding, source retention and resource cleanup passed (native mocks).');
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
