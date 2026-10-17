/**
 * Pure, framework-free core of the bulk-review classification pipeline.
 *
 * Extracted from app/bulk-review.tsx so that the guard logic (mountedRef
 * checks at every async checkpoint) can be imported and tested in Node.js
 * without pulling in Expo / React Native modules.
 *
 * The component delegates its classifyUri and redirectSingle callbacks to
 * runClassifyUri / runRedirectSingle respectively, passing real async
 * dependencies as the `deps` argument.  Tests inject controlled mock deps.
 */

import type { ItemCategory, OccasionTag, SeasonTag } from '@/constants/types';
import { shortUriHash, type StagedBulkPhoto } from '@/lib/bulkPhotoStaging';
import { isContentGuardrailError, classificationFailurePresentation } from '@/lib/classificationRefusal';
import { readCachedCutout } from './uploadPhotoSource';
import { reportUploadError } from './uploadErrors';

// ─── Types (previously local to bulk-review.tsx) ──────────────────────────────

export interface ClassifyResult {
  category: ItemCategory;
  subType: string;
  colorFamily: string;
  accentColor?: string;
  description: string;
  occasionTags: OccasionTag[];
  seasonTags: SeasonTag[];
  pattern?: string;
  patternScale?: string;
  fabric?: string;
  weight?: string;
  dominantHsl?: { h: number; s: number; l: number };
  dominantLab?: { L: number; a: number; b: number };
  fit?: string;
  neckline?: string;
  sleeveLength?: string;
  rise?: string;
  warmthBand?: string;
  modelConfidence?: number;
}

export interface BulkItemCore {
  uri: string;
  cutoutUri?: string;
  status: string;
  classification: ClassifyResult | null;
  autoSavedId?: string;
  failureStage?: ClassifyFailureStage;
  diagnostic?: PhotoPrepareDiagnostic;
  retryable?: boolean;
  failureKind?: 'transient' | 'unexpected';
  backgroundRemovalSucceeded?: boolean;
}

export type ClassifyFailureStage = 'photo-preparation' | 'classification';

export function selectBulkProgress(items: BulkItemCore[]) {
  const visible = items.filter(item => item.status !== 'removed');
  const classifiedCount = visible.filter(item => ['settled', 'saving', 'saved', 'local-only'].includes(item.status)).length;
  const failedCount = visible.filter(item => item.status === 'error').length;
  const refusedCount = visible.filter(item => item.status === 'refused').length;
  const transientCount = visible.filter(item => item.status === 'error' && item.failureKind === 'transient').length;
  const totalCount = visible.length;
  return {
    classifiedCount, failedCount, refusedCount, transientCount, totalCount,
    progressRatio: totalCount ? (classifiedCount + failedCount + refusedCount) / totalCount : 0,
  };
}

export interface PhotoPrepareDiagnostic {
  stage: 'image-resize' | 'background-removal' | 'classification';
  errorName: string;
  message: string;
  stack: string[];
  uriScheme: string;
  fileExtension: string;
  width?: number;
  height?: number;
  usedSerialResizeQueue: boolean;
  elapsedMs: number;
  pickerUriHash?: string;
  stagedUriHashAtPick?: string;
  uriHashNow?: string;
  fileNameLength?: number;
  mimeType?: string;
  sourceExistsAtPick?: boolean;
  sourceSizeAtPick?: number;
  stagedExistsAtPick?: boolean;
  stagedSizeAtPick?: number;
  currentExists?: boolean;
  currentSize?: number;
  uriMatchesPickTime?: boolean;
  msSincePick?: number;
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s)"']+/gi, '<uri>')
    .replace(/\/(?:[^/\s)]+\/)+[^/\s)]+/g, '<path>')
    .replace(/\bBearer\s+\S+/gi, 'Bearer <redacted>')
    .replace(/[A-Za-z0-9+/=_-]{80,}/g, '<redacted-data>')
    .slice(0, 240);
}

