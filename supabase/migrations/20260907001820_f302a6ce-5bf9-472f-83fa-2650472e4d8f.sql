-- ============================================================
-- Bilateral Storage Agreement
-- ============================================================

CREATE TYPE public.storage_agreement_state AS ENUM (
  'pending','renter_accepted','host_accepted','active',
  'requires_reacceptance','superseded','cancelled');

CREATE TYPE public.agreement_party AS ENUM ('renter','host');

CREATE TABLE public.storage_agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  status public.policy_version_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.storage_agreement_versions TO anon, authenticated;
GRANT ALL ON public.storage_agreement_versions TO service_role;
ALTER TABLE public.storage_agreement_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published storage terms"
  ON public.storage_agreement_versions FOR SELECT
  USING (status = 'published');

CREATE POLICY "Staff can read all storage terms"
  ON public.storage_agreement_versions FOR SELECT TO authenticated
  USING (public.is_support_staff());

CREATE TABLE public.storage_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  request_id uuid,
  space_id uuid NOT NULL,
  renter_id uuid NOT NULL,
  host_id uuid NOT NULL,
  agreement_version_id uuid NOT NULL REFERENCES public.storage_agreement_versions(id),
  agreement_version text NOT NULL,
  status public.storage_agreement_state NOT NULL DEFAULT 'pending',
  renter_accepted_at timestamptz,
  host_accepted_at timestamptz,
  activated_at timestamptz,
  superseded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX storage_agreements_one_live_per_booking
  ON public.storage_agreements (booking_id)
  WHERE status NOT IN ('superseded','cancelled');
CREATE INDEX storage_agreements_renter_idx ON public.storage_agreements (renter_id);
CREATE INDEX storage_agreements_host_idx ON public.storage_agreements (host_id);

GRANT SELECT ON public.storage_agreements TO authenticated;
GRANT ALL ON public.storage_agreements TO service_role;
ALTER TABLE public.storage_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read their own agreement"
  ON public.storage_agreements FOR SELECT TO authenticated
  USING (auth.uid() = renter_id OR auth.uid() = host_id OR public.is_support_staff());

CREATE TABLE public.storage_agreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.storage_agreements(id) ON DELETE CASCADE,
  agreement_version_id uuid NOT NULL REFERENCES public.storage_agreement_versions(id),
  agreement_version text NOT NULL,
  party public.agreement_party NOT NULL,
  user_id uuid NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (agreement_id, party)
);

CREATE INDEX storage_agreement_acceptances_user_idx
  ON public.storage_agreement_acceptances (user_id);

GRANT SELECT ON public.storage_agreement_acceptances TO authenticated;
GRANT ALL ON public.storage_agreement_acceptances TO service_role;
ALTER TABLE public.storage_agreement_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read acceptances on their agreement"
  ON public.storage_agreement_acceptances FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storage_agreements a
     WHERE a.id = agreement_id
       AND (a.renter_id = auth.uid() OR a.host_id = auth.uid() OR public.is_support_staff())));

-- Historical acceptance is immutable.
CREATE OR REPLACE FUNCTION public.stow_agreement_acceptance_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'STORAGE_AGREEMENT_ACCEPTANCE_IMMUTABLE';
END $$;

CREATE TRIGGER storage_agreement_acceptances_immutable
  BEFORE UPDATE OR DELETE ON public.storage_agreement_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.stow_agreement_acceptance_immutable();

-- Published agreement wording can never change.
CREATE OR REPLACE FUNCTION public.stow_agreement_version_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'published' AND (
       NEW.version IS DISTINCT FROM OLD.version
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.sections IS DISTINCT FROM OLD.sections
    OR NEW.effective_at IS DISTINCT FROM OLD.effective_at) THEN
    RAISE EXCEPTION 'STORAGE_AGREEMENT_VERSION_IMMUTABLE';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER storage_agreement_versions_immutable
  BEFORE UPDATE ON public.storage_agreement_versions
  FOR EACH ROW EXECUTE FUNCTION public.stow_agreement_version_immutable();

CREATE OR REPLACE FUNCTION public.stow_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER storage_agreements_touch
  BEFORE UPDATE ON public.storage_agreements
  FOR EACH ROW EXECUTE FUNCTION public.stow_touch_updated_at();

