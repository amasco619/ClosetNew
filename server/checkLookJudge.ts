import axios from "axios";
import { createHash } from "node:crypto";
import { z } from "zod";
import { CHECK_LOOK_PROMPT, CHECK_LOOK_PROMPT_HASH, CHECK_LOOK_PROMPT_VERSION } from "./checkLookPrompt";

export { CHECK_LOOK_PROMPT_HASH, CHECK_LOOK_PROMPT_VERSION };
export const MISSING_FACTS = [
  "denomination", "assigned_set", "announced_colours", "hem_position", "sleeve_lining", "sleeve_length",
] as const;
export type MissingFact = typeof MISSING_FACTS[number];
export interface JudgeResult {
  verdict: "Works" | "Almost" | "Rethink" | "Ask";
  reason: string;
  missing_fact: MissingFact | null;
}
export interface JudgeAnswer {
  result: JudgeResult;
  modelVersion: string;
  promptHash: string;
}
export type JudgePost = (url: string, body: unknown, config: {
  timeout: number; signal: AbortSignal; headers: Record<string, string>;
}) => Promise<{ status: number; data: unknown }>;

export function judgeEnabled(): boolean {
  return process.env.CHECK_LOOK_JUDGE_ENABLED === "true";
}

export function judgeModel(): string {
  const model = process.env.CHECK_LOOK_JUDGE_MODEL?.trim() || "gemini-3.5-flash";
  if (!/^gemini-[a-z0-9.-]{1,80}$/.test(model)) throw new Error("Invalid judge model");
  return model;
}

export function missingFactsFromGuard(missing: readonly string[]): MissingFact[] {
  const mappings: Record<MissingFact, RegExp> = {
    denomination: /^church (denomination|coverage rules for this denomination|hem rule for this denomination)$/,
    assigned_set: /^assigned (aso-ebi|funeral set)( membership| garment details)?$/,
    announced_colours: /^announced funeral colours$/,
    hem_position: /^hem position (for |required by )/,
    sleeve_lining: /^sleeve lining for /,
    sleeve_length: /^sleeve length (for |required by )/,
  };
  return MISSING_FACTS.filter(fact => missing.some(label => mappings[fact].test(label)));
}

export function judgeSchema(allowAsk = true, missingFacts: readonly MissingFact[] = MISSING_FACTS) {
  const allowed = allowAsk ? MISSING_FACTS.filter(fact => missingFacts.includes(fact)) : [];
  return {
    type: "OBJECT",
    properties: {
      verdict: { type: "STRING", enum: allowed.length ? ["Works", "Almost", "Rethink", "Ask"] : ["Works", "Almost", "Rethink"] },
      reason: { type: "STRING" },
      missing_fact: allowed.length
        ? { type: "STRING", nullable: true, enum: allowed }
        : { type: "NULL", enum: undefined },
    },
    required: ["verdict", "reason", "missing_fact"],
    propertyOrdering: ["verdict", "reason", "missing_fact"],
  };
}

const resultSchema = z.object({
  verdict: z.enum(["Works", "Almost", "Rethink", "Ask"]),
  reason: z.string().trim().min(1),
  // Retain an unsupported Ask long enough to request the model's non-Ask verdict.
  missing_fact: z.string().nullable(),
}).strict();

export function parseJudgeResponse(text: string, allowAsk: boolean, allowSleeveLengthAsk = false,
  missingFacts: readonly MissingFact[] = MISSING_FACTS): JudgeResult | null {
  try {
    const parsed = resultSchema.parse(JSON.parse(text));
    if (parsed.verdict === "Ask") {
      if (!allowAsk || !MISSING_FACTS.includes(parsed.missing_fact as MissingFact)) return null;
      if (!missingFacts.includes(parsed.missing_fact as MissingFact)) return null;
      if (parsed.missing_fact === "sleeve_length" && !allowSleeveLengthAsk) return null;
    } else if (parsed.missing_fact !== null) return null;
    const words = parsed.reason.split(/\s+/);
    if (words.length > 15) {
      parsed.reason = words.slice(0, 15).join(" ");
      console.info(JSON.stringify({ type: "check_look_judge_reason_trimmed", count: 1 }));
    }
    return parsed as JudgeResult;
  } catch {
    return null;
  }
}

