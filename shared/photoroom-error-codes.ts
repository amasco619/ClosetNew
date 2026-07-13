/**
 * Shared error code constants for the Photoroom background-removal pipeline.
 *
 * Both the server handler (server/remove-background.ts) and the client
 * retry layer (lib/photoroom.ts) import from this file so the error-code
 * contract is enforced at compile-time: renaming the constant here will
 * cause a TypeScript error in both files immediately.
 */

/** Emitted by the server when the Photoroom API call exceeds PHOTOROOM_TIMEOUT_MS. */
export const PHOTOROOM_TIMEOUT_ERROR = "photoroom_timeout" as const;
export type PhotoroomTimeoutError = typeof PHOTOROOM_TIMEOUT_ERROR;

/** Emitted by the server when Photoroom returns a non-2xx HTTP response. */
export const PHOTOROOM_ERROR = "photoroom_error" as const;
export type PhotoroomError = typeof PHOTOROOM_ERROR;

/** Emitted by the server when Photoroom returns HTTP 200 but a 0-byte body. */
export const PHOTOROOM_EMPTY_RESPONSE = "photoroom_empty_response" as const;
export type PhotoroomEmptyResponse = typeof PHOTOROOM_EMPTY_RESPONSE;

/** Emitted by the server when the Photoroom response body is not a valid PNG or is too small. */
export const PHOTOROOM_INVALID_RESPONSE = "photoroom_invalid_response" as const;
export type PhotoroomInvalidResponse = typeof PHOTOROOM_INVALID_RESPONSE;

/** Emitted by the server when a generic/unexpected error occurs during the removal pipeline. */
export const BACKGROUND_REMOVAL_FAILED = "background_removal_failed" as const;
export type BackgroundRemovalFailed = typeof BACKGROUND_REMOVAL_FAILED;

/** Emitted by the server when PHOTOROOM_API_KEY is not configured (HTTP 503). */
export const BACKGROUND_REMOVAL_UNAVAILABLE = "background_removal_unavailable" as const;
export type BackgroundRemovalUnavailable = typeof BACKGROUND_REMOVAL_UNAVAILABLE;
