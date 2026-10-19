import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import express from "express";
import request from "supertest";
import { registerRoutes, _testOverrides } from "../server/routes";
import { supabaseAdmin, supabaseAnon } from "../server/supabase";
import {
  ACCOUNT_DELETION_RETAINED_TABLES,
  ACCOUNT_DELETION_SHARED_TABLES,
  ACCOUNT_DELETION_STORAGE_BUCKETS,
  ACCOUNT_DELETION_TABLES,
} from "../server/accountDeletionInventory";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { deleteUserBgRemovalUsage } from "../server/bgRemovalStore";

const tables: string[] = ACCOUNT_DELETION_TABLES.map(({ table }) => table);
const buckets: string[] = [...ACCOUNT_DELETION_STORAGE_BUCKETS];
const stages = [
  "billing_tombstone",
  ...buckets.flatMap(bucket => [
    `storage_list_${bucket}`, `storage_remove_${bucket}`, `storage_verify_${bucket}`,
  ]),
  ...tables.map(table => `table_${table}`),
  "auth_delete",
];
const userId = "deletion-test-user";

function assertCreatedTablesAreInventoried() {
  function readSources(directory: string, extension: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return readSources(path, extension);
      return entry.name.endsWith(extension) ? [readFileSync(path, "utf8")] : [];
    });
  }
  const serverSources = readSources("server", ".ts");
  const migrationSources = readSources("supabase/migrations", ".sql");
  const storageSources = [...serverSources, readFileSync("lib/storage.ts", "utf8")];
  const createdTables = new Set(
    [...serverSources, ...migrationSources]
      .flatMap(source => [
        ...source
          .replace(/\/\*[\s\S]*?\*\/|\/\/.*|--.*$/gm, "")
          .matchAll(/\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-z_][\w]*)/gi),
      ])
      .map(match => match[1].toLowerCase()),
  );
  const inventoriedTables = new Set<string>([
    ...tables,
    ...ACCOUNT_DELETION_RETAINED_TABLES.map(({ table }) => table),
    ...ACCOUNT_DELETION_SHARED_TABLES.map(({ table }) => table),
  ]);
  const unclassifiedTables = [...createdTables].filter(table => !inventoriedTables.has(table));
  assert.deepEqual(unclassifiedTables, [], "every server/migration-created table needs a deletion, retention, or shared-data policy");

  const referencedBuckets = new Set(
    storageSources.flatMap(source =>
      [...source.matchAll(/\.storage\.from\(\s*["']([^"']+)["']\s*\)/g)]
        .map(match => match[1]),
    ),
  );
  assert.deepEqual(
    [...referencedBuckets].filter(bucket => !buckets.includes(bucket)),
    [],
    "every literal Supabase Storage bucket needs account-deletion coverage",
  );

  const deletedTables = new Set<string>(tables);
  const sharedTablesDeleted = ACCOUNT_DELETION_SHARED_TABLES
    .map(({ table }) => table)
    .filter(table => deletedTables.has(table));
  assert.deepEqual(sharedTablesDeleted, [], "shared/global tables must never be in per-user deletion");
}

