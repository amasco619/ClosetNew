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
  + "\nexport { loadInputs, loadSet2Inputs, decode, runOne, runSet2AndResume, parseCsv, sha256, OUTPUT_INSTRUCTIONS, SET2_INSTRUCTIONS, SET2_VERDICTS };";
const code = transformSync(testSource, { loader: "ts", format: "cjs" }).code;

function harness(responses = []) {
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
    readFile: async (name, ...args) => files.has(name) ? files.get(name) : fs.readFile(name, ...args),
    writeFile: async (name, value) => { files.set(name, value); },
    mkdir: async () => {},
  };
  const axios = {
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
