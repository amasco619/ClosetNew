-- Adds a confirmed textile identity field to the recommendation semantics allowlist.
-- Apply only after explicit approval; rollback is the prior function definition.
CREATE OR REPLACE FUNCTION public.valid_wardrobe_recommendation_semantics(value jsonb)
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
    'confirmedFields', 'purchasePrice', 'textileIdentity'
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
          'metalTone', 'dominantHsl', 'dominantLab', 'textileIdentity'] END;
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
        WHEN 'textileIdentity' THEN ARRAY[
          'george', 'hollandais', 'akwete', 'aso-oke', 'adire', 'brocade', 'lace',
          'lace-swiss-voile', 'lace-cord', 'lace-french', 'lace-guipure', 'lace-beaded'
        ]
        ELSE NULL END;
      IF allowed IS NOT NULL AND NOT (value->>field) = ANY(allowed) THEN RETURN false; END IF;
      IF field = 'accentColor' AND length(value->>field) NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;
