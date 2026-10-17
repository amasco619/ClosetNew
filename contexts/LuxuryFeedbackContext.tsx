import React, { createContext, useContext } from 'react';
import type { DialogTone } from '@/components/LuxuryDialog';
import type { LuxuryToastRequest } from '@/components/LuxuryToast';
import type { AlertAdapter } from '@/lib/alertDialogAdapter';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: DialogTone;
  icon?: string;
}

export interface NotifyOptions {
  title: string;
  message: string;
  buttonLabel?: string;
  icon?: string;
}

export interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (options: NotifyOptions) => void;
  alert: AlertAdapter;
}

export interface ToastApi {
  show: (toast: Omit<LuxuryToastRequest, 'id'>) => void;
}

export const DialogContext = createContext<DialogApi | null>(null);
export const ToastContext = createContext<ToastApi | null>(null);

export function useDialog(): DialogApi {
  const value = useContext(DialogContext);
  if (!value) throw new Error('useDialog must be used within LuxuryFeedbackProvider');
  return value;
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within LuxuryFeedbackProvider');
  return value;
}
