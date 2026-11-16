import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { WardrobeItem } from "../constants/types";
import type { CheckLookRequest } from "../lib/checkLookGuard";
import { judgeRequestSchema, exportJudgeItem } from "../server/checkLookJudgeInput";
import { floorJudgeAnswer } from "../server/checkLookFloor";
import { CHECK_LOOK_PROMPT_HASH, type JudgeAnswer, type JudgeResult } from "../server/checkLookJudge";

const ROOT = "docs/reports/judge-experiment";
const RUNS = [
  "set4b-run.jsonl",
  "set4b-church-run.jsonl",
  "set4a-run.jsonl",
  "set4a-r14-run.jsonl",
].filter(file => existsSync(`${ROOT}/${file}`));

function uuid(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function reconstructRequest(look: any, condition: string): { request: CheckLookRequest; items: WardrobeItem[] } {
  const items = look.items.map((item: any, index: number) => ({
    id: uuid(`${look.look_id}/${index}`),
    category: item.category,
    subType: item.subtype,
    colorFamily: item.colour,
    ...(item.fabric != null && !condition.includes("fabric-stripped") ? { fabric: item.fabric } : {}),
    ...(item.sleeveLength != null ? { sleeveLength: item.sleeveLength } : {}),
    ...(item.fit != null ? { fit: item.fit } : {}),
    ...(item.neckline != null ? { neckline: item.neckline } : {}),
    ...(item.formality != null ? { formalityLevel: item.formality } : {}),
    ...(item.pattern != null ? { pattern: item.pattern } : {}),
  })) as WardrobeItem[];
  const garmentFacts = Object.fromEntries(
    Object.entries(look.garmentFactsByItemIndex ?? {}).map(([index, facts]) => {
      const item = items[Number(index)];
      if (!item) throw new Error(`${look.look_id}: stored source fact points to missing item ${index}`);
      return [item.id, facts];
    }),
  );
  const request = judgeRequestSchema.parse({
    selection: { ...look.selection, itemIds: items.map(item => item.id) },
    brief: look.brief,
    ...(Object.keys(garmentFacts).length ? { garmentFacts } : {}),
  }) as CheckLookRequest;
  return { request, items };
}

function assertItemsMatch(row: any, request: CheckLookRequest, items: WardrobeItem[]): void {
  const facts = request.garmentFacts ?? {};
  const expected = request.selection.itemIds.map(id => {
    const item = items.find(value => value.id === id)!;
    return exportJudgeItem(item, facts[id]);
  }).map(line => line.split("; ").slice(0, 2).join("; ")).sort();
  const logged = String(row.items_block).split("\n").filter((line: string) => line.startsWith("Name: ")).sort();
  const loggedNamesColours = logged.map(line => line.split("; ").slice(0, 2).join("; "));
  if (JSON.stringify(expected) !== JSON.stringify(loggedNamesColours)) {
    throw new Error(`${row.look_id}/${row.condition}: source item labels/colours differ from stored run`);
  }
}

function answerFromStoredRow(row: any, promptHash: string): JudgeAnswer | null {
  const verdict = String(row.verdict ?? "").toLowerCase();
  if (!["works", "almost", "rethink", "ask"].includes(verdict)) return null;
  return {
    result: {
      verdict: verdict[0].toUpperCase() + verdict.slice(1) as JudgeResult["verdict"],
      reason: typeof row.reason === "string" && row.reason ? row.reason : "Stored output has no reason.",
      missing_fact: row.missing_fact ?? null,
    },
    modelVersion: typeof row.served_model === "string" ? row.served_model : "stored-output",
    promptHash,
  };
}

function csv(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

const scored: string[] = [
  "source,look_id,condition,model_verdict,floored_verdict,rules_fired",
];
let rowsRead = 0;

for (const file of RUNS) {
  const lines = readFileSync(`${ROOT}/${file}`, "utf8").split(/\r?\n/).filter(Boolean);
  const records = lines.map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  const manifest = records.find(record => record.type === "manifest");
  const promptHash = manifest?.promptHash ?? CHECK_LOOK_PROMPT_HASH;
  if (!manifest?.input || !existsSync(manifest.input)) {
    throw new Error(`${file}: source fixture from the run manifest is unavailable`);
  }
  const sourceLooks = JSON.parse(readFileSync(manifest.input, "utf8"));
  for (const line of lines) {
    let row: any;
    try { row = JSON.parse(line); } catch { continue; }
    if (row.type !== "result" || !row.guard || !row.brief_json || !row.items_block) continue;
    const answer = answerFromStoredRow(row, promptHash);
    if (!answer) continue;
    const look = sourceLooks.find((candidate: any) => candidate.look_id === row.look_id);
    if (!look) throw new Error(`${file}: source fixture is missing ${row.look_id}`);
    const { request, items } = reconstructRequest(look, row.condition);
    assertItemsMatch(row, request, items);
    const reconstructedBrief = JSON.parse(row.brief_json);
    if (reconstructedBrief.context !== request.brief.context) {
      throw new Error(`${file}/${row.look_id}: stored brief context differs from source fixture`);
    }
    const result = floorJudgeAnswer(answer, { request, items, guard: row.guard });
    const floored = result.answer.result.verdict.toLowerCase();
    scored.push([
      file, row.look_id, row.condition, answer.result.verdict.toLowerCase(), floored,
      result.firedRules.join("|"),
    ].map(csv).join(","));
    rowsRead++;
  }
}

if (!rowsRead) throw new Error("No stored Set 4A/4B result rows were available to score");
const output = `${ROOT}/floor-offline.csv`;
writeFileSync(output, `${scored.join("\n")}\n`);
console.log(`Re-scored ${rowsRead} stored verdict rows without provider calls: ${output}`);