function mockDeletion(failure?: string, wardrobeCount = 1, silentRemoval = false) {
  const files = new Map<string, string[]>(buckets.map(bucket => [
    bucket,
    Array.from({ length: bucket === "wardrobe-images" ? wardrobeCount : 1 }, (_, i) => `file-${i}.jpg`),
  ] as const));
  const calls: string[] = [];
  const remainingTables = new Set(tables);
  let failAt = failure;
  const error = { message: "provider-private-error-do-not-log" };
  const originals = {
    storageFrom: supabaseAdmin.storage.from,
    from: supabaseAdmin.from,
    deleteUser: supabaseAdmin.auth.admin.deleteUser,
    verifyOtp: supabaseAnon.auth.verifyOtp,
    rpc: supabaseAdmin.rpc,
  };
  function failed(stage: string) {
    if (stage !== failAt) return false;
    failAt = undefined; // failures are one-shot to exercise retry after partial cleanup
    return true;
  }
  Reflect.set(supabaseAdmin.storage, "from", (bucket: string) => ({
    list: async (_prefix: string, options: { limit: number; offset?: number }) => {
      const stage = `storage_${options.limit === 1 ? "verify" : "list"}_${bucket}`;
      calls.push(stage);
      if (failed(stage)) return { data: null, error };
      const data = (files.get(bucket) ?? []).slice(options.offset ?? 0, (options.offset ?? 0) + options.limit)
        .map(name => ({ id: name, name }));
      return { data, error: null };
    },
    remove: async (paths: string[]) => {
      const stage = `storage_remove_${bucket}`;
      calls.push(stage);
      if (failed(stage)) return silentRemoval ? { data: paths, error: null } : { data: null, error };
      files.set(bucket, (files.get(bucket) ?? []).filter(name => !paths.includes(`${userId}/${name}`)));
      return { data: paths, error: null };
    },
  }));
  Reflect.set(supabaseAdmin, "from", (table: string) => ({
    delete: () => ({
      eq: async (column: string, id: string) => {
        assert.notEqual(table, "bg_removal_usage", "quota usage is not a Supabase table");
        assert.equal(column, ACCOUNT_DELETION_TABLES.find(entry => entry.table === table)?.ownerColumn);
        assert.equal(id, userId);
        const stage = `table_${table}`;
        calls.push(stage);
        if (failed(stage)) return { error };
        remainingTables.delete(table);
        return { error: null };
      },
    }),
  }));
  _testOverrides.deleteBgRemovalUsage = async id => {
    assert.equal(id, userId);
    const stage = "table_bg_removal_usage";
    calls.push(stage);
    if (failed(stage)) throw new Error(error.message);
    remainingTables.delete("bg_removal_usage");
  };
  Reflect.set(supabaseAdmin, "rpc", async (name: string) => {
    assert.equal(name, "billing_tombstone_account");
    calls.push("billing_tombstone");
    return { error: failed("billing_tombstone") ? error : null };
  });
  Reflect.set(supabaseAdmin.auth.admin, "deleteUser", async (id: string) => {
    assert.equal(id, userId);
    calls.push("auth_delete");
    assert.equal(remainingTables.size, 0, "all owned tables must be cleared before Auth");
    return { error: failed("auth_delete") ? error : null };
  });
  Reflect.set(supabaseAnon.auth, "verifyOtp", async () => ({
    data: { user: { id: userId } }, error: null,
  }));
  return {
    calls,
    files,
    remainingTables,
    restore() {
      Reflect.set(supabaseAdmin.storage, "from", originals.storageFrom);
      Reflect.set(supabaseAdmin, "from", originals.from);
      Reflect.set(supabaseAdmin.auth.admin, "deleteUser", originals.deleteUser);
      Reflect.set(supabaseAnon.auth, "verifyOtp", originals.verifyOtp);
      Reflect.set(supabaseAdmin, "rpc", originals.rpc);
      delete _testOverrides.deleteBgRemovalUsage;
    },
  };
}

