// One-off Set 4B experiment harness. Uses production payload builders and parser.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import axios from "axios";
import { judgeRequestSchema, profileJudgeConstraints, judgeGuard, exportJudgeText } from "../server/checkLookJudgeInput";
import { buildJudgeBody, missingFactsFromGuard, parseJudgeResponse, type MissingFact } from "../server/checkLookJudge";
import { CHECK_LOOK_PROMPT_HASH } from "../server/checkLookPrompt";
import { isValidCheckLookSelection } from "../lib/checkLook";
import type { WardrobeItem } from "../constants/types";

const INPUT = "attached_assets/looks4b_1794695292968.json";
const OUT = "docs/reports/judge-experiment";
const LOG = `${OUT}/set4b-run.jsonl`;
const MODEL = "gemini-3.5-flash";
const TOKEN_CAP = 600_000;
const CALL_CAP = 130;
const CONDITIONS = [
  { name: "ask-allowed-run1", stripped: false },
  { name: "ask-allowed-run2", stripped: false },
  { name: "fabric-stripped", stripped: true },
] as const;
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
  const missingFacts = missingFactsFromGuard(guard.missing);
  const text = exportJudgeText(request, items, [], constraints, guard);
  const briefJSON = text.split("\n").find((line: string) => line.startsWith("Brief: "))!.slice(7);
  const itemsBlock = text.slice(text.indexOf("\nItems:\n") + 1);
  return { request, guard, missingFacts, text, briefJSON, itemsBlock };
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

