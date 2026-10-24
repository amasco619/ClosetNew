import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { readImageDimensions } from './imageDimensions';

export async function prepareBulkSaveImage(uri: string) {
  const { width, height } = await readImageDimensions(uri);
  const context = ImageManipulator.manipulate(uri);
  let prepared: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    if (Math.max(width, height) > 1600) {
      context.resize(width >= height ? { width: 1600 } : { height: 1600 });
    }
    prepared = await context.renderAsync();
    return await prepared.saveAsync({
      compress: 0.85, format: SaveFormat.JPEG, base64: true,
    });
  } finally {
    prepared?.release();
    context.release();
  }
}
