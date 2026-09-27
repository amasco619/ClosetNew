-- B1: authenticated clients may edit their own profile, never their entitlement.
-- Table-level grants override column-level restrictions; remove them first.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
  ON TABLE public.user_profiles FROM authenticated, PUBLIC;
REVOKE INSERT (premium, premium_expires_at),
       UPDATE (premium, premium_expires_at)
  ON TABLE public.user_profiles FROM authenticated, PUBLIC;

-- PostgREST upsert needs INSERT plus UPDATE of the supplied conflict columns.
-- id is included because the current client supplies it on every upsert;
-- the existing auth.uid() = id RLS checks still prohibit changing ownership.
GRANT INSERT (
  id, name, body_type, eye_color, skin_tone, undertone, style_goals,
  secondary_goal, lifestyle, constraints, location_lat, location_lon,
  onboarding_complete, is_guest
), UPDATE (
  id, name, body_type, eye_color, skin_tone, undertone, style_goals,
  secondary_goal, lifestyle, constraints, location_lat, location_lon,
  onboarding_complete, is_guest
) ON TABLE public.user_profiles TO authenticated;

-- Fail the migration atomically if PUBLIC or inherited grants still allow a
-- premium write, or if the existing reader and service-role paths were lost.
DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.user_profiles', 'premium', 'INSERT')
     OR has_column_privilege('authenticated', 'public.user_profiles', 'premium', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.user_profiles', 'premium_expires_at', 'INSERT')
     OR has_column_privilege('authenticated', 'public.user_profiles', 'premium_expires_at', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.user_profiles', 'DELETE')
     OR has_table_privilege('authenticated', 'public.user_profiles', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.user_profiles', 'TRIGGER')
  THEN
    RAISE EXCEPTION 'B1: authenticated profile entitlement write privilege remains';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.user_profiles', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.user_profiles', 'name', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.user_profiles', 'name', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.user_profiles', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.user_profiles', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.user_profiles', 'DELETE')
  THEN
    RAISE EXCEPTION 'B1: required profile read/write or service-role grant missing';
  END IF;
END
$$;