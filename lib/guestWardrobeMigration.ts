import type { WardrobeItem } from '../constants/types';
import { isPermanentStorageUploadError, storageUploadFailureMessage } from './storageUploadBounds';

export const GUEST_MIGRATION_KEY = '@amodka_guest_wardrobe_migration';
export type GuestMigrationEntry = {
  ownerId: string;
  migrationId: string;
  item: WardrobeItem;
  storagePath?: string;
  synced: boolean;
  announced: boolean;
  sourceReclaimed?: boolean;
  uploadError?: string;
};
export type GuestDataDisposition = 'absorb' | 'discard';
export type GuestMigrationDecision = {
  ownerId: string;
  migrationId: '__guest-data-decision__';
  disposition: GuestDataDisposition;
  synced: true;
  announced: true;
};
export type GuestMigrationRecord = GuestMigrationEntry | GuestMigrationDecision;

export function isGuestMigrationDecision(record: GuestMigrationRecord): record is GuestMigrationDecision {
  return 'disposition' in record;
}

export function isGuestMigrationEntry(record: GuestMigrationRecord): record is GuestMigrationEntry {
  return 'item' in record && !!record.item;
}
export type MigrationSnapshot = {
  confirmedIds: string[];
  activeCount: number;
  totalCount: number;
  premium: boolean;
};

export function getReclaimableGuestPhotoSources(
  entries: GuestMigrationRecord[],
  ownerId: string,
): GuestMigrationEntry[] {
  return entries.filter((entry): entry is GuestMigrationEntry =>
    isGuestMigrationEntry(entry) && entry.ownerId === ownerId && entry.synced && !entry.sourceReclaimed,
  );
}

export function planGuestMigration(entries: GuestMigrationEntry[], ownerId: string, snapshot: MigrationSnapshot) {
  const owned = entries.filter(entry => entry.ownerId === ownerId && !entry.synced)
    .sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt) || a.migrationId.localeCompare(b.migrationId));
  const confirmed = new Set(snapshot.confirmedIds);
  const remaining = owned.filter(entry => !confirmed.has(entry.migrationId));
  const eligible = remaining.filter(entry => !entry.uploadError);
  const allowance = Math.max(0, (snapshot.premium ? 2000 : 30) -
    (snapshot.premium ? snapshot.totalCount : snapshot.activeCount));
  return {
    confirmed: owned.filter(entry => confirmed.has(entry.migrationId)),
    transfer: eligible.slice(0, allowance),
    retained: eligible.slice(allowance),
  };
}

export interface GuestMigrationDeps {
  read(): Promise<GuestMigrationRecord[]>;
  write(entries: GuestMigrationRecord[]): Promise<void>;
  newId(): string;
  snapshot(ownerId: string, entries: GuestMigrationEntry[]): Promise<MigrationSnapshot>;
  upload(ownerId: string, entry: GuestMigrationEntry): Promise<string>;
  insert(ownerId: string, entries: GuestMigrationEntry[]): Promise<string[]>;
  confirmed(entry: GuestMigrationEntry): Promise<void>;
}

/** A durable owner claim is recorded before auth hydration replaces guest state.
 * Network work is never performed inside the short local journal write lock. */
