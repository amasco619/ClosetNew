export type AiProcessingPreference = 'not_asked' | 'allowed' | 'declined';

const validPreferences: AiProcessingPreference[] = ['not_asked', 'allowed', 'declined'];

export function isAiProcessingPreference(value: unknown): value is AiProcessingPreference {
  return validPreferences.includes(value as AiProcessingPreference);
}

export function requireAiProcessingPreference(value: unknown): AiProcessingPreference {
  if (!isAiProcessingPreference(value)) {
    throw new Error('AI processing preference response was invalid.');
  }
  return value;
}

export function normalizeAiProcessingPreference(value: unknown): AiProcessingPreference {
  return isAiProcessingPreference(value) ? value : 'not_asked';
}

export function isAiProcessingSwitchOn(
  preference: AiProcessingPreference,
  state: { loading: boolean; unavailable: boolean; guest: boolean },
): boolean {
  if (state.loading || state.unavailable || state.guest) return false;
  return preference === 'allowed';
}