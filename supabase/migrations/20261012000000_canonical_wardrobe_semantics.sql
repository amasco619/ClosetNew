-- P0.1: keep normalized columns; add only previously unrepresented item signals.
-- No historical backfill, group schema changes, or new table INSERT privilege.
CREATE FUNCTION public.valid_wardrobe_recommendation_semantics(value jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $$
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
$$;

ALTER TABLE public.wardrobe_items ADD COLUMN recommendation_semantics jsonb NULL
  CONSTRAINT wardrobe_items_recommendation_semantics_check
  CHECK (public.valid_wardrobe_recommendation_semantics(recommendation_semantics));
REVOKE INSERT (recommendation_semantics)
  ON public.wardrobe_items FROM PUBLIC, anon, authenticated;

-- Same authenticated insertion boundary and quota/transaction behavior. The
-- single and group RPCs continue delegating here without architectural change.
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
$$;