export function createGuestWardrobeMigration(deps: GuestMigrationDeps) {
  let writes: Promise<unknown> = Promise.resolve();
  const running = new Set<string>();
  const mutate = <T,>(change: (entries: GuestMigrationRecord[]) => T) => {
    const next = writes.catch(() => undefined).then(async () => {
      const entries = await deps.read();
      const result = change(entries);
      await deps.write(entries);
      return result;
    });
    writes = next;
    return next;
  };
  const list = async () => { await writes.catch(() => undefined); return deps.read(); };
  const update = (entry: GuestMigrationEntry, patch: Partial<GuestMigrationEntry>) => mutate(entries => {
    const saved = entries.find((row): row is GuestMigrationEntry =>
      isGuestMigrationEntry(row) && row.ownerId === entry.ownerId && row.migrationId === entry.migrationId,
    );
    if (!saved) throw new Error('Guest migration claim is missing');
    Object.assign(saved, patch);
  });
  const bounded = async <T,>(request: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([request, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Guest sync timed out')), 20_000);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  };
  return {
    list,
    getDecision: async (ownerId: string) => {
      const entry = (await list()).find((row): row is GuestMigrationDecision =>
        isGuestMigrationDecision(row) && row.ownerId === ownerId,
      );
      return entry?.disposition ?? null;
    },
    decide: (ownerId: string, disposition: GuestDataDisposition) => mutate(entries => {
      const existing = entries.find((row): row is GuestMigrationDecision =>
        isGuestMigrationDecision(row) && row.ownerId === ownerId,
      );
      if (existing) return existing.disposition;
      entries.push({
        ownerId, migrationId: '__guest-data-decision__', disposition, synced: true, announced: true,
      });
      return disposition;
    }),
    completeDecision: (ownerId: string) => mutate(entries => {
      if (entries.some((row): row is GuestMigrationEntry =>
        isGuestMigrationEntry(row) && row.ownerId === ownerId && !row.synced,
      )) return false;
      const index = entries.findIndex((row): row is GuestMigrationDecision =>
        isGuestMigrationDecision(row) && row.ownerId === ownerId,
      );
      if (index < 0) return false;
      entries.splice(index, 1);
      return true;
    }),
    claim: (ownerId: string, items: WardrobeItem[]) => mutate(entries => {
      const decision = entries.find((row): row is GuestMigrationDecision =>
        isGuestMigrationDecision(row) && row.ownerId === ownerId,
      );
      if (decision?.disposition !== 'absorb') return;
      for (const item of items) {
        // Tombstones remain after sync, so a surviving legacy guest cache can
        // never be claimed by another account or copied a second time.
        if (entries.some((entry): entry is GuestMigrationEntry =>
          isGuestMigrationEntry(entry) && entry.item.id === item.id,
        )) continue;
        const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
        entries.push({
          ownerId, item: { ...item },
          migrationId: uuid.test(item.id) ? item.id : deps.newId(),
          synced: false, announced: false,
        });
      }
    }),
    takeNotice: (ownerId: string) => mutate(entries => {
      const fresh = entries.filter((entry): entry is GuestMigrationEntry =>
        isGuestMigrationEntry(entry) && entry.ownerId === ownerId && entry.synced && !entry.announced,
      );
      fresh.forEach(entry => { entry.announced = true; });
      return fresh.length;
    }),
    removeOwner: (ownerId: string) => mutate(entries => {
      const owned = entries.filter((entry): entry is GuestMigrationEntry =>
        isGuestMigrationEntry(entry) && entry.ownerId === ownerId,
      );
      entries.splice(0, entries.length, ...entries.filter(entry => entry.ownerId !== ownerId));
      return owned.map(entry => entry.item.photoUri);
    }),
    discardOwner: (ownerId: string) => mutate(entries => {
      const owned = entries.filter((entry): entry is GuestMigrationEntry =>
        isGuestMigrationEntry(entry) && entry.ownerId === ownerId,
      );
      entries.splice(0, entries.length, ...entries.filter(entry =>
        entry.ownerId !== ownerId || isGuestMigrationDecision(entry),
      ));
      return owned.map(entry => entry.item.photoUri);
    }),
    markSourceReclaimed: (ownerId: string, migrationId: string) => mutate(entries => {
      const entry = entries.find((row): row is GuestMigrationEntry =>
        isGuestMigrationEntry(row) && row.ownerId === ownerId && row.migrationId === migrationId,
      );
      if (entry?.synced) entry.sourceReclaimed = true;
    }),
    async sync(ownerId: string, isCurrent: () => boolean) {
      if (running.has(ownerId)) return null;
      running.add(ownerId);
      let capacity = false;
      const check = () => { if (!isCurrent()) throw new Error('Guest sync account changed'); };
      try {
        check();
        const records = await list();
        const decision = records.find((row): row is GuestMigrationDecision =>
          isGuestMigrationDecision(row) && row.ownerId === ownerId,
        )?.disposition;
        const entries = records.filter((entry): entry is GuestMigrationEntry =>
          isGuestMigrationEntry(entry) && entry.ownerId === ownerId && !entry.synced,
        );
        if (decision !== 'absorb') return {
          pending: entries.length, capacity: false, failed: entries.filter(entry => entry.uploadError).length,
        };
        if (!entries.length) return { pending: 0, capacity: false, failed: 0 };
        const snapshot = await bounded(deps.snapshot(ownerId, entries));
        check();
        const plan = planGuestMigration(entries, ownerId, snapshot);
        capacity = plan.retained.length > 0;
        for (const entry of plan.confirmed) {
          check();
          await update(entry, { synced: true });
          await deps.confirmed(entry);
        }
        const prepared: GuestMigrationEntry[] = [];
        for (const entry of plan.transfer) {
          check();
          try {
            const storagePath = entry.storagePath ?? await bounded(deps.upload(ownerId, entry));
            check();
            await update(entry, { storagePath });
            prepared.push({ ...entry, storagePath });
          } catch (error) {
            check(); // One bad/missing file must not discard the rest of the batch.
            if (isPermanentStorageUploadError(error)) {
              await update(entry, { uploadError: storageUploadFailureMessage(error) });
            }
          }
        }
        if (prepared.length) {
          check();
          const ids = await bounded(deps.insert(ownerId, prepared));
          check();
          if (ids.length !== prepared.length || prepared.some(entry => !ids.includes(entry.migrationId))) {
            throw new Error('Guest sync insert was not confirmed');
          }
          for (const entry of prepared) {
            check();
            await update(entry, { synced: true });
            await deps.confirmed(entry);
          }
        }
      } catch {
        // Never delete uploads on an ambiguous response: the RPC may have
        // committed. The next attempt queries owned IDs before inserting again.
      } finally { running.delete(ownerId); }
       const finalEntries = (await list()).filter((entry): entry is GuestMigrationEntry =>
         isGuestMigrationEntry(entry) && entry.ownerId === ownerId && !entry.synced,
       );
       return {
         pending: finalEntries.length, capacity,
         failed: finalEntries.filter(entry => entry.uploadError).length,
       };
    },
     clearPermanentFailures: (ownerId: string) => mutate(entries => {
       for (const entry of entries) {
         if (isGuestMigrationEntry(entry) && entry.ownerId === ownerId) delete entry.uploadError;
       }
     }),
  };
}