export function buildJudgeBody(text: string, allowAsk = true, missingFacts: readonly MissingFact[] = MISSING_FACTS) {
  if (createHash("sha256").update(CHECK_LOOK_PROMPT).digest("hex") !== CHECK_LOOK_PROMPT_HASH) {
    throw new Error("Judge prompt integrity failure");
  }
  return {
    systemInstruction: { parts: [{ text: CHECK_LOOK_PROMPT }] },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      temperature: 0, maxOutputTokens: 1024,
      thinkingConfig: { thinkingLevel: "minimal" },
      responseMimeType: "application/json", responseSchema: judgeSchema(allowAsk, missingFacts),
    },
  };
}

export interface JudgeCallMetadata {
  type: "check_look_judge_call";
  requestedModel: string;
  modelVersion: string | null;
  promptHash: string;
  attempt: number;
  status: number | null;
  durationMs: number;
}

/** No response text, garment facts, user identity or raw provider error leaves this boundary. */
export async function callCheckLookJudge(text: string, options: {
  post?: JudgePost;
  model?: string;
  timeoutMs?: number;
  missingFacts?: readonly MissingFact[];
  record?: (metadata: JudgeCallMetadata) => void;
} = {}): Promise<JudgeAnswer> {
  if (process.env.NODE_ENV === "test" && !options.post) {
    throw new Error("Live judge access blocked under NODE_ENV=test; inject a mocked provider");
  }
  const model = options.model ?? judgeModel();
  const timeoutMs = options.timeoutMs ?? 6_000;
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const record = options.record ?? (metadata => console.info(JSON.stringify(metadata)));
  const post = options.post ?? axios.post;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async (): Promise<JudgeAnswer> => {
    const missingFacts = options.missingFacts ?? [];
    let allowAsk = missingFacts.length > 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (controller.signal.aborted) throw new Error("Judge timed out");
      const started = Date.now();
      let status: number | null = null;
      let modelVersion: string | null = null;
      let onAbort: (() => void) | undefined;
      try {
        const pending = post(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          buildJudgeBody(text + (allowAsk ? "" : "\nJudge the stated facts with your best non-Ask verdict; missing_fact must be null."), allowAsk, missingFacts),
          {
            timeout: Math.max(1, deadline - Date.now()), signal: controller.signal,
            headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
          },
        );
        const response = await Promise.race([pending, new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(new Error("Judge timed out"));
          controller.signal.addEventListener("abort", onAbort, { once: true });
          if (controller.signal.aborted) onAbort();
        })]);
        status = response.status;
        const data = response.data as {
          modelVersion?: string;
          candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        };
        modelVersion = typeof data?.modelVersion === "string" && /^[a-zA-Z0-9.-]{1,100}$/.test(data.modelVersion)
          ? data.modelVersion : null;
        if (status !== 200) throw new Error("Judge provider unavailable");
        const candidate = data?.candidates?.[0];
        const textResponse = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("") ?? "";
        const result = candidate?.finishReason === "STOP"
          ? parseJudgeResponse(textResponse, allowAsk, missingFacts.includes("sleeve_length"), missingFacts) : null;
        if (result && modelVersion) return { result, modelVersion, promptHash: CHECK_LOOK_PROMPT_HASH };
        // One retry for malformed output. Unsupported Ask uses a non-Ask schema,
        // so any conversion is still the model's answer, never an invented score.
        try {
          const rejected = JSON.parse(textResponse);
          if (rejected.verdict === "Ask" && (
            !missingFacts.includes(rejected.missing_fact)
          )) allowAsk = false;
        } catch { /* malformed JSON keeps the original schema */ }
      } catch (error) {
        const providerStatus = (error as { response?: { status?: unknown } } | null)?.response?.status;
        if (typeof providerStatus === "number" && Number.isInteger(providerStatus) &&
            providerStatus >= 100 && providerStatus <= 599) status = providerStatus;
        throw new Error("Judge unavailable");
      } finally {
        if (onAbort) controller.signal.removeEventListener("abort", onAbort);
        record({ type: "check_look_judge_call", requestedModel: model, modelVersion,
          promptHash: CHECK_LOOK_PROMPT_HASH, attempt, status, durationMs: Date.now() - started });
      }
    }
    throw new Error("Judge response invalid");
  };
  try {
    timer = setTimeout(() => controller.abort(), timeoutMs);
    return await work();
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
