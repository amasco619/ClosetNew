import rateLimit, { type Options } from "express-rate-limit";
import type { Request, Response } from "express";
import {
  SupabaseRateLimitStore,
  _testOverrides as storeTestOverrides,
  createSupabaseLockoutPersistence,
  pruneLockoutRows,
  pruneRateLimitRows,
  resetSupabaseStoreForTesting,
  type LockoutPersistenceLayer,
  type LockoutRecord,
} from "./supabaseSecurityStore";

export type { LockoutPersistenceLayer, LockoutRecord } from "./supabaseSecurityStore";
export { SupabaseRateLimitStore } from "./supabaseSecurityStore";
export { storeTestOverrides as __storeOverrides };

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const BASE_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const MAX_PRUNE_BACKOFF_MS = 8 * 60 * 60 * 1000;

interface CacheEntry {
  record: LockoutRecord;
  expiresAt: number;
}

const memCache = new Map<string, CacheEntry>();
let _persistence: LockoutPersistenceLayer | null = null;
let _isPersistenceTestOverride = false;

export let __rlPruneIntervalForTesting: ReturnType<typeof setTimeout> | null = null;
export let __lockoutPruneIntervalForTesting: ReturnType<typeof setTimeout> | null = null;

function getPersistence(): LockoutPersistenceLayer {
  if (_persistence !== null) return _persistence;
  _persistence = createSupabaseLockoutPersistence();
  return _persistence;
}

export function __setPersistenceLayerForTesting(
  layer: LockoutPersistenceLayer | null,
): void {
  _persistence = layer;
  _isPersistenceTestOverride = layer !== null;
}

export function __resetForTesting(): void {
  memCache.clear();
  _persistence = null;
  _isPersistenceTestOverride = false;
  _stores.clear();
  resetSupabaseStoreForTesting();
  if (__rlPruneIntervalForTesting !== null) {
    clearTimeout(__rlPruneIntervalForTesting);
    __rlPruneIntervalForTesting = null;
  }
  if (__lockoutPruneIntervalForTesting !== null) {
    clearTimeout(__lockoutPruneIntervalForTesting);
    __lockoutPruneIntervalForTesting = null;
  }
}

function pruneDelay(failCount: number): number {
  return Math.min(BASE_PRUNE_INTERVAL_MS * Math.pow(2, failCount), MAX_PRUNE_BACKOFF_MS);
}

function scheduleRlPrune(failCount: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    void pruneRateLimitRows().then(
      (removed) => {
        if (removed > 0) console.log(`[rateLimiter] periodic prune: removed ${removed} expired counter(s)`);
        __rlPruneIntervalForTesting = scheduleRlPrune(0);
      },
      (error: unknown) => {
        if (process.env.NODE_ENV !== "test") {
          const delay = pruneDelay(failCount + 1);
          console.error(
            `[rateLimiter] periodic prune error (retrying in ${delay / 60_000} min):`,
            error,
          );
        }
        __rlPruneIntervalForTesting = scheduleRlPrune(failCount + 1);
      },
    );
  }, pruneDelay(failCount));
}

function scheduleLockoutPrune(failCount: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    void pruneLockoutRows().then(
      (removed) => {
        if (removed > 0) console.log(`[rateLimiter] periodic prune: removed ${removed} expired lockout(s)`);
        __lockoutPruneIntervalForTesting = scheduleLockoutPrune(0);
      },
      (error: unknown) => {
        if (process.env.NODE_ENV !== "test") {
          const delay = pruneDelay(failCount + 1);
          console.error(
            `[rateLimiter] periodic lockout prune error (retrying in ${delay / 60_000} min):`,
            error,
          );
        }
        __lockoutPruneIntervalForTesting = scheduleLockoutPrune(failCount + 1);
      },
    );
  }, pruneDelay(failCount));
}

export async function initLockoutStore(): Promise<void> {
  const persistence = getPersistence();
  if (!_isPersistenceTestOverride) {
    try {
      const removed = await pruneLockoutRows();
      console.log(`[rateLimiter] pruned ${removed} expired lockout row(s)`);
    } catch (error) {
      console.error("[rateLimiter] failed to prune expired lockout rows from Supabase:", error);
    }
  }

  try {
    const now = Date.now();
    const entries = await persistence.loadAll();
    let loaded = 0;
    for (const { key, record, expiresAt } of entries) {
      if (expiresAt > now) {
        memCache.set(key, { record, expiresAt });
        loaded++;
      }
    }
    console.log(`[rateLimiter] loaded ${loaded} active lockout record(s) from Supabase`);
  } catch (error) {
    console.error("[rateLimiter] failed to load lockout records from Supabase:", error);
  }

  if (
    process.env.NODE_ENV !== "test" &&
    __lockoutPruneIntervalForTesting === null
  ) {
    __lockoutPruneIntervalForTesting = scheduleLockoutPrune(0);
  }
}

const _stores = new Map<string, SupabaseRateLimitStore>();

