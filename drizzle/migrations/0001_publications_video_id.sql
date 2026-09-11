ALTER TABLE public.marketing_publications
  ADD COLUMN IF NOT EXISTS video_id uuid REFERENCES public.marketing_videos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS marketing_publications_video_id_idx
  ON public.marketing_publications (video_id);