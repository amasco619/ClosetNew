/** Transient, in-memory handoff for app-owned copies of multi-selected photos. */

export interface BulkPhotoPickDiagnostic {
  pickedAtMs: number;
  pickerUriHash: string;
  stagedUriHash: string;
  fileNameLength?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  sourceExistsAtPick?: boolean;
  sourceSizeAtPick?: number;
  stagedExistsAtPick: boolean;
  stagedSizeAtPick?: number;
}

export interface StagedBulkPhoto {
  /** Kept in memory only; never placed in Expo Router params or diagnostics. */
  uri: string;
  diagnostic?: BulkPhotoPickDiagnostic;
}

export interface BulkPhotoSelection {
  photos: StagedBulkPhoto[];
  failedCount: number;
}

export interface PickedPhotoAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
}

export interface StagingFileInfo {
  exists: boolean;
  size?: number;
  modificationTime?: number;
}

export interface StagePickedPhotosDeps {
  ensureDirectory(): Promise<void>;
  getInfo(uri: string): Promise<StagingFileInfo>;
  copy(from: string, to: string): Promise<void>;
  delete(uri: string): Promise<void>;
  makeUri(asset: PickedPhotoAsset, index: number): string;
  diagnosticsEnabled: boolean;
  now?: () => number;
}

export interface StagePickedPhotosResult {
  photos: StagedBulkPhoto[];
  failedCount: number;
}

export interface BulkPhotoCleanupSummary {
  deletedCount: number;
  retainedCount: number;
}

export const BULK_STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const selections = new Map<string, BulkPhotoSelection>();

export function bulkStagingDirectoryUri(cacheDirectory?: string | null): string | null {
  if (!cacheDirectory) return null;
  const root = cacheDirectory.endsWith('/') ? cacheDirectory : `${cacheDirectory}/`;
  return `${root}amodka/bulk-staging/`;
}

