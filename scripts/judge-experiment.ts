import axios from "axios";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
const classifierReliability = require("../server/classifierReliability.ts") as {
    buildGeminiGenerationRequest: (options: {
      model: string;
      apiKey: string;
      baseRequestBody: Record<string, unknown>;
      maxOutputTokens: number;
      timeout: number;
      signal: AbortSignal;
    }) => { url: string; body: Record<string, any>; config: Record<string, unknown> };
    getClassifierModelOrder: () => readonly [string, string];
  };
if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
else process.env.NODE_ENV = originalNodeEnv;
const { buildGeminiGenerationRequest, getClassifierModelOrder } = classifierReliability;

const ROOT = process.cwd();
const LOOKS_PATH = path.join(ROOT, "attached_assets/looks_1793747164690.txt");
const RULES_PATH = path.join(ROOT, "attached_assets/rules_brief_1793747164689.md");
const FIXTURES_PATH = path.join(ROOT, "__tests__/fixtures/nigerian-v2-rating-set");
const OUTPUT_DIR = path.join(ROOT, "docs/reports/judge-experiment");
const REQUEST_TIMEOUT_MS = 60_000;
const VERDICTS = new Set(["Works", "Almost", "Rethink"]);
const OUTPUT_INSTRUCTIONS = [
  "Judge only the supplied scenario and look. Treat null or absent facts as unknown; do not infer them.",
  "Return exactly one JSON object with exactly two keys: verdict and reason.",
  'verdict must be exactly "Works", "Almost", or "Rethink".',
  "reason must be a plain-language explanation of no more than 15 words.",
  "Do not include any other text.",
].join("\n");
const SET2_PATHS = {
  looks: path.join(ROOT, "attached_assets/looks2_1793925449136.txt"),
  structured: path.join(ROOT, "attached_assets/looks2_1793925449136.json"),
  rules: path.join(ROOT, "attached_assets/rules_brief2_1793925434333.md"),
};
const SET2_VERDICTS = new Set([...VERDICTS, "Ask"]);
const SET2_INSTRUCTIONS = [
  "Judge only the supplied scenario and look. Treat null or absent facts as unknown; do not infer them.",
  "Return exactly one JSON object with exactly two keys: verdict and reason.",
  'verdict must be exactly "Works", "Almost", "Rethink", or "Ask".',
  "reason must be a plain-language explanation of no more than 15 words, using UK spelling.",
  "For Ask, the reason must name the missing decisive fact.",
  "Do not include any other text.",
].join("\n");

type LookInput = {
  id: string;
  plainText: string;
  structuredFacts: Record<string, unknown>;
};

type CsvRow = { look_id: string; verdict: string; reason: string };
type CsvRecord = CsvRow & { raw: string };

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function asCsv(rows: CsvRow[]): string {
  return [
    "look_id,verdict,reason",
    ...rows.map((row) =>
      [row.look_id, row.verdict, row.reason].map(csvCell).join(","),
    ),
  ].join("\n") + "\n";
}

function csvRecord(row: CsvRow): string {
  return [row.look_id, row.verdict, row.reason].map(csvCell).join(",");
}

function parseCsv(text: string): { header: string; rows: CsvRecord[] } {
  const records: Array<{ fields: string[]; raw: string }> = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else if (character === "\n") {
      fields.push(field);
      records.push({ fields, raw: text.slice(start, i) });
      fields = [];
      field = "";
      start = i + 1;
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("An existing CSV has an unterminated quoted field.");
  if (start < text.length || field || fields.length) {
    fields.push(field);
    records.push({ fields, raw: text.slice(start) });
  }

  const headerRecord = records.shift();
  if (!headerRecord || headerRecord.fields.join(",") !== "look_id,verdict,reason") {
    throw new Error("An existing CSV has an unexpected header.");
  }
  const rows = records.map(({ fields: cells, raw }) => {
    if (cells.length !== 3) throw new Error("An existing CSV row has an unexpected column count.");
    return { look_id: cells[0], verdict: cells[1], reason: cells[2], raw };
  });
  return { header: headerRecord.raw, rows };
}

async function writeCsvSnapshot(
  filePath: string,
  header: string,
  rows: CsvRecord[],
): Promise<void> {
  await writeFile(filePath, [header, ...rows.map((row) => row.raw)].join("\n") + "\n", "utf8");
}

async function readExistingCsv(filePath: string, looks: LookInput[], createMissing = false): Promise<{
  header: string;
  rows: CsvRecord[];
}> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error: any) {
    if (!createMissing || error?.code !== "ENOENT") throw error;
    text = asCsv(looks.map((look) => ({
      look_id: look.id, verdict: "", reason: "REQUEST_FAILED_NOT_ATTEMPTED",
    })));
    await writeFile(filePath, text, { encoding: "utf8", flag: "wx" });
  }
  const parsed = parseCsv(text);
  if (parsed.rows.length !== looks.length ||
      parsed.rows.some((row, index) => row.look_id !== looks[index]?.id)) {
    throw new Error("Existing CSV rows do not match the current look order.");
  }
  return parsed;
}