function rejection(raw: string, finish: string | undefined, version: string | undefined,
  allowAsk: boolean, missingFacts: readonly MissingFact[]) {
  const reasons: string[] = [];
  if (finish !== "STOP") reasons.push(`other: finishReason=${finish ?? "absent"}`);
  if (!version || !/^[a-zA-Z0-9.-]{1,100}$/.test(version)) reasons.push("other: modelVersion absent or invalid");
  let obj: any;
  try { obj = JSON.parse(raw); } catch (error) {
    reasons.push(`schema: invalid JSON (${(error as Error).message})`);
    return reasons;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [...reasons, "schema: expected object"];
  const keys = Object.keys(obj).sort();
  if (keys.join(",") !== "missing_fact,reason,verdict") reasons.push(`schema: expected exactly missing_fact,reason,verdict; received ${keys.join(",")}`);
  const askAllowed = allowAsk && missingFacts.length > 0;
  if (!["Works", "Almost", "Rethink", ...(askAllowed ? ["Ask"] : [])].includes(obj.verdict)) reasons.push(`enum: verdict=${JSON.stringify(obj.verdict)}`);
  if (typeof obj.reason !== "string") reasons.push("schema: reason must be a string");
  else if (!obj.reason.trim()) reasons.push("schema: reason must not be empty");
  if (obj.missing_fact !== null && typeof obj.missing_fact !== "string") reasons.push("schema: missing_fact must be string or null");
  if (obj.verdict === "Ask" && !missingFacts.includes(obj.missing_fact)) reasons.push(`enum: unsupported missing_fact=${JSON.stringify(obj.missing_fact)}`);
  if (obj.verdict !== "Ask" && obj.missing_fact !== null) reasons.push("schema: non-Ask missing_fact must be null");
  return reasons;
}

async function main() {
  const expectedPromptHash = "e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf";
  if (CHECK_LOOK_PROMPT_HASH !== expectedPromptHash) throw new Error("Frozen prompt mismatch");
  if (!Array.isArray(looks) || looks.length !== 30 || new Set(looks.map((l: any) => l.look_id)).size !== 30) {
    throw new Error("Expected 30 unique Set 4B looks");
  }
  const prepared = CONDITIONS.map(condition => ({
    condition: condition.name,
    looks: looks.map((look: any) => ({ lookId: look.look_id, ...prepare(look, condition.stripped) })),
  }));
  if (process.argv.includes("--validate-only")) {
    console.log(JSON.stringify({ inputHash, promptHash: CHECK_LOOK_PROMPT_HASH,
      prepared: prepared.map(p => ({ condition: p.condition, count: p.looks.length })) }));
    return;
  }
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");
  writeFileSync(LOG, "", { flag: "wx" });
  const headers = { "x-goog-api-key": process.env.GEMINI_API_KEY };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`;
  let budgetUsed = 0, generationCalls = 0, lastStart = 0, consecutiveFailures = 0;
  let capHit = false, stopped = false;
  const summaries: any[] = [];
  log({ type: "manifest", input: INPUT, inputHash, requestedModel: MODEL, promptHash: CHECK_LOOK_PROMPT_HASH,
    tokenCap: TOKEN_CAP, generationCallCap: CALL_CAP, inputPricePerMillion: 0.75, outputPricePerMillion: 3.75,
    priceBasis: "Same recorded Gemini 3.6 Flash Standard rate used in the prior Set 4A report; estimate, not re-verified",
    settings: buildJudgeBody(prepared[0].looks[0].text, true, prepared[0].looks[0].missingFacts).generationConfig,
    conditions: CONDITIONS.map(c => c.name), startedAt: new Date().toISOString() });

  for (const batch of prepared) {
    const rows: any[] = [];
    let unsupportedAsks = 0, convertedAsks = 0;
    const batchCalls: any[] = [];
    for (const look of batch.looks) {
      if (stopped) break;
      let allowAsk = true, parsed: any = null, lastCall: any = null;
      const rowCalls: any[] = [];
      let pendingUnsupported = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (generationCalls >= CALL_CAP) { stopped = capHit = true; break; }
        const text = look.text + (allowAsk ? "" : "\nJudge the stated facts with your best non-Ask verdict; missing_fact must be null.");
        const body = buildJudgeBody(text, allowAsk, look.missingFacts);
        const countResponse = await axios.post(`${url}:countTokens`, { contents: [
          { role: "user", parts: body.systemInstruction.parts }, ...body.contents,
        ] }, { headers, timeout: 30_000, validateStatus: () => true });
        if (countResponse.status !== 200 || !Number.isInteger(countResponse.data.totalTokens)) {
          throw new Error(`Token reservation unavailable (HTTP ${countResponse.status}); no generation sent`);
        }
        const reservation = countResponse.data.totalTokens + 1024 + 256;
        if (budgetUsed + reservation > TOKEN_CAP) {
          capHit = stopped = true;
          log({ type: "token_cap_hit", condition: batch.condition, lookId: look.lookId, budgetUsed, reservation });
          break;
        }
        budgetUsed += reservation;
        log({ type: "reservation", condition: batch.condition, lookId: look.lookId, attempt,
          promptTokens: countResponse.data.totalTokens, reservation, budgetUsed, generationCallsReserved: generationCalls + 1 });
        await sleep(Math.max(0, 5000 - (Date.now() - lastStart)));
        const started = Date.now();
        lastStart = started;
        generationCalls++;
        let response: any;
        try { response = await axios.post(`${url}:generateContent`, body, { headers, timeout: 30_000, validateStatus: () => true }); }
        catch { response = { status: null, data: {} }; }
        const latency = Date.now() - started, data = response.data;
        const candidate = data.candidates?.[0];
        const raw = candidate?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("") ?? "";
        const usage = data.usageMetadata;
        const total = Number.isInteger(usage?.totalTokenCount) ? usage.totalTokenCount : null;
        if (total !== null) budgetUsed += total - reservation;
        if (budgetUsed > TOKEN_CAP) throw new Error("Provider usage exceeded reservation; stopped");
        const answer = response.status === 200 && candidate?.finishReason === "STOP" &&
          typeof data.modelVersion === "string" && /^[a-zA-Z0-9.-]{1,100}$/.test(data.modelVersion)
          ? parseJudgeResponse(raw, allowAsk, look.missingFacts.includes("sleeve_length"), look.missingFacts) : null;
        const reasons = response.status === 200 && !answer
          ? rejection(raw, candidate?.finishReason, data.modelVersion, allowAsk, look.missingFacts) : [];
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
        log(lastCall); batchCalls.push(lastCall); rowCalls.push(lastCall);
        console.log(`${batch.condition} ${look.lookId} attempt=${attempt} status=${response.status} parsed=${!!answer} unsupportedAsk=${unsupported} calls=${generationCalls}`);
        if (response.status !== 200) {
          consecutiveFailures++;
          if (consecutiveFailures >= 5) stopped = true;
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
            if (rejected.verdict === "Ask" && !supportedAsk(rejected.missing_fact, look.guard.missing)) allowAsk = false;
          } catch { /* One production-parser retry. */ }
        }
      }
      const row = {
        type: "result", condition: batch.condition, look_id: look.lookId,
        verdict: parsed?.verdict?.toLowerCase() ?? "REQUEST_FAILED",
        reason: parsed?.reason ?? "No valid response", missing_fact: parsed?.missing_fact ?? null,
        served_model: lastCall?.served_model ?? null, latency_ms: lastCall?.latency_ms ?? null,
        retry: rowCalls.length > 1, parse_ok: !!parsed,
        confidence: "", swap_suggestion: "",
        guard_pass: look.guard.pass, guard_failures: look.guard.failures,
        guard_missing: look.guard.missing, guard_flags: look.guard.flags,
        total_latency_ms: rowCalls.reduce((n, c) => n + (c.latency_ms ?? 0), 0),
        guard: look.guard, brief_json: look.briefJSON, items_block: look.itemsBlock, attempts: rowCalls.length,
      };
      rows.push(row); log(row);
      const columns = ["look_id", "condition", "verdict", "confidence", "missing_fact", "reason", "swap_suggestion",
        "guard_pass", "guard_failures", "guard_missing", "served_model", "latency_ms", "retry", "parse_ok"];
      writeFileSync(`${OUT}/set4b-${batch.condition}.csv`, columns.join(",") + "\n" +
        rows.map(r => columns.map(k => csv(Array.isArray(r[k]) ? JSON.stringify(r[k]) : r[k])).join(",")).join("\n") + "\n");
    }
    const calls = batchCalls;
    const latencies = calls.map(c => c.latency_ms).filter((v: unknown) => typeof v === "number").sort((a: number, b: number) => a - b);
    const promptTokens = calls.reduce((n, c) => n + c.prompt_tokens, 0);
    const outputTokens = calls.reduce((n, c) => n + c.candidate_tokens + c.thinking_tokens, 0);
    const summary = { condition: batch.condition, rows: rows.length,
      validRows: rows.filter(r => r.parse_ok).length, calls: calls.length,
      parseFailures: calls.filter(c => c.parse_failure).length, requestFailures: calls.filter(c => c.status !== 200).length,
      retries: rows.filter(r => r.retry).length, unsupportedAsks, convertedAsks, promptTokens, outputTokens,
      thinkingTokens: calls.reduce((n, c) => n + c.thinking_tokens, 0),
      totalTokens: calls.reduce((n, c) => n + (c.total_tokens ?? 0), 0),
      estimatedCost: (promptTokens * 0.75 + outputTokens * 3.75) / 1_000_000,
      p50Ms: latencies[Math.ceil(latencies.length * 0.5) - 1] ?? null,
      p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null,
      servedVersions: [...new Set(calls.map(c => c.served_model))] };
    summaries.push(summary); log({ type: "condition_summary", ...summary });
    if (stopped) break;
  }
  log({ type: "summary", summaries, generationCalls, callCap: CALL_CAP, capHit, budgetUsed,
    tokenCap: TOKEN_CAP, endedAt: new Date().toISOString() });
  console.log(JSON.stringify({ summaries, generationCalls, capHit, budgetUsed }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[URL]") : "Experiment failed");
  process.exitCode = 1;
});
