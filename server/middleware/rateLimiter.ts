import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

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
