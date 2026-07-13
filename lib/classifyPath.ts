/**
 * Pure helpers for the background-removal → classify pipeline.
 *
 * Kept in a separate module (no expo/RN imports) so they can be imported
 * directly in unit tests running in Node without pulling in React Native.
 */

/**
 * Selects the base64 string that should be forwarded to the Gemini classify
 * endpoint after a background-removal attempt.
 *
 * Rules:
 *  - If background removal succeeded AND the result was successfully re-encoded
 *    to JPEG (reencodedJpegBase64 is a non-empty string), use that.
 *  - Otherwise (null, undefined, or empty string) fall back to the original JPEG.
 *
 * This function never returns an empty string — an empty reencodedJpegBase64 is
 * treated as a failure and the caller always gets a usable value for Gemini.
 */
export function resolveClassifyBase64(
  originalJpegBase64: string,
  reencodedJpegBase64: string | null | undefined,
): string {
  if (reencodedJpegBase64 && reencodedJpegBase64.length > 0) {
    return reencodedJpegBase64;
  }
  return originalJpegBase64;
}

/**
 * Models the full background-removal → classify pipeline decision as a pure
 * function, mirroring the logic in app/add-item.tsx and app/bulk-review.tsx.
 *
 * Parameters:
 *   originalJpeg    — the resized original JPEG (always available)
 *   bgRemovedPng    — result of calling /api/remove-background:
 *                       non-empty string on success, null on any failure
 *                       (HTTP error, network error, missing key, empty body)
 *   reencodedJpeg   — result of re-encoding the PNG back to JPEG:
 *                       non-empty string on success, null if re-encoding
 *                       failed or was skipped (bgRemovedPng was null)
 *
 * Returns the base64 that would be forwarded to /api/classify-garment.
 *
 * Use this in tests to assert the classify endpoint receives the correct
 * payload without needing to instantiate the React Native component.
 */
export function selectClassifyPayload(
  originalJpeg: string,
  bgRemovedPng: string | null,
  reencodedJpeg: string | null,
): string {
  if (!bgRemovedPng) {
    return originalJpeg;
  }
  return resolveClassifyBase64(originalJpeg, reencodedJpeg);
}
