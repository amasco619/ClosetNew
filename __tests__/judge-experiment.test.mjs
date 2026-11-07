import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import path from "node:path";
import { transformSync } from "esbuild";

const require = createRequire(import.meta.url);
const source = await fs.readFile("scripts/judge-experiment.ts", "utf8");
// Load the script without its CLI entry point, real provider client or writes.
const testSource = source
  .replace(/const require = createRequire\(import\.meta\.url\);[\s\S]*?const \{ buildGeminiGenerationRequest, getClassifierModelOrder \} = classifierReliability;/,
    "const { buildGeminiGenerationRequest, getClassifierModelOrder } = globalThis.classifier;")
  .replace(/main\(\)\.catch\([\s\S]*$/, "")
  + "\nexport { loadInputs, loadSet2Inputs, loadPersonaSet1Inputs, buildPersonaSystemPrompt, isGeneralTextGenerationModel, isLargerTextTier, listPersonaModels, decode, probeModel, percentile, runOne, runSet2AndResume, parseCsv, sha256, OUTPUT_INSTRUCTIONS, SET2_INSTRUCTIONS, SET2_VERDICTS, PERSONA_VERDICTS, PERSONA_SET1_QUALITY_SENTENCE, PERSONA_SET1_MODEL_LADDER, PERSONA_SET1_TOKEN_CAP };";
const code = transformSync(testSource, { loader: "ts", format: "cjs" }).code;

function harness(responses = [], cataloguePages = []) {
  const files = new Map();
  const calls = [];
  const logs = [];
  const module = { exports: {} };
  const classifier = {
    getClassifierModelOrder: () => ["gemini-3.5-flash-lite", "gemini-3.5-flash"],
    buildGeminiGenerationRequest: (options) => ({
      url: options.model, body: options.baseRequestBody, config: {},
    }),
  };
  const fakeFs = {
    ...fs,
    readFile: async (name, ...args) => {
      if (files.has(name)) return files.get(name);
      if (String(name).includes("/docs/reports/judge-experiment/")) {
        throw Object.assign(new Error("Synthetic missing output"), { code: "ENOENT" });
      }
      return fs.readFile(name, ...args);
    },
    writeFile: async (name, value) => { files.set(name, value); },
    mkdir: async () => {},
  };
  const axios = {
    get: async () => {
      const next = cataloguePages.shift();
      assert.ok(next, "Unexpected model catalogue request");
      return next;
    },
    post: async (url, body) => {
      calls.push({ url, body });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      assert.ok(next, "Unexpected provider call");
      return next;
    },
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, classifier, process, Buffer, AbortSignal,
    console: { log: (value) => logs.push(JSON.parse(value)) },
    setTimeout: (callback) => { callback(); },
    require: (name) => name === "axios" ? axios
      : name === "node:fs/promises" ? fakeFs : require(name),
  });
  return { api: module.exports, files, calls, logs };
}

function response(verdict = "Ask", reason = "Which venue dress code applies?") {
  return {
    headers: { "x-ratelimit-limit": "100" },
    data: {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict, reason }) }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    },
  };
}
function failure(status) {
  return Object.assign(new Error("Synthetic provider failure"), {
    response: { status, headers: { "retry-after": "1" } },
  });
}
const output = (name) => path.join(process.cwd(), "docs/reports/judge-experiment", name);
const look = { id: "T01-A", plainText: "Synthetic scenario and look", structuredFacts: { brief: "Synthetic", items: [{ fabric: null }] } };

test("Set 1 prompt hash and three-verdict decoding are unchanged", async () => {
  const { api } = harness();
  const input = await api.loadInputs();
  assert.equal(api.sha256(`${input.rulesText}\n\n${api.OUTPUT_INSTRUCTIONS}`),
    "981ed9ee3e3254ed328fe72e5275fbb1cfd1371cb424357305472b4748bdf60f");
  assert.equal(api.decode(response()), null);
  assert.equal(api.decode(response("Works", "Synthetic reason")).verdict, "Works");
});

test("Set 2 matches all 100 supplied entries and preserves nulls and briefs", async () => {
  const { api } = harness();
  const input = await api.loadSet2Inputs();
  const supplied = JSON.parse(await fs.readFile("attached_assets/looks2_1793925449136.json", "utf8"));
  assert.equal(input.looks.length, 100);
  for (const entry of supplied) {
    const loaded = input.looks.find((item) => item.id === entry.look_id);
    assert.equal(JSON.stringify(loaded.structuredFacts), JSON.stringify(entry));
    assert.ok(loaded.plainText.includes(entry.brief));
  }
  assert.equal(api.decode(response(), api.SET2_VERDICTS).verdict, "Ask");
  assert.equal(api.decode(response("Ask", Array(16).fill("word").join(" ")), api.SET2_VERDICTS), null);
  assert.ok(api.SET2_INSTRUCTIONS.includes("missing decisive fact"));
});

