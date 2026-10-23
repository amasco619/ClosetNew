import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { stripDataUriPrefix } from './uploadArg';
import {
  MAX_STORAGE_IMAGE_EDGE,
  PermanentStorageUploadError,
  prepareBoundedStorageImage,
  type StorageImageMimeType,
} from './storageUploadBounds';

let temporaryFileId = 0;

export async function prepareStorageUploadImage(
  base64: string,
  mimeType: StorageImageMimeType,
  sourceUri?: string,
): Promise<string> {
  const inputBase64 = stripDataUriPrefix(base64);
  let temporaryUri: string | undefined;
  let uri = sourceUri;
  if (!uri) {
    if (!FileSystem.cacheDirectory) throw new PermanentStorageUploadError('invalid');
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    temporaryUri = `${FileSystem.cacheDirectory}amodka-storage-${Date.now()}-${++temporaryFileId}.${extension}`;
    uri = temporaryUri;
    await FileSystem.writeAsStringAsync(uri, inputBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  try {
    const sourceContext = ImageManipulator.manipulate(uri);
    let source: Awaited<ReturnType<typeof sourceContext.renderAsync>> | undefined;
    let width: number;
    let height: number;
    try {
      source = await sourceContext.renderAsync();
      width = source.width;
      height = source.height;
    } finally {
      source?.release();
      sourceContext.release();
    }
    const resize = Math.max(width, height) > MAX_STORAGE_IMAGE_EDGE
      ? width >= height ? { width: MAX_STORAGE_IMAGE_EDGE } : { height: MAX_STORAGE_IMAGE_EDGE }
      : undefined;

    return await prepareBoundedStorageImage(mimeType, async quality => {
      const context = ImageManipulator.manipulate(uri!);
      let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
      let outputUri: string | undefined;
      try {
        if (resize) context.resize(resize);
        image = await context.renderAsync();
        const result = await image.saveAsync({
          compress: quality,
          format: mimeType === 'image/png' ? SaveFormat.PNG : SaveFormat.JPEG,
          base64: true,
        });
        if (!result.base64) throw new PermanentStorageUploadError('invalid');
        outputUri = result.uri;
        return { base64: result.base64, width: result.width, height: result.height };
      } finally {
        image?.release();
        context.release();
        if (outputUri) await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => undefined);
      }
    });
  } finally {
    if (temporaryUri) await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
  }
}
