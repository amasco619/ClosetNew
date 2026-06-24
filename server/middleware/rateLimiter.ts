import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { Pool } from "pg";
import Keyv from "keyv";
import KeyvPostgres from "@keyv/postgres";

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface LockoutRecord {
  attempts: number;
  windowStart: number;
  lockedUntil: number | null;
}

interface CacheEntry {
  record: LockoutRecord;
  expiresAt: number;
}

const memCache = new Map<string, CacheEntry>();

let _kv: Keyv<LockoutRecord> | null = null;
let _pool: Pool | null = null;

function getLockoutKv(): Keyv<LockoutRecord> | null {
  if (_kv) return _kv;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const store = new KeyvPostgres({ uri: url, table: "lockout_store" });
    _kv = new Keyv<LockoutRecord>({ store, namespace: "lockout" });
    _kv.on("error", (err: unknown) => {
      console.error("[rateLimiter] lockout store error:", err);
    });
    return _kv;
  } catch (err) {
    console.error("[rateLimiter] failed to create lockout KV:", err);
    return null;
  }
}

function getLockoutPool(): Pool | null {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    _pool = new Pool({ connectionString: url });
    return _pool;
  } catch (err) {
    console.error("[rateLimiter] failed to create pool:", err);
    return null;
  }
}

/**
 * Load unexpired lockout records from Postgres into the in-memory cache.
 * Call once from server startup (before registerRoutes) so the sync helpers
 * can serve accurate lockout state immediately after a restart.
 */
export async function initLockoutStore(): Promise<void> {
  const pool = getLockoutPool();
  if (!pool) {
    console.warn("[rateLimiter] DATABASE_URL not set — lockout state will not survive restarts");
    return;
  }
  try {
    const now = Date.now();
    const { rows } = await pool.query<{ key: string; value: unknown; expires: string | null }>(
      `SELECT key, value, expires FROM lockout_store WHERE (expires IS NULL OR expires > $1)`,
      [now]
    );
    for (const row of rows) {
      const rawKey = String(row.key);
      const normalizedKey = rawKey.startsWith("lockout:") ? rawKey.slice("lockout:".length) : rawKey;
      const record: LockoutRecord =
        typeof row.value === "string" ? JSON.parse(row.value).value ?? JSON.parse(row.value) : (row.value as any)?.value ?? row.value;
      const expiresAt = row.expires ? Number(row.expires) : Infinity;
      if (expiresAt > now) {
        memCache.set(normalizedKey, { record, expiresAt });
      }
    }
    console.log(`[rateLimiter] loaded ${memCache.size} active lockout record(s) from DB`);
  } catch (err) {
    console.error("[rateLimiter] failed to load lockout records from DB:", err);
  }
}

export function checkAccountLockout(email: string): { locked: true; minutesLeft: number } | { locked: false } {
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
      record = { attempts: updatedAttempts, windowStart: prev.windowStart, lockedUntil: now + LOCKOUT_DURATION_MS };
      ttlMs = LOCKOUT_DURATION_MS;
    } else {
      record = { attempts: updatedAttempts, windowStart: prev.windowStart, lockedUntil: null };
      ttlMs = Math.max(1, LOCKOUT_WINDOW_MS - (now - prev.windowStart));
    }
  }

  memCache.set(key, { record, expiresAt: now + ttlMs });

  const kv = getLockoutKv();
  if (kv) {
    kv.set(key, record, ttlMs).catch((err: unknown) =>
      console.error("[rateLimiter] failed to persist failed attempt:", err)
    );
  }
}

export function clearLockout(email: string): void {
  const key = email.trim().toLowerCase();
  memCache.delete(key);
  const kv = getLockoutKv();
  if (kv) {
    kv.delete(key).catch((err: unknown) =>
      console.error("[rateLimiter] failed to clear lockout:", err)
    );
  }
}

function makeHandler() {
  return (req: Request, res: Response) => {
    const info = (req as any).rateLimit;
    const resetMs = info?.resetTime instanceof Date
      ? info.resetTime.getTime() - Date.now()
      : 0;
    const retryAfter = Math.max(1, Math.ceil(resetMs / 1000));
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "rate_limit", retryAfter });
  };
}

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: true,
  handler: makeHandler(),
});

export const colorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: true,
  handler: makeHandler(),
});

export const accountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: true,
  handler: makeHandler(),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: true,
  handler: makeHandler(),
});

export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: true,
  handler: makeHandler(),
});
