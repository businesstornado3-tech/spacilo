ALTER TABLE public.marketing_publications
  DROP CONSTRAINT IF EXISTS marketing_publications_asset_id_platform_key;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_publications_video_platform_key
  ON public.marketing_publications (video_id, platform)
  WHERE video_id IS NOT NULL;