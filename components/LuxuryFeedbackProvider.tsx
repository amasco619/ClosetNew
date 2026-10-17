import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LuxuryDialog, { type LuxuryDialogRequest } from '@/components/LuxuryDialog';
import LuxuryToast, { type LuxuryToastRequest } from '@/components/LuxuryToast';
import { useApp } from '@/contexts/AppContext';
import { DialogContext, ToastContext } from '@/contexts/LuxuryFeedbackContext';
import type { ConfirmOptions, NotifyOptions } from '@/contexts/LuxuryFeedbackContext';
import { createAlertAdapter, type AlertAdapter } from '@/lib/alertDialogAdapter';

interface QueuedDialog extends Omit<LuxuryDialogRequest, 'id'> {
  id: number;
  resolve: (index: number) => void;
}

interface QueuedToast extends LuxuryToastRequest {
  ownerKey: string | null;
  durationMs: number;
}

export { useDialog, useToast } from '@/contexts/LuxuryFeedbackContext';

export function LuxuryFeedbackProvider({ children }: { children: ReactNode }) {
  const { authenticatedUserId, profile } = useApp();
  const insets = useSafeAreaInsets();
  const ownerKey = authenticatedUserId ?? (profile.isGuest ? 'guest' : null);
  const ownerKeyRef = useRef(ownerKey);

  const [reduceMotion, setReduceMotion] = useState(false);
  const [activeDialog, setActiveDialog] = useState<QueuedDialog | null>(null);
  const dialogRef = useRef<QueuedDialog | null>(null);
  const dialogQueue = useRef<QueuedDialog[]>([]);
  const dialogSequence = useRef(0);

  const [activeToast, setActiveToast] = useState<QueuedToast | null>(null);
  const toastRef = useRef<QueuedToast | null>(null);
  const toastQueue = useRef<QueuedToast[]>([]);
  const toastSequence = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoing, setUndoing] = useState(false);
  const undoingRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  const enqueueDialog = useCallback((request: Omit<LuxuryDialogRequest, 'id'>) => (
    new Promise<number>(resolve => {
      const next: QueuedDialog = { ...request, id: ++dialogSequence.current, resolve };
      if (dialogRef.current) dialogQueue.current.push(next);
      else {
        dialogRef.current = next;
        setActiveDialog(next);
      }
    })
  ), []);

  const finishDialog = useCallback((index: number) => {
    const current = dialogRef.current;
    if (!current) return;
    dialogRef.current = null;
    setActiveDialog(null);
    current.resolve(index);
    setTimeout(() => {
      if (dialogRef.current || dialogQueue.current.length === 0) return;
      const next = dialogQueue.current.shift()!;
      dialogRef.current = next;
      setActiveDialog(next);
    }, 0);
  }, []);

  const confirm = useCallback(async (options: ConfirmOptions) => {
    const index = await enqueueDialog({
      kind: 'confirm',
      title: options.title,
      message: options.message,
      icon: options.icon,
      outsideCancels: options.tone !== 'destructive',
      buttons: [
        { label: options.confirmLabel, tone: options.tone === 'destructive' ? 'destructive' : 'primary' },
        { label: options.cancelLabel, tone: 'quiet' },
      ],
    });
    return index === 0;
  }, [enqueueDialog]);

  const notify = useCallback((options: NotifyOptions) => {
    void enqueueDialog({
      kind: 'notify',
      title: options.title,
      message: options.message,
      icon: options.icon,
      outsideCancels: true,
      buttons: [{ label: options.buttonLabel ?? 'Done', tone: 'primary' }],
    });
  }, [enqueueDialog]);

  const alert = useCallback<AlertAdapter>((...args) => {
    createAlertAdapter(enqueueDialog)(...args);
  }, [enqueueDialog]);

  const dismissToast = useCallback((id: number) => {
    if (toastRef.current?.id !== id) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    toastRef.current = null;
    setActiveToast(null);
    undoingRef.current = false;
    setUndoing(false);
    setTimeout(() => {
      if (toastRef.current || toastQueue.current.length === 0) return;
      const next = toastQueue.current.shift()!;
      if (next.ownerKey === ownerKeyRef.current) {
        toastRef.current = next;
        setActiveToast(next);
      }
    }, 0);
  }, []);

  const showToast = useCallback((toast: Omit<LuxuryToastRequest, 'id'>) => {
    const next: QueuedToast = {
      ...toast,
      id: ++toastSequence.current,
      ownerKey: ownerKeyRef.current,
      durationMs: toast.actionLabel ? 5000 : 2800,
    };
    if (toastRef.current) toastQueue.current.push(next);
    else {
      toastRef.current = next;
      setActiveToast(next);
    }
  }, []);

  const actOnToast = useCallback(async () => {
    const current = toastRef.current;
    if (!current?.onAction || undoingRef.current) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    undoingRef.current = true;
    setUndoing(true);
    let succeeded = false;
    try {
      succeeded = (await current.onAction()) !== false;
    } catch {
      succeeded = false;
    }
    if (!succeeded && ownerKeyRef.current === current.ownerKey) {
      showToast({ message: 'Undo could not be confirmed. Check your wardrobe before trying again.' });
    }
    dismissToast(current.id);
  }, [dismissToast, showToast]);

  useEffect(() => {
    if (!activeToast) return;
    toastTimer.current = setTimeout(() => dismissToast(activeToast.id), activeToast.durationMs);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = null;
    };
  }, [activeToast, dismissToast]);

  useEffect(() => {
    ownerKeyRef.current = ownerKey;
    if (toastRef.current && toastRef.current.ownerKey !== ownerKey) {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = null;
      toastRef.current = null;
      toastQueue.current = [];
      undoingRef.current = false;
      setActiveToast(null);
      setUndoing(false);
    }
    toastQueue.current = toastQueue.current.filter(item => item.ownerKey === ownerKey);
  }, [ownerKey]);

  const dialogApi = useMemo(() => ({ confirm, notify, alert }), [confirm, notify, alert]);
  const toastApi = useMemo(() => ({ show: showToast }), [showToast]);
  const toastBottom = Math.max(insets.bottom + 16, Platform.OS === 'web' ? 100 : 96);

  return (
    <DialogContext.Provider value={dialogApi}>
      <ToastContext.Provider value={toastApi}>
        <View style={{ flex: 1 }}>
          {children}
          <LuxuryToast
            toast={activeToast?.ownerKey === ownerKey ? activeToast : null}
            bottom={toastBottom}
            reduceMotion={reduceMotion}
            busy={undoing}
            onAction={() => { void actOnToast(); }}
          />
        </View>
        <LuxuryDialog request={activeDialog} reduceMotion={reduceMotion} onResolve={finishDialog} />
      </ToastContext.Provider>
    </DialogContext.Provider>
  );
}
