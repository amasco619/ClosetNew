import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY ||= "test-only-service-role-key";
process.env.REVENUECAT_IOS_MONTHLY_PRODUCT_ID ||= "amodka.ios.monthly.test";
process.env.REVENUECAT_IOS_ANNUAL_PRODUCT_ID ||= "amodka.ios.annual.test";
process.env.REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID ||= "amodka.android.monthly.test";
process.env.REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID ||= "amodka.android.annual.test";
process.env.REVENUECAT_WEBHOOK_SECRET ||= "test-only-webhook-secret";
process.env.REVENUECAT_SECRET_API_KEY ||= "test-only-revenuecat-api-key";
Reflect.set(process.env, "REVENUECAT_BILLING_ENABLED", "true");
Reflect.set(process.env, "NODE_ENV", "test");

const nowSeconds = 1_800_000_000;
const nowMs = nowSeconds * 1000;
const userId = "8b67c9f2-82fb-4a76-99f0-813ef2a0a004";

function signed(raw: Buffer, timestamp = nowSeconds, secret = "test-only-webhook-secret"): string {
  const digest = createHmac("sha256", secret)
    .update(String(timestamp))
    .update(".")
    .update(raw)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    event: {
      id: "evt-billing-unique-01",
      app_user_id: userId,
      original_app_user_id: userId,
      type: "INITIAL_PURCHASE",
      store: "APP_STORE",
      product_id: "amodka.ios.monthly.test",
      entitlement_ids: ["amodka_premium"],
      transaction_id: "transaction-1",
      original_transaction_id: "original-transaction-1",
      purchased_at_ms: nowMs - 1_000,
      expiration_at_ms: nowMs + 60_000,
      event_timestamp_ms: nowMs,
      ...overrides,
    },
  };
}

