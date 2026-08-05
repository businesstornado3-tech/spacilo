-- ============================================================
-- PROMPT 20 — Canonical notification architecture
-- ============================================================

CREATE TYPE public.notification_priority AS ENUM ('informational', 'action_required', 'important');

CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  entity_type text,
  entity_id uuid,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  action_path text,
  priority public.notification_priority NOT NULL DEFAULT 'informational',
  dedupe_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT user_notifications_title_len CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT user_notifications_body_len CHECK (char_length(body) BETWEEN 1 AND 400),
  -- Internal routes only: never an open redirect.
  CONSTRAINT user_notifications_internal_path CHECK (
    action_path IS NULL
    OR (action_path ~ '^/[A-Za-z0-9/_\-\.\?=&%]*$' AND action_path NOT LIKE '//%')
  ),
  CONSTRAINT user_notifications_event_type CHECK (event_type IN (
    'booking_request_received','booking_request_accepted','booking_request_declined',
    'booking_payment_required','booking_payment_confirmed','booking_payment_failed',
    'handover_confirmation_required','handover_confirmed_by_other_party','storage_started',
    'collection_confirmation_required','collection_confirmed_by_other_party','booking_completed',
    'new_booking_message','handover_issue_reported',
    'extension_requested','extension_accepted','extension_declined',
    'extension_payment_required','extension_confirmed','extension_dates_unavailable',
    'booking_cancelled','refund_processing','refund_completed','refund_requires_attention',
    'early_termination_requested','early_termination_accepted','early_termination_declined',
    'support_case_opened','support_response_added','support_information_required','support_case_resolved',
    'review_available','review_published','review_report_update'
  ))
);

CREATE UNIQUE INDEX user_notifications_dedupe_key_idx
  ON public.user_notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX user_notifications_feed_idx
  ON public.user_notifications (recipient_user_id, created_at DESC);
CREATE INDEX user_notifications_unread_idx
  ON public.user_notifications (recipient_user_id) WHERE read_at IS NULL AND archived_at IS NULL;
CREATE INDEX user_notifications_entity_idx
  ON public.user_notifications (entity_type, entity_id);

-- Recipients read their own feed; nobody may INSERT or DELETE via the API.
GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read their own notifications"
  ON public.user_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

-- Presentation-only self-update. A column-level trigger below rejects any
-- attempt to rewrite the system-authored content.
CREATE POLICY "Recipients update read state on their own notifications"
  ON public.user_notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.user_notifications_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted writes come from SECURITY DEFINER emitters, which run as the table owner.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.action_path IS DISTINCT FROM OLD.action_path
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
     OR NEW.metadata IS DISTINCT FROM OLD.metadata
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the read and archived state of a notification can be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_notifications_guard_update
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.user_notifications_guard();

