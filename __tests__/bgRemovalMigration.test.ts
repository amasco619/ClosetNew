import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { Client } from "pg";

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

main().catch(error => { console.error(error); process.exitCode = 1; });
