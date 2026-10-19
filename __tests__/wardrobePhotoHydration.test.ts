import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { hydrateWardrobePhoto, MissingWardrobePhotoError } from '../lib/wardrobePhotoHydration';

async function main() {
  const missing = {
    id: 'existing-item', storagePath: 'owner/existing-item.jpg',
    photoUri: 'owner/existing-item.jpg', category: 'top', description: 'Keep my details',
  };
  const missingError = new MissingWardrobePhotoError('Wardrobe photo is no longer available');
  assert.equal(await hydrateWardrobePhoto(missing, async () => { throw missingError; }), true);
  assert.equal(missing.photoUri, '', 'missing paths are not rendered as image URLs');
  assert.equal(missing.storagePath, 'owner/existing-item.jpg', 'retain path for repair');
  assert.equal(missing.description, 'Keep my details');
  assert.equal(missing.id, 'existing-item');
  assert.equal(await hydrateWardrobePhoto(missing, async () => 'https://example.com/restored'), false);
  assert.equal(missing.photoUri, 'https://example.com/restored', 'a restored photo resolves normally');

  for (const message of ['Network request failed', 'Unauthorized', 'Permission denied']) {
    const error = new Error(message);
    await assert.rejects(hydrateWardrobePhoto(missing, async () => { throw error; }), error);
  }
  let called = false;
  const local = { photoUri: 'file:///guest.jpg' };
  assert.equal(await hydrateWardrobePhoto(local, async () => { called = true; return ''; }), false);
  assert.equal(called, false);
  assert.equal(local.photoUri, 'file:///guest.jpg');

  // Exercise the actual Storage response mapping without loading React Native or
  // contacting Supabase. Bundled helpers share the same error-class identity.
  const bundle = await build({
    stdin: {
      contents: `export { getSignedWardrobeUrl } from './lib/storage';
        export { hydrateWardrobePhoto } from './lib/wardrobePhotoHydration';
        export { supabase } from './lib/supabase';`,
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{
      name: 'stub-supabase',
      setup(builder) {
        builder.onResolve({ filter: /\/supabase$|^\.\/supabase$/ }, () => ({
          path: 'supabase', namespace: 'stub',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export const supabase = { storage: {} };', loader: 'js',
        }));
      },
    }],
  });
  const compiled = { exports: {} as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
    compiled, compiled.exports, createRequire(import.meta.url),
  );
  for (const [providerMessage, isMissing] of [
    ['Object not found', true], ['Unauthorized', false], ['Network request failed', false],
  ] as const) {
    compiled.exports.supabase.storage.from = () => ({
      createSignedUrl: async () => ({ data: null, error: { message: providerMessage } }),
    });
    const item = { photoUri: 'owner/missing.jpg', storagePath: 'owner/missing.jpg' };
    const pending = compiled.exports.hydrateWardrobePhoto(item, compiled.exports.getSignedWardrobeUrl);
    if (isMissing) {
      assert.equal(await pending, true);
      assert.equal(item.photoUri, '');
    } else {
      await assert.rejects(pending, new RegExp(providerMessage));
    }
  }

  const context = readFileSync('contexts/AppContext.tsx', 'utf8');
  const start = context.indexOf('const storagePathItems =');
  const end = context.indexOf('setWardrobeItems(mapped);', start);
  const hydration = context.slice(start, end);
  assert.match(hydration, /hydrateWardrobePhoto\(it, resolveWardrobeImageUrl\)/);
  assert(hydration.indexOf('assertCurrent();') < hydration.indexOf('setOrphanedItems('),
    'late responses must pass existing account/startup guards before publishing recovery UI');
  assert.doesNotMatch(hydration, /deleteWardrobe|uploadWardrobe|\.remove\(|\.insert\(/,
    'hydrating a missing photo must not mutate cloud data');
  console.log('Wardrobe photo hydration: missing-photo recovery, restored photos, preserved metadata, auth/network propagation and stale-account guard passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
