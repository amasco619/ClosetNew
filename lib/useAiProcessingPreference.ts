import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  aiPreferenceErrorMessage, getAiProcessingPreference, setAiProcessingPreference,
  getAiProcessingSwitchAction, type AiProcessingPreference,
} from './aiProcessingPreference';

/** Profile's account-scoped, authoritative preference state; never processes photos. */
export function useAiProcessingPreference(isGuest: boolean, accountId: string | null) {
  const [preference, setPreference] = useState<AiProcessingPreference>('not_asked');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [owner, setOwner] = useState(accountId);
  const generation = useRef(0);
  const busy = useRef(false);
  const identity = useRef(accountId);
  identity.current = accountId;

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const current = () => generation.current === request && identity.current === accountId;
    busy.current = false;
    setSaving(false);
    setOwner(accountId);
    setError(null);
    setLoading(!isGuest);
    setUnavailable(false);
    setShowConsent(false);
    setPreference('not_asked');
    if (isGuest) return;
    try {
      const saved = await getAiProcessingPreference();
      if (current()) setPreference(saved);
    } catch (failure) {
      if (current()) {
        setUnavailable(true);
        setError(aiPreferenceErrorMessage(failure));
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, [accountId, isGuest]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { generation.current++; busy.current = false; };
  }, [refresh]));

  const save = async (choice: 'allowed' | 'declined') => {
    if (busy.current || isGuest || loading || owner !== accountId || (unavailable && !showConsent)) return;
    busy.current = true;
    const request = ++generation.current;
    const current = () => generation.current === request && identity.current === accountId;
    setSaving(true);
    setError(null);
    try {
      const saved = await setAiProcessingPreference(choice);
      if (current()) {
        setPreference(saved);
        setUnavailable(false);
        setShowConsent(false);
      }
    } catch (failure) {
      if (!current()) return;
      setError(aiPreferenceErrorMessage(failure, true));
      // A lost response may follow a committed write. Reconcile, never guess.
      try {
        const saved = await getAiProcessingPreference();
        if (current()) { setPreference(saved); setUnavailable(false); }
      } catch {
        if (current()) setUnavailable(true);
      }
    } finally {
      if (current()) { busy.current = false; setSaving(false); }
    }
  };

  return {
    preference: owner === accountId ? preference : 'not_asked',
    loading: loading || owner !== accountId,
    saving: owner === accountId && saving,
    error: owner === accountId ? error : null,
    unavailable: owner === accountId && unavailable,
    showConsent: owner === accountId && showConsent,
    refresh,
    toggle: (enabled: boolean) => {
      if (busy.current || isGuest || loading || unavailable || owner !== accountId) return;
      setError(null);
      const action = getAiProcessingSwitchAction(preference, enabled);
      if (action === 'request_consent') setShowConsent(true);
      if (action === 'save_declined') void save('declined');
    },
    allow: () => { void save('allowed'); },
    // Not now is never blocked by an in-flight save, and never writes a choice.
    dismiss: () => {
      setShowConsent(false);
      if (busy.current) return;
      // A stale focus refresh must not surface its offline error after Not now.
      ++generation.current;
      setLoading(false);
      setUnavailable(false);
      setError(null);
    },
  };
}