-- The one version in force.
CREATE OR REPLACE FUNCTION public.stow_active_agreement_version()
RETURNS public.storage_agreement_versions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.storage_agreement_versions
   WHERE status = 'published' AND effective_at IS NOT NULL AND effective_at <= now()
   ORDER BY effective_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.stow_agreement_audit(
  p_event text, p_agreement_id uuid, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.policy_audit_events (actor_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), p_event, 'storage_agreement', p_agreement_id, p_detail)
$$;

-- Create-or-fetch the live agreement for a booking. Participants only.
CREATE OR REPLACE FUNCTION public.get_or_create_storage_agreement(p_booking_id uuid)
RETURNS public.storage_agreements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_agreement public.storage_agreements;
  v_version public.storage_agreement_versions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.renter_id <> v_uid AND v_booking.host_id <> v_uid AND NOT public.is_support_staff() THEN
    RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_agreement FROM public.storage_agreements
   WHERE booking_id = p_booking_id AND status NOT IN ('superseded','cancelled');
  IF FOUND THEN RETURN v_agreement; END IF;

  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'STORAGE_AGREEMENT_UNAVAILABLE';
  END IF;

  v_version := public.stow_active_agreement_version();
  IF v_version.id IS NULL THEN RAISE EXCEPTION 'STORAGE_AGREEMENT_UNAVAILABLE'; END IF;

  INSERT INTO public.storage_agreements (
    booking_id, request_id, space_id, renter_id, host_id,
    agreement_version_id, agreement_version, status)
  VALUES (
    v_booking.id, v_booking.request_id, v_booking.space_id,
    v_booking.renter_id, v_booking.host_id,
    v_version.id, v_version.version, 'pending')
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_agreement;

  IF v_agreement.id IS NULL THEN
    SELECT * INTO v_agreement FROM public.storage_agreements
     WHERE booking_id = p_booking_id AND status NOT IN ('superseded','cancelled');
  ELSE
    PERFORM public.stow_agreement_audit('STORAGE_AGREEMENT_CREATED', v_agreement.id,
      jsonb_build_object('booking_id', p_booking_id, 'version', v_agreement.agreement_version));
  END IF;

  RETURN v_agreement;
END $$;

-- One party, accepting only for themselves, against one exact version.
CREATE OR REPLACE FUNCTION public.accept_storage_agreement(
  p_booking_id uuid, p_agreement_version_id uuid)
RETURNS public.storage_agreements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_agreement public.storage_agreements;
  v_party public.agreement_party;
  v_renter timestamptz; v_host timestamptz;
  v_status public.storage_agreement_state;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_agreement FROM public.storage_agreements
   WHERE booking_id = p_booking_id AND status NOT IN ('superseded','cancelled')
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STORAGE_AGREEMENT_REQUIRED'; END IF;

  IF v_uid = v_agreement.renter_id THEN v_party := 'renter';
  ELSIF v_uid = v_agreement.host_id THEN v_party := 'host';
  ELSE RAISE EXCEPTION 'STORAGE_AGREEMENT_NOT_A_PARTY' USING ERRCODE = '42501';
  END IF;

  IF p_agreement_version_id IS DISTINCT FROM v_agreement.agreement_version_id THEN
    RAISE EXCEPTION 'STORAGE_AGREEMENT_VERSION_CHANGED';
  END IF;

  INSERT INTO public.storage_agreement_acceptances (
    agreement_id, agreement_version_id, agreement_version, party, user_id)
  VALUES (v_agreement.id, v_agreement.agreement_version_id,
          v_agreement.agreement_version, v_party, v_uid)
  ON CONFLICT (agreement_id, party) DO NOTHING;

  v_renter := v_agreement.renter_accepted_at;
  v_host := v_agreement.host_accepted_at;
  IF v_party = 'renter' THEN v_renter := COALESCE(v_renter, now()); END IF;
  IF v_party = 'host' THEN v_host := COALESCE(v_host, now()); END IF;

  v_status := CASE
    WHEN v_renter IS NOT NULL AND v_host IS NOT NULL THEN 'active'
    WHEN v_renter IS NOT NULL THEN 'renter_accepted'
    WHEN v_host IS NOT NULL THEN 'host_accepted'
    ELSE 'pending' END::public.storage_agreement_state;

  UPDATE public.storage_agreements
     SET renter_accepted_at = v_renter,
         host_accepted_at = v_host,
         status = v_status,
         activated_at = CASE WHEN v_status = 'active' THEN COALESCE(activated_at, now())
                             ELSE activated_at END
   WHERE id = v_agreement.id
  RETURNING * INTO v_agreement;

  PERFORM public.stow_agreement_audit(
    CASE WHEN v_party = 'renter' THEN 'RENTER_STORAGE_AGREEMENT_ACCEPTED'
         ELSE 'HOST_STORAGE_AGREEMENT_ACCEPTED' END,
    v_agreement.id,
    jsonb_build_object('booking_id', p_booking_id, 'version', v_agreement.agreement_version));

  IF v_agreement.status = 'active' THEN
    PERFORM public.stow_agreement_audit('STORAGE_AGREEMENT_ACTIVATED', v_agreement.id,
      jsonb_build_object('booking_id', p_booking_id, 'version', v_agreement.agreement_version));
  END IF;

  RETURN v_agreement;
