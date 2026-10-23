import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Response } from "express";
import {
  CLASSIFIER_TOTAL_DEADLINE_MS,
  DEFAULT_CLASSIFIER_FALLBACK_MODEL,
  DEFAULT_CLASSIFIER_PRIMARY_MODEL,
  checkClassifierModelMetadata,
  getClassifierModelOrder,
  getThinkingConfigForModel,
  runGeminiClassifier,
  startClassifierTrace,
  type ClassifierAttemptLog,
  type ClassifierDecision,
  type ClassifierTrace,
} from "../server/classifierReliability";

const models = [DEFAULT_CLASSIFIER_PRIMARY_MODEL, DEFAULT_CLASSIFIER_FALLBACK_MODEL] as const;

function makeTrace() {
  const attempts: ClassifierAttemptLog[] = [];
  let outcomeCode = "";
  const trace: ClassifierTrace = {
    requestId: "test-request-1",
    recordAttempt: (attempt) => attempts.push(attempt),
    setOutcomeCode: (code) => { outcomeCode = code; },
  };
  return { trace, attempts, outcomeCode: () => outcomeCode };
}

function response(text: string, finishReason = "STOP", modelVersion = "gemini-3.5-flash-lite") {
  return {
    status: 200,
    data: {
      modelVersion,
      candidates: [{ finishReason, content: { parts: [{ text }] } }],
    },
  };
}

function statusError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

function decodeJson(providerResponse: { data: any }): ClassifierDecision<{ ok: boolean }> {
  const text = providerResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return { kind: "malformed_json" };
  try {
    const value = JSON.parse(text);
    return value && typeof value.ok === "boolean"
      ? { kind: "success", value }
      : { kind: "invalid", code: "INVALID_SCHEMA" };
  } catch {
    return { kind: "malformed_json" };
  }
}

function fakePost(steps: Array<unknown>) {
  const calls: Array<{ url: string; body: any; config: any }> = [];
  let index = 0;
  const post = async (url: string, body: any, config: any) => {
    calls.push({ url, body, config });
    const step = steps[index++];
    if (step instanceof Error) throw step;
    if (typeof step === "function") return step({ url, body, config });
    return step;
  };
  return { post, calls, remainingSteps: () => steps.length - index };
}

async function runFake(
  post: (url: string, body: any, config: any) => Promise<any>,
  trace: ClassifierTrace,
  options: {
    models?: readonly [string, string];
    initialMaxOutputTokens?: number;
    deadlineAt?: number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    now?: () => number;
    decode?: typeof decodeJson;
  } = {},
) {
  return runGeminiClassifier({
    models: options.models ?? models,
    apiKey: "unit-test-key",
    baseRequestBody: { contents: [], generationConfig: { temperature: 0.1 } },
    initialMaxOutputTokens: options.initialMaxOutputTokens ?? 512,
    deadlineAt: options.deadlineAt ?? Date.now() + CLASSIFIER_TOTAL_DEADLINE_MS,
    trace,
    decode: options.decode ?? decodeJson,
    dependencies: {
      post, sleep: options.sleep ?? (async () => {}),
      random: options.random ?? (() => 0), ...(options.now ? { now: options.now } : {}),
    },
  });
}

