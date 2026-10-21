BEGIN;

CREATE TABLE public.ratelimit_store (
  key text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 0,
  reset_time timestamptz NOT NULL
);

CREATE TABLE public.lockout_store (
  key text PRIMARY KEY,
  value text,
  expires bigint
);

ALTER TABLE public.ratelimit_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lockout_store ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ratelimit_store, public.lockout_store
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ratelimit_store TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lockout_store TO service_role;

CREATE FUNCTION public.ratelimit_increment(p_key text, p_window_ms bigint)
RETURNS TABLE(hits integer, reset_time_ms bigint)
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
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
$function$;

CREATE FUNCTION public.ratelimit_decrement(p_key text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  UPDATE public.ratelimit_store
  SET hits = CASE WHEN hits > 1 THEN hits - 1 ELSE 0 END
  WHERE key = p_key
    AND reset_time > pg_catalog.now();
$function$;

CREATE FUNCTION public.ratelimit_delete_key(p_key text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  DELETE FROM public.ratelimit_store
  WHERE key = p_key;
$function$;

CREATE FUNCTION public.ratelimit_delete_prefix(p_prefix text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  DELETE FROM public.ratelimit_store
  WHERE p_prefix IS NOT NULL AND p_prefix <> ''
    AND pg_catalog.starts_with(key, p_prefix);
$function$;

REVOKE ALL ON FUNCTION
  public.ratelimit_increment(text, bigint),
  public.ratelimit_decrement(text),
  public.ratelimit_delete_key(text),
  public.ratelimit_delete_prefix(text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ratelimit_increment(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.ratelimit_decrement(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ratelimit_delete_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ratelimit_delete_prefix(text) TO service_role;

COMMIT;
