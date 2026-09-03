ALTER TABLE public.analytics_daily_rollups
  ADD COLUMN IF NOT EXISTS source_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS device_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.analytics_rebuild_daily_rollups(p_from timestamptz, p_to timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rows_written integer;
BEGIN
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.analytics_daily_rollups
   WHERE rollup_date >= (p_from AT TIME ZONE 'Europe/London')::date
     AND rollup_date <= ((p_to - interval '1 microsecond') AT TIME ZONE 'Europe/London')::date;

  WITH eligible AS (
    SELECT
      (e.occurred_at AT TIME ZONE 'Europe/London')::date AS rollup_date,
      e.event_name,
      e.path,
      e.visitor_ref,
      e.session_ref,
      public.analytics_is_public_path(e.path) AS is_public,
      coalesce(nullif(e.utm_source, ''), e.referrer_host, 'direct') AS source,
      coalesce(e.device, 'unknown') AS device
    FROM public.analytics_events e
    WHERE e.occurred_at >= p_from
      AND e.occurred_at < p_to
      AND e.environment = 'production'
      AND e.is_bot = false
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = e.user_id AND ur.role = 'admin'::public.app_role
      )
  ),
  grouped AS (
    SELECT
      rollup_date, event_name, count(*) AS total_events,
      count(*) FILTER (WHERE is_public) AS public_events,
      count(DISTINCT visitor_ref) AS unique_visitors,
      count(DISTINCT session_ref) AS sessions,
      count(DISTINCT visitor_ref) FILTER (WHERE is_public) AS public_unique_visitors,
      count(DISTINCT session_ref) FILTER (WHERE is_public) AS public_sessions
    FROM eligible GROUP BY rollup_date, event_name
    UNION ALL
    SELECT rollup_date, '__all__'::text, count(*), count(*) FILTER (WHERE is_public),
      count(DISTINCT visitor_ref), count(DISTINCT session_ref),
      count(DISTINCT visitor_ref) FILTER (WHERE is_public), count(DISTINCT session_ref) FILTER (WHERE is_public)
    FROM eligible GROUP BY rollup_date
  ),
  dimensions AS (
    SELECT rollup_date,
      jsonb_object_agg(source, source_count) AS source_breakdown,
      jsonb_object_agg(device, device_count) AS device_breakdown
    FROM (
      SELECT rollup_date, source, count(DISTINCT visitor_ref) AS source_count
      FROM eligible WHERE is_public GROUP BY rollup_date, source
    ) sources
    FULL JOIN (
      SELECT rollup_date AS device_date, device, count(DISTINCT visitor_ref) AS device_count
      FROM eligible WHERE is_public GROUP BY rollup_date, device
    ) devices ON devices.device_date = sources.rollup_date
    GROUP BY rollup_date
  )
  INSERT INTO public.analytics_daily_rollups (
    rollup_date, event_name, total_events, public_events, unique_visitors, sessions,
    public_unique_visitors, public_sessions, source_breakdown, device_breakdown
  )
  SELECT g.rollup_date, g.event_name, g.total_events, g.public_events, g.unique_visitors, g.sessions,
    g.public_unique_visitors, g.public_sessions,
    coalesce(d.source_breakdown, '{}'::jsonb), coalesce(d.device_breakdown, '{}'::jsonb)
  FROM grouped g LEFT JOIN dimensions d ON d.rollup_date = g.rollup_date;

  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RETURN rows_written;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_breakdowns(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  top_pages jsonb;
  sources jsonb;
  devices jsonb;
  ai_events jsonb;
  attention jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY views DESC, p ASC), '[]'::jsonb) INTO top_pages FROM (
    SELECT coalesce(r.path, '(unknown)') AS p,
      sum(r.public_events) AS views,
      jsonb_build_object('path', coalesce(r.path, '(unknown)'), 'page_views', sum(r.public_events), 'visitors', sum(r.public_unique_visitors)) AS x
    FROM public.analytics_daily_rollups r
    WHERE r.event_name = 'page_view'
      AND r.rollup_date >= (p_from AT TIME ZONE 'Europe/London')::date
      AND r.rollup_date <= ((p_to - interval '1 second') AT TIME ZONE 'Europe/London')::date
      AND public.analytics_is_public_path(r.path)
    GROUP BY coalesce(r.path, '(unknown)')
    ORDER BY views DESC, p ASC LIMIT 12
  ) s;

  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO sources
  FROM (
    SELECT key, sum((value)::bigint) AS value
    FROM public.analytics_daily_rollups r, jsonb_each_text(r.source_breakdown)
    WHERE r.event_name = '__all__'
      AND r.rollup_date >= (p_from AT TIME ZONE 'Europe/London')::date
      AND r.rollup_date <= ((p_to - interval '1 second') AT TIME ZONE 'Europe/London')::date
    GROUP BY key
  ) s;

  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO devices
  FROM (
    SELECT key, sum((value)::bigint) AS value
    FROM public.analytics_daily_rollups r, jsonb_each_text(r.device_breakdown)
    WHERE r.event_name = '__all__'
      AND r.rollup_date >= (p_from AT TIME ZONE 'Europe/London')::date
      AND r.rollup_date <= ((p_to - interval '1 second') AT TIME ZONE 'Europe/London')::date
    GROUP BY key
  ) d;

  SELECT coalesce(jsonb_object_agg(event_name, total), '{}'::jsonb) INTO ai_events FROM (
    SELECT r.event_name, sum(r.total_events) AS total
    FROM public.analytics_daily_rollups r
    WHERE r.event_name <> '__all__'
      AND r.rollup_date >= (p_from AT TIME ZONE 'Europe/London')::date
      AND r.rollup_date <= ((p_to - interval '1 second') AT TIME ZONE 'Europe/London')::date
    GROUP BY r.event_name
  ) s;

  attention := jsonb_build_object(
    'open_disputes', (SELECT count(*) FROM public.payments WHERE disputed),
    'failed_payments', (SELECT count(*) FROM public.payments WHERE status = 'failed' AND created_at >= now() - interval '30 days'),
    'refunds_pending', (SELECT count(*) FROM public.booking_refunds WHERE status = 'pending'),
    'open_support_cases', (SELECT count(*) FROM public.booking_support_cases WHERE status IN ('open','waiting_for_other_party','waiting_for_reporter','under_review')),
    'reported_reviews', (SELECT count(*) FROM public.booking_review_reports WHERE status = 'open'),
    'draft_spaces', (SELECT count(*) FROM public.spaces WHERE listing_status = 'draft'),
    'expiring_requests', (SELECT count(*) FROM public.storage_requests WHERE status = 'pending' AND expires_at < now() + interval '24 hours')
  );

  RETURN jsonb_build_object('top_pages', top_pages, 'sources', sources, 'devices', devices, 'event_counts', ai_events, 'attention', attention);
END;
$$;

SELECT public.analytics_rebuild_daily_rollups(
  COALESCE((SELECT min(occurred_at) FROM public.analytics_events WHERE environment = 'production' AND is_bot = false), now()),
  now() + interval '1 microsecond'
);