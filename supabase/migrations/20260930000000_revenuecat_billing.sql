-- RevenueCat server-authoritative billing journal and projections.
-- No client role can read or mutate billing records or call the writer RPCs.

CREATE TABLE public.billing_accounts (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  last_snapshot_at timestamptz
);

CREATE TABLE public.billing_event_journal (
  event_id text PRIMARY KEY,
  user_id uuid,
  event_type text NOT NULL,
  store text,
  product_id text,
  entitlement_id text,
  transaction_id text,
  original_transaction_id text,
  purchased_at timestamptz,
  expires_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT false,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'ignored')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX billing_event_journal_pending_idx
  ON public.billing_event_journal (received_at) WHERE status = 'pending';

CREATE TABLE public.billing_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  store text NOT NULL CHECK (store IN ('APPLE', 'GOOGLE')),
  product_id text NOT NULL,
  entitlement_id text NOT NULL,
  original_transaction_id text NOT NULL,
  transaction_id text,
  purchased_at timestamptz,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  snapshot_deactivated boolean NOT NULL DEFAULT false,
  last_event_id text,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  last_webhook_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store, original_transaction_id)
);
CREATE INDEX billing_subscriptions_user_active_idx
  ON public.billing_subscriptions (user_id, expires_at)
  WHERE is_active;

CREATE TABLE public.billing_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  store text NOT NULL CHECK (store IN ('APPLE', 'GOOGLE')),
  transaction_id text NOT NULL,
  original_transaction_id text,
  product_id text NOT NULL,
  purchased_at timestamptz,
  event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store, transaction_id)
);

CREATE TABLE public.billing_reconciliations (
  user_id uuid PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('webhook', 'customer_api', 'deletion')),
  event_id text,
  is_premium boolean NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.billing_deletion_tombstones (
  user_id uuid PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'account_deletion'
);

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_event_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_deletion_tombstones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_accounts, public.billing_event_journal,
  public.billing_subscriptions, public.billing_transactions,
  public.billing_reconciliations, public.billing_deletion_tombstones
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_accounts,
  public.billing_event_journal, public.billing_subscriptions,
  public.billing_transactions, public.billing_reconciliations,
  public.billing_deletion_tombstones TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.billing_subscriptions_id_seq,
  public.billing_transactions_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.billing_journal_revenuecat_event(
  p_event_id text, p_user_id uuid, p_event_type text, p_store text,
  p_product_id text, p_entitlement_id text, p_transaction_id text,
  p_original_transaction_id text, p_purchased_at timestamptz,
  p_expires_at timestamptz, p_occurred_at timestamptz, p_active boolean,
  p_payload_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.billing_journal_ignored_revenuecat_event(
  p_event_id text, p_event_type text, p_payload_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.billing_process_revenuecat_event(p_event_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.billing_reconcile_entitlement(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.billing_reconcile_revenuecat_snapshot(
  p_user_id uuid, p_event_id text, p_payload_hash text,
  p_provider_entitlement_active boolean, p_provider_product_id text,
  p_provider_store text, p_provider_expires_at timestamptz,
  p_fetch_started_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.billing_tombstone_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.billing_readiness_check()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

REVOKE ALL ON FUNCTION public.billing_journal_revenuecat_event(
  text, uuid, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, boolean, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_process_revenuecat_event(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_journal_ignored_revenuecat_event(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_reconcile_entitlement(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_reconcile_revenuecat_snapshot(
  uuid, text, text, boolean, text, text, timestamptz, timestamptz
)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_tombstone_account(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_readiness_check()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_journal_revenuecat_event(
  text, uuid, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, boolean, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_process_revenuecat_event(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_journal_ignored_revenuecat_event(text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_reconcile_entitlement(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_reconcile_revenuecat_snapshot(
  uuid, text, text, boolean, text, text, timestamptz, timestamptz
)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_tombstone_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_readiness_check() TO service_role;