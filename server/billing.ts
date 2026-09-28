import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { supabaseAdmin } from "./supabase";

export const REVENUECAT_ENTITLEMENT_ID =
  "amodka_premium";
export const BILLING_REPLAY_TOLERANCE_SECONDS = 5 * 60;

export type BillingStore = "APPLE" | "GOOGLE";

export interface NormalizedRevenueCatEvent {
  eventId: string;
  userId: string;
  type: string;
  store: BillingStore;
  productId: string;
  entitlementId: string;
  transactionId: string | null;
  originalTransactionId: string | null;
  purchasedAt: string | null;
  expiresAt: string | null;
  occurredAt: string;
  active: boolean;
  payloadHash: string;
}

export interface BillingState {
  isPremium: boolean;
  expiresAt: string | null;
}

interface RevenueCatCustomerSnapshot {
  active: boolean;
  productId: string | null;
  store: BillingStore | null;
  expiresAt: string | null;
}

export const _billingTestOverrides: {
  secret?: string;
  nowSeconds?: number;
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  fetch?: typeof fetch;
} = {};

function billingRpc(name: string, args: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && _billingTestOverrides.rpc) {
    return _billingTestOverrides.rpc(name, args);
  }
  return supabaseAdmin.rpc(name, args);
}

export function verifyRevenueCatSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret = process.env.REVENUECAT_WEBHOOK_SECRET ||
    (process.env.NODE_ENV === "test" ? _billingTestOverrides.secret : undefined),
  nowSeconds = (process.env.NODE_ENV === "test" ? _billingTestOverrides.nowSeconds : undefined) ??
    Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  const match = /^t=(\d{1,12}),v1=([a-fA-F0-9]{64})$/.exec(header);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) ||
      Math.abs(nowSeconds - timestamp) > BILLING_REPLAY_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret)
    .update(match[1])
    .update(".")
    .update(rawBody)
    .digest();
  const supplied = Buffer.from(match[2], "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function hasRevenueCatProductConfiguration(): boolean {
  return [
    process.env.REVENUECAT_IOS_MONTHLY_PRODUCT_ID,
    process.env.REVENUECAT_IOS_ANNUAL_PRODUCT_ID,
    process.env.REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID,
    process.env.REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID,
  ].every(productId => Boolean(productId?.trim()));
}

export function isRevenueCatBillingEnabled(): boolean {
  // Explicit activation is sequenced after applying the repository migration.
  // Until then the existing protected profile projection remains authoritative.
  return process.env.REVENUECAT_BILLING_ENABLED === "true";
}

function fromMillis(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const date = new Date(n);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isProviderIsoDate(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= maxDay &&
    Number.isFinite(Date.parse(value));
}

function configuredProducts(store?: BillingStore): Set<string> {
  const productIds = store === "APPLE"
    ? [
        process.env.REVENUECAT_IOS_MONTHLY_PRODUCT_ID,
        process.env.REVENUECAT_IOS_ANNUAL_PRODUCT_ID,
      ]
    : store === "GOOGLE"
      ? [
          process.env.REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID,
          process.env.REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID,
        ]
      : [
          process.env.REVENUECAT_IOS_MONTHLY_PRODUCT_ID,
          process.env.REVENUECAT_IOS_ANNUAL_PRODUCT_ID,
          process.env.REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID,
          process.env.REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID,
        ];
  return new Set([
    ...productIds.filter((id): id is string => Boolean(id && id.trim())),
  ]);
}

function storeName(value: unknown): BillingStore | null {
  if (value === "APP_STORE" || value === "MAC_APP_STORE" || value === "app_store" ||
      value === "mac_app_store") return "APPLE";
  if (value === "PLAY_STORE" || value === "play_store") return "GOOGLE";
  return null;
}

const POSITIVE_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);
const STILL_VALID_EVENT_TYPES = new Set(["CANCELLATION", "BILLING_ISSUE"]);
const TERMINAL_EVENT_TYPES = new Set(["EXPIRATION", "REFUND", "REVOKE"]);
const SUPPORTED_EVENT_TYPES = new Set([
  ...POSITIVE_EVENT_TYPES,
  ...STILL_VALID_EVENT_TYPES,
  ...TERMINAL_EVENT_TYPES,
]);

export function isSupportedRevenueCatEventType(value: unknown): value is string {
  return typeof value === "string" && SUPPORTED_EVENT_TYPES.has(value);
}

