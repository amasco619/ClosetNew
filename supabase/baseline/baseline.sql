-- GENERATED FILE: do not edit; run python3 scripts/generate-supabase-baseline.py
-- Generated from a captured snapshot; schema only; NEVER APPLY TO PRODUCTION.
-- Snapshot project ref: garppyocfgdamdgfyfbr
-- Snapshot date: 2026-10-22; exact catalog query time was not recorded.
-- Snapshot artifact mtime (UTC, not query time): 2026-10-22T14:18:48Z (filesystem mtime; exact catalog-query timestamp unavailable)
-- Source PostgreSQL version: 17.6; MAINTAIN is emitted conditionally for PG17+.
-- Requires a Supabase-initialized target with platform roles, auth.uid(), storage schema/tables,
-- and any platform-managed extensions already provisioned. This is not a Supabase bootstrap.
-- Captured ACL scope is the principals stored in the manifest; it does not reconstruct role memberships.

SET search_path = public, extensions, storage, auth, pg_catalog;

-- Extensions: manual/unknown provenance is retained as comments. Platform-managed extensions are skipped.
CREATE SCHEMA IF NOT EXISTS extensions;
-- ORIGIN: MANUAL/UNKNOWN — not created by a reviewed repo migration; platform/manual origin unknown
DO $baseline$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_stat_statements') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";';
  ELSE
    RAISE NOTICE 'Skipping unavailable local extension: %', 'pg_stat_statements';
  END IF;
END
$baseline$;
-- ORIGIN: MANUAL/UNKNOWN — not created by a reviewed repo migration; platform/manual origin unknown
DO $baseline$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pgcrypto') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";';
  ELSE
    RAISE NOTICE 'Skipping unavailable local extension: %', 'pgcrypto';
  END IF;
END
$baseline$;
-- ORIGIN: MANUAL/UNKNOWN — not created by a reviewed repo migration; platform/manual origin unknown
DO $baseline$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'uuid-ossp') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";';
  ELSE
    RAISE NOTICE 'Skipping unavailable local extension: %', 'uuid-ossp';
  END IF;
END
$baseline$;
-- Skipped Supabase/platform-managed extensions: plpgsql (1.0), supabase_vault (0.3.1)

-- Tables and columns
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TABLE public."affinity_signals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "signal_type" text NOT NULL,
  "weight" double precision DEFAULT 1.0,
  "logged_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."affinity_signals" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql
CREATE TABLE public."bg_removal_cache" (
  "image_hash" text NOT NULL,
  "result_b64" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."bg_removal_cache" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql
CREATE TABLE public."bg_removal_usage" (
  "user_id" uuid NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."bg_removal_usage" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE TABLE public."billing_accounts" (
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "last_snapshot_at" timestamp with time zone
);
ALTER TABLE public."billing_accounts" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE TABLE public."billing_deletion_tombstones" (
  "user_id" uuid NOT NULL,
  "deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" text DEFAULT 'account_deletion'::text NOT NULL
);
ALTER TABLE public."billing_deletion_tombstones" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE TABLE public."billing_event_journal" (
  "event_id" text NOT NULL,
  "user_id" uuid,
  "event_type" text NOT NULL,
  "store" text,
  "product_id" text,
  "entitlement_id" text,
  "transaction_id" text,
  "original_transaction_id" text,
  "purchased_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);
ALTER TABLE public."billing_event_journal" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE TABLE public."billing_reconciliations" (
  "user_id" uuid NOT NULL,
  "source" text NOT NULL,
  "event_id" text,
  "is_premium" boolean NOT NULL,
  "expires_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."billing_reconciliations" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE TABLE public."billing_subscriptions" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "user_id" uuid NOT NULL,
  "store" text NOT NULL,
  "product_id" text NOT NULL,
  "entitlement_id" text NOT NULL,
  "original_transaction_id" text NOT NULL,
  "transaction_id" text,
  "purchased_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "is_active" boolean DEFAULT false NOT NULL,
  "snapshot_deactivated" boolean DEFAULT false NOT NULL,
  "last_event_id" text,
  "last_event_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_webhook_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."billing_subscriptions" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE TABLE public."billing_transactions" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "user_id" uuid NOT NULL,
  "store" text NOT NULL,
  "transaction_id" text NOT NULL,
  "original_transaction_id" text,
  "product_id" text NOT NULL,
  "purchased_at" timestamp with time zone,
  "event_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."billing_transactions" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE TABLE public."garment_group_members" (
  "user_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "garment_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."garment_group_members" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE TABLE public."garment_groups" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "relationship_type" text NOT NULL,
  "relationship_confidence" double precision,
  "confirmation_status" text NOT NULL,
  "shared_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_image_path" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."garment_groups" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql
CREATE TABLE public."lockout_store" (
  "key" text NOT NULL,
  "value" text,
  "expires" bigint
);
ALTER TABLE public."lockout_store" OWNER TO "postgres";
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TABLE public."pair_affinity_signals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "item_id_a" uuid NOT NULL,
  "item_id_b" uuid NOT NULL,
  "signal_type" text NOT NULL,
  "weight" double precision DEFAULT 1.0,
  "logged_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."pair_affinity_signals" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql
CREATE TABLE public."ratelimit_store" (
  "key" text NOT NULL,
  "hits" integer DEFAULT 0 NOT NULL,
  "reset_time" timestamp with time zone NOT NULL
);
ALTER TABLE public."ratelimit_store" OWNER TO "postgres";
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TABLE public."rotation_cursors" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "scenario" text NOT NULL,
  "cursor_index" integer DEFAULT 0,
  "seed_date" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."rotation_cursors" OWNER TO "postgres";
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TABLE public."saved_looks" (
  "id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "custom_name" text,
  "saved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."saved_looks" OWNER TO "postgres";
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TABLE public."slot_statuses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "slot_id" text NOT NULL,
  "status" text DEFAULT 'needed'::text NOT NULL,
  "matched_item_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."slot_statuses" OWNER TO "postgres";
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TABLE public."tryon_profiles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "photo_url" text NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."tryon_profiles" OWNER TO "postgres";
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TABLE public."user_profiles" (
  "id" uuid NOT NULL,
  "body_type" text,
  "eye_color" text,
  "skin_tone" text,
  "undertone" text,
  "style_goals" text[],
  "secondary_goal" text,
  "lifestyle" jsonb DEFAULT '{}'::jsonb,
  "constraints" jsonb DEFAULT '{}'::jsonb,
  "location_lat" double precision,
  "location_lon" double precision,
  "premium" boolean DEFAULT false,
  "premium_expires_at" timestamp with time zone,
  "onboarding_complete" boolean DEFAULT false,
  "is_guest" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "name" text
);
ALTER TABLE public."user_profiles" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260928000000_free_wardrobe_selection.sql
CREATE TABLE public."wardrobe_free_selections" (
  "user_id" uuid NOT NULL,
  "item_id" uuid NOT NULL
);
ALTER TABLE public."wardrobe_free_selections" OWNER TO "postgres";
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TABLE public."wardrobe_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "garment_type" text NOT NULL,
  "sub_type" text,
  "color_family" text,
  "description" text,
  "occasion" text[] DEFAULT '{}'::text[],
  "image_url" text,
  "cleaned_image_url" text,
  "item_affinity" double precision DEFAULT 1.0,
  "wear_count" integer DEFAULT 0,
  "last_worn_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "fabric" text,
  "fit" text,
  "pattern" text,
  "pattern_scale" text,
  "recommendation_semantics" jsonb
);
ALTER TABLE public."wardrobe_items" OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261019000000_durable_wardrobe_photo_cleanup.sql
CREATE TABLE public."wardrobe_photo_cleanup_receipts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "image_url" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."wardrobe_photo_cleanup_receipts" OWNER TO "postgres";
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TABLE public."wear_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "outfit_fingerprint" text NOT NULL,
  "item_ids" uuid[] DEFAULT '{}'::uuid[],
  "occasion" text,
  "logged_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."wear_logs" OWNER TO "postgres";

-- Public functions; full captured CREATE definitions, ownership, security mode and search_path.
-- ORIGIN: supabase/migrations/20261019000000_durable_wardrobe_photo_cleanup.sql
CREATE OR REPLACE FUNCTION public.acknowledge_wardrobe_photo_cleanup(p_item_id uuid, p_image_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;

  DELETE FROM public.wardrobe_photo_cleanup_receipts
  WHERE user_id = auth.uid()
    AND item_id = p_item_id
    AND image_url = p_image_url;
END;
$function$
ALTER FUNCTION public.acknowledge_wardrobe_photo_cleanup(uuid,text) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql
CREATE OR REPLACE FUNCTION public.bg_removal_increment_usage(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  INSERT INTO public.bg_removal_usage (user_id, count, last_used_at)
  VALUES (p_user_id, 1, pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE
    SET count = public.bg_removal_usage.count + 1,
        last_used_at = pg_catalog.now()
  RETURNING count;
$function$
ALTER FUNCTION public.bg_removal_increment_usage(uuid) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql
CREATE OR REPLACE FUNCTION public.bg_removal_reset_usage(p_user_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  INSERT INTO public.bg_removal_usage (user_id, count, last_used_at)
  VALUES (p_user_id, 0, pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE
    SET count = 0,
        last_used_at = pg_catalog.now();
$function$
ALTER FUNCTION public.bg_removal_reset_usage(uuid) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE OR REPLACE FUNCTION public.billing_journal_ignored_revenuecat_event(p_event_id text, p_event_type text, p_payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  existing public.billing_event_journal%ROWTYPE;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) > 200 OR p_event_type IS NULL
     OR length(p_event_type) > 100
     OR p_event_type IN (
       'INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION',
       'TEMPORARY_ENTITLEMENT_GRANT', 'CANCELLATION', 'BILLING_ISSUE',
       'EXPIRATION', 'REFUND', 'REVOKE'
     )
     OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid ignored billing event';
  END IF;
  INSERT INTO public.billing_event_journal (
    event_id, event_type, payload_hash, status, received_at, processed_at
  ) VALUES (p_event_id, p_event_type, p_payload_hash, 'ignored', now(), now())
  ON CONFLICT (event_id) DO NOTHING;
  SELECT * INTO existing FROM public.billing_event_journal
    WHERE event_id = p_event_id FOR UPDATE;
  IF existing.payload_hash <> p_payload_hash OR existing.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'billing event identity collision';
  END IF;
  RETURN jsonb_build_object('status', existing.status);
END;
$function$
ALTER FUNCTION public.billing_journal_ignored_revenuecat_event(text,text,text) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE OR REPLACE FUNCTION public.billing_journal_revenuecat_event(p_event_id text, p_user_id uuid, p_event_type text, p_store text, p_product_id text, p_entitlement_id text, p_transaction_id text, p_original_transaction_id text, p_purchased_at timestamp with time zone, p_expires_at timestamp with time zone, p_occurred_at timestamp with time zone, p_active boolean, p_payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  existing public.billing_event_journal%ROWTYPE;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) > 200 OR p_event_type IS NULL
     OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid billing event';
  END IF;
  INSERT INTO public.billing_event_journal (
    event_id, user_id, event_type, store, product_id, entitlement_id,
    transaction_id, original_transaction_id, purchased_at, expires_at,
    occurred_at, is_active, payload_hash
  ) VALUES (
    p_event_id, p_user_id, p_event_type, p_store, p_product_id, p_entitlement_id,
    p_transaction_id, p_original_transaction_id, p_purchased_at, p_expires_at,
    coalesce(p_occurred_at, now()), coalesce(p_active, false), p_payload_hash
  ) ON CONFLICT (event_id) DO NOTHING;

  SELECT * INTO existing FROM public.billing_event_journal
    WHERE event_id = p_event_id FOR UPDATE;
  IF existing.payload_hash <> p_payload_hash OR existing.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'billing event identity collision';
  END IF;
  RETURN jsonb_build_object('status', existing.status);
END;
$function$
ALTER FUNCTION public.billing_journal_revenuecat_event(text,uuid,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,boolean,text) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE OR REPLACE FUNCTION public.billing_process_revenuecat_event(p_event_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  event_row public.billing_event_journal%ROWTYPE;
  sub_key text;
  v_is_premium boolean;
  expiry timestamptz;
  latest_webhook_at timestamptz;
  subscription_owner uuid;
  transaction_owner uuid;
  snapshot_fence timestamptz;
BEGIN
  SELECT * INTO event_row FROM public.billing_event_journal
    WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing event not journaled'; END IF;
  IF event_row.status IN ('processed', 'ignored') THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF event_row.user_id IS NULL OR event_row.store NOT IN ('APPLE', 'GOOGLE')
     OR event_row.entitlement_id <> 'amodka_premium'
     OR event_row.product_id IS NULL
     OR (event_row.original_transaction_id IS NULL AND event_row.transaction_id IS NULL)
     OR event_row.event_type NOT IN (
       'INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION',
       'TEMPORARY_ENTITLEMENT_GRANT', 'CANCELLATION', 'BILLING_ISSUE',
       'EXPIRATION', 'REFUND', 'REVOKE'
     ) THEN
    UPDATE public.billing_event_journal SET status = 'ignored', processed_at = now()
      WHERE event_id = p_event_id;
    RETURN jsonb_build_object('status', 'ignored');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(event_row.user_id::text, 0));
  INSERT INTO public.billing_accounts (user_id) VALUES (event_row.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT last_snapshot_at INTO snapshot_fence
    FROM public.billing_accounts WHERE user_id = event_row.user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.billing_deletion_tombstones
             WHERE user_id = event_row.user_id) THEN
    UPDATE public.billing_event_journal SET status = 'ignored', processed_at = now()
      WHERE event_id = p_event_id;
    RETURN jsonb_build_object('status', 'ignored');
  END IF;

  sub_key := coalesce(event_row.original_transaction_id,
                      event_row.transaction_id, 'event:' || event_row.event_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(event_row.store || ':sub:' || sub_key, 0));
  IF event_row.transaction_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(event_row.store || ':txn:' || event_row.transaction_id, 0)
    );
  END IF;
  SELECT last_webhook_at, user_id INTO latest_webhook_at, subscription_owner
    FROM public.billing_subscriptions
    WHERE store = event_row.store AND original_transaction_id = sub_key FOR UPDATE;
  IF subscription_owner IS NOT NULL AND subscription_owner <> event_row.user_id THEN
    UPDATE public.billing_event_journal SET status = 'ignored', processed_at = now()
      WHERE event_id = p_event_id;
    RETURN jsonb_build_object('status', 'ignored');
  END IF;
  IF event_row.transaction_id IS NOT NULL THEN
    SELECT user_id INTO transaction_owner FROM public.billing_transactions
      WHERE store = event_row.store AND transaction_id = event_row.transaction_id FOR UPDATE;
    IF transaction_owner IS NOT NULL AND transaction_owner <> event_row.user_id THEN
      UPDATE public.billing_event_journal SET status = 'ignored', processed_at = now()
        WHERE event_id = p_event_id;
      RETURN jsonb_build_object('status', 'ignored');
    END IF;
  END IF;
  -- Customer snapshots can fence delayed positive events, but a terminal
  -- provider event for this exact previously verified lineage is stronger
  -- evidence than a potentially stale customer API response. It may cross the
  -- snapshot fence only when newer than that lineage's last webhook fact.
  IF snapshot_fence IS NOT NULL AND event_row.occurred_at <= snapshot_fence
     AND NOT (
       event_row.event_type IN ('EXPIRATION', 'REFUND', 'REVOKE')
       AND subscription_owner = event_row.user_id
       AND (latest_webhook_at IS NULL OR event_row.occurred_at >= latest_webhook_at)
     ) THEN
    UPDATE public.billing_event_journal SET status = 'processed', processed_at = now()
      WHERE event_id = p_event_id;
    RETURN jsonb_build_object('status', 'stale');
  END IF;
  IF latest_webhook_at IS NOT NULL AND event_row.occurred_at < latest_webhook_at THEN
    UPDATE public.billing_event_journal SET status = 'processed', processed_at = now()
      WHERE event_id = p_event_id;
    RETURN jsonb_build_object('status', 'stale');
  END IF;
  INSERT INTO public.billing_subscriptions (
    user_id, store, product_id, entitlement_id, original_transaction_id,
    transaction_id, purchased_at, expires_at, is_active, snapshot_deactivated, last_event_id,
    last_event_at, last_webhook_at, updated_at
  ) VALUES (
    event_row.user_id, event_row.store, event_row.product_id,
    event_row.entitlement_id, sub_key, event_row.transaction_id,
    event_row.purchased_at, event_row.expires_at, event_row.is_active, false,
    event_row.event_id, event_row.occurred_at, event_row.occurred_at, now()
  )
  ON CONFLICT (store, original_transaction_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    product_id = EXCLUDED.product_id,
    entitlement_id = EXCLUDED.entitlement_id,
    transaction_id = coalesce(EXCLUDED.transaction_id, billing_subscriptions.transaction_id),
    purchased_at = coalesce(EXCLUDED.purchased_at, billing_subscriptions.purchased_at),
    expires_at = coalesce(EXCLUDED.expires_at, billing_subscriptions.expires_at),
    is_active = EXCLUDED.is_active,
    snapshot_deactivated = false,
    last_event_id = EXCLUDED.last_event_id,
    last_event_at = greatest(billing_subscriptions.last_event_at, EXCLUDED.last_event_at),
    last_webhook_at = EXCLUDED.last_webhook_at,
    updated_at = now()
  WHERE billing_subscriptions.user_id = EXCLUDED.user_id
    AND billing_subscriptions.last_webhook_at <= EXCLUDED.last_webhook_at;

  IF event_row.transaction_id IS NOT NULL THEN
    INSERT INTO public.billing_transactions (
      user_id, store, transaction_id, original_transaction_id, product_id,
      purchased_at, event_id
    ) VALUES (
      event_row.user_id, event_row.store, event_row.transaction_id, sub_key,
      event_row.product_id, event_row.purchased_at, event_row.event_id
    ) ON CONFLICT (store, transaction_id) DO NOTHING;
  END IF;

  UPDATE public.billing_event_journal SET status = 'processed', processed_at = now()
    WHERE event_id = p_event_id;
  SELECT coalesce(bool_or(is_active AND expires_at > now()), false),
         max(expires_at) FILTER (WHERE is_active AND expires_at > now())
    INTO v_is_premium, expiry
    FROM public.billing_subscriptions
    WHERE user_id = event_row.user_id AND entitlement_id = 'amodka_premium';
  UPDATE public.user_profiles
    SET premium = coalesce(v_is_premium, false), premium_expires_at = expiry
    WHERE id = event_row.user_id;
  INSERT INTO public.billing_reconciliations (
    user_id, source, event_id, is_premium, expires_at, updated_at
  ) VALUES (event_row.user_id, 'webhook', event_row.event_id,
            coalesce(v_is_premium, false), expiry, now())
  ON CONFLICT (user_id) DO UPDATE SET source = EXCLUDED.source,
    event_id = EXCLUDED.event_id, is_premium = EXCLUDED.is_premium,
    expires_at = EXCLUDED.expires_at, updated_at = now();
  RETURN jsonb_build_object('status', 'processed');
END;
$function$
ALTER FUNCTION public.billing_process_revenuecat_event(text) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE OR REPLACE FUNCTION public.billing_readiness_check()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'ready',
    to_regclass('public.billing_accounts') IS NOT NULL
      AND to_regclass('public.billing_event_journal') IS NOT NULL
      AND to_regclass('public.billing_subscriptions') IS NOT NULL
      AND to_regclass('public.billing_transactions') IS NOT NULL
      AND to_regclass('public.billing_reconciliations') IS NOT NULL
      AND to_regclass('public.billing_deletion_tombstones') IS NOT NULL
      AND to_regprocedure(
        'public.billing_journal_revenuecat_event(text,uuid,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,boolean,text)'
      ) IS NOT NULL
      AND to_regprocedure('public.billing_process_revenuecat_event(text)') IS NOT NULL
      AND to_regprocedure('public.billing_reconcile_entitlement(uuid)') IS NOT NULL
      AND to_regprocedure(
         'public.billing_reconcile_revenuecat_snapshot(uuid,text,text,boolean,text,text,timestamp with time zone,timestamp with time zone)'
      ) IS NOT NULL
      AND to_regprocedure('public.billing_tombstone_account(uuid)') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'billing_accounts'
          AND column_name = 'last_snapshot_at'
      )
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'billing_subscriptions'
           AND column_name = 'snapshot_deactivated'
       )
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'billing_subscriptions'
           AND column_name = 'last_webhook_at'
       )
  )
$function$
ALTER FUNCTION public.billing_readiness_check() OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE OR REPLACE FUNCTION public.billing_reconcile_entitlement(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_premium boolean := false;
  expiry timestamptz;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user id required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.billing_deletion_tombstones WHERE user_id = p_user_id) THEN
    SELECT coalesce(bool_or(is_active AND expires_at > now()), false),
           max(expires_at) FILTER (WHERE is_active AND expires_at > now())
      INTO v_is_premium, expiry FROM public.billing_subscriptions
      WHERE user_id = p_user_id AND entitlement_id = 'amodka_premium';
  END IF;
  UPDATE public.user_profiles
    SET premium = coalesce(v_is_premium, false), premium_expires_at = expiry
    WHERE id = p_user_id;
  RETURN jsonb_build_object('is_premium', coalesce(v_is_premium, false), 'expires_at', expiry);
END;
$function$
ALTER FUNCTION public.billing_reconcile_entitlement(uuid) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE OR REPLACE FUNCTION public.billing_reconcile_revenuecat_snapshot(p_user_id uuid, p_event_id text, p_payload_hash text, p_provider_entitlement_active boolean, p_provider_product_id text, p_provider_store text, p_provider_expires_at timestamp with time zone, p_fetch_started_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_premium boolean := false;
  expiry timestamptz;
  current_snapshot_at timestamptz;
  latest_webhook_at timestamptz;
  snapshot_is_stale boolean := false;
  changed_rows integer := 0;
  matching_rows integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_provider_entitlement_active IS NULL OR
     (p_provider_store IS NOT NULL AND p_provider_store NOT IN ('APPLE', 'GOOGLE')) OR
     (p_provider_entitlement_active AND (
       p_provider_product_id IS NULL OR p_provider_store IS NULL OR
       p_provider_expires_at IS NULL OR p_provider_expires_at <= now()
     )) OR
     p_fetch_started_at IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' OR
     p_event_id IS NULL OR length(p_event_id) > 200 THEN
    RAISE EXCEPTION 'invalid RevenueCat snapshot';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.billing_deletion_tombstones WHERE user_id = p_user_id) THEN
    RETURN jsonb_build_object('is_premium', false, 'expires_at', null);
  END IF;
  INSERT INTO public.billing_accounts (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT last_snapshot_at INTO current_snapshot_at
    FROM public.billing_accounts WHERE user_id = p_user_id FOR UPDATE;
  INSERT INTO public.billing_event_journal (
    event_id, user_id, event_type, payload_hash, occurred_at, status, processed_at
  ) VALUES (p_event_id, p_user_id, 'CUSTOMER_API_SNAPSHOT', p_payload_hash,
            p_fetch_started_at, 'processed', now())
  ON CONFLICT (event_id) DO NOTHING;
  IF EXISTS (
    SELECT 1 FROM public.billing_event_journal
    WHERE event_id = p_event_id
      AND (payload_hash <> p_payload_hash OR user_id IS DISTINCT FROM p_user_id)
  ) THEN
    RAISE EXCEPTION 'billing snapshot identity collision';
  END IF;
  SELECT max(last_webhook_at) INTO latest_webhook_at
    FROM public.billing_subscriptions WHERE user_id = p_user_id;
  snapshot_is_stale :=
    (current_snapshot_at IS NOT NULL AND p_fetch_started_at <= current_snapshot_at)
    OR (latest_webhook_at IS NOT NULL AND p_fetch_started_at <= latest_webhook_at);

  -- The customer API does not provide a store-verified original transaction
  -- identifier. It may deactivate existing rows, and can only undo its own
  -- prior deactivation for an exact webhook-backed store/product row. It never
  -- creates a subscription or transaction. Use fetch start to fence races.
  IF NOT p_provider_entitlement_active AND NOT snapshot_is_stale
     AND (current_snapshot_at IS NULL OR p_fetch_started_at > current_snapshot_at) THEN
    UPDATE public.billing_subscriptions
      SET is_active = false, snapshot_deactivated = true,
          last_event_at = p_fetch_started_at, updated_at = now()
      WHERE user_id = p_user_id AND is_active
        AND last_event_at <= p_fetch_started_at;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    -- With no existing transaction rows there is nothing for this snapshot to
    -- revoke, so do not fence a first purchase webhook arriving in parallel.
    IF changed_rows > 0 THEN
      UPDATE public.billing_accounts SET last_snapshot_at = p_fetch_started_at
        WHERE user_id = p_user_id;
    END IF;
  ELSIF p_provider_entitlement_active AND NOT snapshot_is_stale
     AND (current_snapshot_at IS NULL OR p_fetch_started_at > current_snapshot_at) THEN
    SELECT count(*) INTO matching_rows
      FROM public.billing_subscriptions
      WHERE user_id = p_user_id AND store = p_provider_store
        AND product_id = p_provider_product_id
        AND entitlement_id = 'amodka_premium';
    -- The customer API lacks original transaction identity. If multiple
    -- webhook-backed lineages share this product/store, their status is
    -- ambiguous and none is reactivated from a snapshot.
    IF matching_rows = 1 THEN
      UPDATE public.billing_subscriptions
        SET is_active = true, expires_at = p_provider_expires_at,
            snapshot_deactivated = false, last_event_at = p_fetch_started_at,
            updated_at = now()
        WHERE user_id = p_user_id
          AND store = p_provider_store
          AND product_id = p_provider_product_id
          AND entitlement_id = 'amodka_premium'
          AND snapshot_deactivated
          AND NOT is_active
          AND last_event_at <= p_fetch_started_at;
      GET DIAGNOSTICS changed_rows = ROW_COUNT;
    END IF;
    -- An active snapshot of an already verified row also fences older
    -- in-flight snapshots, even when the row was already active. Empty-account
    -- active snapshots still cannot fence a first-purchase webhook.
    IF changed_rows > 0 OR EXISTS (
      SELECT 1 FROM public.billing_subscriptions
      WHERE user_id = p_user_id
        AND store = p_provider_store
        AND product_id = p_provider_product_id
        AND entitlement_id = 'amodka_premium'
        AND (is_active OR snapshot_deactivated)
    ) THEN
      UPDATE public.billing_accounts SET last_snapshot_at = p_fetch_started_at
        WHERE user_id = p_user_id;
    END IF;
  END IF;
  SELECT coalesce(bool_or(is_active AND expires_at > now()), false),
         max(expires_at) FILTER (WHERE is_active AND expires_at > now())
    INTO v_is_premium, expiry FROM public.billing_subscriptions
    WHERE user_id = p_user_id AND entitlement_id = 'amodka_premium';
  UPDATE public.user_profiles
    SET premium = coalesce(v_is_premium, false), premium_expires_at = expiry
    WHERE id = p_user_id;
  IF NOT snapshot_is_stale THEN
    INSERT INTO public.billing_reconciliations (
      user_id, source, event_id, is_premium, expires_at, updated_at
    ) VALUES (p_user_id, 'customer_api', p_event_id, coalesce(v_is_premium, false), expiry, now())
    ON CONFLICT (user_id) DO UPDATE SET source = EXCLUDED.source,
      event_id = EXCLUDED.event_id, is_premium = EXCLUDED.is_premium,
      expires_at = EXCLUDED.expires_at, updated_at = now();
  END IF;
  RETURN jsonb_build_object('is_premium', coalesce(v_is_premium, false), 'expires_at', expiry);
END;
$function$
ALTER FUNCTION public.billing_reconcile_revenuecat_snapshot(uuid,text,text,boolean,text,text,timestamp with time zone,timestamp with time zone) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE OR REPLACE FUNCTION public.billing_tombstone_account(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user id required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  INSERT INTO public.billing_deletion_tombstones (user_id)
    VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.billing_accounts (user_id, deleted_at)
    VALUES (p_user_id, now())
    ON CONFLICT (user_id) DO UPDATE SET deleted_at = coalesce(billing_accounts.deleted_at, now());
   UPDATE public.billing_subscriptions
     SET is_active = false, snapshot_deactivated = false, updated_at = now()
    WHERE user_id = p_user_id;
  UPDATE public.user_profiles SET premium = false, premium_expires_at = null
    WHERE id = p_user_id;
  INSERT INTO public.billing_reconciliations (
    user_id, source, is_premium, expires_at, updated_at
  ) VALUES (p_user_id, 'deletion', false, null, now())
  ON CONFLICT (user_id) DO UPDATE SET source = EXCLUDED.source,
    event_id = null, is_premium = false, expires_at = null, updated_at = now();
END;
$function$
ALTER FUNCTION public.billing_tombstone_account(uuid) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE OR REPLACE FUNCTION public.create_garment_group(p_garment_ids uuid[], p_relationship_type text, p_relationship_confidence double precision DEFAULT NULL::double precision, p_confirmation_status text DEFAULT 'user_confirmed'::text, p_shared_attributes jsonb DEFAULT '{}'::jsonb, p_source_image_path text DEFAULT NULL::text)
 RETURNS garment_groups
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_group public.garment_groups;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_garment_ids IS NULL
    OR cardinality(p_garment_ids) < 2
    OR array_position(p_garment_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'at least two garment ids are required'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT garment_id)
    FROM unnest(p_garment_ids) AS garment_id
  ) <> cardinality(p_garment_ids)
  THEN
    RAISE EXCEPTION 'duplicate garment ids are not allowed'
      USING ERRCODE = '23505';
  END IF;

  IF (
    SELECT count(*)
    FROM public.wardrobe_items AS items
    WHERE items.user_id = v_user_id
      AND items.id = ANY (p_garment_ids)
  ) <> cardinality(p_garment_ids)
  THEN
    RAISE EXCEPTION 'all garments must belong to the authenticated user'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.garment_groups (
    user_id,
    relationship_type,
    relationship_confidence,
    confirmation_status,
    shared_attributes,
    source_image_path
  )
  VALUES (
    v_user_id,
    p_relationship_type,
    p_relationship_confidence,
    p_confirmation_status,
    p_shared_attributes,
    p_source_image_path
  )
  RETURNING * INTO v_group;

  INSERT INTO public.garment_group_members (user_id, group_id, garment_id)
  SELECT v_user_id, v_group.id, garment_id
  FROM unnest(p_garment_ids) AS garment_id;

  RETURN v_group;
END;
$function$
ALTER FUNCTION public.create_garment_group(uuid[],text,double precision,text,jsonb,text) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE OR REPLACE FUNCTION public.delete_empty_garment_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  -- Serialize competing member removals. During a parent-group cascade the
  -- parent row is already absent, so this safely becomes a no-op.
  PERFORM 1
  FROM public.garment_groups AS groups
  WHERE groups.id = OLD.group_id
    AND groups.user_id = OLD.user_id
  FOR UPDATE;

  DELETE FROM public.garment_groups AS groups
  WHERE groups.id = OLD.group_id
    AND groups.user_id = OLD.user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.garment_group_members AS members
      WHERE members.group_id = OLD.group_id
    );
  RETURN OLD;
END;
$function$
ALTER FUNCTION public.delete_empty_garment_group() OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261001000000_wardrobe_group_batch_insert.sql
CREATE OR REPLACE FUNCTION public.insert_wardrobe_group_items(p_items jsonb, p_relationship_type text, p_relationship_confidence double precision, p_shared_attributes jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_ids uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 2 AND 6
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A wardrobe group must contain 2 to 6 items';
  END IF;
  IF p_relationship_type IS NULL
     OR p_relationship_type NOT IN ('coordinated_set', 'multi_item', 'layered')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid garment relationship type';
  END IF;
  IF p_relationship_confidence IS NOT NULL
     AND (p_relationship_confidence < 0 OR p_relationship_confidence > 1)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Relationship confidence must be between 0 and 1';
  END IF;
  IF jsonb_typeof(p_shared_attributes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Shared attributes must be an object';
  END IF;

  -- The existing insert RPC retains all item validation, capacity locking, and
  -- Free/Premium quota behavior. Any group error rolls these inserts back too.
  v_ids := public.insert_wardrobe_items(p_items);
  PERFORM public.create_garment_group(
    v_ids,
    p_relationship_type,
    p_relationship_confidence,
    'user_confirmed',
    p_shared_attributes,
    NULL
  );
  RETURN v_ids;
END;
$function$
ALTER FUNCTION public.insert_wardrobe_group_items(jsonb,text,double precision,jsonb) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260928000000_free_wardrobe_selection.sql
CREATE OR REPLACE FUNCTION public.insert_wardrobe_item(p_item jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  v_ids := public.insert_wardrobe_items(jsonb_build_array(p_item));
  RETURN v_ids[1];
END;
$function$
ALTER FUNCTION public.insert_wardrobe_item(jsonb) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260928000000_free_wardrobe_selection.sql
CREATE OR REPLACE FUNCTION public.insert_wardrobe_items(p_items jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_item_count integer;
  v_total_count integer;
  v_selected_count integer;
  v_is_premium boolean := false;
  v_ids uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_items must be a JSON array';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS entry(value)
    WHERE jsonb_typeof(entry.value) IS DISTINCT FROM 'object'
       OR entry.value - ARRAY[
         'id', 'user_id', 'garment_type', 'sub_type', 'color_family',
         'description', 'occasion', 'image_url', 'cleaned_image_url',
         'fabric', 'fit', 'pattern', 'pattern_scale', 'recommendation_semantics'
       ] <> '{}'::jsonb
       OR jsonb_typeof(entry.value -> 'garment_type') IS DISTINCT FROM 'string'
       OR (entry.value ? 'user_id' AND entry.value ->> 'user_id' IS DISTINCT FROM v_user_id::text)
       OR (entry.value ? 'id' AND jsonb_typeof(entry.value -> 'id') NOT IN ('string', 'null'))
       OR EXISTS (
         SELECT 1 FROM unnest(ARRAY[
           'sub_type', 'color_family', 'description', 'image_url',
           'cleaned_image_url', 'fabric', 'fit', 'pattern', 'pattern_scale'
         ]) AS field(name)
         WHERE entry.value ? field.name
           AND jsonb_typeof(entry.value -> field.name) NOT IN ('string', 'null')
       )
       OR (entry.value ? 'occasion' AND jsonb_typeof(entry.value -> 'occasion') NOT IN ('array', 'null'))
       OR (jsonb_typeof(entry.value -> 'occasion') = 'array' AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(entry.value -> 'occasion') AS occasion(value)
         WHERE jsonb_typeof(occasion.value) IS DISTINCT FROM 'string'
       ))
       OR (entry.value ? 'recommendation_semantics' AND
         NOT public.valid_wardrobe_recommendation_semantics(nullif(entry.value->'recommendation_semantics', 'null'::jsonb)))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid wardrobe item fields';
  END IF;

  v_item_count := jsonb_array_length(p_items);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  SELECT coalesce(profiles.premium IS TRUE AND profiles.premium_expires_at > now(), false)
    INTO v_is_premium FROM public.user_profiles AS profiles WHERE profiles.id = v_user_id;
  SELECT count(*) INTO v_total_count FROM public.wardrobe_items WHERE user_id = v_user_id;
  IF v_is_premium THEN
    IF v_total_count + v_item_count > 2000 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WARDROBE_CAPACITY_REACHED';
    END IF;
  ELSE
    SELECT count(*) INTO v_selected_count FROM public.wardrobe_free_selections WHERE user_id = v_user_id;
    IF v_selected_count + v_item_count > 30 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WARDROBE_CAPACITY_REACHED';
    END IF;
  END IF;

  WITH normalized AS MATERIALIZED (
    SELECT entry.ordinality, coalesce(item.id, gen_random_uuid()) AS id,
      item.garment_type, item.sub_type, item.color_family, item.description,
      item.occasion, item.image_url, item.cleaned_image_url,
      item.fabric, item.fit, item.pattern, item.pattern_scale,
      item.recommendation_semantics
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS entry(value, ordinality)
    CROSS JOIN LATERAL jsonb_to_record(entry.value) AS item(
      id uuid, garment_type text, sub_type text, color_family text, description text,
      occasion text[], image_url text, cleaned_image_url text,
      fabric text, fit text, pattern text, pattern_scale text,
      recommendation_semantics jsonb
    )
  ), inserted AS (
    INSERT INTO public.wardrobe_items (
      id, user_id, garment_type, sub_type, color_family, description,
      occasion, image_url, cleaned_image_url, fabric, fit, pattern, pattern_scale,
      recommendation_semantics
    )
    SELECT normalized.id, v_user_id, normalized.garment_type, normalized.sub_type,
      normalized.color_family, normalized.description, normalized.occasion,
      normalized.image_url, normalized.cleaned_image_url, normalized.fabric,
      normalized.fit, normalized.pattern, normalized.pattern_scale, normalized.recommendation_semantics
    FROM normalized ORDER BY normalized.ordinality RETURNING id
  )
  SELECT coalesce(array_agg(normalized.id ORDER BY normalized.ordinality), ARRAY[]::uuid[])
    INTO v_ids FROM normalized JOIN inserted USING (id);
  IF NOT v_is_premium AND cardinality(v_ids) > 0 THEN
    INSERT INTO public.wardrobe_free_selections (user_id, item_id)
      SELECT v_user_id, unnest(v_ids);
  END IF;
  RETURN v_ids;
END;
$function$
ALTER FUNCTION public.insert_wardrobe_items(jsonb) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql
CREATE OR REPLACE FUNCTION public.ratelimit_decrement(p_key text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  UPDATE public.ratelimit_store
  SET hits = CASE WHEN hits > 1 THEN hits - 1 ELSE 0 END
  WHERE key = p_key
    AND reset_time > pg_catalog.now();
$function$
ALTER FUNCTION public.ratelimit_decrement(text) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql
CREATE OR REPLACE FUNCTION public.ratelimit_delete_key(p_key text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  DELETE FROM public.ratelimit_store
  WHERE key = p_key;
$function$
ALTER FUNCTION public.ratelimit_delete_key(text) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql
CREATE OR REPLACE FUNCTION public.ratelimit_delete_prefix(p_prefix text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  DELETE FROM public.ratelimit_store
  WHERE p_prefix IS NOT NULL AND p_prefix <> ''
    AND pg_catalog.starts_with(key, p_prefix);
$function$
ALTER FUNCTION public.ratelimit_delete_prefix(text) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql
CREATE OR REPLACE FUNCTION public.ratelimit_increment(p_key text, p_window_ms bigint)
 RETURNS TABLE(hits integer, reset_time_ms bigint)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  INSERT INTO public.ratelimit_store AS r (key, hits, reset_time)
  VALUES (
    p_key,
    1,
    pg_catalog.now() + (p_window_ms * interval '1 millisecond')
  )
  ON CONFLICT (key) DO UPDATE
  SET
    hits = CASE
      WHEN r.reset_time <= pg_catalog.now() THEN 1
      ELSE r.hits + 1
    END,
    reset_time = CASE
      WHEN r.reset_time <= pg_catalog.now()
        THEN pg_catalog.now() + (p_window_ms * interval '1 millisecond')
      ELSE r.reset_time
    END
  RETURNING
    r.hits,
    (pg_catalog.date_part('epoch', r.reset_time) * 1000)::bigint;
$function$
ALTER FUNCTION public.ratelimit_increment(text,bigint) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261019000000_durable_wardrobe_photo_cleanup.sql
CREATE OR REPLACE FUNCTION public.record_wardrobe_photo_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF OLD.image_url IS NOT NULL AND (
    OLD.image_url ~ ('^' || OLD.user_id::text || '/[A-Za-z0-9_-]+[.](jpg|png)$')
    OR OLD.image_url ~ (
      '^https?://[^/?#]+/storage/v1/object/(public|sign)/wardrobe-images/' ||
      OLD.user_id::text || '/[A-Za-z0-9_-]+[.](jpg|png)([?#].*)?$'
    )
  ) THEN
    -- Serialize same-path deletions so concurrent duplicate references cannot
    -- both miss the receipt when each transaction sees the other's old row.
    PERFORM pg_advisory_xact_lock(hashtextextended(OLD.user_id::text || ':' || OLD.image_url, 0));
    IF NOT EXISTS (
      SELECT 1
      FROM public.wardrobe_items AS remaining
      WHERE remaining.user_id = OLD.user_id
        AND remaining.image_url = OLD.image_url
    ) THEN
      INSERT INTO public.wardrobe_photo_cleanup_receipts (user_id, item_id, image_url)
      VALUES (OLD.user_id, OLD.id, OLD.image_url);
    END IF;
  END IF;
  RETURN OLD;
END;
$function$
ALTER FUNCTION public.record_wardrobe_photo_cleanup() OWNER TO "postgres";
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
ALTER FUNCTION public.rls_auto_enable() OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260928000000_free_wardrobe_selection.sql
CREATE OR REPLACE FUNCTION public.set_free_wardrobe_selection(p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  IF p_ids IS NULL OR cardinality(p_ids) > 30
     OR EXISTS (SELECT 1 FROM unnest(p_ids) AS requested(id) WHERE id IS NULL)
     OR cardinality(p_ids) <> (
       SELECT count(DISTINCT requested.id)
       FROM unnest(p_ids) AS requested(id)
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Selection must contain at most 30 distinct non-null item IDs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_ids) AS requested(id)
    LEFT JOIN public.wardrobe_items AS items
      ON items.id = requested.id AND items.user_id = v_user_id
    WHERE items.id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'All selected items must belong to the authenticated user';
  END IF;

  DELETE FROM public.wardrobe_free_selections
  WHERE user_id = v_user_id;

  INSERT INTO public.wardrobe_free_selections (user_id, item_id)
  SELECT v_user_id, requested.id
  FROM unnest(p_ids) AS requested(id);
END;
$function$
ALTER FUNCTION public.set_free_wardrobe_selection(uuid[]) OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20260916000000_harden_update_updated_at.sql
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
ALTER FUNCTION public.update_updated_at() OWNER TO "postgres";
-- ORIGIN: supabase/migrations/20261012000000_canonical_wardrobe_semantics.sql
CREATE OR REPLACE FUNCTION public.valid_wardrobe_recommendation_semantics(value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  field text;
  component text;
  allowed text[];
  number_value numeric;
BEGIN
  IF value IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(value) <> 'object' OR octet_length(value::text) > 4096 THEN RETURN false; END IF;
  IF value - ARRAY[
    'accentColor', 'weight', 'neckline', 'sleeveLength', 'rise', 'warmthBand',
    'formalityLevel', 'seasonTags', 'metalTone', 'dominantHsl', 'dominantLab',
    'confirmedFields', 'purchasePrice'
  ] <> '{}'::jsonb THEN RETURN false; END IF;
  FOR field IN SELECT jsonb_object_keys(value) LOOP
    IF field IN ('formalityLevel', 'purchasePrice') THEN
      IF jsonb_typeof(value->field) <> 'number' THEN RETURN false; END IF;
      number_value := (value->>field)::numeric;
      IF field = 'formalityLevel' AND (number_value < 1 OR number_value > 10) THEN RETURN false; END IF;
      IF field = 'purchasePrice' AND (number_value <= 0 OR number_value > 1000000000) THEN RETURN false; END IF;
    ELSIF field IN ('seasonTags', 'confirmedFields') THEN
      IF jsonb_typeof(value->field) <> 'array' THEN RETURN false; END IF;
      allowed := CASE field
        WHEN 'seasonTags' THEN ARRAY['winter', 'summer', 'spring', 'fall', 'all-season']
        ELSE ARRAY['category', 'subType', 'colorFamily', 'accentColor', 'pattern',
          'patternScale', 'fabric', 'fit', 'weight', 'neckline', 'sleeveLength',
          'rise', 'warmthBand', 'formalityLevel', 'seasonTags', 'occasionTags',
          'metalTone', 'dominantHsl', 'dominantLab'] END;
      IF jsonb_array_length(value->field) > cardinality(allowed) THEN RETURN false; END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(value->field) entry
        WHERE jsonb_typeof(entry) <> 'string' OR NOT (entry #>> '{}') = ANY(allowed)
      ) THEN RETURN false; END IF;
    ELSIF field IN ('dominantHsl', 'dominantLab') THEN
      allowed := CASE field WHEN 'dominantHsl' THEN ARRAY['h','s','l'] ELSE ARRAY['L','a','b'] END;
      IF jsonb_typeof(value->field) <> 'object'
         OR (value->field) - allowed <> '{}'::jsonb
         OR NOT (value->field ?& allowed) THEN RETURN false; END IF;
      FOREACH component IN ARRAY allowed LOOP
        IF jsonb_typeof(value->field->component) <> 'number' THEN RETURN false; END IF;
        number_value := (value->field->>component)::numeric;
        IF field = 'dominantHsl' THEN
          IF number_value < 0 OR number_value > (CASE component WHEN 'h' THEN 360 ELSE 1 END) THEN RETURN false; END IF;
        ELSE
          IF component = 'L' AND (number_value < 0 OR number_value > 100) THEN RETURN false; END IF;
          IF component IN ('a','b') AND (number_value < -200 OR number_value > 200) THEN RETURN false; END IF;
        END IF;
      END LOOP;
    ELSE
      IF jsonb_typeof(value->field) <> 'string' THEN RETURN false; END IF;
      allowed := CASE field
        WHEN 'weight' THEN ARRAY['light','mid','heavy']
        WHEN 'neckline' THEN ARRAY['crew','v-neck','scoop','turtleneck','boat','square','halter','off-shoulder','collared']
        WHEN 'sleeveLength' THEN ARRAY['sleeveless','short','three-quarter','long']
        WHEN 'rise' THEN ARRAY['low','mid','high']
        WHEN 'warmthBand' THEN ARRAY['cold','cool','mild','warm','hot']
        WHEN 'metalTone' THEN ARRAY['gold','silver','rose-gold','mixed','none']
        ELSE NULL END;
      IF allowed IS NOT NULL AND NOT (value->>field) = ANY(allowed) THEN RETURN false; END IF;
      IF field = 'accentColor' AND length(value->>field) NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$function$
ALTER FUNCTION public.valid_wardrobe_recommendation_semantics(jsonb) OWNER TO "postgres";

-- Primary, unique and check constraints
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."affinity_signals" ADD CONSTRAINT "affinity_signals_pkey" PRIMARY KEY (id);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."affinity_signals" ADD CONSTRAINT "affinity_signals_signal_type_check" CHECK (signal_type = ANY (ARRAY['love'::text, 'not_today'::text, 'worn'::text]));
-- ORIGIN: supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql
ALTER TABLE public."bg_removal_cache" ADD CONSTRAINT "bg_removal_cache_pkey" PRIMARY KEY (image_hash);
-- ORIGIN: supabase/migrations/20261020231945_move_bg_removal_store_to_supabase.sql
ALTER TABLE public."bg_removal_usage" ADD CONSTRAINT "bg_removal_usage_pkey" PRIMARY KEY (user_id);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_accounts" ADD CONSTRAINT "billing_accounts_pkey" PRIMARY KEY (user_id);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_deletion_tombstones" ADD CONSTRAINT "billing_deletion_tombstones_pkey" PRIMARY KEY (user_id);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_event_journal" ADD CONSTRAINT "billing_event_journal_payload_hash_check" CHECK (payload_hash ~ '^[0-9a-f]{64}$'::text);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_event_journal" ADD CONSTRAINT "billing_event_journal_pkey" PRIMARY KEY (event_id);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_event_journal" ADD CONSTRAINT "billing_event_journal_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processed'::text, 'ignored'::text]));
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_reconciliations" ADD CONSTRAINT "billing_reconciliations_pkey" PRIMARY KEY (user_id);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_reconciliations" ADD CONSTRAINT "billing_reconciliations_source_check" CHECK (source = ANY (ARRAY['webhook'::text, 'customer_api'::text, 'deletion'::text]));
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY (id);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_store_check" CHECK (store = ANY (ARRAY['APPLE'::text, 'GOOGLE'::text]));
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_store_original_transaction_id_key" UNIQUE (store, original_transaction_id);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_transactions" ADD CONSTRAINT "billing_transactions_pkey" PRIMARY KEY (id);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_transactions" ADD CONSTRAINT "billing_transactions_store_check" CHECK (store = ANY (ARRAY['APPLE'::text, 'GOOGLE'::text]));
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER TABLE public."billing_transactions" ADD CONSTRAINT "billing_transactions_store_transaction_id_key" UNIQUE (store, transaction_id);
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_group_members" ADD CONSTRAINT "garment_group_members_pkey" PRIMARY KEY (group_id, garment_id);
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_groups" ADD CONSTRAINT "garment_groups_ai_confidence_check" CHECK (confirmation_status <> 'ai_inferred'::text OR relationship_confidence IS NOT NULL);
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_groups" ADD CONSTRAINT "garment_groups_confirmation_status_check" CHECK (confirmation_status = ANY (ARRAY['ai_inferred'::text, 'user_confirmed'::text, 'user_rejected'::text]));
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_groups" ADD CONSTRAINT "garment_groups_pkey" PRIMARY KEY (id);
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_groups" ADD CONSTRAINT "garment_groups_relationship_confidence_check" CHECK (relationship_confidence IS NULL OR relationship_confidence >= 0::double precision AND relationship_confidence <= 1::double precision);
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_groups" ADD CONSTRAINT "garment_groups_relationship_type_check" CHECK (relationship_type = ANY (ARRAY['coordinated_set'::text, 'multi_item'::text, 'layered'::text]));
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_groups" ADD CONSTRAINT "garment_groups_shared_attributes_check" CHECK (jsonb_typeof(shared_attributes) = 'object'::text);
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_groups" ADD CONSTRAINT "garment_groups_source_image_path_check" CHECK (source_image_path IS NULL OR source_image_path !~* '^https?://'::text AND source_image_path !~* '^file:'::text);
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_groups" ADD CONSTRAINT "garment_groups_user_id_id_key" UNIQUE (user_id, id);
-- ORIGIN: supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql
ALTER TABLE public."lockout_store" ADD CONSTRAINT "lockout_store_pkey" PRIMARY KEY (key);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."pair_affinity_signals" ADD CONSTRAINT "pair_affinity_signals_pkey" PRIMARY KEY (id);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."pair_affinity_signals" ADD CONSTRAINT "pair_affinity_signals_signal_type_check" CHECK (signal_type = ANY (ARRAY['love'::text, 'not_today'::text, 'worn'::text]));
-- ORIGIN: supabase/migrations/20261021091241_move_ratelimit_and_lockout_stores_to_supabase.sql
ALTER TABLE public."ratelimit_store" ADD CONSTRAINT "ratelimit_store_pkey" PRIMARY KEY (key);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."rotation_cursors" ADD CONSTRAINT "rotation_cursors_pkey" PRIMARY KEY (id);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."rotation_cursors" ADD CONSTRAINT "rotation_cursors_user_id_scenario_key" UNIQUE (user_id, scenario);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."saved_looks" ADD CONSTRAINT "saved_looks_pkey" PRIMARY KEY (user_id, id);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."slot_statuses" ADD CONSTRAINT "slot_statuses_pkey" PRIMARY KEY (id);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."slot_statuses" ADD CONSTRAINT "slot_statuses_status_check" CHECK (status = ANY (ARRAY['needed'::text, 'owned'::text]));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."slot_statuses" ADD CONSTRAINT "slot_statuses_user_id_slot_id_key" UNIQUE (user_id, slot_id);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."tryon_profiles" ADD CONSTRAINT "tryon_profiles_pkey" PRIMARY KEY (id);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."tryon_profiles" ADD CONSTRAINT "tryon_profiles_user_id_key" UNIQUE (user_id);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."user_profiles" ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY (id);
-- ORIGIN: supabase/migrations/20260928000000_free_wardrobe_selection.sql
ALTER TABLE public."wardrobe_free_selections" ADD CONSTRAINT "wardrobe_free_selections_pkey" PRIMARY KEY (user_id, item_id);
-- ORIGIN: supabase/migrations/20260929000000_wardrobe_garment_metadata.sql
ALTER TABLE public."wardrobe_items" ADD CONSTRAINT "wardrobe_items_fabric_check" CHECK (fabric = ANY (ARRAY['cotton'::text, 'silk'::text, 'denim'::text, 'wool'::text, 'linen'::text, 'lace'::text, 'synthetic'::text, 'leather'::text, 'knit'::text, 'satin'::text, 'cashmere'::text, 'suede'::text, 'velvet'::text, 'tweed'::text, 'chiffon'::text, 'jersey'::text, 'corduroy'::text]));
-- ORIGIN: supabase/migrations/20260929000000_wardrobe_garment_metadata.sql
ALTER TABLE public."wardrobe_items" ADD CONSTRAINT "wardrobe_items_fit_check" CHECK (fit = ANY (ARRAY['slim'::text, 'regular'::text, 'loose'::text, 'oversized'::text, 'tailored'::text]));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."wardrobe_items" ADD CONSTRAINT "wardrobe_items_item_affinity_check" CHECK (item_affinity >= 0.7::double precision AND item_affinity <= 1.3::double precision);
-- ORIGIN: supabase/migrations/20260929000000_wardrobe_garment_metadata.sql
ALTER TABLE public."wardrobe_items" ADD CONSTRAINT "wardrobe_items_pattern_check" CHECK (pattern = ANY (ARRAY['solid'::text, 'stripe'::text, 'floral'::text, 'check'::text, 'print'::text, 'wax-print'::text, 'color-block'::text, 'geometric'::text, 'animal'::text]));
-- ORIGIN: supabase/migrations/20260929000000_wardrobe_garment_metadata.sql
ALTER TABLE public."wardrobe_items" ADD CONSTRAINT "wardrobe_items_pattern_scale_check" CHECK (pattern_scale = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text]));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."wardrobe_items" ADD CONSTRAINT "wardrobe_items_pkey" PRIMARY KEY (id);
-- ORIGIN: supabase/migrations/20261012000000_canonical_wardrobe_semantics.sql
ALTER TABLE public."wardrobe_items" ADD CONSTRAINT "wardrobe_items_recommendation_semantics_check" CHECK (valid_wardrobe_recommendation_semantics(recommendation_semantics));
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."wardrobe_items" ADD CONSTRAINT "wardrobe_items_user_id_id_key" UNIQUE (user_id, id);
-- ORIGIN: supabase/migrations/20261019000000_durable_wardrobe_photo_cleanup.sql
ALTER TABLE public."wardrobe_photo_cleanup_receipts" ADD CONSTRAINT "wardrobe_photo_cleanup_receipts_pkey" PRIMARY KEY (id);
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."wear_logs" ADD CONSTRAINT "wear_logs_pkey" PRIMARY KEY (id);

-- Standalone indexes; constraint-backed indexes are created with their constraints.
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE INDEX billing_event_journal_pending_idx ON public.billing_event_journal USING btree (received_at) WHERE (status = 'pending'::text);
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
CREATE INDEX billing_subscriptions_user_active_idx ON public.billing_subscriptions USING btree (user_id, expires_at) WHERE is_active;
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE INDEX garment_group_members_garment_id_idx ON public.garment_group_members USING btree (garment_id);
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE INDEX garment_group_members_user_id_idx ON public.garment_group_members USING btree (user_id);
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE INDEX garment_groups_user_id_idx ON public.garment_groups USING btree (user_id);
-- ORIGIN: supabase/migrations/20260928000000_free_wardrobe_selection.sql
CREATE INDEX wardrobe_items_user_created_id_desc_idx ON public.wardrobe_items USING btree (user_id, created_at DESC, id DESC);
-- ORIGIN: supabase/migrations/20261019000000_durable_wardrobe_photo_cleanup.sql
CREATE INDEX wardrobe_photo_cleanup_receipts_owner_created_idx ON public.wardrobe_photo_cleanup_receipts USING btree (user_id, created_at);

-- Foreign keys are created after standalone unique indexes they may reference.
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."affinity_signals" ADD CONSTRAINT "affinity_signals_item_id_fkey" FOREIGN KEY (item_id) REFERENCES wardrobe_items(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."affinity_signals" ADD CONSTRAINT "affinity_signals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_group_members" ADD CONSTRAINT "garment_group_members_garment_owner_fkey" FOREIGN KEY (user_id, garment_id) REFERENCES wardrobe_items(user_id, id) ON DELETE CASCADE;
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_group_members" ADD CONSTRAINT "garment_group_members_group_owner_fkey" FOREIGN KEY (user_id, group_id) REFERENCES garment_groups(user_id, id) ON DELETE CASCADE;
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
ALTER TABLE public."garment_groups" ADD CONSTRAINT "garment_groups_user_id_fkey" FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."pair_affinity_signals" ADD CONSTRAINT "pair_affinity_signals_item_id_a_fkey" FOREIGN KEY (item_id_a) REFERENCES wardrobe_items(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."pair_affinity_signals" ADD CONSTRAINT "pair_affinity_signals_item_id_b_fkey" FOREIGN KEY (item_id_b) REFERENCES wardrobe_items(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."pair_affinity_signals" ADD CONSTRAINT "pair_affinity_signals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."rotation_cursors" ADD CONSTRAINT "rotation_cursors_user_id_fkey" FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."saved_looks" ADD CONSTRAINT "saved_looks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."slot_statuses" ADD CONSTRAINT "slot_statuses_matched_item_id_fkey" FOREIGN KEY (matched_item_id) REFERENCES wardrobe_items(id) ON DELETE SET NULL;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."slot_statuses" ADD CONSTRAINT "slot_statuses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."tryon_profiles" ADD CONSTRAINT "tryon_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."user_profiles" ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- ORIGIN: supabase/migrations/20260928000000_free_wardrobe_selection.sql
ALTER TABLE public."wardrobe_free_selections" ADD CONSTRAINT "wardrobe_free_selections_item_owner_fkey" FOREIGN KEY (user_id, item_id) REFERENCES wardrobe_items(user_id, id) ON DELETE CASCADE;
-- ORIGIN: supabase/migrations/20260928000000_free_wardrobe_selection.sql
ALTER TABLE public."wardrobe_free_selections" ADD CONSTRAINT "wardrobe_free_selections_user_id_fkey" FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."wardrobe_items" ADD CONSTRAINT "wardrobe_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
-- ORIGIN: supabase/migrations/20261019000000_durable_wardrobe_photo_cleanup.sql
ALTER TABLE public."wardrobe_photo_cleanup_receipts" ADD CONSTRAINT "wardrobe_photo_cleanup_receipts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
ALTER TABLE public."wear_logs" ADD CONSTRAINT "wear_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

-- Table ownership, RLS flags and policies
ALTER TABLE public."affinity_signals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."affinity_signals" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own affinity" ON public."affinity_signals"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own affinity signals" ON public."affinity_signals"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own affinity" ON public."affinity_signals"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own affinity signals" ON public."affinity_signals"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can read own affinity signals" ON public."affinity_signals"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can view own affinity" ON public."affinity_signals"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own affinity signals" ON public."affinity_signals"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));
ALTER TABLE public."bg_removal_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bg_removal_cache" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."bg_removal_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bg_removal_usage" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."billing_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_accounts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."billing_deletion_tombstones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_deletion_tombstones" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."billing_event_journal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_event_journal" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."billing_reconciliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_reconciliations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."billing_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_subscriptions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."billing_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_transactions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."garment_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."garment_group_members" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE POLICY "Users can delete own garment group members" ON public."garment_group_members"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE POLICY "Users can insert own garment group members" ON public."garment_group_members"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE POLICY "Users can read own garment group members" ON public."garment_group_members"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE POLICY "Users can update own garment group members" ON public."garment_group_members"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
ALTER TABLE public."garment_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."garment_groups" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE POLICY "Users can delete own garment groups" ON public."garment_groups"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE POLICY "Users can insert own garment groups" ON public."garment_groups"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE POLICY "Users can read own garment groups" ON public."garment_groups"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE POLICY "Users can update own garment groups" ON public."garment_groups"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
ALTER TABLE public."lockout_store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."lockout_store" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."pair_affinity_signals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pair_affinity_signals" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own pair affinity" ON public."pair_affinity_signals"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own pair affinity signals" ON public."pair_affinity_signals"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own pair affinity" ON public."pair_affinity_signals"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own pair affinity signals" ON public."pair_affinity_signals"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can read own pair affinity signals" ON public."pair_affinity_signals"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can view own pair affinity" ON public."pair_affinity_signals"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own pair affinity signals" ON public."pair_affinity_signals"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));
ALTER TABLE public."ratelimit_store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ratelimit_store" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."rotation_cursors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rotation_cursors" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own rotation" ON public."rotation_cursors"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own rotation cursors" ON public."rotation_cursors"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own rotation" ON public."rotation_cursors"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own rotation cursors" ON public."rotation_cursors"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can read own rotation cursors" ON public."rotation_cursors"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can update own rotation" ON public."rotation_cursors"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can update own rotation cursors" ON public."rotation_cursors"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can view own rotation" ON public."rotation_cursors"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own rotation cursors" ON public."rotation_cursors"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));
ALTER TABLE public."saved_looks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."saved_looks" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own saved looks" ON public."saved_looks"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own saved looks" ON public."saved_looks"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can read own saved looks" ON public."saved_looks"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can update own saved looks" ON public."saved_looks"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can view own saved looks" ON public."saved_looks"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
ALTER TABLE public."slot_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."slot_statuses" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own slot statuses" ON public."slot_statuses"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can delete own slots" ON public."slot_statuses"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own slot statuses" ON public."slot_statuses"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can insert own slots" ON public."slot_statuses"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can read own slot statuses" ON public."slot_statuses"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can update own slot statuses" ON public."slot_statuses"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can update own slots" ON public."slot_statuses"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can view own slots" ON public."slot_statuses"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own slot statuses" ON public."slot_statuses"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));
ALTER TABLE public."tryon_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tryon_profiles" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own tryon" ON public."tryon_profiles"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own tryon profiles" ON public."tryon_profiles"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own tryon" ON public."tryon_profiles"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own tryon profiles" ON public."tryon_profiles"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can read own tryon profiles" ON public."tryon_profiles"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can update own tryon" ON public."tryon_profiles"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can update own tryon profiles" ON public."tryon_profiles"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can view own tryon" ON public."tryon_profiles"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own tryon profiles" ON public."tryon_profiles"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));
ALTER TABLE public."user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_profiles" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can delete own profile" ON public."user_profiles"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = id));
-- ORIGIN: supabase/migrations/20260610000000_user_profiles_rls.sql
CREATE POLICY "Users can insert own profile" ON public."user_profiles"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = id));
-- ORIGIN: supabase/migrations/20260610000000_user_profiles_rls.sql
CREATE POLICY "Users can update own profile" ON public."user_profiles"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can view own profile" ON public."user_profiles"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own profile" ON public."user_profiles"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = id));
ALTER TABLE public."wardrobe_free_selections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wardrobe_free_selections" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260928000000_free_wardrobe_selection.sql
CREATE POLICY "Users can read own free wardrobe selections" ON public."wardrobe_free_selections"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
ALTER TABLE public."wardrobe_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wardrobe_items" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own wardrobe items" ON public."wardrobe_items"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
ALTER TABLE public."wardrobe_photo_cleanup_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wardrobe_photo_cleanup_receipts" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20261019000000_durable_wardrobe_photo_cleanup.sql
CREATE POLICY "Users can read own wardrobe photo cleanup receipts" ON public."wardrobe_photo_cleanup_receipts"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
ALTER TABLE public."wear_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wear_logs" NO FORCE ROW LEVEL SECURITY;
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can delete own wear logs" ON public."wear_logs"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can insert own wear logs" ON public."wear_logs"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "Users can read own wear logs" ON public."wear_logs"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can update own wear logs" ON public."wear_logs"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users can view own wear logs" ON public."wear_logs"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own wear logs" ON public."wear_logs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

-- Public table and column ACLs. Revoke captured-principal grants first, then restore captured grants.
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."affinity_signals" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."affinity_signals" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."affinity_signals" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."affinity_signals" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."affinity_signals" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."affinity_signals" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."bg_removal_cache" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."bg_removal_cache" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."bg_removal_cache" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."bg_removal_cache" FROM "service_role";
GRANT DELETE, INSERT, SELECT ON TABLE public."bg_removal_cache" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."bg_removal_usage" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."bg_removal_usage" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."bg_removal_usage" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."bg_removal_usage" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."bg_removal_usage" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."billing_accounts" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."billing_accounts" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."billing_accounts" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."billing_accounts" FROM "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."billing_accounts" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."billing_deletion_tombstones" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."billing_deletion_tombstones" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."billing_deletion_tombstones" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."billing_deletion_tombstones" FROM "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."billing_deletion_tombstones" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."billing_event_journal" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."billing_event_journal" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."billing_event_journal" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."billing_event_journal" FROM "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."billing_event_journal" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."billing_reconciliations" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."billing_reconciliations" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."billing_reconciliations" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."billing_reconciliations" FROM "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."billing_reconciliations" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."billing_subscriptions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."billing_subscriptions" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."billing_subscriptions" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."billing_subscriptions" FROM "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."billing_subscriptions" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."billing_transactions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."billing_transactions" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."billing_transactions" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."billing_transactions" FROM "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."billing_transactions" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."garment_group_members" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."garment_group_members" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."garment_group_members" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."garment_group_members" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."garment_group_members" TO "authenticated";
GRANT DELETE, SELECT ON TABLE public."garment_group_members" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."garment_groups" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."garment_groups" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."garment_groups" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."garment_groups" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."garment_groups" TO "authenticated";
GRANT DELETE, SELECT ON TABLE public."garment_groups" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."lockout_store" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."lockout_store" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."lockout_store" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."lockout_store" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."lockout_store" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."pair_affinity_signals" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."pair_affinity_signals" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."pair_affinity_signals" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."pair_affinity_signals" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."pair_affinity_signals" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."pair_affinity_signals" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."ratelimit_store" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."ratelimit_store" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."ratelimit_store" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."ratelimit_store" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."ratelimit_store" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."rotation_cursors" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."rotation_cursors" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."rotation_cursors" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."rotation_cursors" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."rotation_cursors" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."rotation_cursors" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."saved_looks" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."saved_looks" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."saved_looks" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."saved_looks" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."saved_looks" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."saved_looks" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."slot_statuses" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."slot_statuses" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."slot_statuses" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."slot_statuses" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."slot_statuses" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."slot_statuses" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."tryon_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."tryon_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."tryon_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."tryon_profiles" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."tryon_profiles" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."tryon_profiles" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."user_profiles" FROM "service_role";
GRANT SELECT ON TABLE public."user_profiles" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_profiles" TO "service_role";
REVOKE ALL PRIVILEGES ("body_type") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("body_type") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("body_type") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("body_type") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("body_type") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("body_type") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("constraints") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("constraints") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("constraints") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("constraints") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("constraints") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("constraints") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("eye_color") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("eye_color") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("eye_color") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("eye_color") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("eye_color") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("eye_color") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("id") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("id") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("id") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("id") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("id") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("id") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("is_guest") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("is_guest") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("is_guest") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("is_guest") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("is_guest") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("is_guest") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("lifestyle") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("lifestyle") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("lifestyle") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("lifestyle") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("lifestyle") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("lifestyle") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("location_lat") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("location_lat") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("location_lat") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("location_lat") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("location_lat") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("location_lat") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("location_lon") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("location_lon") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("location_lon") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("location_lon") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("location_lon") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("location_lon") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("name") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("name") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("name") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("name") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("name") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("name") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("onboarding_complete") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("onboarding_complete") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("onboarding_complete") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("onboarding_complete") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("onboarding_complete") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("onboarding_complete") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("secondary_goal") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("secondary_goal") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("secondary_goal") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("secondary_goal") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("secondary_goal") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("secondary_goal") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("skin_tone") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("skin_tone") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("skin_tone") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("skin_tone") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("skin_tone") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("skin_tone") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("style_goals") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("style_goals") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("style_goals") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("style_goals") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("style_goals") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("style_goals") ON TABLE public."user_profiles" TO "authenticated";
REVOKE ALL PRIVILEGES ("undertone") ON TABLE public."user_profiles" FROM PUBLIC;
REVOKE ALL PRIVILEGES ("undertone") ON TABLE public."user_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ("undertone") ON TABLE public."user_profiles" FROM "authenticated";
REVOKE ALL PRIVILEGES ("undertone") ON TABLE public."user_profiles" FROM "service_role";
GRANT INSERT ("undertone") ON TABLE public."user_profiles" TO "authenticated";
GRANT UPDATE ("undertone") ON TABLE public."user_profiles" TO "authenticated";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_free_selections" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_free_selections" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_free_selections" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_free_selections" FROM "service_role";
GRANT SELECT ON TABLE public."wardrobe_free_selections" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."wardrobe_free_selections" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_items" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_items" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_items" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_items" FROM "service_role";
GRANT DELETE, SELECT, UPDATE ON TABLE public."wardrobe_items" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."wardrobe_items" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_photo_cleanup_receipts" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_photo_cleanup_receipts" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_photo_cleanup_receipts" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."wardrobe_photo_cleanup_receipts" FROM "service_role";
GRANT SELECT ON TABLE public."wardrobe_photo_cleanup_receipts" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."wardrobe_photo_cleanup_receipts" TO "service_role";
-- ORIGIN: live ACL state; exact source migration not established
REVOKE ALL PRIVILEGES ON TABLE public."wear_logs" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public."wear_logs" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE public."wear_logs" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE public."wear_logs" FROM "service_role";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."wear_logs" TO "authenticated";
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."wear_logs" TO "service_role";

-- Public sequence settings and ACLs (identity sequences are created by their IDENTITY columns).
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER SEQUENCE public."billing_subscriptions_id_seq" OWNER TO "postgres";
REVOKE ALL PRIVILEGES ON SEQUENCE public."billing_subscriptions_id_seq" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE public."billing_subscriptions_id_seq" FROM "anon";
REVOKE ALL PRIVILEGES ON SEQUENCE public."billing_subscriptions_id_seq" FROM "authenticated";
REVOKE ALL PRIVILEGES ON SEQUENCE public."billing_subscriptions_id_seq" FROM "service_role";
GRANT SELECT ON SEQUENCE public."billing_subscriptions_id_seq" TO "service_role";
GRANT USAGE ON SEQUENCE public."billing_subscriptions_id_seq" TO "service_role";
-- ORIGIN: supabase/migrations/20260930000000_revenuecat_billing.sql
ALTER SEQUENCE public."billing_transactions_id_seq" OWNER TO "postgres";
REVOKE ALL PRIVILEGES ON SEQUENCE public."billing_transactions_id_seq" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE public."billing_transactions_id_seq" FROM "anon";
REVOKE ALL PRIVILEGES ON SEQUENCE public."billing_transactions_id_seq" FROM "authenticated";
REVOKE ALL PRIVILEGES ON SEQUENCE public."billing_transactions_id_seq" FROM "service_role";
GRANT SELECT ON SEQUENCE public."billing_transactions_id_seq" TO "service_role";
GRANT USAGE ON SEQUENCE public."billing_transactions_id_seq" TO "service_role";

-- Public schema ACL
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM "anon";
REVOKE ALL PRIVILEGES ON SCHEMA public FROM "authenticated";
REVOKE ALL PRIVILEGES ON SCHEMA public FROM "service_role";
-- ORIGIN: Supabase/platform or role-level default configuration; no repo migration source
GRANT USAGE ON SCHEMA public TO PUBLIC;
-- ORIGIN: Supabase/platform or role-level default configuration; no repo migration source
GRANT USAGE ON SCHEMA public TO "anon";
-- ORIGIN: Supabase/platform or role-level default configuration; no repo migration source
GRANT USAGE ON SCHEMA public TO "authenticated";
-- ORIGIN: Supabase/platform or role-level default configuration; no repo migration source
GRANT USAGE ON SCHEMA public TO "service_role";

-- Schema-scoped default ACLs for captured creator roles.
-- Captured defaults for creator role postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated", "postgres", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT DELETE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT INSERT ON TABLES TO "postgres";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "postgres";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT REFERENCES ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT SELECT ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT TRIGGER ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT UPDATE ON TABLES TO "postgres";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "service_role";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT REFERENCES ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT TRIGGER ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated", "postgres", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT SELECT ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated", "postgres", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "postgres";
-- Captured defaults for creator role supabase_admin.
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated", "postgres", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT DELETE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT ON TABLES TO "anon";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "anon";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT REFERENCES ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRIGGER ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT DELETE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT ON TABLES TO "authenticated";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "authenticated";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT REFERENCES ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRIGGER ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT DELETE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT ON TABLES TO "postgres";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "postgres";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT REFERENCES ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRIGGER ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT DELETE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT ON TABLES TO "service_role";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT MAINTAIN ON TABLES TO "service_role";';
  END IF;
END
$baseline$;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT REFERENCES ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRIGGER ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT TRUNCATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated", "postgres", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated", "postgres", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "service_role";

-- Supabase Storage prerequisite: storage schema, storage.objects and storage.buckets are platform-managed.
-- Bucket rows are captured app configuration and are inserted/upserted here.
-- ORIGIN: MANUAL/UNKNOWN — bucket configuration was not found in reviewed repo migrations.
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types, type, versioning_status, lifecycle_configuration) VALUES ('tryon-photos', 'tryon-photos', false, false, NULL, NULL, storage.buckettype'STANDARD', 'DISABLED', NULL) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = EXCLUDED.public, avif_autodetection = EXCLUDED.avif_autodetection, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types, type = EXCLUDED.type, versioning_status = EXCLUDED.versioning_status, lifecycle_configuration = EXCLUDED.lifecycle_configuration;
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types, type, versioning_status, lifecycle_configuration) VALUES ('wardrobe-images', 'wardrobe-images', false, false, NULL, NULL, storage.buckettype'STANDARD', 'DISABLED', NULL) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = EXCLUDED.public, avif_autodetection = EXCLUDED.avif_autodetection, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types, type = EXCLUDED.type, versioning_status = EXCLUDED.versioning_status, lifecycle_configuration = EXCLUDED.lifecycle_configuration;

-- Storage schema ACL and storage.objects ACL (platform-managed relations are not created here).
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM "anon";
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM "authenticated";
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM "service_role";
-- ORIGIN: Supabase-managed (grantor supabase_admin)
GRANT USAGE ON SCHEMA storage TO "anon";
-- ORIGIN: Supabase-managed (grantor supabase_admin)
GRANT USAGE ON SCHEMA storage TO "authenticated";
-- ORIGIN: Supabase-managed (grantor supabase_admin)
GRANT USAGE ON SCHEMA storage TO "service_role";
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM "service_role";
GRANT DELETE ON TABLE storage.objects TO "anon";
GRANT INSERT ON TABLE storage.objects TO "anon";
GRANT SELECT ON TABLE storage.objects TO "anon";
GRANT UPDATE ON TABLE storage.objects TO "anon";
GRANT DELETE ON TABLE storage.objects TO "authenticated";
GRANT INSERT ON TABLE storage.objects TO "authenticated";
GRANT SELECT ON TABLE storage.objects TO "authenticated";
GRANT UPDATE ON TABLE storage.objects TO "authenticated";
GRANT DELETE ON TABLE storage.objects TO "service_role";
GRANT INSERT ON TABLE storage.objects TO "service_role";
DO $baseline$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'GRANT MAINTAIN ON TABLE storage.objects TO "service_role";';
  END IF;
END
$baseline$;
GRANT REFERENCES ON TABLE storage.objects TO "service_role";
GRANT SELECT ON TABLE storage.objects TO "service_role";
GRANT TRIGGER ON TABLE storage.objects TO "service_role";
GRANT TRUNCATE ON TABLE storage.objects TO "service_role";
GRANT UPDATE ON TABLE storage.objects TO "service_role";

-- Storage object policies; storage.objects and auth.uid() must already exist.
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Delete own tryon photos" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'tryon-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Delete own wardrobe images" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'wardrobe-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Read own tryon photos" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'tryon-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Read own wardrobe images" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'wardrobe-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Upload own tryon photos" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'tryon-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Upload own wardrobe images" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'wardrobe-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own tryon photos" ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (((bucket_id = 'tryon-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE POLICY "Users manage own wardrobe images" ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (((bucket_id = 'wardrobe-images'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "tryon-photos delete own" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'tryon-photos'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[1])));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "tryon-photos insert own" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'tryon-photos'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[1])));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "tryon-photos select own" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'tryon-photos'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[1])));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "wardrobe-images delete own" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'wardrobe-images'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[1])));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "wardrobe-images insert own" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'wardrobe-images'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[1])));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "wardrobe-images select own" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'wardrobe-images'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[1])));
-- ORIGIN: supabase/migrations/20260814000000_rls_all_tables.sql
CREATE POLICY "wardrobe-images update own" ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'wardrobe-images'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[1])));

