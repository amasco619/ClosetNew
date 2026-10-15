import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import express from "express";
import request from "supertest";
import {
  NATIVE_EMAIL_CONFIRMATION_URL,
  NATIVE_PASSWORD_RECOVERY_URL,
} from "../lib/oauth-callback";

const PASSWORD = "correct-horse-battery";
const ALLOWED_ORIGIN = "https://app.example.test";
const PROVIDER_ERROR = "provider-secret-error-must-not-escape";
let registerRoutes: typeof import("../server/routes").registerRoutes;
let supabaseAuth: typeof import("../server/supabase").supabaseAuth;
let __resetForTesting: typeof import("../server/middleware/rateLimiter").__resetForTesting;
let checkAccountLockout: typeof import("../server/middleware/rateLimiter").checkAccountLockout;
let recordFailedAttempt: typeof import("../server/middleware/rateLimiter").recordFailedAttempt;

let ipCounter = 1;
const ipRun = randomInt(1, 255);
function uniqueIp(): string {
  // Every assertion gets its own limiter bucket.  The only intentionally
  // repeated IP in this file is the explicit limiter test.
  return `198.${ipRun}.${Math.floor(ipCounter / 254) + 1}.${(ipCounter++ % 254) + 1}`;
}

async function makeApp() {
  __resetForTesting();
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  await registerRoutes(app);
  return app;
}

function post(app: express.Express, path: string, body: any, origin?: string) {
  let req = request(app).post(path).set("X-Forwarded-For", uniqueIp()).send(body);
  if (origin !== undefined) req = req.set("Origin", origin);
  return req;
}

