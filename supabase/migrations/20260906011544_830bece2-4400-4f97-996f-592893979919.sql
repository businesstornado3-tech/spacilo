CREATE TABLE IF NOT EXISTS public.marketing_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  platform text NOT NULL,
  aspect text NOT NULL,
  seconds integer NOT NULL,
  resolution text NOT NULL,
  provider_id text NOT NULL,
  provider_model text,
  provider_job_id text,
  status text NOT NULL DEFAULT 'GENERATING',
  storage_path text,
  duration_seconds numeric,
  brand_validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt text NOT NULL,
  failure_reason text,
  estimated_cost_pence integer,
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_videos_campaign_idx ON public.marketing_videos (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_videos_status_idx ON public.marketing_videos (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_videos TO authenticated;
GRANT ALL ON public.marketing_videos TO service_role;
ALTER TABLE public.marketing_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins manage marketing videos" ON public.marketing_videos;
CREATE POLICY "Platform admins manage marketing videos"
  ON public.marketing_videos FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS marketing_videos_touch ON public.marketing_videos;
CREATE TRIGGER marketing_videos_touch BEFORE UPDATE ON public.marketing_videos
  FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();

ALTER TABLE public.marketing_platform_connections
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS account_label text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;