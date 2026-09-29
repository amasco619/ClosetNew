/**
 * Optional provider-backed run over the existing frozen synthetic GU PNGs.
 * Gold labels are read only for post-response scoring and are never sent to
 * the classifier. Output is versioned under artifacts/synthetic-gu/, outside
 * the protected benchmark and baseline directories.
 *
 * Default is all 40 GU images; set SYNTHETIC_GU_CASES=p0 for six P0 cases.
 * No provider calls happen without RUN_SYNTHETIC_GU_PROVIDER_V1=1.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import axios from "axios";
import express from "express";
import request from "supertest";
import { classifyGarment } from "../server/classify-garment";

const ROOT = process.cwd();
const IMAGE_DIR = path.join(ROOT, "docs/recommendation/africa/benchmark-v1/frozen-v1/images");
const GOLD_FILE = path.join(ROOT, "docs/recommendation/africa/benchmark-v1/frozen-v1/gold-standard/gold-labels.json");
const P0_CASE_IDS = new Set(["GU-11", "GU-16", "GU-17", "GU-29", "GU-39", "GU-40"]);
const ALL_CASE_IDS = Array.from({ length: 40 }, (_, i) => `GU-${String(i + 1).padStart(2, "0")}`);
const FIELDS = [
  "category", "subType", "colorFamily", "accentColor", "fabric", "pattern", "patternScale",
  "fit", "neckline", "sleeveLength", "rise", "warmthBand",
] as const;
const SUBTYPE_ALIASES: Record<string, string[]> = {
  gele: ["gele", "head tie", "head-tie"],
  headwrap: ["headwrap", "head wrap", "head-wrap"],
  "head-scarf": ["head scarf", "head-scarf", "headscarf"],
  "structured-headpiece": ["structured headpiece", "structured-headpiece", "headpiece"],
  wrapper: ["wrapper", "wrapper skirt", "iro"],
  "maxi-skirt": ["maxi skirt", "maxi-skirt"],
  "midi-skirt": ["midi skirt", "midi-skirt"],
  "mini-skirt": ["mini skirt", "mini-skirt"],
  "wide-leg": ["wide leg", "wide-leg"],
};
const FAMILY_ALIASES: Record<string, string[]> = {
  grey: ["grey", "gray"],
  cream: ["cream", "ivory"],
  beige: ["beige", "tan"],
  blue: ["blue"],
  navy: ["navy"],
};

type GoldLabel = {
  case_id: string;
  image_ref: { image_id: string };
  gold_label: Record<string, unknown>;
};

type Attempt = { model: string; latencyMs: number; upstreamStatus?: number };

function sanitizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  return text || null;
}

function words(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
}

function hasPhrase(haystack: unknown, phrase: string): boolean {
  return (` ${words(haystack)} `).includes(` ${words(phrase)} `);
}

function expectedCategory(goldType: unknown): string | null {
  const type = words(goldType);
  if (!type) return null;
  if (/\b(gele|head tie|headwrap|head scarf|headpiece|stole|scarf|hat|jewelry|earrings|necklace|bracelet|bag)\b/.test(type)) return "jewelry";
  if (/\b(skirt|trouser|pants|jeans|chinos|joggers|shorts|leggings|iro|wrapper)\b/.test(type)) return "bottom";
  if (/\b(dress|gown|kaftan|boubou|aso ebi)\b/.test(type)) return "dress";
  if (/\b(blazer|coat|jacket|outerwear|parka|trench)\b/.test(type)) return "outerwear";
  if (/\b(shoes|sneakers|boots|heels|sandals|flats|loafers)\b/.test(type)) return "shoes";
  if (/\b(blouse|shirt|top|buba|sweater|cardigan|hoodie)\b/.test(type)) return "top";
  return null;
}

function expectedPatternScale(gold: unknown): string | null {
  const value = words(gold);
  return ["small", "medium", "large"].includes(value) ? value : null;
}

function expectedChoice(text: unknown, choices: Record<string, string[]>): string | null {
  return Object.entries(choices).find(([, aliases]) => aliases.some(alias => hasPhrase(text, alias)))?.[0] ?? null;
}

function fieldAgreement(
  field: typeof FIELDS[number],
  predicted: unknown,
  predictions: Record<string, unknown>,
  gold: Record<string, unknown>,
): { predicted: unknown; gold: unknown; agreement: boolean | null } {
  const goldType = gold.garment_type;
  const descriptiveGoldText = [goldType, gold.fit].filter(value => typeof value === "string").join(" ");
  const goldValue = field === "category"
    ? expectedCategory(goldType)
    : field === "subType"
      ? goldType
      : field === "colorFamily"
        ? gold.colour
        : field === "accentColor"
          ? gold.colour
        : field === "patternScale"
          ? expectedPatternScale(gold.pattern_scale)
          : field === "fit"
            ? expectedChoice(gold.fit, {
              slim: ["slim", "fitted", "close-fitting"],
              regular: ["regular", "straight fit"],
              loose: ["loose", "relaxed fit"],
              oversized: ["oversized"],
              tailored: ["tailored", "structured fit"],
            })
            : field === "neckline"
              ? expectedChoice(descriptiveGoldText, {
                crew: ["crew neck"],
                "v-neck": ["v-neck", "v neck"],
                scoop: ["scoop neck"],
                turtleneck: ["turtleneck"],
                boat: ["boat neck"],
                square: ["square neck"],
                halter: ["halter"],
                "off-shoulder": ["off shoulder"],
                collared: ["collared"],
              })
              : field === "sleeveLength"
                ? expectedChoice(descriptiveGoldText, {
                  sleeveless: ["sleeveless"],
                  short: ["short sleeve", "short-sleeved"],
                  "three-quarter": ["three-quarter sleeve", "three quarter sleeve"],
                  long: ["long sleeve", "long-sleeved"],
                })
                : field === "rise"
                  ? expectedChoice(descriptiveGoldText, {
                    low: ["low rise", "low-waisted"],
                    mid: ["mid rise", "mid-waisted"],
                    high: ["high rise", "high-waisted"],
                  })
                  : field === "warmthBand"
                    ? null
                    : gold[field];
  if (goldValue == null || goldValue === "") return { predicted: predicted ?? null, gold: goldValue ?? null, agreement: null };
  if (predicted == null || predicted === "") return { predicted: null, gold: goldValue, agreement: false };

  const actual = words(predicted);
  let agreement = false;
  if (field === "category") {
    agreement = actual === goldValue;
  } else if (field === "subType") {
    const aliases = SUBTYPE_ALIASES[actual] ?? [actual.replace(/-/g, " ")];
    agreement = aliases.some(alias => hasPhrase(goldValue, alias));
  } else if (field === "colorFamily") {
    const aliases = FAMILY_ALIASES[actual] ?? [actual];
    agreement = aliases.some(alias => hasPhrase(goldValue, alias));
  } else if (field === "patternScale") {
    agreement = actual === goldValue;
  } else if (field === "accentColor") {
    const goldColors = words(goldValue).split(" ").filter(Boolean);
    agreement = goldColors.includes(actual) && actual !== words(predictions.colorFamily);
  } else {
    agreement = hasPhrase(goldValue, actual.replace(/-/g, " "));
  }
  return { predicted, gold: goldValue, agreement };
}

function outputPath(): string {
  const requested = process.env.SYNTHETIC_GU_OUTPUT_PATH;
  const outputDirectory = path.resolve(ROOT, "artifacts/synthetic-gu");
  const pathValue = path.resolve(ROOT, requested ?? path.join(
    "artifacts/synthetic-gu",
    `provider-v1.0.0-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  ));
  if (!pathValue.startsWith(`${outputDirectory}${path.sep}`) || !pathValue.endsWith(".json")) {
    throw new Error("Synthetic GU output must be a JSON file under artifacts/synthetic-gu.");
  }
  return pathValue;
}

async function main(): Promise<void> {
  if (process.env.RUN_SYNTHETIC_GU_PROVIDER_V1 !== "1") {
    console.log("Skipped: set RUN_SYNTHETIC_GU_PROVIDER_V1=1 to authorize provider calls.");
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required when provider execution is explicitly enabled.");
  }

  const goldJson = JSON.parse(await readFile(GOLD_FILE, "utf8")) as { garment_classification_cases: GoldLabel[] };
  const goldById = new Map(goldJson.garment_classification_cases.map(row => [row.case_id, row]));
  const selection = process.env.SYNTHETIC_GU_CASES ?? "all";
  const selectedIds = selection === "p0"
    ? ALL_CASE_IDS.filter(id => P0_CASE_IDS.has(id))
    : selection === "all"
      ? ALL_CASE_IDS
      : selection.split(",").map(id => id.trim().toUpperCase());
  if (!selectedIds.length || selectedIds.some(id => !ALL_CASE_IDS.includes(id) || !goldById.has(id))) {
    throw new Error("SYNTHETIC_GU_CASES must be 'all', 'p0', or a comma-separated list of GU-01 through GU-40.");
  }

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.post("/api/classify-garment", classifyGarment);

  const originalPost = axios.post;
  const modelCounts: Record<string, number> = {};
  let providerRequestCount = 0;
  let activeAttempts: Attempt[] | null = null;
  axios.post = (async (url: string, ...args: Parameters<typeof axios.post> extends [unknown, ...infer Rest] ? Rest : never[]) => {
    const pathname = new URL(url).pathname;
    const model = pathname.match(/\/models\/([^:]+):/)?.[1] ?? "unknown";
    const started = performance.now();
    providerRequestCount++;
    modelCounts[model] = (modelCounts[model] ?? 0) + 1;
    try {
      const result: any = await (originalPost as any)(url, ...(args as any));
      activeAttempts?.push({ model, latencyMs: Math.round(performance.now() - started), upstreamStatus: result.status });
      return result;
    } catch (error: any) {
      activeAttempts?.push({
        model,
        latencyMs: Math.round(performance.now() - started),
        ...(typeof error?.response?.status === "number" ? { upstreamStatus: error.response.status } : {}),
      });
      throw error;
    }
  }) as typeof axios.post;

  const results: Record<string, unknown>[] = [];
  const startedAt = performance.now();
  try {
    for (const caseId of selectedIds) {
      const goldCase = goldById.get(caseId)!;
      const imagePath = path.join(IMAGE_DIR, `${goldCase.image_ref.image_id}.png`);
      const imageBase64 = (await readFile(imagePath)).toString("base64");
      const attempts: Attempt[] = [];
      activeAttempts = attempts;
      const caseStarted = performance.now();
      let status = 500;
      let body: any = {};
      try {
        const response = await request(app)
          .post("/api/classify-garment")
          .send({ imageBase64, imageMimeType: "image/png" });
        status = response.status;
        body = response.body;
      } catch {
        body = { error: "harness_request_failure" };
      }
      const latencyMs = Math.round(performance.now() - caseStarted);
      activeAttempts = null;
      const refused = status === 422 && body.error === "content_guardrail";
      const classified = status === 200;
      const prediction = classified
        ? Object.fromEntries(FIELDS.map(field => [field, body[field] ?? null]))
        : Object.fromEntries(FIELDS.map(field => [field, null]));
      const gold = goldCase.gold_label;
      const perFieldAgreement = Object.fromEntries(
        FIELDS.map(field => [field, fieldAgreement(field, prediction[field], prediction, gold)]),
      );
      const result = {
        caseId,
        statusCode: status,
        outcome: classified ? "classified" : refused ? "refusal" : "error",
        refusalType: refused ? "content_guardrail" : null,
        refusalReason: refused ? sanitizeText(body.reason) : null,
        errorType: !classified && !refused ? sanitizeText(body.code ?? body.error) ?? "unknown_error" : null,
        prediction,
        perFieldAgreement,
        providerRequestCount: attempts.length,
        modelAttempts: attempts,
        fallbackUsed: attempts.length > 1,
        latencyMs,
      };
      results.push(result);
      console.log(`${caseId}: ${result.outcome} (${attempts.length} provider request${attempts.length === 1 ? "" : "s"})`);
    }
  } finally {
    axios.post = originalPost;
    activeAttempts = null;
  }

  const resultFile = outputPath();
  await mkdir(path.dirname(resultFile), { recursive: true });
  const report = {
    schemaVersion: "synthetic-gu-provider-v1.0.0",
    generatedAt: new Date().toISOString(),
    benchmarkInputs: {
      imageRoot: "docs/recommendation/africa/benchmark-v1/frozen-v1/images/",
      goldLabels: "docs/recommendation/africa/benchmark-v1/frozen-v1/gold-standard/gold-labels.json",
      goldReadOnly: true,
      goldLabelsSentToProvider: false,
    },
    diagnosticScope: "Safe diagnostics cannot identify the historical cause of GU-17's recorded 500.",
    selectedCaseCount: results.length,
    providerRequestCount,
    modelIdentity: Object.entries(modelCounts).map(([model, requests]) => ({ model, requests })),
    fallbackUsedCount: results.filter(result => result.fallbackUsed).length,
    totalLatencyMs: Math.round(performance.now() - startedAt),
    cases: results,
  };
  await writeFile(resultFile, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(`Wrote ${results.length} results to ${path.relative(ROOT, resultFile)}`);
}

main().catch(() => {
  // Never print provider or request exceptions; errors can carry sensitive URLs.
  console.error("Synthetic GU provider v1 failed safely. Check setup and output-path configuration.");
  process.exitCode = 1;
});