-- 1. Space suitability: remove blanket public row access.
DROP POLICY IF EXISTS "Public reads suitability of published spaces" ON public.space_suitability_profiles;

CREATE OR REPLACE FUNCTION public.get_space_suitability_public(p_space_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'space_id', p.space_id,
    'attributes', COALESCE(p.attributes, '{}'::jsonb),
    'host_confirmed_at', p.host_confirmed_at,
    'declaration_complete', (
      COALESCE(p.declaration_authority, false)
      AND COALESCE(p.declaration_compliance, false)
      AND COALESCE(p.declaration_accuracy, false)
      AND p.declared_at IS NOT NULL
    ),
    'declared_at', p.declared_at
  )
  FROM public.space_suitability_profiles p
  JOIN public.spaces s ON s.id = p.space_id
  WHERE p.space_id = p_space_id
    AND s.listing_status = 'published'::listing_status
$$;

REVOKE ALL ON FUNCTION public.get_space_suitability_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_space_suitability_public(uuid) TO anon, authenticated, service_role;

-- 2. Storage policy rules: remove public access to internal staff metadata.
DROP POLICY IF EXISTS "Anyone reads rules of published versions" ON public.storage_policy_rules;

CREATE POLICY "Admins read all policy rules"
ON public.storage_policy_rules
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_public_policy_rules(p_version_id uuid)
RETURNS TABLE (
  id uuid,
  policy_version_id uuid,
  rule_key text,
  category text,
  subcategory text,
  decision policy_decision,
  severity smallint,
  requires_user_confirmation boolean,
  renter_message text,
  required_space_attributes jsonb,
  sort_order integer,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.policy_version_id, r.rule_key, r.category, r.subcategory, r.decision,
         r.severity, r.requires_user_confirmation, r.renter_message,
         r.required_space_attributes, r.sort_order, r.is_active
  FROM public.storage_policy_rules r
  JOIN public.storage_policy_versions v ON v.id = r.policy_version_id
  WHERE r.policy_version_id = p_version_id
    AND r.is_active = true
    AND v.status IN ('published'::policy_version_status, 'retired'::policy_version_status)
  ORDER BY r.sort_order ASC
$$;

REVOKE ALL ON FUNCTION public.get_public_policy_rules(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_policy_rules(uuid) TO anon, authenticated, service_role;