BEGIN;
LOCK TABLE public.wardrobe_items IN ACCESS EXCLUSIVE MODE;
DO $gate$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.wardrobe_items'::regclass
      AND relrowsecurity AND NOT relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'wardrobe_items RLS flags changed; stop and re-inspect';
  END IF;
  IF (
    SELECT md5(jsonb_agg(jsonb_build_object(
      'policyname', policyname, 'cmd', cmd, 'roles', roles,
      'permissive', permissive, 'qual', qual, 'with_check', with_check
    ) ORDER BY policyname COLLATE "C")::text)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'wardrobe_items'
  ) IS DISTINCT FROM '75a210bc2427210063fc7ed617411ddb' THEN
    RAISE EXCEPTION 'wardrobe_items policy snapshot changed; stop and re-inspect';
  END IF;
END
$gate$;
DROP POLICY "Users can delete own wardrobe" ON public.wardrobe_items;
DROP POLICY "Users can delete own wardrobe items" ON public.wardrobe_items;
DROP POLICY "Users can insert own wardrobe" ON public.wardrobe_items;
DROP POLICY "Users can insert own wardrobe items" ON public.wardrobe_items;
DROP POLICY "Users can read own wardrobe items" ON public.wardrobe_items;
DROP POLICY "Users can update own wardrobe" ON public.wardrobe_items;
DROP POLICY "Users can update own wardrobe items" ON public.wardrobe_items;
DROP POLICY "Users can view own wardrobe" ON public.wardrobe_items;
ALTER POLICY "Users manage own wardrobe items" ON public.wardrobe_items
  WITH CHECK ((auth.uid() = user_id));
COMMIT;
