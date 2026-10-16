import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import {
  isAiProcessingSwitchOn,
  requireAiProcessingPreference,
} from "../lib/aiProcessingPreferenceState";

async function main() {
  // Import mounted routes with database-backed rate-limit state disabled.
  const originalDbUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
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
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    await routes.registerRoutes(app);
    let ip = 1;
    const call = (method: "get" | "put" | "post", path: string) =>
      request(app)[method](path).set("X-Forwarded-For", `198.18.0.${ip++}`);

    const pref = "/api/user/ai-processing";
    // A no-choice account may display the default-on switch, but that display
    // is not consent and must not cause any pending photo to reach a provider.
    const noChoice = await call("get", pref);
    assert.deepEqual(noChoice.body, { state: "not_asked" });
    assert.equal(isAiProcessingSwitchOn(requireAiProcessingPreference(noChoice.body.state), {
      loading: false, unavailable: false, guest: false,
    }), true, "a confirmed no-choice response displays ON by default");
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
    console.log("AI consent: missing/malformed denied, account persistence, withdrawal and route guards passed");
  } finally {
    delete routes._testOverrides.authenticatedUser;
    delete consent._testOverrides.load;
    delete consent._testOverrides.save;
    limiter.__resetForTesting();
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });