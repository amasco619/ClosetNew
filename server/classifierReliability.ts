import axios from "axios";
import { randomUUID } from "node:crypto";
import type { Response } from "express";

export const DEFAULT_CLASSIFIER_PRIMARY_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_CLASSIFIER_FALLBACK_MODEL = "gemini-2.5-flash";
export const CLASSIFIER_TOTAL_DEADLINE_MS = 39_000;
const MAX_ATTEMPT_TIMEOUT_MS = 8_500;

const MODEL_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{0,99}$/i;
const RETRYABLE_PROVIDER_STATUSES = new Set([429, 500, 502, 503, 504]);
const GUARDRAIL_FINISH_REASONS = new Set([
  "SAFETY",
  "IMAGE_SAFETY",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "RECITATION",
]);

export type ClassifierAttemptLog = {
  model: string;
  providerStatus: number | null;
  outcomeCode: string;
  finishReason: string | null;
  durationMs: number;
  providerModelVersion?: string;
};

export type ClassifierTrace = {
  requestId: string;
  recordAttempt: (attempt: ClassifierAttemptLog) => void;
  setOutcomeCode: (code: string) => void;
};

export type ClassifierDecision<T> =
  | { kind: "success"; value: T }
  | { kind: "malformed_json" }
  | { kind: "invalid"; code: string }
  | { kind: "refused"; value?: T };

export type GeminiRunResult<T> = {
  decision: ClassifierDecision<T>;
  providerStatus: number;
  finishReason: string | null;
  model: string;
};

export function getClassifierModelOrder(
  env: Record<string, string | undefined> = process.env,
): readonly [string, string] {
  const primary = (env.GEMINI_PRIMARY_MODEL?.trim() || DEFAULT_CLASSIFIER_PRIMARY_MODEL).replace(/^models\//, "");
  const fallback = (env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_CLASSIFIER_FALLBACK_MODEL).replace(/^models\//, "");
  if (!MODEL_NAME_PATTERN.test(primary) || !MODEL_NAME_PATTERN.test(fallback)) {
    throw new Error("Invalid Gemini classifier model name");
  }
  if (primary === fallback) {
    throw new Error("GEMINI_PRIMARY_MODEL and GEMINI_FALLBACK_MODEL must be different");
  }
  return [primary, fallback] as const;
}

export function getThinkingConfigForModel(
  model: string,
): { thinkingLevel: "minimal" | "low" } | { thinkingBudget: 0 } | undefined {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("gemini-2.5-")) return { thinkingBudget: 0 };
  if (
    normalized === "gemini-flash-lite-latest" ||
    normalized.startsWith("gemini-3.5-flash") ||
    normalized.startsWith("gemini-3.8-flash")
  ) {
    return { thinkingLevel: "minimal" };
  }
  if (normalized.startsWith("gemini-3.")) return { thinkingLevel: "low" };
  return undefined;
}

export function startClassifierTrace(
  res: Response,
  route: string,
  startedAt = Date.now(),
): ClassifierTrace {
  const suppliedRequestId = res.locals?.requestId;
  const requestId = typeof suppliedRequestId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID();
  const attempts: ClassifierAttemptLog[] = [];
  let outcomeCode = "UNSET";
  res.setHeader("x-classification-id", requestId);
  res.once?.("finish", () => {
    const lastAttempt = attempts.at(-1);
    console.info(JSON.stringify({
      type: "classification_request",
      timestamp: new Date().toISOString(),
      requestId,
      route,
      modelAttempts: attempts,
      attemptCount: attempts.length,
      providerStatus: lastAttempt?.providerStatus ?? null,
      outcomeCode,
      finishReason: lastAttempt?.finishReason ?? null,
      attemptDurationsMs: attempts.map((attempt) => attempt.durationMs),
      totalDurationMs: Math.max(0, Date.now() - startedAt),
    }));
  });
  return {
    requestId,
    recordAttempt: (attempt) => attempts.push(attempt),
    setOutcomeCode: (code) => { outcomeCode = code; },
  };
}

export class ClassifierDeadlineError extends Error {
  readonly code = "ETIMEDOUT";

  constructor() {
    super("Classifier request exceeded its bounded deadline");
    this.name = "TimeoutError";
  }
}

function providerStatus(error: unknown): number | null {
  const status = (error as any)?.response?.status;
  return Number.isInteger(status) ? status : null;
}

function isTimeout(error: unknown): boolean {
  const candidate = error as any;
  const message = typeof candidate?.message === "string" ? candidate.message.toLowerCase() : "";
  return candidate?.code === "ECONNABORTED" ||
    candidate?.code === "ETIMEDOUT" ||
    candidate?.name === "TimeoutError" ||
    message.includes("timeout");
}

function isNetworkFailure(error: unknown): boolean {
  const candidate = error as any;
  if (candidate?.response) return false;
  if (isTimeout(error)) return true;
  return axios.isAxiosError(error) ||
    ["ENOTFOUND", "ECONNRESET", "EHOSTUNREACH", "ECONNREFUSED", "EAI_AGAIN"].includes(candidate?.code) ||
    (typeof candidate?.message === "string" && /network|offline/i.test(candidate.message));
}

function errorOutcomeCode(error: unknown): string {
  const status = providerStatus(error);
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 401 || status === 403) return "PROVIDER_AUTH_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status !== null && status >= 500) return "PROVIDER_SERVER_ERROR";
  if (isTimeout(error)) return "REQUEST_TIMEOUT";
  if (isNetworkFailure(error)) return "NETWORK_ERROR";
  return "PROVIDER_HTTP_ERROR";
}

