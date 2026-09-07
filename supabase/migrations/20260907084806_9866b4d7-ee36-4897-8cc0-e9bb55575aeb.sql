ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_note text;

CREATE TABLE IF NOT EXISTS public.marketing_video_worker_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  mode text NOT NULL DEFAULT 'LOCAL',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  worker_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_video_worker_pairings TO authenticated;
GRANT ALL ON public.marketing_video_worker_pairings TO service_role;

ALTER TABLE public.marketing_video_worker_pairings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins manage worker pairings" ON public.marketing_video_worker_pairings;
CREATE POLICY "Platform admins manage worker pairings"
  ON public.marketing_video_worker_pairings
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS marketing_video_worker_pairings_code_idx
  ON public.marketing_video_worker_pairings (code);