import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "amodka-bg-removal-"));
  const listener = createServer();
  await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const config = { host: directory, port, user: userInfo().username, database: "postgres" };
  let started = false;
  const admin = new Client(config);
  let connected = false;
  const restartUserId = randomUUID();
  const restartImage = Buffer.from("same-photo-after-restart").toString("base64");
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    BG_REMOVAL_TEST_SOCKET: directory,
    BG_REMOVAL_TEST_PORT: String(port),
    BG_REMOVAL_TEST_USER_ID: restartUserId,
    BG_REMOVAL_TEST_IMAGE: restartImage,
    SUPABASE_URL: "http://127.0.0.1:9",
    EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
    SUPABASE_SECRET_KEY: "local-test-only",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-only",
  };
  function runRemovalServer(mode: "first" | "restart"): number {
    const output = execFileSync("node_modules/.bin/tsx",
      ["__tests__/bgRemovalMigration.test.ts"], { env: {
        ...childEnv, BG_REMOVAL_RESTART_CHILD: mode,
      }, encoding: "utf8" });
    const result = output.split("\n").find(line => line.startsWith("RESTART_RESULT:"));
    assert(result, `the ${mode} removal server reports its provider-call count`);
    return Number(result!.slice("RESTART_RESULT:".length));
  }
  async function asRole<T>(role: string, action: (db: Client) => Promise<T>): Promise<T> {
    assert(["anon", "authenticated", "service_role"].includes(role));
    const db = new Client(config);
    await db.connect();
    try { await db.query(`SET ROLE ${role}`); return await action(db); }
    finally { await db.end(); }
  }
  try {
    execFileSync("initdb", ["-D", directory, "--auth=trust", "--no-sync"], { stdio: "pipe" });
    execFileSync("pg_ctl", ["-D", directory, "-o", `-k ${directory} -p ${port} -c listen_addresses=''`,
      "-l", join(directory, "postgres.log"), "-w", "start"], { stdio: "pipe" });
    started = true;
    await admin.connect();
    connected = true;
    await admin.query(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT ALL ON TABLES TO PUBLIC, anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    `);
    await admin.query(readFileSync(
      "supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql", "utf8",
    ));
    const metadata = await admin.query(`
      SELECT c.relname, c.relrowsecurity,
        (SELECT count(*)::int FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
      FROM pg_class c WHERE c.relnamespace='public'::regnamespace
        AND c.relname IN ('bg_removal_cache','bg_removal_usage') ORDER BY c.relname
    `);
    assert.equal(metadata.rows.length, 2);
    assert(metadata.rows.every(row => row.relrowsecurity && row.policies === 0));
    const functions = await admin.query(`
      SELECT proconfig,prosecdef FROM pg_proc
      WHERE pronamespace='public'::regnamespace
        AND proname IN ('bg_removal_increment_usage','bg_removal_reset_usage')
    `);
    assert.equal(functions.rows.length, 2);
    assert(functions.rows.every(row => !row.prosecdef && row.proconfig.includes('search_path=""')));
    const clientGrants = await admin.query(`
      SELECT a.privilege_type FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE c.relnamespace='public'::regnamespace
        AND c.relname IN ('bg_removal_cache','bg_removal_usage')
        AND a.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
      UNION ALL
      SELECT a.privilege_type FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
      WHERE p.pronamespace='public'::regnamespace
        AND p.proname IN ('bg_removal_increment_usage','bg_removal_reset_usage')
        AND a.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
    `);
    assert.deepEqual(clientGrants.rows, []);
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["bg_removal_usage", "bg_removal_cache"]) {
        await assert.rejects(asRole(role, db => db.query(`SELECT * FROM public.${table}`)),
          { code: "42501" });
      }
      for (const rpc of ["bg_removal_increment_usage", "bg_removal_reset_usage"]) {
        await assert.rejects(asRole(role, db => db.query(
          `SELECT public.${rpc}('00000000-0000-4000-8000-000000000001'::uuid)`,
        )), { code: "42501" });
      }
    }
    const id = "00000000-0000-4000-8000-000000000001";
    const counts = await Promise.all(Array.from({ length: 24 }, () =>
      asRole("service_role", async db => (await db.query(
        "SELECT public.bg_removal_increment_usage($1::uuid) AS count", [id],
      )).rows[0].count as number),
    ));
    assert.deepEqual(counts.sort((a, b) => a - b), Array.from({ length: 24 }, (_, i) => i + 1),
      "atomic upsert loses no concurrent increments and remains uncapped for Premium");
    await asRole("service_role", async db => {
      await db.query("SELECT public.bg_removal_reset_usage($1::uuid)", [id]);
      assert.equal((await db.query("SELECT count FROM public.bg_removal_usage WHERE user_id=$1", [id])).rows[0].count, 0);
      const fresh = "00000000-0000-4000-8000-000000000002";
      await db.query("SELECT public.bg_removal_reset_usage($1::uuid)", [fresh]);
      assert.equal((await db.query("SELECT count FROM public.bg_removal_usage WHERE user_id=$1", [fresh])).rows[0].count, 0);
      await db.query("INSERT INTO public.bg_removal_cache VALUES ('hash','first',now()),('old','old',now()-interval '31 days')");
      await db.query("INSERT INTO public.bg_removal_cache (image_hash,result_b64) VALUES ('hash','second') ON CONFLICT (image_hash) DO NOTHING");
      assert.equal((await db.query("SELECT result_b64 FROM public.bg_removal_cache WHERE image_hash='hash'")).rows[0].result_b64, "first");
      await db.query("DELETE FROM public.bg_removal_cache WHERE created_at < now()-interval '30 days'");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.bg_removal_cache")).rows[0].n, 1);
      await db.query("DELETE FROM public.bg_removal_usage WHERE user_id=$1", [id]);
      await db.query("DELETE FROM public.bg_removal_usage WHERE user_id=$1", [id]);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.bg_removal_cache")).rows[0].n, 1,
        "user deletion does not touch shared cache");
      await assert.rejects(db.query("UPDATE public.bg_removal_cache SET result_b64='forbidden'"),
        { code: "42501" });
    });
    assert.equal(runRemovalServer("first"), 1,
      "the first server invokes the stub provider once and stores its result");
    assert.equal((await admin.query(
      "SELECT count FROM public.bg_removal_usage WHERE user_id=$1", [restartUserId],
    )).rows[0].count, 1, "the first removal consumes one usage");
    assert.equal(runRemovalServer("restart"), 0,
      "a fresh server returns the persisted result without invoking the provider");
    assert.equal((await admin.query(
      "SELECT count FROM public.bg_removal_usage WHERE user_id=$1", [restartUserId],
    )).rows[0].count, 1, "a persisted cache hit does not consume another usage");
    await admin.query("DELETE FROM public.bg_removal_usage WHERE user_id=$1", [restartUserId]);
    assert.equal((await admin.query(
      "SELECT count(*)::int AS n FROM public.bg_removal_cache WHERE image_hash=$1",
      [createHash("sha256").update(restartImage).digest("hex")],
    )).rows[0].n, 1, "deleting per-user usage leaves the shared image cache available");
    // A quota write permission failure cannot turn into a successful RPC.
    await admin.query("REVOKE INSERT ON public.bg_removal_usage FROM service_role");
    await assert.rejects(asRole("service_role", db => db.query(
      "SELECT public.bg_removal_increment_usage($1::uuid)", [id],
    )), { code: "42501" });
    await assert.rejects(asRole("service_role", db => db.query(
      "SELECT public.bg_removal_reset_usage($1::uuid)", [id],
    )), { code: "42501" });
    console.log("Disposable PostgreSQL bg-removal migration, ACL/RLS, concurrent atomic upsert, reset, cache and deletion tests passed");
  } finally {
    if (connected) await admin.end();
    if (started) execFileSync("pg_ctl", ["-D", directory, "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.env.BG_REMOVAL_RESTART_CHILD) {
  runRemovalServerChild(process.env.BG_REMOVAL_RESTART_CHILD as "first" | "restart")
    .catch(error => { console.error(error); process.exitCode = 1; });
} else {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

async function runRemovalServerChild(mode: "first" | "restart") {
  const [{ removeBackground, _testOverrides }, store, { Client: PgClient }, expressModule, supertestModule] =
    await Promise.all([
      import("../server/remove-background"),
      import("../server/bgRemovalStore"),
      import("pg"),
      import("express"),
      import("supertest"),
    ]);
  const db = new PgClient({
    host: process.env.BG_REMOVAL_TEST_SOCKET,
    port: Number(process.env.BG_REMOVAL_TEST_PORT),
    user: userInfo().username,
    database: "postgres",
  });
  await db.connect();
  const imageHash = store.computeImageHash(process.env.BG_REMOVAL_TEST_IMAGE!);
  const client = {
    from(table: string) {
      assert(["bg_removal_cache", "bg_removal_usage"].includes(table));
      return {
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  assert.equal(column, table === "bg_removal_cache" ? "image_hash" : "user_id");
                  const result = await db.query(
                    `SELECT ${table === "bg_removal_cache" ? "result_b64" : "count"} ` +
                      `FROM public.${table} WHERE ${column}=$1`, [value],
                  );
                  if (!result.rows.length) return { data: null, error: null };
                  return { data: table === "bg_removal_cache"
                    ? result.rows[0] : { count: Number(result.rows[0].count) }, error: null };
                },
              };
            },
          };
        },
        async upsert(row: { image_hash: string; result_b64: string }) {
          await db.query(
            "INSERT INTO public.bg_removal_cache (image_hash,result_b64) VALUES ($1,$2) ON CONFLICT (image_hash) DO NOTHING",
            [row.image_hash, row.result_b64],
          );
          return { error: null };
        },
      };
    },
    async rpc(name: string, params: { p_user_id: string }) {
      const result = await db.query(
        `SELECT public.${name}($1::uuid) AS count`, [params.p_user_id],
      );
      return { data: result.rows[0].count, error: null };
    },
  };
  store._testOverrides.client = client as never;
  _testOverrides.useRealQuotaStore = true;
  _testOverrides.mockSupabaseAdmin = {
    auth: { getUser: async () => ({ data: { user: { id: process.env.BG_REMOVAL_TEST_USER_ID } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { premium: false, premium_expires_at: null }, error: null }),
        }),
      }),
    }),
  };
  process.env.PHOTOROOM_API_KEY = "local-test-provider-stub";
  let providerCalls = 0;
  const savedFetch = globalThis.fetch;
  type TestRaster = { width: number; height: number; data: Buffer };
  type TestPngCodec = {
    new(options: { width: number; height: number }): TestRaster;
    sync: { write(image: TestRaster): Buffer };
  };
  const { PNG } = require("pngjs") as { PNG: TestPngCodec };
  globalThis.fetch = async () => {
    providerCalls++;
    const png = new PNG({ width: 80, height: 80 });
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const offset = (y * png.width + x) * 4;
        png.data[offset] = (x * 17 + y * 3) % 256;
        png.data[offset + 1] = (x * 5 + y * 13) % 256;
        png.data[offset + 2] = (x * 11 + y * 7) % 256;
        png.data[offset + 3] = 255;
      }
    }
    const output = PNG.sync.write(png);
    return { ok: true, arrayBuffer: async () => output.buffer.slice(
      output.byteOffset, output.byteOffset + output.byteLength,
    ) } as Response;
  };
  const express = expressModule.default;
  const request = supertestModule.default;
  const app = express();
  app.use(express.json());
  app.post("/api/remove-background", removeBackground);
  try {
    const response = await request(app).post("/api/remove-background")
      .set("Authorization", "Bearer local-test-token")
      .send({ imageBase64: process.env.BG_REMOVAL_TEST_IMAGE });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    if (mode === "first") {
      assert.equal(response.body.fromCache, undefined);
      assert.equal(providerCalls, 1);
      for (let attempt = 0; attempt < 50; attempt++) {
        const cached = await db.query(
          "SELECT 1 FROM public.bg_removal_cache WHERE image_hash=$1", [imageHash],
        );
        if (cached.rowCount) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal((await db.query(
        "SELECT count(*)::int AS n FROM public.bg_removal_cache WHERE image_hash=$1", [imageHash],
      )).rows[0].n, 1, "the first server persisted its cache result before exit");
    } else {
      assert.equal(response.body.fromCache, true, "the fresh server reports a persisted cache hit");
      assert.equal(providerCalls, 0, "the fresh server does not call the provider");
    }
    console.log(`RESTART_RESULT:${providerCalls}`);
  } finally {
    globalThis.fetch = savedFetch;
    delete store._testOverrides.client;
    delete _testOverrides.useRealQuotaStore;
    delete _testOverrides.mockSupabaseAdmin;
    await db.end();
  }
}
