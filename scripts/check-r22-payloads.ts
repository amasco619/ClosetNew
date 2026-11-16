// Offline evidence: the entire model request, including guard facts, must stay stable.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { prepareSet4bLook } from "./run-set4b-judge";
import { buildJudgeBody } from "../server/checkLookJudge";

const files = [...new Set([
  "set4a-run.jsonl", "set4a-r14-run.jsonl", "set4b-run.jsonl", "set4b-church-run.jsonl",
].map(file => JSON.parse(readFileSync(`docs/reports/judge-experiment/${file}`, "utf8")
  .split("\n").find(line => line && JSON.parse(line).type === "manifest")!).input))];
const hashes: Record<string, string> = {};
for (const file of files) {
  for (const look of JSON.parse(readFileSync(file, "utf8"))) {
    for (const stripped of [false, true]) {
      const prepared = prepareSet4bLook(look, stripped);
      const body = buildJudgeBody(prepared.text, true, prepared.missingFacts);
      hashes[`${file}/${look.look_id}/${stripped ? "stripped" : "full"}`] =
        createHash("sha256").update(JSON.stringify(body)).digest("hex");
    }
  }
}
const manifest = JSON.stringify(hashes, null, 2) + "\n";
if (process.argv.includes("--verify")) {
  assert.equal(Object.keys(hashes).length, 108);
  assert.equal(createHash("sha256").update(manifest).digest("hex"),
    "24794c7e9d65e9563ad0acefae4dccd40efc35d87808f368d83164ca2c246486");
  console.log("PASS: all 108 full model bodies match the pre-R22 baseline");
} else {
  process.stdout.write(manifest);
}
