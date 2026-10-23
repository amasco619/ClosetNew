// Decimal MB: a 6 MB bucket cap can therefore use this exact byte value.
export const MAX_STORAGE_UPLOAD_BYTES = 6_000_000;
export const MAX_STORAGE_IMAGE_EDGE = 1600;

export type StorageImageMimeType = 'image/jpeg' | 'image/png';
export type StorageUploadFailureKind = 'too-large' | 'unsupported' | 'invalid' | 'rejected';
export type GuestPhotoSyncStage = 'prepare' | 'upload' | 'signed-url';

export class StorageStageError extends Error {
  readonly status?: number;
  readonly kind?: StorageUploadFailureKind;
  readonly permanent: boolean;

  constructor(readonly stage: Exclude<GuestPhotoSyncStage, 'prepare'>, readonly underlyingError: unknown) {
    super(`Storage ${stage} failed`);
    this.name = 'StorageStageError';
    this.status = storageUploadStatus(underlyingError);
    this.kind = storageUploadFailureKind(underlyingError) ?? undefined;
    this.permanent = this.kind !== undefined;
  }
}

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

export function storageUploadStatus(error: unknown): number | undefined {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const value = current as {
      status?: unknown; statusCode?: unknown; error?: unknown; cause?: unknown; underlyingError?: unknown;
    };
    const status = Number(value.status);
    if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
    const statusCode = Number(value.statusCode);
    if (Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599) return statusCode;
    current = value.underlyingError ?? value.cause ?? value.error;
  }
  return undefined;
}

function errorChain(error: unknown): object[] {
  const chain: object[] = [];
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    chain.push(current);
    const value = current as { underlyingError?: unknown; cause?: unknown; error?: unknown };
    current = value.underlyingError ?? value.cause ?? value.error;
  }
  return chain;
}

export function storageUploadFailureKind(error: unknown): StorageUploadFailureKind | null {
  const chain = errorChain(error);
  if (!chain.length) return null;
  const permanent = chain.find((part): part is PermanentStorageUploadError =>
    part instanceof PermanentStorageUploadError);
  if (permanent) return permanent.kind;
  const status = storageUploadStatus(error);
  if (status === 413) return 'too-large';
  if (status === 415) return 'unsupported';
  if (status !== undefined && [400, 422].includes(status)) return 'rejected';

  const details = chain.flatMap(part => {
    const value = part as { code?: unknown; message?: unknown; statusCode?: unknown };
    return [value.code, value.message, value.statusCode];
  }).filter((part): part is string => typeof part === 'string').join(' ').toLowerCase();
  if (/payload too large|file too large|entity.?too.?large|size limit|maximum.*size/.test(details)) return 'too-large';
  if (/unsupported media|invalid.?mime.?type|mime.?type.*(not allowed|not supported|unsupported|invalid)|invalid file type/.test(details)) return 'unsupported';
  return null;
}

export function storageUploadStage(error: unknown): Exclude<GuestPhotoSyncStage, 'prepare'> | undefined {
  const value = errorChain(error).find(part => {
    const stage = (part as { stage?: unknown }).stage;
    return stage === 'upload' || stage === 'signed-url';
  }) as { stage?: 'upload' | 'signed-url' } | undefined;
  return value?.stage;
}

export function isNetworkOfflineFailure(error: unknown): boolean {
  const details = errorChain(error).flatMap(part => {
    const value = part as { name?: unknown; message?: unknown; code?: unknown };
    return [value.name, value.message, value.code];
  }).filter((part): part is string => typeof part === 'string').join(' ').toLowerCase();
  return /network request failed|failed to fetch|fetch failed|network error|unable to resolve host|unknownhostexception|no address associated with hostname|name or service not known|temporary failure in name resolution|eai_again|enotfound|network is unreachable|enetunreach|ehostunreach|econnreset|connection reset|socket hang up|err_internet_disconnected/.test(details);
}

export function isStorageUploadTimeout(error: unknown): boolean {
  const details = errorChain(error).flatMap(part => {
    const value = part as { name?: unknown; message?: unknown; code?: unknown };
    return [value.name, value.message, value.code];
  }).filter((part): part is string => typeof part === 'string').join(' ').toLowerCase();
  return /guestsynctimeouterror|timeouterror|sockettimeoutexception|etimedout|econnaborted|timed out|timeout|deadline exceeded/.test(details);
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
      return 'This photo was rejected as too large. The app maximum is 6 MB. It remains on this device; choose a smaller photo and retry.';
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
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    throw new PermanentStorageUploadError('unsupported');
  }
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
    const bytes = base64ByteLength(image.base64);
    if (!bytes) throw new PermanentStorageUploadError('invalid');
    if (bytes <= MAX_STORAGE_UPLOAD_BYTES) return image.base64;
  }
  throw new PermanentStorageUploadError('too-large');
}
