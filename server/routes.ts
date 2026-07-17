import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { classifyGarment } from "./classify-garment";
import { extractColor } from "./extract-color";
import { removeBackground } from "./remove-background";
import { supabaseAdmin, supabaseAuth } from "./supabase";
import { aiLimiter, bgRemovalLimiter, colorLimiter, accountLimiter, authLimiter, resetLimiter, checkAccountLockout, recordFailedAttempt, clearLockout } from "./middleware/rateLimiter";
// P-E: cap simultaneous AI calls so a burst cannot exhaust Gemini / GCV
// memory or connections. Extras are queued, not rejected (the rate limiter
// above handles outright rejection). Max 5 concurrent AI invocations.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pLimit = require("p-limit");
const _aiSlots = pLimit(5) as <T>(fn: () => Promise<T>) => Promise<T>;
/** Wraps an Express handler so it runs inside the AI concurrency slot pool. */
function withAiLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (req: Request, res: Response) => Promise<any> | void
): (req: Request, res: Response) => void {
  return (req, res) => { void _aiSlots(() => Promise.resolve(handler(req, res))); };
}

interface AuthenticatedRequest extends Request {
  authenticatedUser: { id: string; email?: string };
}

/**
 * Middleware that validates a Bearer token from the Authorization header and
 * attaches the authenticated user to `req.authenticatedUser`.
 *
 * Returns 401 when the header is missing or the token is invalid.
 */
async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  (req as AuthenticatedRequest).authenticatedUser = user;
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ── AI endpoints: authentication required ────────────────────────────────
  // Without auth, anyone can exhaust Gemini / Google Vision quota.
  app.post("/api/classify-garment", aiLimiter, requireAuth, withAiLimit(classifyGarment));
  app.post("/api/extract-color", colorLimiter, requireAuth, withAiLimit(extractColor));
  app.post("/api/remove-background", bgRemovalLimiter, withAiLimit(removeBackground));

  app.post("/api/auth/sign-in", authLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const lockout = checkAccountLockout(normalizedEmail);
    if (lockout.locked) {
      return res.status(429).json({
        error: `Account temporarily locked. Try again in ${lockout.minutesLeft} minute${lockout.minutesLeft === 1 ? "" : "s"}.`,
        retryAfter: lockout.minutesLeft * 60,
      });
    }

    try {
      const { data, error } = await supabaseAuth.auth.signInWithPassword({
        email: normalizedEmail,
        password: String(password),
      });
      if (error) {
        recordFailedAttempt(normalizedEmail);
        return res.status(401).json({ error: error.message });
      }
      clearLockout(normalizedEmail);
      return res.json({ session: data.session });
    } catch (err: any) {
      console.error("[auth/sign-in]", err.message);
      return res.status(500).json({ error: "sign_in_failed" });
    }
  });

  app.post("/api/auth/reset-password", resetLimiter, async (req, res) => {
    const { email, redirectTo: clientRedirectTo } = req.body;
    if (!email) {
      return res.status(400).json({ error: "email is required." });
    }

    const envAllowlist = process.env.ALLOWED_RESET_ORIGINS
      ? process.env.ALLOWED_RESET_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
      : null;

    let redirectTo = "auracloset://";
    if (typeof clientRedirectTo === "string") {
      try {
        const parsed = new URL(clientRedirectTo);
        const isHttps =
          parsed.protocol === "https:" ||
          (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"));
        const hasCorrectPath = parsed.pathname === "/auth/update-password";

        const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : null;
        const originAllowed = envAllowlist
          ? envAllowlist.includes(parsed.origin)
          : requestOrigin !== null && parsed.origin === new URL(requestOrigin).origin;

        if (isHttps && hasCorrectPath && originAllowed) {
          redirectTo = clientRedirectTo;
        }
      } catch {
        // Malformed URL — fall through to the native auracloset:// default.
      }
    }

    try {
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(
        String(email).trim().toLowerCase(),
        { redirectTo }
      );
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[auth/reset-password]", err.message);
      return res.status(500).json({ error: "reset_failed" });
    }
  });

  // ── Account management: authentication + ownership check required ─────────
  // Both endpoints require a valid session and assert that the authenticated
  // user is operating on their own account (no cross-user privilege escalation).

  app.post("/api/user/upgrade-premium", accountLimiter, requireAuth, async (req, res) => {
    const { userId } = req.body;
    const authedUser = (req as AuthenticatedRequest).authenticatedUser;

    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required." });
    }
    if (authedUser.id !== userId) {
      return res.status(403).json({ success: false, error: "forbidden" });
    }

    try {
      const { error } = await supabaseAdmin
        .from("user_profiles")
        .update({
          premium: true,
          premium_expires_at: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("id", userId);
      if (error) throw new Error(error.message);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[upgrade-premium]", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete("/api/user/delete-account", accountLimiter, requireAuth, async (req, res) => {
    const { userId } = req.body;
    const authedUser = (req as AuthenticatedRequest).authenticatedUser;

    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required." });
    }
    if (authedUser.id !== userId) {
      return res.status(403).json({ success: false, error: "forbidden" });
    }

    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[delete-account]", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
