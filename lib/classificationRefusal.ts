/** Shared client interpretation; never present provider reasons as user-facing copy. */
export const PHOTO_REFUSAL_TITLE = "We couldn't read this photo";
export const PHOTO_REFUSAL_BODY = 'Try a clearer photo of a single piece, or add its details yourself.';

export function isContentGuardrailError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { status, message } = error as { status?: number; message?: string };
  if (status !== undefined && status !== 422) return false;
  if (typeof message !== 'string' || !message.startsWith('422:')) return false;
  try {
    return JSON.parse(message.slice(4).trim())?.error === 'content_guardrail';
  } catch {
    return false;
  }
}

export function isTransientClassificationError(error: unknown): boolean {
  const { status, kind } = (error ?? {}) as { status?: number; kind?: string };
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  if (kind) return ['network', 'timeout', 'abort'].includes(kind);
  return error instanceof Error && /network|failed to fetch|timed out|timeout|offline/i.test(error.message);
}
