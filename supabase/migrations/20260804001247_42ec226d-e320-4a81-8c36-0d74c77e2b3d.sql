-- 1. Host availability windows -------------------------------------------
ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS availability_mode text NOT NULL DEFAULT 'continuous',
  ADD COLUMN IF NOT EXISTS available_from date,
  ADD COLUMN IF NOT EXISTS available_until date;

ALTER TABLE public.spaces
  DROP CONSTRAINT IF EXISTS spaces_availability_mode_check;
ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_availability_mode_check
  CHECK (availability_mode IN ('continuous', 'window'));

ALTER TABLE public.spaces
  DROP CONSTRAINT IF EXISTS spaces_availability_window_check;
ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_availability_window_check
  CHECK (
    available_from IS NULL
    OR available_until IS NULL
    OR available_until > available_from
  );

-- Availability guard, shared by requests and extensions.
CREATE OR REPLACE FUNCTION public.stow_assert_within_availability(
  p_space_id uuid, p_start date, p_end date
) RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_mode text; v_from date; v_until date;
BEGIN
  SELECT availability_mode, available_from, available_until
    INTO v_mode, v_from, v_until
    FROM public.spaces WHERE id = p_space_id;
  IF v_mode IS DISTINCT FROM 'window' THEN RETURN; END IF;
  IF v_from IS NOT NULL AND p_start < v_from THEN
    RAISE EXCEPTION 'This space is only available from % onwards.', to_char(v_from, 'DD Mon YYYY');
  END IF;
  IF v_until IS NOT NULL AND p_end > v_until THEN
    RAISE EXCEPTION 'This space is only available until %.', to_char(v_until, 'DD Mon YYYY');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.storage_requests_check_availability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.stow_assert_within_availability(
    NEW.space_id, NEW.requested_start_date, NEW.requested_end_date);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS storage_requests_availability ON public.storage_requests;
CREATE TRIGGER storage_requests_availability
  BEFORE INSERT ON public.storage_requests
  FOR EACH ROW EXECUTE FUNCTION public.storage_requests_check_availability();

CREATE OR REPLACE FUNCTION public.booking_changes_check_availability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.stow_assert_within_availability(
    NEW.space_id, NEW.proposed_start_date, NEW.proposed_end_date);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS booking_changes_availability ON public.booking_change_requests;
CREATE TRIGGER booking_changes_availability
  BEFORE INSERT ON public.booking_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.booking_changes_check_availability();

-- 2. Two-party handover / collection --------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS renter_handover_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS host_handover_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS renter_collection_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS host_collection_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION public.confirm_booking_handover(p_booking_id uuid)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.confirm_booking_collection(p_booking_id uuid)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_renter timestamptz; v_host timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.renter_id <> v_uid AND v_booking.host_id <> v_uid THEN
    RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status = 'completed' THEN RETURN v_booking; END IF;
  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'This booking was cancelled and can''t be completed';
  END IF;
  IF v_booking.status <> 'active' THEN
    RAISE EXCEPTION 'This booking isn''t in storage, so there''s nothing to finish';
  END IF;

  v_renter := v_booking.renter_collection_confirmed_at;
  v_host := v_booking.host_collection_confirmed_at;
  IF v_uid = v_booking.renter_id THEN v_renter := COALESCE(v_renter, now()); END IF;
  IF v_uid = v_booking.host_id THEN v_host := COALESCE(v_host, now()); END IF;

  UPDATE public.bookings
     SET renter_collection_confirmed_at = v_renter,
         host_collection_confirmed_at = v_host,
         status = CASE WHEN v_renter IS NOT NULL AND v_host IS NOT NULL
                       THEN 'completed'::public.booking_status ELSE status END,
         completed_at = CASE WHEN v_renter IS NOT NULL AND v_host IS NOT NULL
                             THEN COALESCE(completed_at, now()) ELSE completed_at END
   WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END $$;

GRANT EXECUTE ON FUNCTION public.confirm_booking_handover(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_collection(uuid) TO authenticated;

-- 3. Booking messaging ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  renter_id uuid NOT NULL,
  host_id uuid NOT NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read conversations" ON public.conversations;
CREATE POLICY "Participants read conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = renter_id OR auth.uid() = host_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('renter', 'host')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at);

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read messages" ON public.messages;
CREATE POLICY "Participants read messages" ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
     WHERE c.id = conversation_id
       AND (auth.uid() = c.renter_id OR auth.uid() = c.host_id)
  ));

DROP POLICY IF EXISTS "Participants send messages" ON public.messages;
CREATE POLICY "Participants send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = conversation_id
         AND c.booking_id = messages.booking_id
         AND (auth.uid() = c.renter_id OR auth.uid() = c.host_id)
    )
  );

CREATE OR REPLACE FUNCTION public.messages_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = NEW.created_at, updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messages_touch_conversation_trg ON public.messages;
CREATE TRIGGER messages_touch_conversation_trg
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_touch_conversation();

-- Idempotent: one conversation per booking, created on demand.
CREATE OR REPLACE FUNCTION public.get_or_create_booking_conversation(p_booking_id uuid)
RETURNS conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_row public.conversations;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.renter_id <> v_uid AND v_booking.host_id <> v_uid THEN
    RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.conversations WHERE booking_id = p_booking_id;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO public.conversations (booking_id, space_id, renter_id, host_id)
  VALUES (v_booking.id, v_booking.space_id, v_booking.renter_id, v_booking.host_id)
  ON CONFLICT (booking_id) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_booking_conversation(uuid) TO authenticated;

CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();