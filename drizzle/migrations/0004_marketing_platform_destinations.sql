ALTER TABLE public.marketing_platform_connections
  ADD COLUMN IF NOT EXISTS destination_id text,
  ADD COLUMN IF NOT EXISTS destination_label text;

ALTER TABLE public.marketing_publications
  ADD COLUMN IF NOT EXISTS media_id text;

COMMENT ON COLUMN public.marketing_platform_connections.destination_id IS 'Founder-chosen destination within the connected account (Pinterest board id, LinkedIn author URN).';
COMMENT ON COLUMN public.marketing_publications.media_id IS 'Platform media identifier confirmed by the platform (LinkedIn video URN, TikTok publish id, Pinterest media id).';