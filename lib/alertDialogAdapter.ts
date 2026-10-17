import type { AlertButton, AlertOptions } from 'react-native';
import type { LuxuryDialogButton, LuxuryDialogRequest } from '@/components/LuxuryDialog';

export type AlertAdapter = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
) => void;

export function createAlertAdapter(
  enqueueDialog: (request: Omit<LuxuryDialogRequest, 'id'>) => Promise<number>,
): AlertAdapter {
  return (title, message, buttons = [], options) => {
    const normalized = buttons.length > 0 ? buttons : [{ text: 'Done' }];
    const actions: LuxuryDialogButton[] = normalized.map(button => ({
      label: button.text ?? 'Continue',
      tone: button.style === 'cancel' ? 'quiet' : button.style === 'destructive' ? 'destructive' : 'primary',
      onPress: button.onPress,
    }));
    void enqueueDialog({
      kind: 'alert',
      title: title || 'Amodka',
      message,
      outsideCancels: options?.cancelable !== false && actions.every(button => button.tone !== 'destructive'),
      buttons: actions,
    }).then(index => {
      const callback = normalized[index]?.onPress;
      try {
        callback?.();
      } finally {
        options?.onDismiss?.();
      }
    });
  };
}
