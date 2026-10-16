import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { classifyGarment } from "./classify-garment";
import { classifyMultiItem } from "./classify-multi-item";
import { removeBackground } from "./remove-background";
import { getAiProcessingState, setAiProcessingState, requireAiProcessingConsent } from "./aiProcessingConsent";
import { supabaseAdmin, supabaseAuth, supabaseAnon } from "./supabase";
import { getUserEntitlement } from "./entitlements";
import {
  normalizeRevenueCatEvent,
  processRevenueCatEvent,
  verifyRevenueCatSignature,
  reconcileRevenueCatCustomer,
  tombstoneBillingAccount,
  hasRevenueCatProductConfiguration,
  recordUnknownRevenueCatEvent,
  isSupportedRevenueCatEventType,
  isRevenueCatBillingEnabled,
  getBillingReadiness,
} from "./billing";
import { reportError } from "../shared/observability";
import {
  aiLimiter,
  bgRemovalLimiter,
  billingReconcileLimiter,
  accountLimiter,
  authLimiter,
  resetLimiter,
  checkAccountLockout,
  recordFailedAttempt,
  clearLockout,
} from "./middleware/rateLimiter";
import { NATIVE_PASSWORD_RECOVERY_URL } from "../lib/oauth-callback";
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

class AccountDeletionError extends Error {
  constructor(readonly stage: string) {
    super(`account deletion failed at ${stage}`);
  }
}

async function deleteAccountData(userId: string): Promise<void> {
  async function checked<T extends { error: { message: string } | null }>(
    stage: string,
    operation: () => PromiseLike<T>,
  ): Promise<T> {
    try {
      const result = await operation();
      if (result.error) throw new AccountDeletionError(stage);
      return result;
    } catch {
      throw new AccountDeletionError(stage);
    }
  }

  // When billing is activated, quarantine its identity before removing
  // profiles/auth rows. This RPC commits separately and is idempotent: a later
  // cleanup failure leaves the account quarantined. Retrying deletion resumes
  // cleanup only; there is deliberately no path that clears the tombstone or
  // restores billing.
  if (isRevenueCatBillingEnabled()) {
    try {
      await tombstoneBillingAccount(userId);
    } catch {
      throw new AccountDeletionError("billing_tombstone");
    }
  }

  // Collect pages before removing objects: deleting while paginating with an
  // offset would shift the remaining pages and leave objects behind.
  for (const bucketName of ["wardrobe-images", "tryon-photos"]) {
    const bucket = supabaseAdmin.storage.from(bucketName);
    const paths: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data } = await checked(`storage_list_${bucketName}`, () =>
        bucket.list(userId, { limit: 100, offset }),
      );
      if (!data) throw new AccountDeletionError(`storage_list_${bucketName}`);
      // These two upload paths are flat. A folder would require recursive
      // cleanup; failing closed avoids falsely claiming it was removed.
      if (data.some(file => !file.id || !file.name)) {
        throw new AccountDeletionError(`storage_list_${bucketName}`);
      }
      paths.push(...data.map(file => `${userId}/${file.name}`));
      if (data.length < 100) break;
    }
    for (let i = 0; i < paths.length; i += 100) {
      await checked(`storage_remove_${bucketName}`, () => bucket.remove(paths.slice(i, i + 100)));
    }
    const { data: remaining } = await checked(`storage_verify_${bucketName}`, () =>
      bucket.list(userId, { limit: 1 }),
    );
    if (!remaining || remaining.length) throw new AccountDeletionError(`storage_verify_${bucketName}`);
  }

  // Child tables precede parents. Repeating a successful delete of zero rows
  // is safe when retrying after a later stage failed.
  const userIdTables = [
    "affinity_signals", "pair_affinity_signals", "rotation_cursors",
    "wear_logs", "slot_statuses", "tryon_profiles", "saved_looks",
    "garment_group_members", "garment_groups", "wardrobe_items",
  ];
  for (const table of userIdTables) {
    await checked(`table_${table}`, () =>
      supabaseAdmin.from(table).delete().eq("user_id", userId),
    );
  }
  await checked("table_user_profiles", () =>
    supabaseAdmin.from("user_profiles").delete().eq("id", userId),
  );
  await checked("auth_delete", () => supabaseAdmin.auth.admin.deleteUser(userId));
}