function parsePlainLooks(text: string, prefix = "S"): Map<string, string> {
  const result = new Map<string, string>();
  let scenarioTitle = "";
  let scenarioParagraph = "";

  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(new RegExp(`^(${prefix}\\d{2}) · (.+)$`));
    if (heading) {
      scenarioTitle = `${heading[1]} · ${heading[2]}`;
      scenarioParagraph = "";
      continue;
    }

    const look = line.match(new RegExp(`^\\s+(${prefix}\\d{2}-[A-D]):\\s*(.+)$`));
    if (look) {
      if (!scenarioTitle || !scenarioParagraph) {
        throw new Error(`Missing scenario paragraph for ${look[1]}.`);
      }
      if (result.has(look[1])) throw new Error(`Duplicate look ID ${look[1]}.`);
      result.set(look[1], `Scenario: ${scenarioTitle}\n${scenarioParagraph}\nLook: ${look[2]}`);
      continue;
    }

    const trimmed = line.trim();
    if (scenarioTitle && !scenarioParagraph && trimmed) scenarioParagraph = trimmed;
  }

  if (result.size !== 100) throw new Error(`Expected 100 plain-text looks; found ${result.size}.`);
  return result;
}

async function loadInputs(): Promise<{
  looks: LookInput[];
  rulesText: string;
  looksHash: string;
  rulesHash: string;
}> {
  const [looksBuffer, rulesText] = await Promise.all([
    readFile(LOOKS_PATH),
    readFile(RULES_PATH, "utf8"),
  ]);
  const plainLooks = parsePlainLooks(looksBuffer.toString("utf8"));
  const filenames = (await readdir(FIXTURES_PATH))
    .filter((name) => /^S\d{2}-[A-D]\.json$/.test(name))
    .sort();
  if (filenames.length !== 100) {
    throw new Error(`Expected 100 frozen fixture JSON files; found ${filenames.length}.`);
  }

  const fixtures = await Promise.all(filenames.map(async (filename) => {
    const fixture = JSON.parse(await readFile(path.join(FIXTURES_PATH, filename), "utf8"));
    if (fixture.id !== filename.slice(0, -5) || !fixture.lookFacts) {
      throw new Error(`Invalid fixture structure in ${filename}.`);
    }
    return [fixture.id, fixture.lookFacts] as const;
  }));
  const fixtureMap = new Map(fixtures);
  const ids = [...plainLooks.keys()].sort();
  if (ids.length !== fixtureMap.size || ids.some((id) => !fixtureMap.has(id))) {
    throw new Error("Plain-text looks and frozen fixture IDs do not match.");
  }

  return {
    looks: ids.map((id) => ({
      id,
      plainText: plainLooks.get(id)!,
      structuredFacts: fixtureMap.get(id)!,
    })),
    rulesText: rulesText.trim(),
    looksHash: sha256(looksBuffer),
    rulesHash: sha256(await readFile(RULES_PATH)),
  };
}

