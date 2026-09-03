CREATE INDEX IF NOT EXISTS analytics_events_prod_occurred_idx
  ON public.analytics_events (occurred_at DESC)
  WHERE is_bot = false AND environment = 'production';