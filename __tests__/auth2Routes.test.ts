import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import express from "express";
import request from "supertest";
import {
  NATIVE_PASSWORD_RECOVERY_URL,
} from "../lib/oauth-callback";

const PASSWORD = "correct-horse-battery";
const ALLOWED_ORIGIN = "https://app.example.test";
const PROVIDER_ERROR = "provider-secret-error-must-not-escape";
let registerRoutes: typeof import("../server/routes").registerRoutes;
let supabaseAuth: typeof import("../server/supabase").supabaseAuth;

let areSupabaseProjectUrlsAligned: typeof import("../server/supabase").areSupabaseProjectUrlsAligned;
let __resetForTesting: typeof import("../server/middleware/rateLimiter").__resetForTesting;
let checkAccountLockout: typeof import("../server/middleware/rateLimiter").checkAccountLockout;
let recordFailedAttempt: typeof import("../server/middleware/rateLimiter").recordFailedAttempt;
let storeTestOverrides: typeof import("../server/middleware/rateLimiter").__storeOverrides;

let ipCounter = 1;
const ipRun = randomInt(1, 255);
function makeRateLimitClient() {
  const counts = new Map<string, number>();
  return {
    rpc: async (_name: string, args: { p_key: string; p_window_ms?: number }) => {
      const hits = (counts.get(args.p_key) ?? 0) + 1;
      counts.set(args.p_key, hits);
      return {
        data: [{
          hits,
          reset_time_ms: Date.now() + (args.p_window_ms ?? 60_000),
        }],
        error: null,
      };
    },
    from: () => ({
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  } as any;
}

function uniqueIp(): string {
  // Every assertion gets its own limiter bucket.  The only intentionally
  // repeated IP in this file is the explicit limiter test.
  return `198.${ipRun}.${Math.floor(ipCounter / 254) + 1}.${(ipCounter++ % 254) + 1}`;
}

async function makeApp() {
  __resetForTesting();
  storeTestOverrides.client = makeRateLimitClient();
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
  // Use an isolated fake RPC/table client so this route test never writes to Supabase.
  const [routes, auth, limiter] = await Promise.all([
    import("../server/routes"),
    import("../server/supabase"),
    import("../server/middleware/rateLimiter"),
  ]);
  registerRoutes = routes.registerRoutes;
  supabaseAuth = auth.supabaseAuth;
  ({ areSupabaseProjectUrlsAligned, isSelectedSupabaseProjectUrl } = auth);
  ({ __resetForTesting, checkAccountLockout, recordFailedAttempt, __storeOverrides: storeTestOverrides } = limiter);
  assert.equal(
    (supabaseAuth as unknown as { supabaseKey?: string }).supabaseKey ===
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    true,
    "server user-auth proxy uses the publishable key",
  );
  assert.equal(
    areSupabaseProjectUrlsAligned(
      "https://garppyocfgdamdgfyfbr.supabase.co/",
      "https://garppyocfgdamdgfyfbr.supabase.co",
    ),
    true,
    "server and client URLs for the same project align",
  );
  assert.equal(
    areSupabaseProjectUrlsAligned(
      "https://server-project.supabase.co",
      "https://client-project.supabase.co",
    ),
    false,
    "server/client URL mismatch is detectable",
  );
  assert.equal(
    areSupabaseProjectUrlsAligned(
      "https://garppyocfgdamdgfyfbr.supabase.co/auth/v1",
      "https://garppyocfgdamdgfyfbr.supabase.co/auth/v1",
    ),
    false,
    "service paths are not valid Supabase project base URLs",
  );
  assert.equal(
    isSelectedSupabaseProjectUrl("https://garppyocfgdamdgfyfbr.supabase.co"),
    true,
    "selected Production project is recognized",
  );
  assert.equal(
    isSelectedSupabaseProjectUrl("https://other-project.supabase.co"),
    false,
    "other Supabase projects are not mistaken for the selected target",
  );
  assert.equal(
    isSelectedSupabaseProjectUrl("https://garppyocfgdamdgfyfbr.supabase.co/rest/v1"),
    false,
    "the selected project URL must not include an API path",
  );
  const originalSignUp = supabaseAuth.auth.signUp;
  const originalSignIn = supabaseAuth.auth.signInWithPassword;
  const originalReset = supabaseAuth.auth.resetPasswordForEmail;
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => logs.push(args);
  process.env.ALLOWED_RESET_ORIGINS = ALLOWED_ORIGIN;

  try {
    const app = await makeApp();

    // Only known provider duplicate-email responses disclose account_exists;
    // all other provider failures must not be acknowledged as success.
    for (const outcome of ["success", "email-duplicate", "user-duplicate", "throws"] as const) {
      Reflect.set(supabaseAuth.auth, "signUp", async () => {
        if (outcome === "throws") throw new Error(PROVIDER_ERROR);
        if (outcome === "email-duplicate" || outcome === "user-duplicate") return {
          data: { user: null, session: null },
          error: Object.assign(new Error(PROVIDER_ERROR), {
            code: outcome === "email-duplicate" ? "email_exists" : "user_already_exists",
            status: 422,
          }),
        };
        return { data: { user: null, session: null }, error: null };
      });
      const res = await post(app, "/api/auth/sign-up", {
        email: `signup-${outcome}@example.com`,
        password: PASSWORD,
      }, ALLOWED_ORIGIN);
      if (outcome === "throws") {
        assert.equal(res.status, 503, "provider exceptions are reported as a temporary service failure");
        assert.match(res.body.error, /temporarily unavailable/);
      } else if (outcome === "email-duplicate" || outcome === "user-duplicate") {
        assert.equal(res.status, 409, `sign-up ${outcome} status`);
        assert.deepEqual(res.body, { success: false, reason: "account_exists" },
          `sign-up ${outcome} discloses only the approved duplicate reason`);
      } else {
        assert.equal(res.status, 200, `sign-up ${outcome} status`);
        assert.deepEqual(res.body, { acknowledged: true }, `sign-up ${outcome} contract`);
      }
      assert.doesNotMatch(res.text, new RegExp(PROVIDER_ERROR));
    }

    Reflect.set(supabaseAuth.auth, "signUp", async () => ({
      data: { user: null, session: null },
      error: Object.assign(new Error(PROVIDER_ERROR), {
        code: "weak_password",
        status: 422,
      }),
    }));
    const rejectedSignup = await post(app, "/api/auth/sign-up", {
      email: "rejected-signup@example.com",
      password: PASSWORD,
    }, ALLOWED_ORIGIN);
    assert.equal(rejectedSignup.status, 400,
      "known provider validation rejections do not masquerade as successful signup");
    assert.doesNotMatch(rejectedSignup.text, new RegExp(PROVIDER_ERROR));

    Reflect.set(supabaseAuth.auth, "signUp", async () => ({
      data: { user: null, session: null },
      error: Object.assign(new Error(PROVIDER_ERROR), {
        code: "weak_password",
        status: 422,
      }),
    }));
    const weakPasswordSignup = await post(app, "/api/auth/sign-up", {
      email: "weak-password-signup@example.com",
      password: PASSWORD,
    }, ALLOWED_ORIGIN);
    assert.equal(weakPasswordSignup.status, 400);
    assert.deepEqual(weakPasswordSignup.body, { error: "weak_password" },
      "known provider password rejection maps to a stable code");

    Reflect.set(supabaseAuth.auth, "signUp", async () => ({
      data: { user: null, session: null },
      error: new Error(PROVIDER_ERROR),
    }));
    const unclassifiedSignupError = await post(app, "/api/auth/sign-up", {
      email: "unclassified-signup@example.com",
      password: PASSWORD,
    }, ALLOWED_ORIGIN);
    assert.equal(unclassifiedSignupError.status, 503,
      "an unclassified provider error is never acknowledged as successful signup");
    assert.match(unclassifiedSignupError.body.error, /temporarily unavailable/);
    assert.doesNotMatch(unclassifiedSignupError.text, new RegExp(PROVIDER_ERROR));

    Reflect.set(supabaseAuth.auth, "signUp", async () => ({
      data: { user: null, session: null },
      error: Object.assign(new Error(PROVIDER_ERROR), {
        code: "over_request_rate_limit",
        status: 429,
      }),
    }));
    const rateLimitedSignup = await post(app, "/api/auth/sign-up", {
      email: "rate-limited-signup@example.com",
      password: PASSWORD,
    }, ALLOWED_ORIGIN);
    assert.equal(rateLimitedSignup.status, 503, "provider rate limits do not masquerade as successful sign-up");
    assert.doesNotMatch(rateLimitedSignup.text, new RegExp(PROVIDER_ERROR));

    Reflect.set(supabaseAuth.auth, "signUp", async () => ({
      data: { user: null, session: null },
      error: Object.assign(new Error(PROVIDER_ERROR), {
        code: "invalid_api_key",
        status: 401,
      }),
    }));
    const invalidKeySignup = await post(app, "/api/auth/sign-up", {
      email: "invalid-key-signup@example.com",
      password: PASSWORD,
    }, ALLOWED_ORIGIN);
    assert.equal(invalidKeySignup.status, 503, "invalid project keys are not acknowledged as successful sign-ups");
    assert.doesNotMatch(invalidKeySignup.text, new RegExp(PROVIDER_ERROR));

    Reflect.set(supabaseAuth.auth, "signUp", async () => ({
      data: { user: null, session: null },
      error: Object.assign(new Error(PROVIDER_ERROR), {
        code: "not_found",
        status: 404,
      }),
    }));
    const missingEndpointSignup = await post(app, "/api/auth/sign-up", {
      email: "missing-endpoint-signup@example.com",
      password: PASSWORD,
    }, ALLOWED_ORIGIN);
    assert.equal(missingEndpointSignup.status, 503, "provider 404s are not acknowledged as successful sign-ups");
    assert.doesNotMatch(missingEndpointSignup.text, new RegExp(PROVIDER_ERROR));

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
    assert.ok(logs.length >= 5, "provider failures remain observable");
    assert.ok(logs.every(args => args.some(value => /auth\/(sign-up|reset-password)/.test(String(value)))),
      "auth diagnostics include safe route metadata");
    const serializedAuthLogs = JSON.stringify(logs);
    assert.match(serializedAuthLogs, /over_request_rate_limit/, "safe provider error codes are recorded");
    assert.match(serializedAuthLogs, /invalid_api_key/, "key errors are recorded without key material");
    assert.match(serializedAuthLogs, /not_found/, "provider endpoint codes are recorded safely");
    assert.doesNotMatch(serializedAuthLogs, new RegExp(PROVIDER_ERROR), "provider messages are never recorded");

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

    // Signup needs no redirect while email confirmation is disabled.
    Reflect.set(supabaseAuth.auth, "signUp", async () => ({ data: null, error: null }));
    let signupOptions: any;
    Reflect.set(supabaseAuth.auth, "signUp", async (args: any) => {
      signupOptions = args;
      return { data: null, error: null };
    });
    const redirectFreeSignup = await post(app, "/api/auth/sign-up", {
      email: "signup@example.com", password: PASSWORD,
    }, ALLOWED_ORIGIN);
    assert.equal(redirectFreeSignup.status, 200);
    assert.deepEqual(signupOptions, {
      email: "signup@example.com",
      password: PASSWORD,
    }, "does not pass emailRedirectTo to Supabase");

    let resetOptions: any;
    Reflect.set(supabaseAuth.auth, "resetPasswordForEmail", async (_email: string, options: any) => {
      resetOptions = options;
      return { data: null, error: null };
    });
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

    Reflect.set(supabaseAuth.auth, "signInWithPassword", async () => ({
      data: { user: null, session: null },
      error: Object.assign(new Error(PROVIDER_ERROR), {
        code: "unexpected_failure",
        status: 503,
      }),
    }));
    const unavailableEmail = "auth-provider-down@example.com";
    const unavailable = await post(app, "/api/auth/sign-in", {
      email: unavailableEmail, password: PASSWORD,
    });
    assert.equal(unavailable.status, 503, "provider outages are not returned as invalid credentials");
    assert.equal(checkAccountLockout(unavailableEmail).locked, false,
      "provider outages do not consume account lockout attempts");

    Reflect.set(supabaseAuth.auth, "signInWithPassword", async () => ({
      data: { user: null, session: null },
      error: new Error(PROVIDER_ERROR),
    }));
    const unclassifiedEmail = "auth-unclassified-error@example.com";
    const unclassified = await post(app, "/api/auth/sign-in", {
      email: unclassifiedEmail, password: PASSWORD,
    });
    assert.equal(unclassified.status, 503,
      "unclassified provider errors are not reported as invalid credentials");
    assert.equal(checkAccountLockout(unclassifiedEmail).locked, false,
      "unclassified provider errors do not consume account lockout attempts");

    Reflect.set(supabaseAuth.auth, "signInWithPassword", async () => ({
      data: { user: null, session: null },
      error: Object.assign(new Error(PROVIDER_ERROR), {
        code: "invalid_api_key",
        status: 401,
      }),
    }));
    const invalidKeyEmail = "auth-invalid-key@example.com";
    const invalidKeySignIn = await post(app, "/api/auth/sign-in", {
      email: invalidKeyEmail, password: PASSWORD,
    });
    assert.equal(invalidKeySignIn.status, 503, "invalid project key is not reported as a bad password");
    assert.equal(checkAccountLockout(invalidKeyEmail).locked, false,
      "invalid project keys do not consume account lockout attempts");

    Reflect.set(supabaseAuth.auth, "signInWithPassword", async () => ({
      data: { user: null, session: null },
      error: Object.assign(new Error(PROVIDER_ERROR), {
        code: "not_found",
        status: 404,
      }),
    }));
    const missingEndpointEmail = "auth-endpoint-missing@example.com";
    const missingEndpointSignIn = await post(app, "/api/auth/sign-in", {
      email: missingEndpointEmail, password: PASSWORD,
    });
    assert.equal(missingEndpointSignIn.status, 503, "provider 404s are not reported as invalid credentials");
    assert.equal(checkAccountLockout(missingEndpointEmail).locked, false,
      "provider 404s do not consume account lockout attempts");

    const invalidCredentialsEmail = "wrong-password@example.com";
    Reflect.set(supabaseAuth.auth, "signInWithPassword", async () => ({
      data: { user: null, session: null },
      error: Object.assign(new Error("Invalid login credentials"), {
        code: "invalid_credentials",
        status: 400,
      }),
    }));
    for (let i = 0; i < 5; i++) {
      const invalidCredentials = await post(app, "/api/auth/sign-in", {
        email: invalidCredentialsEmail, password: PASSWORD,
      });
      assert.equal(invalidCredentials.status, 401);
      assert.equal(invalidCredentials.body.error, "invalid_credentials");
    }
    const unknownEmailSignIn = await post(app, "/api/auth/sign-in", {
      email: "unknown-account@example.com", password: PASSWORD,
    });
    assert.equal(unknownEmailSignIn.status, 401);
    assert.deepEqual(unknownEmailSignIn.body, { error: "invalid_credentials" },
      "unknown email and wrong password remain indistinguishable");
    assert.equal(checkAccountLockout(invalidCredentialsEmail).locked, true,
      "invalid credentials still trigger the per-account lockout");

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
  }
}

void main();

let isSelectedSupabaseProjectUrl: typeof import("../server/supabase").isSelectedSupabaseProjectUrl;
