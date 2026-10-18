import {
  createPhotoPrepareDiagnostic,
  runClassifyUri,
  type BulkItemCore,
  type ClassifyDeps,
} from '../lib/bulkClassifyCore';
import { shortUriHash } from '../lib/bulkPhotoStaging';

const diagnostic = createPhotoPrepareDiagnostic(
  'file:///private/var/mobile/Photos/garment.HEIC',
  new Error('Failed to read file:///private/var/mobile/Photos/garment.HEIC Bearer example-token'),
  {
    stage: 'image-resize',
    width: 3024,
    height: 4032,
    usedSerialResizeQueue: true,
    elapsedMs: 14.4,
  },
);

if (
  diagnostic.uriScheme !== 'file' ||
  diagnostic.fileExtension !== 'heic' ||
  diagnostic.width !== 3024 ||
  diagnostic.height !== 4032 ||
  diagnostic.elapsedMs !== 14 ||
  !diagnostic.usedSerialResizeQueue ||
  !diagnostic.message.includes('<uri>') ||
  !diagnostic.message.includes('Bearer <redacted>') ||
  diagnostic.message.includes('/private/var/mobile/Photos/garment.HEIC')
) {
  throw new Error('Photo-preparation diagnostics must keep metadata while redacting full URIs and credentials.');
}

console.log('Photo-preparation diagnostic metadata is retained and sensitive text is redacted.');

void (async () => {
  const uri = 'file:///private/var/mobile/Photos/bulk-item.png';
  let items: BulkItemCore[] = [{ uri, status: 'pending', classification: null }];
  let logged: typeof diagnostic | undefined;
  const deps: ClassifyDeps = {
    resize: async () => { throw new Error('native decode failed'); },
    removeBg: async () => null,
    writePngToCache: async () => 'file:///cache/cutout.png',
    classify: async () => ({}),
    setItems: updater => { items = updater(items); },
    onHaptic: () => undefined,
    diagnostics: { enabled: true, usedSerialResizeQueue: true },
    onDiagnostic: value => { logged = value; },
  };

  await runClassifyUri(uri, { current: true }, deps);
  const captured = items[0]?.diagnostic;
  if (
    items[0]?.status !== 'error' ||
    items[0]?.failureStage !== 'photo-preparation' ||
    captured?.stage !== 'image-resize' ||
    captured?.uriScheme !== 'file' ||
    captured?.fileExtension !== 'png' ||
    captured?.usedSerialResizeQueue !== true ||
    !logged ||
    captured.message.includes('/private/var/mobile/Photos/bulk-item.png')
  ) {
    throw new Error('Bulk resize failure must retain a sanitized per-item diagnostic in memory.');
  }
  console.log('Bulk resize failures attach diagnostics to the matching in-memory item.');

  const stagedUri = 'file:///private/cache/amodka/bulk-staging/abc.jpg';
  const stagedPhoto = {
    uri: stagedUri,
    diagnostic: {
      pickedAtMs: Date.now() - 1000,
      pickerUriHash: 'picker123',
      stagedUriHash: shortUriHash(stagedUri),
      fileNameLength: 9,
      mimeType: 'image/jpeg',
      width: 1200,
      height: 1600,
      sourceExistsAtPick: true,
      sourceSizeAtPick: 4000,
      stagedExistsAtPick: true,
      stagedSizeAtPick: 4000,
    },
  };
  let currentInfoChecked = false;
  let stagedItems: BulkItemCore[] = [{ uri: stagedUri, status: 'pending', classification: null }];
  await runClassifyUri(stagedUri, { current: true }, {
    resize: async () => { throw new Error('native decode failed'); },
    removeBg: async () => null,
    writePngToCache: async () => 'file:///cache/cutout.png',
    classify: async () => ({}),
    setItems: updater => { stagedItems = updater(stagedItems); },
    onHaptic: () => undefined,
    diagnostics: {
      enabled: true,
      usedSerialResizeQueue: true,
      stagedPhoto,
      inspectUri: async uri => {
        currentInfoChecked = uri === stagedUri;
        return { exists: false, size: undefined };
      },
    },
  });
  const stagedDiagnostic = stagedItems[0]?.diagnostic;
  if (
    !currentInfoChecked ||
    stagedDiagnostic?.pickerUriHash !== 'picker123' ||
    stagedDiagnostic?.uriHashNow !== stagedDiagnostic?.stagedUriHashAtPick ||
    stagedDiagnostic?.currentExists !== false ||
    stagedDiagnostic?.uriMatchesPickTime !== true ||
    stagedDiagnostic?.msSincePick === undefined ||
    stagedDiagnostic?.fileNameLength !== 9 ||
    stagedDiagnostic?.message.includes('/private/cache/amodka/bulk-staging/abc.jpg')
  ) {
    throw new Error('Bulk staging diagnostics must include pick/current file evidence without exposing the local path.');
  }
  console.log('Bulk staging diagnostics compare pick-time and failure-time file metadata without logging paths.');
})();