END $$;

-- Read-only state for the UI.
CREATE OR REPLACE FUNCTION public.get_storage_agreement_state(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_agreement public.storage_agreements;
  v_version public.storage_agreement_versions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.renter_id <> v_uid AND v_booking.host_id <> v_uid AND NOT public.is_support_staff() THEN
    RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_agreement FROM public.storage_agreements
   WHERE booking_id = p_booking_id AND status NOT IN ('superseded','cancelled');
  v_version := public.stow_active_agreement_version();

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'viewer_party', CASE WHEN v_uid = v_booking.renter_id THEN 'renter'
                         WHEN v_uid = v_booking.host_id THEN 'host' ELSE 'staff' END,
    'agreement', CASE WHEN v_agreement.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_agreement.id,
        'status', v_agreement.status,
        'agreement_version_id', v_agreement.agreement_version_id,
        'agreement_version', v_agreement.agreement_version,
        'renter_accepted_at', v_agreement.renter_accepted_at,
        'host_accepted_at', v_agreement.host_accepted_at,
        'activated_at', v_agreement.activated_at) END,
    'current_version', CASE WHEN v_version.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_version.id, 'version', v_version.version,
        'title', v_version.title, 'summary', v_version.summary,
        'sections', v_version.sections, 'effective_at', v_version.effective_at) END,
    'version_current', v_agreement.agreement_version_id IS NOT DISTINCT FROM v_version.id,
    'active', v_agreement.status = 'active');
END $$;

-- A cancelled booking cancels its agreement.
CREATE OR REPLACE FUNCTION public.stow_cancel_agreement_with_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.storage_agreements
       SET status = 'cancelled', cancelled_at = now()
     WHERE booking_id = NEW.id AND status NOT IN ('superseded','cancelled');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bookings_cancel_storage_agreement
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.stow_cancel_agreement_with_booking();

-- Publishing new terms supersedes any agreement not yet active.
CREATE OR REPLACE FUNCTION public.publish_storage_agreement_version(
  p_version_id uuid, p_effective_at timestamptz DEFAULT now())
RETURNS public.storage_agreement_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_version public.storage_agreement_versions;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;

  UPDATE public.storage_agreement_versions
     SET status = 'published', effective_at = p_effective_at, published_at = now()
   WHERE id = p_version_id AND status = 'draft'
  RETURNING * INTO v_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a draft can be published'; END IF;

  UPDATE public.storage_agreements
     SET status = 'superseded', superseded_at = now()
   WHERE status IN ('pending','renter_accepted','host_accepted','requires_reacceptance')
     AND agreement_version_id <> p_version_id;

  RETURN v_version;
END $$;

-- ============================================================
-- Handover gate: no finalisation without an ACTIVE agreement
-- ============================================================