-- ============================================================
-- Emitter: internal only. Never callable by anon/authenticated.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_user_notification(
  p_recipient uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_priority public.notification_priority DEFAULT 'informational',
  p_booking_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_action_path text DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL,
  p_collapse boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_recipient IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.user_notifications AS n (
    recipient_user_id, event_type, title, body, priority,
    booking_id, entity_type, entity_id, action_path, dedupe_key
  ) VALUES (
    p_recipient, p_event_type, p_title, p_body, p_priority,
    p_booking_id, p_entity_type, p_entity_id, p_action_path, p_dedupe_key
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
  DO UPDATE SET
    title      = CASE WHEN p_collapse THEN EXCLUDED.title ELSE n.title END,
    body       = CASE WHEN p_collapse THEN EXCLUDED.body ELSE n.body END,
    created_at = CASE WHEN p_collapse THEN now() ELSE n.created_at END,
    read_at    = CASE WHEN p_collapse THEN NULL ELSE n.read_at END,
    archived_at= CASE WHEN p_collapse THEN NULL ELSE n.archived_at END
  RETURNING n.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_notification(uuid, text, text, text, public.notification_priority, uuid, text, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Read-state RPCs (controlled, own rows only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid, p_read boolean DEFAULT true)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.user_notifications
     SET read_at = CASE WHEN p_read THEN COALESCE(read_at, now()) ELSE NULL END
   WHERE id = p_notification_id AND recipient_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.user_notifications
     SET read_at = now()
   WHERE recipient_user_id = auth.uid() AND read_at IS NULL AND archived_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_notification(p_notification_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.user_notifications
     SET archived_at = COALESCE(archived_at, now()), read_at = COALESCE(read_at, now())
   WHERE id = p_notification_id AND recipient_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.unread_notification_count()
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.user_notifications
   WHERE recipient_user_id = auth.uid() AND read_at IS NULL AND archived_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_notification(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unread_notification_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unread_notification_count() TO authenticated;

-- ============================================================
-- Route helpers (server-derived paths only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.notification_booking_path(p_booking_id uuid, p_audience text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_audience = 'host' THEN '/host/bookings'
              ELSE '/renter/bookings/' || p_booking_id::text END;
$$;

-- ============================================================
-- STORAGE REQUESTS
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_storage_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  v_name := COALESCE(NEW.renter_first_name_snapshot, 'A renter');
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM public.create_user_notification(
      NEW.host_id, 'booking_request_received',
      'New storage request',
      v_name || ' wants to store items in ' || COALESCE(NEW.space_title_snapshot, 'your space')
        || ' from ' || to_char(NEW.requested_start_date, 'DD Mon YYYY') || '.',
      'action_required', NULL, 'storage_request', NEW.id,
      '/host/requests/' || NEW.id::text, 'booking_request_received:' || NEW.id::text);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted' THEN
      PERFORM public.create_user_notification(
        NEW.renter_id, 'booking_request_accepted',
        'Request accepted',
        'Your host accepted the request. Complete payment to confirm your booking.',
        'action_required', NULL, 'storage_request', NEW.id,
        '/renter/requests/' || NEW.id::text, 'booking_request_accepted:' || NEW.id::text);
    ELSIF NEW.status = 'declined' THEN
      PERFORM public.create_user_notification(
        NEW.renter_id, 'booking_request_declined',
        'Request declined',
        'Your storage request wasn''t accepted. You can look for another space nearby.',
        'informational', NULL, 'storage_request', NEW.id,
        '/renter/search', 'booking_request_declined:' || NEW.id::text);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_storage_request_aiu
  AFTER INSERT OR UPDATE ON public.storage_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_storage_request();

-- ============================================================
-- BOOKINGS: payment, lifecycle, handover/collection, cancellation
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text := COALESCE(NEW.space_title_snapshot, 'your booking');
  v_rpath text := public.notification_booking_path(NEW.id, 'renter');
  v_hpath text := public.notification_booking_path(NEW.id, 'host');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending_payment' THEN
      PERFORM public.create_user_notification(
        NEW.renter_id, 'booking_payment_required', 'Complete your payment',
        'Pay to confirm your booking for ' || v_title || '. Nothing is reserved until payment completes.',
        'action_required', NEW.id, 'booking', NEW.id, v_rpath,
        'booking_payment_required:' || NEW.id::text);
    END IF;
    RETURN NULL;
  END IF;

  -- Status transitions
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.create_user_notification(
        NEW.renter_id, 'booking_payment_confirmed', 'Payment confirmed',
        'Your booking for ' || v_title || ' is confirmed.', 'informational',
        NEW.id, 'booking', NEW.id, v_rpath, 'booking_payment_confirmed:' || NEW.id::text || ':renter');
      PERFORM public.create_user_notification(
        NEW.host_id, 'booking_payment_confirmed', 'Booking confirmed',
        'The renter has paid. ' || v_title || ' is booked from '
          || to_char(NEW.start_date, 'DD Mon YYYY') || '.', 'informational',
        NEW.id, 'booking', NEW.id, v_hpath, 'booking_payment_confirmed:' || NEW.id::text || ':host');
    ELSIF NEW.status = 'active' THEN
      PERFORM public.create_user_notification(
        NEW.renter_id, 'storage_started', 'Storage has started',
        'Both of you confirmed the handover for ' || v_title || '.', 'informational',
        NEW.id, 'booking', NEW.id, v_rpath, 'storage_started:' || NEW.id::text || ':renter');
      PERFORM public.create_user_notification(
        NEW.host_id, 'storage_started', 'Storage has started',
        'Both of you confirmed the handover for ' || v_title || '.', 'informational',
        NEW.id, 'booking', NEW.id, v_hpath, 'storage_started:' || NEW.id::text || ':host');
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.create_user_notification(
        NEW.renter_id, 'booking_completed', 'Booking complete',
        'Your booking for ' || v_title || ' has finished.', 'informational',
        NEW.id, 'booking', NEW.id, v_rpath, 'booking_completed:' || NEW.id::text || ':renter');
      PERFORM public.create_user_notification(
        NEW.host_id, 'booking_completed', 'Booking complete',
        'The booking for ' || v_title || ' has finished.', 'informational',
        NEW.id, 'booking', NEW.id, v_hpath, 'booking_completed:' || NEW.id::text || ':host');
      -- Review availability says nothing about whether the other side reviewed.
      PERFORM public.create_user_notification(
        NEW.renter_id, 'review_available', 'You can leave a review',
        'Your booking is complete — you can leave a review.', 'informational',
        NEW.id, 'booking', NEW.id, v_rpath, 'review_available:' || NEW.id::text || ':' || NEW.renter_id::text);
      PERFORM public.create_user_notification(
        NEW.host_id, 'review_available', 'You can leave a review',
        'This booking is complete — you can leave a review.', 'informational',
        NEW.id, 'booking', NEW.id, v_hpath, 'review_available:' || NEW.id::text || ':' || NEW.host_id::text);
    ELSIF NEW.status = 'cancelled' THEN
      IF NEW.cancelled_by_role = 'host' THEN
        PERFORM public.create_user_notification(
          NEW.renter_id, 'booking_cancelled', 'Booking cancelled',
          'Your booking for ' || v_title || ' was cancelled by the host.', 'important',
          NEW.id, 'booking', NEW.id, v_rpath, 'booking_cancelled:' || NEW.id::text || ':renter');
      ELSE
        PERFORM public.create_user_notification(
          NEW.host_id, 'booking_cancelled', 'Booking cancelled',
          'The booking for ' || v_title || ' was cancelled by the renter.', 'important',
          NEW.id, 'booking', NEW.id, v_hpath, 'booking_cancelled:' || NEW.id::text || ':host');
        PERFORM public.create_user_notification(
          NEW.renter_id, 'booking_cancelled', 'Booking cancelled',
          'Your booking for ' || v_title || ' was cancelled.', 'important',
          NEW.id, 'booking', NEW.id, v_rpath, 'booking_cancelled:' || NEW.id::text || ':renter');
      END IF;
    END IF;
  END IF;

  -- Two-party confirmations: tell the other side, once.
  IF NEW.renter_handover_confirmed_at IS NOT NULL AND OLD.renter_handover_confirmed_at IS NULL THEN
    PERFORM public.create_user_notification(
      NEW.host_id, 'handover_confirmed_by_other_party', 'The renter confirmed the handover',
      'Confirm storage has started for ' || v_title || ' when you''re ready.', 'action_required',
      NEW.id, 'booking', NEW.id, v_hpath, 'handover_confirmed:' || NEW.id::text || ':renter');
  END IF;
  IF NEW.host_handover_confirmed_at IS NOT NULL AND OLD.host_handover_confirmed_at IS NULL THEN
    PERFORM public.create_user_notification(
      NEW.renter_id, 'handover_confirmed_by_other_party', 'The host confirmed the handover',
      'Confirm storage has started for ' || v_title || ' when you''re ready.', 'action_required',
      NEW.id, 'booking', NEW.id, v_rpath, 'handover_confirmed:' || NEW.id::text || ':host');
  END IF;
  IF NEW.renter_collection_confirmed_at IS NOT NULL AND OLD.renter_collection_confirmed_at IS NULL THEN
    PERFORM public.create_user_notification(
      NEW.host_id, 'collection_confirmed_by_other_party', 'The renter confirmed collection',
      'Confirm collection for ' || v_title || ' to finish this booking.', 'action_required',
      NEW.id, 'booking', NEW.id, v_hpath, 'collection_confirmed:' || NEW.id::text || ':renter');
  END IF;
  IF NEW.host_collection_confirmed_at IS NOT NULL AND OLD.host_collection_confirmed_at IS NULL THEN
    PERFORM public.create_user_notification(
      NEW.renter_id, 'collection_confirmed_by_other_party', 'The host confirmed collection',
      'Confirm collection for ' || v_title || ' to finish this booking.', 'action_required',
      NEW.id, 'booking', NEW.id, v_rpath, 'collection_confirmed:' || NEW.id::text || ':host');
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_booking_aiu
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking();

-- ============================================================
-- PAYMENTS (failure only; success is signalled by booking status)
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'failed' AND OLD.status IS DISTINCT FROM 'failed' THEN
    PERFORM public.create_user_notification(
      NEW.renter_id, 'booking_payment_failed', 'Payment didn''t go through',
      'We couldn''t take your payment. You can try again from your booking.', 'action_required',
      NEW.booking_id, 'payment', NEW.id,
      public.notification_booking_path(NEW.booking_id, 'renter'),
      'booking_payment_failed:' || NEW.id::text);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_payment_au
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment();

-- ============================================================
-- REFUNDS (renter is the refund recipient; host is never told "your refund")
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_renter uuid; v_path text;
BEGIN
  SELECT renter_id INTO v_renter FROM public.bookings WHERE id = NEW.booking_id;
  IF v_renter IS NULL THEN RETURN NULL; END IF;
  v_path := public.notification_booking_path(NEW.booking_id, 'renter');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_user_notification(
      v_renter, 'refund_processing', 'Refund processing',
      'We''re processing a refund for your booking. We''ll let you know when it completes.',
      'informational', NEW.booking_id, 'refund', NEW.id, v_path,
      'refund_processing:' || NEW.id::text);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'succeeded' THEN
      PERFORM public.create_user_notification(
        v_renter, 'refund_completed', 'Refund completed',
        'Your refund has been sent back to your original payment method.',
        'informational', NEW.booking_id, 'refund', NEW.id, v_path,
        'refund_completed:' || NEW.id::text);
    ELSIF NEW.status = 'failed' THEN
      PERFORM public.create_user_notification(
        v_renter, 'refund_requires_attention', 'Refund needs attention',
        'Your refund couldn''t be completed automatically. Our support team is reviewing it.',
        'important', NEW.booking_id, 'refund', NEW.id, v_path,
        'refund_requires_attention:' || NEW.id::text);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_refund_aiu
  AFTER INSERT OR UPDATE ON public.booking_refunds
  FOR EACH ROW EXECUTE FUNCTION public.notify_refund();

-- ============================================================
-- CHANGE REQUESTS: extensions and early termination
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_change_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_other uuid;
  v_other_role text;
  v_requester_role text := NEW.requested_by_role;
  v_is_ext boolean := (NEW.kind = 'extension');
BEGIN
  IF NEW.requested_by = NEW.host_id THEN
    v_other := NEW.renter_id; v_other_role := 'renter';
  ELSE
    v_other := NEW.host_id; v_other_role := 'host';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_is_ext THEN
      PERFORM public.create_user_notification(
        v_other, 'extension_requested', 'Extension requested',
        'The renter asked to extend storage to ' || to_char(NEW.proposed_end_date, 'DD Mon YYYY') || '.',
        'action_required', NEW.booking_id, 'change_request', NEW.id,
        public.notification_booking_path(NEW.booking_id, v_other_role),
        'extension_requested:' || NEW.id::text);
    ELSE
      PERFORM public.create_user_notification(
        v_other, 'early_termination_requested', 'Request to end storage early',
        'The ' || v_requester_role || ' asked to end storage early on '
          || to_char(NEW.proposed_end_date, 'DD Mon YYYY') || '.',
        'action_required', NEW.booking_id, 'change_request', NEW.id,
        public.notification_booking_path(NEW.booking_id, v_other_role),
        'early_termination_requested:' || NEW.id::text);
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted_awaiting_payment' THEN
      IF v_is_ext THEN
        PERFORM public.create_user_notification(
          NEW.renter_id, 'extension_payment_required', 'Extension accepted',
          'Pay for your extension to confirm the new dates.', 'action_required',
          NEW.booking_id, 'change_request', NEW.id,
          public.notification_booking_path(NEW.booking_id, 'renter'),
          'extension_accepted:' || NEW.id::text);
      ELSE
        PERFORM public.create_user_notification(
          NEW.requested_by, 'early_termination_accepted', 'Early ending agreed',
          'Your request to end storage early was accepted.', 'informational',
          NEW.booking_id, 'change_request', NEW.id,
          public.notification_booking_path(NEW.booking_id, v_requester_role),
          'early_termination_accepted:' || NEW.id::text);
      END IF;
    ELSIF NEW.status = 'declined' THEN
      PERFORM public.create_user_notification(
        NEW.requested_by,
        CASE WHEN v_is_ext THEN 'extension_declined' ELSE 'early_termination_declined' END,
        CASE WHEN v_is_ext THEN 'Extension declined' ELSE 'Early ending declined' END,
        CASE WHEN v_is_ext
          THEN 'Your extension request wasn''t accepted. The current end date still applies.'
          ELSE 'Your request to end storage early wasn''t accepted. The current end date still applies.'
        END,
        'informational', NEW.booking_id, 'change_request', NEW.id,
        public.notification_booking_path(NEW.booking_id, v_requester_role),
        'change_declined:' || NEW.id::text);
    ELSIF NEW.status = 'applied' AND v_is_ext THEN
      PERFORM public.create_user_notification(
        NEW.renter_id, 'extension_confirmed', 'Extension confirmed',
        'Your storage now runs to ' || to_char(NEW.proposed_end_date, 'DD Mon YYYY') || '.',
        'informational', NEW.booking_id, 'change_request', NEW.id,
        public.notification_booking_path(NEW.booking_id, 'renter'),
        'extension_confirmed:' || NEW.id::text || ':renter');
      PERFORM public.create_user_notification(
        NEW.host_id, 'extension_confirmed', 'Extension confirmed',
        'This booking now runs to ' || to_char(NEW.proposed_end_date, 'DD Mon YYYY') || '.',
        'informational', NEW.booking_id, 'change_request', NEW.id,
        public.notification_booking_path(NEW.booking_id, 'host'),
        'extension_confirmed:' || NEW.id::text || ':host');
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_change_request_aiu
  AFTER INSERT OR UPDATE ON public.booking_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_change_request();

-- ============================================================
-- MESSAGES — collapsed to one live notification per conversation
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_booking_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recipient uuid; v_role text; v_sender_name text; v_unread int;
BEGIN
  SELECT CASE WHEN NEW.sender_id = c.host_id THEN c.renter_id ELSE c.host_id END,
         CASE WHEN NEW.sender_id = c.host_id THEN 'renter' ELSE 'host' END
    INTO v_recipient, v_role
    FROM public.conversations c WHERE c.id = NEW.conversation_id;
  IF v_recipient IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(NULLIF(first_name, ''), 'Someone') INTO v_sender_name
    FROM public.profiles WHERE id = NEW.sender_id;

  SELECT COUNT(*) INTO v_unread FROM public.messages m
   WHERE m.conversation_id = NEW.conversation_id
     AND m.sender_id <> v_recipient
     AND m.created_at > COALESCE((
       SELECT n.read_at FROM public.user_notifications n
        WHERE n.dedupe_key = 'new_booking_message:' || NEW.conversation_id::text || ':' || v_recipient::text
     ), '-infinity'::timestamptz);

  PERFORM public.create_user_notification(
    v_recipient, 'new_booking_message',
    CASE WHEN v_unread > 1 THEN v_unread::text || ' new messages about your booking'
         ELSE COALESCE(v_sender_name, 'Someone') || ' sent you a message about your booking' END,
    'Open the conversation to read and reply.',
    'informational', NEW.booking_id, 'conversation', NEW.conversation_id,
    '/' || v_role || '/messages/' || NEW.booking_id::text,
    'new_booking_message:' || NEW.conversation_id::text || ':' || v_recipient::text,
    true);
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_booking_message_ai
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_message();

-- ============================================================
-- HANDOVER ISSUES — neutral wording, no allegations
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_handover_issue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_other uuid; v_role text;
BEGIN
  SELECT CASE WHEN NEW.reported_by = b.host_id THEN b.renter_id ELSE b.host_id END,
         CASE WHEN NEW.reported_by = b.host_id THEN 'renter' ELSE 'host' END
    INTO v_other, v_role FROM public.bookings b WHERE b.id = NEW.booking_id;
  IF v_other IS NULL THEN RETURN NULL; END IF;

  PERFORM public.create_user_notification(
    v_other, 'handover_issue_reported', 'An issue was recorded on this booking',
    'A problem was reported during ' ||
      CASE WHEN NEW.stage = 'check_in' THEN 'handover' ELSE 'collection' END ||
      '. You can view the booking record.',
    'important', NEW.booking_id, 'handover_issue', NEW.id,
    public.notification_booking_path(NEW.booking_id, v_role),
    'handover_issue_reported:' || NEW.id::text);
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_handover_issue_ai
  AFTER INSERT ON public.booking_handover_issues
  FOR EACH ROW EXECUTE FUNCTION public.notify_handover_issue();

-- ============================================================
-- SUPPORT CASES — internal notes never reach participants
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_support_case()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_other uuid; v_target uuid;
BEGIN
  v_other := CASE WHEN NEW.opened_by_user_id = NEW.host_id THEN NEW.renter_id ELSE NEW.host_id END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_user_notification(
      v_other, 'support_case_opened', 'A support case was opened',
      'A problem was reported on one of your bookings. Support will be in touch.',
      'important', NEW.booking_id, 'support_case', NEW.id,
      '/support/cases/' || NEW.id::text, 'support_case_opened:' || NEW.id::text);
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('resolved', 'closed') THEN
      PERFORM public.create_user_notification(
        NEW.renter_id, 'support_case_resolved', 'Support case updated',
        'Your support case ' || NEW.reference || ' has been resolved.', 'informational',
        NEW.booking_id, 'support_case', NEW.id, '/support/cases/' || NEW.id::text,
        'support_case_resolved:' || NEW.id::text || ':renter');
      PERFORM public.create_user_notification(
        NEW.host_id, 'support_case_resolved', 'Support case updated',
        'The support case ' || NEW.reference || ' has been resolved.', 'informational',
        NEW.booking_id, 'support_case', NEW.id, '/support/cases/' || NEW.id::text,
        'support_case_resolved:' || NEW.id::text || ':host');
    ELSIF NEW.status = 'waiting_for_reporter' OR NEW.status = 'waiting_for_other_party' THEN
      v_target := CASE WHEN NEW.status = 'waiting_for_reporter'
                       THEN NEW.opened_by_user_id ELSE v_other END;
      PERFORM public.create_user_notification(
        v_target, 'support_information_required', 'Support needs more information',
        'Support has asked for more information about case ' || NEW.reference || '.',
        'action_required', NEW.booking_id, 'support_case', NEW.id,
        '/support/cases/' || NEW.id::text,
        'support_information_required:' || NEW.id::text || ':' || NEW.status || ':'
          || to_char(NEW.last_activity_at, 'YYYYMMDDHH24MISSUS'));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_support_case_aiu
  AFTER INSERT OR UPDATE ON public.booking_support_cases
  FOR EACH ROW EXECUTE FUNCTION public.notify_support_case();

CREATE OR REPLACE FUNCTION public.notify_support_case_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_renter uuid; v_host uuid; v_ref text;
BEGIN
  -- Internal means internal: no participant ever hears about it.
  IF NEW.visibility <> 'participants' THEN RETURN NULL; END IF;

  SELECT renter_id, host_id, reference INTO v_renter, v_host, v_ref
    FROM public.booking_support_cases WHERE id = NEW.case_id;

  IF v_renter IS NOT NULL AND v_renter <> NEW.author_user_id THEN
    PERFORM public.create_user_notification(
      v_renter, 'support_response_added', 'New update on your support case',
      'There''s a new response on case ' || v_ref || '.', 'informational',
      NEW.booking_id, 'support_case', NEW.case_id, '/support/cases/' || NEW.case_id::text,
      'support_response_added:' || NEW.id::text || ':renter');
  END IF;
  IF v_host IS NOT NULL AND v_host <> NEW.author_user_id THEN
    PERFORM public.create_user_notification(
      v_host, 'support_response_added', 'New update on your support case',
      'There''s a new response on case ' || v_ref || '.', 'informational',
      NEW.booking_id, 'support_case', NEW.case_id, '/support/cases/' || NEW.case_id::text,
      'support_response_added:' || NEW.id::text || ':host');
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_support_case_message_ai
  AFTER INSERT ON public.booking_support_case_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_support_case_message();

-- ============================================================
-- REVIEWS — publication only. Submission is never announced,
-- so the double-blind window cannot leak through notifications.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_review_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.published_at IS NULL OR OLD.published_at IS NOT NULL THEN RETURN NULL; END IF;
  PERFORM public.create_user_notification(
    NEW.reviewee_id, 'review_published', 'Reviews are now available',
    'Reviews from a completed booking have been published.', 'informational',
    NEW.booking_id, 'review', NEW.id,
    public.notification_booking_path(NEW.booking_id,
      CASE WHEN NEW.reviewer_role = 'renter' THEN 'host' ELSE 'renter' END),
    'review_published:' || NEW.id::text);
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_review_published_au
  AFTER UPDATE ON public.booking_reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_review_published();

CREATE OR REPLACE FUNCTION public.notify_review_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author uuid; v_booking uuid;
BEGIN
  IF NEW.to_status IS NULL OR NEW.to_status = NEW.from_status THEN RETURN NULL; END IF;
  SELECT reviewer_id, booking_id INTO v_author, v_booking
    FROM public.booking_reviews WHERE id = NEW.review_id;
  IF v_author IS NULL THEN RETURN NULL; END IF;

  -- Neutral only: no moderation reason or internal note is ever included.
  PERFORM public.create_user_notification(
    v_author, 'review_report_update', 'There''s an update about your review',
    'The visibility of a review you wrote has changed.', 'informational',
    v_booking, 'review', NEW.review_id, NULL,
    'review_report_update:' || NEW.id::text);
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_review_moderation_ai
  AFTER INSERT ON public.booking_review_moderation_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_review_moderation();