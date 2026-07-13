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
}

export interface BulkItemCore {
  uri: string;
  displayUri?: string;
  cleanBase64?: string;
  status: string;
  classification: ClassifyResult | null;
}

// ─── Dependency interfaces ────────────────────────────────────────────────────

export interface ClassifyDeps {
  /** Resize `uri` to ≤1024 px and return its JPEG base64 (or null on failure). */
  resize(uri: string): Promise<{ base64?: string } | null>;
  /** Remove background from a JPEG base64. Returns PNG base64 or null. */
  removeBg(base64: string): Promise<string | null>;
  /** Re-encode a clean PNG base64 back to JPEG. Returns null on failure. */
  reencodeAsJpeg(pngBase64: string): Promise<{ base64?: string; uri: string } | null>;
  /** Pick the best base64 for the classify endpoint (original vs re-encoded). */
  resolveClassifyBase64(original: string, reencoded: string | null | undefined): string;
  /** Pick the safe display URI (never a data: string). */
  resolvePhotoUri(original: string, reencoded: string | null | undefined): string;
  /** POST to /api/classify-garment and return the parsed response body. */
  classify(imageBase64: string): Promise<Record<string, unknown>>;
  /** Updater for the items state array. */
  setItems(updater: (prev: BulkItemCore[]) => BulkItemCore[]): void;
  /** Trigger a haptic impulse after a successful classification. */
  onHaptic(): void;
}

export interface RedirectSingleDeps {
  // Typed as `any` so both the real expo-router.replace and lightweight test
  // stubs can satisfy the interface without casting at the call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replace(params: any): void;
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
    prev.map(it => it.uri === uri ? { ...it, status: 'classifying' } : it),
  );

  try {
    const resized = await deps.resize(uri);
    if (!mountedRef.current) return;
    if (!resized?.base64) throw new Error('resize_failed');

    let classifyBase64 = resized.base64;
    const cleanPngBase64 = await deps.removeBg(classifyBase64);
    if (!mountedRef.current) return;

    if (cleanPngBase64) {
      try {
        const reencoded = await deps.reencodeAsJpeg(cleanPngBase64);
        if (!mountedRef.current) return;
        classifyBase64 = deps.resolveClassifyBase64(classifyBase64, reencoded?.base64 ?? null);
        const safeDisplayUri = deps.resolvePhotoUri(uri, reencoded?.uri ?? null);
        deps.setItems(prev =>
          prev.map(it =>
            it.uri === uri
              ? { ...it, displayUri: safeDisplayUri, cleanBase64: cleanPngBase64 }
              : it,
          ),
        );
      } catch {
        if (mountedRef.current) {
          deps.setItems(prev =>
            prev.map(it =>
              it.uri === uri
                ? { ...it, displayUri: deps.resolvePhotoUri(uri, null), cleanBase64: cleanPngBase64 }
                : it,
            ),
          );
        }
      }
    }

    const data = await deps.classify(classifyBase64);
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
      neckline:     data.neckline     as string | undefined,
      sleeveLength: data.sleeveLength as string | undefined,
      rise:         data.rise         as string | undefined,
      warmthBand:   data.warmthBand   as string | undefined,
    };

    deps.setItems(prev =>
      prev.map(it => it.uri === uri ? { ...it, status: 'settled', classification } : it),
    );
    deps.onHaptic();
  } catch {
    if (!mountedRef.current) return;
    deps.setItems(prev =>
      prev.map(it => it.uri === uri ? { ...it, status: 'error' } : it),
    );
  }
}

// ─── Save-all pipeline ───────────────────────────────────────────────────────

/** A settled BulkItem ready to be persisted (classification is guaranteed). */
export interface SaveAllItem {
  uri: string;
  cleanBase64?: string;
  classification: ClassifyResult;
}

/** Opaque payload passed from runSaveAll → deps.addItem so the caller can
 *  apply its own type guards before forwarding to the wardrobe store. */
export interface BulkSavePayload {
  id: string;
  photoUri: string;
  classification: ClassifyResult;
}

export interface SaveAllDeps {
  /** Generate a unique item id. */
  generateId(): string;
  /** Return the authenticated user id, or null for guest / unauthenticated. */
  getSession(): Promise<string | null>;
  /** Resize `uri` for upload (≤1600 px JPEG). Returns base64 result or null. */
  resize(uri: string): Promise<{ base64?: string } | null>;
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
  /**
   * Pick the best upload source.  Pure — wraps resolveWardrobeUploadArg.
   * Returns null when neither source is usable (upload should be skipped).
   */
  resolveUploadArg(
    cleanBase64: string | undefined,
    shrunkBase64: string | undefined,
  ): { base64: string; mimeType: string } | null;
  /** Persist one item to the wardrobe store. */
  addItem(payload: BulkSavePayload): void;
  /** Updater for the items state array. */
  setItems(updater: (prev: BulkItemCore[]) => BulkItemCore[]): void;
  /** Set the saving spinner flag. */
  setSaving(value: boolean): void;
  /** Light haptic after each item is saved. */
  onItemHaptic(): void;
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

  const userId = await deps.getSession();
  if (!mountedRef.current) return;

  for (const item of toSave) {
    if (!mountedRef.current) break;

    deps.setItems(prev =>
      prev.map(it => it.uri === item.uri ? { ...it, status: 'saving' } : it),
    );

    try {
      const itemId = deps.generateId();
      let finalUri = item.uri;

      if (userId) {
        try {
          let shrunkBase64: string | undefined;
          if (!item.cleanBase64) {
            const shrunk = await deps.resize(item.uri);
            if (!mountedRef.current) return;
            shrunkBase64 = shrunk?.base64;
          }
          const uploadArg = deps.resolveUploadArg(item.cleanBase64, shrunkBase64);
          if (uploadArg) {
            finalUri = await deps.upload(userId, uploadArg.base64, itemId, uploadArg.mimeType);
            if (!mountedRef.current) return;
          }
        } catch {
          // Upload failed — fall back to local URI
        }
      }

      if (!mountedRef.current) break;
      deps.addItem({ id: itemId, photoUri: finalUri, classification: item.classification });
      deps.setItems(prev =>
        prev.map(it => it.uri === item.uri ? { ...it, status: 'saved' } : it),
      );
      deps.onItemHaptic();
    } catch {
      if (mountedRef.current) {
        deps.setItems(prev =>
          prev.map(it => it.uri === item.uri ? { ...it, status: 'error' } : it),
        );
      }
    }
  }

  if (!mountedRef.current) return;
  deps.setSaving(false);
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

  if (settled && item.classification) {
    const c = item.classification;
    deps.replace({
      pathname: '/add-item',
      params: {
        initialUri:     item.uri,
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
      },
    });
  } else {
    deps.replace({ pathname: '/add-item', params: { initialUri: item.uri } });
  }
}