CREATE OR REPLACE FUNCTION public.stow_require_active_agreement(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.storage_agreements
     WHERE booking_id = p_booking_id AND status = 'active'
       AND renter_accepted_at IS NOT NULL AND host_accepted_at IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.storage_agreement_acceptances ra
                    WHERE ra.agreement_id = storage_agreements.id AND ra.party = 'renter'
                      AND ra.agreement_version_id = storage_agreements.agreement_version_id)
       AND EXISTS (SELECT 1 FROM public.storage_agreement_acceptances ha
                    WHERE ha.agreement_id = storage_agreements.id AND ha.party = 'host'
                      AND ha.agreement_version_id = storage_agreements.agreement_version_id)
  ) THEN
    RAISE EXCEPTION 'STORAGE_AGREEMENT_REQUIRED';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_booking_handover(p_booking_id uuid)
 RETURNS bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_blocked boolean;
  v_renter timestamptz; v_host timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.renter_id <> v_uid AND v_booking.host_id <> v_uid THEN
    RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status = 'active' THEN RETURN v_booking; END IF;
  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'This booking was cancelled and can''t be started';
  END IF;
  IF v_booking.status = 'completed' THEN
    RAISE EXCEPTION 'This booking has already finished';
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'This booking isn''t confirmed yet, so storage can''t start';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments WHERE booking_id = p_booking_id AND status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'This booking hasn''t been paid, so storage can''t start';
  END IF;

  SELECT COALESCE(bool_or(hold_dispute), false) INTO v_blocked
    FROM public.host_earnings WHERE booking_id = p_booking_id;
  IF v_blocked THEN
    RAISE EXCEPTION 'There''s an open payment query on this booking';
  END IF;

  IF v_booking.start_date > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'Storage can only start on or after the booking''s start date';
  END IF;

  -- Bilateral Storage Agreement must be ACTIVE before items are finalised.
  PERFORM public.stow_require_active_agreement(p_booking_id);

  v_renter := v_booking.renter_handover_confirmed_at;
  v_host := v_booking.host_handover_confirmed_at;
  IF v_uid = v_booking.renter_id THEN v_renter := COALESCE(v_renter, now()); END IF;
  IF v_uid = v_booking.host_id THEN v_host := COALESCE(v_host, now()); END IF;

  UPDATE public.bookings
     SET renter_handover_confirmed_at = v_renter,
         host_handover_confirmed_at = v_host,
         status = CASE WHEN v_renter IS NOT NULL AND v_host IS NOT NULL
                       THEN 'active'::public.booking_status ELSE status END,
         activated_at = CASE WHEN v_renter IS NOT NULL AND v_host IS NOT NULL
                             THEN COALESCE(activated_at, now()) ELSE activated_at END
   WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END $function$;

CREATE OR REPLACE FUNCTION public.activate_booking(p_booking_id uuid)
 RETURNS bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_blocked boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.renter_id <> v_uid AND v_booking.host_id <> v_uid THEN
    RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status = 'active' THEN RETURN v_booking; END IF;

  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'This booking was cancelled and can''t be started';
  END IF;
  IF v_booking.status = 'completed' THEN
    RAISE EXCEPTION 'This booking has already finished';
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'This booking isn''t confirmed yet, so storage can''t start';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
     WHERE booking_id = p_booking_id AND status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'This booking hasn''t been paid, so storage can''t start';
  END IF;

  SELECT COALESCE(bool_or(hold_dispute), false) INTO v_blocked
    FROM public.host_earnings WHERE booking_id = p_booking_id;
  IF v_blocked THEN
    RAISE EXCEPTION 'There''s an open payment query on this booking';
  END IF;

  IF v_booking.start_date > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'Storage can only start on or after the booking''s start date';
  END IF;

  PERFORM public.stow_require_active_agreement(p_booking_id);

  UPDATE public.bookings
     SET status = 'active'::public.booking_status, activated_at = now()
   WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END $function$;

-- ============================================================
-- Safety intelligence
-- ============================================================

CREATE TYPE public.safety_severity AS ENUM ('low','medium','high','critical');
CREATE TYPE public.safety_source AS ENUM (
  'item_scan','renter_report','host_report','handover_report',
  'listing_review','support_case','policy_screen','admin_review');
CREATE TYPE public.safety_scope AS ENUM ('listing','booking','storage_arrangement','account');
CREATE TYPE public.safety_state AS ENUM ('active','safety_review','suspended');

ALTER TABLE public.booking_support_cases
  ADD COLUMN safety_severity public.safety_severity,
  ADD COLUMN safety_source public.safety_source,
  ADD COLUMN safety_flagged_at timestamptz,
  ADD COLUMN safety_note text;

CREATE INDEX booking_support_cases_safety_idx
  ON public.booking_support_cases (safety_severity, status)
  WHERE safety_severity IS NOT NULL;

