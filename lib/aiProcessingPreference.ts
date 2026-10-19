import { authenticatedApiRequest, ApiRequestError } from '@/lib/query-client';
import { UPLOAD_DIAGNOSTICS_ENABLED } from '@/lib/uploadErrors';
import {
  isAiProcessingPreference,
  isAiProcessingSwitchOn,
  normalizeAiProcessingPreference,
  requireAiProcessingPreference,
  getAiProcessingSwitchAction,
  type AiProcessingPreference,
} from '@/lib/aiProcessingPreferenceState';

export {
  getAiProcessingSwitchAction,
  isAiProcessingPreference,
  isAiProcessingSwitchOn,
  normalizeAiProcessingPreference,
  requireAiProcessingPreference,
};
export type { AiProcessingPreference };

export const AI_PREFERENCE_TIMEOUT_MS = 10_000;

async function preferenceRequest(method: 'GET' | 'PUT', state?: 'allowed' | 'declined') {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status = 0;
  try {
    // Include session acquisition AND response-body parsing in the deadline.
    const saved = await Promise.race([
      (async () => {
        const response = await authenticatedApiRequest(method, '/api/user/ai-processing', state ? { state } : undefined);
        status = response.status;
        const body = await response.json();
        return requireAiProcessingPreference(body?.state);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ApiRequestError('Request timed out.', 'timeout')), AI_PREFERENCE_TIMEOUT_MS);
      }),
    ]);
    if (UPLOAD_DIAGNOSTICS_ENABLED) console.log('[ai-preference]', { status, code: 'ok' });
    return saved;
  } catch (error) {
    if (UPLOAD_DIAGNOSTICS_ENABLED) {
      console.log('[ai-preference]', {
        status: error instanceof ApiRequestError ? error.status ?? status : status,
        code: error instanceof ApiRequestError
          ? error.status === 429 ? 'ai_preference_rate_limit'
            : error.status === 503 ? 'ai_processing_preference_unavailable' : error.kind
          : 'invalid_response',
      });
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function aiPreferenceErrorMessage(error: unknown, saving = false): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) return 'Too many changes. Please try again in a moment.';
    if (error.kind === 'timeout' || error.kind === 'network' || error.kind === 'abort') {
      return 'We couldn’t reach the server. Please try again.';
    }
  }
  return saving ? 'Your preference could not be saved. Please try again.' : 'Your preference could not be loaded. Please try again.';
}

export async function getAiProcessingPreference(): Promise<AiProcessingPreference> {
  return preferenceRequest('GET');
}

export async function setAiProcessingPreference(
  state: Exclude<AiProcessingPreference, 'not_asked'>,
): Promise<AiProcessingPreference> {
  await preferenceRequest('PUT', state);
  // A successful write acknowledgement is not proof of the current saved state.
  const savedState = await getAiProcessingPreference();
  if (savedState !== state) throw new Error('AI processing preference could not be saved.');
  return savedState;
}