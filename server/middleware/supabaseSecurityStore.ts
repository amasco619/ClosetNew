import type { SupabaseClient } from "@supabase/supabase-js";
import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";

const STORE_TIMEOUT_MS = 1_500;
const RATE_LIMIT_TABLE = "ratelimit_store";
const LOCKOUT_TABLE = "lockout_store";

type StoreClient = Pick<SupabaseClient, "from" | "rpc">;

export interface LockoutRecord {
  attempts: number;
  windowStart: number;
  lockedUntil: number | null;
}

export interface LockoutPersistenceLayer {
  set(key: string, record: LockoutRecord, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  loadAll(): Promise<Array<{ key: string; record: LockoutRecord; expiresAt: number }>>;
}

export const _testOverrides: { client?: StoreClient } = {};

async function getStoreClient(): Promise<StoreClient> {
  if (process.env.NODE_ENV === "test" && _testOverrides.client) {
    return _testOverrides.client;
  }
  return (await import("../supabase")).supabaseAdmin;
}

function withTimeout<T>(operation: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const controller = new AbortController();
  const abortable = typeof (operation as any)?.abortSignal === "function"
    ? (operation as any).abortSignal(controller.signal) as PromiseLike<T>
    : operation;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(
      () => {
        controller.abort();
        reject(new Error(`${label} timed out after ${STORE_TIMEOUT_MS} ms`));
      },
      STORE_TIMEOUT_MS,
    );
  });
  return Promise.race([Promise.resolve(abortable), timeout]).finally(() => clearTimeout(timer));
}

