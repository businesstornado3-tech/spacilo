ALTER TABLE public.marketing_videos
  ADD COLUMN IF NOT EXISTS provider_kind text NOT NULL DEFAULT 'SELF_HOSTED',
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS seed bigint,
  ADD COLUMN IF NOT EXISTS generation_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS queue_state text NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN IF NOT EXISTS api_cost_pence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infrastructure_cost_pence integer,
  ADD COLUMN IF NOT EXISTS media_probe jsonb,
  ADD COLUMN IF NOT EXISTS core_asset_id text,
  ADD COLUMN IF NOT EXISTS licence_record jsonb;

CREATE INDEX IF NOT EXISTS marketing_videos_queue_idx ON public.marketing_videos (queue_state, created_at);