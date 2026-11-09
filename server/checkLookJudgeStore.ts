import type { SupabaseClient } from "@supabase/supabase-js";

type Client = Pick<SupabaseClient, "rpc">;
export const _testOverrides: { client?: Client } = {};
export const JUDGE_QUOTA_PREFIX = "check-look-judge:";

async function client(): Promise<Client> {
  if (process.env.NODE_ENV === "test") {
    if (!_testOverrides.client) throw new Error("Live judge quota access blocked under NODE_ENV=test");
    return _testOverrides.client;
  }
  return (await import("./supabase")).supabaseAdmin;
}

export function judgeQuotaOwnerPrefix(userId: string): string {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(userId)) throw new Error("Invalid quota owner");
  return `${JUDGE_QUOTA_PREFIX}${userId}:`;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const db = await client();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = db.rpc(name, args);
    const request = typeof operation.abortSignal === "function" ? operation.abortSignal(controller.signal) : operation;
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Judge quota unavailable")); }, 1500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Existing atomic upsert serialises admissions across processes. Never falls back to memory. */
export async function consumeJudgeQuota(userId: string, premium: boolean, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const end = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
  const { data, error } = await rpc("ratelimit_increment", {
    p_key: `${judgeQuotaOwnerPrefix(userId)}${day}`, p_window_ms: Math.max(1, end - now),
  });
  const row = Array.isArray(data) ? data[0] : data;
  const hits = Number(row?.hits);
  if (error || !Number.isSafeInteger(hits) || hits < 1) throw new Error("Judge quota unavailable");
  const limit = premium ? 30 : 5;
  return { allowed: hits <= limit, remaining: Math.max(0, limit - hits) };
}

