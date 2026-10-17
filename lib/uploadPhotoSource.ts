import { reportUploadError } from './uploadErrors';

/** An evicted/empty cutout is a cache miss, not a cloud-upload failure. */
export async function readCachedCutout(
  uri: string | undefined,
  read: ((uri: string) => Promise<string>) | undefined,
): Promise<string | undefined> {
  if (!uri) return undefined;
  try {
    const base64 = await read?.(uri);
    if (base64) return base64;
  } catch { /* Rebuild from the selected original below the cache boundary. */ }
  reportUploadError({ stage: 'cutout-write', code: 'CACHE_UNAVAILABLE' });
  return undefined;
}