function isRetryable(error: unknown): boolean {
  const status = providerStatus(error);
  return status !== null
    ? RETRYABLE_PROVIDER_STATUSES.has(status)
    : isNetworkFailure(error);
}

function modelVersion(response: any): string | undefined {
  const version = response?.data?.modelVersion;
  return typeof version === "string" && /^gemini-[a-z0-9.-]{1,80}$/i.test(version)
    ? version
    : undefined;
}

function buildRequestBody(
  baseBody: Record<string, any>,
  model: string,
  maxOutputTokens: number,
): Record<string, any> {
  const thinkingConfig = getThinkingConfigForModel(model);
  return {
    ...baseBody,
    generationConfig: {
      ...(baseBody.generationConfig ?? {}),
      maxOutputTokens,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  };
}

type GeminiResponse = { data: any; status?: number };
type GeminiDependencies = {
  post?: (url: string, body: unknown, config: Record<string, unknown>) => Promise<GeminiResponse>;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

export async function runGeminiClassifier<T>(options: {
  models: readonly [string, string];
  apiKey: string;
  baseRequestBody: Record<string, any>;
  initialMaxOutputTokens: number;
  deadlineAt: number;
  trace: ClassifierTrace;
  decode: (response: GeminiResponse) => ClassifierDecision<T>;
  dependencies?: GeminiDependencies;
}): Promise<GeminiRunResult<T>> {
  const post = options.dependencies?.post ?? ((url, body, config) => axios.post(url, body, config));
  const sleep = options.dependencies?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options.dependencies?.random ?? Math.random;
  const now = options.dependencies?.now ?? Date.now;

  for (let modelIndex = 0; modelIndex < options.models.length; modelIndex++) {
    const model = options.models[modelIndex];
    let ordinaryRetryUsed = false;
    let tokenRetryUsed = false;
    let outputTokens = options.initialMaxOutputTokens;

    while (true) {
      const remainingMs = options.deadlineAt - now();
      if (remainingMs <= 0) {
        options.trace.setOutcomeCode("CLASSIFIER_DEADLINE_EXCEEDED");
        throw new ClassifierDeadlineError();
      }
      const timeout = Math.max(1, Math.min(MAX_ATTEMPT_TIMEOUT_MS, remainingMs));
      const signal = AbortSignal.timeout(timeout);
      const attemptStartedAt = now();
      let response: GeminiResponse;
      try {
        response = await post(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          buildRequestBody(options.baseRequestBody, model, outputTokens),
          { timeout, signal, headers: { "x-goog-api-key": options.apiKey } },
        );
      } catch (error) {
        const providerError = signal.aborted ? new ClassifierDeadlineError() : error;
        const status = providerStatus(providerError);
        const code = errorOutcomeCode(providerError);
        options.trace.recordAttempt({
          model,
          providerStatus: status,
          outcomeCode: code,
          finishReason: null,
          durationMs: Math.max(0, now() - attemptStartedAt),
        });
        if (status === 404) {
          options.trace.setOutcomeCode("MODEL_NOT_FOUND");
          throw providerError;
        }
        if (!isRetryable(providerError)) {
          options.trace.setOutcomeCode(code);
          throw providerError;
        }
        if (modelIndex === 0 && !ordinaryRetryUsed) {
          ordinaryRetryUsed = true;
          await jitteredBackoff(sleep, random, options.deadlineAt, now, options.trace);
          continue;
        }
        if (modelIndex === 0 && modelIndex + 1 < options.models.length) break;
        options.trace.setOutcomeCode(code);
        throw providerError;
      }

      const status = Number.isInteger(response.status) ? response.status! : 200;
      const candidate = response.data?.candidates?.[0];
      const blockReason = response.data?.promptFeedback?.blockReason;
      const promptBlocked = typeof blockReason === "string" && blockReason !== "" &&
        blockReason !== "BLOCK_REASON_UNSPECIFIED";
      const finishReason = typeof candidate?.finishReason === "string"
        ? candidate.finishReason
        : promptBlocked ? "PROMPT_BLOCKED" : null;
      const resolvedModel = modelVersion(response);

      if (promptBlocked || (finishReason && GUARDRAIL_FINISH_REASONS.has(finishReason))) {
        options.trace.recordAttempt({
          model,
          providerStatus: status,
          outcomeCode: "CONTENT_GUARDRAIL",
          finishReason,
          durationMs: Math.max(0, now() - attemptStartedAt),
          ...(resolvedModel ? { providerModelVersion: resolvedModel } : {}),
        });
        options.trace.setOutcomeCode("CONTENT_GUARDRAIL");
        return { decision: { kind: "refused" }, providerStatus: status, finishReason, model };
      }

      if (finishReason === "MAX_TOKENS") {
        options.trace.recordAttempt({
          model,
          providerStatus: status,
          outcomeCode: "MAX_TOKENS",
          finishReason,
          durationMs: Math.max(0, now() - attemptStartedAt),
          ...(resolvedModel ? { providerModelVersion: resolvedModel } : {}),
        });
        if (!tokenRetryUsed) {
          tokenRetryUsed = true;
          outputTokens *= 2;
          await jitteredBackoff(sleep, random, options.deadlineAt, now, options.trace);
          continue;
        }
        if (modelIndex === 0 && modelIndex + 1 < options.models.length) break;
        options.trace.setOutcomeCode("MAX_TOKENS");
        return {
          decision: { kind: "malformed_json" },
          providerStatus: status,
          finishReason,
          model,
        };
      }

      let decision: ClassifierDecision<T>;
      try {
        decision = options.decode(response);
      } catch (error) {
        options.trace.recordAttempt({
          model, providerStatus: status, outcomeCode: "INTERNAL_ERROR", finishReason,
          durationMs: Math.max(0, now() - attemptStartedAt),
          ...(resolvedModel ? { providerModelVersion: resolvedModel } : {}),
        });
        options.trace.setOutcomeCode("INTERNAL_ERROR");
        throw error;
      }
      const attemptCode = decision.kind === "success"
        ? "PROVIDER_OK"
        : decision.kind === "malformed_json"
          ? "MALFORMED_JSON"
          : decision.kind === "refused"
            ? "CONTENT_GUARDRAIL"
            : decision.code;
      options.trace.recordAttempt({
        model,
        providerStatus: status,
        outcomeCode: attemptCode,
        finishReason,
        durationMs: Math.max(0, now() - attemptStartedAt),
        ...(resolvedModel ? { providerModelVersion: resolvedModel } : {}),
      });

      if (decision.kind === "malformed_json") {
        if (modelIndex === 0 && !ordinaryRetryUsed) {
          ordinaryRetryUsed = true;
          await jitteredBackoff(sleep, random, options.deadlineAt, now, options.trace);
          continue;
        }
        if (modelIndex === 0 && modelIndex + 1 < options.models.length) break;
        options.trace.setOutcomeCode("MALFORMED_JSON");
        return { decision, providerStatus: status, finishReason, model };
      }

      if (decision.kind === "refused") options.trace.setOutcomeCode("CONTENT_GUARDRAIL");
      return { decision, providerStatus: status, finishReason, model };
    }
  }

  options.trace.setOutcomeCode("CLASSIFIER_MODEL_ORDER_EXHAUSTED");
  throw new Error("Classifier model order exhausted");
}

async function jitteredBackoff(
  sleep: (milliseconds: number) => Promise<void>,
  random: () => number,
  deadlineAt: number,
  now: () => number,
  trace: ClassifierTrace,
): Promise<void> {
  const desiredDelay = 50 + Math.floor(Math.max(0, Math.min(0.999, random())) * 101);
  const remainingMs = deadlineAt - now();
  if (remainingMs <= 1) {
    trace.setOutcomeCode("CLASSIFIER_DEADLINE_EXCEEDED");
    throw new ClassifierDeadlineError();
  }
  await sleep(Math.min(desiredDelay, remainingMs - 1));
}

export async function checkClassifierModelMetadata(
  models: readonly string[],
  apiKey: string,
  get: (url: string, config: Record<string, unknown>) => Promise<GeminiResponse> =
    (url, config) => axios.get(url, config),
): Promise<Array<{ model: string; available: boolean; status: number | null }>> {
  const results = await Promise.all(models.map(async (model) => {
    try {
      const response = await get(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
        { timeout: 5_000, headers: { "x-goog-api-key": apiKey } },
      );
      const methods = response.data?.supportedGenerationMethods;
      const available = Array.isArray(methods) && methods.includes("generateContent");
      const status = Number.isInteger(response.status) ? response.status! : 200;
      if (!available) {
        console.warn(JSON.stringify({
          type: "classifier_model_warning",
          timestamp: new Date().toISOString(),
          model,
          code: "MODEL_UNAVAILABLE",
          providerStatus: status,
        }));
      }
      return { model, available, status };
    } catch (error) {
      const status = providerStatus(error);
      console.warn(JSON.stringify({
        type: "classifier_model_warning",
        timestamp: new Date().toISOString(),
        model,
        code: status === 404 ? "MODEL_NOT_FOUND" : "MODEL_METADATA_CHECK_FAILED",
        providerStatus: status,
      }));
      return { model, available: false, status };
    }
  }));
  return results;
}

const startupModelOrder = getClassifierModelOrder();
if (process.env.NODE_ENV !== "test") {
  console.info(JSON.stringify({
    type: "classifier_model_order",
    timestamp: new Date().toISOString(),
    modelOrder: startupModelOrder,
  }));
  if (process.env.GEMINI_API_KEY) {
    void checkClassifierModelMetadata(startupModelOrder, process.env.GEMINI_API_KEY).catch(() => {
      console.warn(JSON.stringify({
        type: "classifier_model_warning",
        timestamp: new Date().toISOString(),
        code: "MODEL_METADATA_CHECK_FAILED",
      }));
    });
  } else {
    console.warn(JSON.stringify({
      type: "classifier_model_warning",
      timestamp: new Date().toISOString(),
      code: "MISSING_API_KEY",
    }));
  }
}