async function main() {
  assertCreatedTablesAreInventoried();
  // This pool never connects: test the real deletion helper's SQL and failure semantics.
  const pool = new Pool();
  const sqlCalls: unknown[][] = [];
  Reflect.set(pool, "query", async (...args: unknown[]) => {
    sqlCalls.push(args);
    return { rowCount: 0 }; // a retry with no remaining row is success
  });
  await deleteUserBgRemovalUsage(userId, pool);
  await deleteUserBgRemovalUsage(userId, pool);
  assert.deepEqual(sqlCalls, Array.from({ length: 2 }, () => [
    "DELETE FROM bg_removal_usage WHERE user_id = $1", [userId],
  ]));
  await assert.rejects(deleteUserBgRemovalUsage(userId, null), /store unavailable/);
  for (const message of ["relation does not exist", "connection failed"]) {
    Reflect.set(pool, "query", async () => { throw new Error(message); });
    await assert.rejects(deleteUserBgRemovalUsage(userId, pool), new RegExp(message));
  }
  await pool.end();

  const billingEnabled = process.env.REVENUECAT_BILLING_ENABLED;
  process.env.REVENUECAT_BILLING_ENABLED = "true";

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  async function attempt(route: "app" | "web") {
    // Real limiter stays enabled; avoid persistent counters from other test runs.
    const ip = `203.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
    return route === "app"
      ? request(app).delete("/api/user/delete-account").set("X-Forwarded-For", ip).send({ userId })
      : request(app).post("/api/delete-account-confirm").set("X-Forwarded-For", ip)
        .type("form").send({ email: "person@example.com", token: "123456" });
  }

  // The original authentication and identity checks still gate the in-app route.
  const anonymous = await attempt("app");
  assert.equal(anonymous.status, 401);
  _testOverrides.authenticatedUser = { id: "another-user" };
  const forbidden = await attempt("app");
  assert.equal(forbidden.status, 403);
  _testOverrides.authenticatedUser = { id: userId };

  try {
    assert(tables.includes("bg_removal_usage"), "per-user background-removal usage must be deleted");
    const usageFailure = mockDeletion("table_bg_removal_usage");
    try {
      const res = await attempt("app");
      assert.equal(res.status, 500, "usage deletion failure uses the normal app failure status");
      assert.deepEqual(res.body, { success: false, error: "delete_failed" });
      assert(usageFailure.calls.includes("table_bg_removal_usage"));
      assert(!usageFailure.calls.includes("auth_delete"), "Auth deletion waits for usage cleanup");
    } finally {
      usageFailure.restore();
    }

    for (const route of ["app", "web"] as const) {
      for (const stage of stages) {
        const mock = mockDeletion(stage);
        try {
          const res = await attempt(route);
          assert.equal(res.status, route === "app" ? 500 : 400, `${route}: ${stage} status`);
          if (route === "app") {
            assert.deepEqual(res.body, { success: false, error: "delete_failed" });
          } else {
            assert.match(res.text, /Account deletion could not be completed/);
            assert.doesNotMatch(res.text, /Account deleted successfully/i);
          }
          assert.doesNotMatch(res.text, /provider-private-error-do-not-log/);
          assert.equal(mock.calls.includes("auth_delete"), stage === "auth_delete",
            `${route}: Auth must only be attempted after successful cleanup (${stage})`);
          const retry = await attempt(route);
          assert.equal(retry.status, 200, `${route}: retry completes after ${stage}`);
          assert.equal(mock.remainingTables.size, 0);
          console.log(`  ✓ ${route} fails closed at ${stage}`);
        } finally {
          mock.restore();
        }
      }
      // Retry after partial Storage/DB cleanup, and after Auth deletion fails.
      for (const stage of ["table_wardrobe_items", "auth_delete"]) {
        const mock = mockDeletion(stage, 205);
        try {
          const first = await attempt(route);
          assert.equal(first.status, route === "app" ? 500 : 400);
          assert.equal(mock.files.get("wardrobe-images")?.length, 0, "all paginated files removed");
          assert.equal(mock.calls.includes("auth_delete"), stage === "auth_delete");
          const second = await attempt(route);
          assert.equal(second.status, 200, `${route}: retry after ${stage}`);
          if (route === "app") assert.deepEqual(second.body, { success: true });
          else assert.match(second.text, /deleted/i);
          assert.equal(mock.files.get("tryon-photos")?.length, 0);
          console.log(`  ✓ ${route} retry succeeds after partial ${stage} failure`);
        } finally {
          mock.restore();
        }
      }
      const silent = mockDeletion("storage_remove_wardrobe-images", 1, true);
      try {
        const res = await attempt(route);
        assert.equal(res.status, route === "app" ? 500 : 400);
        assert(silent.calls.includes("storage_verify_wardrobe-images"));
        assert(!silent.calls.includes("auth_delete"));
        console.log(`  ✓ ${route} detects a no-op Storage remove response`);
      } finally {
        silent.restore();
      }
      const mock = mockDeletion(undefined, 205);
      try {
        const res = await attempt(route);
        assert.equal(res.status, 200, `${route}: full cleanup succeeds`);
        assert.equal(mock.files.get("wardrobe-images")?.length, 0);
        assert.equal(mock.calls.filter(stage => stage === "storage_list_wardrobe-images").length, 3);
        for (const table of tables) {
          assert(mock.calls.includes(`table_${table}`), `per-user table ${table} is deleted`);
        }
        for (const { table } of ACCOUNT_DELETION_SHARED_TABLES) {
          assert(!mock.calls.includes(`table_${table}`), `shared table ${table} is retained`);
        }
        for (const { table } of ACCOUNT_DELETION_RETAINED_TABLES) {
          assert(!mock.calls.includes(`table_${table}`), `billing table ${table} is handled by its retention policy`);
        }
        assert.equal(mock.calls.filter(stage => stage === "auth_delete").length, 1);
        console.log(`  ✓ ${route} deletes every page before confirming success`);
      } finally {
        mock.restore();
      }
    }
    const limitedIp = `202.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
    const mock = mockDeletion();
    try {
      for (let i = 0; i < 5; i++) {
        const response = await request(app).delete("/api/user/delete-account")
          .set("X-Forwarded-For", limitedIp).send({ userId });
        assert.equal(response.status, 200);
      }
      const callCount = mock.calls.length;
      const limited = await request(app).delete("/api/user/delete-account")
        .set("X-Forwarded-For", limitedIp).send({ userId });
      assert.equal(limited.status, 429);
      assert.equal(limited.body.error, "rate_limit");
      assert(Number(limited.headers["retry-after"]) > 0);
      assert.equal(mock.calls.length, callCount, "429 never starts deletion");
    } finally {
      mock.restore();
    }
  } finally {
    delete _testOverrides.authenticatedUser;
    if (billingEnabled === undefined) delete process.env.REVENUECAT_BILLING_ENABLED;
    else process.env.REVENUECAT_BILLING_ENABLED = billingEnabled;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });