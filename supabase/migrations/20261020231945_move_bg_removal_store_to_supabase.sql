BEGIN;

CREATE TABLE public.bg_removal_cache (
  image_hash text PRIMARY KEY,
  result_b64 text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.bg_removal_usage (
  user_id uuid PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz DEFAULT now()
);

ALTER TABLE public.bg_removal_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bg_removal_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.bg_removal_cache,
  public.bg_removal_usage
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, DELETE
ON TABLE public.bg_removal_cache
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.bg_removal_usage
TO service_role;

CREATE FUNCTION public.bg_removal_increment_usage(p_user_id uuid)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  INSERT INTO public.bg_removal_usage (user_id, count, last_used_at)
  VALUES (p_user_id, 1, pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE
    SET count = public.bg_removal_usage.count + 1,
        last_used_at = pg_catalog.now()
  RETURNING count;
$function$;

CREATE FUNCTION public.bg_removal_reset_usage(p_user_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  INSERT INTO public.bg_removal_usage (user_id, count, last_used_at)
  VALUES (p_user_id, 0, pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE
    SET count = 0,
        last_used_at = pg_catalog.now();
$function$;

REVOKE ALL ON FUNCTION
  public.bg_removal_increment_usage(uuid),
  public.bg_removal_reset_usage(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.bg_removal_increment_usage(uuid),
  public.bg_removal_reset_usage(uuid)
TO service_role;

COMMIT;
