import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

/**
 * Both entry routes use the decoder's dimensions, not picker/EXIF metadata.
 * Preserve aspect ratio and real detail: cap the longest edge, never upscale,
 * and encode only once before the existing background-removal step.
 */
export async function prepareClassificationImage(uri: string) {
  const context = ImageManipulator.manipulate(uri);
  let source: ImageRef | undefined;
  let prepared: ImageRef | undefined;
  try {
    source = await context.renderAsync();
    const { width, height } = source;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('invalid_classification_image_dimensions');
    }
    if (Math.max(width, height) > 1024) {
      // Specify one axis so the native decoder preserves the actual proportions.
      context.resize(width >= height ? { width: 1024 } : { height: 1024 });
      prepared = await context.renderAsync();
    } else {
      prepared = source;
    }
    const result = await prepared.saveAsync({
      compress: 0.8, format: SaveFormat.JPEG, base64: true,
    });
    if (!result.base64) throw new Error('classification_image_data_missing');
    return result;
  } finally {
    if (prepared && prepared !== source) prepared.release();
    source?.release();
    context.release();
  }
}
