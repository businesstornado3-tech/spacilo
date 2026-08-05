-- ============================================================ staff roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('support', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policy: only service_role may grant roles.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_support_staff(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('support','admin')
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_support_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_support_staff(uuid) TO authenticated, service_role;

-- ============================================================ case enums
DO $$ BEGIN
  CREATE TYPE public.support_case_category AS ENUM (
    'inventory_mismatch','quantity_mismatch','belongings_damage','space_damage',
    'condition_concern','access_problem','handover_problem','collection_problem',
    'prohibited_item','missing_belongings','cancellation_problem','extension_problem',
    'payment_problem','refund_problem','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_case_stage AS ENUM (
    'before_storage','checkin','during_storage','checkout','after_storage',
    'cancellation','extension','payment','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_case_status AS ENUM (
    'open','waiting_for_other_party','waiting_for_reporter','under_review','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_resolution_code AS ENUM (
    'no_action','information_only','agreement_reached','refund_full','refund_partial',
    'host_adjustment','renter_adjustment','booking_cancelled','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================ cases
CREATE TABLE public.booking_support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  renter_id uuid NOT NULL,
  host_id uuid NOT NULL,
  opened_by_user_id uuid NOT NULL,
  opened_by_role text NOT NULL CHECK (opened_by_role IN ('renter','host')),
  category public.support_case_category NOT NULL,
  stage public.support_case_stage NOT NULL,
  status public.support_case_status NOT NULL DEFAULT 'open',
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 4000),
  linked_handover_issue_id uuid REFERENCES public.booking_handover_issues(id),
  assigned_to_user_id uuid,
  resolution_code public.support_resolution_code,
  resolution_summary text CHECK (resolution_summary IS NULL OR char_length(resolution_summary) <= 4000),
  financially_resolved boolean NOT NULL DEFAULT false,
  refund_total_pence integer NOT NULL DEFAULT 0,
  refund_currency text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  closed_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_cases_booking ON public.booking_support_cases (booking_id);
CREATE INDEX idx_support_cases_status ON public.booking_support_cases (status, last_activity_at DESC);
CREATE INDEX idx_support_cases_assigned ON public.booking_support_cases (assigned_to_user_id);
CREATE INDEX idx_support_cases_created ON public.booking_support_cases (created_at DESC);
-- One live case per booking + reporter + linked issue (duplicate protection).
CREATE UNIQUE INDEX support_cases_one_active_per_reporter
  ON public.booking_support_cases (booking_id, opened_by_user_id, COALESCE(linked_handover_issue_id, '00000000-0000-0000-0000-000000000000'::uuid), category)
  WHERE status NOT IN ('resolved','closed');

GRANT SELECT ON public.booking_support_cases TO authenticated;
GRANT ALL ON public.booking_support_cases TO service_role;
ALTER TABLE public.booking_support_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants and support can read cases"
  ON public.booking_support_cases FOR SELECT TO authenticated
  USING (public.is_booking_participant(booking_id, auth.uid()) OR public.is_support_staff(auth.uid()));
-- No participant INSERT/UPDATE/DELETE: creation goes through open_support_case().

-- ============================================================ messages
CREATE TABLE public.booking_support_case_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.booking_support_cases(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  author_user_id uuid NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('renter','host','support')),
  visibility text NOT NULL DEFAULT 'participants' CHECK (visibility IN ('participants','internal')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_case_messages_case ON public.booking_support_case_messages (case_id, created_at);

GRANT SELECT, INSERT ON public.booking_support_case_messages TO authenticated;
GRANT ALL ON public.booking_support_case_messages TO service_role;
ALTER TABLE public.booking_support_case_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read participant-visible or all for support"
  ON public.booking_support_case_messages FOR SELECT TO authenticated
  USING (
    public.is_support_staff(auth.uid())
    OR (visibility = 'participants' AND public.is_booking_participant(booking_id, auth.uid()))
  );

CREATE POLICY "Participants add their own case messages"
  ON public.booking_support_case_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND visibility = 'participants'
    AND author_role = public.booking_party_role(booking_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.booking_support_cases c
      WHERE c.id = case_id AND c.booking_id = booking_support_case_messages.booking_id
        AND c.status NOT IN ('resolved','closed')
    )
  );
-- No UPDATE/DELETE policies at all: messages are immutable.

-- ============================================================ evidence
CREATE TABLE public.booking_support_case_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.booking_support_cases(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  uploaded_by_user_id uuid NOT NULL,
  uploaded_by_role text NOT NULL CHECK (uploaded_by_role IN ('renter','host')),
  storage_path text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/heic')),
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 8388608),
  caption text CHECK (caption IS NULL OR char_length(caption) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_case_evidence_case ON public.booking_support_case_evidence (case_id, created_at);

GRANT SELECT, INSERT ON public.booking_support_case_evidence TO authenticated;
GRANT ALL ON public.booking_support_case_evidence TO service_role;
ALTER TABLE public.booking_support_case_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants and support read case evidence"
  ON public.booking_support_case_evidence FOR SELECT TO authenticated
  USING (public.is_booking_participant(booking_id, auth.uid()) OR public.is_support_staff(auth.uid()));

CREATE POLICY "Participants add their own case evidence"
  ON public.booking_support_case_evidence FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    AND uploaded_by_role = public.booking_party_role(booking_id, auth.uid())
    AND storage_path LIKE (booking_id::text || '/cases/' || case_id::text || '/' || auth.uid()::text || '/%')
    AND EXISTS (
      SELECT 1 FROM public.booking_support_cases c
      WHERE c.id = case_id AND c.booking_id = booking_support_case_evidence.booking_id
        AND c.status NOT IN ('resolved','closed')
    )
  );

-- ============================================================ events (audit)
CREATE TABLE public.booking_support_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.booking_support_cases(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  actor_user_id uuid,
  actor_role text NOT NULL CHECK (actor_role IN ('renter','host','support','system')),
  event_type text NOT NULL CHECK (event_type IN (
    'case_opened','message_added','evidence_linked','other_party_response','support_note',
    'status_changed','assigned','information_requested','resolution_recorded',
    'refund_requested','refund_succeeded','refund_failed','payment_adjustment_recorded','case_closed')),
  visibility text NOT NULL DEFAULT 'participants' CHECK (visibility IN ('participants','internal')),
  public_message text,
  internal_note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_case_events_case ON public.booking_support_case_events (case_id, created_at);

GRANT SELECT ON public.booking_support_case_events TO authenticated;
GRANT ALL ON public.booking_support_case_events TO service_role;
ALTER TABLE public.booking_support_case_events ENABLE ROW LEVEL SECURITY;

-- Participants never see internal rows, and never see internal_note (always
-- NULL on participant-visible rows by construction in the writing functions).
CREATE POLICY "Read case history"
  ON public.booking_support_case_events FOR SELECT TO authenticated
  USING (
    public.is_support_staff(auth.uid())
    OR (visibility = 'participants' AND public.is_booking_participant(booking_id, auth.uid()))
  );
-- Append-only: no participant INSERT/UPDATE/DELETE policy; writes are function-only.

-- ============================================================ refunds link
ALTER TABLE public.booking_refunds
  ADD COLUMN IF NOT EXISTS support_case_id uuid REFERENCES public.booking_support_cases(id);

CREATE OR REPLACE FUNCTION public.touch_support_case_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.booking_support_cases
     SET last_activity_at = now(), updated_at = now()
   WHERE id = NEW.case_id;
  RETURN NEW;
END $$;

CREATE TRIGGER support_case_messages_touch
  AFTER INSERT ON public.booking_support_case_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_case_activity();

CREATE TRIGGER support_case_evidence_touch
  AFTER INSERT ON public.booking_support_case_evidence
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_case_activity();

CREATE TRIGGER support_cases_updated_at
  BEFORE UPDATE ON public.booking_support_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================ open a case
CREATE OR REPLACE FUNCTION public.open_support_case(
  p_booking_id uuid,
  p_category public.support_case_category,
  p_stage public.support_case_stage,
  p_summary text,
  p_description text,
  p_handover_issue_id uuid DEFAULT NULL
) RETURNS public.booking_support_cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_booking public.bookings;
  v_case public.booking_support_cases;
  v_ref text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  v_role := public.booking_party_role(p_booking_id, v_uid);
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_a_booking_participant'; END IF;

  IF p_handover_issue_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.booking_handover_issues i
      WHERE i.id = p_handover_issue_id AND i.booking_id = p_booking_id) THEN
    RAISE EXCEPTION 'handover_issue_not_on_booking';
  END IF;

  -- Duplicate protection: return the existing live case instead of a second one.
  SELECT * INTO v_case FROM public.booking_support_cases
   WHERE booking_id = p_booking_id
     AND opened_by_user_id = v_uid
     AND category = p_category
     AND COALESCE(linked_handover_issue_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_handover_issue_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND status NOT IN ('resolved','closed')
   LIMIT 1;
  IF FOUND THEN RETURN v_case; END IF;

  v_ref := 'STW-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

  INSERT INTO public.booking_support_cases (
    reference, booking_id, renter_id, host_id, opened_by_user_id, opened_by_role,
    category, stage, summary, description, linked_handover_issue_id)
  VALUES (v_ref, p_booking_id, v_booking.renter_id, v_booking.host_id, v_uid, v_role,
    p_category, p_stage, left(btrim(p_summary), 160), left(btrim(p_description), 4000), p_handover_issue_id)
  RETURNING * INTO v_case;

  INSERT INTO public.booking_support_case_events
    (case_id, booking_id, actor_user_id, actor_role, event_type, public_message, metadata)
  VALUES (v_case.id, p_booking_id, v_uid, v_role, 'case_opened',
          'Support case opened.', jsonb_build_object('category', p_category, 'stage', p_stage));

  RETURN v_case;
END $$;

-- ============================================================ staff actions
CREATE OR REPLACE FUNCTION public.support_assign_case(p_case_id uuid, p_assignee uuid)
RETURNS public.booking_support_cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.booking_support_cases;
BEGIN
  IF NOT public.is_support_staff(auth.uid()) THEN RAISE EXCEPTION 'not_support_staff'; END IF;
  IF NOT public.is_support_staff(p_assignee) THEN RAISE EXCEPTION 'assignee_not_support_staff'; END IF;

  UPDATE public.booking_support_cases
     SET assigned_to_user_id = p_assignee, last_activity_at = now()
   WHERE id = p_case_id RETURNING * INTO v_case;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;

  INSERT INTO public.booking_support_case_events
    (case_id, booking_id, actor_user_id, actor_role, event_type, visibility, internal_note, metadata)
  VALUES (v_case.id, v_case.booking_id, auth.uid(), 'support', 'assigned', 'internal',
          'Case assigned.', jsonb_build_object('assigned_to', p_assignee));
  RETURN v_case;
END $$;

CREATE OR REPLACE FUNCTION public.support_add_note(p_case_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.booking_support_cases;
BEGIN
  IF NOT public.is_support_staff(auth.uid()) THEN RAISE EXCEPTION 'not_support_staff'; END IF;
  SELECT * INTO v_case FROM public.booking_support_cases WHERE id = p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;

  INSERT INTO public.booking_support_case_messages
    (case_id, booking_id, author_user_id, author_role, visibility, body)
  VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'internal', left(btrim(p_note), 4000));

  INSERT INTO public.booking_support_case_events
    (case_id, booking_id, actor_user_id, actor_role, event_type, visibility, internal_note)
  VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'support_note', 'internal', left(btrim(p_note), 4000));
END $$;

CREATE OR REPLACE FUNCTION public.support_post_update(p_case_id uuid, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.booking_support_cases;
BEGIN
  IF NOT public.is_support_staff(auth.uid()) THEN RAISE EXCEPTION 'not_support_staff'; END IF;
  SELECT * INTO v_case FROM public.booking_support_cases WHERE id = p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;

  INSERT INTO public.booking_support_case_messages
    (case_id, booking_id, author_user_id, author_role, visibility, body)
  VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'participants', left(btrim(p_message), 4000));

  INSERT INTO public.booking_support_case_events
    (case_id, booking_id, actor_user_id, actor_role, event_type, public_message)
  VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'message_added', left(btrim(p_message), 4000));
END $$;

CREATE OR REPLACE FUNCTION public.support_set_status(
  p_case_id uuid, p_status public.support_case_status, p_message text DEFAULT NULL)
RETURNS public.booking_support_cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.booking_support_cases;
BEGIN
  IF NOT public.is_support_staff(auth.uid()) THEN RAISE EXCEPTION 'not_support_staff'; END IF;

  SELECT * INTO v_case FROM public.booking_support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;
  IF v_case.status IN ('resolved','closed') THEN RAISE EXCEPTION 'case_already_resolved'; END IF;
  IF p_status IN ('resolved','closed') THEN RAISE EXCEPTION 'use_resolution_function'; END IF;

  UPDATE public.booking_support_cases
     SET status = p_status, last_activity_at = now()
   WHERE id = p_case_id RETURNING * INTO v_case;

  INSERT INTO public.booking_support_case_events
    (case_id, booking_id, actor_user_id, actor_role, event_type, public_message, metadata)
  VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support',
          CASE WHEN p_status IN ('waiting_for_reporter','waiting_for_other_party')
               THEN 'information_requested' ELSE 'status_changed' END,
          COALESCE(left(btrim(p_message), 4000), 'Case status updated.'),
          jsonb_build_object('status', p_status));

  IF p_message IS NOT NULL AND btrim(p_message) <> '' THEN
    INSERT INTO public.booking_support_case_messages
      (case_id, booking_id, author_user_id, author_role, visibility, body)
    VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'participants', left(btrim(p_message), 4000));
  END IF;

  RETURN v_case;
