-- Free accounts can keep a selected wardrobe of up to 30 items. Larger
-- existing Free wardrobes are intentionally left unselected for user choice.

CREATE TABLE public.wardrobe_free_selections (
  user_id uuid NOT NULL
    REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  PRIMARY KEY (user_id, item_id),
  CONSTRAINT wardrobe_free_selections_item_owner_fkey
    FOREIGN KEY (user_id, item_id)
    REFERENCES public.wardrobe_items(user_id, id)
    ON DELETE CASCADE
);

ALTER TABLE public.wardrobe_free_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own free wardrobe selections"
  ON public.wardrobe_free_selections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL PRIVILEGES
  ON TABLE public.wardrobe_free_selections
  FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.wardrobe_free_selections
  FROM authenticated;
GRANT SELECT ON TABLE public.wardrobe_free_selections TO authenticated;

-- Only backfill Free wardrobes that fit in full. Larger wardrobes must be
-- explicitly selected by their owner rather than silently truncated.
INSERT INTO public.wardrobe_free_selections (user_id, item_id)
SELECT items.user_id, items.id
FROM public.wardrobe_items AS items
JOIN (
  SELECT user_id
  FROM public.wardrobe_items
  GROUP BY user_id
  HAVING count(*) <= 30
) AS small_wardrobes USING (user_id)
LEFT JOIN public.user_profiles AS profiles ON profiles.id = items.user_id
WHERE NOT coalesce(
  profiles.premium IS TRUE
    AND profiles.premium_expires_at > now(),
  false
);

CREATE INDEX wardrobe_items_user_created_id_desc_idx
  ON public.wardrobe_items (user_id, created_at DESC, id DESC);

REVOKE INSERT ON TABLE public.wardrobe_items FROM authenticated, anon, PUBLIC;

-- Table-level revokes do not remove column-level INSERT grants. Revoke every
-- current wardrobe_items column explicitly as well.
DO $$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
  INTO v_columns
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.wardrobe_items'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  EXECUTE format(
    'REVOKE INSERT (%s) ON TABLE public.wardrobe_items FROM authenticated, anon, PUBLIC',
    v_columns
  );
END
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.wardrobe_items', 'INSERT')
     OR has_column_privilege('authenticated', 'public.wardrobe_items', 'id', 'INSERT')
     OR has_column_privilege('authenticated', 'public.wardrobe_items', 'user_id', 'INSERT')
     OR has_column_privilege('authenticated', 'public.wardrobe_items', 'garment_type', 'INSERT')
  THEN
    RAISE EXCEPTION 'Authenticated wardrobe INSERT privilege remains';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.wardrobe_items', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.wardrobe_items', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.wardrobe_items', 'DELETE')
  THEN
    RAISE EXCEPTION 'Required authenticated wardrobe SELECT/UPDATE/DELETE privilege missing';
  END IF;
END
$$;

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
         'description', 'occasion', 'image_url', 'cleaned_image_url'
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
           'cleaned_image_url'
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
      item.cleaned_image_url
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS entry(value, ordinality)
    CROSS JOIN LATERAL jsonb_to_record(entry.value) AS item(
      id uuid,
      garment_type text,
      sub_type text,
      color_family text,
      description text,
      occasion text[],
      image_url text,
      cleaned_image_url text
    )
  ),
  inserted AS (
    INSERT INTO public.wardrobe_items (
      id, user_id, garment_type, sub_type, color_family, description,
      occasion, image_url, cleaned_image_url
    )
    SELECT
      normalized.id, v_user_id, normalized.garment_type, normalized.sub_type,
      normalized.color_family, normalized.description, normalized.occasion,
      normalized.image_url, normalized.cleaned_image_url
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

CREATE OR REPLACE FUNCTION public.insert_wardrobe_item(p_item jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  v_ids := public.insert_wardrobe_items(jsonb_build_array(p_item));
  RETURN v_ids[1];
END;
$$;

CREATE OR REPLACE FUNCTION public.set_free_wardrobe_selection(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.insert_wardrobe_item(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insert_wardrobe_items(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_free_wardrobe_selection(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_wardrobe_item(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_wardrobe_items(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_free_wardrobe_selection(uuid[]) TO authenticated;