export async function initRateLimitStore(): Promise<void> {
  try {
    const removed = await pruneRateLimitRows();
    console.log(`[rateLimiter] Supabase rate-limit store ready; pruned ${removed} expired row(s)`);
  } catch (error) {
    console.error("[rateLimiter] failed to initialise Supabase rate-limit store:", error);
  }

  if (process.env.NODE_ENV !== "test" && __rlPruneIntervalForTesting === null) {
    __rlPruneIntervalForTesting = scheduleRlPrune(0);
  }
  await Promise.all([..._stores.values()].map((store) => store.loadFromSupabase()));
}

export function checkAccountLockout(
  email: string,
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
    return { locked: true, minutesLeft: Math.max(1, Math.ceil((record.lockedUntil - now) / 60_000)) };
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
    const updatedAttempts = existing!.record.attempts + 1;
    if (updatedAttempts >= LOCKOUT_MAX_ATTEMPTS) {
      record = {
        attempts: updatedAttempts,
        windowStart: existing!.record.windowStart,
        lockedUntil: now + LOCKOUT_DURATION_MS,
      };
      ttlMs = LOCKOUT_DURATION_MS;
    } else {
      record = {
        attempts: updatedAttempts,
        windowStart: existing!.record.windowStart,
        lockedUntil: null,
      };
      ttlMs = Math.max(1, LOCKOUT_WINDOW_MS - (now - existing!.record.windowStart));
    }
  }

  memCache.set(key, { record, expiresAt: now + ttlMs });
  void getPersistence().set(key, record, ttlMs).catch((error: unknown) =>
    console.error("[rateLimiter] failed to persist failed attempt:", error),
  );
}

export function clearLockout(email: string): void {
  const key = email.trim().toLowerCase();
  memCache.delete(key);
  void getPersistence().delete(key).catch((error: unknown) =>
    console.error("[rateLimiter] failed to clear lockout:", error),
  );
}

export function makeLimiterHandler() {
  return (req: Request, res: Response) => {
    const info = (req as any).rateLimit;
    const resetMs = info?.resetTime instanceof Date ? info.resetTime.getTime() - Date.now() : 0;
    const retryAfter = Math.max(1, Math.ceil(resetMs / 1000));
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "rate_limit", retryAfter });
  };
}

export const LIMITER_CONFIGS = {
  aiLimiter: { windowMs: 60 * 1000, max: 10 },
  bgRemovalLimiter: { windowMs: 60 * 1000, max: 8 },
  billingReconcileLimiter: { windowMs: 60 * 1000, max: 10 },
  accountLimiter: { windowMs: 60 * 60 * 1000, max: 5 },
  accountDeletionIpLimiter: { windowMs: 60 * 60 * 1000, max: 60 },
  accountDeletionUserLimiter: { windowMs: 60 * 60 * 1000, max: 5 },
  aiPreferenceLimiter: { windowMs: 60 * 1000, max: 30 },
  authLimiter: { windowMs: 15 * 60 * 1000, max: 5 },
  resetLimiter: { windowMs: 60 * 60 * 1000, max: 3 },
} as const;

function makeStore(prefix: string): SupabaseRateLimitStore {
  const store = new SupabaseRateLimitStore(prefix);
  _stores.set(prefix, store);
  return store;
}

export function __makeStoreForTesting(prefix: string): SupabaseRateLimitStore {
  return makeStore(prefix);
}

export const aiLimiter = rateLimit({
  ...LIMITER_CONFIGS.aiLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("ai"),
  handler: makeLimiterHandler(),
});

export const bgRemovalLimiter = rateLimit({
  ...LIMITER_CONFIGS.bgRemovalLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("bgremoval"),
  handler: makeLimiterHandler(),
});

export const billingReconcileLimiter = rateLimit({
  ...LIMITER_CONFIGS.billingReconcileLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("billingreconcile"),
  handler: makeLimiterHandler(),
});

export const accountLimiter = rateLimit({
  ...LIMITER_CONFIGS.accountLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("account"),
  handler: makeLimiterHandler(),
});

export const accountDeletionIpLimiter = rateLimit({
  ...LIMITER_CONFIGS.accountDeletionIpLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("account-delete-ip"),
  handler: makeLimiterHandler(),
});

export const accountDeletionUserLimiter = rateLimit({
  ...LIMITER_CONFIGS.accountDeletionUserLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("account-delete-user"),
  keyGenerator: (req) =>
    (req as Request & { authenticatedUser: { id: string } }).authenticatedUser.id,
  handler: makeLimiterHandler(),
});

export const aiPreferenceLimiter = rateLimit({
  ...LIMITER_CONFIGS.aiPreferenceLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("aipreference"),
  keyGenerator: (req) => (req as Request & { authenticatedUser: { id: string } }).authenticatedUser.id,
  handler: (req, res) => {
    const info = (req as any).rateLimit;
    const retryAfter = Math.max(
      1,
      Math.ceil(((info?.resetTime?.getTime() ?? Date.now()) - Date.now()) / 1000),
    );
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "ai_preference_rate_limit", retryAfter });
  },
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
