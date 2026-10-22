import assert from 'node:assert/strict';
import { flattenGarmentPngOnStudio, trimTransparentGarmentPng } from '../server/garmentPng';
import { classificationImagePayload } from '../lib/classifyPath';
import { isLightGarmentFamily, isTransparentGarmentImage } from '../lib/garmentImage';

type Raster = { width: number; height: number; data: Buffer };
type Codec = {
  new(options: { width: number; height: number }): Raster;
  sync: {
    read(buffer: Buffer): Raster;
    write(image: Raster): Buffer;
  };
};
const { PNG } = require('pngjs') as { PNG: Codec };

function pixel(image: Raster, x: number, y: number): number[] {
  const start = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(start, start + 4));
}

function makeCutout(): Buffer {
  const image = new PNG({ width: 100, height: 100 });
  for (let y = 30; y < 70; y++) {
    for (let x = 30; x < 70; x++) {
      image.data.set([120, 130, 140, 128], (y * image.width + x) * 4);
    }
  }
  image.data.set([0, 0, 0, 255], (30 * image.width + 30) * 4);
  image.data.set([255, 255, 255, 255], (30 * image.width + 31) * 4);
  image.data.set([255, 20, 120, 128], (30 * image.width + 32) * 4);
  return PNG.sync.write(image);
}

const cutout = makeCutout();
const trimmed = PNG.sync.read(trimTransparentGarmentPng(cutout));
assert.equal(trimmed.width, 48, 'transparent padding is cropped with a four-pixel margin');
assert.equal(trimmed.height, 48, 'cropped PNG remains square for this fixture');
assert.deepEqual(pixel(trimmed, 0, 0), [0, 0, 0, 0], 'the margin remains transparent');
assert.deepEqual(pixel(trimmed, 4, 4), [0, 0, 0, 255], 'black garment pixels are preserved');
assert.deepEqual(pixel(trimmed, 5, 4), [255, 255, 255, 255], 'white garment pixels are preserved');
assert.deepEqual(pixel(trimmed, 6, 4), [255, 20, 120, 128], 'bright semi-transparent pixels remain unchanged before provider matte');

const payload = classificationImagePayload(trimTransparentGarmentPng(cutout).toString('base64'));
assert.equal(payload.imageMimeType, 'image/png', 'classification keeps the actual PNG MIME type');

const flattened = PNG.sync.read(flattenGarmentPngOnStudio(cutout));
assert.deepEqual(pixel(flattened, 0, 0), [233, 228, 220, 255], 'transparent pixels use the neutral studio matte');
assert.deepEqual(pixel(flattened, 30, 30), [0, 0, 0, 255], 'opaque black stays black');
assert.deepEqual(pixel(flattened, 31, 30), [255, 255, 255, 255], 'opaque white stays white');
assert.deepEqual(pixel(flattened, 32, 30), [244, 124, 170, 255], 'partial alpha is composited accurately');
assert.ok(
  Array.from(flattened.data).filter((_, index) => index % 4 === 3).every(alpha => alpha === 255),
  'the image sent to Gemini is fully opaque',
);

const original = Buffer.from(cutout);
trimTransparentGarmentPng(cutout);
flattenGarmentPngOnStudio(cutout);
assert.deepEqual(cutout, original, 'both functions leave their input bytes unchanged');

const transparent = PNG.sync.write(new PNG({ width: 12, height: 8 }));
assert.equal(trimTransparentGarmentPng(transparent), transparent,
  'an entirely transparent image is returned unchanged');
const opaque = new PNG({ width: 3, height: 2 });
opaque.data.fill(255);
const opaqueBytes = PNG.sync.write(opaque);
assert.equal(trimTransparentGarmentPng(opaqueBytes), opaqueBytes,
  'an image without transparent margins is returned unchanged');
assert.deepEqual(PNG.sync.read(flattenGarmentPngOnStudio(opaqueBytes)).data, opaque.data,
  'flattening preserves every opaque pixel');

for (const processPng of [trimTransparentGarmentPng, flattenGarmentPngOnStudio]) {
  assert.throws(() => processPng(Buffer.from('not a PNG')), /invalid_png/);
  assert.throws(() => processPng(cutout.subarray(0, 20)), /invalid_png/);
  const oversized = Buffer.from(cutout);
  oversized.writeUInt32BE(4097, 16);
  assert.throws(() => processPng(oversized), /png_dimensions_out_of_range/);
  const zeroWidth = Buffer.from(cutout);
  zeroWidth.writeUInt32BE(0, 16);
  assert.throws(() => processPng(zeroWidth), /png_dimensions_out_of_range/);
  assert.throws(() => processPng(cutout.subarray(0, 30)),
    'a valid signature with incomplete PNG content is rejected');
}

assert.equal(isTransparentGarmentImage('https://cdn.example/item.png?token=x'), true);
assert.equal(isTransparentGarmentImage('https://cdn.example/item.png', 'user/item.jpg'), false,
  'the persisted Storage path takes precedence over a URL guess');
assert.equal(isLightGarmentFamily('cream'), true);
assert.equal(isLightGarmentFamily('navy'), false);

console.log('garmentPng: all image-processing assertions passed');