async function main() {
  // Import the real mounted limiters only after disabling their DB persistence.
  // Otherwise this test writes synthetic counters/lockouts to the live dev DB.
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const [routes, auth, limiter] = await Promise.all([
    import("../server/routes"),
    import("../server/supabase"),
    import("../server/middleware/rateLimiter"),
  ]);
  registerRoutes = routes.registerRoutes;
  supabaseAuth = auth.supabaseAuth;
  ({ __resetForTesting, checkAccountLockout, recordFailedAttempt } = limiter);
  const originalSignUp = supabaseAuth.auth.signUp;
  const originalSignIn = supabaseAuth.auth.signInWithPassword;
  const originalReset = supabaseAuth.auth.resetPasswordForEmail;
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => logs.push(args);
  process.env.ALLOWED_RESET_ORIGINS = ALLOWED_ORIGIN;

  try {
    const app = await makeApp();

    // AUTH-2: the public contract is identical for provider success, a
    // provider-returned error, and a provider exception.
    for (const outcome of ["success", "returned-error", "throws"] as const) {
      Reflect.set(supabaseAuth.auth, "signUp", async () => {
        if (outcome === "throws") throw new Error(PROVIDER_ERROR);
        if (outcome === "returned-error") return {
          data: { user: null, session: null },
          error: { message: PROVIDER_ERROR },
        };
        return { data: { user: null, session: null }, error: null };
      });
      const res = await post(app, "/api/auth/sign-up", {
        email: `signup-${outcome}@example.com`,
        password: PASSWORD,
      }, ALLOWED_ORIGIN);
      assert.equal(res.status, 200, `sign-up ${outcome} status`);
      assert.deepEqual(res.body, {
        acknowledged: true,
        needsConfirmation: true,
      }, `sign-up ${outcome} contract`);
      assert.doesNotMatch(res.text, new RegExp(PROVIDER_ERROR));
    }

    for (const outcome of ["success", "returned-error", "throws"] as const) {
      Reflect.set(supabaseAuth.auth, "resetPasswordForEmail", async () => {
        if (outcome === "throws") throw new Error(PROVIDER_ERROR);
        if (outcome === "returned-error") return { data: null, error: { message: PROVIDER_ERROR } };
        return { data: {}, error: null };
      });
      const res = await post(app, "/api/auth/reset-password", {
        email: `reset-${outcome}@example.com`,
      }, ALLOWED_ORIGIN);
      assert.equal(res.status, 200, `reset ${outcome} status`);
      assert.deepEqual(res.body, { acknowledged: true }, `reset ${outcome} contract`);
      assert.doesNotMatch(res.text, new RegExp(PROVIDER_ERROR));
    }

    // Provider diagnostics may identify the route/outcome, but never contain
    // provider text (including text from a thrown Error).
    assert.equal(logs.some(args => args.some(value => String(value).includes(PROVIDER_ERROR))), false);
    assert.ok(logs.length >= 2, "provider failures remain observable");
    assert.ok(logs.every(args => args.some(value => /auth\/(sign-up|reset-password)/.test(String(value)))),
      "auth diagnostics include safe route metadata");

    // Validation runs before either provider is touched.
    let providerCalls = 0;
    Reflect.set(supabaseAuth.auth, "signUp", async () => {
      providerCalls++;
      return { data: null, error: null };
    });
    const invalid = await post(app, "/api/auth/sign-up", { email: "not-an-email", password: PASSWORD });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "invalid_email");
    assert.equal(providerCalls, 0);
    const shortPassword = await post(app, "/api/auth/sign-up", { email: "valid@example.com", password: "short" });
    assert.equal(shortPassword.status, 400);
    assert.equal(providerCalls, 0);

    // Redirect policy: allowlisted web links work; native links are accepted
    // without an Origin; web links without Origin and untrusted Origins fail
    // closed rather than silently falling back to a native redirect.
    Reflect.set(supabaseAuth.auth, "signUp", async () => ({ data: null, error: null }));
    let signupOptions: any;
    Reflect.set(supabaseAuth.auth, "signUp", async (args: any) => {
      signupOptions = args;
      return { data: null, error: null };
    });
    let resetOptions: any;
    Reflect.set(supabaseAuth.auth, "resetPasswordForEmail", async (_email: string, options: any) => {
      resetOptions = options;
      return { data: null, error: null };
    });
    const allowed = await post(app, "/api/auth/sign-up", {
      email: "redirect@example.com", password: PASSWORD,
      emailRedirectTo: `${ALLOWED_ORIGIN}/auth/callback`,
    }, ALLOWED_ORIGIN);
    assert.equal(allowed.status, 200);
    assert.equal(signupOptions.options.emailRedirectTo, `${ALLOWED_ORIGIN}/auth/callback`);
    const nativeSignup = await post(app, "/api/auth/sign-up", {
      email: "native@example.com", password: PASSWORD,
      emailRedirectTo: NATIVE_EMAIL_CONFIRMATION_URL,
    });
    assert.equal(nativeSignup.status, 200);
    assert.equal(signupOptions.options.emailRedirectTo, NATIVE_EMAIL_CONFIRMATION_URL);
    const missingOrigin = await post(app, "/api/auth/sign-up", {
      email: "missing-origin@example.com", password: PASSWORD,
      emailRedirectTo: `${ALLOWED_ORIGIN}/auth/callback`,
    });
    assert.equal(missingOrigin.status, 200, "configured allowlist works without Origin");
    delete process.env.ALLOWED_RESET_ORIGINS;
    const missingUnlistedOrigin = await post(app, "/api/auth/sign-up", {
      email: "missing-unlisted-origin@example.com", password: PASSWORD,
      emailRedirectTo: `${ALLOWED_ORIGIN}/auth/callback`,
    });
    assert.equal(missingUnlistedOrigin.status, 400);
    assert.equal(missingUnlistedOrigin.body.error, "invalid_redirect");
    process.env.ALLOWED_RESET_ORIGINS = ALLOWED_ORIGIN;
    const untrusted = await post(app, "/api/auth/reset-password", {
      email: "untrusted@example.com",
      redirectTo: "https://evil.example/auth/update-password",
    }, "https://evil.example");
    assert.equal(untrusted.status, 400);
    assert.equal(untrusted.body.error, "invalid_redirect");
    const nativeReset = await post(app, "/api/auth/reset-password", {
      email: "native-reset@example.com", redirectTo: NATIVE_PASSWORD_RECOVERY_URL,
    });
    assert.equal(nativeReset.status, 200);
    assert.equal(resetOptions.redirectTo, NATIVE_PASSWORD_RECOVERY_URL);

    // The real account lockout helpers gate reset before Supabase is called.
    const lockedEmail = "locked-reset@example.com";
    for (let i = 0; i < 5; i++) recordFailedAttempt(lockedEmail);
    assert.equal(checkAccountLockout(lockedEmail).locked, true);
    let resetCalls = 0;
    Reflect.set(supabaseAuth.auth, "resetPasswordForEmail", async () => {
      resetCalls++;
      return { data: null, error: null };
    });
    const locked = await post(app, "/api/auth/reset-password", { email: lockedEmail });
    assert.equal(locked.status, 200);
    assert.deepEqual(locked.body, { acknowledged: true });
    assert.equal(resetCalls, 0);
    const lockedInvalidRedirect = await post(app, "/api/auth/reset-password", {
      email: lockedEmail, redirectTo: "https://evil.example/auth/update-password",
    });
    const unlockedInvalidRedirect = await post(app, "/api/auth/reset-password", {
      email: "unlocked-reset@example.com", redirectTo: "https://evil.example/auth/update-password",
    });
    assert.equal(lockedInvalidRedirect.status, 400);
    assert.deepEqual(lockedInvalidRedirect.body, unlockedInvalidRedirect.body,
      "redirect validation must not reveal whether an address is locked");

    const unconfirmedEmail = "unconfirmed-signup@example.com";
    Reflect.set(supabaseAuth.auth, "signInWithPassword", async () => ({
      data: { user: null, session: null },
      error: { code: "email_not_confirmed", message: "Email not confirmed" },
    }));
    for (let i = 0; i < 5; i++) {
      const unconfirmed = await post(app, "/api/auth/sign-in", {
        email: unconfirmedEmail, password: PASSWORD,
      });
      assert.equal(unconfirmed.status, 401);
      assert.equal(unconfirmed.body.error, "invalid_credentials");
    }
    assert.equal(checkAccountLockout(unconfirmedEmail).locked, false,
      "unconfirmed sign-in attempts do not count as failed password guesses");

    // Actual auth + reset limiters remain mounted (six requests from one IP).
    const limiterIp = `203.${ipRun}.113.77`;
    for (let i = 0; i < 5; i++) {
      const response = await request(app).post("/api/auth/sign-up")
        .set("X-Forwarded-For", limiterIp)
        .send({ email: `limit-${i}@example.com`, password: PASSWORD });
      assert.notEqual(response.status, 429);
    }
    const limited = await request(app).post("/api/auth/sign-up")
      .set("X-Forwarded-For", limiterIp)
      .send({ email: "limit-final@example.com", password: PASSWORD });
    assert.equal(limited.status, 429, "auth limiter is mounted");
    const resetLimiterIp = `203.${ipRun}.113.78`;
    for (let i = 0; i < 3; i++) {
      const response = await request(app).post("/api/auth/reset-password")
        .set("X-Forwarded-For", resetLimiterIp)
        .send({ email: `reset-limit-${i}@example.com` });
      assert.notEqual(response.status, 429);
    }
    const resetLimited = await request(app).post("/api/auth/reset-password")
      .set("X-Forwarded-For", resetLimiterIp)
      .send({ email: "reset-limit-final@example.com" });
    assert.equal(resetLimited.status, 429, "reset limiter is mounted");

    const sharedIp = `203.${ipRun}.114.79`;
    for (let i = 0; i < 5; i++) {
      const response = await request(app).post("/api/auth/sign-in")
        .set("X-Forwarded-For", sharedIp).send({ email: "invalid", password: PASSWORD });
      assert.equal(response.status, 400);
    }
    const sharedBlocked = await request(app).post("/api/auth/reset-password")
      .set("X-Forwarded-For", sharedIp).send({ email: "shared-budget@example.com" });
    assert.equal(sharedBlocked.status, 429, "actual sign-in traffic consumes reset's shared auth budget");
  } finally {
    Reflect.set(supabaseAuth.auth, "signUp", originalSignUp);
    Reflect.set(supabaseAuth.auth, "signInWithPassword", originalSignIn);
    Reflect.set(supabaseAuth.auth, "resetPasswordForEmail", originalReset);
    console.error = originalError;
    delete process.env.ALLOWED_RESET_ORIGINS;
    __resetForTesting();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
}

void main();