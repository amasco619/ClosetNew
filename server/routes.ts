import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { classifyGarment } from "./classify-garment";
import { extractColor } from "./extract-color";
import { removeBackground } from "./remove-background";
import { supabaseAdmin, supabaseAuth } from "./supabase";
import { aiLimiter, bgRemovalLimiter, colorLimiter, accountLimiter, authLimiter, resetLimiter, checkAccountLockout, recordFailedAttempt, clearLockout } from "./middleware/rateLimiter";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/classify-garment", aiLimiter, classifyGarment);
  app.post("/api/extract-color", colorLimiter, extractColor);
  app.post("/api/remove-background", bgRemovalLimiter, removeBackground);

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

    // Determine the allowed set of web origins.
    // ALLOWED_RESET_ORIGINS is a comma-separated list of exact origins
    // (e.g. "https://auracloset.app,http://localhost:8081").  When unset the
    // server falls back to comparing against the browser-supplied Origin header.
    const envAllowlist = process.env.ALLOWED_RESET_ORIGINS
      ? process.env.ALLOWED_RESET_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
      : null;

    let redirectTo = "auracloset://";
    if (typeof clientRedirectTo === "string") {
      try {
        const parsed = new URL(clientRedirectTo);
        // https is required in production; http is permitted only for localhost dev.
        const isHttps =
          parsed.protocol === "https:" ||
          (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"));
        // Path must be exactly /auth/update-password to prevent token delivery to arbitrary paths.
        const hasCorrectPath = parsed.pathname === "/auth/update-password";

        // Origin allowlist check — prefer the explicit env allowlist; fall back to
        // matching the browser-set Origin header (cannot be forged by page JS in a
        // same-site request).
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

  app.post("/api/user/upgrade-premium", accountLimiter, async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required." });
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

  app.delete("/api/user/delete-account", accountLimiter, async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required." });
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
