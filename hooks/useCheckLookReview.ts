import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { CheckLookResult } from '../lib/checkLook';
import type { CheckLookRequest } from '../lib/checkLookGuard';
import {
  requestCheckLook, checkLookErrorMessage, trackJudgeForeground, type CheckLookDisplayResult,
} from '../lib/checkLookClient';

export function useCheckLookReview(options: {
  premium: boolean;
  ownerId: string | null;
  localCheck(request: CheckLookRequest): Promise<CheckLookResult>;
}) {
  const [result, setResult] = useState<CheckLookDisplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const identity = useRef(options.ownerId);
  identity.current = options.ownerId;
  useEffect(() => { trackJudgeForeground(AppState); }, []);
  const cancel = useCallback(() => {
    ++generation.current; busy.current = false;
    setChecking(false); setResult(null); setError(null);
  }, []);
  useEffect(() => () => { ++generation.current; busy.current = false; }, []);
  const run = async (request: CheckLookRequest, forceLocal = false) => {
    if (busy.current) return;
    busy.current = true;
    const id = ++generation.current;
    const owner = options.ownerId;
    const current = () => id === generation.current && owner === identity.current;
    setChecking(true); setResult(null); setError(null);
    try {
      const next = await requestCheckLook(request, {
        premium: options.premium, forceLocal,
        localCheck: async () => {
          if (!current()) throw new Error('Stale request');
          return options.localCheck(request);
        },
      });
      if (current()) setResult(next);
    } catch (failure) {
      if (current()) setError(checkLookErrorMessage(failure, options.premium));
    } finally {
      if (id === generation.current) { busy.current = false; setChecking(false); }
    }
  };
  return { result, error, checking, run, clear: cancel, cancel };
}
