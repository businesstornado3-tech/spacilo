-- 1. Count extension payment holds against availability.
CREATE OR REPLACE FUNCTION public.space_available_volume_m3(p_space_id uuid, p_start date, p_end date, p_exclude_booking uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usable numeric; v_confirmed numeric; v_held numeric; v_ext_held numeric;
BEGIN
  SELECT COALESCE(estimated_available_volume_m3, total_volume_m3, 0)
    INTO v_usable FROM public.spaces WHERE id = p_space_id;
  IF v_usable IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(b.estimated_storage_requirement_m3_snapshot), 0)
    INTO v_confirmed
  FROM public.bookings b
  WHERE b.space_id = p_space_id
    AND b.status IN ('confirmed', 'active')
    AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
    AND b.start_date < p_end AND b.end_date > p_start;

  SELECT COALESCE(SUM(p.hold_volume_m3), 0)
    INTO v_held
  FROM public.payments p
  JOIN public.bookings b ON b.id = p.booking_id
  WHERE p.space_id = p_space_id
    AND p.status IN ('requires_payment', 'processing')
    AND p.hold_released_at IS NULL
    AND p.hold_expires_at > now()
    AND b.status = 'pending_payment'
    AND p.change_request_id IS NULL
    AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
    AND b.start_date < p_end AND b.end_date > p_start;

  -- Extension holds sit on already-confirmed bookings, so they are measured
  -- against the payment's own extra window rather than the booking dates.
  SELECT COALESCE(SUM(p.hold_volume_m3), 0)
    INTO v_ext_held
  FROM public.payments p
  JOIN public.bookings b ON b.id = p.booking_id
  WHERE p.space_id = p_space_id
    AND p.change_request_id IS NOT NULL
    AND p.status IN ('requires_payment', 'processing')
    AND p.hold_released_at IS NULL
    AND p.hold_expires_at > now()
    AND b.status IN ('confirmed', 'active')
    AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
    AND p.period_start IS NOT NULL AND p.period_end IS NOT NULL
    AND p.period_start < p_end AND p.period_end > p_start;

  RETURN v_usable - v_confirmed - v_held - v_ext_held;
END $function$;

-- 2. Extension checkout now actually reserves the extra window.
CREATE OR REPLACE FUNCTION public.begin_extension_checkout(p_change_id uuid)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_change public.booking_change_requests;
  v_booking public.bookings;
  v_payment public.payments;
  v_available numeric;
  v_period integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_change FROM public.booking_change_requests WHERE id = p_change_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extension not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_change.renter_id <> v_uid THEN
    RAISE EXCEPTION 'Only the renter can pay for this extension' USING ERRCODE = '42501';
  END IF;
  IF v_change.status <> 'accepted_awaiting_payment' THEN
    RAISE EXCEPTION 'This extension is not awaiting payment' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_change.booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.status NOT IN ('confirmed', 'active') THEN
    RAISE EXCEPTION 'This booking cannot be extended right now' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = v_booking.space_id FOR UPDATE;

  UPDATE public.payments
  SET status = 'expired', hold_released_at = COALESCE(hold_released_at, now())
  WHERE booking_id = v_booking.id
    AND status IN ('requires_payment', 'processing')
    AND (hold_expires_at IS NULL OR hold_expires_at <= now());

  SELECT * INTO v_payment FROM public.payments
  WHERE change_request_id = p_change_id
    AND status IN ('requires_payment', 'processing')
    AND hold_released_at IS NULL
    AND hold_expires_at > now()
  LIMIT 1;
  IF FOUND THEN
    RETURN v_payment;
  END IF;

  v_available := public.space_available_volume_m3(
    v_booking.space_id, v_change.original_end_date, v_change.proposed_end_date, v_booking.id);
  IF v_available < v_booking.estimated_storage_requirement_m3_snapshot THEN
    RAISE EXCEPTION 'Those dates are no longer available' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(period_index), 0) + 1 INTO v_period
  FROM public.payments WHERE booking_id = v_booking.id;

  INSERT INTO public.payments (
    booking_id, change_request_id, renter_id, host_id, space_id, provider,
    storage_amount_pence, service_fee_amount_pence, renter_total_amount_pence,
    service_fee_rate_bps, service_fee_minimum_pence, currency,
    status, period_index, period_label,
    hold_volume_m3, hold_expires_at, checkout_created_at,
    period_start, period_end
  ) VALUES (
    v_booking.id, v_change.id, v_booking.renter_id, v_booking.host_id, v_booking.space_id, 'stripe',
    v_change.additional_storage_amount_pence, v_change.additional_service_fee_pence,
    v_change.additional_total_pence,
    COALESCE(v_booking.service_fee_rate_bps, 1200),
    COALESCE(v_booking.service_fee_minimum_pence, 500),
    UPPER(COALESCE(v_change.currency, 'GBP')),
    'requires_payment', v_period, 'Extension',
    COALESCE(v_booking.estimated_storage_requirement_m3_snapshot, 0),
    now() + interval '30 minutes', now(),
    v_change.original_end_date, v_change.proposed_end_date
  ) RETURNING * INTO v_payment;

  RETURN v_payment;
END $function$;

