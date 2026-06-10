import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

function makeHandler(windowMs: number) {
  return (_req: Request, res: Response) => {
    const retryAfter = Math.ceil(windowMs / 1000);
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "rate_limit", retryAfter });
  };
}

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler(60 * 1000),
});

export const colorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler(60 * 1000),
});

export const accountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler(60 * 60 * 1000),
});