END $$;

-- Participant reply: recorded through a function so a waiting case can move
-- back to review without giving participants UPDATE on the case row.
CREATE OR REPLACE FUNCTION public.add_support_case_message(p_case_id uuid, p_body text)
RETURNS public.booking_support_case_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_case public.booking_support_cases;
  v_role text;
  v_msg public.booking_support_case_messages;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_case FROM public.booking_support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;

  v_role := public.booking_party_role(v_case.booking_id, v_uid);
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_a_booking_participant'; END IF;
  IF v_case.status IN ('resolved','closed') THEN RAISE EXCEPTION 'case_closed_to_updates'; END IF;

  INSERT INTO public.booking_support_case_messages
    (case_id, booking_id, author_user_id, author_role, visibility, body)
  VALUES (p_case_id, v_case.booking_id, v_uid, v_role, 'participants', left(btrim(p_body), 4000))
  RETURNING * INTO v_msg;

  INSERT INTO public.booking_support_case_events
    (case_id, booking_id, actor_user_id, actor_role, event_type, public_message)
  VALUES (p_case_id, v_case.booking_id, v_uid, v_role,
          CASE WHEN v_uid = v_case.opened_by_user_id THEN 'message_added' ELSE 'other_party_response' END,
          left(btrim(p_body), 4000));

  IF v_case.status IN ('waiting_for_reporter','waiting_for_other_party') THEN
    UPDATE public.booking_support_cases
       SET status = 'under_review', last_activity_at = now() WHERE id = p_case_id;
    INSERT INTO public.booking_support_case_events
      (case_id, booking_id, actor_role, event_type, public_message, metadata)
    VALUES (p_case_id, v_case.booking_id, 'system', 'status_changed',
            'Response received — back with support for review.',
            jsonb_build_object('status', 'under_review'));
  END IF;

  RETURN v_msg;
