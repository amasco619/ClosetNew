import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import {
  __resetForTesting,
  __storeOverrides,
  accountDeletionIpLimiter,
  accountDeletionUserLimiter,
  LIMITER_CONFIGS,
} from "../server/middleware/rateLimiter";

async function main() {
  const routes = readFileSync("server/routes.ts", "utf8");
  assert.match(
    routes,
    /app\.delete\(\s*"\/api\/user\/delete-account"\s*,\s*accountDeletionIpLimiter\s*,\s*requireAuth\s*,\s*accountDeletionUserLimiter\s*,/,
    "the account-specific limiter must follow requireAuth, behind the IP limiter",
  );
  assert.match(
    routes,
    /app\.post\("\/api\/delete-account-confirm",\s*accountLimiter,/,
    "OTP-confirm deletion keeps its existing 5-per-IP limiter",
  );
  assert.deepEqual(LIMITER_CONFIGS.accountDeletionIpLimiter, {
    windowMs: 60 * 60 * 1000,
    max: 60,
  });
  assert.deepEqual(LIMITER_CONFIGS.accountDeletionUserLimiter, {
    windowMs: 60 * 60 * 1000,
    max: 5,
  });

  const counters = new Map<string, { hits: number; resetTime: number }>();
  __storeOverrides.client = {
    rpc: async (_name: string, args: { p_key: string; p_window_ms: number }) => {
      const now = Date.now();
      const existing = counters.get(args.p_key);
      const row = !existing || now >= existing.resetTime
        ? { hits: 1, resetTime: now + args.p_window_ms }
        : { hits: existing.hits + 1, resetTime: existing.resetTime };
      counters.set(args.p_key, row);
      return {
        data: [{ hits: row.hits, reset_time_ms: row.resetTime }],
        error: null,
      };
    },
  } as any;

  const originalNow = Date.now;
  let now = 1_900_000_000_000;
  Date.now = () => now;
  try {
    const app = express();
    app.set("trust proxy", 1);
    app.delete(
      "/api/user/delete-account",
      accountDeletionIpLimiter,
      (req, res, next) => {
        const id = req.header("x-user-id");
        if (!id) return res.status(401).json({ error: "authentication_required" });
        (req as any).authenticatedUser = { id };
        next();
      },
      accountDeletionUserLimiter,
      (req, res) => res.sendStatus(req.header("x-force-failure") ? 500 : 200),
    );

    const sameIp = "198.51.100.41";
    const call = (user?: string, fail = false) => {
      let req = request(app).delete("/api/user/delete-account")
        .set("X-Forwarded-For", sameIp);
      if (user) req = req.set("X-User-Id", user);
      if (fail) req = req.set("X-Force-Failure", "1");
      return req;
    };

    assert.equal((await call()).status, 401, "unauthenticated traffic never reaches the user limiter");
    for (let i = 0; i < 5; i++) {
      assert.equal((await call("account-a")).status, 200);
    }
    now += 30 * 60 * 1000;
    const sixthA = await call("account-a");
    assert.equal(sixthA.status, 429, "the sixth authenticated attempt is blocked");
    assert.equal(sixthA.body.error, "rate_limit");
    const retryAfter = sixthA.headers["retry-after"];
    assert.equal(Number(retryAfter), 1800, "Retry-After uses the original fixed-window boundary");
    assert.equal(Number((await call("account-a")).headers["retry-after"]), Number(retryAfter),
      "further blocked attempts do not extend the fixed window");

    assert.equal((await call("account-b")).status, 200,
      "another account behind the same IP has an independent user budget");
    for (let i = 1; i < 5; i++) assert.equal((await call("account-b")).status, 200);
    assert.equal((await call("account-b")).status, 429,
      "the second account is blocked only on its own sixth attempt");

    for (let i = 0; i < 4; i++) assert.equal((await call("account-c")).status, 200);
    assert.equal((await call("account-c", true)).status, 500,
      "a failed deletion attempt reaches the route but consumes its fifth slot");
    assert.equal((await call("account-c")).status, 429,
      "failed deletion attempts count toward the account budget");

    counters.clear();
    for (let i = 0; i < 60; i++) {
      assert.equal((await call(`ip-budget-user-${i}`)).status, 200);
    }
    const sixtyFirst = await call("ip-budget-user-60");
    assert.equal(sixtyFirst.status, 429, "the shared IP ceiling is 60 per hour");
    assert.equal(sixtyFirst.body.error, "rate_limit");

    console.log("Account-deletion budgets: auth order, per-user isolation, 6th-attempt blocking, fixed windows, failed attempts, and 60/hour IP ceiling passed");
  } finally {
    Date.now = originalNow;
    __resetForTesting();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
