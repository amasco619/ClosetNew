/**
 * Integration tests for the express-rate-limit middleware objects defined in
 * server/middleware/rateLimiter.ts.
 *
 * Tests import LIMITER_CONFIGS and makeLimiterHandler directly from the production
 * module, then construct fresh rateLimit() instances from those real values for
 * each test section.  This means any change to windowMs, max, or the handler in
 * production will automatically propagate here — a misconfiguration that ships
 * in rateLimiter.ts will fail these tests before reaching production.
 *
 * Fresh instances are used (instead of the exported singletons) so that the
 * in-memory MemoryStore of each limiter is isolated between test sections.
 *
 * Run: `npx tsx __tests__/rateLimiter.test.ts`
 * Exits non-zero on any failed assertion.
 */

import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

import {
  LIMITER_CONFIGS,
  makeLimiterHandler,
  PgRateLimitStore,
  __makeStoreForTesting,
  __resetForTesting,
} from "../server/middleware/rateLimiter";

// ── Assertion harness (same pattern as other test files) ──────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function section(name: string): void {
  console.log(`\n${name}:`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app with a single POST /test route protected by the
 * given limiter.  The upstream handler returns 200 so we can distinguish
 * "allowed by limiter" from "blocked by limiter".
 */
function buildApp(limiter: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.post("/test", limiter, (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

/**
 * Send `count` sequential POST requests to /test on the given app and return
 * the array of HTTP status codes received.
 */
async function sendRequests(app: express.Application, count: number): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    const res = await request(app).post("/test").send({});
    statuses.push(res.status);
  }
  return statuses;
}

/**
 * Build a fresh rateLimit() instance using values sourced directly from
 * LIMITER_CONFIGS and the production handler factory.
 * "Fresh" means its MemoryStore is empty — no state from other test sections.
 */
function freshLimiter(key: keyof typeof LIMITER_CONFIGS): express.RequestHandler {
  return rateLimit({
    ...LIMITER_CONFIGS[key],
    standardHeaders: true,
    legacyHeaders: true,
    handler: makeLimiterHandler(),
  });
}

/**
 * Core assertion: drive a fresh limiter up to its limit, then verify the
 * (max+1)-th request is blocked with 429 + the expected response shape.
 */
async function assertLimiterBlocks(key: keyof typeof LIMITER_CONFIGS): Promise<void> {
  const { max } = LIMITER_CONFIGS[key];
  const limiter = freshLimiter(key);
  const app = buildApp(limiter);

  const preLimitStatuses = await sendRequests(app, max);
  assert(
    preLimitStatuses.every((s) => s !== 429),
    `${key}: first ${max} requests are not blocked`
  );

  const blocked = await request(app).post("/test").send({});

  assert(blocked.status === 429, `${key}: request ${max + 1} returns 429`);

  const retryAfter = blocked.headers["retry-after"];
  assert(
    typeof retryAfter === "string" && /^\d+$/.test(retryAfter) && parseInt(retryAfter, 10) >= 1,
    `${key}: Retry-After header is a positive integer ("${retryAfter}")`
  );

  assert(
    blocked.body?.error === "rate_limit",
    `${key}: body.error === "rate_limit"`
  );

  assert(
    typeof blocked.body?.retryAfter === "number" && blocked.body.retryAfter >= 1,
    `${key}: body.retryAfter is a positive number`
  );
}

// ── Main (async wrapper required for top-level await under CJS/tsx) ───────────

(async () => {
  // ── Per-limiter blocking + response-shape tests ─────────────────────────────

  section(`authLimiter — ${LIMITER_CONFIGS.authLimiter.max} req / ${LIMITER_CONFIGS.authLimiter.windowMs / 60000} min window`);
  await assertLimiterBlocks("authLimiter");

  section(`accountLimiter — ${LIMITER_CONFIGS.accountLimiter.max} req / ${LIMITER_CONFIGS.accountLimiter.windowMs / 60000} min window`);
  await assertLimiterBlocks("accountLimiter");

  section(`aiLimiter — ${LIMITER_CONFIGS.aiLimiter.max} req / ${LIMITER_CONFIGS.aiLimiter.windowMs / 1000} sec window`);
  await assertLimiterBlocks("aiLimiter");

  section(`colorLimiter — ${LIMITER_CONFIGS.colorLimiter.max} req / ${LIMITER_CONFIGS.colorLimiter.windowMs / 1000} sec window`);
  await assertLimiterBlocks("colorLimiter");

  section(`resetLimiter — ${LIMITER_CONFIGS.resetLimiter.max} req / ${LIMITER_CONFIGS.resetLimiter.windowMs / 60000} min window`);
  await assertLimiterBlocks("resetLimiter");

  // ── Standard rate-limit response headers ────────────────────────────────────

  section("Standard rate-limit headers — present on blocked response");
  {
    const key = "authLimiter" as const;
    const app = buildApp(freshLimiter(key));
    await sendRequests(app, LIMITER_CONFIGS[key].max);
    const res = await request(app).post("/test").send({});
    const hasStandard = res.headers["ratelimit-limit"] !== undefined;
    const hasLegacy   = res.headers["x-ratelimit-limit"] !== undefined;
    assert(
      hasStandard || hasLegacy,
      "authLimiter: RateLimit-Limit (or X-RateLimit-Limit) header present on 429 response"
    );
  }

  // ── All pre-limit requests return 200 ───────────────────────────────────────

  section("Consecutive requests before limit — all return 200");
  for (const key of Object.keys(LIMITER_CONFIGS) as Array<keyof typeof LIMITER_CONFIGS>) {
    const { max } = LIMITER_CONFIGS[key];
    const app = buildApp(freshLimiter(key));
    const statuses = await sendRequests(app, max);
    assert(
      statuses.every((s) => s === 200),
      `${key}: all ${max} pre-limit requests return 200`
    );
  }

  // ── Postgres store adapter ────────────────────────────────────────────────
  //
  // These tests verify that:
  //   1. makeStore() returns a PgRateLimitStore in all cases.
  //   2. Without DATABASE_URL the pool is null (in-memory fallback).
  //   3. With DATABASE_URL set the pool is non-null (Postgres mode).
  //
  // We use __resetForTesting() to clear module-level singletons between
  // scenarios so the lazy-init logic is exercised fresh each time.

  section("Postgres store adapter — falls back to in-memory without DATABASE_URL");
  {
    const savedUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetForTesting();

    const store = __makeStoreForTesting("auth");
    assert(store instanceof PgRateLimitStore, "store is a PgRateLimitStore");
    assert(store._poolForTesting === null, "pool is null when DATABASE_URL is absent (in-memory fallback)");

    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    __resetForTesting();
  }

  section("Postgres store adapter — pool is created when DATABASE_URL is set");
  {
    const savedUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://localhost/test_auracloset";
    __resetForTesting();

    const store = __makeStoreForTesting("auth");
    assert(store instanceof PgRateLimitStore, "store is a PgRateLimitStore");
    assert(store._poolForTesting !== null, "pool is non-null when DATABASE_URL is set (Postgres mode)");

    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    else delete process.env.DATABASE_URL;
    __resetForTesting();
  }

  section("Postgres store adapter — security-sensitive limiters each get a dedicated prefix");
  {
    const savedUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetForTesting();

    const authStore    = __makeStoreForTesting("auth");
    const resetStore   = __makeStoreForTesting("reset");
    const accountStore = __makeStoreForTesting("account");

    assert(authStore.prefix    === "auth",    `authLimiter store prefix is "auth" (got "${authStore.prefix}")`);
    assert(resetStore.prefix   === "reset",   `resetLimiter store prefix is "reset" (got "${resetStore.prefix}")`);
    assert(accountStore.prefix === "account", `accountLimiter store prefix is "account" (got "${accountStore.prefix}")`);

    assert(authStore.prefix !== resetStore.prefix,   "authLimiter and resetLimiter use distinct prefixes");
    assert(authStore.prefix !== accountStore.prefix, "authLimiter and accountLimiter use distinct prefixes");

    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    __resetForTesting();
  }

  // ── DB-error fallback — increment / decrement / resetKey ────────────────────
  //
  // When the Postgres pool throws (e.g. DB temporarily unavailable), each method
  // must catch the error, log it, and fall back to the in-memory Map so the
  // request is neither dropped nor returns a 500.

  section("DB-error fallback — increment falls back to in-memory on pool error");
  {
    const brokenPool = {
      query: () => Promise.reject(new Error("simulated DB connection refused")),
    } as any;

    const store = new PgRateLimitStore("test-fallback", brokenPool);
    store.init({ windowMs: 60_000 } as any);

    let result: import("express-rate-limit").ClientRateLimitInfo | undefined;
    let threw = false;
    try {
      result = await store.increment("user-1");
    } catch {
      threw = true;
    }

    assert(!threw,           "increment does not throw when pool errors");
    assert(result !== undefined, "increment returns a value despite DB error");
    assert(result?.totalHits === 1, `increment returns totalHits=1 from in-memory fallback (got ${result?.totalHits})`);
    assert(result?.resetTime instanceof Date, "increment returns a valid resetTime Date");

    const result2 = await store.increment("user-1");
    assert(result2.totalHits === 2, `second increment returns totalHits=2 from in-memory fallback (got ${result2.totalHits})`);
  }

  section("DB-error fallback — decrement falls back to in-memory on pool error");
  {
    const brokenPool = {
      query: () => Promise.reject(new Error("simulated DB connection refused")),
    } as any;

    const store = new PgRateLimitStore("test-fallback-dec", brokenPool);
    store.init({ windowMs: 60_000 } as any);

    await store.increment("user-2");
    await store.increment("user-2");

    let threw = false;
    try {
      await store.decrement("user-2");
    } catch {
      threw = true;
    }

    assert(!threw, "decrement does not throw when pool errors");

    const result = await store.increment("user-2");
    assert(result.totalHits === 2, `after decrement in-memory count is correct (got ${result.totalHits})`);
  }

  section("DB-error fallback — resetKey falls back to in-memory on pool error");
  {
    const brokenPool = {
      query: () => Promise.reject(new Error("simulated DB connection refused")),
    } as any;

    const store = new PgRateLimitStore("test-fallback-reset", brokenPool);
    store.init({ windowMs: 60_000 } as any);

    await store.increment("user-3");
    await store.increment("user-3");

    let threw = false;
    try {
      await store.resetKey("user-3");
    } catch {
      threw = true;
    }

    assert(!threw, "resetKey does not throw when pool errors");

    const result = await store.increment("user-3");
    assert(result.totalHits === 1, `after resetKey in-memory counter resets to 1 (got ${result.totalHits})`);
  }

  // ── LIMITER_CONFIGS completeness ────────────────────────────────────────────

  section("LIMITER_CONFIGS — all expected route-limiter keys are present");
  {
    const expected: Array<keyof typeof LIMITER_CONFIGS> = [
      "authLimiter", "accountLimiter", "aiLimiter", "bgRemovalLimiter", "colorLimiter", "resetLimiter",
    ];
    for (const key of expected) {
      assert(key in LIMITER_CONFIGS, `LIMITER_CONFIGS["${key}"] is defined`);
    }
  }

  section("LIMITER_CONFIGS — security thresholds are within policy bounds");
  {
    assert(
      LIMITER_CONFIGS.authLimiter.max <= 5,
      `authLimiter.max <= 5 (auth routes — got ${LIMITER_CONFIGS.authLimiter.max})`,
    );
    assert(
      LIMITER_CONFIGS.authLimiter.windowMs >= 10 * 60 * 1000,
      `authLimiter.windowMs >= 10 min`,
    );
    assert(
      LIMITER_CONFIGS.resetLimiter.max <= 5,
      `resetLimiter.max <= 5 (password-reset route — got ${LIMITER_CONFIGS.resetLimiter.max})`,
    );
    assert(
      LIMITER_CONFIGS.resetLimiter.windowMs >= 30 * 60 * 1000,
      `resetLimiter.windowMs >= 30 min`,
    );
    assert(
      LIMITER_CONFIGS.aiLimiter.max <= 20,
      `aiLimiter.max <= 20 (got ${LIMITER_CONFIGS.aiLimiter.max})`,
    );
    assert(
      LIMITER_CONFIGS.accountLimiter.max <= 10,
      `accountLimiter.max <= 10 (got ${LIMITER_CONFIGS.accountLimiter.max})`,
    );
  }

  section("LIMITER_CONFIGS — relative restrictiveness: auth ≤ ai ≤ color (wiring sanity)");
  {
    const { authLimiter, resetLimiter, aiLimiter, colorLimiter, accountLimiter } = LIMITER_CONFIGS;
    assert(
      resetLimiter.max <= authLimiter.max,
      `resetLimiter.max (${resetLimiter.max}) <= authLimiter.max (${authLimiter.max}) — password-reset is tightest`,
    );
    assert(
      authLimiter.max <= aiLimiter.max,
      `authLimiter.max (${authLimiter.max}) <= aiLimiter.max (${aiLimiter.max}) — auth is more restrictive than AI`,
    );
    assert(
      colorLimiter.max >= aiLimiter.max,
      `colorLimiter.max (${colorLimiter.max}) >= aiLimiter.max (${aiLimiter.max}) — color extraction is higher-volume`,
    );
    assert(
      accountLimiter.max <= aiLimiter.max,
      `accountLimiter.max (${accountLimiter.max}) <= aiLimiter.max (${aiLimiter.max}) — account ops are restricted`,
    );
  }

  // ── PgRateLimitStore — loadFromDb() ─────────────────────────────────────────

  section("PgRateLimitStore.loadFromDb — null pool: no-op, no throw");
  {
    const store = new PgRateLimitStore("test-lfd-null", null);
    store.init({ windowMs: 60_000 } as any);

    let threw = false;
    try { await store.loadFromDb(); } catch { threw = true; }
    assert(!threw, "loadFromDb() with null pool does not throw");
  }

  section("PgRateLimitStore.loadFromDb — broken pool: logs and does not throw");
  {
    const brokenPool = {
      query: () => Promise.reject(new Error("simulated DB error")),
    } as any;

    const store = new PgRateLimitStore("test-lfd-err", brokenPool);
    store.init({ windowMs: 60_000 } as any);

    let threw = false;
    try { await store.loadFromDb(); } catch { threw = true; }
    assert(!threw, "loadFromDb() swallows pool errors (no throw)");
  }

  // ── PgRateLimitStore — consecutive DB failure counter ────────────────────────

  section("PgRateLimitStore._consecutiveDbFailuresForTesting — starts at 0");
  {
    const store = new PgRateLimitStore("test-cdf-start", null);
    assert(
      store._consecutiveDbFailuresForTesting === 0,
      `_consecutiveDbFailuresForTesting starts at 0 (got ${store._consecutiveDbFailuresForTesting})`,
    );
  }

  section("PgRateLimitStore._consecutiveDbFailuresForTesting — increments on each DB failure");
  {
    const brokenPool = {
      query: () => Promise.reject(new Error("simulated failure")),
    } as any;

    const store = new PgRateLimitStore("test-cdf-inc", brokenPool);
    store.init({ windowMs: 60_000 } as any);

    await store.increment("u1");
    assert(
      store._consecutiveDbFailuresForTesting === 1,
      `counter is 1 after first failure (got ${store._consecutiveDbFailuresForTesting})`,
    );

    await store.increment("u1");
    assert(
      store._consecutiveDbFailuresForTesting === 2,
      `counter is 2 after second failure (got ${store._consecutiveDbFailuresForTesting})`,
    );
  }

  section("PgRateLimitStore._consecutiveDbFailuresForTesting — resets to 0 after success");
  {
    let callCount = 0;
    const flakyPool = {
      query: () => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error("simulated failure"));
        }
        // Simulate a successful upsert return
        return Promise.resolve({
          rows: [{ hits: 1, reset_time_ms: String(Date.now() + 60_000) }],
        });
      },
    } as any;

    const store = new PgRateLimitStore("test-cdf-reset", flakyPool);
    store.init({ windowMs: 60_000 } as any);

    await store.increment("u2"); // fail 1 → counter = 1
    await store.increment("u2"); // fail 2 → counter = 2
    await store.increment("u2"); // success → counter resets to 0

    assert(
      store._consecutiveDbFailuresForTesting === 0,
      `counter resets to 0 after a successful DB call (got ${store._consecutiveDbFailuresForTesting})`,
    );
  }

  // ── Shared auth budget: cross-route back-pressure ────────────────────────
  //
  // Verifies that exhausting authLimiter on one auth route (e.g. sign-in)
  // also blocks a second auth route (e.g. reset-password) that shares the
  // same limiter instance.  This closes the gap where an attacker who burns
  // the sign-up/sign-in budget could immediately pivot to reset-password.

  section("Shared auth budget — exhausting budget on route A blocks route B");
  {
    const sharedAuthLimiter = rateLimit({
      ...LIMITER_CONFIGS.authLimiter,
      standardHeaders: true,
      legacyHeaders: true,
      handler: makeLimiterHandler(),
    });

    const resetOnlyLimiter = rateLimit({
      ...LIMITER_CONFIGS.resetLimiter,
      standardHeaders: true,
      legacyHeaders: true,
      handler: makeLimiterHandler(),
    });

    const app = express();
    app.use(express.json());
    app.post("/sign-in",       sharedAuthLimiter, (_req, res) => res.status(200).json({ ok: true }));
    app.post("/reset-password", sharedAuthLimiter, resetOnlyLimiter, (_req, res) => res.status(200).json({ ok: true }));

    const { max } = LIMITER_CONFIGS.authLimiter;

    const signInStatuses: number[] = [];
    for (let i = 0; i < max; i++) {
      const r = await request(app).post("/sign-in").send({});
      signInStatuses.push(r.status);
    }
    assert(
      signInStatuses.every((s) => s === 200),
      `shared authLimiter: first ${max} sign-in requests all pass (got [${signInStatuses.join(",")}])`,
    );

    const resetAfterExhaustion = await request(app).post("/reset-password").send({});
    assert(
      resetAfterExhaustion.status === 429,
      `shared authLimiter: reset-password is blocked (429) once sign-in budget is exhausted (got ${resetAfterExhaustion.status})`,
    );
    assert(
      resetAfterExhaustion.body?.error === "rate_limit",
      `shared authLimiter: reset-password blocked response has error:"rate_limit" (got "${resetAfterExhaustion.body?.error}")`,
    );
  }

  section("Shared auth budget — reset-password resetLimiter also fires independently");
  {
    const sharedAuthLimiter2 = rateLimit({
      ...LIMITER_CONFIGS.authLimiter,
      standardHeaders: true,
      legacyHeaders: true,
      handler: makeLimiterHandler(),
    });

    const resetOnlyLimiter2 = rateLimit({
      ...LIMITER_CONFIGS.resetLimiter,
      standardHeaders: true,
      legacyHeaders: true,
      handler: makeLimiterHandler(),
    });

    const app2 = express();
    app2.use(express.json());
    app2.post("/reset-password", sharedAuthLimiter2, resetOnlyLimiter2, (_req, res) => res.status(200).json({ ok: true }));

    const { max: resetMax } = LIMITER_CONFIGS.resetLimiter;

    const beforeLimitStatuses: number[] = [];
    for (let i = 0; i < resetMax; i++) {
      const r = await request(app2).post("/reset-password").send({});
      beforeLimitStatuses.push(r.status);
    }
    assert(
      beforeLimitStatuses.every((s) => s === 200),
      `resetLimiter: first ${resetMax} reset requests all pass (got [${beforeLimitStatuses.join(",")}])`,
    );

    const blocked = await request(app2).post("/reset-password").send({});
    assert(
      blocked.status === 429,
      `resetLimiter: request ${resetMax + 1} on reset-password returns 429 (got ${blocked.status})`,
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(`\n${failed === 0 ? "All tests passed." : `${failed} test(s) FAILED.`}`);
  process.exit(failed > 0 ? 1 : 0);
})();
