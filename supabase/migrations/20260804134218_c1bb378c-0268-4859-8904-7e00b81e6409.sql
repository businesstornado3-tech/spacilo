-- ---------------------------------------------------------------- reasons
ALTER TABLE public.booking_cancellations
  ADD CONSTRAINT booking_cancellations_reason_length
    CHECK (reason IS NULL OR char_length(reason) <= 1000),
  ADD CONSTRAINT booking_cancellations_category_length
    CHECK (category IS NULL OR char_length(category) <= 60);

-- ------------------------------------------------------- cancellation quote
CREATE OR REPLACE FUNCTION public.get_booking_cancellation_quote(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_role text;
  v_started boolean;
  v_storage integer := 0;
  v_fee integer := 0;
  v_paid_storage integer := 0;
  v_paid_fee integer := 0;
  v_ext_storage integer := 0;
  v_ext_fee integer := 0;
  v_earnings integer := 0;
  v_cancel public.booking_cancellations;
  v_category text;
  v_allowed boolean := true;
  v_reject text := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;

  IF v_booking.renter_id = v_uid THEN v_role := 'renter';
  ELSIF v_booking.host_id = v_uid THEN v_role := 'host';
  ELSE RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;

  v_started := v_booking.start_date <= (now() AT TIME ZONE 'UTC')::date
               OR v_booking.status = 'active';

  -- Amounts come only from succeeded payments, never from pricing inputs.
  SELECT
    COALESCE(SUM(GREATEST(p.storage_amount_pence - COALESCE(p.refunded_storage_pence,0), 0)), 0),
    COALESCE(SUM(GREATEST(p.service_fee_amount_pence - COALESCE(p.refunded_service_fee_pence,0), 0)), 0),
    COALESCE(SUM(p.storage_amount_pence), 0),
    COALESCE(SUM(p.service_fee_amount_pence), 0),
    COALESCE(SUM(p.storage_amount_pence) FILTER (WHERE p.change_request_id IS NOT NULL), 0),
    COALESCE(SUM(p.service_fee_amount_pence) FILTER (WHERE p.change_request_id IS NOT NULL), 0)
  INTO v_storage, v_fee, v_paid_storage, v_paid_fee, v_ext_storage, v_ext_fee
  FROM public.payments p
  WHERE p.booking_id = p_booking_id AND p.status = 'succeeded';

  SELECT COALESCE(SUM(e.host_entitlement_pence), 0) INTO v_earnings
    FROM public.host_earnings e WHERE e.booking_id = p_booking_id;

  SELECT * INTO v_cancel FROM public.booking_cancellations WHERE booking_id = p_booking_id;

  IF v_cancel.id IS NOT NULL OR v_booking.status = 'cancelled' THEN
    v_allowed := false; v_reject := 'already_cancelled'; v_category := 'cancelled';
  ELSIF v_booking.status = 'completed' THEN
    v_allowed := false; v_reject := 'completed'; v_category := 'completed';
  ELSIF v_started THEN
    v_category := 'early_termination';
  ELSE
    v_category := 'pre_start';
  END IF;

  -- Post-start terminations carry no automatic refund entitlement.
  IF v_category <> 'pre_start' THEN
    v_storage := 0; v_fee := 0;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'rejection', v_reject,
    'role', v_role,
    'category', v_category,
    'booking_status', v_booking.status,
    'storage_started', v_started,
    'currency', COALESCE(v_booking.currency, 'GBP'),
    'policy_version', public.stow_cancellation_policy_version(),
    'storage_paid_pence', v_paid_storage,
    'service_fee_paid_pence', v_paid_fee,
    'extension_storage_paid_pence', v_ext_storage,
    'extension_service_fee_paid_pence', v_ext_fee,
    'refundable_storage_pence', v_storage,
    'refundable_service_fee_pence', v_fee,
    'total_refund_pence', v_storage + v_fee,
    'host_earnings_pence', v_earnings,
    'host_earnings_after_pence', CASE WHEN v_category = 'pre_start' THEN 0 ELSE v_earnings END,
    'existing_resolution', v_cancel.financial_resolution_state
  );
END $$;

REVOKE ALL ON FUNCTION public.get_booking_cancellation_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_cancellation_quote(uuid) TO authenticated;