test("persona Set 1 prompt preserves attachment order, appends the quality sentence and accepts Ask", async () => {
  const { api } = harness();
  const input = await api.loadPersonaSet1Inputs();
  const persona = await fs.readFile("attached_assets/persona_prompt_1793963385991.md", "utf8");
  const rules = await fs.readFile("attached_assets/rules_brief2_1793963421270.md", "utf8");
  assert.equal(input.looks.length, 100);
  assert.equal(input.systemPrompt,
    `${persona.trim()}\n\n${rules.trim()}\n\n${api.PERSONA_SET1_QUALITY_SENTENCE}`);
  assert.equal(input.hashes.systemPrompt, api.sha256(input.systemPrompt));
  assert.equal(api.PERSONA_VERDICTS.has("Ask"), true);
  assert.equal(api.PERSONA_VERDICTS.has("Rethink"), true);
});

test("catalogue filtering excludes specialised models and selects larger general tiers", async () => {
  const { api } = harness([], [{
    data: {
      models: [
        { name: "models/gemini-3.5-flash-lite", inputTokenLimit: 1000, outputTokenLimit: 100, supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.8-flash", inputTokenLimit: 2000, outputTokenLimit: 200, supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.1-pro-preview", inputTokenLimit: 3000, outputTokenLimit: 300, supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.1-flash-image", inputTokenLimit: 4000, outputTokenLimit: 400, supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-nano-banana-2.1", displayName: "Nano Banana 2.1", inputTokenLimit: 5000, outputTokenLimit: 500, supportedGenerationMethods: ["generateContent"] },
      ],
    },
  }]);
  const models = await api.listPersonaModels("synthetic");
  assert.deepEqual(Array.from(models, ({ name }) => name), [
    "gemini-3.1-pro-preview", "gemini-3.5-flash-lite", "gemini-3.8-flash",
  ]);
  assert.equal(api.isLargerTextTier("gemini-3.8-flash"), true);
  assert.equal(api.isLargerTextTier("gemini-3.1-pro-preview"), true);
  assert.equal(api.isLargerTextTier("gemini-3.5-flash-lite"), false);
});

test("persona batch accepts its four-verdict schema and writes the model-specific CSV", async () => {
  const { api, files, calls } = harness([response("Ask", "Which venue is it?")]);
  const result = await api.runOne(
    "plain", "gemini-3.5-flash-lite", [look], "Persona plus rules", "synthetic",
    false, "persona-set1-gemini-3.5-flash-lite.csv", true,
    "persona-set1-plain:gemini-3.5-flash-lite", true, true,
  );
  assert.equal(result.failures, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.generationConfig.temperature, 0);
  assert.equal(calls[0].body.systemInstruction.parts[0].text, "Persona plus rules");
  assert.deepEqual(Array.from(calls[0].body.generationConfig.responseSchema.properties.verdict.enum),
    ["Works", "Almost", "Rethink", "Ask"]);
  assert.equal(api.parseCsv(files.get(output("persona-set1-gemini-3.5-flash-lite.csv"))).rows[0].verdict, "Ask");
});

test("requested model ladder probes all eight exact IDs and computes latency percentiles", async () => {
  const { api } = harness();
  assert.deepEqual(Array.from(api.PERSONA_SET1_MODEL_LADDER), [
    "gemini-3.1-pro-preview", "gemini-pro-latest", "gemini-3.8-flash",
    "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3-flash-preview",
    "gemini-4-argon", "gemini-flash-latest",
  ]);
  assert.equal(api.PERSONA_SET1_TOKEN_CAP, 2_000_000);
  assert.equal(api.percentile([9, 1, 5, 3], 0.5), 3);
  assert.equal(api.percentile([9, 1, 5, 3], 0.95), 9);
  assert.equal(api.percentile([], 0.5), null);
});

test("minimal generation probe uses the classifier request builder and records status", async () => {
  const { api, calls } = harness([response("Works", "A valid minimal response.")]);
  const result = await api.probeModel("gemini-3.1-pro-preview", "synthetic");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "gemini-3.1-pro-preview");
  assert.equal(calls[0].body.generationConfig.temperature, 0);
  assert.equal(result.status, 200);
  assert.equal(result.success, true);
  assert.equal(result.tokens.total, 15);
});

test("model probe records a 404 and returns so the caller can continue", async () => {
  const { api } = harness([failure(404)]);
  const result = await api.probeModel("gemini-pro-latest", "synthetic");
  assert.equal(result.status, 404);
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "MODEL_NOT_FOUND");
});

