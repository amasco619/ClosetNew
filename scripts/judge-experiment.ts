import axios from "axios";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
const PERSONA_SET1_PATHS = {
  persona: path.join(ROOT, "attached_assets/persona_prompt_1793963385991.md"),
  looks: path.join(ROOT, "attached_assets/looks_1793963398343.txt"),
  rules: path.join(ROOT, "attached_assets/rules_brief2_1793963421270.md"),
};
const PERSONA_SET1_QUALITY_SENTENCE =
  "Descriptions that say thin or shiny mean poor quality; premium or heavy mean good quality.";
const PERSONA_SET1_MODEL_LADDER = [
  "gemini-3.1-pro-preview",
  "gemini-pro-latest",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3-flash-preview",
  "gemini-4-argon",
  "gemini-flash-latest",
];
const PERSONA_SET1_TOKEN_CAP = 2_000_000;
const PERSONA_SET1_RUN_PATH = path.join(OUTPUT_DIR, "persona-set1-run.jsonl");
const PERSONA_SET1_TUNING_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-pro-latest",
  "gemini-3.7-flash",
  "gemini-4-argon",
];
const PERSONA_SET1_TUNING_EXAMPLES_PATH =
  path.join(ROOT, "attached_assets/fewshot_examples_1794012527523.md");
const PERSONA_SET1_TUNING_EXAMPLE_IDS = new Set([
  "S01-A", "S01-C", "S11-D", "S13-C", "S12-D", "S09-D", "S12-B", "S25-A", "S03-A",
]);
const PERSONA_SET1_TUNING_THINKING_LEVELS: Record<string, string> = {
  "gemini-3.5-flash": "minimal",
  "gemini-3.1-pro-preview": "low",
  "gemini-pro-latest": "low",
  // 3.7 Flash is deprecated and routes to 3.8 Flash; low is the lowest supported level.
  "gemini-3.7-flash": "low",
  "gemini-4-argon": "low",
};
const PERSONA_SET1_TUNING_PRICES: Record<string, {
  inputPerMillion: number;
  outputPerMillion: number;
  basis: string;
}> = {
  "gemini-3.5-flash": {
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
    basis: "Published Gemini 3.6 Flash rate; gemini-3.5-flash was previously observed resolving to 3.6 Flash.",
  },
  "gemini-3.1-pro-preview": {
    inputPerMillion: 2,
    outputPerMillion: 12,
    basis: "Published Gemini 3.1 Pro Preview rate for prompts under 200k tokens.",
  },
  "gemini-pro-latest": {
    inputPerMillion: 2,
    outputPerMillion: 12,
    basis: "Estimate using the published Gemini 3.1 Pro Preview rate; alias billing resolution is not established.",
  },
  "gemini-3.7-flash": {
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
    basis: "Published Gemini 3.8 Flash rate; 3.7 Flash is deprecated and requests route to 3.8 Flash.",
  },
  "gemini-4-argon": {
    inputPerMillion: 2,
    outputPerMillion: 10,
    basis: "Published Gemini 4 Argon Standard rate through November 30, 2026.",
  },
};
const PERSONA_SET1_TUNING_PRICE_SOURCE =
  "https://ai.google.dev/gemini-api/docs/pricing (Standard paid-tier prices retrieved 2026-11-07)";
const PERSONA_SET1_TUNING_THINKING_SOURCE =
  "https://ai.google.dev/gemini-api/docs/generate-content/thinking (retrieved 2026-11-07)";
const PERSONA_SET1_TUNING_EXTRA_INSTRUCTIONS = [
  "For arm C, override the earlier two-key reply instruction and return exactly the failures, verdict, and reason fields required by the response schema.",
  "List only independent failures supported by a stated rule or clear styling logic.",
  "Do not list taste preferences as failures.",
  "Return a short string for each independent failure.",
  "If a decisive unstated fact would change the result, set verdict to Ask and name that fact in reason.",
].join("\n");
const PERSONA_SET1_TUNING_VERDICTS = new Set(["Works", "Almost", "Rethink", "Ask"]);
const PERSONA_VERDICTS = new Set(["Works", "Almost", "Rethink", "Ask"]);
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
const SET2_CONFIRMATION_PROMPT_HASHES = {
  B: "e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf",
  C: "eedf6445cfb017e793ebe0451df5649d239cf918e8ae83bca4f7ee32f97a6368",
};
const SET2_CONFIRMATION_TOKEN_CAP = 1_000_000;
const SET2_CONFIRMATION_MAX_OUTPUT_TOKENS = 1024;
const SET2_CONFIRMATION_REQUEST_OVERHEAD_RESERVE = 1024;
const SET3A_PATH = path.join(ROOT, "attached_assets/looks3_1794220715219.txt");
const SET3A_INPUT_SHA256 = "dc4c09fbd4e566ab41298cba7b70cb9a8260a6f04ed7b471296039b8593ed068";
const SET3A_PROMPT_SHA256 = SET2_CONFIRMATION_PROMPT_HASHES.B;
const SET3A_TOKEN_CAP = 600_000;
const SET3A_MAX_OUTPUT_TOKENS = 1024;
const SET3A_PRICE = {
  inputPerMillion: 0.75,
  outputPerMillion: 3.75,
  basis: "Published Gemini 3.6 Flash rate; prior calls observed gemini-3.5-flash serving gemini-3.6-flash.",
};
const SET3A_RUNS = [
  { id: "arm-b-ask-allowed", filename: "set3a-arm-b-ask-allowed.csv", allowAsk: true, qualityStripped: false },
  { id: "arm-b-ask-removed", filename: "set3a-arm-b-ask-removed.csv", allowAsk: false, qualityStripped: false },
  { id: "arm-b-quality-stripped", filename: "set3a-arm-b-quality-stripped.csv", allowAsk: true, qualityStripped: true },
] as const;
const SET2_CONFIRMATION_PRICE_SOURCE =
  "https://ai.google.dev/gemini-api/docs/pricing (Standard paid-tier prices retrieved 2026-11-07)";
const SET2_CONFIRMATION_PRICES = {
  "gemini-3.5-flash": {
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
    basis: "Published Gemini 3.6 Flash rate; prior calls observed gemini-3.5-flash serving gemini-3.6-flash.",
  },
  "gemini-3.5-flash-lite": {
    inputPerMillion: 0.3,
    outputPerMillion: 2.5,
    basis: "Published Gemini 3.5 Flash-Lite Standard rate.",
  },
} as const;
const SET2_CONFIRMATION_RUNS = [
  {
    id: "flash-b-ask",
    filename: "set2-confirmation-gemini-3.5-flash-arm-b-ask.csv",
    model: "gemini-3.5-flash",
    arm: "B",
    includeAsk: true,
  },
  {
    id: "flash-c-ask",
    filename: "set2-confirmation-gemini-3.5-flash-arm-c-ask.csv",
    model: "gemini-3.5-flash",
    arm: "C",
    includeAsk: true,
  },
  {
    id: "flash-b-no-ask",
    filename: "set2-confirmation-gemini-3.5-flash-arm-b-no-ask.csv",
    model: "gemini-3.5-flash",
    arm: "B",
    includeAsk: false,
  },
  {
    id: "flash-c-no-ask",
    filename: "set2-confirmation-gemini-3.5-flash-arm-c-no-ask.csv",
    model: "gemini-3.5-flash",
    arm: "C",
    includeAsk: false,
  },
  {
    id: "flash-lite-b-info",
    filename: "set2-confirmation-gemini-3.5-flash-lite-arm-b-info.csv",
    model: "gemini-3.5-flash-lite",
    arm: "B",
    includeAsk: true,
  },
] as const;
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

function parsePlainLooks(text: string, prefix = "S", expectedCount = 100): Map<string, string> {
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

  if (result.size !== expectedCount) {
    throw new Error(`Expected ${expectedCount} plain-text looks; found ${result.size}.`);
  }
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

function buildPersonaSystemPrompt(personaText: string, rulesText: string): string {
  return `${personaText.trim()}\n\n${rulesText.trim()}\n\n${PERSONA_SET1_QUALITY_SENTENCE}`;
}

function buildTuningSystemPrompts(basePrompt: string, examplesText: string): Record<"A" | "B" | "C", string> {
  const withExamples = `${basePrompt}\n\n${examplesText.trim()}`;
  return {
    A: basePrompt,
    B: withExamples,
    C: `${withExamples}\n\n${PERSONA_SET1_TUNING_EXTRA_INSTRUCTIONS}`,
  };
}

function buildTuningSchema(arm: "A" | "B" | "C"): Record<string, any> {
  const properties: Record<string, any> = {
    verdict: { type: "STRING", enum: [...PERSONA_SET1_TUNING_VERDICTS] },
    reason: { type: "STRING" },
  };
  if (arm === "C") {
    properties.failures = { type: "ARRAY", items: { type: "STRING" } };
  }
  return {
    type: "OBJECT",
    properties,
    required: arm === "C" ? ["failures", "verdict", "reason"] : ["verdict", "reason"],
  };
}

function buildSet2ConfirmationSchema(
  arm: "B" | "C",
  includeAsk: boolean,
): Record<string, any> {
  const schema = buildTuningSchema(arm);
  schema.properties.verdict.enum = [...PERSONA_SET1_TUNING_VERDICTS]
    .filter((verdict) => includeAsk || verdict !== "Ask");
  return schema;
}

function decodeTuning(
  response: any,
  arm: "A" | "B" | "C",
): { verdict: string; reason: string; failures: string[]; modelVerdict: string } | null {
  const text = responseText(response);
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    const expectedKeys = arm === "C" ? "failures,reason,verdict" : "reason,verdict";
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== expectedKeys ||
        !PERSONA_SET1_TUNING_VERDICTS.has(value.verdict) ||
        typeof value.reason !== "string" ||
        value.reason.trim().split(/\s+/).filter(Boolean).length > 15) return null;

    if (arm !== "C") {
      return {
        verdict: value.verdict,
        reason: value.reason.trim(),
        failures: [],
        modelVerdict: value.verdict,
      };
    }
    if (!Array.isArray(value.failures) ||
        value.failures.some((failure: unknown) =>
          typeof failure !== "string" || !failure.trim())) return null;
    const failures = value.failures.map((failure: string) => failure.trim());
    const verdict = value.verdict === "Ask"
      ? "Ask"
      : failures.length === 0 ? "Works" : failures.length === 1 ? "Almost" : "Rethink";
    return { verdict, reason: value.reason.trim(), failures, modelVerdict: value.verdict };
  } catch {
    return null;
  }
}

