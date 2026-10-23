import type { WardrobeItem } from '../constants/types';
import { isGuestMigrationEntry, type GuestMigrationRecord } from './guestWardrobeMigration';

export type PendingGuestWardrobeItem = {
  item: WardrobeItem;
  migrationId: string;
  uploadError?: string;
};

export function selectPendingGuestWardrobeItems(
  records: GuestMigrationRecord[],
  ownerId: string | null,
  persistedItemIds: ReadonlySet<string>,
): PendingGuestWardrobeItem[] {
  if (!ownerId) return [];
  const seen = new Set(persistedItemIds);
  const pending: PendingGuestWardrobeItem[] = [];
  for (const record of records) {
    if (!isGuestMigrationEntry(record) || record.ownerId !== ownerId || record.synced ||
      seen.has(record.migrationId) || seen.has(record.item.id)) continue;
    seen.add(record.migrationId);
    seen.add(record.item.id);
     pending.push({
       item: record.item, migrationId: record.migrationId,
       ...(record.uploadError ? { uploadError: record.uploadError } : {}),
     });
  }
  return pending;
}

export function wardrobeHeaderCopy(total: number, guest: boolean, premium: boolean): string {
  const count = `${total} total item${total === 1 ? '' : 's'}`;
  if (premium) return count;
  return `${count} · ${guest ? 8 : 30} included`;
}