/** Stable, short, non-reversible identifier for diagnostics; never log the URI. */
export function shortUriHash(uri: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < uri.length; i++) {
    hash ^= uri.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function stagePickedPhotos(
  assets: readonly PickedPhotoAsset[],
  deps: StagePickedPhotosDeps,
): Promise<StagePickedPhotosResult> {
  if (assets.length === 0) return { photos: [], failedCount: 0 };

  try {
    await deps.ensureDirectory();
  } catch {
    return { photos: [], failedCount: assets.length };
  }

  const now = deps.now ?? Date.now;
  const results = await Promise.all(assets.map(async (asset, index) => {
    const pickedAtMs = now();
    let sourceInfo: StagingFileInfo | undefined;
    if (deps.diagnosticsEnabled) {
      try {
        sourceInfo = await deps.getInfo(asset.uri);
      } catch {
        // Pick-time file metadata is diagnostic only; a successful copy is decisive.
      }
    }

    const stagedUri = deps.makeUri(asset, index);
    try {
      await deps.copy(asset.uri, stagedUri);
      const stagedInfo = await deps.getInfo(stagedUri);
      if (!stagedInfo.exists) throw new Error('staged_file_missing');

      const diagnostic: BulkPhotoPickDiagnostic | undefined = deps.diagnosticsEnabled
        ? {
          pickedAtMs,
          pickerUriHash: shortUriHash(asset.uri),
          stagedUriHash: shortUriHash(stagedUri),
          fileNameLength: asset.fileName?.length,
          mimeType: asset.mimeType ?? undefined,
          width: asset.width,
          height: asset.height,
          sourceExistsAtPick: sourceInfo?.exists,
          sourceSizeAtPick: sourceInfo?.size,
          stagedExistsAtPick: stagedInfo.exists,
          stagedSizeAtPick: stagedInfo.size,
        }
        : undefined;
      return { photo: { uri: stagedUri, diagnostic }, stagedUri };
    } catch {
      await deps.delete(stagedUri).catch(() => undefined);
      return null;
    }
  }));

  const photos = results.flatMap(result => result ? [result.photo] : []);
  return { photos, failedCount: assets.length - photos.length };
}

export function storeBulkPhotoSelection(
  selectionId: string,
  selection: BulkPhotoSelection,
): boolean {
  if (!selectionId || selection.photos.length === 0 || selections.has(selectionId)) return false;
  selections.set(selectionId, {
    photos: selection.photos.map(photo => ({ ...photo })),
    failedCount: Math.max(0, Math.floor(selection.failedCount)),
  });
  return true;
}

export function getBulkPhotoSelection(selectionId?: string): BulkPhotoSelection | undefined {
  return selectionId ? selections.get(selectionId) : undefined;
}

export function getActiveBulkStagedUris(): Set<string> {
  return new Set(
    Array.from(selections.values()).flatMap(selection => selection.photos.map(photo => photo.uri)),
  );
}

export function clearBulkPhotoSelection(selectionId: string): void {
  selections.delete(selectionId);
}

function stagingRoot(directoryUri: string): string {
  return directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
}

export async function deleteUnreferencedStagedPhotos(
  uris: readonly string[],
  directoryUri: string,
  deps: { delete(uri: string): Promise<void>; protectedUris?: ReadonlySet<string> },
): Promise<{ deleted: string[]; retained: string[] }> {
  const root = stagingRoot(directoryUri);
  const protectedUris = deps.protectedUris ?? new Set<string>();
  const deleted: string[] = [];
  const retained: string[] = [];
  await Promise.all(uris.map(async uri => {
    if (!uri.startsWith(root) || protectedUris.has(uri)) {
      retained.push(uri);
      return;
    }
    try {
      await deps.delete(uri);
      deleted.push(uri);
    } catch {
      retained.push(uri);
    }
  }));
  return { deleted, retained };
}

export async function cleanupBulkPhotoSelection(
  selectionId: string,
  directoryUri: string,
  deps: { delete(uri: string): Promise<void>; protectedUris?: ReadonlySet<string> },
): Promise<BulkPhotoCleanupSummary> {
  const selection = selections.get(selectionId);
  if (!selection) return { deletedCount: 0, retainedCount: 0 };
  const uris = selection.photos.map(photo => photo.uri);
  const { deleted, retained } = await deleteUnreferencedStagedPhotos(uris, directoryUri, deps);
  if (retained.length === 0) {
    selections.delete(selectionId);
    return { deletedCount: deleted.length, retainedCount: 0 };
  }
  const retainedSet = new Set(retained);
  selections.set(selectionId, {
    photos: selection.photos.filter(photo => retainedSet.has(photo.uri)),
    failedCount: 0,
  });
  return { deletedCount: deleted.length, retainedCount: retained.length };
}

export async function removeBulkPhotoFromSelection(
  selectionId: string,
  photoUri: string,
  directoryUri: string,
  deps: { delete(uri: string): Promise<void>; protectedUris?: ReadonlySet<string> },
): Promise<void> {
  const selection = selections.get(selectionId);
  if (!selection) return;
  const { retained } = await deleteUnreferencedStagedPhotos(
    [photoUri],
    directoryUri,
    deps,
  );
  const keepUri = retained.includes(photoUri);
  const photos = selection.photos.filter(photo => photo.uri !== photoUri || keepUri);
  if (photos.length === 0) selections.delete(selectionId);
  else selections.set(selectionId, { ...selection, photos });
}

export async function sweepOldStagedPhotos(
  directoryUri: string,
  deps: {
    readDirectory(uri: string): Promise<string[]>;
    getInfo(uri: string): Promise<StagingFileInfo>;
    delete(uri: string): Promise<void>;
    protectedUris?: ReadonlySet<string>;
    now?: () => number;
    maxAgeMs?: number;
  },
): Promise<string[]> {
  const root = stagingRoot(directoryUri);
  const names = await deps.readDirectory(directoryUri).catch(() => []);
  const protectedUris = new Set([
    ...getActiveBulkStagedUris(),
    ...(deps.protectedUris ?? []),
  ]);
  const cutoff = (deps.now ?? Date.now)() - (deps.maxAgeMs ?? BULK_STAGING_MAX_AGE_MS);
  const removed: string[] = [];

  await Promise.all(names.map(async name => {
    if (!name || name === '.' || name === '..' || /[/\\]/.test(name)) return;
    const uri = `${root}${name}`;
    if (protectedUris.has(uri)) return;
    try {
      const info = await deps.getInfo(uri);
      if (!info.exists || !info.modificationTime) return;
      // Legacy FileSystem modificationTime is seconds since the Unix epoch.
      if (info.modificationTime * 1000 >= cutoff) return;
      await deps.delete(uri);
      removed.push(uri);
    } catch {
      // Startup cleanup is best-effort; never fail app initialization.
    }
  }));
  return removed;
}
