-- 1. Host declaration is required before a listing goes live -------------------
CREATE OR REPLACE FUNCTION public.spaces_validate_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile public.space_suitability_profiles%ROWTYPE;
BEGIN
  IF NEW.listing_status IN ('published','paused') THEN
    IF NEW.space_type IS NULL THEN RAISE EXCEPTION 'A space type is required before publishing.'; END IF;
    IF btrim(NEW.title) = '' THEN RAISE EXCEPTION 'A title is required before publishing.'; END IF;
    IF NEW.postcode IS NULL OR btrim(NEW.postcode) = '' THEN RAISE EXCEPTION 'A postcode is required before publishing.'; END IF;
    IF btrim(NEW.description) = '' THEN RAISE EXCEPTION 'A description is required before publishing.'; END IF;
    IF NEW.storage_mode IS NULL THEN RAISE EXCEPTION 'Choose whole or part of the space before publishing.'; END IF;
    IF NEW.monthly_price_pence IS NULL OR NEW.monthly_price_pence <= 0 THEN RAISE EXCEPTION 'A monthly price is required before publishing.'; END IF;
    IF NEW.access_type IS NULL THEN RAISE EXCEPTION 'Access information is required before publishing.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.space_photos p WHERE p.space_id = NEW.id) THEN
      RAISE EXCEPTION 'At least one photo is required before publishing.';
    END IF;

    SELECT * INTO v_profile FROM public.space_suitability_profiles WHERE space_id = NEW.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Please describe the space and confirm the host declarations before publishing.';
    END IF;
    IF NOT (v_profile.declaration_authority
            AND v_profile.declaration_compliance
            AND v_profile.declaration_accuracy)
       OR v_profile.declared_at IS NULL THEN
      RAISE EXCEPTION 'Please confirm all three host declarations before publishing.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Published policy versions and their rules are immutable -------------------
CREATE OR REPLACE FUNCTION public.storage_policy_versions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A published storage policy version cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('published','retired') THEN
    IF NEW.version IS DISTINCT FROM OLD.version
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.summary IS DISTINCT FROM OLD.summary
       OR NEW.sections IS DISTINCT FROM OLD.sections
       OR NEW.effective_at IS DISTINCT FROM OLD.effective_at
       OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'A published storage policy version cannot be changed. Create a new version instead.';
    END IF;
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'A published storage policy version cannot return to draft.';
    END IF;
    IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
      RAISE EXCEPTION 'A retired storage policy version cannot be reinstated.';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_storage_policy_versions_guard ON public.storage_policy_versions;
CREATE TRIGGER trg_storage_policy_versions_guard
  BEFORE UPDATE OR DELETE ON public.storage_policy_versions
  FOR EACH ROW EXECUTE FUNCTION public.storage_policy_versions_guard();

CREATE OR REPLACE FUNCTION public.storage_policy_rules_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.policy_version_status;
BEGIN
  SELECT status INTO v_status FROM public.storage_policy_versions
   WHERE id = COALESCE(NEW.policy_version_id, OLD.policy_version_id);
  IF v_status IN ('published','retired') THEN
    RAISE EXCEPTION 'Rules of a published storage policy version cannot be changed. Create a new version instead.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_storage_policy_rules_guard ON public.storage_policy_rules;
CREATE TRIGGER trg_storage_policy_rules_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.storage_policy_rules
  FOR EACH ROW EXECUTE FUNCTION public.storage_policy_rules_guard();

-- 3. Controlled admin-only policy lifecycle ------------------------------------
CREATE OR REPLACE FUNCTION public.create_policy_draft(
  p_version text,
  p_title text,
  p_summary text DEFAULT '',
  p_sections jsonb DEFAULT '[]'::jsonb,
  p_copy_rules_from uuid DEFAULT NULL
)
RETURNS public.storage_policy_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.storage_policy_versions;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only staff can change the storage policy.';
  END IF;
  IF p_version IS NULL OR btrim(p_version) = '' OR p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'A version number and title are required.';
  END IF;

  INSERT INTO public.storage_policy_versions (version, status, title, summary, sections, created_by)
  VALUES (btrim(p_version), 'draft', btrim(p_title), coalesce(p_summary,''),
          coalesce(p_sections,'[]'::jsonb), auth.uid())
  RETURNING * INTO v_row;

  IF p_copy_rules_from IS NOT NULL THEN
    INSERT INTO public.storage_policy_rules (
      policy_version_id, rule_key, category, subcategory, decision, severity,
      requires_user_confirmation, requires_staff_review, renter_message, host_message,
      internal_reason_code, required_space_attributes, sort_order, is_active)
    SELECT v_row.id, r.rule_key, r.category, r.subcategory, r.decision, r.severity,
           r.requires_user_confirmation, r.requires_staff_review, r.renter_message, r.host_message,
           r.internal_reason_code, r.required_space_attributes, r.sort_order, r.is_active
      FROM public.storage_policy_rules r
     WHERE r.policy_version_id = p_copy_rules_from;
  END IF;

  INSERT INTO public.policy_audit_events (actor_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), 'policy_draft_created', 'storage_policy_version', v_row.id,
          jsonb_build_object('version', v_row.version, 'copied_rules_from', p_copy_rules_from));

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_policy_draft(text, text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_policy_draft(text, text, text, jsonb, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.publish_policy_version(
  p_version_id uuid,
  p_effective_at timestamptz DEFAULT now()
)
RETURNS public.storage_policy_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.storage_policy_versions;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only staff can publish the storage policy.';
  END IF;

  SELECT * INTO v_row FROM public.storage_policy_versions WHERE id = p_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That policy version no longer exists.'; END IF;
  IF v_row.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be published.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.storage_policy_rules r
                  WHERE r.policy_version_id = v_row.id AND r.is_active) THEN
    RAISE EXCEPTION 'A policy version needs at least one active rule before it can be published.';
  END IF;

  UPDATE public.storage_policy_versions
     SET status = 'published',
         effective_at = coalesce(p_effective_at, now()),
         published_at = now()
   WHERE id = v_row.id
   RETURNING * INTO v_row;

  UPDATE public.storage_policy_versions
     SET status = 'retired', retired_at = now()
   WHERE status = 'published' AND id <> v_row.id;

  INSERT INTO public.policy_audit_events (actor_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), 'policy_version_published', 'storage_policy_version', v_row.id,
          jsonb_build_object('version', v_row.version, 'effective_at', v_row.effective_at));

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.publish_policy_version(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_policy_version(uuid, timestamptz) TO authenticated, service_role;