-- --------------------------------------- cancel_booking: reasons + extensions
CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id uuid,
  p_reason text DEFAULT NULL::text,
  p_reason_category text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  v_any_paid boolean := false;
  v_first_payment uuid;
  v_total_storage integer := 0;
  v_total_fee integer := 0;
  v_refunds jsonb := '[]'::jsonb;
  v_category text := nullif(btrim(coalesce(p_reason_category, '')), '');
  v_details text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_details IS NOT NULL AND char_length(v_details) > 1000 THEN
    v_details := left(v_details, 1000);
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF v_booking.renter_id = v_uid THEN v_role := 'renter';
  ELSIF v_booking.host_id = v_uid THEN v_role := 'host';
  ELSE RAISE EXCEPTION 'Not your booking';
  END IF;

  -- Idempotent: a second click returns the first outcome, never new refunds.
  SELECT * INTO v_cancel FROM public.booking_cancellations WHERE booking_id = p_booking_id;
  IF FOUND THEN
    FOR v_refund IN
      SELECT * FROM public.booking_refunds
       WHERE booking_id = p_booking_id AND status IN ('pending','succeeded')
       ORDER BY created_at
    LOOP
      SELECT * INTO v_payment FROM public.payments WHERE id = v_refund.payment_id;
      IF v_refund.status = 'pending' THEN
        v_total_storage := v_total_storage + COALESCE(v_refund.storage_refund_pence, 0);
        v_total_fee := v_total_fee + COALESCE(v_refund.service_fee_refund_pence, 0);
        v_refunds := v_refunds || jsonb_build_object(
          'refund_id', v_refund.id,
          'payment_id', v_refund.payment_id,
          'stripe_payment_intent_id',
            COALESCE(v_refund.stripe_payment_intent_id, v_payment.stripe_payment_intent_id),
          'currency', COALESCE(v_refund.currency, UPPER(v_payment.currency)),
          'storage_refund_pence', COALESCE(v_refund.storage_refund_pence, 0),
          'service_fee_refund_pence', COALESCE(v_refund.service_fee_refund_pence, 0),
          'total_refund_pence', COALESCE(v_refund.total_refund_pence, 0)
        );
      END IF;
    END LOOP;

    RETURN jsonb_build_object(
      'outcome', 'already_requested',
      'cancellation_id', v_cancel.id,
      'resolution', v_cancel.financial_resolution_state,
      'refunds', v_refunds,
      'storage_refund_pence', v_total_storage,
      'service_fee_refund_pence', v_total_fee,
      'total_refund_pence', v_total_storage + v_total_fee,
      'policy_version', v_cancel.policy_version
    );
  END IF;

  IF v_booking.status = 'completed' THEN
    RAISE EXCEPTION 'A completed booking cannot be cancelled';
  END IF;

  -- Authoritative at transaction time: a booking that became active while the
  -- browser was showing a pre-start quote follows the post-start path.
  v_started := v_booking.start_date <= (now() AT TIME ZONE 'UTC')::date
               OR v_booking.status = 'active';

  -- Open change requests can never outlive the booking they belong to.
  UPDATE public.booking_change_requests
     SET status = 'withdrawn'::public.booking_change_status,
         responded_at = COALESCE(responded_at, now()),
         host_response_note = COALESCE(host_response_note,
           'Closed because the booking was cancelled')
   WHERE booking_id = p_booking_id
     AND status IN ('pending','accepted_awaiting_payment');

  -- Release every capacity hold from unpaid checkouts (booking or extension).
  UPDATE public.payments
     SET hold_released_at = COALESCE(hold_released_at, now())
   WHERE booking_id = p_booking_id AND status <> 'succeeded' AND hold_released_at IS NULL;

  SELECT EXISTS (
    SELECT 1 FROM public.payments
     WHERE booking_id = p_booking_id AND status = 'succeeded'
  ) INTO v_any_paid;

  ------------------------------------------------ unpaid: nothing to refund
  IF NOT v_any_paid THEN
    INSERT INTO public.booking_cancellations (
      booking_id, requested_by, requested_by_role, reason, category, storage_started,
      policy_version, financial_resolution_state, resolved_at
    ) VALUES (
      p_booking_id, v_uid, v_role, v_details, v_category, v_started, v_policy,
      'not_required'::public.cancellation_resolution, now()
    ) RETURNING * INTO v_cancel;

    UPDATE public.bookings SET
      status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
      cancelled_by_role = v_role, cancellation_policy_version = v_policy
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('outcome','cancelled_unpaid','cancellation_id',v_cancel.id,
      'resolution','not_required','refunds','[]'::jsonb,'total_refund_pence',0,
      'storage_refund_pence',0,'service_fee_refund_pence',0,'policy_version',v_policy);
  END IF;

  SELECT id INTO v_first_payment FROM public.payments
   WHERE booking_id = p_booking_id AND status = 'succeeded'
   ORDER BY created_at LIMIT 1;

  ------------------------------------------- post-start: review, no auto refund
  IF v_started THEN
    INSERT INTO public.booking_cancellations (
      booking_id, payment_id, requested_by, requested_by_role, reason, category, storage_started,
      policy_version, financial_resolution_state
    ) VALUES (
      p_booking_id, v_first_payment, v_uid, v_role, v_details, v_category, true, v_policy,
      'review_required'::public.cancellation_resolution
    ) RETURNING * INTO v_cancel;

    FOR v_earning IN
      SELECT e.* FROM public.host_earnings e
        JOIN public.payments p ON p.id = e.payment_id
       WHERE p.booking_id = p_booking_id AND p.status = 'succeeded'
       FOR UPDATE OF e
    LOOP
      UPDATE public.host_earnings
        SET hold_review = true,
            blocked_reason = 'Cancellation review in progress'
        WHERE id = v_earning.id;
      PERFORM public.stow_recompute_earning_status(v_earning.id);
    END LOOP;

    RETURN jsonb_build_object('outcome','review_required','cancellation_id',v_cancel.id,
      'resolution','review_required','refunds','[]'::jsonb,'total_refund_pence',0,
      'storage_refund_pence',0,'service_fee_refund_pence',0,'policy_version',v_policy);
  END IF;

  ------------------------------------------- pre-start: full refund of EVERY
  ------------------------------------------- succeeded payment on the booking
  INSERT INTO public.booking_cancellations (
    booking_id, payment_id, requested_by, requested_by_role, reason, category, storage_started,
    policy_version, financial_resolution_state
  ) VALUES (
    p_booking_id, v_first_payment, v_uid, v_role, v_details, v_category, false, v_policy,
    'refund_pending'::public.cancellation_resolution
  ) RETURNING * INTO v_cancel;

  FOR v_payment IN
    SELECT * FROM public.payments
     WHERE booking_id = p_booking_id AND status = 'succeeded'
     ORDER BY created_at
     FOR UPDATE
  LOOP
    v_storage := GREATEST(v_payment.storage_amount_pence
                          - COALESCE(v_payment.refunded_storage_pence, 0), 0);
    v_fee := GREATEST(v_payment.service_fee_amount_pence
                      - COALESCE(v_payment.refunded_service_fee_pence, 0), 0);

    SELECT * INTO v_earning FROM public.host_earnings
     WHERE payment_id = v_payment.id FOR UPDATE;

    IF (v_storage + v_fee) > 0 THEN
      IF EXISTS (SELECT 1 FROM public.booking_refunds
                  WHERE payment_id = v_payment.id AND status = 'pending') THEN
        CONTINUE;
      END IF;

      INSERT INTO public.booking_refunds (
        booking_id, payment_id, cancellation_id, stripe_payment_intent_id, stripe_charge_id,
        reason, initiated_by, status, currency,
        storage_refund_pence, service_fee_refund_pence, total_refund_pence, policy_version
      ) VALUES (
        p_booking_id, v_payment.id, v_cancel.id, v_payment.stripe_payment_intent_id,
        v_payment.stripe_charge_id,
        COALESCE(v_details, v_role || ' cancelled before storage started'),
        v_role::public.refund_initiator, 'pending', UPPER(v_payment.currency),
        v_storage, v_fee, v_storage + v_fee, v_policy
      ) RETURNING * INTO v_refund;

      UPDATE public.payments SET refund_state = 'pending' WHERE id = v_payment.id;

      v_total_storage := v_total_storage + v_storage;
      v_total_fee := v_total_fee + v_fee;
      v_refunds := v_refunds || jsonb_build_object(
        'refund_id', v_refund.id,
        'payment_id', v_payment.id,
        'stripe_payment_intent_id', v_payment.stripe_payment_intent_id,
        'currency', UPPER(v_payment.currency),
        'storage_refund_pence', v_storage,
        'service_fee_refund_pence', v_fee,
        'total_refund_pence', v_storage + v_fee
      );
    END IF;

    IF v_earning.id IS NOT NULL THEN
      IF v_earning.stripe_transfer_id IS NULL AND v_earning.status <> 'transferring' THEN
        v_entitlement := GREATEST(v_earning.gross_storage_amount_pence
                                  - (COALESCE(v_earning.refunded_storage_pence,0) + v_storage), 0);
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
  END LOOP;

  IF (v_total_storage + v_total_fee) = 0 THEN
    UPDATE public.booking_cancellations
      SET financial_resolution_state = 'refunded'::public.cancellation_resolution,
          resolved_at = now()
    WHERE id = v_cancel.id
    RETURNING * INTO v_cancel;
  END IF;

  UPDATE public.bookings SET
    status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
    cancelled_by_role = v_role, cancellation_policy_version = v_policy
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'outcome','refund_initiated',
    'cancellation_id', v_cancel.id,
    'resolution', v_cancel.financial_resolution_state,
    'refunds', v_refunds,
    'storage_refund_pence', v_total_storage,
    'service_fee_refund_pence', v_total_fee,
    'total_refund_pence', v_total_storage + v_total_fee,
    'policy_version', v_policy
  );
