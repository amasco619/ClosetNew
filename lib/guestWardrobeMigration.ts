import type { WardrobeItem } from '../constants/types';

export const GUEST_MIGRATION_KEY = '@amodka_guest_wardrobe_migration';
export type GuestMigrationEntry = {
  ownerId: string;
  migrationId: string;
  item: WardrobeItem;
  storagePath?: string;
  synced: boolean;
  announced: boolean;
};
export type MigrationSnapshot = {
  confirmedIds: string[];
  activeCount: number;
  totalCount: number;
  premium: boolean;
};

export function planGuestMigration(entries: GuestMigrationEntry[], ownerId: string, snapshot: MigrationSnapshot) {
  const owned = entries.filter(entry => entry.ownerId === ownerId && !entry.synced)
    .sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt) || a.migrationId.localeCompare(b.migrationId));
  const confirmed = new Set(snapshot.confirmedIds);
  const remaining = owned.filter(entry => !confirmed.has(entry.migrationId));
  const allowance = Math.max(0, (snapshot.premium ? 2000 : 30) -
    (snapshot.premium ? snapshot.totalCount : snapshot.activeCount));
  return {
    confirmed: owned.filter(entry => confirmed.has(entry.migrationId)),
    transfer: remaining.slice(0, allowance),
    retained: remaining.slice(allowance),
  };
}

export interface GuestMigrationDeps {
  read(): Promise<GuestMigrationEntry[]>;
  write(entries: GuestMigrationEntry[]): Promise<void>;
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
  const mutate = <T,>(change: (entries: GuestMigrationEntry[]) => T) => {
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
    const saved = entries.find(row => row.ownerId === entry.ownerId && row.migrationId === entry.migrationId);
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
    claim: (ownerId: string, items: WardrobeItem[]) => mutate(entries => {
      for (const item of items) {
        // Tombstones remain after sync, so a surviving legacy guest cache can
        // never be claimed by another account or copied a second time.
        if (entries.some(entry => entry.item.id === item.id)) continue;
        const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
        entries.push({
          ownerId, item: { ...item },
          migrationId: uuid.test(item.id) ? item.id : deps.newId(),
          synced: false, announced: false,
        });
      }
    }),
    takeNotice: (ownerId: string) => mutate(entries => {
      const fresh = entries.filter(entry => entry.ownerId === ownerId && entry.synced && !entry.announced);
      fresh.forEach(entry => { entry.announced = true; });
      return fresh.length;
    }),
    removeOwner: (ownerId: string) => mutate(entries => {
      const owned = entries.filter(entry => entry.ownerId === ownerId);
      entries.splice(0, entries.length, ...entries.filter(entry => entry.ownerId !== ownerId));
      return owned.map(entry => entry.item.photoUri);
    }),
    async sync(ownerId: string, isCurrent: () => boolean) {
      if (running.has(ownerId)) return null;
      running.add(ownerId);
      let capacity = false;
      const check = () => { if (!isCurrent()) throw new Error('Guest sync account changed'); };
      try {
        check();
        const entries = (await list()).filter(entry => entry.ownerId === ownerId && !entry.synced);
        if (!entries.length) return { pending: 0, capacity: false };
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
          } catch {
            check(); // One bad/missing file must not discard the rest of the batch.
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
      const pending = (await list()).filter(entry => entry.ownerId === ownerId && !entry.synced).length;
      return { pending, capacity };
    },
  };
}
