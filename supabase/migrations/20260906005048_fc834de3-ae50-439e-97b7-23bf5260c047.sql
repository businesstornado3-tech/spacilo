-- Autonomous marketing & growth intelligence storage (founder-only).
CREATE TABLE IF NOT EXISTS public.marketing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.marketing_settings TO authenticated;
GRANT ALL ON public.marketing_settings TO service_role;
ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_settings_admin" ON public.marketing_settings FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id text PRIMARY KEY,
  plan_date date NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  opportunity_key text NOT NULL,
  topic text NOT NULL,
  audience text NOT NULL,
  location_slug text,
  hook text NOT NULL,
  campaign jsonb NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_campaigns_plan_date_idx ON public.marketing_campaigns (plan_date DESC);
CREATE INDEX IF NOT EXISTS marketing_campaigns_status_idx ON public.marketing_campaigns (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_campaigns_admin" ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.marketing_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  platform text NOT NULL,
  state text NOT NULL,
  platform_post_id text,
  platform_url text,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, platform)
);
CREATE INDEX IF NOT EXISTS marketing_publications_campaign_idx ON public.marketing_publications (campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_publications TO authenticated;
GRANT ALL ON public.marketing_publications TO service_role;
ALTER TABLE public.marketing_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_publications_admin" ON public.marketing_publications FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.marketing_platform_connections (
  platform text PRIMARY KEY,
  connection text NOT NULL DEFAULT 'REQUIRES_CONFIGURATION',
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_platform_connections TO authenticated;
GRANT ALL ON public.marketing_platform_connections TO service_role;
ALTER TABLE public.marketing_platform_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_platform_connections_admin" ON public.marketing_platform_connections FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.marketing_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  platform text NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversions jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform_specific jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (asset_id, platform, collected_at)
);
CREATE INDEX IF NOT EXISTS marketing_performance_campaign_idx ON public.marketing_performance (campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_performance TO authenticated;
GRANT ALL ON public.marketing_performance TO service_role;
ALTER TABLE public.marketing_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_performance_admin" ON public.marketing_performance FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.marketing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail text NOT NULL,
  actor text NOT NULL DEFAULT 'engine',
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_audit_campaign_idx ON public.marketing_audit (campaign_id, created_at DESC);
GRANT SELECT, INSERT ON public.marketing_audit TO authenticated;
GRANT ALL ON public.marketing_audit TO service_role;
ALTER TABLE public.marketing_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_audit_admin" ON public.marketing_audit FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER marketing_campaigns_touch BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();
CREATE TRIGGER marketing_publications_touch BEFORE UPDATE ON public.marketing_publications
  FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();
CREATE TRIGGER marketing_settings_touch BEFORE UPDATE ON public.marketing_settings
  FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();
CREATE TRIGGER marketing_platform_connections_touch BEFORE UPDATE ON public.marketing_platform_connections
  FOR EACH ROW EXECUTE FUNCTION public.growth_touch_updated_at();