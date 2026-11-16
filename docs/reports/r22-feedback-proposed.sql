-- PROPOSAL ONLY. Do not apply without explicit approval.
-- NULL thumbs means a delivered verdict with no feedback, not a third thumb.
-- All verdict metadata is supplied by the authenticated server, never the client.
BEGIN;

CREATE TABLE public.check_look_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  model_verdict text NOT NULL
    CHECK (model_verdict IN ('Works', 'Almost', 'Rethink', 'Ask')),
  final_verdict text NOT NULL
    CHECK (final_verdict IN ('Works', 'Almost', 'Rethink', 'Ask')),
  floor_rules text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (array_position(floor_rules, NULL) IS NULL
      AND floor_rules <@ ARRAY['N1','N2','N3','N4','N5','N6','N7','N8','N9','R6']::text[]),
  thumbs text CHECK (thumbs IN ('up', 'down')),
  reason_chip text CHECK (reason_chip IN (
    'too_strict', 'too_lenient', 'wrong_piece_read',
    'culture_or_occasion_wrong', 'unclear_reason', 'other'
  )),
  payload_text text NOT NULL CHECK (length(payload_text) > 0),
  model_served text CHECK (model_served ~ '^gemini-[a-zA-Z0-9._-]{1,120}$'),
  prompt_hash text NOT NULL CHECK (prompt_hash ~ '^[0-9a-f]{64}$'),
  app_version text NOT NULL CHECK (app_version ~ '^[a-zA-Z0-9._+-]{1,100}$'),
  CONSTRAINT check_look_feedback_request_owner UNIQUE (user_id, request_id),
  CONSTRAINT check_look_feedback_reason_requires_down
    CHECK (reason_chip IS NULL OR (thumbs IS NOT NULL AND thumbs = 'down')),
  CONSTRAINT check_look_feedback_no_ask_thumbs
    CHECK (thumbs IS NULL OR final_verdict <> 'Ask')
);

CREATE INDEX check_look_feedback_down_created
  ON public.check_look_feedback (created_at, id) WHERE thumbs = 'down';
CREATE INDEX check_look_feedback_works_created
  ON public.check_look_feedback (created_at, id) WHERE final_verdict = 'Works';
CREATE INDEX check_look_feedback_retention_created
  ON public.check_look_feedback (created_at);

ALTER TABLE public.check_look_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.check_look_feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.check_look_feedback TO authenticated;
CREATE POLICY check_look_feedback_owner_read
  ON public.check_look_feedback FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.check_look_feedback TO service_role;

COMMENT ON TABLE public.check_look_feedback IS
  'Delivered judge verdict receipts and optional fixed-choice feedback. '
  'Server-only writes. Exact model input text includes constraints, never photos or identity. '
  'Delete with account; proposed retention 12 months from created_at. '
  'Retention enforcement requires a scheduled deletion job, not installed by this SQL.';

COMMIT;
