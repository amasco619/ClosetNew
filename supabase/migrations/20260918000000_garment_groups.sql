-- Phase A: garment-group persistence only. No classifier, UI, or engine changes.

ALTER TABLE public.wardrobe_items
  ADD CONSTRAINT wardrobe_items_user_id_id_key UNIQUE (user_id, id);

CREATE TABLE public.garment_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  relationship_type text NOT NULL
    CHECK (relationship_type IN ('coordinated_set', 'multi_item', 'layered')),
  relationship_confidence double precision NULL
    CHECK (
      relationship_confidence IS NULL
      OR relationship_confidence BETWEEN 0 AND 1
    ),
  confirmation_status text NOT NULL
    CHECK (confirmation_status IN ('ai_inferred', 'user_confirmed', 'user_rejected')),
  shared_attributes jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(shared_attributes) = 'object'),
  source_image_path text NULL
    CHECK (
      source_image_path IS NULL
      OR (
        source_image_path !~* '^https?://'
        AND source_image_path !~* '^file:'
      )
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garment_groups_ai_confidence_check
    CHECK (
      confirmation_status <> 'ai_inferred'
      OR relationship_confidence IS NOT NULL
    ),
  CONSTRAINT garment_groups_user_id_id_key UNIQUE (user_id, id)
);

CREATE TABLE public.garment_group_members (
  user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  garment_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, garment_id),
  CONSTRAINT garment_group_members_group_owner_fkey
    FOREIGN KEY (user_id, group_id)
    REFERENCES public.garment_groups(user_id, id)
    ON DELETE CASCADE,
  CONSTRAINT garment_group_members_garment_owner_fkey
    FOREIGN KEY (user_id, garment_id)
    REFERENCES public.wardrobe_items(user_id, id)
    ON DELETE CASCADE
);

CREATE INDEX garment_groups_user_id_idx
  ON public.garment_groups(user_id);
CREATE INDEX garment_group_members_user_id_idx
  ON public.garment_group_members(user_id);
CREATE INDEX garment_group_members_garment_id_idx
  ON public.garment_group_members(garment_id);

CREATE TRIGGER garment_groups_set_updated_at
  BEFORE UPDATE ON public.garment_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE FUNCTION public.delete_empty_garment_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
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
$function$;

CREATE TRIGGER garment_group_members_delete_empty_group
  AFTER DELETE ON public.garment_group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_empty_garment_group();

CREATE FUNCTION public.create_garment_group(
  p_garment_ids uuid[],
  p_relationship_type text,
  p_relationship_confidence double precision DEFAULT NULL,
  p_confirmation_status text DEFAULT 'user_confirmed',
  p_shared_attributes jsonb DEFAULT '{}'::jsonb,
  p_source_image_path text DEFAULT NULL
)
RETURNS public.garment_groups
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
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
$function$;

ALTER TABLE public.garment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garment_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own garment groups"
  ON public.garment_groups FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own garment groups"
  ON public.garment_groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own garment groups"
  ON public.garment_groups FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own garment groups"
  ON public.garment_groups FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own garment group members"
  ON public.garment_group_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own garment group members"
  ON public.garment_group_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own garment group members"
  ON public.garment_group_members FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own garment group members"
  ON public.garment_group_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.garment_groups FROM anon;
REVOKE ALL ON TABLE public.garment_group_members FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.garment_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.garment_group_members TO authenticated;
GRANT SELECT, DELETE
  ON TABLE public.garment_groups TO service_role;
GRANT SELECT, DELETE
  ON TABLE public.garment_group_members TO service_role;

REVOKE ALL ON FUNCTION public.create_garment_group(
  uuid[], text, double precision, text, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_garment_group(
  uuid[], text, double precision, text, jsonb, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_empty_garment_group() FROM PUBLIC;