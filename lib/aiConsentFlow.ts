export type AiConsentContext = 'upload' | 'profile';
export type AiConsentAction = 'decline' | 'not_now' | 'backdrop' | 'back' | 'swipe';

export function getAiConsentDisposition(
  context: AiConsentContext,
  action: AiConsentAction,
): 'persist_declined' | 'dismiss' {
  return context === 'upload' && action === 'decline'
    ? 'persist_declined'
    : 'dismiss';
}
