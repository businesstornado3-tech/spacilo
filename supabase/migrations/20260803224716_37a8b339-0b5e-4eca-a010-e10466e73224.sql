ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;

ALTER TABLE public.host_earnings
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;

-- Backfill: extension payments cover only the extra dates.
UPDATE public.payments p
SET period_start = c.original_end_date, period_end = c.proposed_end_date
FROM public.booking_change_requests c
WHERE c.id = p.change_request_id AND p.period_start IS NULL;

-- Backfill: original payments cover the booking start through the first
-- applied extension's original end date (i.e. the pre-extension end date).
UPDATE public.payments p
SET period_start = b.start_date,
    period_end = COALESCE(
      (SELECT MIN(c.original_end_date) FROM public.booking_change_requests c
        WHERE c.booking_id = b.id AND c.status = 'applied'),
      b.end_date)
FROM public.bookings b
WHERE b.id = p.booking_id AND p.change_request_id IS NULL AND p.period_start IS NULL;

UPDATE public.host_earnings e
SET period_start = p.period_start, period_end = p.period_end
FROM public.payments p
WHERE p.id = e.payment_id AND e.period_start IS NULL;

-- Checkout records the period each payment covers.
CREATE OR REPLACE FUNCTION public.begin_booking_checkout(p_booking_id uuid)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_payment public.payments;
  v_available numeric;
  v_fee integer;
  v_total integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.renter_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the renter can pay for this booking' USING ERRCODE = '42501';
  END IF;
  IF v_booking.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'This booking is not awaiting payment' USING ERRCODE = 'P0001';
  END IF;
  IF v_booking.storage_amount_pence IS NULL OR v_booking.storage_amount_pence <= 0 THEN
    RAISE EXCEPTION 'This booking has no agreed price' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = v_booking.space_id FOR UPDATE;

  UPDATE public.payments
  SET status = 'expired', hold_released_at = COALESCE(hold_released_at, now())
  WHERE booking_id = p_booking_id
    AND status IN ('requires_payment', 'processing')
    AND (hold_expires_at IS NULL OR hold_expires_at <= now());

  SELECT * INTO v_payment FROM public.payments
  WHERE booking_id = p_booking_id
    AND status IN ('requires_payment', 'processing')
    AND hold_released_at IS NULL
    AND hold_expires_at > now()
  LIMIT 1;

  IF FOUND THEN
    RETURN v_payment;
  END IF;

  v_available := public.space_available_volume_m3(
    v_booking.space_id, v_booking.start_date, v_booking.end_date, v_booking.id
  );
  IF v_available < v_booking.estimated_storage_requirement_m3_snapshot THEN
    RAISE EXCEPTION 'This space no longer has enough availability for your requested dates.'
      USING ERRCODE = 'P0001';
  END IF;

  v_fee := public.stow_service_fee_pence(
    v_booking.storage_amount_pence,
    COALESCE(v_booking.service_fee_rate_bps, 1200),
    COALESCE(v_booking.service_fee_minimum_pence, 500)
  );
  v_total := v_booking.storage_amount_pence + v_fee;

  INSERT INTO public.payments (
    booking_id, renter_id, host_id, space_id, provider,
    storage_amount_pence, service_fee_amount_pence, renter_total_amount_pence,
    service_fee_rate_bps, service_fee_minimum_pence, currency,
    status, hold_volume_m3, hold_expires_at, checkout_created_at,
    period_start, period_end
  ) VALUES (
    v_booking.id, v_booking.renter_id, v_booking.host_id, v_booking.space_id, 'stripe',
    v_booking.storage_amount_pence, v_fee, v_total,
    COALESCE(v_booking.service_fee_rate_bps, 1200),
    COALESCE(v_booking.service_fee_minimum_pence, 500),
    UPPER(COALESCE(v_booking.currency, 'GBP')),
    'requires_payment', v_booking.estimated_storage_requirement_m3_snapshot,
    now() + interval '30 minutes', now(),
    v_booking.start_date, v_booking.end_date
  ) RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$function$;

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
    RAISE EXCEPTION 'This space is no longer available for the extra dates' USING ERRCODE = 'P0001';
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
    0, now() + interval '30 minutes', now(),
    v_change.original_end_date, v_change.proposed_end_date
  ) RETURNING * INTO v_payment;

  RETURN v_payment;
END $function$;

-- Earnings inherit the payment's immutable period.
CREATE OR REPLACE FUNCTION public.record_host_earning(p_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments;
  v_booking public.bookings;
  v_id uuid;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR v_payment.status <> 'succeeded' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_payment.booking_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.host_earnings (
    host_user_id, booking_id, payment_id, space_id, currency,
    period_index, period_label, period_start, period_end,
    gross_storage_amount_pence, platform_fee_pence, host_entitlement_pence,
    service_fee_rate_bps, service_fee_minimum_pence,
    status, eligible_at, livemode
  ) VALUES (
    v_payment.host_id, v_payment.booking_id, v_payment.id, v_payment.space_id,
    UPPER(v_payment.currency), v_payment.period_index, v_payment.period_label,
    COALESCE(v_payment.period_start, v_booking.start_date),
    COALESCE(v_payment.period_end, v_booking.end_date),
    v_payment.storage_amount_pence, v_payment.service_fee_amount_pence,
    v_payment.storage_amount_pence,
    v_payment.service_fee_rate_bps, v_payment.service_fee_minimum_pence,
    'pending', public.stow_payout_eligible_at(v_booking.start_date), v_payment.livemode
  )
  ON CONFLICT (payment_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Applying an extension moves the booking's CURRENT period only. The
-- booking's original financial snapshot stays as history; cumulative totals
-- are derived from the payment records.
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

    IF v_payment.change_request_id IS NOT NULL THEN
      UPDATE public.booking_change_requests
         SET status = 'applied'::public.booking_change_status, updated_at = now()
       WHERE id = v_payment.change_request_id
         AND status = 'accepted_awaiting_payment'
      RETURNING * INTO v_change;

      IF FOUND THEN
        UPDATE public.bookings SET
          end_date = v_change.proposed_end_date,
          duration_days_snapshot = (v_change.proposed_end_date - start_date)
        WHERE id = v_booking.id;
      END IF;
    ELSIF v_booking.status = 'pending_payment' THEN
      UPDATE public.bookings SET
        status = 'confirmed',
        paid_at = COALESCE(paid_at, now()),
        confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = v_booking.id;
    END IF;

    PERFORM public.record_host_earning(p_payment_id);

    v_outcome := 'confirmed';
  END IF;

  IF v_outcome <> 'confirmed' AND v_payment.id IS NOT NULL THEN
    UPDATE public.payments SET last_webhook_at = now(), failure_reason = v_outcome
    WHERE id = p_payment_id AND status <> 'succeeded';
  END IF;

  UPDATE public.stripe_webhook_events
  SET processed_at = now(), outcome = v_outcome, booking_id = v_payment.booking_id
  WHERE id = p_event_id;

  RETURN jsonb_build_object('outcome', v_outcome, 'confirmed', v_outcome = 'confirmed');
END;
$function$;