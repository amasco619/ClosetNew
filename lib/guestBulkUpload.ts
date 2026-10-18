export type InitialBulkCardStatus = 'manual' | 'pending';

export function getInitialBulkCardStatus(isGuest: boolean): InitialBulkCardStatus {
  return isGuest ? 'manual' : 'pending';
}

export function limitGuestBulkSelection(
  selectedCount: number,
  savedCount: number,
  itemCap: number,
): { acceptedCount: number; omittedCount: number } {
  const selected = Math.max(0, Math.floor(selectedCount));
  const saved = Math.max(0, Math.floor(savedCount));
  const cap = Math.max(0, Math.floor(itemCap));
  const acceptedCount = Math.min(selected, Math.max(0, cap - saved));
  return { acceptedCount, omittedCount: selected - acceptedCount };
}

export async function runBulkAiProcessing<T>(
  guestSelection: boolean,
  preference: string,
  process: () => Promise<T>,
): Promise<T | undefined> {
  if (guestSelection || preference !== 'allowed') return undefined;
  return process();
}
