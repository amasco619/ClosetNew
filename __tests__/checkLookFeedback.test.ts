import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { judgeBucket, judgeRolloutEnabled } from "../server/checkLookRollout";
import { _testOverrides, feedbackSchema, checkLookFeedbackRoute, recordVerdict } from "../server/checkLookFeedback";
import { anonymousGroup, deduplicateReceipts, reviewCsv, type ReviewReceipt } from "../scripts/export-judge-beta";
import { ACCOUNT_DELETION_TABLES } from "../server/accountDeletionInventory";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
for (let i = 0; i < 1000; i++) {
  const id = `synthetic-${i}`;
  const bucket = judgeBucket(id);
  assert.equal(judgeBucket(id), bucket);
  assert.ok(bucket >= 0 && bucket < 100);
  assert.equal(judgeRolloutEnabled(id, false, "0"), false);
  assert.equal(judgeRolloutEnabled(id, false, "100"), true);
  assert.equal(judgeRolloutEnabled(id, true, "0"), true);
  let included = false;
  for (let percent = 0; percent <= 100; percent++) {
    const current = judgeRolloutEnabled(id, false, String(percent));
    if (included) assert.ok(current, "percentage growth must never remove an account");
    included = current;
  }
}
for (const invalid of [undefined, "-1", "101", "1.5", "bad", ""]) {
  assert.equal(judgeRolloutEnabled(owner, false, invalid), false);
}