-- Public table triggers
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE TRIGGER garment_group_members_delete_empty_group AFTER DELETE ON garment_group_members FOR EACH ROW EXECUTE FUNCTION delete_empty_garment_group();
-- ORIGIN: supabase/migrations/20260918000000_garment_groups.sql
CREATE TRIGGER garment_groups_set_updated_at BEFORE UPDATE ON garment_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TRIGGER trg_rotation_cursors_updated_at BEFORE UPDATE ON rotation_cursors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TRIGGER trg_slot_statuses_updated_at BEFORE UPDATE ON slot_statuses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE TRIGGER trg_wardrobe_items_updated_at BEFORE UPDATE ON wardrobe_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- ORIGIN: supabase/migrations/20261019000000_durable_wardrobe_photo_cleanup.sql
CREATE TRIGGER wardrobe_photo_cleanup_receipt_after_delete AFTER DELETE ON wardrobe_items FOR EACH ROW EXECUTE FUNCTION record_wardrobe_photo_cleanup();

-- Manual/unknown event trigger; Supabase-managed event triggers are listed but not recreated.
-- ORIGIN: MANUAL/UNKNOWN — manual/unknown
CREATE EVENT TRIGGER "ensure_rls" ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable() WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO');
-- Skipped Supabase-managed event triggers: issue_graphql_placeholder, issue_pg_cron_access, issue_pg_graphql_access, issue_pg_net_access, pgrst_ddl_watch, pgrst_drop_watch

-- Other skipped Supabase-managed objects recorded in the snapshot:
-- auth.users, storage.objects, storage.buckets relation definitions and storage.objects triggers.
-- Non-public Supabase-managed function definitions and platform schema internals are not in this baseline.
-- Public views/materialized views and public custom types: none captured.
