import rateLimit, { type Store, type Options, type ClientRateLimitInfo } from "express-rate-limit";
import type { Request, Response } from "express";
import { Pool } from "pg";
import Keyv from "keyv";
import KeyvPostgres from "@keyv/postgres";

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface LockoutRecord {
  attempts: number;
  windowStart: number;
  lockedUntil: number | null;
}

interface CacheEntry {
  record: LockoutRecord;
  expiresAt: number;
}

/**
 * Persistence layer interface — decouples the lockout helpers from a specific
 * backing store so tests can inject a lightweight in-memory implementation
 * without needing a real Postgres connection.
 */
export interface LockoutPersistenceLayer {
  set(key: string, record: LockoutRecord, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * Called once at server startup. Returns all entries that have not yet
   * expired so they can be loaded into the in-memory write-through cache.
   */
  loadAll(): Promise<Array<{ key: string; record: LockoutRecord; expiresAt: number }>>;
}

const memCache = new Map<string, CacheEntry>();

let _persistence: LockoutPersistenceLayer | null = null;
let _kv: Keyv<LockoutRecord> | null = null;

/** Shared pg.Pool for the lockout store (and for the rate-limit store below). */
let _pool: Pool | null = null;

/**
 * Dedicated pg.Pool for rate-limit counters.
 * Using `undefined` as the "not yet initialised" sentinel so that `null`
 * can unambiguously mean "no DATABASE_URL, use in-memory fallback".
 */
let _rlPool: Pool | null | undefined = undefined;

/**
 * Handle for the periodic rate-limit prune interval.
 * Exported so tests can call clearInterval() on it to avoid leaking timers.
 */
export let __rlPruneIntervalForTesting: ReturnType<typeof setInterval> | null = null;

/**
 * Handle for the periodic lockout-store prune interval.
 * Exported so tests can call clearInterval() on it to avoid leaking timers.
 */
export let __lockoutPruneIntervalForTesting: ReturnType<typeof setInterval> | null = null;

function buildPostgresPersistence(): LockoutPersistenceLayer | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  try {
    if (!_kv) {
      const store = new KeyvPostgres({ uri: url, table: "lockout_store" });
      _kv = new Keyv<LockoutRecord>({ store, namespace: "lockout" });
      _kv.on("error", (err: unknown) => {
        console.error("[rateLimiter] lockout store error:", err);
      });
    }
    if (!_pool) {
      _pool = new Pool({ connectionString: url });
    }

    const kv = _kv;
    const pool = _pool;

    return {
      async set(key, record, ttlMs) {
        await kv.set(key, record, ttlMs);
      },
      async delete(key) {
        await kv.delete(key);
      },
      async loadAll() {
        const now = Date.now();
        const { rows } = await pool.query<{
          key: string;
          value: unknown;
          expires: string | null;
        }>(
          `SELECT key, value, expires FROM lockout_store WHERE (expires IS NULL OR expires > $1)`,
          [now]
        );
        return rows.map((row) => {
          const rawKey = String(row.key);
          const normalizedKey = rawKey.startsWith("lockout:")
            ? rawKey.slice("lockout:".length)
            : rawKey;
          const record: LockoutRecord =
            typeof row.value === "string"
              ? JSON.parse(row.value).value ?? JSON.parse(row.value)
              : (row.value as any)?.value ?? row.value;
          const expiresAt = row.expires ? Number(row.expires) : Infinity;
          return { key: normalizedKey, record, expiresAt };
        });
      },
    };
  } catch (err) {
    console.error("[rateLimiter] failed to create Postgres persistence layer:", err);
    return null;
  }
}

function getPersistence(): LockoutPersistenceLayer | null {
  if (_persistence !== null) return _persistence;
  const pg = buildPostgresPersistence();
  _persistence = pg;
  return pg;
}

/** Return (or lazily create) the Pool used for rate-limit counters. */
function getRlPool(): Pool | null {
  if (_rlPool !== undefined) return _rlPool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    _rlPool = null;
    return null;
  }
  try {
    _rlPool = new Pool({ connectionString: url });
    return _rlPool;
  } catch (err) {
    console.error("[rateLimiter] failed to create rate-limit pool:", err);
    _rlPool = null;
    return null;
  }
}

// ── Test helpers ─────────────────────────────────────────────────────────────
// These are intentionally exported so unit tests can inject a mock persistence
// layer and verify restart-survival semantics without a real DB connection.

