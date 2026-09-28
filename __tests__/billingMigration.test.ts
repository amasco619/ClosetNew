import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";

// This test creates and destroys an isolated local PostgreSQL cluster. It
// never reads application credentials or connects to Supabase/production.
const dir = mkdtempSync(join(tmpdir(), "amodka-billing-"));
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

async function addEvent(
  db: Client,
  eventId: string,
  userId: string,
  type: string,
  transactionId: string,
  originalTransactionId: string,
  occurredAt = new Date().toISOString(),
  active = !["EXPIRATION", "REFUND", "REVOKE"].includes(type),
): Promise<void> {
  const hash = createHash("sha256").update(eventId).digest("hex");
  await db.query(
    `SELECT public.billing_journal_revenuecat_event(
      $1, $2::uuid, $3, 'APPLE', 'configured.ios.monthly',
      'amodka_premium', $4, $5, now(), now() + interval '1 day',
      $6::timestamptz, $7, $8
    )`,
    [eventId, userId, type, transactionId, originalTransactionId, occurredAt, active, hash],
  );
}

async function reconcileSnapshot(
  db: Client,
  userId: string,
  eventId: string,
  isActive: boolean,
  fetchStartedAt: string,
  providerIdentity: { productId: string; store: string; expiresAt: string } | null = isActive
    ? {
        productId: "configured.ios.monthly",
        store: "APPLE",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }
    : null,
): Promise<any> {
  const hash = createHash("sha256")
    .update(JSON.stringify({ eventId, isActive, fetchStartedAt, providerIdentity }))
    .digest("hex");
  const result = await db.query(
    `SELECT public.billing_reconcile_revenuecat_snapshot(
      $1::uuid, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz
    ) AS result`,
    [
      userId, eventId, hash, isActive,
      providerIdentity?.productId ?? null,
      providerIdentity?.store ?? null,
      providerIdentity?.expiresAt ?? null,
      fetchStartedAt,
    ],
  );
  return result.rows[0].result;
}