export function normalizeRevenueCatEvent(
  payload: unknown,
  nowMs = Date.now(),
): NormalizedRevenueCatEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const event = (payload as { event?: unknown }).event;
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  const eventId = typeof e.id === "string" ? e.id : "";
  const userId = typeof e.app_user_id === "string" ? e.app_user_id : "";
  const originalUserId = typeof e.original_app_user_id === "string"
    ? e.original_app_user_id : "";
  const type = typeof e.type === "string" ? e.type : "";
  const store = storeName(e.store);
  const productId = typeof e.product_id === "string" ? e.product_id : "";
  const entitlementIds = Array.isArray(e.entitlement_ids) ? e.entitlement_ids : [];
  if (!eventId || eventId.length > 200 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
      originalUserId !== userId || !type || !store || !productId ||
      !configuredProducts(store).has(productId)) return null;
  const entitlementId = entitlementIds.includes(REVENUECAT_ENTITLEMENT_ID)
    ? REVENUECAT_ENTITLEMENT_ID : "";
  if (!entitlementId) return null;

  const occurredAt = fromMillis(e.event_timestamp_ms);
  const expiresAt = fromMillis(e.expiration_at_ms);
  if (!occurredAt || !expiresAt ||
      (e.purchased_at_ms !== undefined && e.purchased_at_ms !== null &&
       !fromMillis(e.purchased_at_ms))) return null;
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const active = (POSITIVE_EVENT_TYPES.has(type) || STILL_VALID_EVENT_TYPES.has(type)) &&
    Number.isFinite(expiresMs) && expiresMs > nowMs;
  // Unknown provider event semantics never grant; terminal events explicitly revoke.
  const normalizedActive = TERMINAL_EVENT_TYPES.has(type) ? false : active;
  const transactionId = typeof e.transaction_id === "string" ? e.transaction_id : null;
  const originalTransactionId = typeof e.original_transaction_id === "string"
    ? e.original_transaction_id : transactionId;
  if (!originalTransactionId && !transactionId) return null;
  const purchasedAt = fromMillis(e.purchased_at_ms);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return {
    eventId, userId, type, store, productId, entitlementId,
    transactionId, originalTransactionId, purchasedAt, expiresAt,
    occurredAt, active: normalizedActive, payloadHash,
  };
}

export async function journalIgnoredRevenueCatEvent(
  eventId: string,
  eventType: string,
  payloadHash: string,
): Promise<void> {
  const result = await billingRpc("billing_journal_ignored_revenuecat_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_payload_hash: payloadHash,
  });
  if (result.error) throw new Error("billing_journal_unavailable");
}

export async function recordUnknownRevenueCatEvent(payload: unknown): Promise<void> {
  const event = (payload as any)?.event;
  if (!event || typeof event.type !== "string" ||
      isSupportedRevenueCatEventType(event.type) ||
      typeof event.id !== "string" || !event.id || event.id.length > 200) {
    throw new Error("invalid_unknown_revenuecat_event");
  }
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  await journalIgnoredRevenueCatEvent(event.id, event.type, payloadHash);
}

export async function processRevenueCatEvent(
  event: NormalizedRevenueCatEvent,
): Promise<"processed" | "duplicate" | "ignored"> {
  const journal = await billingRpc("billing_journal_revenuecat_event", {
    p_event_id: event.eventId,
    p_user_id: event.userId,
    p_event_type: event.type,
    p_store: event.store,
    p_product_id: event.productId,
    p_entitlement_id: event.entitlementId,
    p_transaction_id: event.transactionId,
    p_original_transaction_id: event.originalTransactionId,
    p_purchased_at: event.purchasedAt,
    p_expires_at: event.expiresAt,
    p_occurred_at: event.occurredAt,
    p_active: event.active,
    p_payload_hash: event.payloadHash,
  });
  if (journal.error) throw new Error("billing_journal_unavailable");
  const journalStatus = journal.data?.status ?? journal.data;
  if (journalStatus === "processed" || journalStatus === "ignored") return "duplicate";
  const result = await billingRpc("billing_process_revenuecat_event", {
    p_event_id: event.eventId,
  });
  if (result.error) throw new Error("billing_processing_failed");
  const status = result.data?.status ?? result.data;
  if (status === "ignored") return "ignored";
  return status === "duplicate" ? "duplicate" : "processed";
}

function normalizeCustomerSnapshot(userId: string, response: unknown): RevenueCatCustomerSnapshot {
  const subscriber = (response as any)?.subscriber;
  if (!subscriber || subscriber.original_app_user_id !== userId ||
      (subscriber.app_user_id !== undefined && subscriber.app_user_id !== userId)) {
    throw new Error("revenuecat_wrong_account");
  }
  const entitlements = subscriber?.entitlements;
  const subscriptions = subscriber?.subscriptions;
  if (!entitlements || typeof entitlements !== "object" ||
      !subscriptions || typeof subscriptions !== "object") {
    throw new Error("revenuecat_snapshot_invalid");
  }
  const entitlement = entitlements[REVENUECAT_ENTITLEMENT_ID];
  if (!entitlement) return { active: false, productId: null, store: null, expiresAt: null };
  if (typeof entitlement.product_identifier !== "string" ||
      !configuredProducts().has(entitlement.product_identifier) ||
      !isProviderIsoDate(entitlement.expires_date)) {
    throw new Error("revenuecat_snapshot_invalid");
  }
  const subscription = subscriptions[entitlement.product_identifier];
  const store = storeName(subscription?.store);
  const expiresMs = Date.parse(entitlement.expires_date);
  if (!subscription || !store ||
      !configuredProducts(store).has(entitlement.product_identifier) ||
      !Number.isFinite(expiresMs) ||
      !isProviderIsoDate(subscription.expires_date)) {
    throw new Error("revenuecat_snapshot_invalid");
  }
  return {
    active: expiresMs > Date.now(),
    productId: entitlement.product_identifier,
    store,
    expiresAt: entitlement.expires_date,
  };
}

