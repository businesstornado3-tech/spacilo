CREATE INDEX IF NOT EXISTS analytics_events_dashboard_page_cover_idx
  ON public.analytics_events (occurred_at DESC)
  INCLUDE (path, visitor_ref, user_id)
  WHERE event_name = 'page_view' AND is_bot = false AND environment = 'production';

CREATE INDEX IF NOT EXISTS analytics_events_dashboard_breakdown_cover_idx
  ON public.analytics_events (occurred_at DESC)
  INCLUDE (path, visitor_ref, session_ref, user_id, utm_source, referrer_host, device)
  WHERE is_bot = false AND environment = 'production';