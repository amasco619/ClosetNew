import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface LockoutRecord {
  attempts: number;
  windowStart: number;
  lockedUntil: number | null;
}

const lockoutStore = new Map<string, LockoutRecord>();

export function checkAccountLockout(email: string): { locked: true; minutesLeft: number } | { locked: false } {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const record = lockoutStore.get(key);

  if (!record) return { locked: false };

  if (record.lockedUntil !== null) {
    if (now < record.lockedUntil) {
      const minutesLeft = Math.max(1, Math.ceil((record.lockedUntil - now) / 60000));
      return { locked: true, minutesLeft };
    }
    lockoutStore.delete(key);
    return { locked: false };
  }

  if (now - record.windowStart > LOCKOUT_WINDOW_MS) {
    lockoutStore.delete(key);
    return { locked: false };
  }

  return { locked: false };
}

export function recordFailedAttempt(email: string): void {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const record = lockoutStore.get(key);

  if (!record || now - record.windowStart > LOCKOUT_WINDOW_MS) {
    lockoutStore.set(key, { attempts: 1, windowStart: now, lockedUntil: null });
    return;
  }

  record.attempts += 1;
  if (record.attempts >= LOCKOUT_MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
}

export function clearLockout(email: string): void {
  lockoutStore.delete(email.trim().toLowerCase());
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