async function main() {
  assert.equal(DEFAULT_CLASSIFIER_FALLBACK_MODEL, "gemini-3.5-flash");
  assert.deepEqual(getClassifierModelOrder({}), [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
  ]);
  assert(!getClassifierModelOrder({})[0].includes("latest"));
  assert.deepEqual(
    getClassifierModelOrder({
      GEMINI_PRIMARY_MODEL: " custom-primary ",
      GEMINI_FALLBACK_MODEL: " custom-fallback ",
    }),
    ["custom-primary", "custom-fallback"],
  );
  assert.throws(
    () => getClassifierModelOrder({ GEMINI_PRIMARY_MODEL: "same", GEMINI_FALLBACK_MODEL: "same" }),
    /must be different/,
  );
  assert.deepEqual(getThinkingConfigForModel("gemini-3.5-flash-lite"), { thinkingLevel: "minimal" });
  assert.deepEqual(getThinkingConfigForModel("gemini-3.8-flash"), { thinkingLevel: "minimal" });
  assert.deepEqual(getThinkingConfigForModel("gemini-3.5-flash"), { thinkingLevel: "minimal" });
  assert.deepEqual(getThinkingConfigForModel("gemini-2.5-flash"), { thinkingBudget: 0 });
  assert.match(readFileSync("server/classify-garment.ts", "utf8"), /getClassifierModelOrder/);
  assert.match(readFileSync("server/classify-multi-item.ts", "utf8"), /getClassifierModelOrder/);

  for (const providerStatus of [500, 502, 503, 504]) {
    const fake = fakePost([statusError(providerStatus), response('{"ok":true}')]);
    const { trace, attempts } = makeTrace();
    const result = await runFake(fake.post, trace);
    assert.equal(result.decision.kind, "success", `status ${providerStatus} should retry`);
    assert.deepEqual(fake.calls.map((call) => decodeURIComponent(call.url.split("/models/")[1].split(":")[0])), [models[0], models[0]]);
    assert.deepEqual(attempts.map((attempt) => attempt.providerStatus), [providerStatus, 200]);
  }

  {
    const fake = fakePost([statusError(429), response('{"ok":true}')]);
    const { trace, attempts } = makeTrace();
    const result = await runFake(fake.post, trace);
    assert.equal(result.decision.kind, "success");
    assert.equal(result.model, models[1], "primary 429 should immediately use the configured fallback");
    assert.deepEqual(
      fake.calls.map((call) => decodeURIComponent(call.url.split("/models/")[1].split(":")[0])),
      [models[0], models[1]],
      "a primary 429 must not retry the primary",
    );
    assert.deepEqual(attempts.map((attempt) => attempt.providerStatus), [429, 200]);
  }

  for (const error of [
    Object.assign(new Error("request timeout"), { code: "ETIMEDOUT", name: "TimeoutError" }),
    Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
  ]) {
    const fake = fakePost([error, error, response('{"ok":true}')]);
    const { trace, attempts } = makeTrace();
    const result = await runFake(fake.post, trace);
    assert.equal(result.decision.kind, "success");
    assert.deepEqual(fake.calls.map((call) => call.url.includes(`/${models[0]}:`) ? models[0] : models[1]), [
      models[0], models[0], models[1],
    ]);
    assert.equal(attempts.length, 3);
  }

  {
    const fake = fakePost([response("not-json"), response('{"ok":true}')]);
    const { trace, attempts } = makeTrace();
    const result = await runFake(fake.post, trace);
    assert.equal(result.decision.kind, "success");
    assert.deepEqual(attempts.map((attempt) => attempt.outcomeCode), ["MALFORMED_JSON", "PROVIDER_OK"]);
  }

  {
    const fake = fakePost([response("not-json"), response("still-not-json"), response('{"ok":true}')]);
    const { trace, attempts } = makeTrace();
    const result = await runFake(fake.post, trace);
    assert.equal(result.decision.kind, "success");
    assert.equal(attempts.length, 3);
    assert.deepEqual(fake.calls.map((call) => call.url.includes(`/${models[0]}:`) ? models[0] : models[1]), [
      models[0], models[0], models[1],
    ]);
  }

  {
    const fake = fakePost([response("", "MAX_TOKENS"), response('{"ok":true}')]);
    const { trace, attempts } = makeTrace();
    const result = await runFake(fake.post, trace, { initialMaxOutputTokens: 512 });
    assert.equal(result.decision.kind, "success");
    assert.deepEqual(fake.calls.map((call) => call.body.generationConfig.maxOutputTokens), [512, 1024]);
    assert.equal(fake.calls[0].body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
    assert.deepEqual(attempts.map((attempt) => attempt.finishReason), ["MAX_TOKENS", "STOP"]);
  }

  {
    const fake = fakePost([
      statusError(503),
      statusError(503),
      response("", "MAX_TOKENS", "gemini-3.6-flash"),
      response('{"ok":true}', "STOP", "gemini-3.6-flash"),
    ]);
    const { trace, attempts } = makeTrace();
    const result = await runFake(fake.post, trace);
    assert.equal(result.decision.kind, "success");
    assert.deepEqual(fake.calls.map((call) => call.body.generationConfig.maxOutputTokens), [512, 512, 512, 1024]);
    assert.deepEqual(fake.calls[2].body.generationConfig.thinkingConfig, { thinkingLevel: "minimal" });
    assert.equal(attempts.length, 4);
  }

  for (const status of [401, 403, 404]) {
    const fake = fakePost([statusError(status), response('{"ok":true}')]);
    const { trace, attempts, outcomeCode } = makeTrace();
    await assert.rejects(() => runFake(fake.post, trace));
    assert.equal(fake.calls.length, 1, `status ${status} must not retry or fall back`);
    assert.equal(attempts.length, 1);
    assert.equal(outcomeCode(), status === 404 ? "MODEL_NOT_FOUND" : "PROVIDER_AUTH_ERROR");
  }

  {
    const fake = fakePost([response("", "SAFETY"), response('{"ok":true}')]);
    const { trace, attempts } = makeTrace();
    const result = await runFake(fake.post, trace);
    assert.equal(result.decision.kind, "refused");
    assert.equal(fake.calls.length, 1);
    assert.equal(attempts[0].outcomeCode, "CONTENT_GUARDRAIL");
  }

  {
    const fake = fakePost([{ status: 200, data: { promptFeedback: { blockReason: "SAFETY" } } }]);
    const { trace } = makeTrace();
    const result = await runFake(fake.post, trace);
    assert.equal(result.decision.kind, "refused");
    assert.equal(fake.calls.length, 1, "prompt-level refusals must not retry");
  }

  {
    const fake = fakePost([response('{"refused":true}')]);
    const { trace } = makeTrace();
    const result = await runFake(fake.post, trace, { decode: () => ({ kind: "refused" }) });
    assert.equal(result.decision.kind, "refused");
    assert.equal(fake.calls.length, 1, "parsed refusals must not retry");
  }

  {
    let clock = 0;
    const timeouts: number[] = [];
    let callCount = 0;
    const { trace } = makeTrace();
    const result = await runFake(async (_url, _body, config) => {
      callCount++;
      timeouts.push(config.timeout);
      assert(config.signal instanceof AbortSignal, "each attempt has a wall-clock abort");
      clock += config.timeout;
      if (callCount === 2 || callCount === 4) return response("", "MAX_TOKENS");
      if (callCount === 5) return response('{"ok":true}');
      throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    }, trace, {
      deadlineAt: CLASSIFIER_TOTAL_DEADLINE_MS,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });
    assert.equal(result.decision.kind, "success");
    assert.equal(callCount, 5);
    assert(clock <= 39_000 && clock < 40_000);
    assert(timeouts.every((timeout) => timeout <= 8_500));
    assert(timeouts.at(-1)! < 8_500, "the last attempt uses only the remaining deadline");
    let forbiddenCalls = 0;
    await assert.rejects(() => runFake(async () => {
      forbiddenCalls++;
      return response('{"ok":true}');
    }, makeTrace().trace, { deadlineAt: 0, now: () => 1 }), { code: "ETIMEDOUT" });
    assert.equal(forbiddenCalls, 0);
  }

  {
    const fake = fakePost([response('{"ok":"not-a-boolean"}'), response('{"ok":true}')]);
    const { trace, attempts } = makeTrace();
    const result = await runFake(fake.post, trace);
    assert.equal(result.decision.kind, "invalid");
    assert.equal(fake.calls.length, 1);
    assert.equal(attempts[0].outcomeCode, "INVALID_SCHEMA");
  }

  {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => warnings.push(String(message));
    try {
      const metadata = await checkClassifierModelMetadata(
        ["good-model", "missing-model"],
        "unit-test-key",
        async (url, config) => {
          assert(!url.includes("unit-test-key"));
          assert.equal((config.headers as any)["x-goog-api-key"], "unit-test-key");
          if (url.endsWith("/missing-model")) throw statusError(404);
          return { status: 200, data: { supportedGenerationMethods: ["generateContent"] } };
        },
      );
      assert.deepEqual(metadata, [
        { model: "good-model", available: true, status: 200 },
        { model: "missing-model", available: false, status: 404 },
      ]);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /MODEL_NOT_FOUND/);
      assert.match(warnings[0], /Metadata availability does not prove generation/);
      assert.match(warnings[0], /scripts\/check-gemini-models\.mjs/);
      assert(!warnings[0].includes("unit-test-key"));
    } finally {
      console.warn = originalWarn;
    }
  }

  {
    const headers = new Map<string, string>();
    let finish: (() => void) | undefined;
    const fakeResponse = {
      locals: { requestId: "route-request-42" },
      setHeader: (name: string, value: string) => headers.set(name, value),
      once: (event: string, callback: () => void) => { if (event === "finish") finish = callback; },
    } as unknown as Response;
    const originalInfo = console.info;
    const messages: string[] = [];
    console.info = (message?: unknown) => messages.push(String(message));
    try {
      const trace = startClassifierTrace(fakeResponse, "/api/classify-garment");
      trace.recordAttempt({
        model: models[0], providerStatus: 200, outcomeCode: "PROVIDER_OK",
        finishReason: "STOP", durationMs: 27, providerModelVersion: models[0],
      });
      trace.setOutcomeCode("OK");
      assert.equal(headers.get("x-classification-id"), "route-request-42");
      finish?.();
      const log = JSON.parse(messages[0]);
      assert.equal(log.requestId, "route-request-42");
      assert.equal(log.type, "classification_request");
      assert.equal(new Date(log.timestamp).toISOString(), log.timestamp);
      assert.equal(log.attemptCount, 1);
      assert.equal(log.providerStatus, 200);
      assert.equal(log.finishReason, "STOP");
      assert.deepEqual(log.attemptDurationsMs, [27]);
      assert(!/userId|imageBase64|imageSha256|prompt/i.test(messages[0]));
    } finally {
      console.info = originalInfo;
    }
  }

  console.log("Classifier reliability: shared model order, transient retries/fallbacks, malformed JSON, MAX_TOKENS, refusals, config errors, safe correlated logging, and metadata warnings passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
