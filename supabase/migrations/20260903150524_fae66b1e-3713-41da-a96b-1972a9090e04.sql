
ALTER TABLE public.growth_opportunities
  ADD COLUMN IF NOT EXISTS intelligence jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------- geography
-- Declared location intent only. There is no IP geolocation anywhere in this
-- pipeline, so nothing here locates a visitor.
CREATE OR REPLACE FUNCTION public.admin_demand_geography(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  span interval;
  result jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;
  span := p_to - p_from;

  WITH intent AS (
    SELECT
      lower(coalesce(
        nullif(e.props->>'location', ''),
        CASE WHEN e.path LIKE '/storage/%' THEN split_part(e.path, '/', 3) END
      )) AS slug,
      e.visitor_ref,
      e.occurred_at
    FROM public.analytics_events e
    WHERE e.environment = 'production'
      AND e.is_bot = false
      AND e.occurred_at >= (p_from - span)
      AND e.occurred_at < p_to
  ),
  named AS (
    SELECT * FROM intent WHERE slug IS NOT NULL AND slug <> ''
  ),
  current_window AS (
    SELECT slug,
           count(*) AS demand_events,
           count(DISTINCT visitor_ref) AS demand_visitors
      FROM named
     WHERE occurred_at >= p_from AND occurred_at < p_to
     GROUP BY slug
  ),
  previous_window AS (
    SELECT slug, count(*) AS previous_demand_events
      FROM named
     WHERE occurred_at >= (p_from - span) AND occurred_at < p_from
     GROUP BY slug
  ),
  supply AS (
    SELECT lower(regexp_replace(trim(s.town), '\s+', '-', 'g')) AS slug,
           count(*) FILTER (WHERE s.status = 'published') AS published_spaces
      FROM public.spaces s
     WHERE s.town IS NOT NULL AND trim(s.town) <> ''
     GROUP BY 1
  ),
  demand_rows AS (
    SELECT lower(regexp_replace(trim(s.town), '\s+', '-', 'g')) AS slug,
           count(DISTINCT r.id) AS storage_requests,
           count(DISTINCT b.id) AS bookings
      FROM public.spaces s
      LEFT JOIN public.storage_requests r
        ON r.space_id = s.id AND r.created_at >= p_from AND r.created_at < p_to
      LEFT JOIN public.bookings b
        ON b.space_id = s.id AND b.created_at >= p_from AND b.created_at < p_to
     WHERE s.town IS NOT NULL AND trim(s.town) <> ''
     GROUP BY 1
  ),
  slugs AS (
    SELECT slug FROM current_window
    UNION SELECT slug FROM supply WHERE slug IS NOT NULL
  )
  SELECT jsonb_build_object(
    'places',
    coalesce(jsonb_agg(jsonb_build_object(
      'location_slug', k.slug,
      'demand_events', coalesce(c.demand_events, 0),
      'demand_visitors', coalesce(c.demand_visitors, 0),
      'previous_demand_events', coalesce(p.previous_demand_events, 0),
      'published_spaces', coalesce(su.published_spaces, 0),
      'storage_requests', coalesce(d.storage_requests, 0),
      'bookings', coalesce(d.bookings, 0)
    ) ORDER BY coalesce(c.demand_events, 0) DESC), '[]'::jsonb)
  )
    INTO result
    FROM slugs k
    LEFT JOIN current_window c ON c.slug = k.slug
    LEFT JOIN previous_window p ON p.slug = k.slug
    LEFT JOIN supply su ON su.slug = k.slug
    LEFT JOIN demand_rows d ON d.slug = k.slug;

  RETURN coalesce(result, jsonb_build_object('places', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_demand_geography(timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_demand_geography(timestamptz, timestamptz) TO authenticated;

-- -------------------------------------------------------------- data health
CREATE OR REPLACE FUNCTION public.admin_data_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'last_event_at', (
      SELECT max(occurred_at) FROM public.analytics_events
       WHERE environment = 'production' AND is_bot = false
    ),
    'last_rollup_at', (SELECT max(updated_at) FROM public.analytics_daily_rollups),
    'last_opportunity_at', (SELECT max(latest_seen_at) FROM public.growth_opportunities),
    'conversion_events', (
      SELECT count(*) FROM public.analytics_events
       WHERE event_name = 'booking_completed' AND environment = 'production' AND is_bot = false
    ),
    'completed_bookings', (SELECT count(*) FROM public.bookings WHERE status = 'completed'),
    'non_production_events', (
      SELECT count(*) FROM public.analytics_events WHERE environment <> 'production'
    ),
    'bot_events', (SELECT count(*) FROM public.analytics_events WHERE is_bot = true),
    'opportunities', (SELECT count(*) FROM public.growth_opportunities),
    'mock_campaign_attempts', (
      SELECT count(*) FROM public.growth_campaign_attempts
       WHERE coalesce((metadata->>'transmitted')::boolean, false) = false
    ),
    'live_campaign_attempts', (
      SELECT count(*) FROM public.growth_campaign_attempts
       WHERE coalesce((metadata->>'transmitted')::boolean, false) = true
    ),
    'failed_campaign_attempts', (
      SELECT count(*) FROM public.growth_campaign_attempts WHERE status = 'failed'
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_data_health() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_data_health() TO authenticated;