function throwIfError(error: { message?: string } | null, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message ?? "Supabase request failed"}`);
}

function oneRateLimitRow(data: unknown): { hits: number; reset_time_ms: number } {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("Rate-limit increment returned no row");
  const { hits, reset_time_ms } = row as { hits?: unknown; reset_time_ms?: unknown };
  const parsedHits = Number(hits);
  const resetTime = Number(reset_time_ms);
  if (!Number.isInteger(parsedHits) || parsedHits < 1 || !Number.isFinite(resetTime)) {
    throw new Error("Rate-limit increment returned invalid values");
  }
  return { hits: parsedHits, reset_time_ms: resetTime };
}

interface RateLimitEntry {
  hits: number;
  resetTime: number;
}

export class SupabaseRateLimitStore implements Store {
  readonly prefix: string;
  private windowMs = 60_000;
  private fallback = new Map<string, RateLimitEntry>();
  private consecutiveDbFailures = 0;
  private static readonly DB_FAILURE_WARN_THRESHOLD = 3;

  constructor(
    prefix: string,
    private readonly clientOverride?: StoreClient | null,
  ) {
    if (typeof prefix !== "string" || prefix.trim().length === 0) {
      throw new TypeError("Rate-limit store prefix must be non-empty");
    }
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs ?? 60_000;
  }

  private fullKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  private async client(): Promise<StoreClient | null> {
    if (this.clientOverride !== undefined) return this.clientOverride;
    return getStoreClient();
  }

  private fallbackIncrement(key: string): ClientRateLimitInfo {
    const now = Date.now();
    const existing = this.fallback.get(key);
    const entry = !existing || now >= existing.resetTime
      ? { hits: 1, resetTime: now + this.windowMs }
      : { hits: existing.hits + 1, resetTime: existing.resetTime };
    this.fallback.set(key, entry);
    return { totalHits: entry.hits, resetTime: new Date(entry.resetTime) };
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const fullKey = this.fullKey(key);
    try {
      const client = await this.client();
      if (client) {
        const { data, error } = await withTimeout(
          client.rpc("ratelimit_increment", {
            p_key: fullKey,
            p_window_ms: this.windowMs,
          }),
          "rate-limit increment",
        );
        throwIfError(error, "Rate-limit increment");
        const row = oneRateLimitRow(data);
        this.consecutiveDbFailures = 0;
        return { totalHits: row.hits, resetTime: new Date(row.reset_time_ms) };
      }
    } catch (error) {
      this.consecutiveDbFailures++;
      if (this.consecutiveDbFailures >= SupabaseRateLimitStore.DB_FAILURE_WARN_THRESHOLD) {
        console.warn(
          `[rateLimiter] ${this.prefix}: ${this.consecutiveDbFailures} consecutive Supabase ` +
            "failure(s) — switching to in-memory fallback for this window",
        );
      }
      console.error("[rateLimiter] Supabase increment failed — falling back to in-memory:", error);
    }
    return this.fallbackIncrement(fullKey);
  }

  async decrement(key: string): Promise<void> {
    const fullKey = this.fullKey(key);
    try {
      const client = await this.client();
      if (client) {
        const { error } = await withTimeout(
          client.rpc("ratelimit_decrement", { p_key: fullKey }),
          "rate-limit decrement",
        );
        throwIfError(error, "Rate-limit decrement");
        return;
      }
    } catch (error) {
      console.error("[rateLimiter] Supabase decrement failed — using in-memory fallback:", error);
    }
    const existing = this.fallback.get(fullKey);
    if (existing && existing.hits > 0) {
      this.fallback.set(fullKey, { ...existing, hits: existing.hits - 1 });
    }
  }

  async resetKey(key: string): Promise<void> {
    const fullKey = this.fullKey(key);
    try {
      const client = await this.client();
      if (client) {
        const { error } = await withTimeout(
          client.rpc("ratelimit_delete_key", { p_key: fullKey }),
          "rate-limit key reset",
        );
        throwIfError(error, "Rate-limit key reset");
        return;
      }
    } catch (error) {
      console.error("[rateLimiter] Supabase key reset failed — using in-memory fallback:", error);
    }
    this.fallback.delete(fullKey);
  }

  async resetAll(): Promise<void> {
    try {
      const client = await this.client();
      if (client) {
        const { error } = await withTimeout(
          client.rpc("ratelimit_delete_prefix", {
              p_prefix: `${this.prefix}:`,
          }),
          "rate-limit prefix reset",
        );
        throwIfError(error, "Rate-limit prefix reset");
        return;
      }
    } catch (error) {
      console.error("[rateLimiter] Supabase prefix reset failed:", error);
      throw error;
    }
    this.fallback.clear();
  }

  async loadFromSupabase(): Promise<void> {
    try {
      const client = await this.client();
      if (!client) return;
      const { data, error } = await withTimeout(
        client.from(RATE_LIMIT_TABLE)
          .select("key,hits,reset_time")
          .like("key", `${this.prefix}:%`)
          .gt("reset_time", new Date().toISOString()),
        "rate-limit preload",
      );
      throwIfError(error, "Rate-limit preload");
      for (const row of data ?? []) {
        const hits = Number(row.hits);
        const resetTime = new Date(row.reset_time).getTime();
        if (Number.isInteger(hits) && hits >= 0 && Number.isFinite(resetTime)) {
          this.fallback.set(row.key, { hits, resetTime });
        }
      }
    } catch (error) {
      console.error(`[rateLimiter] ${this.prefix}: failed to preload counters from Supabase:`, error);
    }
  }

  get _consecutiveDbFailuresForTesting(): number {
    return this.consecutiveDbFailures;
  }
}

export async function pruneRateLimitRows(): Promise<number> {
  const client = await getStoreClient();
  const { count, error } = await withTimeout(
    client.from(RATE_LIMIT_TABLE)
      .delete({ count: "exact" })
      .lte("reset_time", new Date().toISOString()),
    "rate-limit prune",
  );
  throwIfError(error, "Rate-limit prune");
  return count ?? 0;
}

export async function pruneLockoutRows(): Promise<number> {
  const client = await getStoreClient();
  const { count, error } = await withTimeout(
    client.from(LOCKOUT_TABLE)
      .delete({ count: "exact" })
      .lte("expires", Date.now()),
    "lockout prune",
  );
  throwIfError(error, "Lockout prune");
  return count ?? 0;
}

export function createSupabaseLockoutPersistence(): LockoutPersistenceLayer {
  return {
    async set(key, record, ttlMs) {
      const client = await getStoreClient();
      const { error } = await withTimeout(
        client.from(LOCKOUT_TABLE).upsert(
          {
            key: `lockout:${key}`,
            value: JSON.stringify(record),
            expires: Date.now() + ttlMs,
          },
          { onConflict: "key" },
        ),
        "lockout write",
      );
      throwIfError(error, "Lockout write");
    },
    async delete(key) {
      const client = await getStoreClient();
      const { error } = await withTimeout(
        client.from(LOCKOUT_TABLE).delete().eq("key", `lockout:${key}`),
        "lockout delete",
      );
      throwIfError(error, "Lockout delete");
    },
    async loadAll() {
      const client = await getStoreClient();
      const { data, error } = await withTimeout(
        client.from(LOCKOUT_TABLE).select("key,value,expires").like("key", "lockout:%"),
        "lockout load",
      );
      throwIfError(error, "Lockout load");
      return (data ?? []).flatMap((row) => {
        let decoded: any;
        try {
          decoded = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        } catch {
          return [];
        }
        const record = decoded?.value ?? decoded;
        if (
          !record ||
          !Number.isInteger(record.attempts) ||
          !Number.isFinite(record.windowStart) ||
          !(record.lockedUntil === null || Number.isFinite(record.lockedUntil))
        ) return [];
        return [{
          key: String(row.key).slice("lockout:".length),
          record: record as LockoutRecord,
          expiresAt: row.expires == null ? Infinity : Number(row.expires),
        }];
      }).filter((entry) => Number.isFinite(entry.expiresAt) || entry.expiresAt === Infinity);
    },
  };
}

export function resetSupabaseStoreForTesting(): void {
  _testOverrides.client = undefined;
}
