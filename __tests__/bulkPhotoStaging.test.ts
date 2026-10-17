import {
  BULK_STAGING_MAX_AGE_MS,
  cleanupBulkPhotoSelection,
  clearBulkPhotoSelection,
  getActiveBulkStagedUris,
  getBulkPhotoSelection,
  shortUriHash,
  stagePickedPhotos,
  storeBulkPhotoSelection,
  sweepOldStagedPhotos,
  type PickedPhotoAsset,
  type StagePickedPhotosDeps,
} from '../lib/bulkPhotoStaging';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function makeStageDeps(options: {
  failingSource?: string;
  failDirectory?: boolean;
} = {}): Promise<{
  deps: StagePickedPhotosDeps;
  files: Map<string, { size: number; modificationTime: number }>;
  deleted: string[];
}> {
  const files = new Map<string, { size: number; modificationTime: number }>();
  const deleted: string[] = [];
  const deps: StagePickedPhotosDeps = {
    ensureDirectory: async () => {
      if (options.failDirectory) throw new Error('directory unavailable');
    },
    getInfo: async uri => {
      const file = files.get(uri);
      return file ? { exists: true, ...file } : { exists: false };
    },
    copy: async (from, to) => {
      if (from === options.failingSource) throw new Error('copy failed');
      files.set(to, { size: 1234, modificationTime: 1 });
    },
    delete: async uri => {
      deleted.push(uri);
      files.delete(uri);
    },
    makeUri: (_asset, index) => `file:///cache/bulk-staging/${index}.jpeg`,
    diagnosticsEnabled: true,
    now: () => 1000,
  };
  return { deps, files, deleted };
}

void (async () => {
  const assets: PickedPhotoAsset[] = [
    { uri: 'content://picker/coat', fileName: 'coat.jpeg', mimeType: 'image/jpeg', width: 1200, height: 1600 },
    { uri: 'content://picker/shirt', fileName: 'shirt.png', mimeType: 'image/png', width: 800, height: 900 },
  ];

  assert(shortUriHash(assets[0].uri).length === 8, 'URI hashes are short');
  assert(shortUriHash(assets[0].uri) !== shortUriHash(assets[1].uri), 'different picker URIs get distinct hashes');

  {
    const { deps, files } = await makeStageDeps();
    for (const asset of assets) files.set(asset.uri, { size: 987, modificationTime: 1 });
    const result = await stagePickedPhotos(assets, deps);
    assert(result.photos.length === 2 && result.failedCount === 0, 'all successfully copied photos are returned');
    assert(result.photos.every(photo => files.has(photo.uri)), 'staged copies are present in the app-owned folder');
    assert(result.photos[0].diagnostic?.fileNameLength === 'coat.jpeg'.length, 'diagnostics record filename length only');
    assert(result.photos[0].diagnostic?.sourceSizeAtPick === 987, 'diagnostics retain source size at pick time');
    assert(result.photos[0].diagnostic?.stagedSizeAtPick === 1234, 'diagnostics retain staged size at pick time');
    assert(result.photos[0].diagnostic?.pickerUriHash === shortUriHash(assets[0].uri), 'diagnostics store only a hash of the picker URI');
  }

  {
    const { deps, files, deleted } = await makeStageDeps({ failingSource: assets[1].uri });
    for (const asset of assets) files.set(asset.uri, { size: 100, modificationTime: 1 });
    const result = await stagePickedPhotos(assets, deps);
    assert(result.photos.length === 1 && result.failedCount === 1, 'partial copy failures are omitted while successful copies remain');
    assert(deleted.includes('file:///cache/bulk-staging/1.jpeg'), 'a failed partial destination is cleaned up');
  }

  {
    const { deps, deleted } = await makeStageDeps({ failDirectory: true });
    const result = await stagePickedPhotos(assets, deps);
    assert(result.photos.length === 0 && result.failedCount === 2, 'directory failure reports every selected photo as not staged');
    assert(deleted.length === 0, 'no destination is deleted when staging never started');
  }

  {
    const { deps } = await makeStageDeps({ failingSource: assets[0].uri });
    const result = await stagePickedPhotos([assets[0]], deps);
    assert(result.photos.length === 0 && result.failedCount === 1, 'all-copy-fail result is empty and explicit');
  }

  const selectionId = 'stage-test-one';
  const protectedUri = 'file:///cache/bulk-staging/local-only.jpeg';
  const savedUri = 'file:///cache/bulk-staging/saved.jpeg';
  assert(!getBulkPhotoSelection(selectionId), 'missing selection IDs resolve to no protected draft');
  assert(storeBulkPhotoSelection(selectionId, {
    photos: [{ uri: protectedUri }, { uri: savedUri }],
    failedCount: 0,
  }), 'a non-empty in-memory selection can be stored by opaque ID');
  assert(getBulkPhotoSelection(selectionId)?.photos.length === 2, 'valid selection ID resolves to the staged photos');
  assert(!storeBulkPhotoSelection(selectionId, { photos: [{ uri: savedUri }], failedCount: 0 }), 'duplicate selection IDs are rejected');

  {
    const deleted: string[] = [];
    const summary = await cleanupBulkPhotoSelection(selectionId, 'file:///cache/bulk-staging/', {
      delete: async uri => { deleted.push(uri); },
      protectedUris: new Set([protectedUri]),
    });
    assert(deleted.length === 1 && deleted[0] === savedUri, 'cleanup deletes unreferenced staged photos only');
    assert(summary.deletedCount === 1 && summary.retainedCount === 1, 'cleanup summary exposes counts without exposing paths');
    assert(getBulkPhotoSelection(selectionId)?.photos.length === 1, 'local-only/pending references remain in the in-memory selection');
    assert(getActiveBulkStagedUris().has(protectedUri), 'retained referenced photo remains protected from the startup sweep');
  }
  clearBulkPhotoSelection(selectionId);
  assert(!getBulkPhotoSelection(selectionId), 'selection can be released after its references are resolved');

  {
    const activeUri = 'file:///cache/bulk-staging/active.jpeg';
    const wardrobeUri = 'file:///cache/bulk-staging/wardrobe.jpeg';
    const recentUri = 'file:///cache/bulk-staging/recent.jpeg';
    const oldUri = 'file:///cache/bulk-staging/old.jpeg';
    const now = BULK_STAGING_MAX_AGE_MS * 10;
    const oldTime = (now - BULK_STAGING_MAX_AGE_MS - 1000) / 1000;
    const recentTime = (now - BULK_STAGING_MAX_AGE_MS + 1000) / 1000;
    storeBulkPhotoSelection('stage-test-active', { photos: [{ uri: activeUri }], failedCount: 0 });
    const deleted: string[] = [];
    const removed = await sweepOldStagedPhotos('file:///cache/bulk-staging/', {
      readDirectory: async () => ['active.jpeg', 'wardrobe.jpeg', 'recent.jpeg', 'old.jpeg'],
      getInfo: async uri => ({
        exists: true,
        modificationTime: uri === recentUri ? recentTime : oldTime,
      }),
      delete: async uri => { deleted.push(uri); },
      protectedUris: new Set([wardrobeUri]),
      now: () => now,
    });
    assert(removed.length === 1 && removed[0] === oldUri, 'startup sweep deletes only unreferenced files older than 24 hours');
    assert(!deleted.includes(activeUri) && !deleted.includes(wardrobeUri) && !deleted.includes(recentUri), 'active, wardrobe-referenced, and recent files are retained');
    clearBulkPhotoSelection('stage-test-active');
  }

  console.log('Bulk photo staging, in-memory handoff, protected cleanup, and 24-hour sweep passed.');
})();
