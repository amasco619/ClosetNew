export interface CheckLookAllowanceStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface CheckLookAllowance {
  allowed: boolean;
  remaining: number;
}

const STORAGE_PREFIX = '@amodka_check_look_free_v1';
const locks = new Map<string, Promise<void>>();

function allowanceKey(now: number): string {
  const date = new Date(now);
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return `${STORAGE_PREFIX}:${day}`;
}

async function storedCount(store: CheckLookAllowanceStore, key: string): Promise<number> {
  const raw = await store.getItem(key);
  const count = Number(raw);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

export async function readCheckLookAllowance(
  store: CheckLookAllowanceStore,
  limit: number,
  now = Date.now(),
): Promise<number> {
  const key = allowanceKey(now);
  return Math.max(0, limit - await storedCount(store, key));
}

export async function consumeCheckLookAllowance(
  store: CheckLookAllowanceStore,
  limit: number,
  now = Date.now(),
): Promise<CheckLookAllowance> {
  const key = allowanceKey(now);
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  locks.set(key, current);
  await previous;
  try {
    const used = await storedCount(store, key);
    const remaining = Math.max(0, limit - used);
    if (remaining === 0) return { allowed: false, remaining: 0 };
    await store.setItem(key, String(used + 1));
    return { allowed: true, remaining: remaining - 1 };
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}