-- Advisory hazard prompts from the photo scanner. Never authoritative.
ALTER TABLE public.inventory_items
  ADD COLUMN hazard_signals jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE public.safety_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope public.safety_scope NOT NULL,
  subject_id uuid NOT NULL,
  state public.safety_state NOT NULL DEFAULT 'safety_review',
  reason text NOT NULL,
  source public.safety_source NOT NULL,
  case_id uuid REFERENCES public.booking_support_cases(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  lifted_by uuid,
  lifted_at timestamptz,
  lift_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX safety_suspensions_subject_idx ON public.safety_suspensions (scope, subject_id);
CREATE UNIQUE INDEX safety_suspensions_one_live
  ON public.safety_suspensions (scope, subject_id) WHERE lifted_at IS NULL;

GRANT SELECT ON public.safety_suspensions TO authenticated;
GRANT ALL ON public.safety_suspensions TO service_role;
ALTER TABLE public.safety_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read safety suspensions"
  ON public.safety_suspensions FOR SELECT TO authenticated
  USING (public.is_support_staff());

CREATE TRIGGER safety_suspensions_touch
  BEFORE UPDATE ON public.safety_suspensions
  FOR EACH ROW EXECUTE FUNCTION public.stow_touch_updated_at();

CREATE OR REPLACE FUNCTION public.set_support_case_safety(
  p_case_id uuid,
  p_severity public.safety_severity,
  p_source public.safety_source,
  p_note text DEFAULT NULL)
RETURNS public.booking_support_cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.booking_support_cases;
BEGIN
  IF NOT public.is_support_staff() THEN
    RAISE EXCEPTION 'not_support_staff' USING ERRCODE = '42501';
  END IF;

  UPDATE public.booking_support_cases
     SET safety_severity = p_severity,
         safety_source = p_source,
         safety_note = COALESCE(p_note, safety_note),
         safety_flagged_at = COALESCE(safety_flagged_at, now()),
         last_activity_at = now(),
         updated_at = now()
   WHERE id = p_case_id
  RETURNING * INTO v_case;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;

  INSERT INTO public.booking_support_case_events (case_id, actor_id, actor_role, event_type, detail)
  VALUES (p_case_id, auth.uid(), 'staff', 'safety_severity_set',
          jsonb_build_object('severity', p_severity, 'source', p_source));

  RETURN v_case;
END $$;

CREATE OR REPLACE FUNCTION public.apply_safety_suspension(
  p_scope public.safety_scope,
  p_subject_id uuid,
  p_state public.safety_state,
  p_reason text,
  p_source public.safety_source,
  p_case_id uuid DEFAULT NULL)
RETURNS public.safety_suspensions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.safety_suspensions;
BEGIN
  IF NOT public.is_support_staff() THEN
    RAISE EXCEPTION 'not_support_staff' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'safety_reason_required';
  END IF;

  INSERT INTO public.safety_suspensions (scope, subject_id, state, reason, source, case_id, created_by)
  VALUES (p_scope, p_subject_id, p_state, p_reason, p_source, p_case_id, auth.uid())
  RETURNING * INTO v_row;

  INSERT INTO public.policy_audit_events (actor_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), 'SAFETY_SUSPENSION_APPLIED', p_scope::text, p_subject_id,
          jsonb_build_object('state', p_state, 'source', p_source, 'case_id', p_case_id));

  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.lift_safety_suspension(
  p_suspension_id uuid, p_reason text)
RETURNS public.safety_suspensions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.safety_suspensions;
BEGIN
  IF NOT public.is_support_staff() THEN
    RAISE EXCEPTION 'not_support_staff' USING ERRCODE = '42501';
  END IF;

  UPDATE public.safety_suspensions
     SET lifted_at = now(), lifted_by = auth.uid(), lift_reason = p_reason
   WHERE id = p_suspension_id AND lifted_at IS NULL
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'suspension_not_found'; END IF;

  INSERT INTO public.policy_audit_events (actor_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), 'SAFETY_SUSPENSION_LIFTED', v_row.scope::text, v_row.subject_id,
          jsonb_build_object('suspension_id', v_row.id));

  RETURN v_row;
END $$;

