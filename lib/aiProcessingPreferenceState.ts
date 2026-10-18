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

export type AiProcessingSwitchAction = 'request_consent' | 'save_declined' | 'unchanged';

export function getAiProcessingSwitchAction(
  preference: AiProcessingPreference,
  enabled: boolean,
): AiProcessingSwitchAction {
  if (enabled) return preference === 'allowed' ? 'unchanged' : 'request_consent';
  return preference === 'declined' ? 'unchanged' : 'save_declined';
}

export function isAiProcessingSwitchOn(
  preference: AiProcessingPreference,
  state: { loading: boolean; unavailable: boolean; guest: boolean },
): boolean {
  if (state.loading || state.unavailable || state.guest) return false;
  return preference === 'allowed';
}