async function loadSet2Inputs() {
  const [plainBuffer, structuredBuffer, rulesBuffer] = await Promise.all([
    readFile(SET2_PATHS.looks), readFile(SET2_PATHS.structured), readFile(SET2_PATHS.rules),
  ]);
  const plain = parsePlainLooks(plainBuffer.toString("utf8"), "T");
  const entries = JSON.parse(structuredBuffer.toString("utf8"));
  if (!Array.isArray(entries) || entries.length !== 100) {
    throw new Error("Set 2 must contain exactly 100 structured entries.");
  }
  const structured = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    if (!/^T\d{2}-[A-D]$/.test(entry.look_id) || structured.has(entry.look_id) ||
        entry.scenario !== entry.look_id.slice(0, 3) ||
        typeof entry.brief !== "string" || !Array.isArray(entry.items) ||
        Object.keys(entry).sort().join(",") !== "brief,items,look_id,scenario") {
      throw new Error("Invalid or duplicate Set 2 structured entry.");
    }
    structured.set(entry.look_id, entry);
  }
  const ids = Array.from({ length: 25 }, (_, index) =>
    ["A", "B", "C", "D"].map((letter) => `T${String(index + 1).padStart(2, "0")}-${letter}`),
  ).flat();
  if (ids.some((id) => !plain.has(id) || !structured.has(id))) {
    throw new Error("Set 2 plain and structured IDs must match T01-A through T25-D.");
  }
  return {
    looks: ids.map((id) => ({
      id, plainText: plain.get(id)!, structuredFacts: structured.get(id)!,
    })),
    rulesText: rulesBuffer.toString("utf8").trim(),
    looksTextSha256: sha256(plainBuffer),
    looksJsonSha256: sha256(structuredBuffer),
    rulesBriefSha256: sha256(rulesBuffer),
  };
}

function responseText(response: any): string | null {
  const parts = response?.data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  return parts.map((part: any) => typeof part?.text === "string" ? part.text : "").join("").trim();
}

function refusal(response: any): boolean {
  const blockReason = response?.data?.promptFeedback?.blockReason;
  const finishReason = response?.data?.candidates?.[0]?.finishReason;
  return (typeof blockReason === "string" && blockReason !== "" &&
      blockReason !== "BLOCK_REASON_UNSPECIFIED") ||
    ["SAFETY", "IMAGE_SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(finishReason);
}

function decode(response: any, verdicts = VERDICTS): { verdict: string; reason: string } | null {
  const text = responseText(response);
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    if (
      !value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "reason,verdict" ||
      !verdicts.has(value.verdict) ||
      typeof value.reason !== "string" ||
      value.reason.trim().split(/\s+/).filter(Boolean).length > 15
    ) return null;
    return { verdict: value.verdict, reason: value.reason.trim() };
  } catch {
    return null;
  }
}

function providerFailureCode(error: any): string {
  const status = error?.response?.status;
  if (status === 429) return "RATE_LIMITED";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 401 || status === 403) return "PROVIDER_AUTH_ERROR";
  if (Number.isInteger(status) && status >= 500) return "PROVIDER_SERVER_ERROR";
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") return "REQUEST_TIMEOUT";
  return Number.isInteger(status) ? `PROVIDER_HTTP_${status}` : "NETWORK_ERROR";
}

function headerValue(headers: any, name: string): string | null {
  const value = typeof headers?.get === "function" ? headers.get(name) : headers?.[name];
  if (value === undefined || value === null) return null;
  return String(value).replace(/[^\x20-\x7e]/g, "").slice(0, 120);
}

function rateLimitEvidence(error: any): {
  headers: Record<string, string>;
  quotaDetails: Array<Record<string, string>>;
  retryAfterMs: number;
} {
  const response = error?.response;
  const headers: Record<string, string> = {};
  for (const name of [
    "retry-after",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
  ]) {
    const value = headerValue(response?.headers, name);
    if (value !== null) headers[name] = value;
  }

  const retryAfter = headers["retry-after"];
  const numericRetry = retryAfter && Number.isFinite(Number(retryAfter))
    ? Number(retryAfter) * 1000
    : retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 0;
  const details = response?.data?.error?.details;
  const quotaDetails: Array<Record<string, string>> = [];
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (!Array.isArray(detail?.violations)) continue;
      for (const violation of detail.violations) {
        const safe: Record<string, string> = {};
        for (const key of ["quotaId", "quotaMetric", "quotaValue"]) {
          const value = violation?.[key];
          if (typeof value === "string" || typeof value === "number") {
            safe[key] = String(value).slice(0, 160);
          }
        }
        if (Object.keys(safe).length) quotaDetails.push(safe);
      }
    }
  }
  return {
    headers,
    quotaDetails,
    retryAfterMs: Number.isFinite(numericRetry) ? Math.max(0, numericRetry) : 0,
  };
}

function tokenUsage(response: any): { prompt: number; candidate: number; total: number } {
  const usage = response?.data?.usageMetadata ?? {};
  return {
    prompt: Number.isFinite(usage.promptTokenCount) ? usage.promptTokenCount : 0,
    candidate: Number.isFinite(usage.candidatesTokenCount) ? usage.candidatesTokenCount : 0,
    total: Number.isFinite(usage.totalTokenCount) ? usage.totalTokenCount : 0,
  };
}