async function main(): Promise<void> {
  const port = await freePort();
  execFileSync("initdb", ["-D", dir, "--auth=trust", "--no-sync"], { stdio: "pipe" });
  execFileSync("pg_ctl", [
    "-D", dir, "-o", `-k ${dir} -p ${port} -c listen_addresses=''`,
    "-l", join(dir, "postgres.log"), "-w", "start",
  ], { stdio: "pipe" });
  started = true;

  const admin = new Client({ host: dir, port, user: username, database: "postgres" });
  await admin.connect();
  try {
    await admin.query(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE TABLE public.user_profiles (
        id uuid PRIMARY KEY, premium boolean DEFAULT false,
        premium_expires_at timestamptz
      );
    `);
    await admin.query(readFileSync(
      "supabase/migrations/20260930000000_revenuecat_billing.sql", "utf8",
    ));

    const alice = "8b67c9f2-82fb-4a76-99f0-813ef2a0a004";
    const bob = "9c18f8a5-2bed-46be-a05d-e041b47dbbc4";
    const carol = "e9e92d64-79bf-47eb-b3e0-87322a7a20fc";
    const dave = "55b1e4c6-9d9f-44ec-9492-d6705e9a4011";
    const erin = "ea38ce48-bba4-4d7e-89b5-8c8f45120d04";
    const frank = "6177c2e5-8060-4a79-83b6-e74bdd1982d8";
    const gina = "d6b6e7a9-75ab-40c9-9cbe-11aa6d30a7ab";
    await admin.query(
      "INSERT INTO public.user_profiles (id) VALUES ($1), ($2), ($3), ($4), ($5), ($6), ($7)",
      [alice, bob, carol, dave, erin, frank, gina],
    );

    await addEvent(admin, "event-alice-1", alice, "INITIAL_PURCHASE", "txn-alice-1", "orig-shared");
    const processed = await admin.query(
      "SELECT public.billing_process_revenuecat_event($1) AS result", ["event-alice-1"],
    );
    assert.equal(processed.rows[0].result.status, "processed");
    await admin.query(
      "SELECT public.billing_journal_revenuecat_event($1, $2::uuid, $3, 'APPLE', $4, $5, $6, $7, now(), now() + interval '1 day', now(), true, $8)",
      [
        "event-alice-1", alice, "INITIAL_PURCHASE", "configured.ios.monthly",
        "amodka_premium", "txn-alice-1", "orig-shared",
        createHash("sha256").update("event-alice-1").digest("hex"),
      ],
    );
    const duplicate = await admin.query(
      "SELECT public.billing_process_revenuecat_event($1) AS result", ["event-alice-1"],
    );
    assert.equal(duplicate.rows[0].result.status, "duplicate");
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM public.billing_subscriptions")).rows[0].n, 1);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM public.billing_transactions")).rows[0].n, 1);
    assert.equal((await admin.query("SELECT premium FROM public.user_profiles WHERE id=$1", [alice])).rows[0].premium, true);

    // A signed provider fact with an already-owned transaction cannot transfer
    // either subscription or transaction records to another Amodka identity.
    await admin.query(
      "INSERT INTO public.billing_accounts (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [bob],
    );
    await admin.query(
      `SELECT public.billing_journal_revenuecat_event(
        $1, $2::uuid, 'RENEWAL', 'APPLE', 'configured.ios.monthly',
        'amodka_premium', 'txn-alice-2', 'orig-shared', now(),
        now() + interval '2 days', now() + interval '1 minute', true, $3
      )`,
      ["event-bob-collision", bob, createHash("sha256").update("event-bob-collision").digest("hex")],
    );
    const collision = await admin.query(
      "SELECT public.billing_process_revenuecat_event($1) AS result", ["event-bob-collision"],
    );
    assert.equal(collision.rows[0].result.status, "ignored");
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM public.billing_subscriptions")).rows[0].n, 1);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM public.billing_transactions")).rows[0].n, 1);
    assert.equal((await admin.query("SELECT premium FROM public.user_profiles WHERE id=$1", [bob])).rows[0].premium, false);

    const activeWithoutWebhook = await reconcileSnapshot(
      admin, bob, "api-snapshot-bob-pending", true, new Date(Date.now() - 5_000).toISOString(),
    );
    assert.equal(activeWithoutWebhook.is_premium, false,
      "provider-active snapshot without a real transaction webhook remains Free");
    assert.equal((await admin.query(
      "SELECT count(*)::int AS n FROM public.billing_subscriptions WHERE user_id=$1", [bob],
    )).rows[0].n, 0, "customer snapshots never synthesize subscription rows");

    await addEvent(admin, "event-bob-real-purchase", bob, "INITIAL_PURCHASE",
      "txn-bob-purchase", "orig-bob-real");
    await admin.query(
      "SELECT public.billing_process_revenuecat_event($1)", ["event-bob-real-purchase"],
    );
    const providerActiveAfterWebhook = await reconcileSnapshot(
      admin, bob, "api-snapshot-bob-active", true, new Date(Date.now() - 1_000).toISOString(),
    );
    assert.equal(providerActiveAfterWebhook.is_premium, true,
      "active provider status returns the existing webhook-backed ledger grant");
    await addEvent(admin, "event-bob-refund", bob, "REFUND",
      "txn-bob-purchase", "orig-bob-real");
    const refund = await admin.query(
      "SELECT public.billing_process_revenuecat_event($1) AS result", ["event-bob-refund"],
    );
    assert.equal(refund.rows[0].result.status, "processed");
    assert.equal((await admin.query(
      "SELECT premium FROM public.user_profiles WHERE id=$1", [bob],
    )).rows[0].premium, false, "refund after a customer reconciliation leaves no shadow grant");
    const activeAfterRefund = await reconcileSnapshot(
      admin, bob, "api-snapshot-bob-after-refund", true, new Date(Date.now() + 2_000).toISOString(),
    );
    assert.equal(activeAfterRefund.is_premium, false,
      "provider-active snapshot cannot reactivate a row deactivated by refund");
    await addEvent(admin, "event-bob-second-purchase", bob, "INITIAL_PURCHASE",
      "txn-bob-second", "orig-bob-second");
    await admin.query(
      "SELECT public.billing_process_revenuecat_event($1)", ["event-bob-second-purchase"],
    );
    await addEvent(admin, "event-bob-revoke", bob, "REVOKE",
      "txn-bob-second", "orig-bob-second");
    await admin.query("SELECT public.billing_process_revenuecat_event($1)", ["event-bob-revoke"]);
    assert.equal((await admin.query(
      "SELECT premium FROM public.user_profiles WHERE id=$1", [bob],
    )).rows[0].premium, false, "REVOKE leaves no shadow grant either");

    // An inactive response fetched before a later webhook must not undo that
    // newer store fact when the network request returns afterward.
    const olderFetchStart = new Date(Date.now() - 2_000).toISOString();
    await addEvent(admin, "event-dave-newer", dave, "INITIAL_PURCHASE",
      "txn-dave", "orig-dave");
    await admin.query("SELECT public.billing_process_revenuecat_event($1)", ["event-dave-newer"]);
    const staleInactiveSnapshot = await reconcileSnapshot(
      admin, dave, "api-snapshot-dave-old", false, olderFetchStart,
    );
    assert.equal(staleInactiveSnapshot.is_premium, true,
      "older in-flight inactive snapshot cannot overwrite a newer webhook");
    const daveReconciliation = await admin.query(
      "SELECT source, event_id FROM public.billing_reconciliations WHERE user_id=$1", [dave],
    );
    assert.deepEqual(daveReconciliation.rows[0],
      { source: "webhook", event_id: "event-dave-newer" },
      "older fetched snapshot cannot overwrite newer webhook reconciliation state");
    const daveActiveFetchStart = new Date(Date.now() + 10_000).toISOString();
    const daveActiveSnapshot = await reconcileSnapshot(
      admin, dave, "api-snapshot-dave-newer-active", true, daveActiveFetchStart,
    );
    assert.equal(daveActiveSnapshot.is_premium, true);
    const olderInactiveAfterActive = await reconcileSnapshot(
      admin, dave, "api-snapshot-dave-older-inactive", false,
      new Date(Date.parse(daveActiveFetchStart) - 1_000).toISOString(),
    );
    assert.equal(olderInactiveAfterActive.is_premium, true,
      "newer active snapshot fences an older in-flight inactive snapshot");
    assert.deepEqual((await admin.query(
      "SELECT source, event_id FROM public.billing_reconciliations WHERE user_id=$1", [dave],
    )).rows[0], {
      source: "customer_api",
      event_id: "api-snapshot-dave-newer-active",
    }, "older inactive snapshot cannot replace newer active snapshot state");

    // Once an inactive snapshot establishes a fence, a delayed positive webhook
    // older than that fetch cannot resurrect Premium.
    await addEvent(admin, "event-carol-existing", carol, "INITIAL_PURCHASE",
      "txn-carol-existing", "orig-carol-existing",
      new Date(Date.now() - 5_000).toISOString());
    await admin.query("SELECT public.billing_process_revenuecat_event($1)", ["event-carol-existing"]);
    const carolFetchStart = new Date(Date.now() - 2_000).toISOString();
    const inactiveSnapshot = await reconcileSnapshot(
      admin, carol, "api-snapshot-carol-inactive", false, carolFetchStart,
    );
    assert.equal(inactiveSnapshot.is_premium, false);
    const delayedEventAt = new Date(Date.parse(carolFetchStart) - 1_000).toISOString();
    await addEvent(admin, "event-carol-delayed", carol, "INITIAL_PURCHASE",
      "txn-carol-delayed", "orig-carol-delayed", delayedEventAt);
    const delayed = await admin.query(
      "SELECT public.billing_process_revenuecat_event($1) AS result", ["event-carol-delayed"],
    );
    assert.equal(delayed.rows[0].result.status, "stale");
    assert.equal((await admin.query(
      "SELECT premium FROM public.user_profiles WHERE id=$1", [carol],
    )).rows[0].premium, false, "delayed event behind snapshot fence cannot grant Premium");

    // A no-entitlement snapshot with no ledger row must not establish a global
    // fence that could block a first purchase webhook arriving concurrently.
    const emptyAccountFetchStart = new Date().toISOString();
    const emptyAccountSnapshot = await reconcileSnapshot(
      admin, erin, "api-snapshot-erin-empty", false, emptyAccountFetchStart,
    );
    assert.equal(emptyAccountSnapshot.is_premium, false);
    assert.equal((await admin.query(
      "SELECT last_snapshot_at FROM public.billing_accounts WHERE user_id=$1", [erin],
    )).rows[0].last_snapshot_at, null, "empty snapshot does not establish a webhook fence");
    const justArrivedEventAt = new Date(Date.parse(emptyAccountFetchStart) - 1).toISOString();
    await addEvent(admin, "event-erin-first-purchase", erin, "INITIAL_PURCHASE",
      "txn-erin", "orig-erin", justArrivedEventAt);
    const firstPurchase = await admin.query(
      "SELECT public.billing_process_revenuecat_event($1) AS result",
      ["event-erin-first-purchase"],
    );
    assert.equal(firstPurchase.rows[0].result.status, "processed",
      "first real purchase webhook is accepted after an empty inactive snapshot");
    assert.equal((await admin.query(
      "SELECT premium FROM public.user_profiles WHERE id=$1", [erin],
    )).rows[0].premium, true);
    const erinsLaterInactiveSnapshot = await reconcileSnapshot(
      admin, erin, "api-snapshot-erin-revoke", false, new Date(Date.now() + 1_000).toISOString(),
    );
    assert.equal(erinsLaterInactiveSnapshot.is_premium, false,
      "inactive snapshot can revoke an existing webhook-backed row");
    assert.notEqual((await admin.query(
      "SELECT last_snapshot_at FROM public.billing_accounts WHERE user_id=$1", [erin],
    )).rows[0].last_snapshot_at, null, "revoking an existing row establishes the fence");
    const mismatchedProductSnapshot = await reconcileSnapshot(
      admin, erin, "api-snapshot-erin-other-product", true,
      new Date(Date.now() + 2_000).toISOString(),
      {
        productId: "configured.ios.annual",
        store: "APPLE",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    );
    assert.equal(mismatchedProductSnapshot.is_premium, false,
      "active provider state for a different product cannot reactivate the row");
    const mismatchedStoreSnapshot = await reconcileSnapshot(
      admin, erin, "api-snapshot-erin-other-store", true,
      new Date(Date.now() + 3_000).toISOString(),
      {
        productId: "configured.ios.monthly",
        store: "GOOGLE",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    );
    assert.equal(mismatchedStoreSnapshot.is_premium, false,
      "active provider state for a different store cannot reactivate the row");
    const restoredSnapshot = await reconcileSnapshot(
      admin, erin, "api-snapshot-erin-reactivate", true,
      new Date(Date.now() + 4_000).toISOString(),
    );
    assert.equal(restoredSnapshot.is_premium, true,
      "matching active provider identity reactivates its prior webhook-backed row");
    assert.equal((await admin.query(
      "SELECT count(*)::int AS n FROM public.billing_subscriptions WHERE user_id=$1", [erin],
    )).rows[0].n, 1, "reactivation changes the existing row without synthesizing another");
    assert.equal((await admin.query(
      "SELECT count(*)::int AS n FROM public.billing_transactions WHERE user_id=$1", [erin],
    )).rows[0].n, 1, "reactivation creates no transaction");
    await addEvent(admin, "event-frank-lineage-1", frank, "INITIAL_PURCHASE",
      "txn-frank-1", "orig-frank-1");
    await admin.query("SELECT public.billing_process_revenuecat_event($1)", ["event-frank-lineage-1"]);
    await addEvent(admin, "event-frank-lineage-2", frank, "INITIAL_PURCHASE",
      "txn-frank-2", "orig-frank-2", new Date(Date.now() + 1_000).toISOString());
    await admin.query("SELECT public.billing_process_revenuecat_event($1)", ["event-frank-lineage-2"]);
    await reconcileSnapshot(
      admin, frank, "api-snapshot-frank-inactive", false,
      new Date(Date.now() + 2_000).toISOString(),
    );
    const ambiguousLineages = await reconcileSnapshot(
      admin, frank, "api-snapshot-frank-active", true,
      new Date(Date.now() + 3_000).toISOString(),
    );
    assert.equal(ambiguousLineages.is_premium, false,
      "active provider identity cannot reactivate ambiguous same-product transaction lineages");
    assert.equal((await admin.query(
      "SELECT count(*)::int AS n FROM public.billing_subscriptions WHERE user_id=$1 AND snapshot_deactivated",
      [frank],
    )).rows[0].n, 2, "ambiguous snapshot leaves both rows deactivated pending webhook identity");
    const ginaPurchaseAt = new Date(Date.now() - 5_000).toISOString();
    await addEvent(admin, "event-gina-purchase", gina, "INITIAL_PURCHASE",
      "txn-gina", "orig-gina", ginaPurchaseAt);
    await admin.query("SELECT public.billing_process_revenuecat_event($1)", ["event-gina-purchase"]);
    const ginaActiveFetchStart = new Date().toISOString();
    const ginaActive = await reconcileSnapshot(
      admin, gina, "api-snapshot-gina-active", true, ginaActiveFetchStart,
    );
    assert.equal(ginaActive.is_premium, true);
    const ginaRefundAt = new Date(Date.parse(ginaActiveFetchStart) - 1_000).toISOString();
    await addEvent(admin, "event-gina-delayed-refund", gina, "REFUND",
      "txn-gina", "orig-gina", ginaRefundAt);
    const ginaRefund = await admin.query(
      "SELECT public.billing_process_revenuecat_event($1) AS result", ["event-gina-delayed-refund"],
    );
    assert.equal(ginaRefund.rows[0].result.status, "processed",
      "verified terminal webhook crosses the snapshot fence for its known transaction lineage");
    assert.equal((await admin.query(
      "SELECT premium FROM public.user_profiles WHERE id=$1", [gina],
    )).rows[0].premium, false,
    "delayed refund overrides an active customer snapshot and revokes Premium");
    const ginaStalePositiveAt = new Date(Date.parse(ginaActiveFetchStart) - 500).toISOString();
    await addEvent(admin, "event-gina-stale-positive", gina, "RENEWAL",
      "txn-gina", "orig-gina", ginaStalePositiveAt);
    const ginaStalePositive = await admin.query(
      "SELECT public.billing_process_revenuecat_event($1) AS result", ["event-gina-stale-positive"],
    );
    assert.equal(ginaStalePositive.rows[0].result.status, "stale",
      "positive webhook at or before active snapshot fence cannot regrant");
    assert.equal((await admin.query(
      "SELECT premium FROM public.user_profiles WHERE id=$1", [gina],
    )).rows[0].premium, false);

    const transferHash = createHash("sha256").update("transfer").digest("hex");
    const transfer = await admin.query(
      `SELECT public.billing_journal_ignored_revenuecat_event($1, 'TRANSFER', $2) AS result`,
      ["event-transfer", transferHash],
    );
    assert.equal(transfer.rows[0].result.status, "ignored");
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM public.billing_subscriptions")).rows[0].n, 9);

    // Entitlement writer, provider events and account tombstones serialize on a
    // per-user transaction lock. Hold deletion open and prove a late event waits.
    const deleting = new Client({ host: dir, port, user: username, database: "postgres" });
    const provider = new Client({ host: dir, port, user: username, database: "postgres" });
    await deleting.connect();
    await provider.connect();
    try {
      await addEvent(provider, "event-carol-late", carol, "INITIAL_PURCHASE", "txn-carol", "orig-carol");
      await deleting.query("BEGIN");
      await deleting.query("SELECT public.billing_tombstone_account($1::uuid)", [carol]);
      let eventFinished = false;
      const processing = provider.query(
        "SELECT public.billing_process_revenuecat_event($1) AS result", ["event-carol-late"],
      ).then(result => {
        eventFinished = true;
        return result;
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(eventFinished, false, "provider processing waits for in-flight deletion lock");
      await deleting.query("COMMIT");
      const late = await processing;
      assert.equal(late.rows[0].result.status, "ignored");
      const entitlement = await admin.query(
        "SELECT public.billing_reconcile_entitlement($1::uuid) AS result", [carol],
      );
      assert.equal(entitlement.rows[0].result.is_premium, false);
      assert.equal((await admin.query(
        "SELECT premium FROM public.user_profiles WHERE id=$1", [carol],
      )).rows[0].premium, false);
      // Models a later cleanup stage failing after the separately committed
      // tombstone: a deletion retry is idempotent and never reopens billing.
      await admin.query("SELECT public.billing_tombstone_account($1::uuid)", [carol]);
      await addEvent(provider, "event-carol-after-retry", carol, "INITIAL_PURCHASE",
        "txn-carol-after-retry", "orig-carol-after-retry");
      const afterRetry = await provider.query(
        "SELECT public.billing_process_revenuecat_event($1) AS result", ["event-carol-after-retry"],
      );
      assert.equal(afterRetry.rows[0].result.status, "ignored");
      assert.equal((await admin.query(
        "SELECT count(*)::int AS n FROM public.billing_deletion_tombstones WHERE user_id=$1", [carol],
      )).rows[0].n, 1, "retry leaves deletion tombstone permanently in force");
      assert.equal((await admin.query(
        "SELECT premium FROM public.user_profiles WHERE id=$1", [carol],
      )).rows[0].premium, false);
    } finally {
      await deleting.end();
      await provider.end();
    }

    assert.equal((await admin.query(
      "SELECT has_table_privilege('authenticated','public.billing_subscriptions','SELECT') AS allowed",
    )).rows[0].allowed, false, "billing records are not directly readable by authenticated clients");
    assert.equal((await admin.query(
      "SELECT has_function_privilege('authenticated','public.billing_tombstone_account(uuid)','EXECUTE') AS allowed",
    )).rows[0].allowed, false, "clients cannot call the protected billing writer");
    assert.equal((await admin.query(
      "SELECT has_function_privilege('authenticated','public.billing_readiness_check()','EXECUTE') AS allowed",
    )).rows[0].allowed, false, "readiness RPC is service-role only");
    assert.equal((await admin.query(
      "SELECT public.billing_readiness_check() AS result",
    )).rows[0].result.ready, true, "service readiness RPC confirms the applied billing schema");
    console.log("RevenueCat migration behavior passed against isolated local PostgreSQL only.");
  } finally {
    await admin.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (started) execFileSync("pg_ctl", ["-D", dir, "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(dir, { recursive: true, force: true });
});