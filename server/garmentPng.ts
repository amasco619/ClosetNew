const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_DIMENSION = 4096;
const MAX_PNG_PIXELS = 16_000_000;
const STUDIO_RGB = [233, 228, 220] as const;

type PngRaster = { width: number; height: number; data: Buffer };
type PngCodec = {
  sync: {
    read(buffer: Buffer): PngRaster;
    write(raster: PngRaster): Buffer;
  };
};

const { PNG } = require("pngjs") as { PNG: PngCodec };

function decodePng(buffer: Buffer): PngRaster {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("invalid_png");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (
    width < 1 || height < 1 ||
    width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION ||
    width * height > MAX_PNG_PIXELS
  ) {
    throw new Error("png_dimensions_out_of_range");
  }
  const raster = PNG.sync.read(buffer);
  if (raster.width !== width || raster.height !== height || raster.data.length !== width * height * 4) {
    throw new Error("invalid_png_pixels");
  }
  return raster;
}

/** Crop transparent margins and retain an even, small transparent border. */
export function trimTransparentGarmentPng(buffer: Buffer): Buffer {
  const image = decodePng(buffer);
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] > 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top) return buffer;

  const margin = Math.max(4, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.035));
  const cropLeft = Math.max(0, left - margin);
  const cropTop = Math.max(0, top - margin);
  const cropRight = Math.min(image.width - 1, right + margin);
  const cropBottom = Math.min(image.height - 1, bottom + margin);
  const width = cropRight - cropLeft + 1;
  const height = cropBottom - cropTop + 1;
  if (width === image.width && height === image.height) return buffer;

  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceStart = ((cropTop + y) * image.width + cropLeft) * 4;
    image.data.copy(data, y * width * 4, sourceStart, sourceStart + width * 4);
  }
  return PNG.sync.write({ width, height, data });
}

/** Composite transparency onto Amodka's neutral studio color for Gemini. */
export function flattenGarmentPngOnStudio(buffer: Buffer): Buffer {
  const image = decodePng(buffer);
  const data = Buffer.alloc(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3];
    const inverseAlpha = 255 - alpha;
    data[i] = Math.round((image.data[i] * alpha + STUDIO_RGB[0] * inverseAlpha) / 255);
    data[i + 1] = Math.round((image.data[i + 1] * alpha + STUDIO_RGB[1] * inverseAlpha) / 255);
    data[i + 2] = Math.round((image.data[i + 2] * alpha + STUDIO_RGB[2] * inverseAlpha) / 255);
    data[i + 3] = 255;
  }
  return PNG.sync.write({ width: image.width, height: image.height, data });
}
