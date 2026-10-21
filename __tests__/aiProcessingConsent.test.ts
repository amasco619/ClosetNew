import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import {
  isAiProcessingSwitchOn,
  requireAiProcessingPreference,
} from "../lib/aiProcessingPreferenceState";

async function main() {
  assert.equal(process.env.NODE_ENV, "test", "Run this fixture via npm test, not directly against live stores");
  // The limiter uses Supabase now; removing DATABASE_URL no longer isolates it.
  const [routes, consent, limiter] = await Promise.all([
    import("../server/routes"),
    import("../server/aiProcessingConsent"),
    import("../server/middleware/rateLimiter"),
  ]);
  const metadata = new Map<string, Record<string, unknown>>();
  try {
    routes._testOverrides.authenticatedUser = { id: "first-account" };
    consent._testOverrides.load = async id => metadata.get(id) ?? {};
    consent._testOverrides.save = async (id, value) => { metadata.set(id, value); };
    limiter.__resetForTesting();
    const counters = new Map<string, { hits: number; resetTime: number }>();
    limiter.__storeOverrides.client = {
      rpc: async (_name: string, args: { p_key: string; p_window_ms: number }) => {
        const now = Date.now();
        const previous = counters.get(args.p_key);
        const row = !previous || now >= previous.resetTime
          ? { hits: 1, resetTime: now + args.p_window_ms }
          : { hits: previous.hits + 1, resetTime: previous.resetTime };
        counters.set(args.p_key, row);
        return { data: [{ hits: row.hits, reset_time_ms: row.resetTime }], error: null };
      },
    } as any;
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    await routes.registerRoutes(app);
    let ip = 1;
    const call = (method: "get" | "put" | "post", path: string) =>
      request(app)[method](path).set("X-Forwarded-For", `198.18.0.${ip++}`);

    const pref = "/api/user/ai-processing";
    // A no-choice account displays the switch OFF and is not consent; no
    // pending photo may reach a provider.
    const noChoice = await call("get", pref);
    assert.deepEqual(noChoice.body, { state: "not_asked" });
    assert.equal(isAiProcessingSwitchOn(requireAiProcessingPreference(noChoice.body.state), {
      loading: false, unavailable: false, guest: false,
    }), false, "a confirmed no-choice response displays OFF by default");
    for (const route of ["/api/classify-garment", "/api/classify-garments", "/api/remove-background"]) {
      const blocked = await call("post", route).send({ imageBase64: "never-sent-to-provider" });
      assert.equal(blocked.status, 403, `${route} must reject before the handler`);
      assert.equal(blocked.body.error, "ai_processing_consent_required");
    }
    metadata.set("first-account", { amodka_ai_image_processing: "unexpected" });
    assert.deepEqual((await call("get", pref)).body, { state: "not_asked" });
    assert.equal((await call("post", "/api/classify-garment").send({})).status, 403);
    assert.equal((await call("put", pref).send({ state: "unexpected" })).status, 400);

    metadata.set("first-account", { existing_metadata: "preserved" });
    assert.deepEqual((await call("put", pref).send({ state: "allowed" })).body, { state: "allowed" });
    assert.deepEqual(metadata.get("first-account"), {
      existing_metadata: "preserved",
      amodka_ai_image_processing: "allowed",
    });
    assert.deepEqual((await call("get", pref)).body, { state: "allowed" });
    // The server reads durable account state, not a prior in-process toggle or client claim.
    routes._testOverrides.authenticatedUser = { id: "second-account" };
    assert.deepEqual((await call("get", pref)).body, { state: "not_asked" });
    routes._testOverrides.authenticatedUser = { id: "first-account" };

    assert.deepEqual((await call("put", pref).send({ state: "declined" })).body, { state: "declined" });
    assert.deepEqual((await call("get", pref)).body, { state: "declined" },
      "explicit OFF is read back from account metadata after a fresh request");
    assert.equal((await call("post", "/api/remove-background").send({})).status, 403);
    assert.equal((await call("post", "/api/classify-garment").send({})).status, 403);
    assert.deepEqual((await call("put", pref).send({ state: "allowed" })).body, { state: "allowed" },
      "turning AI back on requires an explicit saved allowed choice");
    assert.deepEqual((await call("get", pref)).body, { state: "allowed" });
    consent._testOverrides.load = async () => { throw new Error("unavailable"); };
    assert.equal((await call("post", "/api/classify-garment").send({})).status, 503,
      "store failure must fail closed");
    assert.equal((await call("get", pref)).status, 503);
    // Preference writes have an independent, short-window budget; auth/account
    // and provider limiters must not be consumed by ordinary privacy toggles.
    consent._testOverrides.load = async id => metadata.get(id) ?? {};
    routes._testOverrides.authenticatedUser = { id: 'limiter-preference-account' };
    const sameIp = '198.19.42.1';
    for (let i = 0; i < limiter.LIMITER_CONFIGS.aiPreferenceLimiter.max; i++) {
      const result = await request(app).put(pref).set('X-Forwarded-For', sameIp).send({ state: 'declined' });
      assert.equal(result.status, 200);
    }
    const limited = await request(app).put(pref).set('X-Forwarded-For', sameIp).send({ state: 'allowed' });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, 'ai_preference_rate_limit');
    assert.ok(Number(limited.headers['retry-after']) > 0);
    assert.equal((await request(app).get(pref).set('X-Forwarded-For', sameIp)).status, 200);
    assert.equal((await request(app).post('/api/auth/sign-in').set('X-Forwarded-For', sameIp).send({})).status, 400);
    assert.equal((await request(app).post('/api/classify-garment').set('X-Forwarded-For', sameIp).send({})).status, 403);
    app.post('/test-account-budget', limiter.accountLimiter, (_req, res) => res.sendStatus(204));
    assert.equal((await request(app).post('/test-account-budget').set('X-Forwarded-For', sameIp)).status, 204);
    routes._testOverrides.authenticatedUser = { id: 'other-preference-account' };
    assert.equal((await request(app).put(pref).set('X-Forwarded-For', sameIp).send({ state: 'declined' })).status, 200,
      'different authenticated users do not share a preference bucket behind the same IP');
    console.log("AI consent: missing/malformed denied, account persistence, withdrawal, route guards and isolated preference limiter passed");
  } finally {
    delete routes._testOverrides.authenticatedUser;
    delete consent._testOverrides.load;
    delete consent._testOverrides.save;
    limiter.__resetForTesting();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });