-- Per-garment recommendation inputs. Legacy rows remain NULL; no backfill.
ALTER TABLE public.wardrobe_items
  ADD COLUMN fabric text
    CONSTRAINT wardrobe_items_fabric_check
    CHECK (fabric IN (
      'cotton', 'silk', 'denim', 'wool', 'linen', 'lace', 'synthetic',
      'leather', 'knit', 'satin', 'cashmere', 'suede', 'velvet', 'tweed',
      'chiffon', 'jersey', 'corduroy'
    )),
  ADD COLUMN fit text
    CONSTRAINT wardrobe_items_fit_check
    CHECK (fit IN ('slim', 'regular', 'loose', 'oversized', 'tailored')),
  ADD COLUMN pattern text
    CONSTRAINT wardrobe_items_pattern_check
    CHECK (pattern IN (
      'solid', 'stripe', 'floral', 'check', 'print', 'wax-print',
      'color-block', 'geometric', 'animal'
    )),
  ADD COLUMN pattern_scale text
    CONSTRAINT wardrobe_items_pattern_scale_check
    CHECK (pattern_scale IN ('small', 'medium', 'large'));

-- B2.8 uses the authenticated RPC for inserts. Never grant table/column INSERT.
REVOKE INSERT (fabric, fit, pattern, pattern_scale)
  ON public.wardrobe_items FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.insert_wardrobe_items(p_items jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
    SELECT 1
    FROM jsonb_array_elements(p_items) AS entry(value)
    WHERE jsonb_typeof(entry.value) IS DISTINCT FROM 'object'
       OR entry.value - ARRAY[
         'id', 'user_id', 'garment_type', 'sub_type', 'color_family',
         'description', 'occasion', 'image_url', 'cleaned_image_url',
         'fabric', 'fit', 'pattern', 'pattern_scale'
       ] <> '{}'::jsonb
       OR jsonb_typeof(entry.value -> 'garment_type') IS DISTINCT FROM 'string'
       OR (
         entry.value ? 'user_id'
         AND entry.value ->> 'user_id' IS DISTINCT FROM v_user_id::text
       )
       OR (
         entry.value ? 'id'
         AND jsonb_typeof(entry.value -> 'id') NOT IN ('string', 'null')
       )
       OR EXISTS (
         SELECT 1
         FROM unnest(ARRAY[
           'sub_type', 'color_family', 'description', 'image_url',
           'cleaned_image_url', 'fabric', 'fit', 'pattern', 'pattern_scale'
         ]) AS field(name)
         WHERE entry.value ? field.name
           AND jsonb_typeof(entry.value -> field.name) NOT IN ('string', 'null')
       )
       OR (
         entry.value ? 'occasion'
         AND jsonb_typeof(entry.value -> 'occasion') NOT IN ('array', 'null')
       )
       OR (
         jsonb_typeof(entry.value -> 'occasion') = 'array'
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements(entry.value -> 'occasion') AS occasion(value)
           WHERE jsonb_typeof(occasion.value) IS DISTINCT FROM 'string'
         )
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid wardrobe item fields';
  END IF;

  v_item_count := jsonb_array_length(p_items);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT coalesce(
    profiles.premium IS TRUE AND profiles.premium_expires_at > now(),
    false
  )
  INTO v_is_premium
  FROM public.user_profiles AS profiles
  WHERE profiles.id = v_user_id;

  SELECT count(*) INTO v_total_count
  FROM public.wardrobe_items
  WHERE user_id = v_user_id;

  IF v_is_premium THEN
    IF v_total_count + v_item_count > 2000 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WARDROBE_CAPACITY_REACHED';
    END IF;
  ELSE
    SELECT count(*) INTO v_selected_count
    FROM public.wardrobe_free_selections
    WHERE user_id = v_user_id;
    IF v_selected_count + v_item_count > 30 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WARDROBE_CAPACITY_REACHED';
    END IF;
  END IF;

  WITH normalized AS MATERIALIZED (
    SELECT
      entry.ordinality,
      coalesce(item.id, gen_random_uuid()) AS id,
      item.garment_type,
      item.sub_type,
      item.color_family,
      item.description,
      item.occasion,
      item.image_url,
      item.cleaned_image_url,
      item.fabric,
      item.fit,
      item.pattern,
      item.pattern_scale
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS entry(value, ordinality)
    CROSS JOIN LATERAL jsonb_to_record(entry.value) AS item(
      id uuid,
      garment_type text,
      sub_type text,
      color_family text,
      description text,
      occasion text[],
      image_url text,
      cleaned_image_url text,
      fabric text,
      fit text,
      pattern text,
      pattern_scale text
    )
  ),
  inserted AS (
    INSERT INTO public.wardrobe_items (
      id, user_id, garment_type, sub_type, color_family, description,
      occasion, image_url, cleaned_image_url, fabric, fit, pattern, pattern_scale
    )
    SELECT
      normalized.id, v_user_id, normalized.garment_type, normalized.sub_type,
      normalized.color_family, normalized.description, normalized.occasion,
      normalized.image_url, normalized.cleaned_image_url,
      normalized.fabric, normalized.fit, normalized.pattern, normalized.pattern_scale
    FROM normalized
    ORDER BY normalized.ordinality
    RETURNING id
  )
  SELECT coalesce(
    array_agg(normalized.id ORDER BY normalized.ordinality),
    ARRAY[]::uuid[]
  )
  INTO v_ids
  FROM normalized
  JOIN inserted USING (id);

  IF NOT v_is_premium AND cardinality(v_ids) > 0 THEN
    INSERT INTO public.wardrobe_free_selections (user_id, item_id)
    SELECT v_user_id, unnest(v_ids);
  END IF;

  RETURN v_ids;
END;
$$;