const CALL_SPACING_MS = 5_000;
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES = 10;

function retryDelay(retryNumber: number, retryAfterMs: number): number {
  const exponential = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** (retryNumber - 1));
  return Math.min(MAX_BACKOFF_MS, Math.max(CALL_SPACING_MS, exponential, retryAfterMs));
}

async function runOne(
  mode: "plain" | "structured",
  model: string,
  looks: LookInput[],
  systemText: string,
  apiKey: string,
  set2 = false,
): Promise<{ rowCount: number; failures: number; stoppedAfterConsecutiveFailures: boolean }> {
  const role = model === (set2 ? "gemini-3.5-flash-lite" : getClassifierModelOrder()[0])
    ? "primary" : "fallback";
  const filename = `${set2 ? "set2-" : ""}${mode}-${role}.csv`;
  const filePath = path.join(OUTPUT_DIR, filename);
  const { header, rows } = await readExistingCsv(filePath, looks, set2);
  const verdicts = set2 ? SET2_VERDICTS : VERDICTS;
  const tokens = { prompt: 0, candidate: 0, total: 0, unreported: 0 };
  let refusals = 0;
  let parseFailures = 0;
  const requestFailures: Record<string, number> = {};
  const rateLimitObservations = new Map<string, {
    headers: Record<string, string>;
    quotaDetails: Array<Record<string, string>>;
  }>();
  let calls = 0;
  let successfulResponses = 0;
  let consecutiveFailures = 0;
  let stoppedAfterConsecutiveFailures = false;
  let waitBeforeNextCall = 0;
  let lastCallAt = 0;

  for (let index = 0; index < looks.length; index++) {
    if (set2 ? Boolean(rows[index].verdict) : !rows[index].reason.startsWith("REQUEST_FAILED_")) continue;
    const look = looks[index];
    let retriesForRow = 0;

    while (true) {
      const waitMs = Math.max(waitBeforeNextCall, lastCallAt ? CALL_SPACING_MS - (Date.now() - lastCallAt) : 0);
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      waitBeforeNextCall = 0;

      const userText = mode === "plain"
        ? look.plainText
        : `Look ID: ${look.id}\nStructured facts (null means unknown):\n${JSON.stringify(look.structuredFacts)}`;
      const request = buildGeminiGenerationRequest({
        model,
        apiKey,
        baseRequestBody: {
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                verdict: { type: "STRING", enum: [...verdicts] },
                reason: { type: "STRING" },
              },
              required: ["verdict", "reason"],
            },
          },
        },
        maxOutputTokens: 128,
        timeout: REQUEST_TIMEOUT_MS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      calls++;
      lastCallAt = Date.now();

      try {
        const response = await axios.post(request.url, request.body, request.config);
        const successEvidence = rateLimitEvidence({ response });
        if (Object.keys(successEvidence.headers).length) {
          rateLimitObservations.set(JSON.stringify(successEvidence.headers), {
            headers: successEvidence.headers, quotaDetails: [],
          });
        }
        successfulResponses++;
        consecutiveFailures = 0;
        const usage = tokenUsage(response);
        tokens.prompt += usage.prompt;
        tokens.candidate += usage.candidate;
        tokens.total += usage.total;
        if (!usage.total) tokens.unreported++;

        if (refusal(response)) {
          refusals++;
          rows[index] = { ...rows[index], verdict: "", reason: "REFUSAL", raw: csvRecord({
            look_id: look.id, verdict: "", reason: "REFUSAL",
          }) };
        } else {
          const parsed = decode(response, verdicts);
          if (!parsed) {
            parseFailures++;
            rows[index] = { ...rows[index], verdict: "", reason: "PARSE_FAILURE", raw: csvRecord({
              look_id: look.id, verdict: "", reason: "PARSE_FAILURE",
            }) };
          } else {
            rows[index] = { ...rows[index], ...parsed, raw: csvRecord({
              look_id: look.id, ...parsed,
            }) };
          }
        }
        await writeCsvSnapshot(filePath, header, rows);
        break;
      } catch (error: any) {
        tokens.unreported++;
        consecutiveFailures++;
        const code = providerFailureCode(error);
        requestFailures[code] = (requestFailures[code] ?? 0) + 1;
        const row = { look_id: look.id, verdict: "", reason: `REQUEST_FAILED_${code}` };
        rows[index] = { ...rows[index], ...row, raw: csvRecord(row) };
        await writeCsvSnapshot(filePath, header, rows);

        const evidence = rateLimitEvidence(error);
        if (Object.keys(evidence.headers).length || evidence.quotaDetails.length) {
          rateLimitObservations.set(JSON.stringify(evidence), {
            headers: evidence.headers,
            quotaDetails: evidence.quotaDetails,
          });
        }
        const status = error?.response?.status;
        if ((status === 429 || (Number.isInteger(status) && status >= 500)) &&
            consecutiveFailures <= MAX_CONSECUTIVE_FAILURES) {
          retriesForRow++;
          waitBeforeNextCall = retryDelay(retriesForRow, evidence.retryAfterMs);
        } else {
          if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
            stoppedAfterConsecutiveFailures = true;
            break;
          }
          break;
        }
      }

      if (stoppedAfterConsecutiveFailures) break;
    }
    if (stoppedAfterConsecutiveFailures) break;
  }

  const failures = rows.filter((row) => !row.verdict).length;
  console.log(JSON.stringify({
    run: `${set2 ? "set2-" : ""}${mode}-${role}`,
    model,
    rowCount: rows.length,
    callsThisResume: calls,
    successfulResponsesThisResume: successfulResponses,
    remainingFailures: failures,
    tokens,
    refusals,
    parseFailures,
    requestFailures,
    consecutiveFailures,
    stoppedAfterConsecutiveFailures,
    rateLimitObservations: [...rateLimitObservations.values()],
    csv: path.join("docs/reports/judge-experiment", filename),
  }));
  return { rowCount: rows.length, failures, stoppedAfterConsecutiveFailures };
}

