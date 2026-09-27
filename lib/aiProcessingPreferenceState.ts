export type AiProcessingPreference = 'not_asked' | 'allowed' | 'declined';

const validPreferences: AiProcessingPreference[] = ['not_asked', 'allowed', 'declined'];

export function normalizeAiProcessingPreference(value: unknown): AiProcessingPreference {
  return validPreferences.includes(value as AiProcessingPreference)
    ? value as AiProcessingPreference
    : 'not_asked';
}