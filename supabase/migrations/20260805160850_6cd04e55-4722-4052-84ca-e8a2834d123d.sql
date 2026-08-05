CREATE TYPE public.policy_decision AS ENUM (
  'allowed','allowed_with_confirmation','restricted','prohibited',
  'needs_identification','needs_review'
);
CREATE TYPE public.policy_version_status AS ENUM ('draft','published','retired');

CREATE TABLE public.storage_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  status public.policy_version_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  legal_review_required boolean NOT NULL DEFAULT true,
  effective_at timestamptz,
  published_at timestamptz,
  retired_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.storage_policy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id uuid NOT NULL REFERENCES public.storage_policy_versions(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  category text NOT NULL,
  subcategory text,
  decision public.policy_decision NOT NULL,
  severity smallint NOT NULL DEFAULT 0,
  requires_user_confirmation boolean NOT NULL DEFAULT false,
  requires_staff_review boolean NOT NULL DEFAULT false,
  renter_message text NOT NULL,
  host_message text,
  internal_reason_code text NOT NULL,
  required_space_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_version_id, rule_key)
);
CREATE INDEX idx_policy_rules_version ON public.storage_policy_rules(policy_version_id, category);

GRANT SELECT ON public.storage_policy_versions TO anon, authenticated;
GRANT SELECT ON public.storage_policy_rules TO anon, authenticated;
GRANT ALL ON public.storage_policy_versions TO service_role;
GRANT ALL ON public.storage_policy_rules TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.storage_policy_versions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.storage_policy_rules TO authenticated;

ALTER TABLE public.storage_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_policy_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads published policy versions"
  ON public.storage_policy_versions FOR SELECT
  USING (status IN ('published','retired') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage policy versions"
  ON public.storage_policy_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone reads rules of published versions"
  ON public.storage_policy_rules FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.storage_policy_versions v
             WHERE v.id = policy_version_id AND v.status IN ('published','retired'))
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Admins manage policy rules"
  ON public.storage_policy_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.policy_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  policy_version_id uuid NOT NULL REFERENCES public.storage_policy_versions(id),
  role text NOT NULL CHECK (role IN ('renter','host')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_policy_acceptances_user ON public.policy_acceptances(user_id, accepted_at DESC);
GRANT SELECT ON public.policy_acceptances TO authenticated;
GRANT ALL ON public.policy_acceptances TO service_role;
ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own acceptances"
  ON public.policy_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.policy_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  event_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_policy_audit_created ON public.policy_audit_events(created_at DESC);
GRANT SELECT ON public.policy_audit_events TO authenticated;
GRANT ALL ON public.policy_audit_events TO service_role;
ALTER TABLE public.policy_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read policy audit"
  ON public.policy_audit_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.inventory_items
  ADD COLUMN policy_category text,
  ADD COLUMN policy_provenance text NOT NULL DEFAULT 'manual'
    CHECK (policy_provenance IN ('ai_proposed','renter_confirmed','renter_corrected','manual')),
  ADD COLUMN policy_confirmed_at timestamptz,
  ADD COLUMN policy_note text;

CREATE TABLE public.space_suitability_profiles (
  space_id uuid PRIMARY KEY REFERENCES public.spaces(id) ON DELETE CASCADE,
  host_id uuid NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  host_notes text,
  host_confirmed_at timestamptz,
  declaration_authority boolean NOT NULL DEFAULT false,
  declaration_compliance boolean NOT NULL DEFAULT false,
  declaration_accuracy boolean NOT NULL DEFAULT false,
  declared_at timestamptz,
  declared_policy_version_id uuid REFERENCES public.storage_policy_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.space_suitability_profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.space_suitability_profiles TO authenticated;
GRANT ALL ON public.space_suitability_profiles TO service_role;
ALTER TABLE public.space_suitability_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads suitability of published spaces"
  ON public.space_suitability_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.spaces s
                  WHERE s.id = space_id AND s.listing_status = 'published'));
CREATE POLICY "Hosts read their own suitability profiles"
  ON public.space_suitability_profiles FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Hosts insert suitability for their own spaces"
  ON public.space_suitability_profiles FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND s.host_id = auth.uid()));
CREATE POLICY "Hosts update suitability for their own spaces"
  ON public.space_suitability_profiles FOR UPDATE TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