async function runSet2AndResume(apiKey: string): Promise<void> {
  const set1 = await loadInputs();
  const set2 = await loadSet2Inputs();
  const [primary, fallback] = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];
  if (getClassifierModelOrder()[1] !== fallback) {
    throw new Error("Set 1 fallback configuration no longer matches gemini-3.5-flash.");
  }
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(JSON.stringify({
    set: 1, primaryModel: getClassifierModelOrder()[0], fallbackModel: fallback,
    looksSha256: set1.looksHash, rulesBriefSha256: set1.rulesHash,
    promptTextSha256: sha256(`${set1.rulesText}\n\n${OUTPUT_INSTRUCTIONS}`),
    scope: "plain-fallback only",
  }));
  const resumed = await runOne(
    "plain", fallback, set1.looks, `${set1.rulesText}\n\n${OUTPUT_INSTRUCTIONS}`, apiKey,
  );
  if (resumed.failures || resumed.stoppedAfterConsecutiveFailures) return;
  const systemText = `${set2.rulesText}\n\n${SET2_INSTRUCTIONS}`;
  console.log(JSON.stringify({
    set: 2, primaryModel: primary, fallbackModel: fallback,
    looksTextSha256: set2.looksTextSha256, looksJsonSha256: set2.looksJsonSha256,
    rulesBriefSha256: set2.rulesBriefSha256, promptTextSha256: sha256(systemText),
  }));
  for (const [mode, model] of [
    ["plain", primary], ["plain", fallback],
    ["structured", primary], ["structured", fallback],
  ] as const) {
    const result = await runOne(mode, model, set2.looks, systemText, apiKey, true);
    if (result.failures || result.stoppedAfterConsecutiveFailures) break;
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required; its value is never printed.");
  if (process.argv.includes("--set2-and-resume")) return runSet2AndResume(apiKey);

  const { looks, rulesText, looksHash, rulesHash } = await loadInputs();
  const [primary, fallback] = getClassifierModelOrder();
  const systemText = `${rulesText}\n\n${OUTPUT_INSTRUCTIONS}`;
  const promptHash = sha256(systemText);
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(JSON.stringify({
    looksSha256: looksHash,
    rulesBriefSha256: rulesHash,
    promptTextSha256: promptHash,
    primaryModel: primary,
    fallbackModel: fallback,
  }));

  const orderedBatches = [
    ["plain", primary],
    ["plain", fallback],
    ["structured", primary],
    ["structured", fallback],
  ] as const;
  for (const [mode, model] of orderedBatches) {
    const result = await runOne(mode, model, looks, systemText, apiKey);
    if (result.failures > 0 || result.stoppedAfterConsecutiveFailures) break;
  }
}

main().catch((error: any) => {
  console.error(error?.message ?? "Judge experiment failed. Model response text is not logged.");
  process.exitCode = 1;
});
