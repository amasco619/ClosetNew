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

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(`\n${failed === 0 ? "All tests passed." : `${failed} test(s) FAILED.`}`);
  process.exit(failed > 0 ? 1 : 0);
})();
