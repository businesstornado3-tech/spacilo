CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_payment public.payments;
  v_earning public.host_earnings;
  v_cancel public.booking_cancellations;
  v_refund public.booking_refunds;
  v_role text;
  v_started boolean;
  v_policy text := public.stow_cancellation_policy_version();
  v_storage integer;
  v_fee integer;
  v_entitlement integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF v_booking.renter_id = v_uid THEN v_role := 'renter';
  ELSIF v_booking.host_id = v_uid THEN v_role := 'host';
  ELSE RAISE EXCEPTION 'Not your booking';
  END IF;

  -- Idempotent: a second click returns the first outcome, never a new refund.
  SELECT * INTO v_cancel FROM public.booking_cancellations WHERE booking_id = p_booking_id;
  IF FOUND THEN
    SELECT * INTO v_refund FROM public.booking_refunds
      WHERE booking_id = p_booking_id AND status IN ('pending','succeeded')
      ORDER BY created_at LIMIT 1;

    -- Re-emit the trusted payment coordinates so a retry can RECONCILE an
    -- already-claimed refund with Stripe (the same idempotency key replays the
    -- original refund) instead of stalling with no payment intent.
    IF v_refund.id IS NOT NULL THEN
      SELECT * INTO v_payment FROM public.payments WHERE id = v_refund.payment_id;
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'already_requested',
      'cancellation_id', v_cancel.id,
      'resolution', v_cancel.financial_resolution_state,
      'refund_id', v_refund.id,
      'payment_id', v_refund.payment_id,
      'stripe_payment_intent_id',
        COALESCE(v_refund.stripe_payment_intent_id, v_payment.stripe_payment_intent_id),
      'currency', COALESCE(v_refund.currency, UPPER(v_payment.currency)),
      'storage_refund_pence', COALESCE(v_refund.storage_refund_pence, 0),
      'service_fee_refund_pence', COALESCE(v_refund.service_fee_refund_pence, 0),
      'total_refund_pence', CASE WHEN v_refund.status = 'pending'
                                 THEN COALESCE(v_refund.total_refund_pence, 0) ELSE 0 END,
      'policy_version', v_cancel.policy_version
    );
  END IF;

  IF v_booking.status = 'completed' THEN
    RAISE EXCEPTION 'A completed booking cannot be cancelled';
  END IF;

  v_started := v_booking.start_date <= (now() AT TIME ZONE 'UTC')::date;

  SELECT * INTO v_payment FROM public.payments
   WHERE booking_id = p_booking_id AND status = 'succeeded'
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  ------------------------------------------------ unpaid: nothing to refund
  IF NOT FOUND THEN
    INSERT INTO public.booking_cancellations (
      booking_id, requested_by, requested_by_role, reason, storage_started,
      policy_version, financial_resolution_state, resolved_at
    ) VALUES (
      p_booking_id, v_uid, v_role, p_reason, v_started, v_policy,
      'not_required'::public.cancellation_resolution, now()
    ) RETURNING * INTO v_cancel;

    UPDATE public.payments
      SET hold_released_at = COALESCE(hold_released_at, now())
      WHERE booking_id = p_booking_id AND status <> 'succeeded' AND hold_released_at IS NULL;

    UPDATE public.bookings SET
      status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
      cancelled_by_role = v_role, cancellation_policy_version = v_policy
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('outcome','cancelled_unpaid','cancellation_id',v_cancel.id,
      'resolution','not_required','total_refund_pence',0,'policy_version',v_policy);
  END IF;

  SELECT * INTO v_earning FROM public.host_earnings
   WHERE payment_id = v_payment.id FOR UPDATE;

  ------------------------------------------- post-start: review, no auto refund
  IF v_started THEN
    INSERT INTO public.booking_cancellations (
      booking_id, payment_id, requested_by, requested_by_role, reason, storage_started,
      policy_version, financial_resolution_state
    ) VALUES (
      p_booking_id, v_payment.id, v_uid, v_role, p_reason, true, v_policy,
      'review_required'::public.cancellation_resolution
    ) RETURNING * INTO v_cancel;

    IF v_earning.id IS NOT NULL THEN
      UPDATE public.host_earnings
        SET hold_review = true,
            blocked_reason = 'Cancellation review in progress'
        WHERE id = v_earning.id;
      PERFORM public.stow_recompute_earning_status(v_earning.id);
    END IF;

    RETURN jsonb_build_object('outcome','review_required','cancellation_id',v_cancel.id,
      'resolution','review_required','total_refund_pence',0,'policy_version',v_policy);
  END IF;

  ------------------------------------------- pre-start: full refund, both parts
  v_storage := GREATEST(v_payment.storage_amount_pence - v_payment.refunded_storage_pence, 0);
  v_fee := GREATEST(v_payment.service_fee_amount_pence - v_payment.refunded_service_fee_pence, 0);

  INSERT INTO public.booking_cancellations (
    booking_id, payment_id, requested_by, requested_by_role, reason, storage_started,
    policy_version, financial_resolution_state,
    resolved_at
  ) VALUES (
    p_booking_id, v_payment.id, v_uid, v_role, p_reason, false, v_policy,
    -- Explicit enum casts: an untyped CASE resolves to text, which cannot be
    -- assigned to a cancellation_resolution column.
    CASE WHEN (v_storage + v_fee) > 0
         THEN 'refund_pending'::public.cancellation_resolution
         ELSE 'refunded'::public.cancellation_resolution END,
    CASE WHEN (v_storage + v_fee) > 0 THEN NULL ELSE now() END
  ) RETURNING * INTO v_cancel;

  IF (v_storage + v_fee) > 0 THEN
    INSERT INTO public.booking_refunds (
      booking_id, payment_id, cancellation_id, stripe_payment_intent_id, stripe_charge_id,
      reason, initiated_by, status, currency,
      storage_refund_pence, service_fee_refund_pence, total_refund_pence, policy_version
    ) VALUES (
      p_booking_id, v_payment.id, v_cancel.id, v_payment.stripe_payment_intent_id,
      v_payment.stripe_charge_id,
      COALESCE(p_reason, v_role || ' cancelled before storage started'),
      v_role::public.refund_initiator, 'pending', UPPER(v_payment.currency),
      v_storage, v_fee, v_storage + v_fee, v_policy
    ) RETURNING * INTO v_refund;

    UPDATE public.payments SET refund_state = 'pending' WHERE id = v_payment.id;
  END IF;

  IF v_earning.id IS NOT NULL THEN
    IF v_earning.stripe_transfer_id IS NULL AND v_earning.status <> 'transferring' THEN
      v_entitlement := GREATEST(v_earning.gross_storage_amount_pence
                                - (v_earning.refunded_storage_pence + v_storage), 0);
      UPDATE public.host_earnings SET
        hold_refund = true,
        host_entitlement_pence = v_entitlement,
        blocked_reason = 'Booking cancelled before storage started'
      WHERE id = v_earning.id;
    ELSE
      UPDATE public.host_earnings SET
        hold_refund = true,
        blocked_reason = 'Refund pending against transferred earnings'
      WHERE id = v_earning.id;
    END IF;
    PERFORM public.stow_recompute_earning_status(v_earning.id);
  END IF;

  UPDATE public.bookings SET
    status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
    cancelled_by_role = v_role, cancellation_policy_version = v_policy
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'outcome','refund_initiated',
    'cancellation_id', v_cancel.id,
    'resolution', v_cancel.financial_resolution_state,
    'refund_id', v_refund.id,
    'payment_id', v_payment.id,
    'stripe_payment_intent_id', v_payment.stripe_payment_intent_id,
    'currency', UPPER(v_payment.currency),
    'storage_refund_pence', v_storage,
    'service_fee_refund_pence', v_fee,
    'total_refund_pence', v_storage + v_fee,
    'policy_version', v_policy
  );
END;
$function$;