async function main(): Promise<void> {
  const {
    _billingTestOverrides,
    hasRevenueCatProductConfiguration,
    isEntitlementActive,
    reconcileRevenueCatCustomer,
    normalizeRevenueCatEvent,
    processRevenueCatEvent,
    verifyRevenueCatSignature,
  } = await import("../server/billing");
  const raw = Buffer.from(JSON.stringify(payload()), "utf8");
  _billingTestOverrides.secret = "test-only-webhook-secret";
  _billingTestOverrides.nowSeconds = nowSeconds;

  assert.equal(hasRevenueCatProductConfiguration(), true);
  assert.equal(verifyRevenueCatSignature(raw, signed(raw)), true, "valid raw-body HMAC verifies");
  assert.equal(
    verifyRevenueCatSignature(Buffer.from(`${raw.toString()} `), signed(raw)),
    false,
    "signature is bound to the exact raw request bytes",
  );
  assert.equal(verifyRevenueCatSignature(raw, undefined), false, "missing signature fails closed");
  assert.equal(
    verifyRevenueCatSignature(raw, signed(raw, nowSeconds - 301)),
    false,
    "signature timestamp outside five-minute tolerance fails",
  );
  assert.equal(verifyRevenueCatSignature(raw, "t=not-a-time,v1=00"), false);
  assert.equal(verifyRevenueCatSignature(raw, signed(raw, nowSeconds, "wrong-secret")), false);

  const event = normalizeRevenueCatEvent(payload(), nowMs);
  assert.ok(event);
  assert.equal(event.userId, userId, "RevenueCat event maps to the authenticated Amodka UUID");
  assert.equal(event.active, true);
  assert.equal(normalizeRevenueCatEvent(payload({
    original_app_user_id: "different-amodka-account",
  }), nowMs), null, "identity aliases cannot silently transfer an account's billing");
  assert.equal(normalizeRevenueCatEvent(payload({
    product_id: "unconfigured-store-product",
  }), nowMs), null, "unknown products never grant entitlement");
  assert.equal(normalizeRevenueCatEvent(payload({
    event_timestamp_ms: "not-a-millisecond-timestamp",
  }), nowMs), null, "malformed provider event timestamps are rejected");
  assert.equal(normalizeRevenueCatEvent(payload({
    expiration_at_ms: "not-a-millisecond-timestamp",
  }), nowMs), null, "malformed provider expiration timestamps are rejected");
  assert.equal(normalizeRevenueCatEvent(payload({
    store: "PLAY_STORE",
    product_id: "amodka.ios.monthly.test",
  }), nowMs), null, "an iOS product cannot grant from the Google store");
  assert.equal(normalizeRevenueCatEvent(payload({
    store: "PLAY_STORE",
    product_id: "amodka.android.monthly.test",
  }), nowMs)?.store, "GOOGLE", "configured Android monthly product is accepted");
  assert.equal(normalizeRevenueCatEvent(payload({
    type: "CANCELLATION",
  }), nowMs)?.active, true, "cancellation retains access until the effective expiration");
  assert.equal(normalizeRevenueCatEvent(payload({
    type: "EXPIRATION",
    expiration_at_ms: nowMs - 1,
  }), nowMs)?.active, false, "expiration removes access");
  assert.equal(normalizeRevenueCatEvent(payload({
    type: "UNCANCELLATION",
  }), nowMs)?.active, true, "reactivation restores access from provider state");

  const future = new Date(nowMs + 60_000).toISOString();
  const past = new Date(nowMs - 60_000).toISOString();
  const subscription = (store: string, active: boolean, expiresAt: string | null = future) => ({
    store, entitlementId: "amodka_premium", active, expiresAt,
  });
  assert.equal(isEntitlementActive([subscription("APPLE", true)], nowMs).isPremium, true,
    "an active Apple subscription grants Premium");
  assert.equal(isEntitlementActive([subscription("GOOGLE", true)], nowMs).isPremium, true,
    "an active Google subscription grants Premium");
  assert.equal(isEntitlementActive([], nowMs).isPremium, false, "no subscription means Free");
  assert.equal(isEntitlementActive([subscription("APPLE", true, past)], nowMs).isPremium, false,
    "actual expiry revokes Premium");
  assert.equal(isEntitlementActive([subscription("APPLE", true, null)], nowMs).isPremium, false,
    "unknown expiry fails closed");
  assert.equal(isEntitlementActive([subscription("APPLE", false)], nowMs).isPremium, false,
    "cancelled/terminal subscription without active provider state does not grant");
  assert.equal(isEntitlementActive([
    subscription("APPLE", false), subscription("GOOGLE", true),
  ], nowMs).isPremium, true, "one inactive store does not revoke the other active store");

  const journal = new Map<string, { status: string; hash: string }>();
  const ignoredJournal = new Map<string, string>();
  let writes = 0;
  let failOnce = true;
  let accountTombstoned = false;
  let readinessRpcUnavailable = false;
  let billingEntitlementRpcAvailable = false;
  const snapshotRpcCalls: Array<Record<string, unknown>> = [];
  _billingTestOverrides.rpc = async (name, args) => {
    if (name === "billing_journal_revenuecat_event") {
      const id = String(args.p_event_id);
      const found = journal.get(id);
      if (found && found.hash !== args.p_payload_hash) return { data: null, error: new Error("collision") };
      if (!found) journal.set(id, { status: "pending", hash: String(args.p_payload_hash) });
      return { data: { status: found?.status ?? "pending" }, error: null };
    }
    if (name === "billing_process_revenuecat_event") {
      const id = String(args.p_event_id);
      if (failOnce) {
        failOnce = false;
        return { data: null, error: new Error("temporary") };
      }
      const row = journal.get(id);
      assert.ok(row, "event journal survives a failed processing attempt");
      if (row.status === "processed") return { data: { status: "duplicate" }, error: null };
      row.status = "processed";
      writes++;
      return { data: { status: "processed" }, error: null };
    }
    if (name === "billing_journal_ignored_revenuecat_event") {
      ignoredJournal.set(String(args.p_event_id), String(args.p_event_type));
      return { data: { status: "ignored" }, error: null };
    }
    if (name === "billing_reconcile_entitlement") {
      return billingEntitlementRpcAvailable
        ? { data: { is_premium: false, expires_at: null }, error: null }
        : { data: null, error: new Error("billing schema not applied") };
    }
    if (name === "billing_reconcile_revenuecat_snapshot") {
      snapshotRpcCalls.push(args);
      return { data: { is_premium: false, expires_at: null }, error: null };
    }
    if (name === "billing_readiness_check") {
      return readinessRpcUnavailable
        ? { data: null, error: new Error("billing migration missing") }
        : { data: { ready: true }, error: null };
    }
    if (name === "billing_tombstone_account") {
      accountTombstoned = true;
      return { data: null, error: null };
    }
    throw new Error(`unexpected RPC: ${name}`);
  };

  await assert.rejects(processRevenueCatEvent(event!), /billing_processing_failed/);
  assert.equal(journal.get(event!.eventId)?.status, "pending",
    "failed processing leaves a durable retryable journal entry");
  assert.equal(await processRevenueCatEvent(event!), "processed");
  assert.equal(await processRevenueCatEvent(event!), "duplicate");
  assert.equal(writes, 1, "replayed event does not apply business state twice");

  const express = (await import("express")).default;
  const request = (await import("supertest")).default;
  const { registerRoutes, _testOverrides: routeOverrides } = await import("../server/routes");
  const app = express();
  app.set("trust proxy", () => true);
  const testIp = `198.51.100.${(Date.now() % 250) + 1}`;
  app.use(
    "/api/billing/revenuecat/webhook",
    express.raw({ type: "application/json" }),
    (req: any, _res: any, next: () => void) => {
      req.rawBody = req.body;
      next();
    },
  );
  app.use(express.json());
  await registerRoutes(app);
  const unauthenticatedReconcile = await request(app)
    .post("/api/user/entitlements/reconcile")
    .set("X-Forwarded-For", testIp)
    .send({ userId: "some-other-user" });
  assert.equal(unauthenticatedReconcile.status, 401,
    "purchase/restore reconciliation requires an authenticated Amodka identity");
  const readinessIp = `198.51.100.${((Date.now() + 41) % 250) + 1}`;
  const unauthenticatedReadiness = await request(app)
    .get("/api/user/billing/readiness")
    .set("X-Forwarded-For", readinessIp);
  assert.equal(unauthenticatedReadiness.status, 401,
    "billing readiness requires authentication");
  routeOverrides.authenticatedUser = { id: userId };
  const readiness = await request(app)
    .get("/api/user/billing/readiness")
    .set("X-Forwarded-For", `198.51.100.${((Date.now() + 43) % 250) + 1}`);
  assert.equal(readiness.status, 200);
  assert.deepEqual(readiness.body, { ready: true },
    "authenticated readiness uses billing config and the service-role migration RPC");
  const purchaseFlowIp = `198.51.100.${((Date.now() + 61) % 250) + 1}`;
  const purchaseFlowExpiry = new Date(Date.now() + 86_400_000).toISOString();
  _billingTestOverrides.fetch = async () => ({
    ok: true,
    json: async () => ({
      subscriber: {
        original_app_user_id: userId,
        app_user_id: userId,
        entitlements: {
          amodka_premium: {
            product_identifier: "amodka.ios.monthly.test",
            expires_date: purchaseFlowExpiry,
          },
        },
        subscriptions: {
          "amodka.ios.monthly.test": {
            store: "APP_STORE",
            expires_date: purchaseFlowExpiry,
          },
        },
      },
    }),
  } as Response);
  billingEntitlementRpcAvailable = true;
  const readinessFirst = await request(app)
    .get("/api/user/billing/readiness")
    .set("X-Forwarded-For", purchaseFlowIp);
  assert.equal(readinessFirst.status, 200);
  const readinessAgain = await request(app)
    .get("/api/user/billing/readiness")
    .set("X-Forwarded-For", purchaseFlowIp);
  assert.equal(readinessAgain.status, 200);
  const purchaseReconcile = await request(app)
    .post("/api/user/entitlements/reconcile")
    .set("X-Forwarded-For", purchaseFlowIp)
    .send({});
  assert.equal(purchaseReconcile.status, 200,
    "authenticated purchase reconciliation uses its independent moderate limiter");
  for (let i = 0; i < 3; i++) {
    const entitlementRefresh = await request(app)
      .get("/api/user/entitlements")
      .set("X-Forwarded-For", purchaseFlowIp);
    assert.equal(entitlementRefresh.status, 200,
      `entitlement refresh ${i + 1} is not blocked by account mutation limits`);
  }
  billingEntitlementRpcAvailable = false;
  readinessRpcUnavailable = true;
  const notReady = await request(app)
    .get("/api/user/billing/readiness")
    .set("X-Forwarded-For", `198.51.100.${((Date.now() + 45) % 250) + 1}`);
  assert.equal(notReady.status, 200);
  assert.deepEqual(notReady.body, { ready: false },
    "readiness fails closed if the service-role migration RPC is unavailable");
  readinessRpcUnavailable = false;
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  delete process.env.REVENUECAT_SECRET_API_KEY;
  const missingApiKey = await request(app)
    .get("/api/user/billing/readiness")
    .set("X-Forwarded-For", `198.51.100.${((Date.now() + 49) % 250) + 1}`);
  assert.deepEqual(missingApiKey.body, { ready: false },
    "readiness requires the RevenueCat REST API key");
  process.env.REVENUECAT_SECRET_API_KEY = apiKey;
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  delete process.env.REVENUECAT_WEBHOOK_SECRET;
  const missingWebhookSecret = await request(app)
    .get("/api/user/billing/readiness")
    .set("X-Forwarded-For", `198.51.100.${((Date.now() + 51) % 250) + 1}`);
  assert.deepEqual(missingWebhookSecret.body, { ready: false },
    "readiness requires the webhook verification secret");
  process.env.REVENUECAT_WEBHOOK_SECRET = webhookSecret;
  delete routeOverrides.authenticatedUser;
  const { supabaseAdmin } = await import("../server/supabase");
  const originalStorageFrom = supabaseAdmin.storage.from;
  let cleanupAttempted = false;
  Reflect.set(supabaseAdmin.storage, "from", () => ({
    list: async () => {
      cleanupAttempted = true;
      return { data: null, error: new Error("simulated partial deletion failure") };
    },
  }));
  routeOverrides.authenticatedUser = { id: userId };
  try {
    const partialDeletion = await request(app)
      .delete("/api/user/delete-account")
      .set("X-Forwarded-For", `198.51.100.${((Date.now() + 47) % 250) + 1}`)
      .send({ userId });
    assert.equal(partialDeletion.status, 500);
    assert.equal(accountTombstoned, true,
      "billing tombstone commits before cleanup can fail");
    assert.equal(cleanupAttempted, true);
    assert.equal(accountTombstoned, true,
      "a later-stage deletion failure leaves the billing account quarantined for retry");
  } finally {
    Reflect.set(supabaseAdmin.storage, "from", originalStorageFrom);
    delete routeOverrides.authenticatedUser;
  }
  const rejected = await request(app)
    .post("/api/billing/revenuecat/webhook")
    .set("Content-Type", "application/json")
    .set("X-RevenueCat-Webhook-Signature", "t=1800000000,v1=" + "0".repeat(64))
    .send(raw.toString("utf8"));
  assert.equal(rejected.status, 401, "HTTP webhook rejects invalid raw-body HMAC");
  assert.equal(writes, 1, "invalid HMAC never reaches billing persistence");
  const accepted = await request(app)
    .post("/api/billing/revenuecat/webhook")
    .set("Content-Type", "application/json")
    .set("X-RevenueCat-Webhook-Signature", signed(raw))
    .send(raw.toString("utf8"));
  assert.equal(accepted.status, 200, "HTTP webhook acknowledges a valid signed duplicate");
  assert.equal(writes, 1, "HTTP replay remains idempotent");
  const transfer = {
    event: {
      id: "evt-transfer-01",
      type: "TRANSFER",
      transferred_from: [userId],
      transferred_to: ["9c18f8a5-2bed-46be-a05d-e041b47dbbc4"],
    },
  };
  const transferRaw = Buffer.from(JSON.stringify(transfer));
  const transferResponse = await request(app)
    .post("/api/billing/revenuecat/webhook")
    .set("Content-Type", "application/json")
    .set("X-RevenueCat-Webhook-Signature", signed(transferRaw))
    .send(transferRaw.toString("utf8"));
  assert.equal(transferResponse.status, 200, "signed transfer event is acknowledged safely");
  assert.equal(transferResponse.body.status, "ignored");
  assert.equal(ignoredJournal.get("evt-transfer-01"), "TRANSFER",
    "transfer is journaled as ignored and cannot grant another account");
  assert.equal(writes, 1, "transfer never invokes entitlement processing");

  _billingTestOverrides.fetch = async () => ({
    ok: true,
    json: async () => ({
      subscriber: {
        original_app_user_id: "9c18f8a5-2bed-46be-a05d-e041b47dbbc4",
        entitlements: {},
        subscriptions: {},
      },
    }),
  } as Response);
  await assert.rejects(
    reconcileRevenueCatCustomer(userId),
    /revenuecat_wrong_account/,
    "customer snapshot with a different original app user is rejected",
  );
  const expiry = new Date(Date.now() + 60_000).toISOString();
  _billingTestOverrides.fetch = async () => ({
    ok: true,
    json: async () => ({
      subscriber: {
        original_app_user_id: userId,
        app_user_id: userId,
        entitlements: {
          amodka_premium: {
            product_identifier: "amodka.ios.monthly.test",
            expires_date: expiry,
          },
        },
        subscriptions: {
          "amodka.ios.monthly.test": {
            store: "APP_STORE",
            expires_date: expiry,
          },
        },
      },
    }),
  } as Response);
  const pendingState = await reconcileRevenueCatCustomer(userId);
  assert.equal(pendingState.isPremium, false,
    "provider-active snapshot remains pending until a transaction webhook exists");
  const snapshotRpcArgs = snapshotRpcCalls.at(-1)!;
  assert.equal(snapshotRpcArgs.p_provider_entitlement_active, true);
  assert.equal(snapshotRpcArgs.p_provider_product_id, "amodka.ios.monthly.test");
  assert.equal(snapshotRpcArgs.p_provider_store, "APPLE");
  assert.equal(snapshotRpcArgs.p_provider_expires_at, expiry);
  assert.equal("p_subscriptions" in snapshotRpcArgs, false,
    "snapshot RPC receives no synthetic subscription facts");
  _billingTestOverrides.fetch = async () => ({
    ok: true,
    json: async () => ({
      subscriber: {
        original_app_user_id: userId,
        entitlements: {
          amodka_premium: {
            product_identifier: "amodka.ios.monthly.test",
            expires_date: "2026-02-30T00:00:00Z",
          },
        },
        subscriptions: {
          "amodka.ios.monthly.test": {
            store: "APP_STORE",
            expires_date: "2026-02-30T00:00:00Z",
          },
        },
      },
    }),
  } as Response);
  await assert.rejects(
    reconcileRevenueCatCustomer(userId),
    /revenuecat_snapshot_invalid/,
    "malformed provider dates are rejected explicitly",
  );
  const entitlements = await import("../server/entitlements");
  await assert.rejects(
    entitlements.getUserEntitlement(userId),
    /billing_state_unavailable/,
    "explicitly activated billing fails closed if its migration is unavailable",
  );
  delete process.env.REVENUECAT_BILLING_ENABLED;
  const legacyExpiresAt = new Date(Date.now() + 60_000).toISOString();
  entitlements._testOverrides.client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { premium: true, premium_expires_at: legacyExpiresAt },
            error: null,
          }),
        }),
      }),
    }),
  };
  assert.equal((await entitlements.getUserEntitlement(userId)).isPremium, true,
    "before explicit activation, the existing protected profile projection still serves reads");
  delete entitlements._testOverrides.client;

  const unknown = normalizeRevenueCatEvent(payload({ type: "NEW_PROVIDER_EVENT" }), nowMs);
  assert.ok(unknown);
  assert.equal(unknown.active, false, "unknown event semantics never grant Premium");

  const migration = readFileSync(
    "supabase/migrations/20260930000000_revenuecat_billing.sql", "utf8",
  );
  const routesSource = readFileSync("server/routes.ts", "utf8");
  assert.match(migration, /billing_event_journal/);
  assert.match(migration, /billing_subscriptions/);
  assert.match(migration, /billing_transactions/);
  assert.match(migration, /billing_reconciliations/);
  assert.match(migration, /billing_deletion_tombstones/);
  assert.match(migration, /billing_tombstone_account/);
  assert.match(migration, /billing_deletion_tombstones[\s\S]*?WHERE user_id = event_row\.user_id/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.billing_reconcile_entitlement/);
  assert.match(routesSource,
    /Billing access remains quarantined; a retry completes only deletion and never restores billing/);

  delete _billingTestOverrides.rpc;
  delete _billingTestOverrides.secret;
  delete _billingTestOverrides.nowSeconds;
  delete _billingTestOverrides.fetch;
  delete process.env.REVENUECAT_SECRET_API_KEY;
  console.log("RevenueCat billing security, aggregation, idempotency and tombstone tests passed.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});