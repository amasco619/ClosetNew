import {
  deleteGuestPhoto,
  getGuestPhotoRelativePath,
  type DeleteAsyncFn,
} from './guestPhotoCleanup';

export const ACCOUNT_LOCAL_STORAGE_KEYS = [
  '@amodka_profile',
  '@amodka_wardrobe',
  '@amodka_premium',
  '@amodka_slots',
  '@amodka_rotation',
  '@amodka_wear_history',
  '@amodka_reactions',
  '@amodka_mood',
  '@amodka_saved_looks',
  '@amodka_item_ids',
  '@amodka_wear_log',
  '@amodka_weather_v1',
  '@amodka_weather_perm_asked_v1',
  '@amodka_wardrobe_view',
  '@amodka_email_confirmed',
  '@amodka_pending_photo_cleanups',
  '@auracloset_profile',
  '@auracloset_wardrobe',
  '@auracloset_premium',
  '@auracloset_slots',
  '@auracloset_rotation',
  '@auracloset_wear_history',
  '@auracloset_reactions',
  '@auracloset_mood',
  '@auracloset_saved_looks',
  '@auracloset_item_ids',
  '@auracloset_wear_log',
  '@auracloset_weather_v1',
  '@auracloset_weather_perm_asked_v1',
  '@auracloset_wardrobe_view',
  '@auracloset_email_confirmed',
  '@auracloset_pending_photo_cleanups',
] as const;

export async function deleteAccountThenClearLocalData(
  deleteAccountOnServer: () => Promise<void>,
  clearLocalData: () => Promise<boolean>,
): Promise<boolean> {
  await deleteAccountOnServer();
  return clearLocalData();
}

export async function clearAccountDeviceData(options: {
  removeStorageKeys: (keys: readonly string[]) => Promise<void>;
  photoUris: ReadonlyArray<string | undefined>;
  documentDirectory: string | null | undefined;
  deleteAsync: DeleteAsyncFn;
  clearSignedPhotoCache: () => void;
}): Promise<boolean> {
  const { documentDirectory } = options;
  const managedPhotoUris = options.photoUris.filter(photoUri => {
    const relativePath = getGuestPhotoRelativePath(photoUri, documentDirectory);
    return relativePath !== null && /^wardrobe_[A-Za-z0-9_-]+\.(?:jpg|png)$/.test(relativePath);
  });

  const cleanupResults = await Promise.allSettled([
    options.removeStorageKeys(ACCOUNT_LOCAL_STORAGE_KEYS),
    ...managedPhotoUris.map(photoUri =>
      deleteGuestPhoto(photoUri, documentDirectory, options.deleteAsync),
    ),
  ]);
  options.clearSignedPhotoCache();
  return cleanupResults.every(result => result.status === 'fulfilled');
}
