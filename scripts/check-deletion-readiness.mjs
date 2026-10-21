import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MANUAL_SQL = `-- Run in the Supabase SQL Editor. API probes cannot verify table ACLs or RLS metadata.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*)::integer
     FROM pg_catalog.pg_policies p
    WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policy_count,
  has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_truncate,
  has_table_privilege('anon', c.oid, 'REFERENCES') AS anon_references,
  has_table_privilege('anon', c.oid, 'TRIGGER') AS anon_trigger,
  has_table_privilege('anon', c.oid, 'MAINTAIN') AS anon_maintain,
  has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS authenticated_truncate,
  has_table_privilege('authenticated', c.oid, 'REFERENCES') AS authenticated_references,
  has_table_privilege('authenticated', c.oid, 'TRIGGER') AS authenticated_trigger,
  has_table_privilege('authenticated', c.oid, 'MAINTAIN') AS authenticated_maintain
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;`;

const SERVER_ONLY_TABLES = [
  "billing_accounts",
  "billing_event_journal",
  "billing_subscriptions",
  "billing_transactions",
  "billing_reconciliations",
  "billing_deletion_tombstones",
  "bg_removal_usage",
  "bg_removal_cache",
  "ratelimit_store",
  "lockout_store",
];

const outcomes = [];
function pass(label) {
  outcomes.push({ ok: true, label });
  console.log(`[PASS] ${label}`);
}
function fail(label, detail) {
  outcomes.push({ ok: false, label });
  console.error(`[FAIL] ${label}${detail ? ` (${detail})` : ""}`);
}
function errorCode(error) {
  const code = typeof error?.code === "string" ? error.code : "no-code";
  const status = Number.isInteger(error?.status) ? error.status : "no-status";
  return `${code}, HTTP ${status}`;
}

function readDeletionInventory() {
  const source = readFileSync(new URL("../server/accountDeletionInventory.ts", import.meta.url), "utf8");
  const block = source.match(
    /export const ACCOUNT_DELETION_TABLES\s*=\s*\[([\s\S]*?)\]\s*as const;/,
  );
  if (!block) throw new Error("Could not read ACCOUNT_DELETION_TABLES");
  const entries = [...block[1].matchAll(
    /\{\s*table:\s*"([a-z0-9_]+)"\s*,\s*ownerColumn:\s*"([a-z0-9_]+)"\s*\}/g,
  )].map(([, table, ownerColumn]) => ({ table, ownerColumn }));
  const declaredEntries = (block[1].match(/\btable\s*:/g) ?? []).length;
  if (!entries.length || entries.length !== declaredEntries) {
    throw new Error("Deletion inventory has an unsupported shape; refusing a partial readiness check");
  }
  return entries;
}

async function main() {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    for (const key of missing) fail(`Required environment variable ${key} is unavailable`);
    return;
  }

  const authOptions = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  };
  const service = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    authOptions,
  );
  const publishable = createClient(
    process.env.SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    authOptions,
  );

  let inventory;
  try {
    inventory = readDeletionInventory();
    pass(`Read ${inventory.length} owner-scoped tables from ACCOUNT_DELETION_TABLES`);
  } catch (error) {
    fail("Read account-deletion inventory", error instanceof Error ? error.message : "unknown error");
    return;
  }

  for (const { table, ownerColumn } of inventory) {
    const selectProbe = await service.from(table).select("*").limit(0);
    if (selectProbe.error) fail(`${table}: service-role SELECT limit 0`, errorCode(selectProbe.error));
    else pass(`${table}: service-role SELECT limit 0`);

    const probeId = randomUUID();
    const deletion = await service.from(table)
      .delete({ count: "exact" })
      .eq(ownerColumn, probeId);
    if (deletion.error) {
      fail(`${table}: service-role DELETE by unused UUID`, errorCode(deletion.error));
    } else if (deletion.count !== 0) {
      fail(`${table}: probe DELETE affected ${deletion.count ?? "an unknown number of"} rows`);
    } else {
      pass(`${table}: service-role DELETE by unused UUID affected 0 rows`);
    }
  }

  for (const [name, args] of [
    ["ratelimit_decrement", { p_key: `deletion-readiness:${randomUUID()}` }],
    ["ratelimit_delete_key", { p_key: `deletion-readiness:${randomUUID()}` }],
  ]) {
    const { error } = await service.rpc(name, args);
    if (error) fail(`${name}: service-role safe no-op RPC`, errorCode(error));
    else pass(`${name}: service-role safe no-op RPC`);
  }

  for (const table of SERVER_ONLY_TABLES) {
    const serverProbe = await service.from(table).select("*").limit(0);
    if (serverProbe.error) {
      fail(`${table}: service-role table existence probe`, errorCode(serverProbe.error));
      continue;
    }
    const anonProbe = await publishable.from(table).select("*").limit(0);
    const denied = anonProbe.error &&
      (anonProbe.error.code === "42501" ||
        ([401, 403].includes(anonProbe.error.status) &&
          /permission|privilege|denied/i.test(anonProbe.error.message ?? "")));
    if (denied) pass(`${table}: publishable-key SELECT is denied`);
    else if (!anonProbe.error) fail(`${table}: publishable-key SELECT unexpectedly succeeded`);
    else fail(`${table}: publishable-key SELECT returned an inconclusive error`, errorCode(anonProbe.error));
  }
}

try {
  await main();
} catch {
  fail("Readiness script encountered an unexpected error; details withheld");
} finally {
  const passed = outcomes.filter((entry) => entry.ok).length;
  const failed = outcomes.length - passed;
  console.log(`\nReadiness probes: ${passed} passed, ${failed} failed`);
  console.log("\nManual SQL query (run in the Supabase SQL Editor):\n");
  console.log(MANUAL_SQL);
  if (failed > 0) process.exitCode = 1;
}