export function createPhotoPrepareDiagnostic(
  uri: string,
  error: unknown,
  context: Pick<PhotoPrepareDiagnostic, 'stage' | 'usedSerialResizeQueue' | 'elapsedMs'> &
    Partial<Pick<PhotoPrepareDiagnostic, 'width' | 'height'>>,
): PhotoPrepareDiagnostic {
  const candidate = error && typeof error === 'object'
    ? error as { name?: unknown; message?: unknown; stack?: unknown }
    : undefined;
  const rawStack = typeof candidate?.stack === 'string' ? candidate.stack : '';
  const rawMessage = typeof candidate?.message === 'string'
    ? candidate.message
    : typeof error === 'string' ? error : 'Unknown error';
  const uriScheme = uri.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase() ?? 'unknown';
  const path = uri.split(/[?#]/, 1)[0];
  const filename = path.slice(path.lastIndexOf('/') + 1);

  return {
    stage: context.stage,
    errorName: sanitizeDiagnosticText(
      typeof candidate?.name === 'string' ? candidate.name : 'Error',
    ),
    message: sanitizeDiagnosticText(rawMessage),
    stack: rawStack.split('\n').slice(0, 5).map(sanitizeDiagnosticText),
    uriScheme,
    fileExtension: filename.match(/\.([a-z\d]{1,10})$/i)?.[1]?.toLowerCase() ?? 'unknown',
    width: context.width,
    height: context.height,
    usedSerialResizeQueue: context.usedSerialResizeQueue,
    elapsedMs: Math.max(0, Math.round(context.elapsedMs)),
  };
}

export function formatPhotoPrepareDiagnostic(diagnostic: PhotoPrepareDiagnostic): string {
  // Metro substitutes false in release; the minifier removes all formatter text.
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return '';
  const dimensions = diagnostic.width !== undefined && diagnostic.height !== undefined
    ? `${diagnostic.width}x${diagnostic.height}`
    : 'unknown';
  const lines = [
    `${diagnostic.stage}: ${diagnostic.errorName}: ${diagnostic.message}`,
    `uri=${diagnostic.uriScheme}; ext=${diagnostic.fileExtension}; size=${dimensions}; queue=${diagnostic.usedSerialResizeQueue}; elapsed=${diagnostic.elapsedMs}ms`,
  ];
  if (diagnostic.uriHashNow) {
    lines.push(
      `uriHash=${diagnostic.uriHashNow}; pickHash=${diagnostic.stagedUriHashAtPick ?? 'unknown'}; sameAsPick=${diagnostic.uriMatchesPickTime ?? 'unknown'}; currentExists=${diagnostic.currentExists ?? 'unknown'}; currentSize=${diagnostic.currentSize ?? 'unknown'}; sincePick=${diagnostic.msSincePick ?? 'unknown'}ms`,
      `pickerHash=${diagnostic.pickerUriHash ?? 'unknown'}; nameLength=${diagnostic.fileNameLength ?? 'unknown'}; mime=${diagnostic.mimeType ?? 'unknown'}; sourceAtPick=${diagnostic.sourceExistsAtPick ?? 'unknown'}/${diagnostic.sourceSizeAtPick ?? 'unknown'}; stagedAtPick=${diagnostic.stagedExistsAtPick ?? 'unknown'}/${diagnostic.stagedSizeAtPick ?? 'unknown'}`,
    );
  }
  lines.push(...diagnostic.stack);
  return lines.join('\n');
}

/** Serialize memory-heavy native transforms without serializing network work. */
export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

// ─── Dependency interfaces ────────────────────────────────────────────────────

export interface ClassifyDeps {
  previousCutout?: { uri?: string; succeeded: boolean };
  readPngBase64?(uri: string): Promise<string>;
  /** Resize `uri` to ≤1024 px and return its JPEG base64 (or null on failure). */
  resize(uri: string): Promise<{ base64?: string } | null>;
  /** Remove background from a JPEG base64. Returns PNG base64 or null. */
  removeBg(base64: string): Promise<string | null>;
  /** Write a clean PNG to a cache file; only its URI is retained in UI state. */
  writePngToCache(pngBase64: string): Promise<string>;
  /** POST image bytes with their actual MIME type to /api/classify-garment. */
  classify(imageBase64: string, imageMimeType: 'image/jpeg' | 'image/png'): Promise<Record<string, unknown>>;
  /** Updater for the items state array. */
  setItems(updater: (prev: BulkItemCore[]) => BulkItemCore[]): void;
  /** Trigger a haptic impulse after a successful classification. */
  onHaptic(): void;
  /** Opt-in diagnostics are kept in memory and emitted only by development callers. */
  diagnostics?: {
    enabled: boolean;
    usedSerialResizeQueue: boolean;
    width?: number;
    height?: number;
    stagedPhoto?: StagedBulkPhoto;
    inspectUri?(uri: string): Promise<{ exists: boolean; size?: number }>;
  };
  onDiagnostic?(diagnostic: PhotoPrepareDiagnostic): void;
}

export interface RedirectSingleDeps {
  // Typed as `any` so both the real expo-router.replace and lightweight test
  // stubs can satisfy the interface without casting at the call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replace(params: any): void;
  /** Opaque in-memory lookup key for a photo staged before the bulk route. */
  bulkSelectionId: string;
  /** A borrowed batch photo opened for manual entry; keep the review underneath. */
  manualPhotoIndex?: number;
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Run the full classify pipeline for a single URI, checking `mountedRef` at
 * every async checkpoint so no state mutation or navigation fires after the
 * component unmounts.
 *
 * This is the testable heart of the classifyUri useCallback in bulk-review.tsx.
 */
export async function runClassifyUri(
  uri: string,
  mountedRef: { current: boolean },
  deps: ClassifyDeps,
): Promise<void> {
  if (!mountedRef.current) return;
  deps.setItems(prev =>
    prev.map(it => it.uri === uri
      ? { ...it, status: 'classifying', failureStage: undefined, diagnostic: undefined, retryable: undefined }
      : it),
  );

  const startedAt = Date.now();
  let failureStage: ClassifyFailureStage = 'photo-preparation';
  let diagnosticStage: PhotoPrepareDiagnostic['stage'] = 'image-resize';
  try {
    const cached = await readCachedCutout(deps.previousCutout?.uri, deps.readPngBase64);
    const resized = cached ? { base64: cached } : await deps.resize(uri);
    if (!mountedRef.current) return;
    if (!resized?.base64) throw new Error('resize_failed');

    let classifyBase64 = resized.base64;
    let classifyMimeType: 'image/jpeg' | 'image/png' = cached ? 'image/png' : 'image/jpeg';
    diagnosticStage = 'background-removal';
    try {
      const cleanPngBase64 = deps.previousCutout?.succeeded ? null : await deps.removeBg(classifyBase64);
      if (!mountedRef.current) return;

      if (cleanPngBase64) {
        deps.setItems(prev => prev.map(it => it.uri === uri ? { ...it, backgroundRemovalSucceeded: true } : it));
        const cutoutUri = await deps.writePngToCache(cleanPngBase64).catch(error => {
          reportUploadError({ stage: 'cutout-write', code: 'FAILED' });
          throw error;
        });
        if (!mountedRef.current) return;
        deps.setItems(prev =>
          prev.map(it => it.uri === uri ? { ...it, cutoutUri } : it),
        );
        classifyBase64 = cleanPngBase64;
        classifyMimeType = 'image/png';
      }
    } catch {
      reportUploadError({ stage: 'background-removal', code: 'FAILED' });
      // Background removal and its preview cache are optional; keep classifying
      // the resized original instead of failing the entire bulk-review item.
    }
    if (!mountedRef.current) return;

    failureStage = 'classification';
    diagnosticStage = 'classification';
    const data = await deps.classify(classifyBase64, classifyMimeType);
    if (!mountedRef.current) return;

    const classification: ClassifyResult = {
      category:     (data.category as ItemCategory) || 'top',
      subType:      (data.subType      as string)   || '',
      colorFamily:  (data.colorFamily  as string)   || '',
      accentColor:  data.accentColor as string | undefined,
      description:  (data.description  as string)   || '',
      occasionTags: Array.isArray(data.occasionTags) ? data.occasionTags as OccasionTag[] : [],
      seasonTags:   Array.isArray(data.seasonTags)   ? data.seasonTags   as SeasonTag[]   : [],
      pattern:      data.pattern      as string | undefined,
      patternScale: data.patternScale as string | undefined,
      fabric:       data.fabric       as string | undefined,
      weight:       data.weight       as string | undefined,
      dominantHsl:  data.dominantHsl  as ClassifyResult['dominantHsl'],
      dominantLab:  data.dominantLab  as ClassifyResult['dominantLab'],
      fit:          data.fit          as string | undefined,
      neckline:        data.neckline        as string | undefined,
      sleeveLength:    data.sleeveLength    as string | undefined,
      rise:            data.rise            as string | undefined,
      warmthBand:      data.warmthBand      as string | undefined,
      modelConfidence: typeof data.modelConfidence === 'number'
        ? Math.min(1, Math.max(0, data.modelConfidence))
        : undefined,
    };

    deps.setItems(prev =>
      prev.map(it => it.uri === uri
        ? { ...it, status: 'settled', classification, failureStage: undefined, diagnostic: undefined }
        : it),
    );
    deps.onHaptic();
  } catch (error) {
    reportUploadError({ stage: diagnosticStage === 'image-resize' ? 'resize' : 'classify', code: 'FAILED' });
    if (!mountedRef.current) return;
    if (diagnosticStage === 'classification' && isContentGuardrailError(error)) {
      deps.setItems(prev => prev.map(it => it.uri === uri
        ? { ...it, status: 'refused', retryable: false, failureStage: undefined, diagnostic: undefined }
        : it));
      return;
    }
    let diagnostic = deps.diagnostics?.enabled
      ? createPhotoPrepareDiagnostic(uri, error, {
        stage: diagnosticStage,
        usedSerialResizeQueue: deps.diagnostics.usedSerialResizeQueue,
        width: deps.diagnostics.width,
        height: deps.diagnostics.height,
        elapsedMs: Date.now() - startedAt,
      })
      : undefined;
    const stagedPhoto = diagnosticStage === 'image-resize'
      ? deps.diagnostics?.stagedPhoto
      : undefined;
    if (diagnostic && stagedPhoto?.diagnostic) {
      let currentInfo: { exists: boolean; size?: number } | undefined;
      try {
        currentInfo = await deps.diagnostics?.inspectUri?.(uri);
      } catch {
        // Missing current file metadata must not hide the original resize failure.
      }
      if (!mountedRef.current) return;
      const picked = stagedPhoto.diagnostic;
      diagnostic = {
        ...diagnostic,
        pickerUriHash: picked.pickerUriHash,
        stagedUriHashAtPick: picked.stagedUriHash,
        uriHashNow: shortUriHash(uri),
        fileNameLength: picked.fileNameLength,
        mimeType: picked.mimeType,
        sourceExistsAtPick: picked.sourceExistsAtPick,
        sourceSizeAtPick: picked.sourceSizeAtPick,
        stagedExistsAtPick: picked.stagedExistsAtPick,
        stagedSizeAtPick: picked.stagedSizeAtPick,
        currentExists: currentInfo?.exists,
        currentSize: currentInfo?.size,
        uriMatchesPickTime: uri === stagedPhoto.uri,
        msSincePick: Math.max(0, Date.now() - picked.pickedAtMs),
      };
    }
    if (diagnostic) deps.onDiagnostic?.(diagnostic);
    deps.setItems(prev =>
      prev.map(it => it.uri === uri
        ? { ...it, status: 'error', failureStage, diagnostic, retryable: true,
          failureKind: classificationFailurePresentation(error).kind }
        : it),
    );
  }
}

// ─── Save-all pipeline ───────────────────────────────────────────────────────

/** A settled BulkItem ready to be persisted (classification is guaranteed). */
export interface SaveAllItem {
  uri: string;
  cutoutUri?: string;
  /** Ephemeral compatibility for existing callers; screen state stores only cutoutUri. */
  cleanBase64?: string;
  classification: ClassifyResult;
}

/** Opaque payload passed from runSaveAll → deps.addItem so the caller can
 *  apply its own type guards before forwarding to the wardrobe store. */
export interface BulkSavePayload {
  id: string;
  photoUri: string;
  classification: ClassifyResult;
  /** Storage path (e.g. "userId/itemId.jpg") for durable DB persistence.
   *  Absent when the item was not uploaded (guest / upload failure). */
  storagePath?: string;
}

export interface SaveAllDeps {
  /** Generate a unique item id. */
  generateId(): string;
  /** Return the authenticated user id, or null for guest / unauthenticated. */
  getSession(): Promise<string | null>;
  /** Resize `uri` for upload (≤1600 px JPEG). Returns base64 result or null. */
  resize(uri: string): Promise<{ base64?: string } | null>;
  /** Read a cached transparent PNG only when a save is requested. */
  readPngBase64?(uri: string): Promise<string>;
  /** Write a JPEG/PNG base64 into durable guest document storage. */
  saveGuestImage?(base64: string, itemId: string, mimeType: 'image/jpeg' | 'image/png'): Promise<string>;
  /**
   * Upload to cloud storage.
   * Signature mirrors uploadWardrobeImage(userId, base64, itemId, mimeType).
   */
  upload(
    userId: string,
    base64: string,
    itemId: string,
    mimeType: string,
  ): Promise<string>;
  /** Best-effort removal for an upload whose batch was not persisted. */
  deleteUploaded?(userId: string, itemId: string): Promise<void>;
  /**
   * Pick the best upload source.  Pure — wraps resolveWardrobeUploadArg.
   * Returns null when neither source is usable (upload should be skipped).
   */
  resolveUploadArg(
    cleanBase64: string | undefined,
    shrunkBase64: string | undefined,
  ): { base64: string; mimeType: string } | null;
  /** Persist the complete batch atomically after all uploads have settled. */
  addItems(payloads: BulkSavePayload[]): Promise<void>;
  /** Updater for the items state array. */
  setItems(updater: (prev: BulkItemCore[]) => BulkItemCore[]): void;
  /** Set the saving spinner flag. */
  setSaving(value: boolean): void;
  /** Light haptic after each item is saved. */
  onItemHaptic(): void;
  /** Surface an authenticated upload fallback as local-only/pending. */
  onUploadFallback?(uri: string): void;
  /** Called when authenticated uploads fail; no batch commit occurs and review must remain visible. */
  onLocalOnlyComplete?(uris: string[]): void;
  /** Surface a failed atomic wardrobe commit; caller must keep review visible. */
  onSaveError?(error: unknown): void;
  /** Called only after addItems acknowledges the complete batch commit. */
  onSaved?(uris: string[]): Promise<void> | void;
  /** Success haptic after all items are saved. */
  onDoneHaptic(): void;
  /** Navigate away once the save loop finishes. */
  navigate(): void;
}

/**
 * Run the full save-all loop, checking `mountedRef` at every async checkpoint
 * and before every wardrobe / state mutation so nothing fires after the
 * component unmounts.
 *
 * This is the testable heart of handleSaveAll in bulk-review.tsx.
 */
export async function runSaveAll(
  toSave: SaveAllItem[],
  mountedRef: { current: boolean },
  deps: SaveAllDeps,
): Promise<void> {
  deps.setSaving(true);
  const localOnlyUris: string[] = [];
  const uploadedItems: { userId: string; itemId: string }[] = [];
  const cleanupUploads = async () => {
    if (!deps.deleteUploaded) return;
    await Promise.all(uploadedItems.map(async ({ userId: uploadedUserId, itemId }) => {
      try {
        await deps.deleteUploaded!(uploadedUserId, itemId);
      } catch {
        // Cleanup is best effort; preserve the original save outcome/error.
      }
    }));
  };

  let userId: string | null;
  try {
    userId = await deps.getSession();
  } catch (error) {
    if (mountedRef.current) {
      deps.setItems(prev => prev.map(it =>
        toSave.some(item => item.uri === it.uri && it.classification)
          ? { ...it, status: 'settled' }
          : it,
      ));
      deps.setSaving(false);
      deps.onSaveError?.(error);
    }
    return;
  }
  if (!mountedRef.current) {
    await cleanupUploads();
    return;
  }

  const payloads: BulkSavePayload[] = [];
  const payloadUris: string[] = [];
  let preparationFailed = false;

  for (const item of toSave) {
    if (!mountedRef.current) break;

    deps.setItems(prev =>
      prev.map(it => it.uri === item.uri ? { ...it, status: 'saving' } : it),
    );

    try {
      const itemId = deps.generateId();
      let finalUri = item.uri;
      let itemStoragePath: string | undefined;
      let uploadFailed = false;

      if (userId) {
        try {
          let shrunkBase64: string | undefined;
          let cleanBase64: string | undefined = item.cleanBase64;
          if (item.cutoutUri) {
            cleanBase64 = await readCachedCutout(item.cutoutUri, deps.readPngBase64);
          }
          if (!cleanBase64) {
            const shrunk = await deps.resize(item.uri);
            if (!mountedRef.current) {
              await cleanupUploads();
              return;
            }
            shrunkBase64 = shrunk?.base64;
          }
          const uploadArg = deps.resolveUploadArg(cleanBase64, shrunkBase64);
          if (uploadArg) {
            // Compute the durable storage path before upload (formula is deterministic)
            const ext = uploadArg.mimeType === 'image/png' ? 'png' : 'jpg';
            itemStoragePath = `${userId}/${itemId}.${ext}`;
            // The upload helper can fail after the object upload (e.g. while
            // generating its signed URL), so retain the key before awaiting it.
            uploadedItems.push({ userId, itemId });
            finalUri = await deps.upload(userId, uploadArg.base64, itemId, uploadArg.mimeType);
            if (!mountedRef.current) {
              await cleanupUploads();
              return;
            }
            if (/^(file|content):\/\//i.test(finalUri)) {
              throw new Error('Authenticated wardrobe upload returned a device-local URI.');
            }
          } else {
            // An authenticated item without an upload source is not a
            // successful cloud save. Preserve the local fallback, but make
            // the outcome explicit and block automatic navigation.
            uploadFailed = true;
            deps.onUploadFallback?.(item.uri);
          }
        } catch {
          reportUploadError({ stage: 'upload', code: 'FAILED' });
          // Upload failed — fall back to local URI; storagePath stays undefined
          itemStoragePath = undefined;
          uploadFailed = true;
          deps.onUploadFallback?.(item.uri);
        }
      } else {
        const cleanBase64 = await readCachedCutout(item.cutoutUri, deps.readPngBase64) ?? item.cleanBase64;
        const imageBase64 = cleanBase64 ?? (await deps.resize(item.uri))?.base64;
        if (!imageBase64) throw new Error('guest_image_unavailable');
        if (!deps.saveGuestImage) throw new Error('guest_writer_unavailable');
        finalUri = await deps.saveGuestImage(
          imageBase64,
          itemId,
          cleanBase64 ? 'image/png' : 'image/jpeg',
        );
      }

      if (!mountedRef.current) break;
      payloads.push({
        id: itemId,
        photoUri: finalUri,
        classification: item.classification,
        storagePath: itemStoragePath,
      });
      payloadUris.push(item.uri);
      if (uploadFailed) localOnlyUris.push(item.uri);
    } catch {
      reportUploadError({ stage: 'save', code: 'FAILED' });
      preparationFailed = true;
      if (mountedRef.current) {
        deps.setItems(prev =>
          prev.map(it => it.uri === item.uri ? { ...it, status: 'error' } : it),
        );
      }
    }
  }

  if (!mountedRef.current) {
    await cleanupUploads();
    return;
  }
  if (preparationFailed || payloads.length !== toSave.length) {
    await cleanupUploads();
    deps.setItems(prev => prev.map(it =>
      toSave.some(item => item.uri === it.uri)
        ? { ...it, status: 'settled' }
        : it,
    ));
    deps.setSaving(false);
    deps.onSaveError?.(new Error('The batch could not be prepared for saving.'));
    return;
  }
  if (userId && localOnlyUris.length > 0) {
    await cleanupUploads();
    deps.setItems(prev => prev.map(it => !payloadUris.includes(it.uri)
      ? it
      : { ...it, status: localOnlyUris.includes(it.uri) ? 'local-only' : 'settled' },
    ));
    deps.setSaving(false);
    deps.onLocalOnlyComplete?.(localOnlyUris);
    return;
  }
  if (payloads.length > 0) {
    try {
      await deps.addItems(payloads);
    } catch (error) {
      reportUploadError({ stage: 'save', code: 'FAILED' });
      // Only a database error code establishes that the transaction rejected
      // the batch. A lost response could follow a successful commit.
      const code = (error as { code?: string })?.code;
      if (code && code !== 'INVALID_RPC_RESULT') await cleanupUploads();
      if (mountedRef.current) {
        deps.setItems(prev => prev.map(it =>
          toSave.some(item => item.uri === it.uri)
            ? { ...it, status: 'settled' }
            : it,
        ));
        deps.setSaving(false);
        deps.onSaveError?.(error);
      }
      return;
    }
    try {
      await deps.onSaved?.(payloadUris);
    } catch {
      // Staging cleanup is best-effort and cannot turn a committed batch into a failure.
    }
    if (!mountedRef.current) return;
    deps.setItems(prev => prev.map(it => !payloadUris.includes(it.uri)
      ? it
      : { ...it, status: localOnlyUris.includes(it.uri) ? 'local-only' : 'saved' },
    ));
    payloads.forEach(() => deps.onItemHaptic());
  }
  deps.setSaving(false);
  if (localOnlyUris.length > 0) {
    deps.onLocalOnlyComplete?.(localOnlyUris);
    return;
  }
  deps.onDoneHaptic();
  deps.navigate();
}

// ─── Single-item redirect ─────────────────────────────────────────────────────

/**
 * Fire a single-item redirect, guarded by both the mounted ref and a
 * one-shot latch so it can never navigate more than once.
 *
 * This is the testable heart of the redirectSingle useCallback in bulk-review.tsx.
 */
export function runRedirectSingle(
  item: BulkItemCore,
  settled: boolean,
  mountedRef: { current: boolean },
  singleRedirectedRef: { current: boolean },
  deps: RedirectSingleDeps,
): void {
  if (singleRedirectedRef.current) return;
  if (!mountedRef.current) return;
  singleRedirectedRef.current = true;

  if (deps.manualPhotoIndex !== undefined) {
    deps.replace({
      pathname: '/add-item',
      params: {
        bulkSelectionId: deps.bulkSelectionId,
        bulkPhotoIndex: String(deps.manualPhotoIndex),
        manualEntry: 'true',
        returnToBulk: 'true',
      },
    });
    return;
  }

  if (settled && item.classification) {
    const c = item.classification;
    const params: Record<string, string> = {
      preClassified:  'true',
      pcCategory:     c.category,
      pcSubType:      c.subType,
      pcColorFamily:  c.colorFamily,
      pcAccentColor:  c.accentColor  ?? '',
      pcDescription:  c.description,
      pcOccasionTags: JSON.stringify(c.occasionTags),
      pcSeasonTags:   JSON.stringify(c.seasonTags),
      pcPattern:      c.pattern      ?? '',
      pcPatternScale: c.patternScale ?? '',
      pcFabric:       c.fabric       ?? '',
      pcWeight:       c.weight       ?? '',
      pcDominantHsl:  c.dominantHsl  ? JSON.stringify(c.dominantHsl) : '',
      pcDominantLab:  c.dominantLab  ? JSON.stringify(c.dominantLab) : '',
      pcFit:          c.fit          ?? '',
      pcNeckline:     c.neckline     ?? '',
      pcSleeveLength: c.sleeveLength ?? '',
      pcRise:         c.rise         ?? '',
      pcWarmthBand:   c.warmthBand   ?? '',
    };
    params.bulkSelectionId = deps.bulkSelectionId;
    deps.replace({
      pathname: '/add-item',
      params,
    });
  } else {
    deps.replace({
      pathname: '/add-item',
      params: { bulkSelectionId: deps.bulkSelectionId },
    });
  }
}

// ─── Auto-persist pipeline ────────────────────────────────────────────────────

/** Input for runAutoPersistItem — the clean PNG is read from cache when saving. */
export interface AutoPersistItemInput {
  uri: string;
  cutoutUri?: string;
  /** Ephemeral compatibility for direct tests; UI items retain only cutoutUri. */
  cleanBase64?: string;
  classification: ClassifyResult;
}

export interface AutoPersistDeps {
  /** Generate a unique item id. */
  generateId(): string;
  /** Return the authenticated user id, or null for guest / unauthenticated. */
  getSession(): Promise<string | null>;
  /**
   * Pick the best upload source from the clean PNG base64.
   * Returns null when the source is unusable and upload should be skipped.
   */
  resolveUploadArg(cleanBase64: string): { base64: string; mimeType: string } | null;
  readPngBase64?(uri: string): Promise<string>;
  /** Upload to cloud storage. Returns the final public/signed URI. */
  upload(userId: string, base64: string, itemId: string, mimeType: string): Promise<string>;
  /** Persist one item to the wardrobe store. */
  addItem(payload: BulkSavePayload): void;
  /** Updater for the items state array. */
  setItems(updater: (prev: BulkItemCore[]) => BulkItemCore[]): void;
  /** Light haptic impulse on success. */
  onHaptic(): void;
  /** Notify the caller that auto-save failed and manual retry is available. */
  onFailure?(): void;
}

/**
 * Run the auto-persist flow for a single settled item, checking `mountedRef`
 * and the live `itemsRef` snapshot at every async checkpoint.
 *
 * Returns the generated `autoSavedId` on success, or `null` when the flow was
 * aborted (no session, component unmounted, item removed, or upload failed).
 *
 * This is the testable heart of the auto-persist useEffect in bulk-review.tsx.
 */
export async function runAutoPersistItem(
  item: AutoPersistItemInput,
  mountedRef: { current: boolean },
  itemsRef: { current: { uri: string; status: string }[] },
  deps: AutoPersistDeps,
): Promise<string | null> {
  try {
    if (!mountedRef.current) return null;

    const userId = await deps.getSession();

    if (!userId || !mountedRef.current) {
      // No session — revert to 'settled' so the CTA unlocks and manual save works.
      deps.setItems(prev => prev.map(it =>
        it.uri === item.uri && it.status === 'auto-saving'
          ? { ...it, status: 'settled' } : it,
      ));
      return null;
    }

    // Guard: abort if the item was removed while we were awaiting auth.
    const afterAuth = itemsRef.current.find(it => it.uri === item.uri);
    if (!afterAuth || afterAuth.status === 'removed') return null;

    const itemId = deps.generateId();
    let cleanBase64 = item.cleanBase64;
    if (item.cutoutUri) {
      if (!deps.readPngBase64) throw new Error('png_reader_unavailable');
      cleanBase64 = await deps.readPngBase64(item.cutoutUri);
    }
    if (!cleanBase64) throw new Error('png_source_unavailable');
    if (!mountedRef.current) return null;
    const uploadArg = deps.resolveUploadArg(cleanBase64);
    // An authenticated auto-save is only successful when the image has been
    // uploaded.  In particular, do not turn a missing upload source into a
    // durable wardrobe record pointing at the device-local URI: that record
    // would look auto-saved while being unusable from another device.
    // Returning through the failure path leaves the item settled so the
    // caller can retry or use the explicit Save All local-only fallback.
    if (!uploadArg) {
      throw new Error('upload_source_unavailable');
    }
    let finalUri = item.uri;
    let itemStoragePath: string | undefined;
    // Compute the durable storage path before upload (formula is deterministic)
    const ext = uploadArg.mimeType === 'image/png' ? 'png' : 'jpg';
    itemStoragePath = `${userId}/${itemId}.${ext}`;
    finalUri = await deps.upload(userId, uploadArg.base64, itemId, uploadArg.mimeType);
    if (!mountedRef.current) return null;

    // Guard: abort if the item was removed while we were uploading.
    const afterUpload = itemsRef.current.find(it => it.uri === item.uri);
    if (!afterUpload || afterUpload.status === 'removed') return null;

    deps.addItem({ id: itemId, photoUri: finalUri, classification: item.classification, storagePath: itemStoragePath });

    if (!mountedRef.current) return null;
    deps.setItems(prev => prev.map(it =>
      it.uri === item.uri && it.status !== 'removed'
        ? { ...it, status: 'auto-saved', autoSavedId: itemId }
        : it,
    ));
    deps.onHaptic();
    return itemId;
  } catch {
    // Upload failed — revert to 'settled' so the CTA unlocks and manual save works.
    reportUploadError({ stage: 'save', code: 'FAILED' });
    if (mountedRef.current) {
      deps.setItems(prev => prev.map(it =>
        it.uri === item.uri && it.status === 'auto-saving'
          ? { ...it, status: 'settled' } : it,
      ));
      deps.onFailure?.();
    }
    return null;
  }
}

/**
 * Select items eligible for auto-persist from the current items array.
 * An item qualifies when it is 'settled', has a clean background-removed
 * PNG (`cutoutUri`), and has not already had auto-persist attempted.
 */
export function selectAutoPersistCandidates(
  items: (BulkItemCore & { cleanBase64?: string })[],
  attempted: Set<string>,
): BulkItemCore[] {
  return items.filter(
    it => it.status === 'settled' && (it.cutoutUri || it.cleanBase64) && !attempted.has(it.uri),
  );
}

// ─── handleRemove orphan cleanup ──────────────────────────────────────────────

export interface HandleRemoveDeps {
  /** Remove the wardrobe item that was auto-persisted (orphan cleanup). */
  removeItem(id: string): void;
  /** Mark the item as removed in the UI state. */
  setItems(updater: (prev: BulkItemCore[]) => BulkItemCore[]): void;
}

/**
 * Handle removal of a bulk-review item.  When the item was already
 * auto-persisted, the matching wardrobe entry is removed first (orphan
 * cleanup) before flipping the UI status to 'removed'.
 *
 * This is the testable heart of handleRemove in bulk-review.tsx.
 */
export function runHandleRemove(
  uri: string,
  match: { status: string; autoSavedId?: string } | undefined,
  deps: HandleRemoveDeps,
): void {
  if (match?.status === 'auto-saved' && match.autoSavedId) {
    deps.removeItem(match.autoSavedId);
  }
  deps.setItems(prev => prev.map(it =>
    it.uri === uri ? { ...it, status: 'removed' } : it,
  ));
}

// ─── handleSaveAll auto-saved edits ──────────────────────────────────────────

/** An already-persisted item whose classification edits should be synced. */
export interface AutoSavedEditItem {
  autoSavedId: string;
  classification: ClassifyResult;
}

export interface ApplyAutoSavedEditsDeps {
  /** Sync classification fields back to the wardrobe store for an item. */
  updateItem(id: string, classification: ClassifyResult): void;
}

/**
 * Apply any classification edits made in the BulkItemEditPanel to items
 * that were already auto-persisted (status === 'auto-saved').  This is the
 * synchronous, instant update that runs at the top of handleSaveAll before
 * the normal upload + add loop.
 *
 * Returns the number of items updated.
 */
export function applyAutoSavedEdits(
  items: AutoSavedEditItem[],
  deps: ApplyAutoSavedEditsDeps,
): number {
  for (const item of items) {
    deps.updateItem(item.autoSavedId, item.classification);
  }
  return items.length;
}

// ─── Cancel dialog message selection ─────────────────────────────────────────

/**
 * Select the correct cancel-dialog body text based on the current items state.
 *
 * Returns:
 *   null         — no dialog needed; caller should router.back() immediately.
 *   string       — the body text to show in the confirmation dialog.
 *
 * This pure function is the testable heart of handleCancel in bulk-review.tsx.
 */
export function selectCancelDialogBody(items: BulkItemCore[]): string | null {
  const hasInProgress = items.some(
    it => it.status === 'pending' || it.status === 'classifying',
  );
  if (!hasInProgress) return null; // nothing in flight — exit immediately

  const hasAutoSaved = items.some(it => it.status === 'auto-saved');
  return hasAutoSaved
    ? 'Some items have already been saved to your wardrobe. Any items still analysing will be discarded.'
    : 'AI analysis is still running. Leaving now will discard all pending results and you will need to re-upload the photos.';
}