/** Inject a custom persistence layer (pass null to revert to auto-detect). */
export function __setPersistenceLayerForTesting(
  layer: LockoutPersistenceLayer | null
): void {
  _persistence = layer;
}

/** Clear the in-memory write-through cache and reset module-level singletons. */
export function __resetForTesting(): void {
  memCache.clear();
  _persistence = null;
  _kv = null;
  _pool = null;
  _rlPool = undefined;
  if (__rlPruneIntervalForTesting !== null) {
    clearInterval(__rlPruneIntervalForTesting);
    __rlPruneIntervalForTesting = null;
  }
  if (__lockoutPruneIntervalForTesting !== null) {
    clearInterval(__lockoutPruneIntervalForTesting);
    __lockoutPruneIntervalForTesting = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the `lockout_store` table exists in Postgres.
 * Runs an explicit CREATE TABLE IF NOT EXISTS so the table is always present
 * before @keyv/postgres touches it, even on a fresh database or when the DB
 * user lacks automatic-DDL privileges at runtime.
 */
async function ensureLockoutTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lockout_store (
      key     TEXT    PRIMARY KEY,
      value   TEXT,
      expires BIGINT
    )
  `);
}

/**
 * Load unexpired lockout records from the persistence layer into the in-memory
 * cache. Call once from server startup (before registerRoutes) so the sync
 * helpers serve accurate lockout state immediately after a restart.
 */
export async function initLockoutStore(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      "[rateLimiter] DATABASE_URL not set — lockout state will not survive restarts"
    );
    return;
  }

  // Ensure the pool exists before we run DDL.
  if (!_pool) {
    _pool = new Pool({ connectionString: url });
  }

  try {
    await ensureLockoutTable(_pool);
    console.log("[rateLimiter] lockout_store table is present");
  } catch (err) {
    console.error("[rateLimiter] failed to ensure lockout_store table:", err);
    // Continue — if the table was pre-created by a migration it will still be
    // readable; we just won't be able to auto-create it here.
  }

  try {
    const { rowCount } = await _pool.query(
      `DELETE FROM lockout_store WHERE expires IS NOT NULL AND expires <= $1`,
      [Date.now()]
    );
    console.log(`[rateLimiter] pruned ${rowCount ?? 0} expired lockout row(s)`);
  } catch (err) {
    console.error("[rateLimiter] failed to prune expired lockout rows:", err);
  }

  const p = getPersistence();
  if (!p) return;

  try {
    const now = Date.now();
    const entries = await p.loadAll();
    let loaded = 0;
    for (const { key, record, expiresAt } of entries) {
      if (expiresAt > now) {
        memCache.set(key, { record, expiresAt });
        loaded++;
      }
    }
    console.log(`[rateLimiter] loaded ${loaded} active lockout record(s) from DB`);
  } catch (err) {
    console.error("[rateLimiter] failed to load lockout records from DB:", err);
  }

  if (__lockoutPruneIntervalForTesting === null) {
    const pool = _pool;
    if (pool) {
      __lockoutPruneIntervalForTesting = setInterval(() => {
        pool.query(
          `DELETE FROM lockout_store WHERE expires IS NOT NULL AND expires <= $1`,
          [Date.now()]
        ).then(
          ({ rowCount }) => {
            if ((rowCount ?? 0) > 0) {
              console.log(
                `[rateLimiter] periodic prune: removed ${rowCount} expired lockout row(s)`
              );
            }
          },
          (err: unknown) => {
            console.error("[rateLimiter] periodic lockout prune error:", err);
          }
        );
      }, 60 * 60 * 1000);
    }
  }
}

/**
 * Ensure the `ratelimit_store` table exists and prune expired rows.
 * Call once from server startup alongside `initLockoutStore`.
 */
export async function initRateLimitStore(): Promise<void> {
  const pool = getRlPool();
  if (!pool) {
    console.warn(
      "[rateLimiter] DATABASE_URL not set — rate-limit counters will not survive restarts"
    );
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratelimit_store (
        key        TEXT        PRIMARY KEY,
        hits       INTEGER     NOT NULL DEFAULT 0,
        reset_time TIMESTAMPTZ NOT NULL
      )
    `);
    const { rowCount } = await pool.query(
      `DELETE FROM ratelimit_store WHERE reset_time <= NOW()`
    );
    console.log(
      `[rateLimiter] rate-limit store ready; pruned ${rowCount ?? 0} expired row(s)`
    );
  } catch (err) {
    console.error("[rateLimiter] failed to initialise rate-limit store:", err);
  }

  if (__rlPruneIntervalForTesting === null) {
    __rlPruneIntervalForTesting = setInterval(() => {
      pool.query(`DELETE FROM ratelimit_store WHERE reset_time <= NOW()`).then(
        ({ rowCount }) => {
          if ((rowCount ?? 0) > 0) {
            console.log(
              `[rateLimiter] periodic prune: removed ${rowCount} expired rate-limit row(s)`
            );
          }
        },
        (err: unknown) => {
          console.error("[rateLimiter] periodic prune error:", err);
        }
      );
    }, 60 * 60 * 1000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function checkAccountLockout(
  email: string
): { locked: true; minutesLeft: number } | { locked: false } {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const entry = memCache.get(key);

  if (!entry || now >= entry.expiresAt) {
    if (entry) memCache.delete(key);
    return { locked: false };
  }

  const { record } = entry;
  if (record.lockedUntil !== null && now < record.lockedUntil) {
    const minutesLeft = Math.max(1, Math.ceil((record.lockedUntil - now) / 60000));
    return { locked: true, minutesLeft };
  }

  return { locked: false };
}

export function recordFailedAttempt(email: string): void {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const existing = memCache.get(key);
  const isExpired = !existing || now >= existing.expiresAt;

  let record: LockoutRecord;
  let ttlMs: number;

  if (isExpired) {
    record = { attempts: 1, windowStart: now, lockedUntil: null };
    ttlMs = LOCKOUT_WINDOW_MS;
  } else {
    const prev = existing!.record;
    const updatedAttempts = prev.attempts + 1;
    if (updatedAttempts >= LOCKOUT_MAX_ATTEMPTS) {
      record = {
        attempts: updatedAttempts,
        windowStart: prev.windowStart,
        lockedUntil: now + LOCKOUT_DURATION_MS,
      };
      ttlMs = LOCKOUT_DURATION_MS;
    } else {
      record = {
        attempts: updatedAttempts,
        windowStart: prev.windowStart,
        lockedUntil: null,
      };
      ttlMs = Math.max(1, LOCKOUT_WINDOW_MS - (now - prev.windowStart));
    }
  }

  memCache.set(key, { record, expiresAt: now + ttlMs });

  const p = getPersistence();
  if (p) {
    p.set(key, record, ttlMs).catch((err: unknown) =>
      console.error("[rateLimiter] failed to persist failed attempt:", err)
    );
  }
}

export function clearLockout(email: string): void {
  const key = email.trim().toLowerCase();
  memCache.delete(key);
  const p = getPersistence();
  if (p) {
    p.delete(key).catch((err: unknown) =>
      console.error("[rateLimiter] failed to clear lockout:", err)
    );
  }
}

// ── Atomic Postgres-backed rate-limit store ───────────────────────────────────

interface RateLimitEntry {
  hits: number;
  resetTime: number;
}

/**
 * A Postgres-backed Store for express-rate-limit that uses a single atomic
 * `INSERT … ON CONFLICT DO UPDATE` for every increment so concurrent requests
 * cannot race and undercount hits.
 *
 * The `ratelimit_store` table is created by `initRateLimitStore()` at startup.
 *
 * When DATABASE_URL is absent the store falls back to a plain in-memory Map so
 * development environments without Postgres continue to work unchanged.
 */
export class PgRateLimitStore implements Store {
  readonly prefix: string;
  private windowMs: number = 60_000;
  private pool: Pool | null;
  private fallback: Map<string, RateLimitEntry> = new Map();

  constructor(prefix: string, pool: Pool | null) {
    this.prefix = prefix;
    this.pool = pool;
  }

  /** Exposed for unit tests only — do not use in production code. */
  get _poolForTesting(): Pool | null {
    return this.pool;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs ?? 60_000;
  }

  private fullKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const fk = this.fullKey(key);

    if (this.pool) {
      try {
        /**
         * Single atomic upsert:
         * - On first hit for this key: insert with hits=1 and a fresh window.
         * - On conflict: if the existing row's window has expired, reset to 1
         *   with a fresh window; otherwise increment hits within the same window.
         * RETURNING gives us the authoritative post-write values.
         */
        const { rows } = await this.pool.query<{
          hits: number;
          reset_time_ms: string;
        }>(
          `INSERT INTO ratelimit_store (key, hits, reset_time)
           VALUES ($1, 1, NOW() + ($2::bigint * interval '1 ms'))
           ON CONFLICT (key) DO UPDATE SET
             hits = CASE
               WHEN ratelimit_store.reset_time <= NOW() THEN 1
               ELSE ratelimit_store.hits + 1
             END,
             reset_time = CASE
               WHEN ratelimit_store.reset_time <= NOW()
                 THEN NOW() + ($2::bigint * interval '1 ms')
               ELSE ratelimit_store.reset_time
             END
           RETURNING hits,
             (extract(epoch from reset_time) * 1000)::bigint AS reset_time_ms`,
          [fk, this.windowMs]
        );

        const row = rows[0];
        return {
          totalHits: Number(row.hits),
          resetTime: new Date(Number(row.reset_time_ms)),
        };
      } catch (err) {
        console.error("[rateLimiter] DB error in increment — falling back to in-memory:", err);
      }
    }

    const now = Date.now();
    const existing = this.fallback.get(fk);
    let hits: number;
    let resetTime: number;

    if (!existing || now >= existing.resetTime) {
      hits = 1;
      resetTime = now + this.windowMs;
    } else {
      hits = existing.hits + 1;
      resetTime = existing.resetTime;
    }

    this.fallback.set(fk, { hits, resetTime });
    return { totalHits: hits, resetTime: new Date(resetTime) };
  }

  async decrement(key: string): Promise<void> {
    const fk = this.fullKey(key);

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE ratelimit_store
           SET hits = GREATEST(0, hits - 1)
           WHERE key = $1 AND reset_time > NOW()`,
          [fk]
        );
        return;
      } catch (err) {
        console.error("[rateLimiter] DB error in decrement — falling back to in-memory:", err);
      }
    }

    const existing = this.fallback.get(fk);
    if (existing && existing.hits > 0) {
      this.fallback.set(fk, { ...existing, hits: existing.hits - 1 });
    }
  }

  async resetKey(key: string): Promise<void> {
    const fk = this.fullKey(key);

    if (this.pool) {
      try {
        await this.pool.query(`DELETE FROM ratelimit_store WHERE key = $1`, [fk]);
        return;
      } catch (err) {
        console.error("[rateLimiter] DB error in resetKey — falling back to in-memory:", err);
      }
    }

    this.fallback.delete(fk);
  }

  async resetAll(): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `DELETE FROM ratelimit_store WHERE key LIKE $1`,
        [`${this.prefix}:%`]
      );
      return;
    }
    this.fallback.clear();
  }
}

function makeStore(prefix: string): PgRateLimitStore {
  return new PgRateLimitStore(prefix, getRlPool());
}

/** Create a named store using the current DATABASE_URL setting. For unit tests only. */
export function __makeStoreForTesting(prefix: string): PgRateLimitStore {
  return makeStore(prefix);
}

// ─────────────────────────────────────────────────────────────────────────────

export function makeLimiterHandler() {
  return (req: Request, res: Response) => {
    const info = (req as any).rateLimit;
    const resetMs =
      info?.resetTime instanceof Date ? info.resetTime.getTime() - Date.now() : 0;
    const retryAfter = Math.max(1, Math.ceil(resetMs / 1000));
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "rate_limit", retryAfter });
  };
}

/**
 * Canonical configuration for each rate-limiter.
 * Exported so tests can instantiate fresh limiter objects from the real
 * production values — any drift here will fail the integration tests.
 */
export const LIMITER_CONFIGS = {
  aiLimiter:      { windowMs: 60 * 1000,      max: 10 },
  colorLimiter:   { windowMs: 60 * 1000,      max: 30 },
  accountLimiter: { windowMs: 60 * 60 * 1000, max: 5  },
  authLimiter:    { windowMs: 15 * 60 * 1000, max: 5  },
  resetLimiter:   { windowMs: 60 * 60 * 1000, max: 3  },
} as const;

export const aiLimiter = rateLimit({
  ...LIMITER_CONFIGS.aiLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("ai"),
  handler: makeLimiterHandler(),
});

export const colorLimiter = rateLimit({
  ...LIMITER_CONFIGS.colorLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("color"),
  handler: makeLimiterHandler(),
});

export const accountLimiter = rateLimit({
  ...LIMITER_CONFIGS.accountLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("account"),
  handler: makeLimiterHandler(),
});

export const authLimiter = rateLimit({
  ...LIMITER_CONFIGS.authLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("auth"),
  handler: makeLimiterHandler(),
});

export const resetLimiter = rateLimit({
  ...LIMITER_CONFIGS.resetLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("reset"),
  handler: makeLimiterHandler(),
});
