/**
 * HTTP-layer integration tests for POST /api/classify-garment.
 *
 * Exercises the full Express request/response cycle without any live Gemini
 * API calls.  Uses the real production route handler (classifyGarment) and the
 * real LIMITER_CONFIGS values, so any security-threshold change in production
 * will automatically propagate here.
 *
 * Covers:
 *   • 400 when neither imageBase64 nor imageUrl is supplied
 *   • 400 when both imageBase64 and imageUrl are supplied
 *   • 500 when GEMINI_API_KEY is absent (key temporarily removed from env)
 *   • 429 after exceeding LIMITER_CONFIGS.aiLimiter.max requests
 *   • Response shape on 400 (application/json + "error" property)
 *
 * Run: `npx tsx __tests__/classifyGarmentIntegration.test.ts`
 * Exits non-zero on any failed assertion.
 */

import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { classifyGarment } from "../server/classify-garment";
import { LIMITER_CONFIGS, makeLimiterHandler } from "../server/middleware/rateLimiter";

// ── Assertion harness ─────────────────────────────────────────────────────────

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

// ── App builders ─────────────────────────────────────────────────────────────

/** Minimal Express app with only the classify-garment handler — no limiter. */
function buildApp(): express.Application {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.post("/api/classify-garment", classifyGarment);
  return app;
}

/**
 * Classify app with a fresh aiLimiter instance using the production config
 * values.  A fresh MemoryStore is used so this app's counter is isolated.
 */
function buildLimitedApp(): express.Application {
  const limiter = rateLimit({
    ...LIMITER_CONFIGS.aiLimiter,
    standardHeaders: true,
    legacyHeaders: true,
    handler: makeLimiterHandler(),
  });
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.post("/api/classify-garment", limiter, classifyGarment);
  return app;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {

  section("400 — neither imageBase64 nor imageUrl in body");
  {
    const res = await request(buildApp())
      .post("/api/classify-garment")
      .send({});
    assert(res.status === 400, `empty body → 400 (got ${res.status})`);
    assert(typeof res.body?.error === "string", `response body has error string`);
  }

  section("400 — both imageBase64 and imageUrl supplied (ambiguous input)");
  {
    const res = await request(buildApp())
      .post("/api/classify-garment")
      .send({ imageBase64: "abc", imageUrl: "https://example.com/img.jpg" });
    assert(res.status === 400, `both fields → 400 (got ${res.status})`);
  }

  section("500 — GEMINI_API_KEY absent");
  {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const res = await request(buildApp())
        .post("/api/classify-garment")
        .send({ imageBase64: "dGVzdA==" }); // base64("test")
      assert(res.status === 500, `missing API key → 500 (got ${res.status})`);
      assert(
        res.body?.error === "missing_gemini_api_key",
        `body.error === "missing_gemini_api_key" (got "${res.body?.error}")`,
      );
    } finally {
      if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
    }
  }

  section(`429 — aiLimiter blocks request ${LIMITER_CONFIGS.aiLimiter.max + 1} onwards`);
  {
    const max = LIMITER_CONFIGS.aiLimiter.max;
    const app = buildLimitedApp();

    // Temporarily remove the API key so each of the first `max` requests
    // returns 500 (no Gemini call), while still incrementing the limiter counter.
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      for (let i = 0; i < max; i++) {
        const r = await request(app)
          .post("/api/classify-garment")
          .send({ imageBase64: "dGVzdA==" });
        assert(r.status !== 429, `request ${i + 1}/${max}: not yet rate-limited (got ${r.status})`);
      }

      const blocked = await request(app)
        .post("/api/classify-garment")
        .send({ imageBase64: "dGVzdA==" });
      assert(blocked.status === 429, `request ${max + 1}: blocked with 429 (got ${blocked.status})`);
      assert(
        blocked.body?.error === "rate_limit",
        `429 body has error=rate_limit (got "${blocked.body?.error}")`,
      );
      const retryAfter = blocked.headers["retry-after"];
      assert(
        typeof retryAfter === "string" && parseInt(retryAfter, 10) >= 1,
        `429 has Retry-After header (got "${retryAfter}")`,
      );
    } finally {
      if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
    }
  }

  section("400 response is JSON with 'error' property");
  {
    const res = await request(buildApp())
      .post("/api/classify-garment")
      .send({});
    assert(
      (res.headers["content-type"] ?? "").includes("application/json"),
      "400 response Content-Type is application/json",
    );
    assert(
      Object.prototype.hasOwnProperty.call(res.body, "error"),
      "400 response body has 'error' property",
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(
    `\n${failed === 0 ? "All" : failed + " of"} integration test${failed === 1 ? "" : "s"} ${failed === 0 ? "passed" : "failed"}.`,
  );
  process.exit(failed > 0 ? 1 : 0);

})();
