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
    SELECT coalesce(e.path, '(unknown)') AS p,
      count(*) AS views,
      jsonb_build_object('path', coalesce(e.path, '(unknown)'), 'page_views', count(*), 'visitors', count(DISTINCT e.visitor_ref)) AS x
    FROM public.analytics_events e
    WHERE e.occurred_at >= p_from AND e.occurred_at < p_to
      AND e.event_name = 'page_view' AND e.is_bot = false AND e.environment = 'production'
      AND public.analytics_is_public_path(e.path)
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = e.user_id AND ur.role = 'admin'::public.app_role)
    GROUP BY coalesce(e.path, '(unknown)')
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