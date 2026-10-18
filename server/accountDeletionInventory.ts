/**
 * Durable server-managed data and how account deletion handles it.
 * Keep the schema-inventory regression test in accountDeletion.test.ts in sync
 * whenever a new table or Storage bucket is introduced.
 */
export const ACCOUNT_DELETION_TABLES = [
  { table: "affinity_signals", ownerColumn: "user_id" },
  { table: "pair_affinity_signals", ownerColumn: "user_id" },
  { table: "rotation_cursors", ownerColumn: "user_id" },
  { table: "wear_logs", ownerColumn: "user_id" },
  { table: "slot_statuses", ownerColumn: "user_id" },
  { table: "tryon_profiles", ownerColumn: "user_id" },
  { table: "saved_looks", ownerColumn: "user_id" },
  { table: "garment_group_members", ownerColumn: "user_id" },
  { table: "garment_groups", ownerColumn: "user_id" },
  { table: "wardrobe_free_selections", ownerColumn: "user_id" },
  { table: "wardrobe_items", ownerColumn: "user_id" },
  { table: "bg_removal_usage", ownerColumn: "user_id" },
  { table: "user_profiles", ownerColumn: "id" },
] as const;

export const ACCOUNT_DELETION_STORAGE_BUCKETS = [
  "wardrobe-images",
  "tryon-photos",
] as const;

/** Billing records are retained or neutralized by the account tombstone flow. */
export const ACCOUNT_DELETION_RETAINED_TABLES = [
  { table: "billing_accounts", policy: "retained with deleted_at set" },
  { table: "billing_event_journal", policy: "retained for provider-event idempotency and audit" },
  { table: "billing_subscriptions", policy: "deactivated; transaction lineage retained" },
  { table: "billing_transactions", policy: "retained to prevent transaction reassignment" },
  { table: "billing_reconciliations", policy: "overwritten with non-premium deletion state" },
  { table: "billing_deletion_tombstones", policy: "retained to prevent account/billing resurrection" },
] as const;

/** Shared or operational data is not owned by an individual account. */
export const ACCOUNT_DELETION_SHARED_TABLES = [
  { table: "bg_removal_cache", policy: "shared image-hash result cache" },
  { table: "lockout_store", policy: "expiring authentication abuse controls" },
  { table: "ratelimit_store", policy: "expiring request rate limits" },
] as const;