-- 3. Host acceptance re-checks availability server-side.
CREATE OR REPLACE FUNCTION public.respond_to_booking_extension(p_change_id uuid, p_accept boolean, p_note text DEFAULT NULL::text)
 RETURNS booking_change_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.booking_change_requests;
  v_booking public.bookings;
  v_available numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_row FROM public.booking_change_requests
   WHERE id = p_change_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.host_id <> v_uid THEN
    RAISE EXCEPTION 'Only the host can answer this request' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: an answered request is returned unchanged.
  IF v_row.status <> 'pending' THEN RETURN v_row; END IF;

  IF p_accept THEN
    SELECT * INTO v_booking FROM public.bookings WHERE id = v_row.booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
    IF v_booking.status NOT IN ('confirmed', 'active') THEN
      RAISE EXCEPTION 'This booking can no longer be extended' USING ERRCODE = 'P0001';
    END IF;

    PERFORM 1 FROM public.spaces WHERE id = v_booking.space_id FOR UPDATE;

    v_available := public.space_available_volume_m3(
      v_booking.space_id, v_row.original_end_date, v_row.proposed_end_date, v_booking.id);
    IF v_available < v_booking.estimated_storage_requirement_m3_snapshot THEN
      RAISE EXCEPTION 'Those dates are no longer available' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.booking_change_requests
     SET status = CASE WHEN p_accept
                       THEN 'accepted_awaiting_payment'::public.booking_change_status
                       ELSE 'declined'::public.booking_change_status END,
         host_response_note = nullif(btrim(coalesce(p_note, '')), ''),
         responded_at = now(),
         responded_by = v_uid
   WHERE id = p_change_id
  RETURNING * INTO v_row;

  -- The booking's dates are deliberately NOT changed here: an extension only
  -- takes effect once its additional payment is confirmed by Stripe.
  RETURN v_row;
END $function$;

-- 4. Final availability check before an extension is applied after payment.
CREATE OR REPLACE FUNCTION public.confirm_booking_payment(p_event_id text, p_event_type text, p_payment_id uuid, p_session_id text, p_payment_intent_id text, p_amount_pence integer, p_currency text, p_livemode boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments;
  v_booking public.bookings;
  v_change public.booking_change_requests;
  v_available numeric;
  v_outcome text;
BEGIN
  INSERT INTO public.stripe_webhook_events (id, type, livemode, payment_id)
  VALUES (p_event_id, p_event_type, p_livemode, p_payment_id)
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'duplicate_event', 'confirmed', false);
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    v_outcome := 'payment_not_found';
  ELSIF v_payment.status = 'succeeded' THEN
    v_outcome := 'already_succeeded';
  ELSIF v_payment.livemode IS NOT NULL AND v_payment.livemode <> p_livemode THEN
    v_outcome := 'livemode_mismatch';
  ELSIF v_payment.renter_total_amount_pence <> p_amount_pence THEN
    v_outcome := 'amount_mismatch';
  ELSIF UPPER(v_payment.currency) <> UPPER(p_currency) THEN
    v_outcome := 'currency_mismatch';
  ELSE
    SELECT * INTO v_booking FROM public.bookings WHERE id = v_payment.booking_id FOR UPDATE;

    UPDATE public.payments SET
      status = 'succeeded',
      livemode = p_livemode,
      stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, p_session_id),
      stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
      amount_received_pence = p_amount_pence,
      currency_received = UPPER(p_currency),
      succeeded_at = now(),
      last_webhook_at = now(),
      hold_released_at = COALESCE(hold_released_at, now())
    WHERE id = p_payment_id;

    v_outcome := 'confirmed';

    IF v_payment.change_request_id IS NOT NULL THEN
      SELECT * INTO v_change FROM public.booking_change_requests
       WHERE id = v_payment.change_request_id FOR UPDATE;

      IF FOUND AND v_change.status = 'accepted_awaiting_payment' THEN
        -- Last line of defence against overlapping bookings. The paid window
        -- was held until this moment, so this should not normally trigger.
        v_available := public.space_available_volume_m3(
          v_booking.space_id, v_change.original_end_date, v_change.proposed_end_date, v_booking.id);

        IF v_available < COALESCE(v_booking.estimated_storage_requirement_m3_snapshot, 0) THEN
          v_outcome := 'extension_dates_unavailable';
        ELSE
          UPDATE public.booking_change_requests
             SET status = 'applied'::public.booking_change_status, updated_at = now()
           WHERE id = v_change.id;

          UPDATE public.bookings SET
            end_date = v_change.proposed_end_date,
            duration_days_snapshot = (v_change.proposed_end_date - start_date)
          WHERE id = v_booking.id;
        END IF;
      END IF;
    ELSIF v_booking.status = 'pending_payment' THEN
      UPDATE public.bookings SET
        status = 'confirmed',
        paid_at = COALESCE(paid_at, now()),
        confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = v_booking.id;
    END IF;

    PERFORM public.record_host_earning(p_payment_id);
  END IF;

  IF v_outcome NOT IN ('confirmed', 'extension_dates_unavailable') AND v_payment.id IS NOT NULL THEN
    UPDATE public.payments SET last_webhook_at = now(), failure_reason = v_outcome
    WHERE id = p_payment_id AND status <> 'succeeded';
  END IF;

  UPDATE public.stripe_webhook_events
  SET processed_at = now(), outcome = v_outcome, booking_id = v_payment.booking_id
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'confirmed', v_outcome IN ('confirmed', 'extension_dates_unavailable'));
END;
$function$;