END $$;

-- ============================================================ resolution
CREATE OR REPLACE FUNCTION public.support_record_resolution(
  p_case_id uuid,
  p_resolution_code public.support_resolution_code,
  p_resolution_summary text,
  p_internal_note text DEFAULT NULL,
  p_close boolean DEFAULT true
) RETURNS public.booking_support_cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.booking_support_cases;
BEGIN
  IF NOT public.is_support_staff(auth.uid()) THEN RAISE EXCEPTION 'not_support_staff'; END IF;
  IF p_resolution_code IN ('refund_full','refund_partial') THEN
    RAISE EXCEPTION 'use_refund_resolution_function';
  END IF;

  SELECT * INTO v_case FROM public.booking_support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;
  IF v_case.status IN ('resolved','closed') THEN RAISE EXCEPTION 'case_already_resolved'; END IF;
  IF btrim(COALESCE(p_resolution_summary,'')) = '' THEN RAISE EXCEPTION 'resolution_summary_required'; END IF;

  UPDATE public.booking_support_cases
     SET status = CASE WHEN p_close THEN 'closed'::public.support_case_status ELSE 'resolved'::public.support_case_status END,
         resolution_code = p_resolution_code,
         resolution_summary = left(btrim(p_resolution_summary), 4000),
         resolved_at = now(), resolved_by = auth.uid(),
         closed_at = CASE WHEN p_close THEN now() ELSE NULL END,
         last_activity_at = now()
   WHERE id = p_case_id RETURNING * INTO v_case;

  INSERT INTO public.booking_support_case_events
    (case_id, booking_id, actor_user_id, actor_role, event_type, public_message, metadata)
  VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'resolution_recorded',
          left(btrim(p_resolution_summary), 4000), jsonb_build_object('resolution_code', p_resolution_code));

  IF p_internal_note IS NOT NULL AND btrim(p_internal_note) <> '' THEN
    INSERT INTO public.booking_support_case_events
      (case_id, booking_id, actor_user_id, actor_role, event_type, visibility, internal_note)
    VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'support_note', 'internal', left(btrim(p_internal_note), 4000));
  END IF;

  IF p_close THEN
    INSERT INTO public.booking_support_case_events
      (case_id, booking_id, actor_user_id, actor_role, event_type, public_message)
    VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'case_closed', 'Case closed.');
  END IF;

  RETURN v_case;
