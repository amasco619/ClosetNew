import { authenticatedApiRequest } from '@/lib/query-client';
import {
  normalizeAiProcessingPreference,
  type AiProcessingPreference,
} from '@/lib/aiProcessingPreferenceState';

export { normalizeAiProcessingPreference };
export type { AiProcessingPreference };

export async function getAiProcessingPreference(): Promise<AiProcessingPreference> {
  const response = await authenticatedApiRequest('GET', '/api/user/ai-processing');
  const body = await response.json();
  return normalizeAiProcessingPreference(body?.state);
}

export async function setAiProcessingPreference(
  state: Exclude<AiProcessingPreference, 'not_asked'>,
): Promise<AiProcessingPreference> {
  const response = await authenticatedApiRequest('PUT', '/api/user/ai-processing', { state });
  const body = await response.json();
  const savedState = normalizeAiProcessingPreference(body?.state);
  if (savedState !== state) throw new Error('AI processing preference could not be saved.');
  return savedState;
}