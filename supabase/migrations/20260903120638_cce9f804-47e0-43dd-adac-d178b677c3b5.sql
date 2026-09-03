CREATE TABLE public.analytics_daily_rollups (
  rollup_date date NOT NULL,
  event_name text NOT NULL,
  total_events bigint NOT NULL DEFAULT 0,
  public_events bigint NOT NULL DEFAULT 0,
  unique_visitors bigint NOT NULL DEFAULT 0,
  sessions bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rollup_date, event_name)
);
GRANT SELECT ON public.analytics_daily_rollups TO authenticated;
GRANT ALL ON public.analytics_daily_rollups TO service_role;
ALTER TABLE public.analytics_daily_rollups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins view analytics rollups" ON public.analytics_daily_rollups FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE INDEX analytics_daily_rollups_event_date_idx ON public.analytics_daily_rollups (event_name, rollup_date DESC);

CREATE TABLE public.growth_campaign_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  status text NOT NULL,
  provider_reference text,
  error_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (campaign_id, attempt_number)
);
GRANT SELECT, INSERT, UPDATE ON public.growth_campaign_attempts TO authenticated;
GRANT ALL ON public.growth_campaign_attempts TO service_role;
ALTER TABLE public.growth_campaign_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage campaign attempts" ON public.growth_campaign_attempts FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.growth_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_key text,
  campaign_id uuid,
  event_name text NOT NULL,
  attribution_model text NOT NULL,
  destination text,
  source text,
  audience text,
  geography text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE ON public.growth_attributions TO authenticated;
GRANT ALL ON public.growth_attributions TO service_role;
ALTER TABLE public.growth_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage growth attributions" ON public.growth_attributions FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.growth_innovation_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_key text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  problem text NOT NULL,
  audience text NOT NULL,
  geography text,
  evidence_count integer NOT NULL DEFAULT 0,
  conversion_count integer NOT NULL DEFAULT 0,
  priority_score numeric NOT NULL DEFAULT 0,
  recommendation text NOT NULL,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'RECOMMENDED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_key, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_innovation_opportunities TO authenticated;
GRANT ALL ON public.growth_innovation_opportunities TO service_role;
ALTER TABLE public.growth_innovation_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage innovation opportunities" ON public.growth_innovation_opportunities FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

ALTER TABLE public.growth_campaigns
  ADD COLUMN IF NOT EXISTS campaign_fingerprint text,
  ADD COLUMN IF NOT EXISTS source_identity text,
  ADD COLUMN IF NOT EXISTS recipient_identity_hash text,
  ADD COLUMN IF NOT EXISTS send_lock text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_response_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS growth_campaigns_fingerprint_key ON public.growth_campaigns (campaign_fingerprint) WHERE campaign_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS growth_campaigns_state_idx ON public.growth_campaigns (state, created_at DESC);

CREATE OR REPLACE FUNCTION public.growth_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS analytics_daily_rollups_updated_at ON public.analytics_daily_rollups;
CREATE TRIGGER analytics_daily_rollups_updated_at BEFORE UPDATE ON public.analytics_daily_rollups FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();
DROP TRIGGER IF EXISTS growth_innovation_opportunities_updated_at ON public.growth_innovation_opportunities;
CREATE TRIGGER growth_innovation_opportunities_updated_at BEFORE UPDATE ON public.growth_innovation_opportunities FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();

CREATE OR REPLACE FUNCTION public.analytics_rebuild_daily_rollups(p_from timestamptz, p_to timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rows_written integer;
BEGIN
  IF p_to <= p_from THEN RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.analytics_daily_rollups
   WHERE rollup_date >= (p_from AT TIME ZONE 'Europe/London')::date
     AND rollup_date <= ((p_to - interval '1 microsecond') AT TIME ZONE 'Europe/London')::date;

  INSERT INTO public.analytics_daily_rollups (rollup_date, event_name, total_events, public_events, unique_visitors, sessions)
  SELECT rollup_date, event_name, count(*),
         count(*) FILTER (WHERE public.analytics_is_public_path(e.path)),
         count(DISTINCT e.visitor_ref), count(DISTINCT e.session_ref)
    FROM (
      SELECT (e.occurred_at AT TIME ZONE 'Europe/London')::date AS rollup_date,
             e.event_name, e.path, e.visitor_ref, e.session_ref
        FROM public.analytics_events e
       WHERE e.occurred_at >= p_from AND e.occurred_at < p_to
         AND e.environment = 'production' AND e.is_bot = false
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = e.user_id AND ur.role = 'admin'::public.app_role
         )
      UNION ALL
      SELECT (e.occurred_at AT TIME ZONE 'Europe/London')::date,
             '__all__', e.path, e.visitor_ref, e.session_ref
        FROM public.analytics_events e
       WHERE e.occurred_at >= p_from AND e.occurred_at < p_to
         AND e.environment = 'production' AND e.is_bot = false
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = e.user_id AND ur.role = 'admin'::public.app_role
         )
    ) e
   GROUP BY rollup_date, event_name;
  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RETURN rows_written;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_rebuild_daily_rollups(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_rebuild_daily_rollups(timestamptz, timestamptz) TO service_role;