async function main() {
  const rows: any[] = [];
  let hits = 0;
  let rejectInsert = false;
  let pendingInsert = false;
  _testOverrides.client = {
    from(table: string) {
      assert.equal(table, "check_look_feedback");
      let insert: any;
      let update: any;
      const filters: Record<string, string> = {};
      const chain: any = {
        insert(value: any) { insert = value; return chain; },
        update(value: any) { update = value; return chain; },
        eq(field: string, value: string) { filters[field] = value; return chain; },
        neq(field: string, value: string) {
          assert.equal(field, "final_verdict"); assert.equal(value, "Ask"); return chain;
        },
        select(value: string) { assert.equal(value, "id"); return chain; },
        abortSignal() {
          if (insert) {
            if (pendingInsert) return new Promise(() => {});
            if (rejectInsert) return Promise.resolve({ error: { code: "failure" } });
            rows.push({ ...insert, id: "stored" }); return Promise.resolve({ error: null });
          }
          const row = rows.find(value => value.user_id === filters.user_id &&
            value.request_id === filters.request_id && value.final_verdict !== "Ask");
          if (row) Object.assign(row, update);
          return Promise.resolve({ error: null, data: row ? [{ id: row.id }] : [] });
        },
      };
      return chain;
    },
    rpc(name: string, args: { p_key: string; p_window_ms: number }) {
      assert.equal(name, "ratelimit_increment");
      assert.equal(args.p_key, `check-look-feedback:${owner}`, "not the daily verdict quota");
      assert.equal(args.p_window_ms, 60_000);
      return { abortSignal: async () => ({ data: [{ hits: ++hits }], error: null }) };
    },
  } as any;
  const receipt = {
    user_id: owner, model_verdict: "Works", final_verdict: "Almost", floor_rules: ["N4"],
    payload_text: "Synthetic allowlisted facts", model_served: "gemini-3.6-flash", prompt_hash: "a".repeat(64),
  };
  const id = await recordVerdict(receipt);
  assert.ok(id); assert.equal(rows[0].thumbs, undefined);
  assert.equal(rows[0].app_version, JSON.parse(readFileSync("app.json", "utf8")).expo.version);
  assert.deepEqual(rows[0].floor_rules, ["N4"]);
  rejectInsert = true;
  assert.equal(await recordVerdict(receipt), undefined);
  rejectInsert = false;
  _testOverrides.appVersion = null;
  assert.equal(await recordVerdict(receipt), undefined, "missing version disables feedback, not the verdict");
  delete _testOverrides.appVersion;
  pendingInsert = true; _testOverrides.timeoutMs = 5;
  assert.equal(await recordVerdict(receipt), undefined, "a hung receipt is bounded");
  pendingInsert = false;
  const app = express(); app.use(express.json());
  let authenticated = true;
  app.use((req, _res, next) => {
    if (authenticated) (req as any).authenticatedUser = { id: owner };
    next();
  });
  app.post("/feedback", checkLookFeedbackRoute);
  const send = (body: object) => request(app).post("/feedback").send(body);
  assert.equal((await send({ request_id: id, thumbs: "up" })).status, 200);
  assert.equal(rows[0].thumbs, "up");
  assert.equal((await send({ request_id: id, thumbs: "down", reason_chip: "too_strict" })).status, 200);
  assert.equal(rows.length, 1, "second tap updates the same receipt");
  assert.equal(rows[0].reason_chip, "too_strict");
  assert.equal((await send({ request_id: id, thumbs: "up" })).status, 200);
  assert.equal(rows[0].reason_chip, null);
  for (const reason of ["too_strict", "too_lenient", "wrong_piece_read", "culture_or_occasion_wrong", "unclear_reason", "other"]) {
    assert.ok(feedbackSchema.safeParse({ request_id: id, thumbs: "down", reason_chip: reason }).success);
  }
  for (const body of [
    { request_id: id, thumbs: "sideways" }, { request_id: "bad", thumbs: "up" },
    { request_id: id, thumbs: "up", reason_chip: "other" },
    { request_id: id, thumbs: "down", reason_chip: "free text" },
    { request_id: id, thumbs: "up", payload_text: "forged" },
  ]) assert.equal((await send(body)).status, 400);
  rows[0].user_id = other;
  assert.equal((await send({ request_id: id, thumbs: "down" })).status, 404);
  rows[0].user_id = owner; rows[0].final_verdict = "Ask";
  assert.equal((await send({ request_id: id, thumbs: "up" })).status, 404);
  authenticated = false;
  assert.equal((await send({ request_id: id, thumbs: "up" })).status, 401);
  authenticated = true; hits = 30;
  assert.equal((await send({ request_id: id, thumbs: "up" })).status, 429);
  assert.ok(ACCOUNT_DELETION_TABLES.some(row => row.table === "check_look_feedback" && row.ownerColumn === "user_id"));

  const row: ReviewReceipt = {
    id: "1", user_id: owner, created_at: "2026-11-16T00:00:00.000Z", payload_text: "Synthetic",
    model_verdict: "Works", final_verdict: "Works", floor_rules: [], thumbs: null,
    reason_chip: null, model_served: "gemini-test", prompt_hash: "a".repeat(64),
  };
  const repeats = [
    row, { ...row, id: "2", thumbs: "down", created_at: "2026-11-16T00:00:59.999Z" },
    { ...row, id: "3", created_at: "2026-11-16T00:01:00.000Z" },
    { ...row, id: "4", user_id: other }, { ...row, id: "5", final_verdict: "Almost" },
  ];
  const deduped = deduplicateReceipts(repeats);
  assert.equal(deduped.length, 4, "same payload and verdict deduplicated within 60s only");
  assert.equal(deduped.filter(value => value.thumbs === "down").length, 1);
  const duplicateDowns = [repeats[1], { ...repeats[1], id: "down-repeat", created_at: "2026-11-16T00:01:10.000Z" }];
  assert.equal(deduplicateReceipts(duplicateDowns).length, 1, "thumbs-down export deduplicates repeated down receipts too");
  assert.equal(deduplicateReceipts(repeats.filter(value => value.thumbs === "down")).length, 1);
  assert.equal(deduped.filter(value => value.final_verdict === "Works").length, 3, "includes untouched Works");
  assert.equal(anonymousGroup(owner, "test-key"), anonymousGroup(owner, "test-key"));
  assert.notEqual(anonymousGroup(owner, "test-key"), anonymousGroup(other, "test-key"));
  const csv = reviewCsv(deduped, "test-key");
  assert.ok(!csv.includes(owner)); assert.ok(!csv.includes("user_id"));
  assert.ok(csv.includes("Synthetic"));
  console.log("PASS R22 rollout, receipt failures, feedback validation/ownership/quota isolation, deletion inventory and deduplicated exports");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
