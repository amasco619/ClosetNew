import assert from "node:assert/strict";
import {
  _testOverrides, BgRemovalStoreUnavailableError, checkCacheByHash,
  getOrCreateBgRemovalResult, getUserBgRemovalCount, getUserBgRemovalStatus, incrementUserBgRemovalCount,
  initBgRemovalStore, resetUserBgRemovalCount, storeCacheResult,
} from "../server/bgRemovalStore";

async function main() {
  const usage = new Map<string, unknown>();
  const cache = new Map<string, { result_b64: string; created_at: number }>();
  const denied = { code: "42501", message: "permission denied" };
  const sensitiveCacheWriteFailure = {
    code: "42501",
    message: "provider-secret image-payload",
  };
  let failure: "read" | "rpc" | "cacheWrite" | "prune" | undefined;
  let malformedRpc: unknown;
  let throwNetwork = false;
  let reads = 0;
  const rpcCalls: string[] = [];
  const client = {
    from(table: string) {
      assert(["bg_removal_usage", "bg_removal_cache"].includes(table));
      return {
        select(columns: string) {
          assert.equal(columns, table === "bg_removal_usage" ? "count" : "result_b64");
          return {
            eq(column: string, key: string) {
              assert.equal(column, table === "bg_removal_usage" ? "user_id" : "image_hash");
              return {
                async maybeSingle() {
                  reads++;
                  if (throwNetwork) throw new Error("network unavailable");
                  if (failure === "read") return { data: null, error: denied };
                  return {
                    data: table === "bg_removal_usage"
                      ? (usage.has(key) ? { count: usage.get(key) } : null)
                      : (cache.get(key) ?? null),
                    error: null,
                  };
                },
              };
            },
          };
        },
        async upsert(row: { image_hash: string; result_b64: string }, options: unknown) {
          assert.equal(table, "bg_removal_cache");
          assert.deepEqual(options, { onConflict: "image_hash", ignoreDuplicates: true });
          if (failure === "cacheWrite") return { error: sensitiveCacheWriteFailure };
          if (!cache.has(row.image_hash)) {
            cache.set(row.image_hash, { result_b64: row.result_b64, created_at: Date.now() });
          }
          return { error: null };
        },
        delete(options: unknown) {
          assert.equal(table, "bg_removal_cache");
          assert.deepEqual(options, { count: "exact" });
          return {
            async lt(column: string, cutoff: string) {
              assert.equal(column, "created_at");
              assert(Math.abs(Date.parse(cutoff) - (Date.now() - 30 * 86400000)) < 1000);
              if (failure === "prune") return { count: null, error: denied };
              let count = 0;
              for (const [key, value] of cache) {
                if (value.created_at < Date.parse(cutoff)) { cache.delete(key); count++; }
              }
              return { count, error: null };
            },
          };
        },
      };
    },
    async rpc(name: string, params: { p_user_id: string }) {
      rpcCalls.push(name);
      if (throwNetwork) throw new Error("network unavailable");
      if (failure === "rpc") return { data: null, error: denied };
      if (name === "bg_removal_reset_usage") {
        usage.set(params.p_user_id, 0);
        return { data: null, error: null };
      }
      assert.equal(name, "bg_removal_increment_usage");
      if (malformedRpc !== undefined) return { data: malformedRpc, error: null };
      const count = Number(usage.get(params.p_user_id) ?? 0) + 1;
      usage.set(params.p_user_id, count);
      return { data: count, error: null };
    },
  };
  _testOverrides.client = client as unknown as NonNullable<typeof _testOverrides.client>;
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => { errors.push(args); };
  const originalInterval = globalThis.setInterval;
  let maintenance: (() => void) | undefined;
  Reflect.set(globalThis, "setInterval", (callback: () => void, delay: number) => {
    assert.equal(delay, 24 * 60 * 60 * 1000);
    maintenance = callback;
    return 0;
  });
  try {
    assert.equal(await getUserBgRemovalCount("new"), 0);
    // Preserve the existing TS admission check, not a new SQL cap.
    for (let i = 0; i < 20; i++) {
      assert.equal((await getUserBgRemovalStatus("free", 20)).allowed, true);
      assert.equal(await incrementUserBgRemovalCount("free"), i + 1);
    }
    assert.deepEqual(await getUserBgRemovalStatus("free", 20),
      { allowed: false, count: 20, remaining: 0 });
    const callsAtCap = rpcCalls.length;
    if ((await getUserBgRemovalStatus("free", 20)).allowed) {
      await incrementUserBgRemovalCount("free");
    }
    assert.equal(rpcCalls.length, callsAtCap, "blocked free admission must not increment");
    assert.equal(await incrementUserBgRemovalCount("free"), 21,
      "the RPC remains uncapped for Premium usage");
    await resetUserBgRemovalCount("free");
    await resetUserBgRemovalCount("new-reset");
    assert.equal(await getUserBgRemovalCount("free"), 0);
    assert.equal(await getUserBgRemovalCount("new-reset"), 0);

    for (const count of [null, -1, 1.5, "2", NaN, Infinity]) {
      usage.set("invalid", count);
      await assert.rejects(getUserBgRemovalCount("invalid"), BgRemovalStoreUnavailableError);
      malformedRpc = count;
      await assert.rejects(incrementUserBgRemovalCount("invalid"), BgRemovalStoreUnavailableError);
    }
    malformedRpc = undefined;
    failure = "read";
    await assert.rejects(getUserBgRemovalStatus("new", 20), BgRemovalStoreUnavailableError);
    assert.equal(await checkCacheByHash("denied-read"), null, "cache failure remains best effort");
    failure = "rpc";
    await assert.rejects(incrementUserBgRemovalCount("new"), BgRemovalStoreUnavailableError);
    await assert.rejects(resetUserBgRemovalCount("new"), BgRemovalStoreUnavailableError);
    failure = undefined;
    throwNetwork = true;
    await assert.rejects(getUserBgRemovalCount("new"), BgRemovalStoreUnavailableError);
    await assert.rejects(incrementUserBgRemovalCount("new"), BgRemovalStoreUnavailableError);
    await assert.rejects(resetUserBgRemovalCount("new"), BgRemovalStoreUnavailableError);
    throwNetwork = false;

    assert.equal(await checkCacheByHash("missing"), null);
    cache.set("database-hit", { result_b64: "db-image", created_at: Date.now() });
    assert.equal(await checkCacheByHash("database-hit"), "db-image");
    const readsBeforeMemoryHit = reads;
    assert.equal(await checkCacheByHash("database-hit"), "db-image");
    assert.equal(reads, readsBeforeMemoryHit);
    await storeCacheResult("insert-ignore", "first");
    await storeCacheResult("insert-ignore", "second");
    assert.equal(cache.get("insert-ignore")?.result_b64, "first");
    failure = "cacheWrite";
    const errorsBeforeCacheWrite = errors.length;
    let providerCalls = 0;
    const generatedImage = "image-base64-content";
    const result = await getOrCreateBgRemovalResult("best-effort-failure", async () => {
      providerCalls++;
      return generatedImage;
    });
    assert.equal(result, generatedImage, "cache write failure does not block the successful image result");
    assert.equal(providerCalls, 1);
    assert.equal(await checkCacheByHash("best-effort-failure"), generatedImage,
      "result remains available in the process-local cache");
    assert.equal(cache.has("best-effort-failure"), false,
      "failed persistent cache write is not represented as durable");
    const cacheWriteSignal = JSON.parse(String(errors[errorsBeforeCacheWrite]?.[0]));
    assert.equal(cacheWriteSignal.type, "error");
    assert.equal(cacheWriteSignal.operation, "background_removal_cache_write");
    assert.equal(cacheWriteSignal.category, "database");
    assert.equal(cacheWriteSignal.code, "DATABASE_UNAVAILABLE");
    assert.equal(cacheWriteSignal.dependency, "supabase");
    assert.equal(cacheWriteSignal.retryable, true);
    assert(!JSON.stringify(cacheWriteSignal).includes("provider-secret"));
    assert(!JSON.stringify(cacheWriteSignal).includes(generatedImage));
    failure = undefined;

    cache.set("old", { result_b64: "old", created_at: Date.now() - 31 * 86400000 });
    cache.set("recent", { result_b64: "recent", created_at: Date.now() - 29 * 86400000 });
    await initBgRemovalStore();
    assert.equal(cache.has("old"), false);
    assert.equal(cache.has("recent"), true);
    assert(maintenance, "startup schedules daily pruning without executing DDL");
    cache.set("old-again", { result_b64: "old", created_at: Date.now() - 31 * 86400000 });
    maintenance();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cache.has("old-again"), false);
    failure = "prune";
    await initBgRemovalStore(); // cache maintenance failure must not crash the server
    assert(errors.length > 0);
  } finally {
    delete _testOverrides.client;
    console.error = originalError;
    globalThis.setInterval = originalInterval;
  }
  console.log("Supabase bg-removal quota, fail-closed permissions/network, cache and TTL tests passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
