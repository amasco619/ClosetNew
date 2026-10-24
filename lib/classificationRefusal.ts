/** Shared client interpretation; never present provider reasons as user-facing copy. */
export const PHOTO_REFUSAL_TITLE = "We couldn't read this photo";
export const PHOTO_REFUSAL_BODY = 'Try a clearer photo of a single piece, or add its details yourself.';

export type ClassificationFailureKind =
  | 'network' | 'busy' | 'rate-limit' | 'session' | 'unreadable' | 'consent' | 'generic';

export interface ClassificationFailurePresentation {
  kind: ClassificationFailureKind;
  title: string;
  hint: string;
  action: string;
}

function errorDetails(error: unknown): {
  status?: number;
  code?: string;
  kind?: string;
  retryAfter?: number;
  message?: string;
} {
  if (!error || typeof error !== 'object') return {};
  const candidate = error as Record<string, unknown>;
  return {
    status: typeof candidate.status === 'number' ? candidate.status : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    kind: typeof candidate.kind === 'string' ? candidate.kind : undefined,
    retryAfter: typeof candidate.retryAfter === 'number' && Number.isFinite(candidate.retryAfter)
      ? Math.max(1, Math.ceil(candidate.retryAfter)) : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  };
}

export function isContentGuardrailError(error: unknown): boolean {
  const { status, code, message } = errorDetails(error);
  if (code === 'UNREADABLE_PHOTO') return true;
  if (status !== undefined && status !== 422) return false;
  if (typeof message !== 'string' || !message.startsWith('422:')) return false;
  try {
    const body = JSON.parse(message.slice(4).trim());
    return body?.error === 'content_guardrail' || body?.error === 'multi_item_invalid';
  } catch {
    return false;
  }
}

export function isTransientClassificationError(error: unknown): boolean {
  const { status, code, kind } = errorDetails(error);
  if (['APP_RATE_LIMIT', 'PROVIDER_QUOTA', 'PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'MALFORMED_RESPONSE'].includes(code ?? '')) {
    return true;
  }
  if (['AUTH_REQUIRED', 'CONSENT_REQUIRED', 'UNREADABLE_PHOTO'].includes(code ?? '')) return false;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  if (kind) return ['network', 'timeout', 'abort', 'non_json'].includes(kind) || error instanceof SyntaxError;
  return error instanceof Error && /network|failed to fetch|timed out|timeout|offline/i.test(error.message);
}

export function classificationFailurePresentation(
  error: unknown,
  options: { localPreparation?: boolean } = {},
): ClassificationFailurePresentation {
  const { status, code, kind, retryAfter } = errorDetails(error);

  // Stable server codes take precedence over ambiguous HTTP statuses.
  if (code === 'APP_RATE_LIMIT') {
    const wait = retryAfter ? `Try again in ${retryAfter} ${retryAfter === 1 ? 'second' : 'seconds'}.` : 'Try again in a moment.';
    return { kind: 'rate-limit', title: 'Too many photos at once', hint: wait, action: 'Try again' };
  }
  if (code === 'AUTH_REQUIRED' || status === 401) {
    return { kind: 'session', title: 'Your session has ended', hint: 'Sign in again to continue. Your photo is still here.', action: 'Sign in' };
  }
  if (code === 'CONSENT_REQUIRED' || status === 403) {
    return { kind: 'consent', title: '', hint: '', action: '' };
  }
  if (code === 'UNREADABLE_PHOTO' || options.localPreparation || kind === 'unreadable' || isContentGuardrailError(error)) {
    return { kind: 'unreadable', title: PHOTO_REFUSAL_TITLE, hint: PHOTO_REFUSAL_BODY, action: 'Add manually' };
  }
  if (code === 'PROVIDER_QUOTA' || code === 'PROVIDER_UNAVAILABLE' ||
      code === 'PROVIDER_TIMEOUT' || code === 'MALFORMED_RESPONSE' ||
      status === 408 || status === 429 || (status !== undefined && status >= 500) ||
      kind === 'timeout' || kind === 'abort' || kind === 'non_json' || error instanceof SyntaxError) {
    return { kind: 'busy', title: 'The stylist is busy right now', hint: 'Your photo is still here. Try again in a moment.', action: 'Try again' };
  }
  if (kind === 'network' || (error instanceof Error && /network|failed to fetch|offline/i.test(error.message))) {
    return { kind: 'network', title: "Can't reach the stylist", hint: 'Check your connection. Your photo is still here.', action: 'Try again' };
  }
  return {
    kind: 'generic',
    title: "We couldn't analyse this photo",
    hint: 'Try again, or add the details yourself.',
    action: 'Try again',
  };
}
