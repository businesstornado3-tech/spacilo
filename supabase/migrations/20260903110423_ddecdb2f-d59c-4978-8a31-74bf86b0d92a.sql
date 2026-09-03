CREATE TABLE public.growth_connectors (
  id text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL,
  flag text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  connected boolean NOT NULL DEFAULT false,
  level text NOT NULL DEFAULT 'BLOCKED',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  rate_limit jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_days integer NOT NULL DEFAULT 90,
  last_sync_at timestamptz,
  last_error text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_connectors TO authenticated;
GRANT ALL ON public.growth_connectors TO service_role;
ALTER TABLE public.growth_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage growth connectors" ON public.growth_connectors FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.growth_opportunities (
  key text PRIMARY KEY,
  signal_id text NOT NULL,
  connector_id text NOT NULL,
  situation jsonb NOT NULL DEFAULT '{}'::jsonb,
  pain_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  fit jsonb NOT NULL DEFAULT '{}'::jsonb,
  supply jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  campaign_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'NEW',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  latest_seen_at timestamptz NOT NULL DEFAULT now(),
  frequency integer NOT NULL DEFAULT 1,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_opportunities TO authenticated;
GRANT ALL ON public.growth_opportunities TO service_role;
ALTER TABLE public.growth_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage growth opportunities" ON public.growth_opportunities FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.growth_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_key text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  channel text,
  message jsonb,
  state text NOT NULL DEFAULT 'DISCOVERED',
  decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  expires_at timestamptz,
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_campaigns TO authenticated;
GRANT ALL ON public.growth_campaigns TO service_role;
ALTER TABLE public.growth_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage growth campaigns" ON public.growth_campaigns FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.growth_learning_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_key text NOT NULL,
  channel text,
  outcome text NOT NULL,
  value_pence integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.growth_learning_signals TO authenticated;
GRANT ALL ON public.growth_learning_signals TO service_role;
ALTER TABLE public.growth_learning_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins view growth learning" ON public.growth_learning_signals FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.growth_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  problem text NOT NULL,
  audience text NOT NULL,
  geography text,
  evidence_count integer NOT NULL DEFAULT 0,
  supporting_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text NOT NULL,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'NEW',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_insights TO authenticated;
GRANT ALL ON public.growth_insights TO service_role;
ALTER TABLE public.growth_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage growth insights" ON public.growth_insights FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.growth_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  reason text NOT NULL,
  source text NOT NULL,
  reference_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.growth_audit_events TO authenticated;
GRANT ALL ON public.growth_audit_events TO service_role;
ALTER TABLE public.growth_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins view growth audit" ON public.growth_audit_events FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.growth_autonomy_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  budgets jsonb NOT NULL DEFAULT '{}'::jsonb,
  emergency_stop boolean NOT NULL DEFAULT false,
  paused_connectors jsonb NOT NULL DEFAULT '[]'::jsonb,
  paused_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  suppressed_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_retention_days integer NOT NULL DEFAULT 90,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_autonomy_config TO authenticated;
GRANT ALL ON public.growth_autonomy_config TO service_role;
ALTER TABLE public.growth_autonomy_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage growth autonomy" ON public.growth_autonomy_config FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.growth_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER growth_connectors_updated_at BEFORE UPDATE ON public.growth_connectors FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();
CREATE TRIGGER growth_opportunities_updated_at BEFORE UPDATE ON public.growth_opportunities FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();
CREATE TRIGGER growth_campaigns_updated_at BEFORE UPDATE ON public.growth_campaigns FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();
CREATE TRIGGER growth_insights_updated_at BEFORE UPDATE ON public.growth_insights FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();
CREATE TRIGGER growth_autonomy_config_updated_at BEFORE UPDATE ON public.growth_autonomy_config FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();

INSERT INTO public.growth_autonomy_config (id, flags)
VALUES (true, '{"PHASE11_ENABLED":true,"AI_OPPORTUNITY_RADAR_ENABLED":true,"AI_CAMPAIGN_ENGINE_ENABLED":true,"AI_AUTONOMOUS_SEND_ENABLED":false,"AI_LEARNING_ENGINE_ENABLED":true,"AI_PRODUCT_DISCOVERY_ENABLED":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.growth_connectors (id, name, kind, flag, enabled, connected, level, permissions, notes)
VALUES ('first_party', 'EarnRoom first-party signals', 'first_party', 'CONNECTOR_FIRST_PARTY_ENABLED', true, true, 'DISCOVER_ANALYSE_AND_CAMPAIGN', '{"read":true,"search":true,"message":true,"campaign":true,"termsStatus":"authorised"}'::jsonb, 'EarnRoom-owned searches, tools and journey events.')
ON CONFLICT (id) DO NOTHING;