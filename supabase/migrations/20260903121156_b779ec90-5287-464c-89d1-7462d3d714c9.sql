ALTER TABLE public.analytics_daily_rollups
  ADD COLUMN IF NOT EXISTS public_unique_visitors bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_sessions bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS analytics_events_public_page_date_idx
  ON public.analytics_events (occurred_at DESC)
  WHERE event_name = 'page_view' AND is_bot = false AND environment = 'production';
CREATE INDEX IF NOT EXISTS analytics_events_public_date_idx
  ON public.analytics_events (occurred_at DESC)
  WHERE is_bot = false AND environment = 'production';

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
      public.analytics_is_public_path(e.path) AS is_public
    FROM public.analytics_events e
    WHERE e.occurred_at >= p_from
      AND e.occurred_at < p_to
      AND e.environment = 'production'
      AND e.is_bot = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = e.user_id
          AND ur.role = 'admin'::public.app_role
      )
  ),
  grouped AS (
    SELECT
      rollup_date,
      event_name,
      count(*) AS total_events,
      count(*) FILTER (WHERE is_public) AS public_events,
      count(DISTINCT visitor_ref) AS unique_visitors,
      count(DISTINCT session_ref) AS sessions,
      count(DISTINCT visitor_ref) FILTER (WHERE is_public) AS public_unique_visitors,
      count(DISTINCT session_ref) FILTER (WHERE is_public) AS public_sessions
    FROM eligible
    GROUP BY rollup_date, event_name
    UNION ALL
    SELECT
      rollup_date,
      '__all__'::text,
      count(*),
      count(*) FILTER (WHERE is_public),
      count(DISTINCT visitor_ref),
      count(DISTINCT session_ref),
      count(DISTINCT visitor_ref) FILTER (WHERE is_public),
      count(DISTINCT session_ref) FILTER (WHERE is_public)
    FROM eligible
    GROUP BY rollup_date
  )
  INSERT INTO public.analytics_daily_rollups (
    rollup_date,
    event_name,
    total_events,
    public_events,
    unique_visitors,
    sessions,
    public_unique_visitors,
    public_sessions
  )
  SELECT
    rollup_date,
    event_name,
    total_events,
    public_events,
    unique_visitors,
    sessions,
    public_unique_visitors,
    public_sessions
  FROM grouped;

  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RETURN rows_written;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_rebuild_daily_rollups(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_rebuild_daily_rollups(timestamptz, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_dashboard_kpis(p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  span interval;
  prev_from timestamptz;
  prev_to timestamptz;
  result jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  span := p_to - p_from;
  prev_to := p_from;
  prev_from := p_from - span;

  WITH windows AS (
    SELECT 'current'::text AS w, p_from AS f, p_to AS t
    UNION ALL SELECT 'previous', prev_from, prev_to
  ),
  rollup_windows AS (
    SELECT
      w.w,
      coalesce(sum(r.public_unique_visitors) FILTER (WHERE r.event_name = '__all__'), 0) AS unique_visitors,
      coalesce(sum(r.public_sessions) FILTER (WHERE r.event_name = '__all__'), 0) AS sessions,
      coalesce(sum(r.public_events) FILTER (WHERE r.event_name = 'page_view'), 0) AS page_views,
      coalesce(sum(r.total_events) FILTER (WHERE r.event_name = 'storage_search_started'), 0) AS searches_started,
      coalesce(sum(r.total_events) FILTER (WHERE r.event_name = 'spacefit_stuff_started'), 0) AS stuff_started,
      coalesce(sum(r.total_events) FILTER (WHERE r.event_name = 'spacefit_stuff_completed'), 0) AS stuff_completed,
      coalesce(sum(r.total_events) FILTER (WHERE r.event_name = 'spacefit_space_started'), 0) AS space_started,
      coalesce(sum(r.total_events) FILTER (WHERE r.event_name = 'spacefit_space_completed'), 0) AS space_completed
    FROM windows w
    LEFT JOIN public.analytics_daily_rollups r
      ON r.rollup_date >= (w.f AT TIME ZONE 'Europe/London')::date
     AND r.rollup_date < ((w.t - interval '1 microsecond') AT TIME ZONE 'Europe/London')::date + 1
    GROUP BY w.w
  ),
  accounts AS (
    SELECT w.w,
           count(p.id) AS new_accounts,
           count(p.id) FILTER (WHERE p.initial_mode = 'renter') AS new_renter_accounts,
           count(p.id) FILTER (WHERE p.initial_mode = 'host') AS new_host_accounts
      FROM windows w
      LEFT JOIN public.profiles p
        ON p.created_at >= w.f AND p.created_at < w.t
     GROUP BY w.w
  ),
  supply AS (
    SELECT w.w,
           count(s.id) FILTER (WHERE s.created_at >= w.f AND s.created_at < w.t) AS spaces_started,
           count(s.id) FILTER (WHERE s.published_at >= w.f AND s.published_at < w.t) AS spaces_published
      FROM windows w
      LEFT JOIN public.spaces s
        ON (s.created_at >= w.f AND s.created_at < w.t)
        OR (s.published_at >= w.f AND s.published_at < w.t)
     GROUP BY w.w
  ),
  demand AS (
    SELECT w.w,
           count(r.id) AS storage_requests,
           count(r.id) FILTER (WHERE r.status IN ('accepted','reserved','confirmed','active','completed')) AS accepted_requests,
           count(r.id) FILTER (WHERE r.status = 'declined') AS declined_requests,
           count(r.id) FILTER (WHERE r.status IN ('expired','withdrawn','cancelled')) AS lapsed_requests
      FROM windows w
      LEFT JOIN public.storage_requests r
        ON r.created_at >= w.f AND r.created_at < w.t
     GROUP BY w.w
  ),
  booked AS (
    SELECT w.w,
           count(b.id) AS bookings,
           count(b.id) FILTER (WHERE b.status = 'completed') AS completed_bookings,
           count(b.id) FILTER (WHERE b.status IN ('confirmed','active','completed')) AS paid_bookings,
           coalesce(sum(b.renter_total_amount_pence) FILTER (WHERE b.status <> 'cancelled'), 0) AS gbv_booked_pence,
           coalesce(sum(b.service_fee_amount_pence) FILTER (WHERE b.status <> 'cancelled'), 0) AS fees_booked_pence,
           coalesce(sum(b.storage_amount_pence) FILTER (WHERE b.status <> 'cancelled'), 0) AS host_amount_booked_pence
      FROM windows w
      LEFT JOIN public.bookings b
        ON b.created_at >= w.f AND b.created_at < w.t
     GROUP BY w.w
  ),
  paid AS (
    SELECT w.w,
           coalesce(sum(pay.renter_total_amount_pence) FILTER (WHERE pay.status = 'succeeded'), 0) AS gbv_paid_pence,
           coalesce(sum(pay.service_fee_amount_pence) FILTER (WHERE pay.status = 'succeeded'), 0) AS fees_paid_pence,
           coalesce(sum(pay.storage_amount_pence) FILTER (WHERE pay.status = 'succeeded'), 0) AS host_amount_paid_pence,
           coalesce(sum(pay.refunded_total_pence), 0) AS refunds_pence,
           coalesce(sum(pay.refunded_service_fee_pence), 0) AS refunded_fees_pence,
           count(pay.id) FILTER (WHERE coalesce(pay.refunded_total_pence,0) > 0) AS refund_count,
           count(pay.id) FILTER (WHERE pay.disputed) AS disputed_count,
           count(pay.id) FILTER (WHERE pay.status = 'failed') AS failed_payment_count
      FROM windows w
      LEFT JOIN public.payments pay
        ON pay.created_at >= w.f AND pay.created_at < w.t
     GROUP BY w.w
  )
  SELECT jsonb_object_agg(
    rw.w,
    jsonb_build_object(
      'unique_visitors', rw.unique_visitors,
      'sessions', rw.sessions,
      'page_views', rw.page_views,
      'new_accounts', a.new_accounts,
      'new_renter_accounts', a.new_renter_accounts,
      'new_host_accounts', a.new_host_accounts,
      'spaces_started', s.spaces_started,
      'spaces_published', s.spaces_published,
      'storage_requests', d.storage_requests,
      'accepted_requests', d.accepted_requests,
      'declined_requests', d.declined_requests,
      'lapsed_requests', d.lapsed_requests,
      'searches_started', rw.searches_started,
      'bookings', bk.bookings,
      'paid_bookings', bk.paid_bookings,
      'completed_bookings', bk.completed_bookings,
      'gbv_booked_pence', bk.gbv_booked_pence,
      'fees_booked_pence', bk.fees_booked_pence,
      'host_amount_booked_pence', bk.host_amount_booked_pence,
      'gbv_paid_pence', pd.gbv_paid_pence,
      'fees_paid_pence', pd.fees_paid_pence,
      'host_amount_paid_pence', pd.host_amount_paid_pence,
      'refunds_pence', pd.refunds_pence,
      'refunded_fees_pence', pd.refunded_fees_pence,
      'net_fees_pence', pd.fees_paid_pence - pd.refunded_fees_pence,
      'refund_count', pd.refund_count,
      'disputed_count', pd.disputed_count,
      'failed_payment_count', pd.failed_payment_count,
      'ai_stuff_started', rw.stuff_started,
      'ai_stuff_completed', rw.stuff_completed,
      'ai_space_started', rw.space_started,
      'ai_space_completed', rw.space_completed
    )
  ) INTO result
  FROM rollup_windows rw
  JOIN accounts a USING (w)
  JOIN supply s USING (w)
  JOIN demand d USING (w)
  JOIN booked bk USING (w)
  JOIN paid pd USING (w);

  RETURN jsonb_build_object(
    'timezone', 'Europe/London',
    'from', p_from,
    'to', p_to,
    'previous_from', prev_from,
    'previous_to', prev_to,
    'published_spaces_now', (SELECT count(*) FROM public.spaces WHERE listing_status = 'published'),
    'draft_spaces_now', (SELECT count(*) FROM public.spaces WHERE listing_status = 'draft'),
    'paused_spaces_now', (SELECT count(*) FROM public.spaces WHERE listing_status = 'paused'),
    'total_spaces_now', (SELECT count(*) FROM public.spaces),
    'hosts_with_published_space_now', (SELECT count(DISTINCT host_id) FROM public.spaces WHERE listing_status = 'published'),
    'total_accounts_now', (SELECT count(*) FROM public.profiles),
    'renter_accounts_now', (SELECT count(*) FROM public.profiles WHERE renter_enabled),
    'host_accounts_now', (SELECT count(*) FROM public.profiles WHERE host_enabled),
    'both_accounts_now', (SELECT count(*) FROM public.profiles WHERE host_enabled AND renter_enabled),
    'admin_accounts_now', (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role = 'admin'::public.app_role),
    'windows', coalesce(result, '{}'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_trends(p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  WITH days AS (
    SELECT generate_series(
      (p_from AT TIME ZONE 'Europe/London')::date,
      ((p_to - interval '1 second') AT TIME ZONE 'Europe/London')::date,
      interval '1 day'
    )::date AS d
  ),
  ev AS (
    SELECT r.rollup_date AS d,
           max(r.public_unique_visitors) FILTER (WHERE r.event_name = '__all__') AS visitors,
           max(r.public_sessions) FILTER (WHERE r.event_name = '__all__') AS sessions,
           max(r.public_events) FILTER (WHERE r.event_name = 'page_view') AS page_views
      FROM public.analytics_daily_rollups r
     WHERE r.rollup_date >= (p_from AT TIME ZONE 'Europe/London')::date
       AND r.rollup_date <= ((p_to - interval '1 second') AT TIME ZONE 'Europe/London')::date
     GROUP BY r.rollup_date
  ),
  acc AS (
    SELECT (created_at AT TIME ZONE 'Europe/London')::date AS d,
           count(*) AS accounts,
           count(*) FILTER (WHERE initial_mode = 'renter') AS renter_accounts,
           count(*) FILTER (WHERE initial_mode = 'host') AS host_accounts
      FROM public.profiles
     WHERE created_at >= p_from AND created_at < p_to
     GROUP BY 1
  ),
  fin AS (
    SELECT (created_at AT TIME ZONE 'Europe/London')::date AS d,
           count(*) AS bookings,
           coalesce(sum(renter_total_amount_pence) FILTER (WHERE status <> 'cancelled'), 0) AS gbv_pence,
           coalesce(sum(service_fee_amount_pence) FILTER (WHERE status <> 'cancelled'), 0) AS fees_pence,
           coalesce(sum(storage_amount_pence) FILTER (WHERE status <> 'cancelled'), 0) AS host_amount_pence
      FROM public.bookings
     WHERE created_at >= p_from AND created_at < p_to
     GROUP BY 1
  ),
  pay AS (
    SELECT (created_at AT TIME ZONE 'Europe/London')::date AS d,
           coalesce(sum(renter_total_amount_pence) FILTER (WHERE status = 'succeeded'), 0) AS gbv_paid_pence,
           coalesce(sum(service_fee_amount_pence) FILTER (WHERE status = 'succeeded'), 0) AS fees_paid_pence
      FROM public.payments
     WHERE created_at >= p_from AND created_at < p_to
     GROUP BY 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', days.d,
      'visitors', coalesce(ev.visitors, 0),
      'sessions', coalesce(ev.sessions, 0),
      'page_views', coalesce(ev.page_views, 0),
      'accounts', coalesce(acc.accounts, 0),
      'renter_accounts', coalesce(acc.renter_accounts, 0),
      'host_accounts', coalesce(acc.host_accounts, 0),
      'bookings', coalesce(fin.bookings, 0),
      'gbv_pence', coalesce(fin.gbv_pence, 0),
      'fees_pence', coalesce(fin.fees_pence, 0),
      'host_amount_pence', coalesce(fin.host_amount_pence, 0),
      'gbv_paid_pence', coalesce(pay.gbv_paid_pence, 0),
      'fees_paid_pence', coalesce(pay.fees_paid_pence, 0)
    ) ORDER BY days.d
  ) INTO result
  FROM days
  LEFT JOIN ev ON ev.d = days.d
  LEFT JOIN acc ON acc.d = days.d
  LEFT JOIN fin ON fin.d = days.d
  LEFT JOIN pay ON pay.d = days.d;

  RETURN jsonb_build_object('timezone', 'Europe/London', 'series', coalesce(result, '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_breakdowns(p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
     LIMIT 12
  ) s;

  SELECT coalesce(jsonb_agg(x ORDER BY v DESC, src ASC), '[]'::jsonb) INTO sources FROM (
    SELECT coalesce(nullif(e.utm_source, ''), e.referrer_host, 'direct') AS src,
           count(DISTINCT e.visitor_ref) AS v,
           jsonb_build_object('source', coalesce(nullif(e.utm_source, ''), e.referrer_host, 'direct'), 'visitors', count(DISTINCT e.visitor_ref), 'sessions', count(DISTINCT e.session_ref)) AS x
      FROM public.analytics_events e
     WHERE e.occurred_at >= p_from AND e.occurred_at < p_to
       AND e.is_bot = false AND e.environment = 'production'
       AND public.analytics_is_public_path(e.path)
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = e.user_id AND ur.role = 'admin'::public.app_role)
     GROUP BY 1
     LIMIT 10
  ) s;

  SELECT coalesce(jsonb_object_agg(device, c), '{}'::jsonb) INTO devices FROM (
    SELECT coalesce(e.device, 'unknown') AS device, count(DISTINCT e.visitor_ref) AS c
      FROM public.analytics_events e
     WHERE e.occurred_at >= p_from AND e.occurred_at < p_to
       AND e.is_bot = false AND e.environment = 'production'
       AND public.analytics_is_public_path(e.path)
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = e.user_id AND ur.role = 'admin'::public.app_role)
     GROUP BY 1
  ) s;

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
$function$;

SELECT public.analytics_rebuild_daily_rollups(
  COALESCE((SELECT min(occurred_at) FROM public.analytics_events WHERE environment = 'production' AND is_bot = false), now()),
  now() + interval '1 microsecond'
);