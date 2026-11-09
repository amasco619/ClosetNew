/**
 * Synthetic-only, opt-in eval. Default is a hash/count preflight, not a provider call.
 * npx tsx scripts/check-look-live-eval.ts --live [--limit 72]
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { callCheckLookJudge, judgeModel, CHECK_LOOK_PROMPT_HASH } from "../server/checkLookJudge";

const INPUT = "attached_assets/looks3_1794220715219.txt";
const INPUT_HASH = "dc4c09fbd4e566ab41298cba7b70cb9a8260a6f04ed7b471296039b8593ed068";
export function parseSyntheticLooks(text: string) {
  const rows: Array<{ id: string; text: string }> = [];
  let scenario = "";
  let heading = "";
  for (const line of text.split(/\r?\n/)) {
    if (/^U\d{2} · /.test(line)) { heading = line; scenario = ""; }
    else if (/^She /.test(line)) scenario = line;
    else {
      const match = line.match(/^\s*(U\d{2}-[A-D]):\s*(.+)$/);
      if (match) rows.push({ id: match[1], text: `${heading}\n${scenario}\n${match[2]}` });
    }
  }
  if (rows.length !== 72 || new Set(rows.map(row => row.id)).size !== 72 ||
      rows.some((row, index) => row.id !== `U${String(Math.floor(index / 4) + 1).padStart(2, "0")}-${"ABCD"[index % 4]}`)) {
    throw new Error("Unexpected synthetic fixture structure");
  }
  return rows;
}
async function main() {
  const text = await readFile(INPUT, "utf8");
  if (createHash("sha256").update(text).digest("hex") !== INPUT_HASH) throw new Error("Synthetic input hash mismatch");
  const rows = parseSyntheticLooks(text);
  const arg = process.argv.indexOf("--limit");
  const limit = arg === -1 ? 72 : Number(process.argv[arg + 1]);
  if (!Number.isInteger(limit) || limit < 1 || limit > 72) throw new Error("Limit must be 1–72");
  console.info(JSON.stringify({ type: "check_look_eval_preflight", inputHash: INPUT_HASH,
    promptHash: CHECK_LOOK_PROMPT_HASH, requestedModel: judgeModel(), looks: rows.length, selected: limit }));
  if (!process.argv.includes("--live")) return;
  if (process.env.NODE_ENV === "test") throw new Error("Live eval blocked under NODE_ENV=test");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");
  const output = ["look_id,verdict,reason,missing_fact,requested_model,model_version,prompt_hash"];
  const quote = (value: string | null) => `"${(value ?? "").replace(/"/g, '""')}"`;
  await mkdir("generated-artifacts", { recursive: true });
  let failed = 0;
  for (const [index, row] of rows.slice(0, limit).entries()) {
    if (index) await new Promise(resolve => setTimeout(resolve, 5000));
    try {
      const answer = await callCheckLookJudge(row.text);
      output.push([row.id, answer.result.verdict, answer.result.reason, answer.result.missing_fact,
        judgeModel(), answer.modelVersion, answer.promptHash].map(quote).join(","));
    } catch {
      failed++;
      output.push([row.id, "", "REQUEST_FAILED", null, judgeModel(), null, CHECK_LOOK_PROMPT_HASH].map(quote).join(","));
    }
    await writeFile("generated-artifacts/check-look-live-eval.csv", `${output.join("\n")}\n`);
  }
  console.info(JSON.stringify({ type: "check_look_eval_complete", rows: limit, failed,
    output: "generated-artifacts/check-look-live-eval.csv" }));
  if (failed) process.exitCode = 1;
}
if (process.argv[1]?.endsWith("check-look-live-eval.ts")) {
  void main().catch(() => { console.error("Synthetic judge eval failed; no input or provider text logged."); process.exitCode = 1; });
}