CREATE TABLE public.space_ai_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  host_id uuid NOT NULL,
  observation_key text NOT NULL,
  observation text NOT NULL,
  confidence numeric(4,3),
  source text NOT NULL DEFAULT 'spacefit_ai',
  verification_state text NOT NULL DEFAULT 'ai_proposed'
    CHECK (verification_state IN ('ai_proposed','host_confirmed','host_corrected','host_rejected')),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_space_ai_obs_space ON public.space_ai_observations(space_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.space_ai_observations TO authenticated;
GRANT ALL ON public.space_ai_observations TO service_role;
ALTER TABLE public.space_ai_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hosts manage their own space observations"
  ON public.space_ai_observations FOR ALL TO authenticated
  USING (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (host_id = auth.uid());

ALTER TABLE public.storage_requests
  ADD COLUMN policy_version_snapshot text,
  ADD COLUMN policy_version_id_snapshot uuid,
  ADD COLUMN policy_screening_snapshot jsonb,
  ADD COLUMN compatibility_snapshot jsonb,
  ADD COLUMN renter_declaration_snapshot jsonb,
  ADD COLUMN space_suitability_snapshot jsonb;

ALTER TABLE public.bookings
  ADD COLUMN policy_version_snapshot text,
  ADD COLUMN policy_version_id_snapshot uuid,
  ADD COLUMN policy_screening_snapshot jsonb,
  ADD COLUMN compatibility_snapshot jsonb,
  ADD COLUMN renter_declaration_snapshot jsonb,
  ADD COLUMN space_suitability_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.stow_policy_category(
  p_category text, p_item_name text, p_catalogue_key text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN n ~ '(petrol|diesel|jerry ?can|fuel|paraffin|kerosene)' THEN 'fuel'
    WHEN n ~ '(gas cylinder|gas bottle|propane|butane|calor|compressed gas|scuba tank|oxygen cylinder)' THEN 'compressed_gas'
    WHEN n ~ '(firework|explosive|flare|ammunition|ammo|gunpowder)' THEN 'explosives'
    WHEN n ~ '(firearm|shotgun|rifle|pistol|handgun|crossbow|machete|weapon)' THEN 'weapons'
    WHEN n ~ '(paint|solvent|thinner|white spirit|acetone|bleach|pesticide|weedkiller|chemical|acid)' THEN 'chemicals'
    WHEN n ~ '(lithium battery|battery pack|e-?bike battery|generator)' THEN 'flammable'
    WHEN n ~ '(drug|cannabis|narcotic|controlled substance)' THEN 'controlled_substances'
    WHEN n ~ '(medicine|medication|prescription|insulin|tablets)' THEN 'medicines'
    WHEN n ~ '(medical waste|biological|specimen|sharps)' THEN 'biological'
    WHEN n ~ '(waste|rubbish|refuse|scrap)' THEN 'waste'
    WHEN n ~ '(cash|banknote|bullion|gold bar|securities|share certificate)' THEN 'cash_securities'
    WHEN n ~ '(passport|deed|will|birth certificate|irreplaceable)' THEN 'irreplaceable_documents'
    WHEN n ~ '(animal|pet|reptile|livestock)' THEN 'animals'
    WHEN n ~ '(plant|seedling|compost|soil|bulbs)' THEN 'plants'
    WHEN n ~ '(food|frozen|perishable|milk|meat|groceries)' THEN 'perishables'
    WHEN n ~ '(wine|beer|spirits|liquid|drum|barrel|water butt)' THEN 'liquids'
    WHEN n ~ '(sealed container|unmarked box|unknown|unidentified|mystery)' THEN 'unidentified_container'
    WHEN c = 'bicycles' THEN 'bicycles'
    WHEN c = 'electronics' THEN 'electronics'
    WHEN c = 'furniture' THEN 'furniture'
    WHEN c = 'appliances' THEN 'appliances'
    WHEN c = 'documents' THEN 'documents'
    ELSE 'household'
  END
  FROM (SELECT lower(coalesce(p_item_name,'')) AS n, lower(coalesce(p_category,'')) AS c) t;
$$;

CREATE OR REPLACE FUNCTION public.stow_active_policy_version()
RETURNS public.storage_policy_versions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.storage_policy_versions
   WHERE status = 'published' AND effective_at IS NOT NULL AND effective_at <= now()
   ORDER BY effective_at DESC, published_at DESC
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.stow_active_policy_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stow_active_policy_version() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stow_screen_inventory(p_inventory_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.storage_policy_versions;
  v_items jsonb;
BEGIN
  v_version := public.stow_active_policy_version();
  IF v_version.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_active_policy');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'item_id', x.id,
      'label', x.item_name,
      'policy_category', x.pol_cat,
      'decision', coalesce(x.decision::text, 'allowed'),
      'reason_code', coalesce(x.internal_reason_code, 'policy_default_allowed'),
      'message', coalesce(x.renter_message, ''),
      'requires_confirmation', coalesce(x.requires_user_confirmation, false),
      'requires_staff_review', coalesce(x.requires_staff_review, false),
      'confirmed', x.policy_confirmed_at IS NOT NULL,
      'provenance', x.policy_provenance
    ) ORDER BY x.item_name), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT i.id, i.item_name, i.policy_confirmed_at, i.policy_provenance,
           coalesce(i.policy_category,
                    public.stow_policy_category(i.category::text, i.item_name, i.catalogue_key)) AS pol_cat,
           r.decision, r.internal_reason_code, r.renter_message,
           r.requires_user_confirmation, r.requires_staff_review
      FROM public.inventory_items i
      LEFT JOIN public.storage_policy_rules r
        ON r.policy_version_id = v_version.id
       AND r.is_active
       AND r.category = coalesce(i.policy_category,
             public.stow_policy_category(i.category::text, i.item_name, i.catalogue_key))
     WHERE i.inventory_id = p_inventory_id AND i.user_id = p_user_id
  ) x;

  RETURN jsonb_build_object(
    'ok', true,
    'policy_version', v_version.version,
    'policy_version_id', v_version.id,
    'screened_at', now(),
    'items', v_items,
    'blocked', EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_items) e
       WHERE e->>'decision' = 'prohibited'
    ),
    'action_required', EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_items) e
       WHERE (e->>'decision' IN ('needs_identification','needs_review')
              OR (e->>'requires_confirmation')::boolean)
         AND NOT (e->>'confirmed')::boolean
    )
  );
END
$$;
REVOKE EXECUTE ON FUNCTION public.stow_screen_inventory(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stow_screen_inventory(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.screen_my_inventory(p_inventory_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.renter_inventories
                  WHERE id = p_inventory_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'We couldn''t find your inventory.';
  END IF;
  RETURN public.stow_screen_inventory(p_inventory_id, auth.uid());
END
$$;
REVOKE EXECUTE ON FUNCTION public.screen_my_inventory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.screen_my_inventory(uuid) TO authenticated;