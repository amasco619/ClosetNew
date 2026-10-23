export const MAX_STORAGE_UPLOAD_BYTES = 6 * 1024 * 1024;
export const MAX_STORAGE_IMAGE_EDGE = 1600;

export type StorageImageMimeType = 'image/jpeg' | 'image/png';
export type StorageUploadFailureKind = 'too-large' | 'unsupported' | 'invalid' | 'rejected';

export class PermanentStorageUploadError extends Error {
  readonly permanent = true;

  constructor(readonly kind: StorageUploadFailureKind) {
    super(storageUploadFailureMessageForKind(kind));
    this.name = 'PermanentStorageUploadError';
  }
}

export function base64ByteLength(value: string): number {
  const base64 = value.replace(/^data:[^,]*;base64,/i, '').replace(/\s/g, '');
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

export function storageUploadFailureKind(error: unknown): StorageUploadFailureKind | null {
  if (error instanceof PermanentStorageUploadError) return error.kind;
  if (!error || typeof error !== 'object') return null;

  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
    error?: { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  };
  const status = Number(value.status ?? value.statusCode ?? value.error?.status ?? value.error?.statusCode);
  if (status === 413) return 'too-large';
  if (status === 415) return 'unsupported';
  if ([400, 422].includes(status)) return 'rejected';

  const details = [value.code, value.error?.code, value.message, value.error?.message]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
  if (/payload too large|file too large|entity too large|size limit|maximum file size/.test(details)) return 'too-large';
  if (/unsupported media|mime.?type.*(not allowed|unsupported|invalid)|invalid file type/.test(details)) return 'unsupported';
  return null;
}

export function asPermanentStorageUploadError(error: unknown): PermanentStorageUploadError | null {
  const kind = storageUploadFailureKind(error);
  return kind ? new PermanentStorageUploadError(kind) : null;
}

export function isPermanentStorageUploadError(error: unknown): boolean {
  return storageUploadFailureKind(error) !== null;
}

export function storageUploadFailureMessage(error: unknown): string {
  return storageUploadFailureMessageForKind(storageUploadFailureKind(error) ?? 'rejected');
}

function storageUploadFailureMessageForKind(kind: StorageUploadFailureKind): string {
  switch (kind) {
    case 'too-large':
      return 'This photo is still over 6 MB after preparation. It remains on this device; choose a smaller photo and retry.';
    case 'unsupported':
      return 'This photo format is not supported. Choose a JPEG or PNG; the local copy remains safe.';
    case 'invalid':
      return 'This photo could not be prepared for upload. It remains on this device; choose another photo and retry.';
    default:
      return 'Cloud storage rejected this photo. The local copy remains safe; retry manually or choose another photo.';
  }
}

export async function prepareBoundedStorageImage(
  mimeType: StorageImageMimeType,
  encode: (quality: number) => Promise<{ base64: string; width: number; height: number }>,
): Promise<string> {
  const qualities = mimeType === 'image/jpeg' ? [0.85, 0.7, 0.55, 0.4] : [1];
  for (const quality of qualities) {
    const image = await encode(quality);
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) ||
      image.width <= 0 || image.height <= 0) {
      throw new PermanentStorageUploadError('invalid');
    }
    if (Math.max(image.width, image.height) > MAX_STORAGE_IMAGE_EDGE) {
      throw new PermanentStorageUploadError('invalid');
    }
    if (base64ByteLength(image.base64) <= MAX_STORAGE_UPLOAD_BYTES) return image.base64;
  }
  throw new PermanentStorageUploadError('too-large');
}