function decodeSet2Confirmation(
  response: any,
  arm: "B" | "C",
  includeAsk: boolean,
): { verdict: string; reason: string; failures: string[] } | null {
  const decoded = decodeTuning(response, arm);
  if (!decoded || (!includeAsk && decoded.modelVerdict === "Ask")) return null;
  return {
    verdict: decoded.verdict,
    reason: decoded.reason,
    failures: decoded.failures,
  };
}

function tuningUsage(response: any): {
  input: number; output: number; thinking: number; total: number | null;
} {
  const usage = response?.data?.usageMetadata ?? {};
  return {
    input: Number.isFinite(usage.promptTokenCount) ? usage.promptTokenCount : 0,
    output: Number.isFinite(usage.candidatesTokenCount) ? usage.candidatesTokenCount : 0,
    thinking: Number.isFinite(usage.thoughtsTokenCount) ? usage.thoughtsTokenCount : 0,
    total: Number.isFinite(usage.totalTokenCount) ? usage.totalTokenCount : null,
  };
}

function tuningCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number,
): number {
  const price = PERSONA_SET1_TUNING_PRICES[model];
  if (!price) throw new Error(`No published-price estimate is configured for ${model}.`);
  return Number((
    inputTokens * price.inputPerMillion / 1_000_000 +
    (outputTokens + thinkingTokens) * price.outputPerMillion / 1_000_000
  ).toFixed(8));
}

function tuningCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function tuningCsv(rows: Array<{
  look_id: string; verdict: string; reason: string; failures: string[]; example_flag: string;
}>): string {
  return [
    "look_id,verdict,reason,failures,example_flag",
    ...rows.map((row) => [
      row.look_id, row.verdict, row.reason, JSON.stringify(row.failures), row.example_flag,
    ].map(tuningCsvCell).join(",")),
  ].join("\n") + "\n";
}

function tuningExampleFlag(lookId: string, arm: "A" | "B" | "C"): string {
  return arm !== "A" && PERSONA_SET1_TUNING_EXAMPLE_IDS.has(lookId) ? "example" : "";
}

function tuningFinishReason(response: any): string | null {
  const reason = response?.data?.candidates?.[0]?.finishReason;
  return typeof reason === "string" ? reason : null;
}

async function loadPersonaSet1TuningInputs(): Promise<{
  looks: LookInput[];
  examplesText: string;
  examplesHash: string;
  prompts: Record<"A" | "B" | "C", string>;
  inputHashes: Record<string, string>;
}> {
  const inputs = await loadPersonaSet1Inputs();
  const expected = {
    persona: "838624bfa69c3530af58384170b84b2ab7cca387660bd5e387927b08990b79ef",
    rules: "a0dc2a8d9661f23d5d685805f3c781073fe8ff7fbfc4f244c0f995bb65ac7c2c",
    systemPrompt: "3024fe78a9d1157b9713eee92691713a18150328375f8eff10c065701f6b82d5",
    looks: "939d3fd63f10e17fd33fa3dfae452a6141957a959c206ed2ceb949c679b670cc",
  };
  for (const [key, expectedHash] of Object.entries(expected)) {
    if (inputs.hashes[key as keyof typeof inputs.hashes] !== expectedHash) {
      throw new Error(`Set 1 ${key} SHA-256 changed; refusing to run prompt tuning.`);
    }
  }
  const examplesBuffer = await readFile(PERSONA_SET1_TUNING_EXAMPLES_PATH);
  const examplesText = examplesBuffer.toString("utf8");
  const examplesHash = sha256(examplesBuffer);
  const prompts = buildTuningSystemPrompts(inputs.systemPrompt, examplesText);
  return {
    looks: inputs.looks,
    examplesText,
    examplesHash,
    prompts,
    inputHashes: {
      ...inputs.hashes,
      fewshotExamples: examplesHash,
      promptA: sha256(prompts.A),
      promptB: sha256(prompts.B),
      promptC: sha256(prompts.C),
    },
  };
}

type TuningArm = "A" | "B" | "C";
type TuningCsvRow = {
  look_id: string;
  verdict: string;
  reason: string;
  failures: string[];
  example_flag: string;
};
type TuningMetrics = {
  calls: number;
  validRows: number;
  parseFailures: number;
  requestFailures: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  unreportedUsageCalls: number;
  latenciesMs: number[];
  finishReasons: Array<string | null>;
  thoughtsTokenCounts: Array<number | null>;
};
type TuningRuntime = {
  reportedTokens: number;
  lastCallAt: number;
  consecutiveFailuresByModel: Map<string, number>;
  stoppedModels: Set<string>;
  stopReasonByModel: Map<string, string>;
  tokenCapReached: boolean;
};

function emptyTuningRow(look: LookInput, arm: TuningArm, reason: string): TuningCsvRow {
  return {
    look_id: look.id,
    verdict: "",
    reason,
    failures: [],
    example_flag: tuningExampleFlag(look.id, arm),
  };
}

function modelThinkingLevel(model: string): string {
  const level = PERSONA_SET1_TUNING_THINKING_LEVELS[model];
  if (!level) throw new Error(`No minimum thinking level is set for ${model}.`);
  return level;
}

function newTuningMetrics(): TuningMetrics {
  return {
    calls: 0, validRows: 0, parseFailures: 0, requestFailures: {},
    inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0,
    unreportedUsageCalls: 0, latenciesMs: [], finishReasons: [], thoughtsTokenCounts: [],
  };
}