function logAccountDeletionError(error: unknown, route: string): void {
  const stage = error instanceof AccountDeletionError ? error.stage : "unexpected";
  reportError(error, `account_deletion_${stage}`, { dependency: "supabase", route });
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
 * The pathname must be one of `allowedPaths`. The one expected native deep
 * link is also accepted exactly. An omitted redirect uses the native route;
 * a supplied but invalid redirect is rejected rather than silently changed.
 */
function sanitizeRedirectUrl(
  clientRedirectTo: unknown,
  requestOrigin: string | null,
  allowedPaths: string[],
  nativeFallback: string,
): string | null {
  if (clientRedirectTo === undefined) return nativeFallback;
  if (typeof clientRedirectTo !== "string") return null;
  if (clientRedirectTo === nativeFallback) return clientRedirectTo;
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
  return null;
}

function reportAuthRequestFailure(operation: string, route: string): void {
  // Provider error messages can contain account status or user input.
  reportError(new Error("Auth provider request failed"), operation, {
    dependency: "supabase_auth",
    route,
    category: "external_dependency",
    code: "EXTERNAL_DEPENDENCY_ERROR",
  });
}

// ─────────────────────────────────────────────────────────────────────────────

interface AuthenticatedRequest extends Request {
  authenticatedUser: { id: string; email?: string };
}

export const _testOverrides: {
  authenticatedUser?: { id: string; email?: string };
} = {};

/**
 * Middleware that validates a Bearer token from the Authorization header and
 * attaches the authenticated user to `req.authenticatedUser`.
 *
 * Returns 401 when the header is missing or the token is invalid.
 */
async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (process.env.NODE_ENV === "test" && _testOverrides.authenticatedUser) {
    (req as AuthenticatedRequest).authenticatedUser = _testOverrides.authenticatedUser;
    next();
    return;
  }

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
  app.post("/api/billing/revenuecat/webhook", async (req, res) => {
    const rawBody = (req as Request & { rawBody?: unknown }).rawBody;
    if (!Buffer.isBuffer(rawBody)) return res.status(400).json({ error: "invalid_webhook_body" });
    if (!isRevenueCatBillingEnabled() ||
        !process.env.REVENUECAT_WEBHOOK_SECRET ||
        !hasRevenueCatProductConfiguration()) {
      return res.status(503).json({ error: "billing_configuration_unavailable" });
    }
    const signature = typeof req.headers["x-revenuecat-webhook-signature"] === "string"
      ? req.headers["x-revenuecat-webhook-signature"] : undefined;
    if (!verifyRevenueCatSignature(rawBody, signature)) {
      return res.status(401).json({ error: "invalid_webhook_signature" });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid_webhook_json" });
    }
    const providerEventType = (payload as any)?.event?.type;
    if (typeof providerEventType === "string" &&
        !isSupportedRevenueCatEventType(providerEventType)) {
      try {
        await recordUnknownRevenueCatEvent(payload);
        console.log(JSON.stringify({
          type: "billing_event",
          requestId: res.locals.requestId,
          eventId: (payload as any).event.id,
          eventType: providerEventType,
          result: "ignored",
        }));
        return res.status(200).json({ received: true, status: "ignored" });
      } catch {
        return res.status(503).json({ error: "billing_event_processing_unavailable" });
      }
    }
    const event = normalizeRevenueCatEvent(payload);
    if (!event) return res.status(400).json({ error: "invalid_webhook_event" });
    try {
      const status = await processRevenueCatEvent(event);
      console.log(JSON.stringify({
        type: "billing_event",
        requestId: res.locals.requestId,
        eventId: event.eventId,
        eventType: event.type,
        userId: event.userId,
        result: status,
      }));
      return res.status(200).json({ received: true, status });
    } catch {
      // 5xx requests are retried by RevenueCat; the pending event row is durable.
      reportError(new Error("RevenueCat event processing unavailable"), "billing_event_processing", {
        dependency: "revenuecat",
        route: "/api/billing/revenuecat/webhook",
        requestId: res.locals.requestId,
        category: "external_dependency",
      });
      console.error(JSON.stringify({
        type: "billing_event_failure",
        requestId: res.locals.requestId,
        eventId: event.eventId,
        eventType: event.type,
        userId: event.userId,
        category: "processing_unavailable",
      }));
      return res.status(503).json({ error: "billing_event_processing_unavailable" });
    }
  });

  app.get("/api/user/billing/readiness", requireAuth, async (_req, res) => {
    return res.json(await getBillingReadiness());
  });

  // ── AI endpoints: authentication required ────────────────────────────────
  // Without auth, anyone can exhaust Gemini / Google Vision quota.
  app.post("/api/classify-garment", aiLimiter, requireAuth, requireAiProcessingConsent, withAiLimit(classifyGarment));
  app.post("/api/classify-garments", aiLimiter, requireAuth, requireAiProcessingConsent, withAiLimit(classifyMultiItem));
  app.post("/api/remove-background", bgRemovalLimiter, requireAuth, requireAiProcessingConsent, withAiLimit(removeBackground));

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
        // An unconfirmed account has not reached password verification. Do not
        // let the post-sign-up auto-login count as a failed password attempt.
        if (error.code !== "email_not_confirmed") recordFailedAttempt(normalizedEmail);
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
  // Acknowledgement does not assert creation or email delivery. Provider
  // failures and unknown/existing accounts must remain indistinguishable.
  app.post("/api/auth/sign-up", authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: `Password must be ${MIN_PASSWORD_LEN}–${MAX_PASSWORD_LEN} characters.`,
      });
    }

    try {
      const { error } = await supabaseAuth.auth.signUp({
        email: (email as string).trim().toLowerCase(),
        password: String(password),
      });
      if (error) reportAuthRequestFailure("auth_signup_returned_error", "/api/auth/sign-up");
    } catch {
      reportAuthRequestFailure("auth_signup_exception", "/api/auth/sign-up");
    }
    return res.json({ acknowledged: true });
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
  // Acknowledgement is identical for unknown, locked and provider-failed
  // requests; it never asserts that a recovery email was delivered.
  app.post("/api/auth/reset-password", authLimiter, resetLimiter, async (req, res) => {
    const { email, redirectTo: clientRedirectTo } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }

    const requestOrigin =
      typeof req.headers.origin === "string" ? req.headers.origin : null;
    const redirectTo = sanitizeRedirectUrl(
      clientRedirectTo,
      requestOrigin,
      ["/auth/update-password"],
      NATIVE_PASSWORD_RECOVERY_URL,
    );
    if (!redirectTo) return res.status(400).json({ error: "invalid_redirect" });

    // Honour per-email account lockout: a locked account cannot use the
    // reset-password flow to bypass the sign-in throttle.
    // Return the standard success response to avoid revealing lockout status.
    const normalizedEmail = (email as string).trim().toLowerCase();
    const lockout = checkAccountLockout(normalizedEmail);
    if (lockout.locked) {
      return res.json({ acknowledged: true });
    }

    try {
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(
        (email as string).trim().toLowerCase(),
        { redirectTo }
      );
      if (error) reportAuthRequestFailure("auth_reset_returned_error", "/api/auth/reset-password");
    } catch {
      reportAuthRequestFailure("auth_reset_exception", "/api/auth/reset-password");
    }
    return res.json({ acknowledged: true });
  });

  // ── Account management: authentication + ownership check required ─────────
  // Preference reads happen before each new photo selection and on Profile focus.
  // Do not share the five-per-hour account mutation limiter with reads.
  app.get("/api/user/ai-processing", requireAuth, async (req, res) => {
    try {
      return res.json({ state: await getAiProcessingState((req as AuthenticatedRequest).authenticatedUser.id) });
    } catch {
      return res.status(503).json({ error: "ai_processing_preference_unavailable" });
    }
  });

  app.put("/api/user/ai-processing", accountLimiter, requireAuth, async (req, res) => {
    const state = req.body?.state;
    if (state !== "allowed" && state !== "declined") {
      return res.status(400).json({ error: "invalid_ai_processing_preference" });
    }
    try {
      await setAiProcessingState((req as AuthenticatedRequest).authenticatedUser.id, state);
      return res.json({ state });
    } catch {
      return res.status(503).json({ error: "ai_processing_preference_unavailable" });
    }
  });

  app.get("/api/user/entitlements", requireAuth, async (req, res) => {
    const authedUser = (req as AuthenticatedRequest).authenticatedUser;

    try {
      return res.json(await getUserEntitlement(authedUser.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[entitlements]", msg);
      return res.status(500).json({ error: "entitlements_unavailable" });
    }
  });

  // Authenticated clients can request a provider reconciliation after a
  // purchase/restore, but the user ID is always taken from validated auth.
  app.post("/api/user/entitlements/reconcile", requireAuth, billingReconcileLimiter, async (req, res) => {
    try {
      const state = await reconcileRevenueCatCustomer(
        (req as AuthenticatedRequest).authenticatedUser.id,
      );
      return res.json(state);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : "";
      const status = code === "revenuecat_wrong_account"
        ? 409
        : code === "revenuecat_server_configuration_unavailable" ? 503 : 502;
      return res.status(status).json({
        error: status === 503
          ? "billing_configuration_unavailable"
          : status === 409 ? "billing_wrong_account" : "billing_reconciliation_unavailable",
      });
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
      await deleteAccountData(userId);
      return res.json({ success: true });
    } catch (err: unknown) {
      logAccountDeletionError(err, "/api/user/delete-account");
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
      await deleteAccountData(userId);
    } catch (err: unknown) {
      logAccountDeletionError(err, "/api/delete-account-confirm");
      const billingQuarantined = isRevenueCatBillingEnabled() &&
        !(err instanceof AccountDeletionError && err.stage === "billing_tombstone");
      const retryPolicy = billingQuarantined
        ? " Billing access remains quarantined; a retry completes only deletion and never restores billing."
        : "";
      return renderVerifyError(
        `Account deletion could not be completed. Some data may already have been removed.${retryPolicy} Please request a new code to retry deletion or contact support.`,
      );
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(readTemplate("delete-account-success.html"));
  });

  // ─────────────────────────────────────────────────────────────────────────

  const httpServer = createServer(app);

  return httpServer;
}
