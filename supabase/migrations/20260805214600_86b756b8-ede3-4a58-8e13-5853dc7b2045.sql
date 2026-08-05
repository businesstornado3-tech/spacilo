
-- ============================================================
-- Prompt 23C — first-party analytics + founder dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  visitor_ref uuid NOT NULL,
  session_ref uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  path text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text,
  environment text NOT NULL DEFAULT 'production',
  is_bot boolean NOT NULL DEFAULT false,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT analytics_events_name_len CHECK (char_length(event_name) BETWEEN 3 AND 64),
  CONSTRAINT analytics_events_path_len CHECK (path IS NULL OR char_length(path) <= 200),
  CONSTRAINT analytics_events_referrer_len CHECK (referrer_host IS NULL OR char_length(referrer_host) <= 120),
  CONSTRAINT analytics_events_device CHECK (device IS NULL OR device IN ('mobile','tablet','desktop')),
  CONSTRAINT analytics_events_env CHECK (environment IN ('production','preview','development')),
  CONSTRAINT analytics_events_props_small CHECK (pg_column_size(props) <= 2048)
);

CREATE INDEX IF NOT EXISTS analytics_events_occurred_idx ON public.analytics_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON public.analytics_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx ON public.analytics_events (visitor_ref, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_path_idx ON public.analytics_events (path, occurred_at DESC) WHERE event_name = 'page_view';

GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT ALL ON public.analytics_events TO service_role;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_events_insert_anyone" ON public.analytics_events;
CREATE POLICY "analytics_events_insert_anyone"
  ON public.analytics_events FOR INSERT TO anon, authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND occurred_at > now() - interval '1 day'
    AND occurred_at < now() + interval '5 minutes'
  );
-- No SELECT/UPDATE/DELETE policy: analytics is write-only for the public,
-- readable only through the aggregated admin functions below.

