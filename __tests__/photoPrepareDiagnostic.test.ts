import {
  createPhotoPrepareDiagnostic,
  formatPhotoPrepareDiagnostic,
  runClassifyUri,
  type BulkItemCore,
  type ClassifyDeps,
} from '../lib/bulkClassifyCore';

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
const formatted = formatPhotoPrepareDiagnostic(diagnostic);

if (
  diagnostic.uriScheme !== 'file' ||
  diagnostic.fileExtension !== 'heic' ||
  diagnostic.width !== 3024 ||
  diagnostic.height !== 4032 ||
  diagnostic.elapsedMs !== 14 ||
  !diagnostic.usedSerialResizeQueue ||
  !formatted.includes('<uri>') ||
  !formatted.includes('Bearer <redacted>') ||
  formatted.includes('/private/var/mobile/Photos/garment.HEIC')
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
    formatPhotoPrepareDiagnostic(captured).includes('/private/var/mobile/Photos/bulk-item.png')
  ) {
    throw new Error('Bulk resize failure must retain a sanitized per-item diagnostic in memory.');
  }
  console.log('Bulk resize failures attach diagnostics to the matching in-memory item.');
})();
