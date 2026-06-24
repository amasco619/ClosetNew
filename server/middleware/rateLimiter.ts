import rateLimit from "express-rate-limit";
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
let _pool: Pool | null = null;

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
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load unexpired lockout records from the persistence layer into the in-memory
 * cache. Call once from server startup (before registerRoutes) so the sync
 * helpers serve accurate lockout state immediately after a restart.
 */
export async function initLockoutStore(): Promise<void> {
  const p = getPersistence();
  if (!p) {
    console.warn(
      "[rateLimiter] DATABASE_URL not set — lockout state will not survive restarts"
    );
    return;
  }
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
}

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
  handler: makeLimiterHandler(),
});

export const colorLimiter = rateLimit({
  ...LIMITER_CONFIGS.colorLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  handler: makeLimiterHandler(),
});

export const accountLimiter = rateLimit({
  ...LIMITER_CONFIGS.accountLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  handler: makeLimiterHandler(),
});

export const authLimiter = rateLimit({
  ...LIMITER_CONFIGS.authLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  handler: makeLimiterHandler(),
});

export const resetLimiter = rateLimit({
  ...LIMITER_CONFIGS.resetLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  handler: makeLimiterHandler(),
});
