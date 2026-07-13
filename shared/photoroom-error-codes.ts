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
