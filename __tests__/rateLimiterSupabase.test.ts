import assert from "node:assert/strict";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import {
  __resetForTesting,
  __storeOverrides,
  aiPreferenceLimiter,
  checkAccountLockout,
  initLockoutStore,
  makeLimiterHandler,
  recordFailedAttempt,
  SupabaseRateLimitStore,
} from "../server/middleware/rateLimiter";

type Row = Record<string, any>;

function makeFakeSupabase() {
  const counters = new Map<string, { hits: number; resetTime: number }>();
  const lockouts = new Map<string, { value: string; expires: number | null }>();

  function from(table: string) {
    let operation = "";
    const filters: Array<(row: Row) => boolean> = [];
    let payload: Row | null = null;
    const matches = (row: Row) => filters.every((filter) => filter(row));

    const builder: any = {
      select: () => {
        operation = "select";
        return builder;
      },
      upsert: (row: Row) => {
        operation = "upsert";
        payload = row;
        return builder;
      },
      delete: () => {
        operation = "delete";
        return builder;
      },
      like: (column: string, pattern: string) => {
        const prefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
        filters.push((row) => String(row[column]).startsWith(prefix));
        return builder;
      },
      gt: (column: string, value: string | number) => {
        filters.push((row) => Number(new Date(row[column]).getTime() || row[column]) > Number(new Date(value).getTime() || value));
        return builder;
      },
      lte: (column: string, value: string | number) => {
        filters.push((row) => Number(new Date(row[column]).getTime() || row[column]) <= Number(new Date(value).getTime() || value));
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      then: (resolve: (value: any) => unknown, reject: (error: unknown) => unknown) =>
        execute().then(resolve, reject),
    };

    function execute(): Promise<any> {
      if (table === "lockout_store") {
        if (operation === "upsert" && payload) {
          lockouts.set(payload.key, { value: payload.value, expires: payload.expires });
          return Promise.resolve({ data: null, error: null });
        }
        if (operation === "select") {
          const data = [...lockouts.entries()]
            .map(([key, value]) => ({ key, ...value }))
            .filter(matches);
          return Promise.resolve({ data, error: null });
        }
        if (operation === "delete") {
          let count = 0;
          for (const [key, row] of lockouts) {
            if (matches({ key, ...row })) {
              lockouts.delete(key);
              count++;
            }
          }
          return Promise.resolve({ count, data: null, error: null });
        }
      }
      if (table === "ratelimit_store") {
        const data = [...counters.entries()]
          .map(([key, row]) => ({ key, hits: row.hits, reset_time: new Date(row.resetTime).toISOString() }))
          .filter(matches);
        return Promise.resolve({ data, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected table ${table}` } });
    }

    return builder;
  }

  const rpc = async (name: string, args: Row): Promise<any> => {
    if (name === "ratelimit_increment") {
      const now = Date.now();
      const entry = counters.get(args.p_key);
      const updated = !entry || now >= entry.resetTime
        ? { hits: 1, resetTime: now + Number(args.p_window_ms) }
        : { hits: entry.hits + 1, resetTime: entry.resetTime };
      counters.set(args.p_key, updated);
      return { data: [{ hits: updated.hits, reset_time_ms: updated.resetTime }], error: null };
    }
    if (name === "ratelimit_decrement") {
      const entry = counters.get(args.p_key);
      if (entry && entry.resetTime > Date.now()) {
        counters.set(args.p_key, { ...entry, hits: Math.max(0, entry.hits - 1) });
      }
      return { data: null, error: null };
    }
    if (name === "ratelimit_delete_key") {
      counters.delete(args.p_key);
      return { data: null, error: null };
    }
    if (name === "ratelimit_delete_prefix") {
      const pattern = String(args.p_key_pattern);
      const prefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
      for (const key of counters.keys()) if (key.startsWith(prefix)) counters.delete(key);
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unexpected RPC ${name}` } };
  };

  return { client: { from, rpc } as any, counters, lockouts };
}

async function main() {
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  try {
    const fake = makeFakeSupabase();
    const store = new SupabaseRateLimitStore("fixed", fake.client);
    store.init({ windowMs: 60_000 } as any);

    const first = await store.increment("client");
    now += 20_000;
    const second = await store.increment("client");
    assert.equal(first.totalHits, 1);
    assert.equal(second.totalHits, 2);
    assert.equal(second.resetTime!.getTime(), first.resetTime!.getTime(),
      "increment within an active window preserves its initial reset time");
    now += 40_001;
    const afterWindow = await store.increment("client");
    assert.equal(afterWindow.totalHits, 1, "expired fixed window starts at one hit");
    assert(afterWindow.resetTime!.getTime() > second.resetTime!.getTime());

    await store.decrement("client");
    assert.equal((await store.increment("client")).totalHits, 1, "decrement reduces active-window count");
    await store.increment("other");
    await store.resetKey("client");
    assert.equal((await store.increment("client")).totalHits, 1, "key reset affects only that key");
    await store.resetAll();
    assert.equal((await store.increment("other")).totalHits, 1, "prefix reset clears the store's own keys");

    const middlewareFake = makeFakeSupabase();
    const middlewareStore = new SupabaseRateLimitStore("middleware", middlewareFake.client);
    const app = express();
    app.post("/test", rateLimit({
      windowMs: 60_000,
      max: 5,
      store: middlewareStore,
      standardHeaders: true,
      legacyHeaders: true,
      handler: makeLimiterHandler(),
    }), (_req, res) => res.status(200).json({ ok: true }));
    for (let i = 0; i < 5; i++) {
      assert.equal((await request(app).post("/test")).status, 200);
    }
    const blocked = await request(app).post("/test");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error, "rate_limit");
    assert.match(blocked.headers["retry-after"], /^\d+$/);
    assert(Number(blocked.headers["retry-after"]) >= 1);

    const userFake = makeFakeSupabase();
    __resetForTesting();
    __storeOverrides.client = userFake.client;
    const userApp = express();
    userApp.use((req, _res, next) => {
      (req as any).authenticatedUser = { id: req.header("x-user") };
      next();
    });
    userApp.post("/test", aiPreferenceLimiter, (_req, res) => res.sendStatus(200));
    for (const user of [...Array(30).fill("alice"), ...Array(30).fill("bob")]) {
      assert.equal((await request(userApp).post("/test").set("x-user", user)).status, 200);
    }
    const aliceLimited = await request(userApp).post("/test").set("x-user", "alice");
    assert.equal(aliceLimited.status, 429);
    assert.equal(aliceLimited.body.error, "ai_preference_rate_limit");
    assert.equal((await request(userApp).post("/test").set("x-user", "bob")).status, 429);

    __resetForTesting();
    const lockoutFake = makeFakeSupabase();
    __storeOverrides.client = lockoutFake.client;
    for (let i = 0; i < 5; i++) recordFailedAttempt("person@example.com");
    assert.equal(checkAccountLockout("person@example.com").locked, true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert(lockoutFake.lockouts.has("lockout:person@example.com"));

    __resetForTesting();
    __storeOverrides.client = lockoutFake.client;
    await initLockoutStore();
    assert.equal(checkAccountLockout("person@example.com").locked, true,
      "lockout is restored from Supabase after an in-process cache reset");

    const neverClient = { rpc: () => new Promise(() => {}) } as any;
    const slowStore = new SupabaseRateLimitStore("slow", neverClient);
    const realConsoleError = console.error;
    console.error = () => {};
    const startedAt = performance.now();
    try {
      const fallback = await slowStore.increment("client");
      assert.equal(fallback.totalHits, 1, "timed-out Supabase call uses the in-memory fallback");
      assert.equal(slowStore._consecutiveDbFailuresForTesting, 1);
      assert(performance.now() - startedAt >= 1_400, "Supabase storage call is bounded by the short timeout");
    } finally {
      console.error = realConsoleError;
    }

    __resetForTesting();
    const unavailableClient = {
      from: () => ({ upsert: () => Promise.reject(new Error("offline")) }),
    } as any;
    __storeOverrides.client = unavailableClient;
    const realError = console.error;
    console.error = () => {};
    try {
      for (let i = 0; i < 5; i++) recordFailedAttempt("offline@example.com");
      assert.equal(checkAccountLockout("offline@example.com").locked, true,
        "lockout remains enforced from memory when Supabase persistence fails");
      await new Promise<void>((resolve) => setImmediate(resolve));
    } finally {
      console.error = realError;
      __resetForTesting();
    }
  } finally {
    Date.now = originalNow;
    __resetForTesting();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