async function priorPromptTuningUsage(): Promise<{ calls: number; tokens: number }> {
  let text: string;
  try {
    text = await readFile(PERSONA_SET1_RUN_PATH, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return { calls: 0, tokens: 0 };
    throw error;
  }
  const calls = text.split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((record) => record.type === "persona-set1-tuning-call");
  return {
    calls: calls.length,
    tokens: calls.reduce((sum, record) =>
      sum + (Number.isFinite(record.totalTokenCount) ? record.totalTokenCount : 0), 0),
  };
}

function tuningRunSummary(model: string, arm: TuningArm, metrics: TuningMetrics) {
  const price = PERSONA_SET1_TUNING_PRICES[model];
  const costUsd = tuningCostUsd(
    model, metrics.inputTokens, metrics.outputTokens, metrics.thinkingTokens,
  );
  return {
    model,
    arm,
    thinkingLevel: modelThinkingLevel(model),
    calls: metrics.calls,
    validRows: metrics.validRows,
    parseFailures: metrics.parseFailures,
    requestFailures: metrics.requestFailures,
    tokens: {
      input: metrics.inputTokens,
      output: metrics.outputTokens,
      thinking: metrics.thinkingTokens,
      reportedTotal: metrics.totalTokens,
      unreportedUsageCalls: metrics.unreportedUsageCalls,
    },
    latencyMs: {
      median: percentile(metrics.latenciesMs, 0.5),
      p95: percentile(metrics.latenciesMs, 0.95),
    },
    estimatedCostUsd: costUsd,
    priceBasis: price.basis,
  };
}

async function appendTuningRecord(record: Record<string, unknown>): Promise<void> {
  const text = JSON.stringify(record);
  console.log(text);
  await appendFile(PERSONA_SET1_RUN_PATH, `${text}\n`);
}

async function runTuningCalls(
  looks: LookInput[],
  model: string,
  arm: TuningArm,
  systemPrompt: string,
  apiKey: string,
  runtime: TuningRuntime,
  metrics: TuningMetrics,
): Promise<Map<string, TuningCsvRow>> {
  const rows = new Map<string, TuningCsvRow>();
  const thinkingLevel = modelThinkingLevel(model);
  for (const look of looks) {
    if (runtime.stoppedModels.has(model)) {
      rows.set(look.id, emptyTuningRow(
        look, arm, `NOT_RUN_${runtime.stopReasonByModel.get(model) ?? "MODEL_STOPPED"}`,
      ));
      continue;
    }
    if (runtime.reportedTokens >= PERSONA_SET1_TOKEN_CAP) {
      runtime.tokenCapReached = true;
      rows.set(look.id, emptyTuningRow(look, arm, "NOT_RUN_TOKEN_CAP"));
      continue;
    }
    const spacingMs = runtime.lastCallAt
      ? Math.max(0, CALL_SPACING_MS - (Date.now() - runtime.lastCallAt)) : 0;
    if (spacingMs) await new Promise((resolve) => setTimeout(resolve, spacingMs));
    const userText = look.plainText;
    const requestStartedAt = Date.now();
    const request = buildGeminiGenerationRequest({
      model,
      apiKey,
      baseRequestBody: {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: buildTuningSchema(arm),
          thinkingConfig: { thinkingLevel },
        },
      },
      maxOutputTokens: 1024,
      timeout: REQUEST_TIMEOUT_MS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    runtime.lastCallAt = Date.now();
    metrics.calls++;
    try {
      const response = await axios.post(request.url, request.body, request.config);
      const latencyMs = Date.now() - requestStartedAt;
      metrics.latenciesMs.push(latencyMs);
      const usage = tuningUsage(response);
      const finishReason = tuningFinishReason(response);
      metrics.inputTokens += usage.input;
      metrics.outputTokens += usage.output;
      metrics.thinkingTokens += usage.thinking;
      metrics.finishReasons.push(finishReason);
      metrics.thoughtsTokenCounts.push(
        Number.isFinite(response?.data?.usageMetadata?.thoughtsTokenCount)
          ? response.data.usageMetadata.thoughtsTokenCount : null,
      );
      if (usage.total === null) metrics.unreportedUsageCalls++;
      else {
        metrics.totalTokens += usage.total;
        runtime.reportedTokens += usage.total;
      }
      const consecutive = runtime.consecutiveFailuresByModel.get(model) ?? 0;
      runtime.consecutiveFailuresByModel.set(model, 0);
      const decoded = refusal(response) ? null : decodeTuning(response, arm);
      const rawText = responseText(response);
      if (decoded) {
        metrics.validRows++;
        rows.set(look.id, {
          look_id: look.id,
          verdict: decoded.verdict,
          reason: decoded.reason,
          failures: decoded.failures,
          example_flag: tuningExampleFlag(look.id, arm),
        });
      } else {
        metrics.parseFailures++;
        rows.set(look.id, emptyTuningRow(look, arm, refusal(response) ? "REFUSAL" : "PARSE_FAILURE"));
      }
      await appendTuningRecord({
        type: "persona-set1-tuning-call",
        model,
        arm,
        lookId: look.id,
        call: metrics.calls,
        status: response.status ?? 200,
        modelVersion: response.data?.modelVersion ?? null,
        finishReason,
        thoughtsTokenCount: metrics.thoughtsTokenCounts.at(-1),
        promptTokenCount: usage.input,
        candidatesTokenCount: usage.output,
        totalTokenCount: usage.total,
        latencyMs,
        valid: Boolean(decoded),
        modelVerdict: decoded?.modelVerdict ?? null,
        rejectedResponseText: decoded ? undefined : rawText,
        consecutiveRequestFailuresBeforeSuccess: consecutive,
        reportedTokensAfterCall: runtime.reportedTokens,
      });
      if (runtime.reportedTokens >= PERSONA_SET1_TOKEN_CAP) {
        runtime.tokenCapReached = true;
      }
    } catch (error: any) {
      const latencyMs = Date.now() - requestStartedAt;
      metrics.latenciesMs.push(latencyMs);
      const code = providerFailureCode(error);
      metrics.finishReasons.push(null);
      metrics.thoughtsTokenCounts.push(null);
      metrics.requestFailures[code] = (metrics.requestFailures[code] ?? 0) + 1;
      const consecutive = (runtime.consecutiveFailuresByModel.get(model) ?? 0) + 1;
      runtime.consecutiveFailuresByModel.set(model, consecutive);
      const status = Number.isInteger(error?.response?.status) ? error.response.status : null;
      rows.set(look.id, emptyTuningRow(look, arm, `REQUEST_FAILED_${code}`));
      await appendTuningRecord({
        type: "persona-set1-tuning-call",
        model,
        arm,
        lookId: look.id,
        call: metrics.calls,
        status,
        errorCode: code,
        finishReason: null,
        thoughtsTokenCount: null,
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: null,
        latencyMs,
        valid: false,
        rejectedResponseText: null,
        consecutiveRequestFailures: consecutive,
        reportedTokensAfterCall: runtime.reportedTokens,
      });
      if (consecutive >= 5) {
        runtime.stoppedModels.add(model);
        runtime.stopReasonByModel.set(model, "FIVE_CONSECUTIVE_REQUEST_FAILURES");
      }
    }
  }
  return rows;
}

async function writeTuningCsv(
  filename: string,
  looks: LookInput[],
  arm: TuningArm,
  observed: Map<string, TuningCsvRow>,
  notRunReason = "NOT_RUN",
): Promise<void> {
  const rows = looks.map((look) =>
    observed.get(look.id) ?? emptyTuningRow(look, arm, notRunReason));
  await writeFile(path.join(OUTPUT_DIR, filename), tuningCsv(rows), "utf8");
}

async function runPersonaSet1PromptTuning(apiKey: string): Promise<void> {
  const inputs = await loadPersonaSet1TuningInputs();
  await mkdir(OUTPUT_DIR, { recursive: true });
  const previousUsage = await priorPromptTuningUsage();
  const runtime: TuningRuntime = {
    reportedTokens: previousUsage.tokens, lastCallAt: 0, consecutiveFailuresByModel: new Map(),
    stoppedModels: new Set(), stopReasonByModel: new Map(), tokenCapReached: false,
  };
  await appendTuningRecord({
    type: "persona-set1-prompt-tuning-start",
    models: PERSONA_SET1_TUNING_MODELS,
    inputSha256: inputs.inputHashes,
    promptTextSha256: Object.fromEntries(
      Object.entries(inputs.prompts).map(([arm, prompt]) => [arm, sha256(prompt)]),
    ),
    systemPrompts: inputs.prompts,
    fewshotExampleIds: [...PERSONA_SET1_TUNING_EXAMPLE_IDS],
    thinkingLevels: PERSONA_SET1_TUNING_THINKING_LEVELS,
    thinkingLevelSource: PERSONA_SET1_TUNING_THINKING_SOURCE,
    pricingSource: PERSONA_SET1_TUNING_PRICE_SOURCE,
    prices: PERSONA_SET1_TUNING_PRICES,
    caps: { totalReportedTokens: PERSONA_SET1_TOKEN_CAP, consecutiveRequestFailures: 5 },
    priorTuningCallsCountedAgainstCap: previousUsage.calls,
    priorTuningReportedTokensCountedAgainstCap: previousUsage.tokens,
    priorCallsAppearInAttemptLogsButNotInArmCsvs: true,
    startedAt: new Date().toISOString(),
  });

  const primaryModel = "gemini-3.5-flash";
  const primarySummaries: Array<{ arm: TuningArm; validRows: number; parseFailures: number }> = [];
  for (const arm of ["A", "B", "C"] as const) {
    const metrics = newTuningMetrics();
    const rows = await runTuningCalls(
      inputs.looks, primaryModel, arm, inputs.prompts[arm], apiKey, runtime, metrics,
    );
    const filename = `persona-set1-tuning-${primaryModel}-arm-${arm.toLowerCase()}.csv`;
    await writeTuningCsv(filename, inputs.looks, arm, rows,
      `NOT_RUN_${runtime.tokenCapReached ? "TOKEN_CAP" :
        runtime.stopReasonByModel.get(primaryModel) ?? "NOT_ATTEMPTED"}`);
    const summary = tuningRunSummary(primaryModel, arm, metrics);
    primarySummaries.push({
      arm, validRows: metrics.validRows, parseFailures: metrics.parseFailures,
    });
    await appendTuningRecord({
      type: "persona-set1-tuning-arm-summary",
      ...summary,
      csv: path.join("docs/reports/judge-experiment", filename),
      stopped: runtime.tokenCapReached || runtime.stoppedModels.has(primaryModel),
      stopReason: runtime.tokenCapReached ? "TOKEN_CAP" :
        runtime.stopReasonByModel.get(primaryModel) ?? null,
      totalReportedTokens: runtime.reportedTokens,
      tokenCap: PERSONA_SET1_TOKEN_CAP,
    });
    if (runtime.tokenCapReached || runtime.stoppedModels.has(primaryModel)) break;
  }

  if (runtime.tokenCapReached || runtime.stoppedModels.has(primaryModel) ||
      primarySummaries.length !== 3) {
    await appendTuningRecord({
      type: "persona-set1-prompt-tuning-stop",
      reason: runtime.tokenCapReached ? "TOKEN_CAP" :
        runtime.stopReasonByModel.get(primaryModel) ?? "PRIMARY_ARMS_INCOMPLETE",
      totalReportedTokens: runtime.reportedTokens,
    });
    return;
  }
  const best = [...primarySummaries].sort((left, right) =>
    right.validRows - left.validRows ||
    left.parseFailures - right.parseFailures ||
    ["A", "B", "C"].indexOf(left.arm) - ["A", "B", "C"].indexOf(right.arm),
  )[0];
  await appendTuningRecord({
    type: "persona-set1-tuning-best-arm",
    model: primaryModel,
    arm: best.arm,
    selectionRule: "Most valid rows; ties use fewer parse failures, then A before B before C.",
    primaryArmSummaries: primarySummaries,
  });

  for (const model of PERSONA_SET1_TUNING_MODELS.slice(1)) {
    if (runtime.tokenCapReached) break;
    const metrics = newTuningMetrics();
    const probeLooks = inputs.looks.slice(0, 10);
    const observed = await runTuningCalls(
      probeLooks, model, best.arm, inputs.prompts[best.arm], apiKey, runtime, metrics,
    );
    const parseFailures = metrics.parseFailures;
    const modelStopped = runtime.stoppedModels.has(model);
    const probePassed = !runtime.tokenCapReached && !modelStopped && parseFailures < 3;
    await appendTuningRecord({
      type: "persona-set1-tuning-model-probe",
      model,
      arm: best.arm,
      thinkingLevel: modelThinkingLevel(model),
      calls: metrics.calls,
      validRows: metrics.validRows,
      parseFailures,
      requestFailures: metrics.requestFailures,
      finishReasons: metrics.finishReasons,
      thoughtsTokenCounts: metrics.thoughtsTokenCounts,
      passed: probePassed,
      decision: runtime.tokenCapReached ? "TOKEN_CAP" : modelStopped
        ? runtime.stopReasonByModel.get(model) : parseFailures >= 3
          ? "THREE_OR_MORE_PARSE_FAILURES" : "CONTINUE_TO_FULL_BATCH",
    });
    if (parseFailures >= 3 || modelStopped || runtime.tokenCapReached) {
      const filename = `persona-set1-tuning-${model}-arm-${best.arm.toLowerCase()}.csv`;
      await writeTuningCsv(
        filename, inputs.looks, best.arm, observed,
        `NOT_RUN_${runtime.tokenCapReached ? "TOKEN_CAP" : modelStopped
          ? runtime.stopReasonByModel.get(model) : "PROBE_PARSE_FAILURES"}`,
      );
      await appendTuningRecord({
        type: "persona-set1-tuning-arm-summary",
        ...tuningRunSummary(model, best.arm, metrics),
        csv: path.join("docs/reports/judge-experiment", filename),
        fullBatchRun: false,
        probePassed: false,
        stopped: modelStopped || runtime.tokenCapReached,
        stopReason: runtime.tokenCapReached ? "TOKEN_CAP" : modelStopped
          ? runtime.stopReasonByModel.get(model) : "THREE_OR_MORE_PARSE_FAILURES",
        totalReportedTokens: runtime.reportedTokens,
      });
      continue;
    }
    const remaining = inputs.looks.slice(10);
    const remainingRows = await runTuningCalls(
      remaining, model, best.arm, inputs.prompts[best.arm], apiKey, runtime, metrics,
    );
    for (const [lookId, row] of remainingRows) observed.set(lookId, row);
    const filename = `persona-set1-tuning-${model}-arm-${best.arm.toLowerCase()}.csv`;
    await writeTuningCsv(
      filename, inputs.looks, best.arm, observed,
      `NOT_RUN_${runtime.tokenCapReached ? "TOKEN_CAP" :
        runtime.stopReasonByModel.get(model) ?? "NOT_ATTEMPTED"}`,
    );
    await appendTuningRecord({
      type: "persona-set1-tuning-arm-summary",
      ...tuningRunSummary(model, best.arm, metrics),
      csv: path.join("docs/reports/judge-experiment", filename),
      fullBatchRun: !runtime.tokenCapReached && !runtime.stoppedModels.has(model),
      probePassed: true,
      stopped: runtime.tokenCapReached || runtime.stoppedModels.has(model),
      stopReason: runtime.tokenCapReached ? "TOKEN_CAP" :
        runtime.stopReasonByModel.get(model) ?? null,
      totalReportedTokens: runtime.reportedTokens,
      tokenCap: PERSONA_SET1_TOKEN_CAP,
    });
  }
  await appendTuningRecord({
    type: "persona-set1-prompt-tuning-complete",
    selectedArm: best.arm,
    totalReportedTokens: runtime.reportedTokens,
    tokenCap: PERSONA_SET1_TOKEN_CAP,
    stopped: runtime.tokenCapReached || runtime.stoppedModels.size > 0,
    stoppedModels: [...runtime.stoppedModels],
    stopReasons: Object.fromEntries(runtime.stopReasonByModel),
    stopReason: runtime.tokenCapReached ? "TOKEN_CAP" : null,
    completedAt: new Date().toISOString(),
  });
}

async function loadPersonaSet1Inputs(): Promise<{
  looks: LookInput[];
  systemPrompt: string;
  hashes: { persona: string; looks: string; rules: string; systemPrompt: string };
}> {
  const [personaBuffer, looksBuffer, rulesBuffer] = await Promise.all([
    readFile(PERSONA_SET1_PATHS.persona),
    readFile(PERSONA_SET1_PATHS.looks),
    readFile(PERSONA_SET1_PATHS.rules),
  ]);
  const plainLooks = parsePlainLooks(looksBuffer.toString("utf8"));
  const systemPrompt = buildPersonaSystemPrompt(
    personaBuffer.toString("utf8"),
    rulesBuffer.toString("utf8"),
  );
  return {
    looks: [...plainLooks].map(([id, plainText]) => ({
      id, plainText, structuredFacts: {},
    })),
    systemPrompt,
    hashes: {
      persona: sha256(personaBuffer),
      looks: sha256(looksBuffer),
      rules: sha256(rulesBuffer),
      systemPrompt: sha256(systemPrompt),
    },
  };
}

function isGeneralTextGenerationModel(model: any): boolean {
  const name = typeof model?.name === "string" ? model.name.replace(/^models\//, "") : "";
  return /^gemini-/i.test(name) &&
    (model.supportedGenerationMethods ?? []).includes("generateContent") &&
    Number.isFinite(model.inputTokenLimit) &&
    !/(?:image|tts|transcrib|computer-use|robotics|nano-banana)/i.test(`${name} ${model.displayName ?? ""}`);
}

function isLargerTextTier(name: string): boolean {
  const model = name.toLowerCase();
  return /(?:^gemini-(?:2\.5|3\.1)-pro(?:-|$)|^gemini-(?:3\.[6-9]|[4-9])(?:\.|-)|^gemini-(?:flash|pro)-latest$|^gemini-omni-)/.test(model);
}

async function listPersonaModels(apiKey: string): Promise<{
  name: string; inputTokenLimit: number; outputTokenLimit: number;
}[]> {
  const models: any[] = [];
  let pageToken: string | undefined;
  do {
    const response = await axios.get("https://generativelanguage.googleapis.com/v1beta/models", {
      params: { pageSize: 1000, ...(pageToken ? { pageToken } : {}) },
      headers: { "x-goog-api-key": apiKey },
      timeout: REQUEST_TIMEOUT_MS,
    });
    models.push(...(response.data?.models ?? []));
    pageToken = typeof response.data?.nextPageToken === "string"
      ? response.data.nextPageToken : undefined;
  } while (pageToken);
  return models
    .filter(isGeneralTextGenerationModel)
    .map((model: any) => ({
      name: model.name.replace(/^models\//, ""),
      inputTokenLimit: model.inputTokenLimit,
      outputTokenLimit: model.outputTokenLimit,
    }))
    .sort((left: any, right: any) => left.name.localeCompare(right.name));
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

async function loadSet2PlainConfirmationInputs(): Promise<{
  looks: LookInput[];
  looksTextSha256: string;
}> {
  const buffer = await readFile(SET2_PATHS.looks);
  const parsed = parsePlainLooks(buffer.toString("utf8"), "T");
  const ids = Array.from({ length: 25 }, (_, index) =>
    ["A", "B", "C", "D"].map((letter) => `T${String(index + 1).padStart(2, "0")}-${letter}`),
  ).flat();
  if (ids.some((id) => !parsed.has(id))) {
    throw new Error("Set 2 plain input IDs must be T01-A through T25-D.");
  }
  return {
    looks: ids.map((id) => ({ id, plainText: parsed.get(id)!, structuredFacts: {} })),
    looksTextSha256: sha256(buffer),
  };
}

async function loadSet3aInputs(): Promise<{
  looks: LookInput[];
  looksTextSha256: string;
}> {
  const buffer = await readFile(SET3A_PATH);
  const text = buffer.toString("utf8");
  const looks = parsePlainLooks(text, "U", 72);
  const expectedIds = Array.from({ length: 18 }, (_, index) =>
    ["A", "B", "C", "D"].map((letter) => `U${String(index + 1).padStart(2, "0")}-${letter}`),
  ).flat();
  if (expectedIds.some((id) => !looks.has(id))) {
    throw new Error("Set 3A IDs must match U01-A through U18-D.");
  }
  return {
    looks: expectedIds.map((id) => ({
      id, plainText: looks.get(id)!, structuredFacts: {},
    })),
    looksTextSha256: sha256(buffer),
  };
}

async function loadSet2ConfirmationPrompts(): Promise<{
  prompts: Record<"B" | "C", string>;
  sourceStartedAt: string | null;
}> {
  const records = (await readFile(PERSONA_SET1_RUN_PATH, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const source = records.reverse().find((record) =>
    record.type === "persona-set1-prompt-tuning-start" &&
    record.promptTextSha256?.B === SET2_CONFIRMATION_PROMPT_HASHES.B &&
    record.promptTextSha256?.C === SET2_CONFIRMATION_PROMPT_HASHES.C &&
    typeof record.systemPrompts?.B === "string" &&
    typeof record.systemPrompts?.C === "string" &&
    sha256(record.systemPrompts.B) === SET2_CONFIRMATION_PROMPT_HASHES.B &&
    sha256(record.systemPrompts.C) === SET2_CONFIRMATION_PROMPT_HASHES.C,
  );
  if (!source) {
    throw new Error("The exact recorded Set 1 B/C system prompts were not found; refusing to run.");
  }
  return {
    prompts: { B: source.systemPrompts.B, C: source.systemPrompts.C },
    sourceStartedAt: source.startedAt ?? null,
  };
}

async function loadSet3aPrompt(): Promise<{ prompt: string; sourceStartedAt: string | null }> {
  const records = (await readFile(PERSONA_SET1_RUN_PATH, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const source = records.find((record) =>
    record.type === "persona-set1-prompt-tuning-start" &&
    record.promptTextSha256?.B === SET3A_PROMPT_SHA256 &&
    typeof record.systemPrompts?.B === "string" &&
    sha256(record.systemPrompts.B) === SET3A_PROMPT_SHA256,
  );
  if (!source) {
    throw new Error("The exact recorded Arm B prompt was not found; refusing to run Set 3A.");
  }
  return { prompt: source.systemPrompts.B, sourceStartedAt: source.startedAt ?? null };
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

type Set2ConfirmationRun = typeof SET2_CONFIRMATION_RUNS[number];
type Set2ConfirmationRow = {
  look_id: string;
  verdict: string;
  reason: string;
  failures: string[];
};
type Set2ConfirmationRuntime = {
  reportedTokens: number;
  lastCallAt: number;
  tokenCapReached: boolean;
};

function set2ConfirmationCsv(rows: Set2ConfirmationRow[]): string {
  return [
    "look_id,verdict,reason,failures",
    ...rows.map((row) => [
      row.look_id, row.verdict, row.reason, JSON.stringify(row.failures),
    ].map(tuningCsvCell).join(",")),
  ].join("\n") + "\n";
}

function set2ConfirmationCostUsd(
  model: Set2ConfirmationRun["model"],
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number,
): number {
  const price = SET2_CONFIRMATION_PRICES[model];
  return Number((
    inputTokens * price.inputPerMillion / 1_000_000 +
    (outputTokens + thinkingTokens) * price.outputPerMillion / 1_000_000
  ).toFixed(8));
}

async function appendSet2ConfirmationRecord(record: Record<string, unknown>): Promise<void> {
  await appendFile(PERSONA_SET1_RUN_PATH, `${JSON.stringify(record)}\n`);
  console.log(JSON.stringify({
    type: record.type,
    runId: record.runId,
    lookId: record.lookId,
    calls: record.calls,
    validRows: record.validRows,
    stopped: record.stopped,
    totalReportedTokens: record.totalReportedTokens,
  }));
}

async function runSet2ConfirmationBatch(
  run: Set2ConfirmationRun,
  looks: LookInput[],
  systemPrompt: string,
  apiKey: string,
  runtime: Set2ConfirmationRuntime,
  initializeCsv = true,
): Promise<Record<string, unknown>> {
  const filePath = path.join(OUTPUT_DIR, run.filename);
  const rows: Set2ConfirmationRow[] = looks.map((look) => ({
    look_id: look.id, verdict: "", reason: "NOT_RUN", failures: [],
  }));
  if (initializeCsv) {
    await writeFile(filePath, set2ConfirmationCsv(rows), { encoding: "utf8", flag: "wx" });
  }

  const schema = buildSet2ConfirmationSchema(run.arm, run.includeAsk);
  const inputTokens = { prompt: 0, candidate: 0, thinking: 0, total: 0, unreported: 0 };
  const latenciesMs: number[] = [];
  const requestFailures: Record<string, number> = {};
  const rejectedResponses: Array<{ lookId: string; attempt: number; text: string | null }> = [];
  const modelVersions: Record<string, number> = {};
  let calls = 0;
  let parseFailures = 0;
  let refusals = 0;
  let consecutiveRequestFailures = 0;
  let stoppedAfterFiveConsecutiveFailures = false;
  let stoppedForTokenCap = false;

  for (let index = 0; index < looks.length; index++) {
    if (runtime.tokenCapReached) {
      stoppedForTokenCap = true;
      break;
    }
    const look = looks[index];
    let parseRetryUsed = false;
    let retryNumber = 0;
    let callAttempt = 0;
    let waitBeforeNextCall = 0;

    while (true) {
      const request = buildGeminiGenerationRequest({
        model: run.model,
        apiKey,
        baseRequestBody: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: look.plainText }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: SET2_CONFIRMATION_MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
            responseSchema: schema,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        },
        maxOutputTokens: SET2_CONFIRMATION_MAX_OUTPUT_TOKENS,
        timeout: REQUEST_TIMEOUT_MS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const tokenReserve = Buffer.byteLength(JSON.stringify(request.body), "utf8") +
        SET2_CONFIRMATION_MAX_OUTPUT_TOKENS + SET2_CONFIRMATION_REQUEST_OVERHEAD_RESERVE;
      if (SET2_CONFIRMATION_TOKEN_CAP - runtime.reportedTokens < tokenReserve) {
        runtime.tokenCapReached = true;
        stoppedForTokenCap = true;
        break;
      }
      const spacing = runtime.lastCallAt
        ? Math.max(0, CALL_SPACING_MS - (Date.now() - runtime.lastCallAt)) : 0;
      const waitMs = Math.max(spacing, waitBeforeNextCall);
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      waitBeforeNextCall = 0;

      const startedAt = Date.now();
      runtime.lastCallAt = startedAt;
      calls++;
      callAttempt++;

      try {
        const response = await axios.post(request.url, request.body, request.config);
        const latencyMs = Date.now() - startedAt;
        latenciesMs.push(latencyMs);
        const usage = tuningUsage(response);
        inputTokens.prompt += usage.input;
        inputTokens.candidate += usage.output;
        inputTokens.thinking += usage.thinking;
        if (usage.total === null) {
          inputTokens.unreported++;
          runtime.tokenCapReached = true;
          stoppedForTokenCap = true;
        }
        else {
          inputTokens.total += usage.total;
          runtime.reportedTokens += usage.total;
          if (runtime.reportedTokens >= SET2_CONFIRMATION_TOKEN_CAP) {
            runtime.tokenCapReached = true;
            stoppedForTokenCap = true;
          }
        }
        const finishReason = tuningFinishReason(response);
        const modelVersion = typeof response?.data?.modelVersion === "string"
          ? response.data.modelVersion : null;
        if (modelVersion) modelVersions[modelVersion] = (modelVersions[modelVersion] ?? 0) + 1;
        consecutiveRequestFailures = 0;

        const isRefusal = refusal(response);
        const rawText = responseText(response);
        const decoded = isRefusal ? null : decodeSet2Confirmation(response, run.arm, run.includeAsk);
        const responseStatus = response.status ?? 200;
        await appendSet2ConfirmationRecord({
          type: "set2-confirmation-call",
          runId: run.id,
          requestedModel: run.model,
          arm: run.arm,
          allowAsk: run.includeAsk,
          lookId: look.id,
          attempt: callAttempt,
          status: responseStatus,
          modelVersion,
          finishReason,
          promptTokenCount: usage.input,
          candidatesTokenCount: usage.output,
          thoughtsTokenCount: Number.isFinite(response?.data?.usageMetadata?.thoughtsTokenCount)
            ? response.data.usageMetadata.thoughtsTokenCount : null,
          totalTokenCount: usage.total,
          latencyMs,
          valid: Boolean(decoded),
          rejectionType: decoded ? null : isRefusal ? "REFUSAL" : "PARSE_FAILURE",
          rejectedResponseText: decoded ? undefined : rawText,
          reportedTokensAfterCall: runtime.reportedTokens,
        });

        if (decoded) {
          rows[index] = {
            look_id: look.id,
            verdict: decoded.verdict,
            reason: decoded.reason,
            failures: decoded.failures,
          };
          break;
        }
        if (isRefusal) {
          refusals++;
          rejectedResponses.push({ lookId: look.id, attempt: callAttempt, text: rawText });
          rows[index] = { ...rows[index], reason: "REFUSAL" };
          break;
        }
        parseFailures++;
        rejectedResponses.push({ lookId: look.id, attempt: callAttempt, text: rawText });
        if (!parseRetryUsed) {
          parseRetryUsed = true;
          continue;
        }
        rows[index] = { ...rows[index], reason: "PARSE_FAILURE" };
        break;
      } catch (error: any) {
        const latencyMs = Date.now() - startedAt;
        latenciesMs.push(latencyMs);
        consecutiveRequestFailures++;
        const code = providerFailureCode(error);
        requestFailures[code] = (requestFailures[code] ?? 0) + 1;
        const status = Number.isInteger(error?.response?.status) ? error.response.status : null;
        await appendSet2ConfirmationRecord({
          type: "set2-confirmation-call",
          runId: run.id,
          requestedModel: run.model,
          arm: run.arm,
          allowAsk: run.includeAsk,
          lookId: look.id,
          attempt: callAttempt,
          status,
          modelVersion: null,
          errorCode: code,
          finishReason: null,
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          thoughtsTokenCount: null,
          totalTokenCount: null,
          latencyMs,
          valid: false,
          rejectedResponseText: null,
          consecutiveRequestFailures,
          reportedTokensAfterCall: runtime.reportedTokens,
        });
        rows[index] = { ...rows[index], reason: `REQUEST_FAILED_${code}` };
        if (consecutiveRequestFailures >= 5) {
          stoppedAfterFiveConsecutiveFailures = true;
          break;
        }
        const statusCode = error?.response?.status;
        if (statusCode === 429 || (Number.isInteger(statusCode) && statusCode >= 500)) {
          retryNumber++;
          const evidence = rateLimitEvidence(error);
          waitBeforeNextCall = retryDelay(retryNumber, evidence.retryAfterMs);
          continue;
        }
        break;
      }
    }

    await writeFile(filePath, set2ConfirmationCsv(rows), "utf8");
    if (runtime.reportedTokens >= SET2_CONFIRMATION_TOKEN_CAP) {
      runtime.tokenCapReached = true;
      stoppedForTokenCap = true;
    }
    if (stoppedAfterFiveConsecutiveFailures || stoppedForTokenCap) break;
  }

  const validRows = rows.filter((row) => Boolean(row.verdict)).length;
  const runCostUsd = set2ConfirmationCostUsd(
    run.model, inputTokens.prompt, inputTokens.candidate, inputTokens.thinking,
  );
  const summary = {
    type: "set2-confirmation-run-summary",
    runId: run.id,
    requestedModel: run.model,
    arm: run.arm,
    allowAsk: run.includeAsk,
    calls,
    validRows,
    parseFailures,
    refusals,
    requestFailures,
    consecutiveRequestFailures,
    stoppedAfterFiveConsecutiveFailures,
    stoppedForTokenCap,
    tokens: inputTokens,
    modelVersions,
    latencyMs: {
      median: percentile(latenciesMs, 0.5),
      p95: percentile(latenciesMs, 0.95),
    },
    estimatedCostUsd: runCostUsd,
    priceBasis: SET2_CONFIRMATION_PRICES[run.model].basis,
    rejectedResponses,
    csv: path.join("docs/reports/judge-experiment", run.filename),
    totalReportedTokensAfterRun: runtime.reportedTokens,
    tokenCap: SET2_CONFIRMATION_TOKEN_CAP,
  };
  await appendSet2ConfirmationRecord(summary);
  return summary;
}

async function runSet2Confirmation(apiKey: string): Promise<void> {
  const [{ looks, looksTextSha256 }, { prompts, sourceStartedAt }] = await Promise.all([
    loadSet2PlainConfirmationInputs(),
    loadSet2ConfirmationPrompts(),
  ]);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const schemas = SET2_CONFIRMATION_RUNS.map((run) => {
    const schema = buildSet2ConfirmationSchema(run.arm, run.includeAsk);
    return {
      runId: run.id,
      sha256: sha256(JSON.stringify(schema)),
      schema,
    };
  });
  for (const run of SET2_CONFIRMATION_RUNS) {
    const filePath = path.join(OUTPUT_DIR, run.filename);
    try {
      await readFile(filePath, "utf8");
      throw new Error(`Refusing to overwrite existing Set 2 confirmation CSV: ${run.filename}`);
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const run of SET2_CONFIRMATION_RUNS) {
    const filename = path.join(OUTPUT_DIR, run.filename);
    const rows = looks.map((look) => ({
      look_id: look.id, verdict: "", reason: "NOT_RUN", failures: [],
    }));
    await writeFile(filename, set2ConfirmationCsv(rows), { encoding: "utf8", flag: "wx" });
  }

  const runtime: Set2ConfirmationRuntime = {
    reportedTokens: 0,
    lastCallAt: 0,
    tokenCapReached: false,
  };
  const promptHashes = {
    B: sha256(prompts.B),
    C: sha256(prompts.C),
  };
  await appendSet2ConfirmationRecord({
    type: "set2-confirmation-start",
    set: 2,
    mode: "plain",
    looksTextSha256,
    promptHashes,
    promptSourceRecordStartedAt: sourceStartedAt,
    modelOrder: SET2_CONFIRMATION_RUNS.map(({ id, model, arm, includeAsk }) => ({
      id, requestedModel: model, arm, allowAsk: includeAsk,
    })),
    schemas,
    temperature: 0,
    maxOutputTokens: 1024,
    thinkingLevel: "minimal",
    spacingMs: CALL_SPACING_MS,
    parseFailureRetries: 1,
    consecutiveRequestFailureStop: 5,
    tokenCap: SET2_CONFIRMATION_TOKEN_CAP,
    priceSource: SET2_CONFIRMATION_PRICE_SOURCE,
    prices: SET2_CONFIRMATION_PRICES,
    startedAt: new Date().toISOString(),
  });

  const summaries: Record<string, unknown>[] = [];
  for (const run of SET2_CONFIRMATION_RUNS) {
    if (runtime.tokenCapReached) {
      const summary = {
        type: "set2-confirmation-run-summary",
        runId: run.id,
        requestedModel: run.model,
        arm: run.arm,
        allowAsk: run.includeAsk,
        calls: 0,
        validRows: 0,
        skipped: "TOKEN_CAP",
        csv: path.join("docs/reports/judge-experiment", run.filename),
        totalReportedTokensAfterRun: runtime.reportedTokens,
      };
      summaries.push(summary);
      await appendSet2ConfirmationRecord(summary);
      continue;
    }
    const summary = await runSet2ConfirmationBatch(
      run, looks, prompts[run.arm], apiKey, runtime, false,
    );
    summaries.push(summary);
  }
  const totalCostUsd = summaries.reduce((sum, summary) =>
    sum + (typeof summary.estimatedCostUsd === "number" ? summary.estimatedCostUsd : 0), 0);
  await appendSet2ConfirmationRecord({
    type: "set2-confirmation-report",
    calls: summaries.reduce((sum, summary) =>
      sum + (typeof summary.calls === "number" ? summary.calls : 0), 0),
    reportedTokens: runtime.reportedTokens,
    tokenCap: SET2_CONFIRMATION_TOKEN_CAP,
    estimatedCostUsd: Number(totalCostUsd.toFixed(8)),
    runSummaries: summaries.map((summary) => ({
      runId: summary.runId,
      requestedModel: summary.requestedModel,
      calls: summary.calls,
      validRows: summary.validRows,
      parseFailures: summary.parseFailures,
      requestFailures: summary.requestFailures,
      latencyMs: summary.latencyMs,
      estimatedCostUsd: summary.estimatedCostUsd,
      csv: summary.csv,
    })),
    completedAt: new Date().toISOString(),
  });
}

type Set3aRow = { look_id: string; verdict: string; reason: string; failures: string[] };
type Set3aRuntime = {
  reportedTokens: number;
  reservedTokens: number;
  lastGenerationAt: number;
  stoppedForTokenCap: boolean;
};

function set3aCsv(rows: Set3aRow[]): string {
  return [
    "look_id,verdict,reason,failures",
    ...rows.map((row) => [
      row.look_id, row.verdict, row.reason, JSON.stringify(row.failures),
    ].map(tuningCsvCell).join(",")),
  ].join("\n") + "\n";
}

function set3aCost(inputTokens: number, outputTokens: number, thinkingTokens: number): number {
  return Number((
    inputTokens * SET3A_PRICE.inputPerMillion / 1_000_000 +
    (outputTokens + thinkingTokens) * SET3A_PRICE.outputPerMillion / 1_000_000
  ).toFixed(8));
}

async function countSet3aPromptTokens(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userText: string,
  includeAsk: boolean,
): Promise<number> {
  const request = buildGeminiGenerationRequest({
    model,
    apiKey,
    baseRequestBody: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: SET3A_MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        responseSchema: buildSet2ConfirmationSchema("B", includeAsk),
        thinkingConfig: { thinkingLevel: "minimal" },
      },
    },
    maxOutputTokens: SET3A_MAX_OUTPUT_TOKENS,
    timeout: REQUEST_TIMEOUT_MS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const countUrl = request.url.replace(":generateContent", ":countTokens");
  const countBody = {
    generateContentRequest: {
      model: `models/${model}`,
      systemInstruction: request.body.systemInstruction,
      contents: request.body.contents,
    },
  };
  const response = await axios.post(countUrl, countBody, request.config);
  const count = response?.data?.totalTokens;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Gemini token-count response did not include a valid totalTokens value.");
  }
  return count;
}

async function runSet3aBatch(
  run: typeof SET3A_RUNS[number],
  looks: LookInput[],
  systemPrompt: string,
  apiKey: string,
  runtime: Set3aRuntime,
): Promise<Record<string, unknown>> {
  const filePath = path.join(OUTPUT_DIR, run.filename);
  const rows: Set3aRow[] = looks.map((look) => ({
    look_id: look.id, verdict: "", reason: "NOT_RUN", failures: [],
  }));
  await writeFile(filePath, set3aCsv(rows), { encoding: "utf8", flag: "wx" });

  const schema = buildSet2ConfirmationSchema("B", run.allowAsk);
  const tokens = { prompt: 0, candidate: 0, thinking: 0, total: 0, unreported: 0 };
  const latenciesMs: number[] = [];
  const modelVersions: Record<string, number> = {};
  const rejectedResponses: Array<{ lookId: string; attempt: number; text: string | null }> = [];
  let calls = 0;
  let parseFailures = 0;
  let countTokenCalls = 0;
  let tokenCountFailures = 0;
  let stoppedForTokenCap = false;
  let lastCountTokenAt = 0;

  for (let index = 0; index < looks.length; index++) {
    const look = looks[index];
    const userText = run.qualityStripped
      ? look.plainText.replace(/\(quality (?:premium|standard|poor)\)/g, "(quality not stated)")
      : look.plainText;
    const reservedUsage = new Set3aPromptReservation(runtime);
    let parseRetryUsed = false;
    let attempt = 0;

    while (true) {
      let promptTokens: number;
      try {
        promptTokens = await countSet3aPromptTokens(
          "gemini-3.5-flash", apiKey, systemPrompt, userText, run.allowAsk,
        );
        countTokenCalls++;
        lastCountTokenAt = Date.now();
      } catch (error: any) {
        tokenCountFailures++;
        await appendSet2ConfirmationRecord({
          type: "set3a-token-count-failure",
          runId: run.id,
          lookId: look.id,
          errorCode: providerFailureCode(error),
          status: Number.isInteger(error?.response?.status) ? error.response.status : null,
        });
        rows[index] = { ...rows[index], reason: "TOKEN_COUNT_FAILED" };
        break;
      }

      const reservation = promptTokens + SET3A_MAX_OUTPUT_TOKENS + 256;
      if (runtime.reportedTokens + runtime.reservedTokens + reservation > SET3A_TOKEN_CAP) {
        runtime.stoppedForTokenCap = true;
        stoppedForTokenCap = true;
        break;
      }
      runtime.reservedTokens += reservation;
      reservedUsage.set(reservation);

      const generationSpacing = runtime.lastGenerationAt
        ? Math.max(0, CALL_SPACING_MS - (Date.now() - runtime.lastGenerationAt)) : 0;
      const countSpacing = lastCountTokenAt
        ? Math.max(0, CALL_SPACING_MS - (Date.now() - lastCountTokenAt)) : 0;
      const waitMs = Math.max(generationSpacing, countSpacing);
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));

      const request = buildGeminiGenerationRequest({
        model: "gemini-3.5-flash",
        apiKey,
        baseRequestBody: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: SET3A_MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
            responseSchema: schema,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        },
        maxOutputTokens: SET3A_MAX_OUTPUT_TOKENS,
        timeout: REQUEST_TIMEOUT_MS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const startedAt = Date.now();
      runtime.lastGenerationAt = startedAt;
      calls++;
      attempt++;

      try {
        const response = await axios.post(request.url, request.body, request.config);
        const latencyMs = Date.now() - startedAt;
        latenciesMs.push(latencyMs);
        const usage = tuningUsage(response);
        const modelVersion = typeof response?.data?.modelVersion === "string"
          ? response.data.modelVersion : null;
        if (modelVersion) modelVersions[modelVersion] = (modelVersions[modelVersion] ?? 0) + 1;
        const rawText = responseText(response);
        const isRefusal = refusal(response);
        const decoded = isRefusal ? null : decodeSet2Confirmation(response, "B", run.allowAsk);
        const actualTokens = usage.total;
        reservedUsage.release(actualTokens ?? reservation);
        if (actualTokens === null) {
          tokens.unreported++;
          runtime.stoppedForTokenCap = true;
          stoppedForTokenCap = true;
        } else {
          tokens.prompt += usage.input;
          tokens.candidate += usage.output;
          tokens.thinking += usage.thinking;
          tokens.total += actualTokens;
        }
        await appendSet2ConfirmationRecord({
          type: "set3a-call",
          runId: run.id,
          requestedModel: "gemini-3.5-flash",
          modelVersion,
          askAllowed: run.allowAsk,
          qualityStripped: run.qualityStripped,
          lookId: look.id,
          attempt,
          status: response.status ?? 200,
          finishReason: tuningFinishReason(response),
          promptTokenCount: usage.input,
          candidatesTokenCount: usage.output,
          thoughtsTokenCount: usage.thinking,
          totalTokenCount: usage.total,
          reservedTokenBudget: reservation,
          latencyMs,
          valid: Boolean(decoded),
          rejectionType: decoded ? null : isRefusal ? "REFUSAL" : "PARSE_FAILURE",
          rejectedResponseText: decoded ? undefined : rawText,
          totalReportedTokensAfterCall: runtime.reportedTokens,
          tokenCap: SET3A_TOKEN_CAP,
        });

        if (decoded) {
          rows[index] = {
            look_id: look.id,
            verdict: decoded.verdict,
            reason: decoded.reason,
            failures: [],
          };
          break;
        }
        if (isRefusal) {
          rows[index] = { ...rows[index], reason: "REFUSAL" };
          break;
        }
        parseFailures++;
        rejectedResponses.push({ lookId: look.id, attempt, text: rawText });
        if (!parseRetryUsed && !stoppedForTokenCap) {
          parseRetryUsed = true;
          continue;
        }
        rows[index] = { ...rows[index], reason: "PARSE_FAILURE" };
        break;
      } catch (error: any) {
        const latencyMs = Date.now() - startedAt;
        latenciesMs.push(latencyMs);
        reservedUsage.release(reservation);
        const code = providerFailureCode(error);
        await appendSet2ConfirmationRecord({
          type: "set3a-call",
          runId: run.id,
          requestedModel: "gemini-3.5-flash",
          modelVersion: null,
          askAllowed: run.allowAsk,
          qualityStripped: run.qualityStripped,
          lookId: look.id,
          attempt,
          status: Number.isInteger(error?.response?.status) ? error.response.status : null,
          errorCode: code,
          finishReason: null,
          latencyMs,
          valid: false,
          rejectionType: "REQUEST_FAILURE",
          totalReportedTokensAfterCall: runtime.reportedTokens,
          tokenCap: SET3A_TOKEN_CAP,
        });
        rows[index] = { ...rows[index], reason: `REQUEST_FAILED_${code}` };
        break;
      }
    }

    await writeFile(filePath, set3aCsv(rows), "utf8");
    if (stoppedForTokenCap || runtime.stoppedForTokenCap) {
      for (let remaining = index + 1; remaining < rows.length; remaining++) {
        rows[remaining] = { ...rows[remaining], reason: "NOT_RUN_TOKEN_CAP" };
      }
      await writeFile(filePath, set3aCsv(rows), "utf8");
      break;
    }
  }

  const summary = {
    type: "set3a-run-summary",
    runId: run.id,
    requestedModel: "gemini-3.5-flash",
    promptSha256: SET3A_PROMPT_SHA256,
    askAllowed: run.allowAsk,
    qualityStripped: run.qualityStripped,
    qualityReplacements: run.qualityStripped
      ? looks.reduce((count, look) => count +
          (look.plainText.match(/\(quality (?:premium|standard|poor)\)/g) ?? []).length, 0)
      : 0,
    rowCount: rows.length,
    calls,
    countTokenCalls,
    tokenCountFailures,
    validRows: rows.filter((row) => Boolean(row.verdict)).length,
    parseFailures,
    rejectedResponses,
    modelVersions,
    tokens,
    latencyMs: {
      median: percentile(latenciesMs, 0.5),
      p95: percentile(latenciesMs, 0.95),
    },
    estimatedCostUsd: set3aCost(tokens.prompt, tokens.candidate, tokens.thinking),
    priceBasis: SET2_CONFIRMATION_PRICES["gemini-3.5-flash"].basis,
    csv: path.join("docs/reports/judge-experiment", run.filename),
    totalReportedTokensAfterRun: runtime.reportedTokens,
    reservedTokensRemaining: runtime.reservedTokens,
    tokenCap: SET3A_TOKEN_CAP,
    stoppedForTokenCap,
  };
  await appendSet2ConfirmationRecord(summary);
  return summary;
}

class Set3aPromptReservation {
  private current = 0;

  constructor(private readonly runtime: Set3aRuntime) {}

  set(tokens: number): void {
    this.current = tokens;
  }

  release(actualTokens: number): void {
    this.runtime.reservedTokens -= this.current;
    this.current = 0;
    this.runtime.reportedTokens += actualTokens;
  }
}

async function runSet3aPlain(apiKey: string): Promise<void> {
  const [input, promptSource] = await Promise.all([loadSet3aInputs(), loadSet3aPrompt()]);
  if (input.looksTextSha256 !== SET3A_INPUT_SHA256) {
    throw new Error("Set 3A input SHA-256 does not match the supplied frozen input.");
  }
  if (getClassifierModelOrder()[1] !== "gemini-3.5-flash") {
    throw new Error("Configured fallback has changed; refusing the frozen Set 3A run.");
  }
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const run of SET3A_RUNS) {
    try {
      await readFile(path.join(OUTPUT_DIR, run.filename), "utf8");
      throw new Error(`Refusing to overwrite existing Set 3A CSV: ${run.filename}`);
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const prompt = promptSource.prompt;
  const runtime: Set3aRuntime = {
    reportedTokens: 0,
    reservedTokens: 0,
    lastGenerationAt: 0,
    stoppedForTokenCap: false,
  };
  await appendSet2ConfirmationRecord({
    type: "set3a-start",
    input: "looks3.txt",
    looksTextSha256: input.looksTextSha256,
    promptSourceRecordStartedAt: promptSource.sourceStartedAt,
    promptSha256: sha256(prompt),
    expectedPromptSha256: SET3A_PROMPT_SHA256,
    systemPromptText: prompt,
    requestedModel: "gemini-3.5-flash",
    runs: SET3A_RUNS,
    temperature: 0,
    maxOutputTokens: SET3A_MAX_OUTPUT_TOKENS,
    thinkingLevel: "minimal",
    spacingMs: CALL_SPACING_MS,
    parseFailureRetries: 1,
    tokenCap: SET3A_TOKEN_CAP,
    priceSource: SET2_CONFIRMATION_PRICE_SOURCE,
    price: SET3A_PRICE,
    startedAt: new Date().toISOString(),
  });
  const summaries: Record<string, unknown>[] = [];
  for (const run of SET3A_RUNS) {
    const summary = await runSet3aBatch(run, input.looks, prompt, apiKey, runtime);
    summaries.push(summary);
    if (runtime.stoppedForTokenCap || summary.tokenCountFailures) break;
  }
  await appendSet2ConfirmationRecord({
    type: "set3a-report",
    calls: summaries.reduce((sum, row) => sum + Number(row.calls ?? 0), 0),
    countTokenCalls: summaries.reduce((sum, row) => sum + Number(row.countTokenCalls ?? 0), 0),
    reportedTokens: runtime.reportedTokens,
    reservedTokensRemaining: runtime.reservedTokens,
    tokenCap: SET3A_TOKEN_CAP,
    summaries,
    completedAt: new Date().toISOString(),
  });
}

type RunOneOptions = {
  maxConsecutiveFailures?: number;
  stopAtConsecutiveLimit?: boolean;
  reportedTokensBeforeRun?: number;
  maxReportedTokens?: number;
};

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

async function probeModel(model: string, apiKey: string): Promise<{
  model: string;
  status: number | null;
  success: boolean;
  latencyMs: number;
  tokens: { prompt: number; candidate: number; total: number };
  errorCode?: string;
}> {
  const request = buildGeminiGenerationRequest({
    model,
    apiKey,
    baseRequestBody: {
      contents: [{ role: "user", parts: [{ text: 'Reply with the word "OK".' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8 },
    },
    maxOutputTokens: 8,
    timeout: REQUEST_TIMEOUT_MS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const startedAt = Date.now();
  try {
    const response = await axios.post(request.url, request.body, request.config);
    return {
      model,
      status: response.status ?? 200,
      success: (response.status ?? 200) === 200,
      latencyMs: Date.now() - startedAt,
      tokens: tokenUsage(response),
    };
  } catch (error: any) {
    return {
      model,
      status: Number.isInteger(error?.response?.status) ? error.response.status : null,
      success: false,
      latencyMs: Date.now() - startedAt,
      tokens: { prompt: 0, candidate: 0, total: 0 },
      errorCode: providerFailureCode(error),
    };
  }
}

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
  filenameOverride?: string,
  retryAllFailed = false,
  batchLabel?: string,
  stopOnAccessFailure = false,
  personaMode = false,
  options: RunOneOptions = {},
): Promise<{
  rowCount: number;
  failures: number;
  stoppedAfterConsecutiveFailures: boolean;
  stoppedForAccessFailure: boolean;
  stoppedForProviderError: boolean;
  unresolvedRequestFailures: number;
  stoppedForTokenCap: boolean;
  calls: number;
  validRows: number;
  parseFailures: number;
  tokens: { prompt: number; candidate: number; total: number; unreported: number };
  latenciesMs: number[];
  rejectedResponses: Array<{ look_id: string; text: string | null }>;
}> {
  const role = model === (set2 ? "gemini-3.5-flash-lite" : getClassifierModelOrder()[0])
    ? "primary" : "fallback";
  const filename = filenameOverride ?? `${set2 ? "set2-" : ""}${mode}-${role}.csv`;
  const filePath = path.join(OUTPUT_DIR, filename);
  const { header, rows } = await readExistingCsv(filePath, looks, set2 || retryAllFailed);
  const verdicts = set2 ? SET2_VERDICTS : personaMode ? PERSONA_VERDICTS : VERDICTS;
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
  let stoppedForAccessFailure = false;
  let stoppedForProviderError = false;
  let stoppedForTokenCap = false;
  let waitBeforeNextCall = 0;
  let lastCallAt = 0;
  const latenciesMs: number[] = [];
  const rejectedResponses: Array<{ look_id: string; text: string | null }> = [];

  for (let index = 0; index < looks.length; index++) {
    if ((set2 || retryAllFailed)
      ? Boolean(rows[index].verdict)
      : !rows[index].reason.startsWith("REQUEST_FAILED_")) continue;
    const look = looks[index];
    let retriesForRow = 0;

    while (true) {
      if (options.maxReportedTokens !== undefined &&
          (options.reportedTokensBeforeRun ?? 0) + tokens.total >= options.maxReportedTokens) {
        stoppedForTokenCap = true;
        break;
      }
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
      const requestStartedAt = Date.now();

      try {
        const response = await axios.post(request.url, request.body, request.config);
        latenciesMs.push(Date.now() - requestStartedAt);
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
            rejectedResponses.push({ look_id: look.id, text: responseText(response) });
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
        if (options.maxReportedTokens !== undefined &&
            (options.reportedTokensBeforeRun ?? 0) + tokens.total >= options.maxReportedTokens) {
          stoppedForTokenCap = true;
        }
        break;
      } catch (error: any) {
        latenciesMs.push(Date.now() - requestStartedAt);
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
        if (stopOnAccessFailure && [401, 403, 404].includes(status)) {
          stoppedForAccessFailure = true;
          break;
        }
        if (stopOnAccessFailure && Number.isInteger(status) &&
            status >= 400 && status < 500 && status !== 429) {
          stoppedForProviderError = true;
          break;
        }
        const failureLimit = options.maxConsecutiveFailures ?? MAX_CONSECUTIVE_FAILURES;
        const limitReached = options.stopAtConsecutiveLimit
          ? consecutiveFailures >= failureLimit
          : consecutiveFailures > failureLimit;
        if (limitReached) {
          stoppedAfterConsecutiveFailures = true;
          break;
        }
        if (status === 429 || (Number.isInteger(status) && status >= 500)) {
          retriesForRow++;
          waitBeforeNextCall = retryDelay(retriesForRow, evidence.retryAfterMs);
        } else {
          break;
        }
      }

      if (stoppedAfterConsecutiveFailures || stoppedForTokenCap) break;
    }
    if (stoppedAfterConsecutiveFailures || stoppedForAccessFailure ||
        stoppedForProviderError || stoppedForTokenCap) break;
  }

  const failures = rows.filter((row) => !row.verdict).length;
  const unresolvedRequestFailures = rows.filter((row) =>
    row.reason.startsWith("REQUEST_FAILED_")).length;
  console.log(JSON.stringify({
    run: batchLabel ?? `${set2 ? "set2-" : ""}${mode}-${role}`,
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
    stoppedForAccessFailure,
    stoppedForProviderError,
    stoppedForTokenCap,
    unresolvedRequestFailures,
    validRows: rows.filter((row) => Boolean(row.verdict)).length,
    latencyMs: {
      median: percentile(latenciesMs, 0.5),
      p95: percentile(latenciesMs, 0.95),
    },
    rateLimitObservations: [...rateLimitObservations.values()],
    csv: path.join("docs/reports/judge-experiment", filename),
  }));
  return {
    rowCount: rows.length,
    failures,
    stoppedAfterConsecutiveFailures,
    stoppedForAccessFailure,
    stoppedForProviderError,
    unresolvedRequestFailures,
    stoppedForTokenCap,
    calls,
    validRows: rows.filter((row) => Boolean(row.verdict)).length,
    parseFailures,
    tokens,
    latenciesMs,
    rejectedResponses,
  };
}

async function runPersonaSet1ModelLadder(apiKey: string): Promise<void> {
  const { looks, systemPrompt, hashes } = await loadPersonaSet1Inputs();
  const priorRunText = await readFile(PERSONA_SET1_RUN_PATH, "utf8");
  const priorRun = JSON.parse(priorRunText.split(/\r?\n/, 1)[0]);
  if (priorRun.inputSha256?.systemPrompt !== "3024fe78a9d1157b9713eee92691713a18150328375f8eff10c065701f6b82d5" ||
      priorRun.systemPromptText !== systemPrompt ||
      hashes.systemPrompt !== priorRun.inputSha256.systemPrompt) {
    throw new Error("The Set 1 system prompt does not match the recorded prompt and SHA-256.");
  }
  await mkdir(OUTPUT_DIR, { recursive: true });
  await appendFile(PERSONA_SET1_RUN_PATH, `${JSON.stringify({
    type: "persona-set1-model-ladder-start",
    modelIds: PERSONA_SET1_MODEL_LADDER,
    inputSha256: hashes,
    systemPromptText: systemPrompt,
    startedAt: new Date().toISOString(),
    totalReportedTokenCap: PERSONA_SET1_TOKEN_CAP,
  })}\n`);

  const probes: Array<Awaited<ReturnType<typeof probeModel>>> = [];
  for (const model of PERSONA_SET1_MODEL_LADDER) {
    if (probes.length) await new Promise((resolve) => setTimeout(resolve, CALL_SPACING_MS));
    const probe = await probeModel(model, apiKey);
    probes.push(probe);
    console.log(JSON.stringify({ type: "persona-set1-generation-probe", ...probe }));
    await appendFile(PERSONA_SET1_RUN_PATH, `${JSON.stringify({
      type: "persona-set1-generation-probe",
      ...probe,
      recordedAt: new Date().toISOString(),
    })}\n`);
  }

  let reportedTokens = probes.reduce((sum, probe) => sum + probe.tokens.total, 0);
  if (reportedTokens >= PERSONA_SET1_TOKEN_CAP) {
    await appendFile(PERSONA_SET1_RUN_PATH, `${JSON.stringify({
      type: "persona-set1-model-ladder-stop",
      reason: "TOKEN_CAP_REACHED_DURING_PROBES",
      totalReportedTokens: reportedTokens,
      cap: PERSONA_SET1_TOKEN_CAP,
    })}\n`);
    return;
  }

  for (const probe of probes.filter((entry) => entry.success)) {
    await new Promise((resolve) => setTimeout(resolve, CALL_SPACING_MS));
    const filename = `persona-set1-${probe.model.replace(/[^A-Za-z0-9.-]/g, "-")}.csv`;
    const result = await runOne(
      "plain",
      probe.model,
      looks,
      systemPrompt,
      apiKey,
      false,
      filename,
      true,
      `persona-set1-plain:${probe.model}`,
      false,
      true,
      {
        maxConsecutiveFailures: 5,
        stopAtConsecutiveLimit: true,
        reportedTokensBeforeRun: reportedTokens,
        maxReportedTokens: PERSONA_SET1_TOKEN_CAP,
      },
    );
    reportedTokens += result.tokens.total;
    const runRecord = {
      type: "persona-set1-model-run",
      model: probe.model,
      csv: path.join("docs/reports/judge-experiment", filename),
      rowCount: result.rowCount,
      calls: result.calls,
      validRows: result.validRows,
      parseFailures: result.parseFailures,
      tokens: result.tokens,
      latencyMs: {
        median: percentile(result.latenciesMs, 0.5),
        p95: percentile(result.latenciesMs, 0.95),
      },
      rejectedResponses: result.rejectedResponses,
      remainingFailedRows: result.failures,
      stoppedAfterFiveConsecutiveFailures: result.stoppedAfterConsecutiveFailures,
      totalReportedTokensAfterRun: reportedTokens,
      tokenCap: PERSONA_SET1_TOKEN_CAP,
    };
    console.log(JSON.stringify(runRecord));
    await appendFile(PERSONA_SET1_RUN_PATH, `${JSON.stringify(runRecord)}\n`);
    if (result.stoppedForTokenCap || reportedTokens >= PERSONA_SET1_TOKEN_CAP) {
      await appendFile(PERSONA_SET1_RUN_PATH, `${JSON.stringify({
        type: "persona-set1-model-ladder-stop",
        reason: "TOKEN_CAP_REACHED",
        totalReportedTokens: reportedTokens,
        cap: PERSONA_SET1_TOKEN_CAP,
      })}\n`);
      break;
    }
  }
}

async function runPersonaSet1Plain(apiKey: string): Promise<void> {
  const { looks, systemPrompt, hashes } = await loadPersonaSet1Inputs();
  const catalog = await listPersonaModels(apiKey);
  const available = new Set(catalog.map((entry) => entry.name));
  const [configuredPrimary, configuredFallback] = getClassifierModelOrder();
  const requestedModels = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    ...catalog.filter((entry) => isLargerTextTier(entry.name)).map((entry) => entry.name),
  ].filter((name, index, models) => models.indexOf(name) === index);
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(JSON.stringify({
    type: "persona-set1-inputs",
    configuredPrimary,
    configuredFallback,
    inputSha256: hashes,
    systemPromptText: systemPrompt,
    catalogueGeneralTextModels: catalog,
    plannedModels: requestedModels,
  }));

  for (const model of requestedModels) {
    if (!available.has(model)) {
      console.log(JSON.stringify({
        type: "persona-set1-model-unavailable",
        model,
        reason: "Not listed with generateContent support for this key.",
      }));
      break;
    }
    const safeModelName = model.replace(/[^A-Za-z0-9.-]/g, "-");
    const result = await runOne(
      "plain",
      model,
      looks,
      systemPrompt,
      apiKey,
      false,
      `persona-set1-${safeModelName}.csv`,
      true,
      `persona-set1-plain:${model}`,
      true,
      true,
    );
    if (result.stoppedAfterConsecutiveFailures || result.stoppedForAccessFailure ||
        result.stoppedForProviderError || result.unresolvedRequestFailures > 0) break;
  }
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
  if (process.argv.includes("--persona-set1-prompt-tuning")) {
    return runPersonaSet1PromptTuning(apiKey);
  }
  if (process.argv.includes("--persona-set1-model-ladder")) return runPersonaSet1ModelLadder(apiKey);
  if (process.argv.includes("--persona-set1-plain")) return runPersonaSet1Plain(apiKey);
  if (process.argv.includes("--set3a-plain")) return runSet3aPlain(apiKey);
  if (process.argv.includes("--set2-confirmation")) return runSet2Confirmation(apiKey);
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
