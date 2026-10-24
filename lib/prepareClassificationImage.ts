import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { readImageDimensions } from './imageDimensions';

/**
 * Both entry routes use orientation-aware encoded-image metadata.
 * Preserve aspect ratio and real detail: cap the longest edge, never upscale,
 * and encode only once before the existing background-removal step.
 */
export async function prepareClassificationImage(uri: string) {
  const { width, height } = await readImageDimensions(uri);
  const context = ImageManipulator.manipulate(uri);
  let prepared: ImageRef | undefined;
  try {
    if (Math.max(width, height) > 1024) {
      // Queue the resize BEFORE the first rendered bitmap, preserving proportions.
      context.resize(width >= height ? { width: 1024 } : { height: 1024 });
    }
    prepared = await context.renderAsync();
    const result = await prepared.saveAsync({
      compress: 0.8, format: SaveFormat.JPEG, base64: true,
    });
    if (!result.base64) throw new Error('classification_image_data_missing');
    return result;
  } finally {
    prepared?.release();
    context.release();
  }
}