export async function reconcileRevenueCatCustomer(userId: string): Promise<BillingState> {
  if (!isRevenueCatBillingEnabled() || !hasRevenueCatProductConfiguration()) {
    throw new Error("revenuecat_server_configuration_unavailable");
  }
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!apiKey) throw new Error("revenuecat_server_configuration_unavailable");
  const requestFetch = process.env.NODE_ENV === "test" && _billingTestOverrides.fetch
    ? _billingTestOverrides.fetch : fetch;
  const fetchStartedAt = new Date().toISOString();
  let response: Response;
  try {
    response = await requestFetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch {
    throw new Error("revenuecat_customer_unavailable");
  }
  if (!response.ok) throw new Error("revenuecat_customer_unavailable");
  const body = await response.json();
  const providerSnapshot = normalizeCustomerSnapshot(userId, body);
  const snapshotHash = createHash("sha256")
    .update(JSON.stringify({ ...providerSnapshot, fetchStartedAt }))
    .digest("hex");
  const snapshotId = `api:${createHash("sha256").update(userId).digest("hex")}:${snapshotHash}`;
  // V1 cannot safely manufacture a transaction or transfer a restored grant.
  // An active snapshot can only undo our own earlier inactive-snapshot
  // deactivation of the unique matching webhook-verified store/product row.
  // If no unique row exists, the response stays Free/pending; retry this
  // reconcile endpoint after RevenueCat's verified transaction webhook arrives.
  const result = await billingRpc("billing_reconcile_revenuecat_snapshot", {
    p_user_id: userId,
    p_event_id: snapshotId,
    p_payload_hash: snapshotHash,
    p_provider_entitlement_active: providerSnapshot.active,
    p_provider_product_id: providerSnapshot.productId,
    p_provider_store: providerSnapshot.store,
    p_provider_expires_at: providerSnapshot.expiresAt,
    p_fetch_started_at: fetchStartedAt,
  });
  if (result.error) throw new Error("billing_reconciliation_failed");
  return parseBillingState(result.data);
}

export function parseBillingState(value: any): BillingState {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row.is_premium !== "boolean") throw new Error("billing_state_unavailable");
  return { isPremium: row.is_premium, expiresAt: row.expires_at ?? null };
}

export function isEntitlementActive(
  subscriptions: Array<{ store: string; entitlementId: string; active: boolean; expiresAt: string | null }>,
  nowMs = Date.now(),
): BillingState {
  const qualifying = subscriptions.filter(subscription =>
    (subscription.store === "APPLE" || subscription.store === "GOOGLE") &&
    subscription.entitlementId === REVENUECAT_ENTITLEMENT_ID &&
    subscription.active && Boolean(subscription.expiresAt) &&
    Date.parse(subscription.expiresAt as string) > nowMs,
  );
  const expiresAt = qualifying.reduce<string | null>((latest, item) =>
    !latest || Date.parse(item.expiresAt as string) > Date.parse(latest)
      ? item.expiresAt : latest, null);
  return { isPremium: qualifying.length > 0, expiresAt };
}

export async function getAuthoritativeBillingState(userId: string): Promise<BillingState> {
  const result = await billingRpc("billing_reconcile_entitlement", { p_user_id: userId });
  if (result.error) throw new Error("billing_state_unavailable");
  return parseBillingState(result.data);
}

export async function getBillingReadiness(): Promise<{ ready: boolean }> {
  const configured = isRevenueCatBillingEnabled() &&
    hasRevenueCatProductConfiguration() &&
    Boolean(process.env.REVENUECAT_WEBHOOK_SECRET?.trim()) &&
    Boolean(process.env.REVENUECAT_SECRET_API_KEY?.trim());
  if (!configured) return { ready: false };
  try {
    const result = await billingRpc("billing_readiness_check", {});
    return { ready: !result.error && result.data?.ready === true };
  } catch {
    return { ready: false };
  }
}

export async function tombstoneBillingAccount(userId: string): Promise<void> {
  const result = await billingRpc("billing_tombstone_account", { p_user_id: userId });
  if (result.error) throw new Error("billing_tombstone_failed");
}