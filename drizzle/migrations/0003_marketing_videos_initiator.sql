ALTER TABLE public.marketing_videos
  ADD COLUMN IF NOT EXISTS initiator text NOT NULL DEFAULT 'MANUAL';

ALTER TABLE public.marketing_videos
  DROP CONSTRAINT IF EXISTS marketing_videos_initiator_check;

ALTER TABLE public.marketing_videos
  ADD CONSTRAINT marketing_videos_initiator_check
  CHECK (initiator IN ('MANUAL', 'AUTONOMOUS'));

CREATE INDEX IF NOT EXISTS marketing_videos_initiator_created_idx
  ON public.marketing_videos (initiator, created_at);