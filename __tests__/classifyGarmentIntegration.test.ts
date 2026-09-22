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
import axios from "axios";
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

  section("successful classification does not log user-linked garment attributes");
  {
    const savedKey = process.env.GEMINI_API_KEY;
    const savedPost = axios.post;
    const savedLog = console.log;
    const logs: string[] = [];
    process.env.GEMINI_API_KEY = "test-key";
    axios.post = (async () => ({
      data: {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                category: "tops",
                subType: "t-shirt",
                colorFamily: "navy",
                displayName: "Navy T-shirt",
                fabric: "cotton",
                weight: "light",
                pattern: "solid",
                dominantRgb: [26, 42, 74],
                modelConfidence: 0.91,
              }),
            }],
          },
        }],
      },
    })) as typeof axios.post;
    console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };

    try {
      const res = await request(buildApp())
        .post("/api/classify-garment")
        .send({ imageBase64: "dGVzdA==", userId: "sensitive-user-id" });
      assert(res.status === 200, `successful classification returns 200 (got ${res.status})`);
      const successLogs = logs.join("\n");
      assert(!successLogs.includes("sensitive-user-id"), "success logs contain no user ID");
      assert(!successLogs.includes("navy") && !successLogs.includes("t-shirt") && !successLogs.includes("0.91"),
        "success logs contain no garment subtype, colour, or confidence");
    } finally {
      console.log = savedLog;
      axios.post = savedPost;
      if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = savedKey;
    }
  }

  section("classifier failures are safe and machine-distinguishable");
  {
    const savedKey = process.env.GEMINI_API_KEY;
    const savedPost = axios.post;
    process.env.GEMINI_API_KEY = "test-key";

    const runFailure = async (failure: unknown) => {
      axios.post = (async () => { throw failure; }) as typeof axios.post;
      return request(buildApp())
        .post("/api/classify-garment")
        .send({ imageBase64: "dGVzdA==" });
    };
    const axiosError = (fields: Record<string, unknown>) =>
      Object.assign(new Error("provider secret must never leak"), { isAxiosError: true, ...fields });

    const savedError = console.error;
    const logs: string[] = [];
    console.error = (...args: unknown[]) => { logs.push(args.join(" ")); };
    const assertSafe = (label: string, response: any, secret: string) => {
      const body = JSON.stringify(response.body);
      const output = logs.join("\n");
      assert(!body.includes(secret) && !output.includes(secret),
        `${label} does not expose raw provider detail in body or logs`);
    };

    try {
      let calls = 0;
      axios.post = (async () => {
        calls++;
        if (calls === 1) {
          throw axiosError({ response: { status: 429 } });
        }
        return {
          data: {
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    category: "top",
                    subType: "t-shirt",
                    colorFamily: "navy",
                    dominantRgb: [26, 42, 74],
                    modelConfidence: 0.91,
                  }),
                }],
              },
            }],
          },
        };
      }) as typeof axios.post;
      const fallbackSuccess = await request(buildApp())
        .post("/api/classify-garment")
        .send({ imageBase64: "dGVzdA==" });
      assert(fallbackSuccess.status === 200 && calls === 2
        && fallbackSuccess.body.category === "top",
        "first-model 429 falls back to second model and preserves success");

      const timeout = await runFailure({ code: "ECONNABORTED", message: "timeout provider secret" });
      assert(timeout.status === 504 && timeout.body.error === "classifier_timeout",
        "timeout returns stable classifier_timeout code");
      assertSafe("timeout", timeout, "timeout provider secret");

      const networkSecret = "network provider secret";
      const network = await runFailure(axiosError({ message: `Network Error: ${networkSecret}` }));
      assert(network.status === 503 && network.body.error === "classifier_network_failure",
        "network failure returns stable classifier_network_failure code");
      assertSafe("network failure", network, networkSecret);

      const rateLimitSecret = "raw quota internals";
      const rateLimited = await runFailure(axiosError({
        response: { status: 429, data: { error: { message: rateLimitSecret } } },
      }));
      assert(rateLimited.status === 429 && rateLimited.body.error === "rate_limited"
        , "429 response has safe code");
      assertSafe("429", rateLimited, rateLimitSecret);

      let exhaustedCalls = 0;
      const exhaustedSecret = "raw exhausted quota internals";
      axios.post = (async () => {
        exhaustedCalls++;
        throw axiosError({
          response: { status: 429, data: { error: { message: exhaustedSecret } } },
        });
      }) as typeof axios.post;
      const exhausted = await request(buildApp())
        .post("/api/classify-garment")
        .send({ imageBase64: "dGVzdA==" });
      assert(exhausted.status === 429 && exhausted.body.error === "rate_limited"
        && exhaustedCalls === 2
        , "all-model 429 is safe rate_limited after the existing two-model fallback");
      assertSafe("all-model 429", exhausted, exhaustedSecret);

      const upstreamSecret = "raw outage internals";
      const upstream = await runFailure(axiosError({
        response: { status: 503, data: { error: { message: upstreamSecret } } },
      }));
      assert(upstream.status === 502 && upstream.body.error === "classifier_upstream_failure"
        , "5xx response has safe code");
      assertSafe("5xx", upstream, upstreamSecret);

      const unexpectedSecret = "raw unexpected internals";
      const unexpected = await runFailure(axiosError({
        response: { status: 400, data: { error: { message: unexpectedSecret } } },
      }));
      assert(unexpected.status === 500 && unexpected.body.error === "classification_failed",
        "unexpected failure remains safely coded");
      assertSafe("unexpected failure", unexpected, unexpectedSecret);

      const malformedSecret = "raw Gemini response secret";
      axios.post = (async () => ({
        data: { candidates: [{ content: { parts: [{ text: malformedSecret }] } }] },
      })) as typeof axios.post;
      const malformedResponse = await request(buildApp())
        .post("/api/classify-garment")
        .send({ imageBase64: "dGVzdA==" });
      assert(malformedResponse.status === 502
        && malformedResponse.body.error === "classifier_malformed_response",
        "malformed response is safe");
      assertSafe("malformed response", malformedResponse, malformedSecret);
    } finally {
      console.error = savedError;
      axios.post = savedPost;
      if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = savedKey;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(
    `\n${failed === 0 ? "All" : failed + " of"} integration test${failed === 1 ? "" : "s"} ${failed === 0 ? "passed" : "failed"}.`,
  );
  process.exit(failed > 0 ? 1 : 0);

})();
