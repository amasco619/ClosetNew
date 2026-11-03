import axios from "axios";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, readdir, writeFile } from "node:fs/promises";
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
  "reason must be a plain-language explanation of no more than 15 words, using UK spelling.",
  "Do not include any other text.",
].join("\n");

type LookInput = {
  id: string;
  plainText: string;
  structuredFacts: Record<string, unknown>;
};

type CsvRow = { look_id: string; verdict: string; reason: string };

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

function parsePlainLooks(text: string): Map<string, string> {
  const result = new Map<string, string>();
  let scenarioTitle = "";
  let scenarioParagraph = "";

  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^(S\d{2}) · (.+)$/);
    if (heading) {
      scenarioTitle = `${heading[1]} · ${heading[2]}`;
      scenarioParagraph = "";
      continue;
    }

    const look = line.match(/^\s+(S\d{2}-[A-D]):\s*(.+)$/);
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

function decode(response: any): { verdict: string; reason: string } | null {
  const text = responseText(response);
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    if (
      !value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "reason,verdict" ||
      !VERDICTS.has(value.verdict) ||
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

function tokenUsage(response: any): { prompt: number; candidate: number; total: number } {
  const usage = response?.data?.usageMetadata ?? {};
  return {
    prompt: Number.isFinite(usage.promptTokenCount) ? usage.promptTokenCount : 0,
    candidate: Number.isFinite(usage.candidatesTokenCount) ? usage.candidatesTokenCount : 0,
    total: Number.isFinite(usage.totalTokenCount) ? usage.totalTokenCount : 0,
  };
}

async function runOne(
  mode: "plain" | "structured",
  model: string,
  looks: LookInput[],
  systemText: string,
  apiKey: string,
): Promise<void> {
  const rows: CsvRow[] = [];
  const tokens = { prompt: 0, candidate: 0, total: 0, unreported: 0 };
  let refusals = 0;
  let parseFailures = 0;
  const requestFailures: Record<string, number> = {};

  for (const look of looks) {
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
              verdict: { type: "STRING", enum: ["Works", "Almost", "Rethink"] },
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

    try {
      const response = await axios.post(request.url, request.body, request.config);
      const usage = tokenUsage(response);
      tokens.prompt += usage.prompt;
      tokens.candidate += usage.candidate;
      tokens.total += usage.total;
      if (!usage.total) tokens.unreported++;

      if (refusal(response)) {
        refusals++;
        rows.push({ look_id: look.id, verdict: "", reason: "REFUSAL" });
        continue;
      }

      const parsed = decode(response);
      if (!parsed) {
        parseFailures++;
        rows.push({ look_id: look.id, verdict: "", reason: "PARSE_FAILURE" });
        continue;
      }
      rows.push({ look_id: look.id, ...parsed });
    } catch (error) {
      tokens.unreported++;
      const code = providerFailureCode(error);
      requestFailures[code] = (requestFailures[code] ?? 0) + 1;
      rows.push({ look_id: look.id, verdict: "", reason: `REQUEST_FAILED_${code}` });
    }
  }

  const filename = `${mode}-${model === getClassifierModelOrder()[0] ? "primary" : "fallback"}.csv`;
  await writeFile(path.join(OUTPUT_DIR, filename), asCsv(rows), "utf8");
  console.log(JSON.stringify({
    run: `${mode}-${model === getClassifierModelOrder()[0] ? "primary" : "fallback"}`,
    model,
    calls: rows.length,
    tokens,
    refusals,
    parseFailures,
    requestFailures,
    csv: path.join("docs/reports/judge-experiment", filename),
  }));
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required; its value is never printed.");

  const { looks, rulesText, looksHash, rulesHash } = await loadInputs();
  const [primary, fallback] = getClassifierModelOrder();
  const systemText = `${rulesText}\n\n${OUTPUT_INSTRUCTIONS}`;
  const promptHash = sha256(systemText);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(JSON.stringify({
    looksSha256: looksHash,
    rulesBriefSha256: rulesHash,
    promptTextSha256: promptHash,
    primaryModel: primary,
    fallbackModel: fallback,
  }));

  for (const mode of ["plain", "structured"] as const) {
    for (const model of [primary, fallback]) {
      await runOne(mode, model, looks, systemText, apiKey);
    }
  }
}

main().catch((error: any) => {
  console.error(error?.message ?? "Judge experiment failed. Model response text is not logged.");
  process.exitCode = 1;
});
