import { Image } from 'react-native';

export type ImageDimensions = { width: number; height: number };

export async function readImageDimensions(uri: string, known?: ImageDimensions): Promise<ImageDimensions> {
  // RN 0.86 Android fetches EncodedImage metadata (including EXIF orientation),
  // not a decoded bitmap. Never render an original ImageRef to obtain its size.
  const dimensions = known ?? await Image.getSize(uri);
  if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) ||
      dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error('invalid_image_dimensions');
  }
  return dimensions;
}
