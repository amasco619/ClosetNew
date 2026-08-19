import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { registerRoutes, _testOverrides } from "../server/routes";
import {
  getUserEntitlement,
  resolveEntitlement,
  _testOverrides as entitlementTestOverrides,
} from "../server/entitlements";
import { normalizeEntitlement } from "../lib/entitlements";

let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function buildClient(
  profile: { premium: boolean; premium_expires_at: string | null },
  tracked: { userId?: string; queries: number },
) {
  return {
    from: () => ({
      select: () => ({
        eq: (_column: string, userId: string) => {
          tracked.userId = userId;
          tracked.queries++;
          return { single: async () => ({ data: profile, error: null }) };
        },
      }),
    }),
  };
}

async function buildApp(): Promise<express.Application> {
  const app = express();
  app.set("trust proxy", () => true);
  app.use(express.json());
  await registerRoutes(app);
  return app;
}

(async () => {
  const now = Date.now();
  const activeExpiry = new Date(now + 60_000).toISOString();
  const expiredExpiry = new Date(now - 60_000).toISOString();

  console.log("\nAuthoritative entitlement resolution:");
  assert(
    resolveEntitlement({ premium: true, premium_expires_at: activeExpiry }, now).isPremium,
    "active premium with a future expiry is premium",
  );
  assert(
    !resolveEntitlement({ premium: true, premium_expires_at: expiredExpiry }, now).isPremium,
    "expired premium is free",
  );
  assert(
    !resolveEntitlement({ premium: false, premium_expires_at: activeExpiry }, now).isPremium,
    "non-premium account is free",
  );
  assert(
    !resolveEntitlement({ premium: true, premium_expires_at: null }, now).isPremium,
    "premium without an expiry is free",
  );

  const tracked: { userId?: string; queries: number } = { queries: 0 };
  const entitlement = await getUserEntitlement(
    "authenticated-user",
    buildClient({ premium: true, premium_expires_at: activeExpiry }, tracked),
  );
  assert(tracked.userId === "authenticated-user", "server resolver queries the authenticated identity only");
  assert(entitlement.isPremium, "active server entitlement is returned for a fresh device state");

  console.log("\nEntitlement endpoint and retired upgrade route:");
  const app = await buildApp();
  const testIp = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  const anonymous = await request(app)
    .get("/api/user/entitlements")
    .set("X-Forwarded-For", testIp);
  assert(anonymous.status === 401, `unauthenticated entitlement request returns 401 (got ${anonymous.status})`);

  const before = readFileSync("server/routes.ts", "utf8");
  _testOverrides.authenticatedUser = { id: "authenticated-user" };
  entitlementTestOverrides.client = buildClient(
    { premium: true, premium_expires_at: activeExpiry },
    tracked,
  );
  try {
    const ownEntitlement = await request(app)
      .get("/api/user/entitlements?userId=attacker-user")
      .set("Authorization", "Bearer ignored-in-test")
      .set("X-Forwarded-For", testIp);
    assert(ownEntitlement.status === 200, `authenticated entitlement request succeeds (got ${ownEntitlement.status})`);
    assert(tracked.userId === "authenticated-user", "supplied user IDs cannot override the authenticated identity");

    const queriesBeforeRetiredPost = tracked.queries;
    const retired = await request(app)
      .post("/api/user/upgrade-premium")
      .set("Authorization", "Bearer ignored-in-test")
      .send({ userId: "another-user" });
    assert(retired.status === 404, `retired upgrade endpoint is not callable (got ${retired.status})`);
    assert(tracked.queries === queriesBeforeRetiredPost, "calling the retired endpoint does not update or query entitlement data");
    assert(
      !before.includes('app.post("/api/user/upgrade-premium"'),
      "no client-callable route remains that can grant premium",
    );
  } finally {
    delete _testOverrides.authenticatedUser;
    delete entitlementTestOverrides.client;
  }

  console.log("\nClient state fails closed:");
  assert(
    !normalizeEntitlement({ isPremium: false, expiresAt: activeExpiry }).isPremium,
    "a server-free response stays free even if local storage is manipulated",
  );
  assert(
    !normalizeEntitlement({ isPremium: false, expiresAt: expiredExpiry }).isPremium,
    "an expired server response stays free even if local storage is manipulated",
  );
  assert(
    !normalizeEntitlement(null).isPremium,
    "malformed or unavailable entitlement responses default to free",
  );
  const appContextSource = readFileSync("contexts/AppContext.tsx", "utf8");
  assert(
    !appContextSource.includes("STORAGE_KEYS.premium") &&
      !appContextSource.includes("togglePremium"),
    "AppContext neither reads local premium state nor exposes a local premium mutation",
  );

  console.log(`\n${failed === 0 ? "All" : failed + " of"} entitlement tests ${failed === 0 ? "passed" : "failed"}.`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});