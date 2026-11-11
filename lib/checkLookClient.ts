import { z } from 'zod';
import { ApiRequestError, authenticatedApiRequest } from './query-client';
import type { CheckLookResult } from './checkLook';
import type { CheckLookRequest } from './checkLookGuard';

export const CHECK_LOOK_BUDGET_MS = 6_000;
export const JUDGE_DISABLED_FOREGROUND_MS = 15 * 60_000;
export const JUDGE_MISSING_FACTS = [
  'denomination', 'assigned_set', 'announced_colours', 'hem_position', 'sleeve_lining', 'sleeve_length',
] as const;
export type JudgeMissingFact = typeof JUDGE_MISSING_FACTS[number];
export type CheckLookDisplayResult = CheckLookResult | {
  source: 'judge'; tier: 'premium'; verdict: 'Works' | 'Almost' | 'Rethink';
  reason: string; swapSuggestion: { replacesId: string; replacementId: string } | null;
} | {
  source: 'judge'; tier: 'premium'; verdict: 'Ask';
  question: string; missingFact: JudgeMissingFact;
};

const responseSchema = z.union([
  z.object({ useLocalCheck: z.literal(true), reason: z.enum(['disabled', 'unavailable']) }),
  z.object({
    verdict: z.enum(['Works', 'Almost', 'Rethink', 'Ask']),
    reason: z.string().max(1000).optional(),
    swapSuggestion: z.object({ replacesId: z.string().uuid(), replacementId: z.string().uuid() }).nullable().optional(),
    question: z.string().min(1).max(300).optional(),
    missing_fact: z.enum(JUDGE_MISSING_FACTS).optional(),
  }),
]);

// Capability only; no account data or result is retained across checks.
let foregroundMs = 0;
let lastTick = Date.now();
let active = true;
let disabledUntil = 0;
let tracking = false;
function tick(now = Date.now()) {
  if (active) foregroundMs += Math.max(0, now - lastTick);
  lastTick = now;
  return foregroundMs;
}
export function recordJudgeActivity(isActive: boolean, now = Date.now()) {
  tick(now);
  active = isActive;
}
export function trackJudgeForeground(source: {
  currentState: string | null;
  addEventListener(event: 'change', callback: (state: string) => void): unknown;
}) {
  if (tracking) return;
  tracking = true;
  recordJudgeActivity(source.currentState === 'active');
  // One listener for the app-session capability cache, not per sheet or account.
  source.addEventListener('change', state => recordJudgeActivity(state === 'active'));
}
export function judgeDisabledForSession(now = Date.now()) {
  return tick(now) < disabledUntil;
}
export const _testOverrides: {
  post?: typeof authenticatedApiRequest;
  budgetMs?: number;
} = {};
export function resetJudgeClientForTests(now = Date.now()) {
  foregroundMs = 0; lastTick = now; active = true; disabledUntil = 0; tracking = false;
}

export class CheckLookClientError extends Error {}
export function checkLookErrorMessage(error: unknown, premium: boolean): string {
  if (error instanceof CheckLookClientError) return error.message;
  if (error instanceof ApiRequestError) {
    if (error.status === 429) return `Your ${premium ? 'Premium' : 'Free'} plan includes ${premium ? 30 : 5} look checks a day. Please try again tomorrow.`;
    if (error.kind === 'network') return 'You appear to be offline. Reconnect, then try again.';
    if (error.status === 403) return 'This look could not be checked just now. Please try again.';
  }
  return 'Your look could not be checked just now. Please try again.';
}

export async function requestCheckLook(
  request: CheckLookRequest,
  options: { premium: boolean; forceLocal?: boolean; localCheck(): Promise<CheckLookResult> },
): Promise<CheckLookDisplayResult> {
  if (options.forceLocal || judgeDisabledForSession()) return options.localCheck();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      (async () => {
        // Rebuild the envelope: never forward tier, profile, images or other caller data.
        const res = await (_testOverrides.post ?? authenticatedApiRequest)('POST', '/api/check-my-look', {
          selection: request.selection, brief: request.brief,
          ...(request.garmentFacts ? { garmentFacts: request.garmentFacts } : {}),
        }, { timeoutMs: CHECK_LOOK_BUDGET_MS });
        return responseSchema.parse(await res.json());
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ApiRequestError('Deadline', 'timeout')),
          _testOverrides.budgetMs ?? CHECK_LOOK_BUDGET_MS);
      }),
    ]);
    if ('useLocalCheck' in response) {
      if (response.reason === 'disabled') disabledUntil = tick() + JUDGE_DISABLED_FOREGROUND_MS;
      return options.localCheck();
    }
    // Defence in depth: free UI objects never contain a reason, question or swap.
    if (!options.premium || response.reason === undefined) {
      if (response.verdict === 'Ask') throw new Error('Invalid free verdict');
      return { tier: 'free', verdict: response.verdict };
    }
    if (response.verdict === 'Ask') {
      if (!response.question || !response.missing_fact) throw new Error('Incomplete question');
      return { source: 'judge', tier: 'premium', verdict: 'Ask',
        question: response.question, missingFact: response.missing_fact };
    }
    return { source: 'judge', tier: 'premium', verdict: response.verdict,
      reason: response.reason, swapSuggestion: response.swapSuggestion ?? null };
  } catch (error) {
    if (error instanceof ApiRequestError &&
        (error.status === 401 || (error.status === 403 && error.code === 'ai_processing_consent_required'))) {
      return options.localCheck();
    }
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}