-- Admin safety queue over the existing support cases.
CREATE OR REPLACE FUNCTION public.admin_safety_queue()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cases jsonb; v_controls jsonb;
BEGIN
  IF NOT public.is_support_staff() THEN
    RAISE EXCEPTION 'not_support_staff' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'severity_rank', x->>'created_at' DESC), '[]'::jsonb)
    INTO v_cases
    FROM (
      SELECT jsonb_build_object(
        'id', c.id, 'reference', c.reference, 'booking_id', c.booking_id,
        'renter_id', c.renter_id, 'host_id', c.host_id,
        'category', c.category, 'stage', c.stage, 'status', c.status,
        'summary', c.summary,
        'severity', c.safety_severity, 'source', c.safety_source,
        'severity_rank', CASE c.safety_severity
            WHEN 'critical' THEN '1' WHEN 'high' THEN '2'
            WHEN 'medium' THEN '3' ELSE '4' END,
        'created_at', c.created_at, 'last_activity_at', c.last_activity_at,
        'evidence_count', (SELECT count(*) FROM public.booking_support_case_evidence e
                            WHERE e.case_id = c.id),
        'booking_status', b.status,
        'payment_hold', COALESCE((SELECT bool_or(h.hold_dispute) FROM public.host_earnings h
                                   WHERE h.booking_id = c.booking_id), false)
      ) AS x
      FROM public.booking_support_cases c
      LEFT JOIN public.bookings b ON b.id = c.booking_id
      WHERE c.safety_severity IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT 200) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'scope', s.scope, 'subject_id', s.subject_id, 'state', s.state,
      'reason', s.reason, 'source', s.source, 'case_id', s.case_id,
      'created_at', s.created_at)), '[]'::jsonb)
    INTO v_controls
    FROM public.safety_suspensions s WHERE s.lifted_at IS NULL;

  RETURN jsonb_build_object('cases', v_cases, 'controls', v_controls, 'generated_at', now());
END $$;

-- ============================================================
-- First published Storage Agreement version
-- ============================================================

INSERT INTO public.storage_agreement_versions
  (version, status, title, summary, sections, effective_at, published_at)
VALUES (
  'ER-STORAGE-2026-09-01-v1', 'published', 'EarnRoom Storage Terms',
  'The terms the host and renter each accept before items are finalised in the storage space. Both parties must accept the same version.',
  '[
    {"heading":"1. What EarnRoom does","body":"EarnRoom is a platform that enables hosts and renters to connect and arrange storage. EarnRoom provides discovery, storage-arrangement tools, policy screening, reporting and safety mechanisms. EarnRoom does not take possession of, own or control the renter''s stored goods as part of the storage arrangement."},
    {"heading":"2. Host responsibilities","body":"The host is responsible for providing a suitable storage space, for describing that space accurately, and for complying with applicable law. The host must not knowingly permit prohibited, illegal, dangerous or unauthorised hazardous goods to be stored in their space, and should use EarnRoom''s reporting tools where a concern arises."},
    {"heading":"3. Renter responsibilities","body":"The renter is responsible for accurately identifying their goods and for ensuring that the goods they arrange to store are lawful and permitted under EarnRoom''s Storage Rules and applicable law. The renter must provide accurate information about what is being stored."},
    {"heading":"4. Prohibited and restricted goods","body":"EarnRoom''s published Storage Rules set out which goods are allowed, restricted, need identification or are prohibited. Those rules are the authoritative list and apply in full to this arrangement. Neither party may use EarnRoom to arrange storage of prohibited, illegal, dangerous or hazardous goods."},
    {"heading":"5. Safety and lawful storage","body":"Both the host and the renter are responsible for complying with applicable laws and EarnRoom''s Storage Rules. If an item appears to present an immediate danger, do not open, move or handle it. Where there is an immediate threat to life or property, contact the appropriate emergency service."},
    {"heading":"6. Accuracy of item information","body":"Item information provided by the renter, including anything suggested by EarnRoom''s photo tools, must be reviewed and confirmed by the renter. Automated suggestions are advisory only and never decide whether an item may be stored."},
    {"heading":"7. Reporting concerns","body":"Either party may report a concern through EarnRoom at handover or at any point during storage. Reports are reviewed by EarnRoom staff alongside any evidence provided."},
    {"heading":"8. Platform enforcement","body":"EarnRoom may restrict, suspend or cancel a storage arrangement where there is a safety, policy, legal or compliance concern, in accordance with its policies and applicable law. Existing payment, hold and refund mechanisms may be used while a concern is reviewed."},
    {"heading":"9. Agreement activation","body":"This agreement becomes active only when the host and the renter have each independently accepted the same version. Items may not be finalised in the storage space, and storage may not begin, until the agreement is active."},
    {"heading":"10. Version and review","body":"These terms are centrally managed and versioned. Accepted versions are recorded and never altered. If a new version is published, an agreement that is not yet active must be accepted again. These terms are subject to UK legal review before being treated as final legal terms."}
  ]'::jsonb,
  now(), now());