-- Atomically insert a classified multi-garment batch and its confirmed group.
CREATE FUNCTION public.insert_wardrobe_group_items(
  p_items jsonb,
  p_relationship_type text,
  p_relationship_confidence double precision,
  p_shared_attributes jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.insert_wardrobe_group_items(jsonb, text, double precision, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_wardrobe_group_items(jsonb, text, double precision, jsonb)
  TO authenticated;
