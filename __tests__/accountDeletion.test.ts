import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import express from "express";
import request from "supertest";
import { registerRoutes, _testOverrides } from "../server/routes";
import { supabaseAdmin, supabaseAnon } from "../server/supabase";

const tables = [
  "affinity_signals", "pair_affinity_signals", "rotation_cursors",
  "wear_logs", "slot_statuses", "tryon_profiles", "saved_looks",
  "garment_group_members", "garment_groups", "wardrobe_items", "user_profiles",
];
const buckets = ["wardrobe-images", "tryon-photos"];
const stages = [
  ...buckets.flatMap(bucket => [
    `storage_list_${bucket}`, `storage_remove_${bucket}`, `storage_verify_${bucket}`,
  ]),
  ...tables.map(table => `table_${table}`),
  "auth_delete",
];
const userId = "deletion-test-user";

function mockDeletion(failure?: string, wardrobeCount = 1, silentRemoval = false) {
  const files = new Map(buckets.map(bucket => [
    bucket,
    Array.from({ length: bucket === "wardrobe-images" ? wardrobeCount : 1 }, (_, i) => `file-${i}.jpg`),
  ] as const));
  const calls: string[] = [];
  let failAt = failure;
  const error = { message: "provider-private-error-do-not-log" };
  const originals = {
    storageFrom: supabaseAdmin.storage.from,
    from: supabaseAdmin.from,
    deleteUser: supabaseAdmin.auth.admin.deleteUser,
    verifyOtp: supabaseAnon.auth.verifyOtp,
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
        assert.equal(column, table === "user_profiles" ? "id" : "user_id");
        assert.equal(id, userId);
        const stage = `table_${table}`;
        calls.push(stage);
        return { error: failed(stage) ? error : null };
      },
    }),
  }));
  Reflect.set(supabaseAdmin.auth.admin, "deleteUser", async (id: string) => {
    assert.equal(id, userId);
    calls.push("auth_delete");
    return { error: failed("auth_delete") ? error : null };
  });
  Reflect.set(supabaseAnon.auth, "verifyOtp", async () => ({
    data: { user: { id: userId } }, error: null,
  }));
  return {
    calls,
    files,
    restore() {
      Reflect.set(supabaseAdmin.storage, "from", originals.storageFrom);
      Reflect.set(supabaseAdmin, "from", originals.from);
      Reflect.set(supabaseAdmin.auth.admin, "deleteUser", originals.deleteUser);
      Reflect.set(supabaseAnon.auth, "verifyOtp", originals.verifyOtp);
    },
  };
}

async function main() {
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
        assert.equal(mock.calls.filter(stage => stage === "auth_delete").length, 1);
        console.log(`  ✓ ${route} deletes every page before confirming success`);
      } finally {
        mock.restore();
      }
    }
  } finally {
    delete _testOverrides.authenticatedUser;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });