import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { classifyGarment } from "./classify-garment";
import { removeBackground } from "./remove-background";
import { supabaseAdmin, supabaseAuth, supabaseAnon } from "./supabase";
import { aiLimiter, bgRemovalLimiter, accountLimiter, authLimiter, resetLimiter, checkAccountLockout, recordFailedAttempt, clearLockout } from "./middleware/rateLimiter";
// P-E: cap simultaneous AI calls so a burst cannot exhaust Gemini quota
// or connections. Extras are queued, not rejected (the rate limiters
// above handle outright rejection). Max 5 concurrent AI invocations.
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

// ─── Input validation helpers ─────────────────────────────────────────────────

/**
 * Loose but sufficient email shape check.  The authoritative validation is
 * Supabase's own; this guard prevents obviously malformed/oversized strings
 * from ever reaching the downstream auth service.
 *
 * Max 254 chars per RFC 5321.  No Unicode normalisation — Supabase handles
 * that.  The regex rejects strings without exactly one @-separated local-part
 * and domain.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254;
/** 128-char ceiling stops timing attacks on pathologically long passwords. */
const MAX_PASSWORD_LEN = 128;
const MIN_PASSWORD_LEN = 8;

function isValidEmail(val: unknown): val is string {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_EMAIL_LEN && EMAIL_REGEX.test(trimmed);
}

function isValidPassword(val: unknown): val is string {
  return (
    typeof val === "string" &&
    val.length >= MIN_PASSWORD_LEN &&
    val.length <= MAX_PASSWORD_LEN
  );
}

/** Return the ALLOWED_RESET_ORIGINS allowlist, or null when not configured. */
function getEnvAllowlist(): string[] | null {
  return process.env.ALLOWED_RESET_ORIGINS
    ? process.env.ALLOWED_RESET_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : null;
}

/**
 * Validates a client-supplied redirect URL.
 *
 * Only accepts HTTPS origins that match either:
 *   (a) the `ALLOWED_RESET_ORIGINS` env allowlist, or
 *   (b) the request's own `Origin` header (same-origin).
 *
 * The pathname must be one of `allowedPaths`.  Anything that fails validation
 * silently falls back to "auracloset://" so callers never receive a crafted
 * open-redirect destination.
 */
function sanitizeRedirectUrl(
  clientRedirectTo: unknown,
  requestOrigin: string | null,
  allowedPaths: string[],
): string {
  if (typeof clientRedirectTo !== "string") return "auracloset://";
  const envAllowlist = getEnvAllowlist();
  try {
    const parsed = new URL(clientRedirectTo);
    const isHttps =
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"));
    const hasAllowedPath = allowedPaths.includes(parsed.pathname);
    const originAllowed = envAllowlist
      ? envAllowlist.includes(parsed.origin)
      : requestOrigin !== null && parsed.origin === new URL(requestOrigin).origin;
    if (isHttps && hasAllowedPath && originAllowed) return clientRedirectTo;
  } catch {
    // Malformed URL — fall through to the native scheme default.
  }
  return "auracloset://";
}

// ─────────────────────────────────────────────────────────────────────────────

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
  app.post("/api/remove-background", bgRemovalLimiter, withAiLimit(removeBackground));

  // ── Sign-in ───────────────────────────────────────────────────────────────
  // Rate-limited (5 req / 15 min per IP) + per-account lockout (5 failures →
  // 15-min cooldown, Postgres-persisted, survives restarts).
  //
  // Error messages are always generic — never reveals whether the email
  // exists or whether the password specifically was wrong.
  app.post("/api/auth/sign-in", authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "invalid_password" });
    }

    const normalizedEmail = (email as string).trim().toLowerCase();

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
        // Generic message — never reveals whether the email exists or whether
        // the password was the problem.
        return res.status(401).json({ error: "invalid_credentials" });
      }
      clearLockout(normalizedEmail);
      return res.json({ session: data.session });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[auth/sign-in]", msg);
      return res.status(500).json({ error: "sign_in_failed" });
    }
  });

  // ── Sign-up ───────────────────────────────────────────────────────────────
  // Rate-limited (same authLimiter: 5 req / 15 min per IP).
  //
  // Always responds with { success: true } regardless of whether the email
  // already exists — prevents email enumeration attacks.  The caller should
  // display a fixed "check your email for a confirmation link" message.
  app.post("/api/auth/sign-up", authLimiter, async (req, res) => {
    const { email, password, emailRedirectTo: clientRedirectTo } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: `Password must be ${MIN_PASSWORD_LEN}–${MAX_PASSWORD_LEN} characters.`,
      });
    }

    const normalizedEmail = (email as string).trim().toLowerCase();
    const requestOrigin =
      typeof req.headers.origin === "string" ? req.headers.origin : null;

    const redirectTo = sanitizeRedirectUrl(
      clientRedirectTo,
      requestOrigin,
      ["/auth/callback"],
    );

    try {
      await supabaseAuth.auth.signUp({
        email: normalizedEmail,
        password: String(password),
        options: { emailRedirectTo: redirectTo },
      });
      // Always return success — never leak Supabase errors (e.g. "User already
      // registered") that would reveal account existence.
      return res.json({ success: true, needsConfirmation: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[auth/sign-up]", msg);
      // Return success even on internal error to prevent enumeration.
      return res.json({ success: true, needsConfirmation: true });
    }
  });

  // ── Password reset ────────────────────────────────────────────────────────
  // Double-gated:
  //   1. authLimiter (5 req / 15 min per IP) — shared with sign-in and
  //      sign-up so exhausting any one auth route applies back-pressure on
  //      the others.  An attacker who burns the sign-in budget cannot
  //      immediately switch to hammering reset-password at full quota.
  //   2. resetLimiter (3 req / hour per IP) — tighter cap specific to the
  //      password-reset flow, independent of the shared counter above.
  //
  // Always returns { success: true } regardless of whether the email is
  // registered — prevents email enumeration.
  app.post("/api/auth/reset-password", authLimiter, resetLimiter, async (req, res) => {
    const { email, redirectTo: clientRedirectTo } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }

    // Honour per-email account lockout: a locked account cannot use the
    // reset-password flow to bypass the sign-in throttle.
    // Return the standard success response to avoid revealing lockout status.
    const normalizedEmail = (email as string).trim().toLowerCase();
    const lockout = checkAccountLockout(normalizedEmail);
    if (lockout.locked) {
      return res.json({ success: true });
    }

    const requestOrigin =
      typeof req.headers.origin === "string" ? req.headers.origin : null;

    const redirectTo = sanitizeRedirectUrl(
      clientRedirectTo,
      requestOrigin,
      ["/auth/update-password"],
    );

    try {
      await supabaseAuth.auth.resetPasswordForEmail(
        (email as string).trim().toLowerCase(),
        { redirectTo }
      );
      // Always return success — never reveal whether the email is registered.
      return res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[auth/reset-password]", msg);
      // Return success even on internal error to prevent enumeration.
      return res.json({ success: true });
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[upgrade-premium]", msg);
      return res.status(500).json({ success: false, error: "upgrade_failed" });
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
      // 1. Delete wardrobe-images storage objects for this user
      const { data: wardrobeFiles } = await supabaseAdmin.storage
        .from("wardrobe-images")
        .list(userId);
      if (wardrobeFiles && wardrobeFiles.length > 0) {
        await supabaseAdmin.storage
          .from("wardrobe-images")
          .remove(wardrobeFiles.map((f) => `${userId}/${f.name}`));
      }

      // 2. Delete tryon-photos storage objects for this user
      const { data: tryonFiles } = await supabaseAdmin.storage
        .from("tryon-photos")
        .list(userId);
      if (tryonFiles && tryonFiles.length > 0) {
        await supabaseAdmin.storage
          .from("tryon-photos")
          .remove(tryonFiles.map((f) => `${userId}/${f.name}`));
      }

      // 3. Explicitly delete all user DB records (defence-in-depth; independent
      //    of whether cascade deletes are configured in the Supabase schema).
      //    Delete child tables before parent tables.
      const userIdTables = [
        "affinity_signals",
        "pair_affinity_signals",
        "rotation_cursors",
        "wear_logs",
        "slot_statuses",
        "tryon_profiles",
        "saved_looks",
        "wardrobe_items",
      ];
      for (const table of userIdTables) {
        const { error: tblErr } = await supabaseAdmin
          .from(table)
          .delete()
          .eq("user_id", userId);
        if (tblErr) {
          // Non-fatal: log and continue so other tables still get cleaned up
          console.warn(`[delete-account] Failed to delete ${table}:`, tblErr.message);
        }
      }
      // user_profiles uses 'id' (not 'user_id') as its PK tied to auth.users.id
      await supabaseAdmin.from("user_profiles").delete().eq("id", userId);

      // 4. Delete the auth user (cascades any remaining references)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
      return res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[delete-account]", msg);
      return res.status(500).json({ success: false, error: "delete_failed" });
    }
  });

  // ─── External account-deletion web resource ──────────────────────────────
  // Required by Google Play policy: a stable, publicly-accessible URL where
  // users can request account deletion. Ownership is verified via a Supabase
  // OTP emailed to the account address before any deletion is performed.

  function readTemplate(name: string): string {
    return fs.readFileSync(
      path.resolve(process.cwd(), "server", "templates", name),
      "utf-8",
    );
  }

  // GET /delete-account — email entry form
  app.get("/delete-account", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(readTemplate("delete-account.html"));
  });

  // POST /api/delete-account-request — send OTP to the supplied email.
  // We always respond with the verify page regardless of whether the email
  // exists in Supabase (avoids user enumeration).
  app.post("/api/delete-account-request", resetLimiter, async (req: Request, res: Response) => {
    const raw = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!isValidEmail(raw)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(400).send(
        readTemplate("delete-account.html").replace(
          'class="error" id="errorMsg">',
          'class="error" id="errorMsg" style="display:block">',
        ),
      );
    }

    // Fire OTP — ignore errors to avoid leaking whether the account exists.
    try {
      await supabaseAnon.auth.signInWithOtp({
        email: raw,
        options: { shouldCreateUser: false },
      });
    } catch {
      // Intentional: silently ignore; always show the verify page.
    }

    // Serve the verify page with the email interpolated.
    const verifyHtml = readTemplate("delete-account-verify.html")
      .replace(/\{\{EMAIL\}\}/g, raw.replace(/"/g, "&quot;").replace(/</g, "&lt;"))
      .replace("{{ERROR_BLOCK}}", "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(verifyHtml);
  });

  // GET /delete-account/verify — direct link fallback (e.g. user bookmarked)
  app.get("/delete-account/verify", (req: Request, res: Response) => {
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
    const verifyHtml = readTemplate("delete-account-verify.html")
      .replace(/\{\{EMAIL\}\}/g, email.replace(/"/g, "&quot;").replace(/</g, "&lt;"))
      .replace("{{ERROR_BLOCK}}", "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(verifyHtml);
  });

  // POST /api/delete-account-confirm — verify OTP then delete the account.
  app.post("/api/delete-account-confirm", accountLimiter, async (req: Request, res: Response) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";

    function renderVerifyError(msg: string): void {
      const errorBlock = `<p class="error-msg">${msg}</p>`;
      const verifyHtml = readTemplate("delete-account-verify.html")
        .replace(/\{\{EMAIL\}\}/g, email.replace(/"/g, "&quot;").replace(/</g, "&lt;"))
        .replace("{{ERROR_BLOCK}}", errorBlock);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(400).send(verifyHtml);
    }

    if (!isValidEmail(email) || !token || !/^\d{6}$/.test(token)) {
      return renderVerifyError("Please enter a valid 6-digit code.");
    }

    // Verify the OTP — this confirms the user owns the email address.
    const { data: verifyData, error: verifyErr } = await supabaseAnon.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (verifyErr || !verifyData?.user) {
      return renderVerifyError(
        "The code is incorrect or has expired. Please request a new one.",
      );
    }

    const userId = verifyData.user.id;

    try {
      // Mirror the in-app deletion flow: storage → DB rows → auth user.
      const { data: wardrobeFiles } = await supabaseAdmin.storage
        .from("wardrobe-images")
        .list(userId);
      if (wardrobeFiles && wardrobeFiles.length > 0) {
        await supabaseAdmin.storage
          .from("wardrobe-images")
          .remove(wardrobeFiles.map((f) => `${userId}/${f.name}`));
      }
      const { data: tryonFiles } = await supabaseAdmin.storage
        .from("tryon-photos")
        .list(userId);
      if (tryonFiles && tryonFiles.length > 0) {
        await supabaseAdmin.storage
          .from("tryon-photos")
          .remove(tryonFiles.map((f) => `${userId}/${f.name}`));
      }
      const userIdTables = [
        "affinity_signals", "pair_affinity_signals", "rotation_cursors",
        "wear_logs", "slot_statuses", "tryon_profiles", "saved_looks", "wardrobe_items",
      ];
      for (const table of userIdTables) {
        await supabaseAdmin.from(table).delete().eq("user_id", userId);
      }
      await supabaseAdmin.from("user_profiles").delete().eq("id", userId);
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteErr) throw new Error(deleteErr.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[delete-account-web]", msg);
      return renderVerifyError(
        "Something went wrong while deleting your account. Please try again or contact support.",
      );
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(readTemplate("delete-account-success.html"));
  });

  // ─────────────────────────────────────────────────────────────────────────

  const httpServer = createServer(app);

  return httpServer;
}
