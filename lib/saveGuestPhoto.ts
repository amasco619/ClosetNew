import * as FileSystem from 'expo-file-system/legacy';
import { buildGuestPhotoDestPath } from '../constants/guestPhotoCleanup';
import { readImageDimensions, type ImageDimensions } from './imageDimensions';
import { prepareStorageUploadImage } from './storageUploadImage';
import type { StorageImageMimeType } from './storageUploadBounds';

/** Keep a bounded managed copy, or retain the original safely for manual sync. */
export async function saveGuestPhoto(
  uri: string, itemId: string, mimeType: StorageImageMimeType,
  pickerDimensions?: ImageDimensions, originalUri?: string,
) {
  const cutout = mimeType === 'image/png';
  const dest = buildGuestPhotoDestPath(FileSystem.documentDirectory!, itemId, cutout ? 'png' : 'jpg');
  try {
    const base64 = await prepareStorageUploadImage('', mimeType, uri, cutout ? undefined : pickerDimensions);
    await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
    return { photoUri: dest, localPhotoDimensions: await readImageDimensions(dest) };
  } catch {
    // Only remove our incomplete output before fallback (copy requires a new
    // destination on iOS). Neither input is ever deleted by a failed preparation.
    if (dest !== uri && dest !== originalUri) {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    }
    let retainedUri = dest;
    let dimensions = cutout ? undefined : pickerDimensions;
    try {
      await FileSystem.copyAsync({ from: uri, to: dest });
    } catch (error) {
      if (!cutout || !originalUri || originalUri === uri) {
        throw new Error('Could not save photo to device storage — please try again.', { cause: error });
      }
      retainedUri = buildGuestPhotoDestPath(FileSystem.documentDirectory!, itemId, 'jpg');
      await FileSystem.copyAsync({ from: originalUri, to: retainedUri });
      dimensions = pickerDimensions;
    }
    return { photoUri: retainedUri, localPhotoDimensions: dimensions, guestSyncNeedsManualRetry: true };
  }
}
