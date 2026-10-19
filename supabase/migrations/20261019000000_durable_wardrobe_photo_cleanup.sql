-- A delete receipt is committed atomically with its wardrobe row so an app
-- exit between the database delete and Storage removal cannot lose the intent.
CREATE TABLE public.wardrobe_photo_cleanup_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wardrobe_photo_cleanup_receipts_owner_created_idx
  ON public.wardrobe_photo_cleanup_receipts (user_id, created_at);

ALTER TABLE public.wardrobe_photo_cleanup_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own wardrobe photo cleanup receipts"
  ON public.wardrobe_photo_cleanup_receipts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.wardrobe_photo_cleanup_receipts TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wardrobe_photo_cleanup_receipts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.wardrobe_photo_cleanup_receipts TO service_role;

CREATE FUNCTION public.record_wardrobe_photo_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.record_wardrobe_photo_cleanup() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER wardrobe_photo_cleanup_receipt_after_delete
  AFTER DELETE ON public.wardrobe_items
  FOR EACH ROW EXECUTE FUNCTION public.record_wardrobe_photo_cleanup();

CREATE FUNCTION public.acknowledge_wardrobe_photo_cleanup(
  p_item_id uuid,
  p_image_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;

  DELETE FROM public.wardrobe_photo_cleanup_receipts
  WHERE user_id = auth.uid()
    AND item_id = p_item_id
    AND image_url = p_image_url;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_wardrobe_photo_cleanup(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_wardrobe_photo_cleanup(uuid, text)
  TO authenticated;