test("model-ladder run stops on the fifth consecutive provider failure", async () => {
  const { api, calls } = harness(Array.from({ length: 5 }, () => failure(429)));
  const result = await api.runOne(
    "plain", "gemini-3.8-flash", [look], "Exact recorded prompt", "synthetic",
    false, "persona-set1-gemini-3.8-flash.csv", true,
    "persona-set1-plain:gemini-3.8-flash", false, true,
    { maxConsecutiveFailures: 5, stopAtConsecutiveLimit: true },
  );
  assert.equal(calls.length, 5);
  assert.equal(result.stoppedAfterConsecutiveFailures, true);
  assert.equal(result.failures, 1);
});

test("model-ladder run stops immediately after reported usage reaches its token cap", async () => {
  const { api, calls } = harness([response("Works", "Synthetic valid response.")]);
  const result = await api.runOne(
    "plain", "gemini-3.8-flash", [look, { ...look, id: "T01-B" }],
    "Exact recorded prompt", "synthetic", false,
    "persona-set1-gemini-3.8-flash.csv", true,
    "persona-set1-plain:gemini-3.8-flash", false, true,
    { reportedTokensBeforeRun: 1_999_990, maxReportedTokens: 2_000_000 },
  );
  assert.equal(calls.length, 1);
  assert.equal(result.stoppedForTokenCap, true);
  assert.equal(result.validRows, 1);
});

test("persona ladder stops after the first model access error", async () => {
  const { api, calls } = harness([failure(404)]);
  const result = await api.runOne(
    "plain", "gemini-3.6-flash", [look, { ...look, id: "T01-B" }],
    "Persona plus rules", "synthetic", false,
    "persona-set1-gemini-3.6-flash.csv", true,
    "persona-set1-plain:gemini-3.6-flash", true, true,
  );
  assert.equal(calls.length, 1);
  assert.equal(result.stoppedForAccessFailure, true);
});

test("Set 2 creates CSVs, retries 429/5xx serially and captures success headers", async () => {
  const { api, files, calls, logs } = harness([failure(429), failure(503), response()]);
  const result = await api.runOne("structured", "gemini-3.5-flash-lite", [look], "Set 2 rules", "synthetic", true);
  assert.equal(result.failures, 0);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].body.generationConfig.temperature, 0);
  assert.deepEqual(Array.from(calls[2].body.generationConfig.responseSchema.properties.verdict.enum),
    ["Works", "Almost", "Rethink", "Ask"]);
  assert.ok(calls[2].body.contents[0].parts[0].text.includes('"fabric":null'));
  assert.equal(api.parseCsv(files.get(output("set2-structured-primary.csv"))).rows[0].verdict, "Ask");
  assert.ok(logs[0].rateLimitObservations.some((entry) => entry.headers["x-ratelimit-limit"] === "100"));
});

test("resume preserves successful raw records and calls only failed rows", async () => {
  const { api, files, calls } = harness([response()]);
  const raw = 'T01-A,Works,"Existing, deliberately unquoted ID"';
  files.set(output("set2-plain-primary.csv"),
    `look_id,verdict,reason\n${raw}\n"T01-B","","REQUEST_FAILED_RATE_LIMITED"\n`);
  await api.runOne("plain", "gemini-3.5-flash-lite",
    [look, { ...look, id: "T01-B" }], "rules", "synthetic", true);
  assert.equal(calls.length, 1);
  assert.equal(files.get(output("set2-plain-primary.csv")).split("\n")[1], raw);
});

test("11 consecutive failed calls stop the batch", async () => {
  const { api, calls } = harness(Array.from({ length: 11 }, () => failure(429)));
  const result = await api.runOne("plain", "gemini-3.5-flash", [look], "rules", "synthetic", true);
  assert.equal(calls.length, 11);
  assert.equal(result.stoppedAfterConsecutiveFailures, true);
  assert.equal(result.failures, 1);
});

test("new command gates Set 2 on the Set 1 plain-fallback resume only", async () => {
  const { api, files, calls, logs } = harness(Array.from({ length: 11 }, () => failure(429)));
  const input = await api.loadInputs();
  files.set(output("plain-fallback.csv"), "look_id,verdict,reason\n" +
    input.looks.map((entry) => `"${entry.id}","","REQUEST_FAILED_RATE_LIMITED"`).join("\n") + "\n");
  await api.runSet2AndResume("synthetic");
  assert.equal(calls.length, 11);
  assert.ok(calls.every((call) => call.url === "gemini-3.5-flash"));
  assert.equal(logs.at(-1).run, "plain-fallback");
  assert.ok(!Array.from(files.keys()).some((name) => name.includes("set2-")));
});