-- ------------------------------------------------------------
-- Admin authorisation helper
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::public.app_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Retention
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_prune(p_keep_days integer DEFAULT 400)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.analytics_events
   WHERE occurred_at < now() - make_interval(days => greatest(p_keep_days, 30));
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_prune(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_prune(integer) TO service_role;

-- ------------------------------------------------------------
-- Headline KPIs (current window + previous equivalent window)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_kpis(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  traffic AS (
    SELECT w.w,
           count(DISTINCT e.visitor_ref) AS unique_visitors,
           count(DISTINCT e.session_ref) AS sessions,
           count(*) FILTER (WHERE e.event_name = 'page_view') AS page_views
      FROM windows w
      LEFT JOIN public.analytics_events e
        ON e.occurred_at >= w.f AND e.occurred_at < w.t
       AND e.is_bot = false AND e.environment = 'production'
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
           count(r.id) FILTER (WHERE r.status = 'declined') AS declined_requests
      FROM windows w
      LEFT JOIN public.storage_requests r
        ON r.created_at >= w.f AND r.created_at < w.t
     GROUP BY w.w
  ),
  booked AS (
    SELECT w.w,
           count(b.id) AS bookings,
           count(b.id) FILTER (WHERE b.status = 'completed') AS completed_bookings,
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
  ),
  ai AS (
    SELECT w.w,
           count(*) FILTER (WHERE e.event_name = 'spacefit_stuff_started') AS stuff_started,
           count(*) FILTER (WHERE e.event_name = 'spacefit_stuff_completed') AS stuff_completed,
           count(*) FILTER (WHERE e.event_name = 'spacefit_space_started') AS space_started,
           count(*) FILTER (WHERE e.event_name = 'spacefit_space_completed') AS space_completed
      FROM windows w
      LEFT JOIN public.analytics_events e
        ON e.occurred_at >= w.f AND e.occurred_at < w.t
       AND e.is_bot = false AND e.environment = 'production'
     GROUP BY w.w
  )
  SELECT jsonb_object_agg(
    t.w,
    jsonb_build_object(
      'unique_visitors', t.unique_visitors,
      'sessions', t.sessions,
      'page_views', t.page_views,
      'new_accounts', a.new_accounts,
      'new_renter_accounts', a.new_renter_accounts,
      'new_host_accounts', a.new_host_accounts,
      'spaces_started', s.spaces_started,
      'spaces_published', s.spaces_published,
      'storage_requests', d.storage_requests,
      'accepted_requests', d.accepted_requests,
      'declined_requests', d.declined_requests,
      'bookings', bk.bookings,
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
      'ai_stuff_started', ai.stuff_started,
      'ai_stuff_completed', ai.stuff_completed,
      'ai_space_started', ai.space_started,
      'ai_space_completed', ai.space_completed
    )
  )
  INTO result
  FROM traffic t
  JOIN accounts a USING (w)
  JOIN supply s USING (w)
  JOIN demand d USING (w)
  JOIN booked bk USING (w)
  JOIN paid pd USING (w)
  JOIN ai USING (w);

  RETURN jsonb_build_object(
    'timezone', 'Europe/London',
    'from', p_from,
    'to', p_to,
    'previous_from', prev_from,
    'previous_to', prev_to,
    'published_spaces_now', (SELECT count(*) FROM public.spaces WHERE listing_status = 'published'),
    'windows', coalesce(result, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_kpis(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_kpis(timestamptz, timestamptz) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Daily trends (Europe/London calendar days)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_trends(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    SELECT (occurred_at AT TIME ZONE 'Europe/London')::date AS d,
           count(DISTINCT visitor_ref) AS visitors,
           count(DISTINCT session_ref) AS sessions,
           count(*) FILTER (WHERE event_name = 'page_view') AS page_views
      FROM public.analytics_events
     WHERE occurred_at >= p_from AND occurred_at < p_to
       AND is_bot = false AND environment = 'production'
     GROUP BY 1
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
      'host_amount_pence', coalesce(fin.host_amount_pence, 0)
    ) ORDER BY days.d
  )
  INTO result
  FROM days
  LEFT JOIN ev ON ev.d = days.d
  LEFT JOIN acc ON acc.d = days.d
  LEFT JOIN fin ON fin.d = days.d;

  RETURN jsonb_build_object('timezone', 'Europe/London', 'series', coalesce(result, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_trends(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_trends(timestamptz, timestamptz) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Breakdowns: top pages, acquisition, funnels, operational attention
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_breakdowns(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  top_pages jsonb;
  sources jsonb;
  ai_events jsonb;
  attention jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO top_pages FROM (
    SELECT jsonb_build_object(
             'path', coalesce(path, '(unknown)'),
             'page_views', count(*),
             'visitors', count(DISTINCT visitor_ref)
           ) AS x
      FROM public.analytics_events
     WHERE occurred_at >= p_from AND occurred_at < p_to
       AND event_name = 'page_view' AND is_bot = false AND environment = 'production'
     GROUP BY coalesce(path, '(unknown)')
     ORDER BY count(*) DESC
     LIMIT 12
  ) s;

  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO sources FROM (
    SELECT jsonb_build_object(
             'source', coalesce(nullif(utm_source, ''), referrer_host, 'direct'),
             'visitors', count(DISTINCT visitor_ref),
             'sessions', count(DISTINCT session_ref)
           ) AS x
      FROM public.analytics_events
     WHERE occurred_at >= p_from AND occurred_at < p_to
       AND is_bot = false AND environment = 'production'
     GROUP BY coalesce(nullif(utm_source, ''), referrer_host, 'direct')
     ORDER BY count(DISTINCT visitor_ref) DESC
     LIMIT 10
  ) s;

  SELECT coalesce(jsonb_object_agg(event_name, c), '{}'::jsonb) INTO ai_events FROM (
    SELECT event_name, count(*) AS c
      FROM public.analytics_events
     WHERE occurred_at >= p_from AND occurred_at < p_to
       AND is_bot = false AND environment = 'production'
     GROUP BY event_name
  ) s;

  attention := jsonb_build_object(
    'open_disputes', (SELECT count(*) FROM public.payments WHERE disputed),
    'failed_payments', (SELECT count(*) FROM public.payments WHERE status = 'failed' AND created_at >= now() - interval '30 days'),
    'draft_spaces', (SELECT count(*) FROM public.spaces WHERE listing_status = 'draft'),
    'expiring_requests', (SELECT count(*) FROM public.storage_requests WHERE status = 'pending' AND expires_at < now() + interval '24 hours')
  );

  RETURN jsonb_build_object(
    'top_pages', top_pages,
    'sources', sources,
    'event_counts', ai_events,
    'attention', attention
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_breakdowns(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_breakdowns(timestamptz, timestamptz) TO authenticated, service_role;