END $$;

REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text, text) TO authenticated;

-- ------------------------------------------------------- early termination
CREATE OR REPLACE FUNCTION public.request_early_termination(
  p_booking_id uuid,
  p_proposed_end_date date,
  p_reason_category text DEFAULT NULL::text,
  p_reason text DEFAULT NULL::text
)
RETURNS public.booking_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_role text;
  v_row public.booking_change_requests;
  v_note text := nullif(btrim(coalesce(p_reason_category, '') || CASE
      WHEN nullif(btrim(coalesce(p_reason,'')), '') IS NULL THEN ''
      ELSE ' — ' || left(btrim(p_reason), 1000) END), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;

  IF v_booking.renter_id = v_uid THEN v_role := 'renter';
  ELSIF v_booking.host_id = v_uid THEN v_role := 'host';
  ELSE RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status <> 'active' THEN
    RAISE EXCEPTION 'Storage has not started, so this booking is cancelled rather than ended early'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_proposed_end_date IS NULL
     OR p_proposed_end_date >= v_booking.end_date
     OR p_proposed_end_date < v_booking.start_date THEN
    RAISE EXCEPTION 'Choose an end date inside the current storage period' USING ERRCODE = 'P0001';
  END IF;

  -- One open early-termination conversation at a time.
  SELECT * INTO v_row FROM public.booking_change_requests
   WHERE booking_id = p_booking_id AND kind = 'early_termination'
     AND status = 'pending'
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO public.booking_change_requests (
    booking_id, renter_id, host_id, space_id, requested_by, requested_by_role,
    kind, status, original_start_date, original_end_date,
    proposed_start_date, proposed_end_date, additional_days,
    pricing_version, additional_storage_amount_pence, additional_service_fee_pence,
    additional_total_pence, currency, renter_note
  ) VALUES (
    p_booking_id, v_booking.renter_id, v_booking.host_id, v_booking.space_id, v_uid, v_role,
    'early_termination', 'pending', v_booking.start_date, v_booking.end_date,
    v_booking.start_date, p_proposed_end_date, 0,
    COALESCE(v_booking.pricing_version_snapshot, public.stow_pricing_version()), 0, 0, 0,
    COALESCE(v_booking.currency, 'GBP'), v_note
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.request_early_termination(uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_early_termination(uuid, date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_early_termination(
  p_change_id uuid,
  p_accept boolean,
  p_note text DEFAULT NULL::text
)
RETURNS public.booking_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.booking_change_requests;
  v_booking public.bookings;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_row FROM public.booking_change_requests
   WHERE id = p_change_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.kind <> 'early_termination' THEN
    RAISE EXCEPTION 'Not an early termination request' USING ERRCODE = 'P0001';
  END IF;
  IF v_uid NOT IN (v_row.renter_id, v_row.host_id) THEN
    RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;
  -- Only the OTHER party may answer.
  IF v_uid = v_row.requested_by THEN
    RAISE EXCEPTION 'The other party needs to answer this request' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: an answered request is returned unchanged.
  IF v_row.status <> 'pending' THEN RETURN v_row; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_row.booking_id FOR UPDATE;
  IF v_booking.status <> 'active' THEN
    RAISE EXCEPTION 'This booking is no longer running' USING ERRCODE = 'P0001';
  END IF;

  IF p_accept THEN
    -- Agreed: the effective end date moves. The booking STAYS active so the
    -- normal collection/check-out lifecycle still applies.
    UPDATE public.bookings SET end_date = v_row.proposed_end_date
     WHERE id = v_row.booking_id;
  END IF;

  UPDATE public.booking_change_requests
     SET status = CASE WHEN p_accept THEN 'applied'::public.booking_change_status
                       ELSE 'declined'::public.booking_change_status END,
         host_response_note = nullif(btrim(coalesce(p_note, '')), ''),
         responded_at = now(),
         responded_by = v_uid
   WHERE id = p_change_id
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.respond_to_early_termination(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_early_termination(uuid, boolean, text) TO authenticated;