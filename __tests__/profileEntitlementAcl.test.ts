import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import express from "express";
import request from "supertest";
import { registerRoutes, _testOverrides as routeTestOverrides } from "../server/routes";
import { _testOverrides as entitlementTestOverrides } from "../server/entitlements";
import { __storeOverrides } from "../server/middleware/rateLimiter";
import { makeSecurityStoreFixture } from "./helpers/securityStoreFixture";

// An isolated local PostgreSQL cluster: no application, Supabase or production data.
const dir = mkdtempSync(join(tmpdir(), "amodka-b1-"));
const username = userInfo().username;
let started = false;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no local port");
  return new Promise((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve(address.port)));
}

async function main(): Promise<void> {
  const port = await freePort();
  execFileSync("initdb", ["-D", dir, "--auth=trust", "--no-sync"], { stdio: "pipe" });
  execFileSync("pg_ctl", [
    "-D", dir, "-o", `-k ${dir} -p ${port} -c listen_addresses=''`,
    "-l", join(dir, "server.log"), "-w", "start",
  ], { stdio: "pipe" });
  started = true;
  const admin = new Client({ host: dir, port, user: username, database: "postgres" });
  await admin.connect();
  try {
    await admin.query(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE public.user_profiles (
        id uuid PRIMARY KEY, name text, body_type text, eye_color text,
        skin_tone text, undertone text, style_goals text[], secondary_goal text,
        lifestyle jsonb DEFAULT '{}', constraints jsonb DEFAULT '{}',
        location_lat double precision, location_lon double precision,
        premium boolean DEFAULT false, premium_expires_at timestamptz,
        onboarding_complete boolean DEFAULT false, is_guest boolean DEFAULT false
      );
      ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Users can view own profile" ON public.user_profiles
        FOR SELECT TO authenticated USING (auth.uid() = id);
      CREATE POLICY "Users can insert own profile" ON public.user_profiles
        FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
      CREATE POLICY "Users can update own profile" ON public.user_profiles
        FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
      CREATE POLICY "Users can delete own profile" ON public.user_profiles
        FOR DELETE TO authenticated USING (auth.uid() = id);
      CREATE POLICY "Users manage own profile" ON public.user_profiles
        FOR ALL TO PUBLIC USING (auth.uid() = id);
      GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
        ON public.user_profiles TO authenticated;
      GRANT INSERT (premium), UPDATE (premium_expires_at)
        ON public.user_profiles TO PUBLIC;
      GRANT SELECT, UPDATE, DELETE ON public.user_profiles TO service_role;
      GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
    `);
    const migration = readFileSync(
      "supabase/migrations/20260927000000_protect_user_profile_entitlements.sql", "utf8");
    await admin.query("BEGIN");
    try {
      await admin.query(migration);
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    }

    const grants = await admin.query(`
      SELECT has_column_privilege('authenticated','public.user_profiles','premium','INSERT') AS premium_insert,
        has_column_privilege('authenticated','public.user_profiles','premium','UPDATE') AS premium_update,
        has_column_privilege('authenticated','public.user_profiles','premium_expires_at','INSERT') AS expiry_insert,
        has_column_privilege('authenticated','public.user_profiles','premium_expires_at','UPDATE') AS expiry_update,
        has_table_privilege('authenticated','public.user_profiles','DELETE') AS profile_delete,
        has_table_privilege('authenticated','public.user_profiles','SELECT') AS profile_select,
        has_table_privilege('service_role','public.user_profiles','UPDATE') AS server_update
    `);
    assert.deepEqual(grants.rows[0], {
      premium_insert: false, premium_update: false,
      expiry_insert: false, expiry_update: false, profile_delete: false,
      profile_select: true, server_update: true,
    });
    assert.equal((await admin.query(
      "SELECT has_column_privilege('anon','public.user_profiles','premium','INSERT') AS allowed",
    )).rows[0].allowed, false);

    // A future inherited grant must abort this migration, never silently reopen B1.
    await admin.query(`
      CREATE ROLE inherited_writer NOLOGIN;
      GRANT UPDATE (premium) ON public.user_profiles TO inherited_writer;
      GRANT inherited_writer TO authenticated;
    `);
    await admin.query("BEGIN");
    try {
      await assert.rejects(admin.query(migration),
        /authenticated profile entitlement write privilege remains/);
    } finally {
      await admin.query("ROLLBACK");
      await admin.query("REVOKE inherited_writer FROM authenticated");
    }

    const alice = randomUUID();
    const bob = randomUUID();
    async function as<T>(role: "authenticated" | "anon" | "service_role",
                         id: string, action: (client: Client) => Promise<T>): Promise<T> {
      const client = new Client({ host: dir, port, user: username, database: "postgres" });
      await client.connect();
      try {
        await client.query(`SET ROLE ${role}`);
        await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
        return await action(client);
      } finally {
        await client.end();
      }
    }
    await as("authenticated", alice, async db => {
      // Matches the client's initial and conflict upsert shape (id is supplied).
      const upsert = `INSERT INTO public.user_profiles (id, name, lifestyle)
        VALUES ($1, $2, '{}'::jsonb)
        ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id, name=EXCLUDED.name,
          lifestyle=EXCLUDED.lifestyle`;
      await db.query(upsert, [alice, "Initial"]);
      await db.query(upsert, [alice, "Updated"]);
      assert.equal((await db.query("SELECT name, premium FROM public.user_profiles WHERE id=$1",
        [alice])).rows[0].name, "Updated");

      for (const column of ["premium", "premium_expires_at"] as const) {
        const value = column === "premium" ? true : "2099-01-01T00:00:00Z";
        await assert.rejects(
          db.query(`UPDATE public.user_profiles SET ${column}=$1 WHERE id=$2`, [value, alice]),
          { code: "42501" });
        await assert.rejects(
          db.query(`INSERT INTO public.user_profiles (id, ${column}) VALUES ($1,$2)`,
            [randomUUID(), value]), { code: "42501" });
      }
      await assert.rejects(
        db.query("UPDATE public.user_profiles SET name='forged', premium=true WHERE id=$1", [alice]),
        { code: "42501" });
      await assert.rejects(
        db.query("INSERT INTO public.user_profiles (id,name,premium_expires_at) VALUES ($1,'forged',now())",
          [randomUUID()]), { code: "42501" });
      await assert.rejects(
        db.query("DELETE FROM public.user_profiles WHERE id=$1", [alice]), { code: "42501" });
      assert.equal((await db.query("SELECT name,premium,premium_expires_at FROM public.user_profiles WHERE id=$1",
        [alice])).rows[0].premium, false);
      assert.equal((await db.query("SELECT id FROM public.user_profiles WHERE id=$1", [bob])).rowCount, 0);
      assert.equal((await db.query("UPDATE public.user_profiles SET name='intruder' WHERE id=$1",
        [bob])).rowCount, 0);
      await assert.rejects(
        db.query("INSERT INTO public.user_profiles (id,name) VALUES ($1,'intruder')", [bob]),
        { code: "42501" });
    });
    await as("anon", alice, async db => {
      await assert.rejects(
        db.query("INSERT INTO public.user_profiles (id,name) VALUES ($1,'anon')", [randomUUID()]),
        { code: "42501" });
      await assert.rejects(
        db.query("UPDATE public.user_profiles SET name='anon' WHERE id=$1", [alice]),
        { code: "42501" });
    });
    await as("service_role", bob, async db => {
      await db.query("UPDATE public.user_profiles SET premium=true,premium_expires_at=$1 WHERE id=$2",
        ["2099-01-01T00:00:00Z", alice]);
      assert.equal((await db.query("SELECT premium FROM public.user_profiles WHERE id=$1",
        [alice])).rows[0].premium, true);
      assert.equal((await db.query("DELETE FROM public.user_profiles WHERE id=$1",
        [alice])).rowCount, 1);
    });

    const newEmailUser = randomUUID();
    await as("authenticated", newEmailUser, async db => {
      // The email signup has no provider display name, so hydration upserts
      // only the authenticated user's ID and relies on profile defaults.
      await db.query(
        "INSERT INTO public.user_profiles (id) VALUES ($1) ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id",
        [newEmailUser],
      );
      const profile = await db.query(
        "SELECT id, premium, premium_expires_at FROM public.user_profiles WHERE id=$1",
        [newEmailUser],
      );
      assert.deepEqual(profile.rows[0], {
        id: newEmailUser, premium: false, premium_expires_at: null,
      });
    });

    const serverDb = new Client({ host: dir, port, user: username, database: "postgres" });
    await serverDb.connect();
    try {
      await serverDb.query("SET ROLE service_role");
      const app = express();
      __storeOverrides.client = makeSecurityStoreFixture().client;
      app.set("trust proxy", () => true);
      app.use(express.json());
      await registerRoutes(app);
      routeTestOverrides.authenticatedUser = { id: newEmailUser };
      entitlementTestOverrides.client = {
        from: (table: string) => ({
          select: (columns: string) => ({
            eq: (_column: string, id: string) => ({
              single: async () => {
                assert.equal(table, "user_profiles");
                assert.equal(columns, "premium,premium_expires_at");
                const result = await serverDb.query(
                  "SELECT premium,premium_expires_at FROM public.user_profiles WHERE id=$1",
                  [id],
                );
                return { data: result.rows[0] ?? null, error: null };
              },
            }),
          }),
        }),
      };
      const response = await request(app)
        .get("/api/user/entitlements")
        .set("Authorization", "Bearer local-test-token")
        .set("X-Forwarded-For", "198.51.100.240");
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { isPremium: false, expiresAt: null });
    } finally {
      delete routeTestOverrides.authenticatedUser;
      delete entitlementTestOverrides.client;
      await serverDb.end();
    }

    console.log("B1 isolated PostgreSQL ACL, profile upsert, entitlement endpoint and RLS checks passed");
  } finally {
    await admin.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (started) execFileSync("pg_ctl", ["-D", dir, "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(dir, { recursive: true, force: true });
});