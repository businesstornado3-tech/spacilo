CREATE TABLE public.marketing_youtube_demo_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'STARTED',
  scopes TEXT[] NOT NULL DEFAULT '{}',
  environment TEXT,
  oauth_state TEXT,
  channel JSONB,
  marketing_video_id UUID,
  youtube_video_id TEXT,
  youtube_url TEXT,
  recording_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  recording_path TEXT,
  recording_bytes BIGINT,
  recording_mime TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.marketing_youtube_demo_runs TO authenticated;
GRANT ALL ON public.marketing_youtube_demo_runs TO service_role;

ALTER TABLE public.marketing_youtube_demo_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read demo runs" ON public.marketing_youtube_demo_runs
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Admins create demo runs" ON public.marketing_youtube_demo_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "Admins update demo runs" ON public.marketing_youtube_demo_runs
  FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER marketing_youtube_demo_runs_updated_at
  BEFORE UPDATE ON public.marketing_youtube_demo_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();