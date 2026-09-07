CREATE TABLE IF NOT EXISTS public.marketing_video_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('BROWSER','LOCAL','FREE_CLOUD','PAID_CLOUD')),
  label text NOT NULL,
  endpoint_url text,
  token_hash text,
  provider text,
  hardware jsonb NOT NULL DEFAULT '{}'::jsonb,
  capability text NOT NULL DEFAULT 'LIMITED',
  status text NOT NULL DEFAULT 'OFFLINE',
  status_detail text NOT NULL DEFAULT 'Not yet connected.',
  installed_models text[] NOT NULL DEFAULT ARRAY[]::text[],
  installed_voices text[] NOT NULL DEFAULT ARRAY[]::text[],
  installed_audio text[] NOT NULL DEFAULT ARRAY[]::text[],
  queued integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  last_heartbeat_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_video_workers_mode_label_idx
  ON public.marketing_video_workers (mode, label);
CREATE INDEX IF NOT EXISTS marketing_video_workers_status_idx
  ON public.marketing_video_workers (status, last_heartbeat_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_video_workers TO authenticated;
GRANT ALL ON public.marketing_video_workers TO service_role;
ALTER TABLE public.marketing_video_workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins manage video workers" ON public.marketing_video_workers;
CREATE POLICY "Platform admins manage video workers"
  ON public.marketing_video_workers FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS marketing_video_workers_touch ON public.marketing_video_workers;
CREATE TRIGGER marketing_video_workers_touch BEFORE UPDATE ON public.marketing_video_workers
  FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();

ALTER TABLE public.marketing_videos
  ADD COLUMN IF NOT EXISTS execution_mode text,
  ADD COLUMN IF NOT EXISTS worker_id uuid REFERENCES public.marketing_video_workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_source text,
  ADD COLUMN IF NOT EXISTS voice_model text,
  ADD COLUMN IF NOT EXISTS audio_assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS parent_video_id uuid REFERENCES public.marketing_videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regeneration_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS regeneration_reason text,
  ADD COLUMN IF NOT EXISTS job_phase text;

CREATE INDEX IF NOT EXISTS marketing_videos_parent_idx
  ON public.marketing_videos (parent_video_id);