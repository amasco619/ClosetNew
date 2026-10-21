import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { reportError } from "../shared/observability";

const CACHE_MAX = 200;
const inMemCache = new Map<string, string>();
const inFlightResults = new Map<string, Promise<string>>();

export class BgRemovalStoreUnavailableError extends Error {
  constructor() {
    super("Background-removal quota store unavailable");
    this.name = "BgRemovalStoreUnavailableError";
  }
}

export function isValidBgRemovalCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function putInMem(hash: string, base64: string): void {
  if (inMemCache.size >= CACHE_MAX) {
    const oldest = inMemCache.keys().next().value;
    if (oldest) inMemCache.delete(oldest);
  }
  inMemCache.set(hash, base64);
}

type StoreClient = Pick<SupabaseClient, "from" | "rpc">;
export const _testOverrides: { client?: StoreClient } = {};

async function getStoreClient(): Promise<StoreClient> {
  if (process.env.NODE_ENV === "test" && _testOverrides.client) {
    return _testOverrides.client;
  }
  // Keep pure count/hash helpers usable without initialising server credentials.
  return (await import("./supabase")).supabaseAdmin;
}

export function computeImageHash(imageBase64: string): string {
  return crypto.createHash("sha256").update(imageBase64).digest("hex");
}

export async function initBgRemovalStore(): Promise<void> {
  // Tables/RPCs are provisioned by migration, never by application startup.
  await pruneBgRemovalCache();
  setInterval(() => void pruneBgRemovalCache(), 24 * 60 * 60 * 1000);
}

async function pruneBgRemovalCache(): Promise<void> {
  try {
    const client = await getStoreClient();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await client.from("bg_removal_cache")
      .delete({ count: "exact" }).lt("created_at", cutoff);
    if (error) throw error;
    const removed = count ?? 0;
    if (removed > 0) {
      console.log(`[bgRemovalStore] pruned ${removed} stale cache entries`);
    }
  } catch (err) {
    console.error("[bgRemovalStore] prune failed:", err);
  }
}

export async function checkCacheByHash(hash: string): Promise<string | null> {
  const mem = inMemCache.get(hash);
  if (mem) return mem;
  try {
    const client = await getStoreClient();
    const { data, error } = await client.from("bg_removal_cache")
      .select("result_b64").eq("image_hash", hash).maybeSingle();
    if (error) throw error;
    if (data) {
      putInMem(hash, data.result_b64);
      return data.result_b64;
    }
  } catch (err) {
    console.error("[bgRemovalStore] cache lookup failed:", err);
  }
  return null;
}

export async function storeCacheResult(hash: string, base64: string): Promise<void> {
  putInMem(hash, base64);
  try {
    const client = await getStoreClient();
    const { error } = await client.from("bg_removal_cache").upsert(
      { image_hash: hash, result_b64: base64 },
      { onConflict: "image_hash", ignoreDuplicates: true },
    );
    if (error) throw error;
  } catch (err) {
    reportError(new Error("Background-removal cache write failed"), "background_removal_cache_write", {
      category: "database",
      code: "DATABASE_UNAVAILABLE",
      dependency: "supabase",
      retryable: true,
    });
  }
}

export function getOrCreateBgRemovalResult(
  hash: string,
  create: () => Promise<string>,
): Promise<string> {
  const cached = inMemCache.get(hash);
  if (cached) return Promise.resolve(cached);

  const inFlight = inFlightResults.get(hash);
  if (inFlight) return inFlight;

  let pending: Promise<string>;
  pending = create()
    .then(async result => {
      await storeCacheResult(hash, result);
      return result;
    })
    .finally(() => {
      if (inFlightResults.get(hash) === pending) inFlightResults.delete(hash);
    });
  inFlightResults.set(hash, pending);
  return pending;
}

export async function getUserBgRemovalCount(userId: string): Promise<number> {
  try {
    const client = await getStoreClient();
    const { data, error } = await client.from("bg_removal_usage")
      .select("count").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const count = data ? data.count : 0;
    if (!isValidBgRemovalCount(count)) throw new Error("Invalid background-removal quota count");
    return count;
  } catch (error) {
    console.error("[bgRemovalStore] usage lookup failed:", error instanceof Error ? error.name : "unknown");
    throw new BgRemovalStoreUnavailableError();
  }
}

export async function incrementUserBgRemovalCount(userId: string): Promise<number> {
  try {
    const client = await getStoreClient();
    const { data: count, error } = await client.rpc(
      "bg_removal_increment_usage", { p_user_id: userId },
    );
    if (error) throw error;
    if (!isValidBgRemovalCount(count)) throw new Error("Invalid background-removal quota count");
    return count;
  } catch (err) {
    console.error("[bgRemovalStore] increment failed:", err instanceof Error ? err.name : "unknown");
    throw new BgRemovalStoreUnavailableError();
  }
}

/**
 * Resets the background-removal usage count for a user to 0.
 *
 * ## Re-subscribe policy (product decision)
 * When a user re-subscribes to premium after having lapsed, their free-tier
 * quota count is reset to 0. This grants a fresh slate of FREE_TIER_LIMIT
 * removals if they lapse again in the future.
 *
 * Rationale: the count accumulates while premium to keep lapsed-premium
 * accurate (see incrementUserBgRemovalCount comments in remove-background.ts),
 * but premium usage was never quota-gated — carrying that count forward into a
 * re-subscribe cycle would silently reduce the user's next free-tier window.
 * Resetting on re-subscribe is the commercially sensible and user-friendly
 * choice: premium is a paid tier that earns a fresh free-tier slate.
 *
 * This function should be called by the subscription-change webhook or admin
 * endpoint when a user transitions from free/lapsed → premium.
 */
export async function resetUserBgRemovalCount(userId: string): Promise<void> {
  try {
    const client = await getStoreClient();
    const { error } = await client.rpc("bg_removal_reset_usage", { p_user_id: userId });
    if (error) throw error;
  } catch (err) {
    console.error("[bgRemovalStore] reset failed:", err instanceof Error ? err.name : "unknown");
    throw new BgRemovalStoreUnavailableError();
  }
}

export async function getUserBgRemovalStatus(
  userId: string,
  freeLimit: number,
): Promise<{ allowed: boolean; count: number; remaining: number }> {
  const count = await getUserBgRemovalCount(userId);
  const remaining = Math.max(0, freeLimit - count);
  return { allowed: count < freeLimit, count, remaining };
}