END $$;

-- Authoritative per-payment refundable view for a booking (support display).
CREATE OR REPLACE FUNCTION public.support_case_refundable(p_case_id uuid)
RETURNS TABLE (
  payment_id uuid, period_label text, period_index integer, is_extension boolean,
  currency text, paid_pence integer, refunded_pence integer, remaining_pence integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.period_label, p.period_index, p.change_request_id IS NOT NULL,
         p.currency, p.renter_total_amount_pence, p.refunded_total_pence,
         GREATEST(p.renter_total_amount_pence - p.refunded_total_pence, 0)
    FROM public.payments p
    JOIN public.booking_support_cases c ON c.booking_id = p.booking_id
   WHERE c.id = p_case_id
     AND p.status = 'succeeded'
     AND (public.is_support_staff(auth.uid()) OR public.is_booking_participant(p.booking_id, auth.uid()))
   ORDER BY p.created_at;
$$;

-- Financial resolution. Creates a PENDING refund row only; Stripe is called
-- afterwards by the server using the existing refund processor, and the signed
-- webhook remains the authority for completion.
CREATE OR REPLACE FUNCTION public.support_resolve_case_with_refund(
  p_case_id uuid,
  p_payment_id uuid,
  p_amount_pence integer,
  p_resolution_summary text,
  p_internal_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_case public.booking_support_cases;
  v_payment public.payments;
  v_remaining integer;
  v_refund public.booking_refunds;
BEGIN
  IF NOT public.is_support_staff(auth.uid()) THEN RAISE EXCEPTION 'not_support_staff'; END IF;
  IF p_amount_pence IS NULL OR p_amount_pence <= 0 THEN RAISE EXCEPTION 'refund_amount_invalid'; END IF;
  IF btrim(COALESCE(p_resolution_summary,'')) = '' THEN RAISE EXCEPTION 'resolution_summary_required'; END IF;

  SELECT * INTO v_case FROM public.booking_support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;
  IF v_case.status IN ('resolved','closed') OR v_case.financially_resolved THEN
    RAISE EXCEPTION 'case_already_resolved';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF v_payment.booking_id <> v_case.booking_id THEN RAISE EXCEPTION 'payment_not_on_booking'; END IF;
  IF v_payment.status <> 'succeeded' THEN RAISE EXCEPTION 'payment_not_succeeded'; END IF;

  v_remaining := GREATEST(v_payment.renter_total_amount_pence - v_payment.refunded_total_pence, 0);
  IF v_remaining <= 0 THEN RAISE EXCEPTION 'payment_fully_refunded'; END IF;
  IF p_amount_pence > v_remaining THEN RAISE EXCEPTION 'refund_exceeds_remaining'; END IF;

  -- The Prompt 13 partial unique index guarantees one in-flight refund per payment.
  INSERT INTO public.booking_refunds (
    booking_id, payment_id, support_case_id, stripe_payment_intent_id, stripe_charge_id,
    reason, initiated_by, status, currency,
    storage_refund_pence, service_fee_refund_pence, total_refund_pence,
    policy_version, externally_initiated)
  VALUES (
    v_case.booking_id, v_payment.id, v_case.id, v_payment.stripe_payment_intent_id, v_payment.stripe_charge_id,
    left('support_case:' || v_case.reference, 400), 'admin', 'pending', v_payment.currency,
    0, 0, p_amount_pence, public.stow_cancellation_policy_version(), false)
  RETURNING * INTO v_refund;

  -- Money is at risk on this booking: hold any untransferred host earning and
  -- record the liability append-only. Original earning history is never edited.
  UPDATE public.host_earnings
     SET hold_review = true, updated_at = now()
   WHERE booking_id = v_case.booking_id AND status <> 'transferred';

  INSERT INTO public.host_balance_adjustments (
    host_user_id, booking_id, source_type, source_id, amount_pence, currency, status, notes)
  VALUES (v_case.host_id, v_case.booking_id, 'manual_adjustment', v_refund.id::text,
          p_amount_pence, v_payment.currency, 'outstanding',
          'Support case ' || v_case.reference || ': discretionary refund against renter payment. Allocation between storage and service fee deferred.');

  UPDATE public.booking_support_cases
     SET status = 'closed',
         resolution_code = CASE WHEN p_amount_pence = v_remaining
                                THEN 'refund_full'::public.support_resolution_code
                                ELSE 'refund_partial'::public.support_resolution_code END,
         resolution_summary = left(btrim(p_resolution_summary), 4000),
         financially_resolved = true,
         refund_total_pence = p_amount_pence,
         refund_currency = v_payment.currency,
         resolved_at = now(), resolved_by = auth.uid(), closed_at = now(), last_activity_at = now()
   WHERE id = p_case_id RETURNING * INTO v_case;

  INSERT INTO public.booking_support_case_events
    (case_id, booking_id, actor_user_id, actor_role, event_type, public_message, metadata)
  VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'refund_requested',
          left(btrim(p_resolution_summary), 4000),
          jsonb_build_object('payment_id', v_payment.id, 'amount_pence', p_amount_pence,
                             'currency', v_payment.currency, 'refund_id', v_refund.id)),
         (p_case_id, v_case.booking_id, auth.uid(), 'support', 'resolution_recorded',
          left(btrim(p_resolution_summary), 4000),
          jsonb_build_object('resolution_code', v_case.resolution_code)),
         (p_case_id, v_case.booking_id, auth.uid(), 'support', 'case_closed', 'Case closed.', '{}'::jsonb);

  IF p_internal_note IS NOT NULL AND btrim(p_internal_note) <> '' THEN
    INSERT INTO public.booking_support_case_events
      (case_id, booking_id, actor_user_id, actor_role, event_type, visibility, internal_note)
    VALUES (p_case_id, v_case.booking_id, auth.uid(), 'support', 'support_note', 'internal', left(btrim(p_internal_note), 4000));
  END IF;

  RETURN jsonb_build_object(
    'refund_id', v_refund.id,
    'payment_id', v_payment.id,
    'booking_id', v_case.booking_id,
    'stripe_payment_intent_id', v_payment.stripe_payment_intent_id,
    'total_refund_pence', p_amount_pence,
    'currency', v_payment.currency,
    'reference', v_case.reference);
END $$;

-- ============================================================ grants
REVOKE ALL ON FUNCTION public.open_support_case(uuid, public.support_case_category, public.support_case_stage, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_support_case_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_assign_case(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_add_note(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_post_update(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_set_status(uuid, public.support_case_status, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_record_resolution(uuid, public.support_resolution_code, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_resolve_case_with_refund(uuid, uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_case_refundable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_support_case_activity() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.open_support_case(uuid, public.support_case_category, public.support_case_stage, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_support_case_message(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.support_assign_case(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.support_add_note(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.support_post_update(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.support_set_status(uuid, public.support_case_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.support_record_resolution(uuid, public.support_resolution_code, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.support_resolve_case_with_refund(uuid, uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.support_case_refundable(uuid) TO authenticated, service_role;

-- ============================================================ storage
-- Case evidence lives in the SAME private bucket under <booking>/cases/...
-- Participant access already comes from the Prompt 15 folder-1 policies; this
-- adds read access for support staff only.
DROP POLICY IF EXISTS "Support staff can read booking evidence" ON storage.objects;
CREATE POLICY "Support staff can read booking evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'booking-evidence' AND public.is_support_staff(auth.uid()));