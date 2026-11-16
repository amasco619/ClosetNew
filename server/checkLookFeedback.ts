import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import app from "../app.json";

export const FEEDBACK_REASONS = [
  "too_strict", "too_lenient", "wrong_piece_read", "culture_or_occasion_wrong", "unclear_reason", "other",
] as const;
export const feedbackSchema = z.object({
  request_id: z.string().uuid(), thumbs: z.enum(["up", "down"]),
  reason_chip: z.enum(FEEDBACK_REASONS).nullable().optional(),
}).strict().refine(value => !value.reason_chip || value.thumbs === "down");
type Db = Pick<SupabaseClient, "from" | "rpc">;
export const _testOverrides: { client?: Db; appVersion?: string | null; timeoutMs?: number } = {};
async function client(): Promise<Db> {
  if (process.env.NODE_ENV === "test") {
    if (!_testOverrides.client) throw new Error("Live feedback access blocked in tests");
    return _testOverrides.client;
  }
  return (await import("./supabase")).supabaseAdmin;
}

async function bounded<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(run(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Feedback unavailable")); },
          process.env.NODE_ENV === "test" ? _testOverrides.timeoutMs ?? 750 : 750);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export interface VerdictReceipt {
  user_id: string; model_verdict: string; final_verdict: string; floor_rules: string[];
  payload_text: string; model_served: string | null; prompt_hash: string;
}
/** A receipt is optional. No storage/version failure can change the delivered verdict. */
export async function recordVerdict(receipt: VerdictReceipt): Promise<string | undefined> {
  try {
    const appVersion = process.env.NODE_ENV === "test" && _testOverrides.appVersion !== undefined
      ? _testOverrides.appVersion : app.expo.version;
    if (!appVersion) throw new Error("Missing app version");
    const requestId = randomUUID();
    const db = await client();
    const { error } = await bounded(signal => db.from("check_look_feedback")
      .insert({ ...receipt, request_id: requestId, app_version: appVersion }).abortSignal(signal));
    if (error) throw new Error("Receipt rejected");
    return requestId;
  } catch {
    console.warn(JSON.stringify({ event: "check_look_receipt_failed", count: 1 }));
    return undefined;
  }
}

export async function checkLookFeedbackRoute(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const userId = (req as Request & { authenticatedUser?: { id: string } }).authenticatedUser?.id;
  if (!userId) { res.status(401).json({ error: "authentication_required" }); return; }
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_feedback" }); return; }
  try {
    const db = await client();
    // Independent from verdict quota and AI consent. Shared persistent abuse store.
    const { data, error } = await bounded(signal => db.rpc("ratelimit_increment", {
      p_key: `check-look-feedback:${userId}`, p_window_ms: 60_000,
    }).abortSignal(signal));
    const hits = Number((Array.isArray(data) ? data[0] : data)?.hits);
    if (error || !Number.isSafeInteger(hits) || hits < 1) throw new Error("Feedback limit unavailable");
    if (hits > 30) { res.status(429).json({ error: "feedback_rate_limit" }); return; }
    const result = await bounded(signal => db.from("check_look_feedback").update({
      thumbs: parsed.data.thumbs, reason_chip: parsed.data.reason_chip ?? null,
    }).eq("user_id", userId).eq("request_id", parsed.data.request_id)
      .neq("final_verdict", "Ask").select("id").abortSignal(signal));
    if (result.error) throw new Error("Feedback unavailable");
    if (!result.data?.length) { res.status(404).json({ error: "feedback_receipt_unavailable" }); return; }
    res.json({ saved: true });
  } catch {
    res.status(503).json({ error: "feedback_unavailable" });
  }
}
