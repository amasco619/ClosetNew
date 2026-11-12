// Experiment harness only. Imports production builders without invoking a route or database.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import axios from "axios";
import { judgeRequestSchema, profileJudgeConstraints, judgeGuard, exportJudgeText } from "../server/checkLookJudgeInput";
import { buildJudgeBody, parseJudgeResponse, MISSING_FACTS } from "../server/checkLookJudge";
import { CHECK_LOOK_PROMPT_HASH } from "../server/checkLookPrompt";
import { isValidCheckLookSelection } from "../lib/checkLook";
import type { WardrobeItem } from "../constants/types";

const INPUT = "attached_assets/looks4a_v2_1794442011359.json";
const OUT = "docs/reports/judge-experiment";
const LOG = `${OUT}/set4a-run.jsonl`;
const MODEL = "gemini-3.5-flash";
const CAP = 600_000;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const inputText = readFileSync(INPUT, "utf8");
const looks = JSON.parse(inputText);
const inputHash = hash(inputText);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const log = (value: unknown) => appendFileSync(LOG, JSON.stringify(value) + "\n");
const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const uuid = (key: string) => {
  const h = hash(key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function prepare(look: any, stripped: boolean) {
  const items = look.items.map((item: any, index: number) => ({
    id: uuid(`${look.look_id}/${index}`),
    category: item.category, subType: item.subtype, colorFamily: item.colour,
    ...(item.fabric !== null && !stripped ? { fabric: item.fabric } : {}),
    ...(item.sleeveLength !== null ? { sleeveLength: item.sleeveLength } : {}),
    ...(item.fit !== null ? { fit: item.fit } : {}),
    ...(item.neckline !== null ? { neckline: item.neckline } : {}),
    ...(item.formality !== null ? { formalityLevel: item.formality } : {}),
    ...(item.pattern !== null ? { pattern: item.pattern } : {}),
  })) as WardrobeItem[];
  const request = judgeRequestSchema.parse({
    selection: { ...look.selection, itemIds: items.map(item => item.id) }, brief: look.brief,
  });
  if (!isValidCheckLookSelection(items, request.selection.itemIds)) {
    throw new Error(`${look.look_id}: invalid production selection`);
  }
  const constraints = profileJudgeConstraints(look.profile);
  const guard = judgeGuard(request, items, [], constraints);
  const text = exportJudgeText(request, items, [], constraints, guard);
  const briefJSON = text.split("\n").find(line => line.startsWith("Brief: "))!.slice(7);
  const itemsBlock = text.slice(text.indexOf("\nItems:\n") + 1);
  return { request, guard, text, briefJSON, itemsBlock };
}

function supportedAsk(fact: string | null, missing: string[]): boolean {
  const patterns: Record<string, RegExp> = {
    denomination: /denomination/,
    assigned_set: /assigned (aso-ebi|funeral set)/,
    announced_colours: /announced funeral colours/,
    hem_position: /hem position/,
    sleeve_lining: /sleeve lining/,
    sleeve_length: /^sleeve length required by your coverage preference$/,
  };
  return !!fact && !!patterns[fact] && missing.some(value => patterns[fact].test(value));
}

function rejection(raw: string, finish: string | undefined, version: string | undefined, allowAsk: boolean, sleeve: boolean) {
  const reasons: string[] = [];
  if (finish !== "STOP") reasons.push(`other: finishReason=${finish ?? "absent"}`);
  if (!version) reasons.push("other: modelVersion absent");
  let obj: any;
  try { obj = JSON.parse(raw); } catch (error) {
    reasons.push(`schema: invalid JSON (${(error as Error).message})`);
    return reasons;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [...reasons, "schema: expected object"];
  const keys = Object.keys(obj).sort();
  if (keys.join(",") !== "missing_fact,reason,verdict") reasons.push(`schema: expected exactly missing_fact,reason,verdict; received ${keys.join(",")}`);
  if (!["Works", "Almost", "Rethink", ...(allowAsk ? ["Ask"] : [])].includes(obj.verdict)) reasons.push(`enum: verdict=${JSON.stringify(obj.verdict)}`);
  if (typeof obj.reason !== "string") reasons.push("schema: reason must be a string");
  else {
    const trimmed = obj.reason.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    if (words > 15) reasons.push(`word limit: ${words} words exceeds 15`);
    if (!trimmed || trimmed.length > 200) reasons.push(`schema: reason length ${trimmed.length} outside 1–200 characters`);
  }
  if (obj.missing_fact !== null && typeof obj.missing_fact !== "string") reasons.push("schema: missing_fact must be string or null");
  if (obj.verdict === "Ask" && !MISSING_FACTS.includes(obj.missing_fact)) reasons.push(`enum: unsupported missing_fact=${JSON.stringify(obj.missing_fact)}`);
  if (obj.verdict === "Ask" && obj.missing_fact === "sleeve_length" && !sleeve) reasons.push("other: sleeve_length Ask unsupported by guard");
  if (obj.verdict !== "Ask" && obj.missing_fact !== null) reasons.push("schema: non-Ask missing_fact must be null");
  return reasons;
}

async function main() {
  if (CHECK_LOOK_PROMPT_HASH !== "e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf") throw new Error("Frozen prompt mismatch");
  if (looks.length !== 24 || new Set(looks.map((l: any) => l.look_id)).size !== 24) throw new Error("Expected 24 unique looks");
  const prepared = ["ask-allowed", "fabric-stripped"].map(condition => ({
    condition, looks: looks.map((look: any) => ({ lookId: look.look_id, ...prepare(look, condition === "fabric-stripped") })),
  }));
  if (process.argv.includes("--validate-only")) {
    console.log(JSON.stringify({ inputHash, promptHash: CHECK_LOOK_PROMPT_HASH, prepared: prepared.map(p => ({ condition: p.condition, count: p.looks.length })) }));
    return;
  }
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");
  // Refuse overwrite: each requested condition is run only once.
  writeFileSync(LOG, "", { flag: "wx" });
  const headers = { "x-goog-api-key": process.env.GEMINI_API_KEY };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`;
  let budgetUsed = 0;
  let lastStart = 0;
  let capHit = false;
  let consecutiveFailures = 0;
  let stop = false;
  const allCalls: any[] = [];
  const summaries: any[] = [];
  log({ type: "manifest", input: INPUT, inputHash, requestedModel: MODEL, promptHash: CHECK_LOOK_PROMPT_HASH,
    tokenCap: CAP, inputPricePerMillion: 0.75, outputPricePerMillion: 3.75,
    priceBasis: "Set 3B v2 recorded Gemini 3.6 Flash Standard rates; estimate, not a new price verification",
    settings: buildJudgeBody(prepared[0].looks[0].text).generationConfig, startedAt: new Date().toISOString() });

  for (const batch of prepared) {
    const rows: any[] = [];
    let unsupportedAsks = 0, convertedAsks = 0;
    for (const look of batch.looks) {
      if (stop) break;
      let allowAsk = true;
      let parsed: any = null;
      let lastCall: any = null;
      const rowCalls: any[] = [];
      let pendingUnsupported = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const text = look.text + (allowAsk ? "" : "\nJudge the stated facts with your best non-Ask verdict; missing_fact must be null.");
        const body = buildJudgeBody(text, allowAsk);
        // countTokens does not accept systemInstruction; count the exact system and user text as contents.
        const countResponse = await axios.post(`${url}:countTokens`, { contents: [
          { role: "user", parts: body.systemInstruction.parts },
          ...body.contents,
        ] }, { headers, timeout: 30_000, validateStatus: () => true });
        if (countResponse.status !== 200 || !Number.isInteger(countResponse.data.totalTokens)) throw new Error(`Token reservation unavailable (HTTP ${countResponse.status}); no generation sent`);
        const reservation = countResponse.data.totalTokens + 1024 + 256;
        if (budgetUsed + reservation > CAP) {
          capHit = stop = true;
          log({ type: "cap_hit", condition: batch.condition, lookId: look.lookId, budgetUsed, reservation });
          break;
        }
        budgetUsed += reservation;
        log({ type: "reservation", condition: batch.condition, lookId: look.lookId, attempt,
          promptTokens: countResponse.data.totalTokens, reservation, budgetUsed });
        await sleep(Math.max(0, 5000 - (Date.now() - lastStart)));
        const started = Date.now();
        lastStart = started;
        let response: any;
        try { response = await axios.post(`${url}:generateContent`, body, { headers, timeout: 30_000, validateStatus: () => true }); }
        catch { response = { status: null, data: {} }; }
        const latency = Date.now() - started;
        const data = response.data;
        const candidate = data.candidates?.[0];
        const raw = candidate?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("") ?? "";
        const usage = data.usageMetadata;
        const total = Number.isInteger(usage?.totalTokenCount) ? usage.totalTokenCount : null;
        if (total !== null) budgetUsed += total - reservation;
        if (budgetUsed > CAP) throw new Error("Provider usage exceeded reservation; stopped");
        const sleeve = look.guard.missing.includes("sleeve length required by your coverage preference");
        const reasons = response.status === 200 ? rejection(raw, candidate?.finishReason, data.modelVersion, allowAsk, sleeve) : [];
        const answer = response.status === 200 && reasons.length === 0 ? parseJudgeResponse(raw, allowAsk, sleeve) : null;
        const unsupported = answer?.verdict === "Ask" && !supportedAsk(answer.missing_fact, look.guard.missing);
        lastCall = {
          type: "call", timestamp: new Date(started).toISOString(), condition: batch.condition, look_id: look.lookId,
          attempt, allowAsk, requested_model: MODEL, served_model: data.modelVersion ?? null,
          status: response.status, latency_ms: latency, finishReason: candidate?.finishReason ?? null,
          verdict: answer?.verdict ?? null, reason: answer?.reason ?? null, missing_fact: answer?.missing_fact ?? null,
          guard: look.guard, brief_json: look.briefJSON, items_block: look.itemsBlock, body,
          promptHash: CHECK_LOOK_PROMPT_HASH, payloadHash: hash(JSON.stringify(body)),
          prompt_tokens: usage?.promptTokenCount ?? 0, candidate_tokens: usage?.candidatesTokenCount ?? 0,
          thinking_tokens: usage?.thoughtsTokenCount ?? 0, total_tokens: total,
          parse_failure: response.status === 200 && !answer,
          rejection_reasons: reasons.length ? reasons : response.status === 200 && !answer ? ["other: production parser rejected"] : [],
          rejected_response_text: response.status === 200 && !answer ? raw : null,
          unsupported_ask: unsupported, reservation, budgetUsed,
        };
        log(lastCall);
        allCalls.push(lastCall); rowCalls.push(lastCall);
        console.log(`${batch.condition} ${look.lookId} attempt=${attempt} status=${response.status} parsed=${!!answer} unsupportedAsk=${unsupported}`);
        if (response.status !== 200) {
          consecutiveFailures++;
          if (consecutiveFailures >= 5) stop = true;
          break;
        }
        consecutiveFailures = 0;
        if (answer && !unsupported) {
          parsed = answer;
          if (pendingUnsupported && parsed.verdict !== "Ask") convertedAsks++;
          break;
        }
        if (unsupported) { unsupportedAsks++; pendingUnsupported = true; allowAsk = false; }
        else {
          try {
            const rejected = JSON.parse(raw);
            if (rejected.verdict === "Ask" && (!MISSING_FACTS.includes(rejected.missing_fact) ||
                (rejected.missing_fact === "sleeve_length" && !sleeve))) allowAsk = false;
          } catch { /* One parse retry with the same schema. */ }
        }
      }
      const row = {
        type: "result", condition: batch.condition, look_id: look.lookId,
        verdict: parsed?.verdict ?? "REQUEST_FAILED", reason: parsed?.reason ?? "No valid response",
        missing_fact: parsed?.missing_fact ?? null, served_model: lastCall?.served_model ?? null,
        latency_ms: lastCall?.latency_ms ?? null, total_latency_ms: rowCalls.reduce((n, c) => n + c.latency_ms, 0),
        guard: look.guard, brief_json: look.briefJSON, items_block: look.itemsBlock, attempts: rowCalls.length,
      };
      rows.push(row); log(row);
      const columns = ["look_id", "verdict", "reason", "missing_fact", "served_model", "latency_ms", "guard", "brief_json", "items_block"];
      writeFileSync(`${OUT}/set4a-${batch.condition}.csv`, columns.join(",") + "\n" +
        rows.map(r => columns.map(k => csv(k === "guard" ? JSON.stringify(r[k]) : r[k])).join(",")).join("\n") + "\n");
    }
    const calls = allCalls.filter(c => c.condition === batch.condition);
    const latencies = calls.map(c => c.latency_ms).sort((a, b) => a - b);
    const promptTokens = calls.reduce((n, c) => n + c.prompt_tokens, 0);
    const outputTokens = calls.reduce((n, c) => n + c.candidate_tokens + c.thinking_tokens, 0);
    const summary = { condition: batch.condition, rows: rows.length,
      validRows: rows.filter(r => r.verdict !== "REQUEST_FAILED").length, calls: calls.length,
      parseFailures: calls.filter(c => c.parse_failure).length, requestFailures: calls.filter(c => c.status !== 200).length,
      unsupportedAsks, convertedAsks, promptTokens, outputTokens,
      thinkingTokens: calls.reduce((n, c) => n + c.thinking_tokens, 0),
      totalTokens: calls.reduce((n, c) => n + (c.total_tokens ?? 0), 0),
      estimatedCost: (promptTokens * 0.75 + outputTokens * 3.75) / 1_000_000,
      medianMs: latencies[Math.ceil(latencies.length * 0.5) - 1] ?? null,
      p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null,
      servedVersions: [...new Set(calls.map(c => c.served_model))],
    };
    summaries.push(summary); log({ type: "condition_summary", ...summary });
  }
  log({ type: "summary", summaries, capHit, budgetUsed, tokenCap: CAP, endedAt: new Date().toISOString() });
  console.log(JSON.stringify({ summaries, capHit, budgetUsed }));
}

main().catch(error => { console.error(error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[URL]") : "Experiment failed"); process.exitCode = 1; });
