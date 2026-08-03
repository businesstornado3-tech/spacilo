-- =========================================================== enums
CREATE TYPE public.refund_status AS ENUM ('pending','succeeded','failed','cancelled');
CREATE TYPE public.refund_initiator AS ENUM ('renter','host','admin','stripe_dispute','system');
CREATE TYPE public.cancellation_resolution AS ENUM ('not_required','refund_pending','refunded','review_required','resolved');
CREATE TYPE public.payment_refund_state AS ENUM ('none','pending','partially_refunded','refunded');
CREATE TYPE public.host_liability_status AS ENUM ('outstanding','offset','recovered','cancelled','written_off');
CREATE TYPE public.host_liability_source AS ENUM ('refund','dispute','chargeback','manual_adjustment');

-- ================================================ versioned policy id
CREATE OR REPLACE FUNCTION public.stow_cancellation_policy_version()
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 'PROJECT_STOW_CANCELLATION_POLICY_V1'::text;
$$;

-- ================================================== payments columns
ALTER TABLE public.payments
  ADD COLUMN stripe_charge_id text,
  ADD COLUMN refunded_storage_pence integer NOT NULL DEFAULT 0 CHECK (refunded_storage_pence >= 0),
  ADD COLUMN refunded_service_fee_pence integer NOT NULL DEFAULT 0 CHECK (refunded_service_fee_pence >= 0),
  ADD COLUMN refunded_total_pence integer NOT NULL DEFAULT 0 CHECK (refunded_total_pence >= 0),
  ADD COLUMN refund_state public.payment_refund_state NOT NULL DEFAULT 'none',
  ADD COLUMN disputed boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT payments_refund_components_sum
    CHECK (refunded_total_pence = refunded_storage_pence + refunded_service_fee_pence),
  ADD CONSTRAINT payments_refund_storage_cap
    CHECK (refunded_storage_pence <= storage_amount_pence),
  ADD CONSTRAINT payments_refund_fee_cap
    CHECK (refunded_service_fee_pence <= service_fee_amount_pence);

CREATE UNIQUE INDEX payments_stripe_charge_id_key
  ON public.payments (stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;

-- ================================================== bookings columns
ALTER TABLE public.bookings
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by uuid,
  ADD COLUMN cancelled_by_role text
    CHECK (cancelled_by_role IN ('renter','host','admin','system')),
  ADD COLUMN cancellation_policy_version text;

-- ============================================= host_earnings columns
ALTER TABLE public.host_earnings
  ADD COLUMN hold_refund boolean NOT NULL DEFAULT false,
  ADD COLUMN hold_dispute boolean NOT NULL DEFAULT false,
  ADD COLUMN hold_review boolean NOT NULL DEFAULT false,
  ADD COLUMN transferred_amount_pence integer NOT NULL DEFAULT 0 CHECK (transferred_amount_pence >= 0);

UPDATE public.host_earnings
SET transferred_amount_pence = host_entitlement_pence
WHERE stripe_transfer_id IS NOT NULL;

-- ============================================ booking_cancellations
CREATE TABLE public.booking_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL,
  requested_by_role text NOT NULL CHECK (requested_by_role IN ('renter','host','admin','system')),
  reason text,
  category text,
  storage_started boolean NOT NULL DEFAULT false,
  requested_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz NOT NULL DEFAULT now(),
  policy_version text NOT NULL,
  financial_resolution_state public.cancellation_resolution NOT NULL DEFAULT 'not_required',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_cancellations_state_idx
  ON public.booking_cancellations (financial_resolution_state);

GRANT SELECT ON public.booking_cancellations TO authenticated;
GRANT ALL ON public.booking_cancellations TO service_role;
ALTER TABLE public.booking_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Booking parties read their cancellations"
  ON public.booking_cancellations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_cancellations.booking_id
      AND (b.renter_id = auth.uid() OR b.host_id = auth.uid())
  ));

CREATE TRIGGER booking_cancellations_touch
  BEFORE UPDATE ON public.booking_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================================================== booking_refunds
CREATE TABLE public.booking_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  cancellation_id uuid REFERENCES public.booking_cancellations(id) ON DELETE RESTRICT,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_refund_id text UNIQUE,
  reason text,
  initiated_by public.refund_initiator NOT NULL,
  status public.refund_status NOT NULL DEFAULT 'pending',
  currency text NOT NULL DEFAULT 'GBP',
  storage_refund_pence integer NOT NULL CHECK (storage_refund_pence >= 0),
  service_fee_refund_pence integer NOT NULL CHECK (service_fee_refund_pence >= 0),
  total_refund_pence integer NOT NULL CHECK (total_refund_pence >= 0),
  policy_version text NOT NULL,
  externally_initiated boolean NOT NULL DEFAULT false,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT booking_refunds_components_sum
    CHECK (total_refund_pence = storage_refund_pence + service_fee_refund_pence)
);

-- At most ONE in-flight refund per payment. This is the database-level guard
-- against a double-clicked cancellation creating two Stripe refunds.
CREATE UNIQUE INDEX booking_refunds_one_pending_per_payment
  ON public.booking_refunds (payment_id) WHERE status = 'pending';

CREATE INDEX booking_refunds_booking_idx ON public.booking_refunds (booking_id, created_at DESC);

GRANT SELECT ON public.booking_refunds TO authenticated;
GRANT ALL ON public.booking_refunds TO service_role;
ALTER TABLE public.booking_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Booking parties read their refunds"
  ON public.booking_refunds FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_refunds.booking_id
      AND (b.renter_id = auth.uid() OR b.host_id = auth.uid())
  ));

CREATE TRIGGER booking_refunds_touch
  BEFORE UPDATE ON public.booking_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================================================== stripe_disputes
CREATE TABLE public.stripe_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id text NOT NULL UNIQUE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  stripe_charge_id text,
  stripe_payment_intent_id text,
  amount_pence integer NOT NULL DEFAULT 0 CHECK (amount_pence >= 0),
  currency text NOT NULL DEFAULT 'GBP',
  status text NOT NULL,
  reason text,
  outcome text,
  livemode boolean,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stripe_disputes_payment_idx ON public.stripe_disputes (payment_id);

-- Internal only: no authenticated grant, no policies.
GRANT ALL ON public.stripe_disputes TO service_role;
ALTER TABLE public.stripe_disputes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER stripe_disputes_touch
  BEFORE UPDATE ON public.stripe_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================ host_balance_adjustments
CREATE TABLE public.host_balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  earning_id uuid REFERENCES public.host_earnings(id) ON DELETE RESTRICT,
  source_type public.host_liability_source NOT NULL,
  source_id text NOT NULL,
  amount_pence integer NOT NULL CHECK (amount_pence > 0),
  currency text NOT NULL DEFAULT 'GBP',
  status public.host_liability_status NOT NULL DEFAULT 'outstanding',
  offset_earning_id uuid REFERENCES public.host_earnings(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT host_balance_adjustments_source_key UNIQUE (source_type, source_id)
);

CREATE INDEX host_balance_adjustments_host_idx
  ON public.host_balance_adjustments (host_user_id, status);

GRANT SELECT ON public.host_balance_adjustments TO authenticated;
GRANT ALL ON public.host_balance_adjustments TO service_role;
ALTER TABLE public.host_balance_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts read their own adjustments"
  ON public.host_balance_adjustments FOR SELECT TO authenticated
  USING (host_user_id = auth.uid());

CREATE TRIGGER host_balance_adjustments_touch
  BEFORE UPDATE ON public.host_balance_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================ earning status math
-- Single place that derives an earning's status from its holds. A transferred
-- earning is terminal and is never moved back.
CREATE OR REPLACE FUNCTION public.stow_recompute_earning_status(p_earning_id uuid)
RETURNS public.host_earning_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.host_earnings;
  v_status public.host_earning_status;
BEGIN
  SELECT * INTO v FROM public.host_earnings WHERE id = p_earning_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v.stripe_transfer_id IS NOT NULL OR v.status = 'transferred' THEN
    IF v.refunded_storage_pence >= v.gross_storage_amount_pence AND v.gross_storage_amount_pence > 0 THEN
      v_status := 'reversed';
    ELSIF v.refunded_storage_pence > 0 THEN
      v_status := 'partially_reversed';
    ELSE
      v_status := 'transferred';
    END IF;
  ELSIF v.status = 'transferring' THEN
    v_status := 'transferring';
  ELSIF v.hold_refund OR v.hold_dispute OR v.hold_review OR v.host_entitlement_pence <= 0 THEN
    v_status := 'blocked';
  ELSIF v.eligible_at <= now() THEN
    v_status := 'eligible';
  ELSE
    v_status := 'pending';
  END IF;

  UPDATE public.host_earnings
  SET status = v_status,
      blocked_reason = CASE WHEN v_status = 'blocked' THEN blocked_reason ELSE NULL END
  WHERE id = p_earning_id;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.stow_recompute_earning_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stow_recompute_earning_status(uuid) TO service_role;

-- ============================================== renter/host cancellation
-- Runs as the signed-in user. The browser supplies only a booking id and an
-- optional reason: ownership, timing, policy and every pence are resolved here
-- from the amounts snapshotted at payment time.
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    RETURN jsonb_build_object(
      'outcome', 'already_requested',
      'cancellation_id', v_cancel.id,
      'resolution', v_cancel.financial_resolution_state,
      'refund_id', v_refund.id,
      'storage_refund_pence', COALESCE(v_refund.storage_refund_pence, 0),
      'service_fee_refund_pence', COALESCE(v_refund.service_fee_refund_pence, 0),
      'total_refund_pence', COALESCE(v_refund.total_refund_pence, 0),
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
      p_booking_id, v_uid, v_role, p_reason, v_started, v_policy, 'not_required', now()
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

  -- Lock the earning BEFORE any decision. The payout processor claims rows
  -- with FOR UPDATE SKIP LOCKED, so it simply skips this earning while we hold
  -- the lock; only one of refund / transfer can win.
  SELECT * INTO v_earning FROM public.host_earnings
   WHERE payment_id = v_payment.id FOR UPDATE;

  ------------------------------------------- post-start: review, no auto refund
  IF v_started THEN
    INSERT INTO public.booking_cancellations (
      booking_id, payment_id, requested_by, requested_by_role, reason, storage_started,
      policy_version, financial_resolution_state
    ) VALUES (
      p_booking_id, v_payment.id, v_uid, v_role, p_reason, true, v_policy, 'review_required'
    ) RETURNING * INTO v_cancel;

    IF v_earning.id IS NOT NULL THEN
      UPDATE public.host_earnings
        SET hold_review = true,
            blocked_reason = 'Cancellation review in progress'
        WHERE id = v_earning.id;
      PERFORM public.stow_recompute_earning_status(v_earning.id);
    END IF;

    -- Booking stays confirmed: the storage period has begun and belongings may
    -- still be in the space, so capacity must NOT be released automatically.
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
    CASE WHEN (v_storage + v_fee) > 0 THEN 'refund_pending' ELSE 'refunded' END,
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
      -- Refund BEFORE transfer: reduce the entitlement by the STORAGE portion
      -- only. The service fee is Project Stow revenue and never touches it.
      v_entitlement := GREATEST(v_earning.gross_storage_amount_pence
                                - (v_earning.refunded_storage_pence + v_storage), 0);
      UPDATE public.host_earnings SET
        hold_refund = true,
        host_entitlement_pence = v_entitlement,
        blocked_reason = 'Booking cancelled before storage started'
      WHERE id = v_earning.id;
    ELSE
      -- Already transferred / in flight: hold and let webhook reconciliation
      -- record a host liability. Never silently reverse a completed transfer.
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
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text) TO authenticated, service_role;

-- ================================================= refund bookkeeping
CREATE OR REPLACE FUNCTION public.mark_refund_submitted(
  p_refund_id uuid, p_stripe_refund_id text, p_charge_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.booking_refunds SET
    stripe_refund_id = COALESCE(stripe_refund_id, p_stripe_refund_id),
    stripe_charge_id = COALESCE(p_charge_id, stripe_charge_id),
    failure_reason = NULL
  WHERE id = p_refund_id AND status = 'pending';

  UPDATE public.payments p SET stripe_charge_id = COALESCE(p.stripe_charge_id, p_charge_id)
  FROM public.booking_refunds r
  WHERE r.id = p_refund_id AND p.id = r.payment_id AND p_charge_id IS NOT NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_refund_submitted(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_refund_submitted(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_refund(p_refund_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Stays 'pending' so the operation remains recoverable and retryable with
  -- the same deterministic Stripe idempotency key. Never silently succeeds.
  UPDATE public.booking_refunds SET failure_reason = p_reason
  WHERE id = p_refund_id AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fail_refund(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_refund(uuid, text) TO service_role;

-- ============================================= charge.refunded reconcile
-- Stripe reports a CUMULATIVE amount_refunded on the charge. We apply only the
-- delta against what we have already recorded, so a duplicated or out-of-order
-- delivery can never apply the same pence twice.
CREATE OR REPLACE FUNCTION public.reconcile_charge_refund(
  p_payment_id uuid,
  p_charge_id text,
  p_refunded_total_pence integer,
  p_currency text,
  p_event_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments;
  v_earning public.host_earnings;
  v_delta integer;
  v_r public.booking_refunds;
  v_storage integer := 0;
  v_fee integer := 0;
  v_ext_storage integer;
  v_ext_fee integer;
  v_new_storage integer;
  v_new_fee integer;
  v_new_total integer;
  v_entitlement integer;
  v_liability integer;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','payment_not_found'); END IF;

  IF UPPER(COALESCE(p_currency, v_payment.currency)) <> UPPER(v_payment.currency) THEN
    RETURN jsonb_build_object('outcome','currency_mismatch');
  END IF;

  v_delta := LEAST(p_refunded_total_pence, v_payment.renter_total_amount_pence)
             - v_payment.refunded_total_pence;
  IF v_delta <= 0 THEN
    RETURN jsonb_build_object('outcome','no_change',
      'refunded_total_pence', v_payment.refunded_total_pence);
  END IF;

  -- 1. Settle internally initiated refunds that this delta covers.
  FOR v_r IN
    SELECT * FROM public.booking_refunds
     WHERE payment_id = p_payment_id AND status = 'pending'
     ORDER BY created_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_delta < v_r.total_refund_pence;
    UPDATE public.booking_refunds SET
      status = 'succeeded', completed_at = now(),
      stripe_charge_id = COALESCE(stripe_charge_id, p_charge_id)
    WHERE id = v_r.id;
    v_storage := v_storage + v_r.storage_refund_pence;
    v_fee := v_fee + v_r.service_fee_refund_pence;
    v_delta := v_delta - v_r.total_refund_pence;
  END LOOP;

  -- 2. Anything left was created outside Project Stow (Stripe Dashboard).
  --    Stripe only tells us an aggregate, so allocate storage-first and write
  --    an internal ledger row rather than ignoring the money.
  IF v_delta > 0 THEN
    v_ext_storage := LEAST(v_delta,
      GREATEST(v_payment.storage_amount_pence - v_payment.refunded_storage_pence - v_storage, 0));
    v_ext_fee := LEAST(v_delta - v_ext_storage,
      GREATEST(v_payment.service_fee_amount_pence - v_payment.refunded_service_fee_pence - v_fee, 0));

    IF (v_ext_storage + v_ext_fee) > 0 THEN
      INSERT INTO public.booking_refunds (
        booking_id, payment_id, stripe_payment_intent_id, stripe_charge_id,
        reason, initiated_by, status, currency,
        storage_refund_pence, service_fee_refund_pence, total_refund_pence,
        policy_version, externally_initiated, completed_at
      ) VALUES (
        v_payment.booking_id, v_payment.id, v_payment.stripe_payment_intent_id, p_charge_id,
        'Refund created in Stripe (event ' || p_event_id || ')',
        'system', 'succeeded', UPPER(v_payment.currency),
        v_ext_storage, v_ext_fee, v_ext_storage + v_ext_fee,
        public.stow_cancellation_policy_version(), true, now()
      );
      v_storage := v_storage + v_ext_storage;
      v_fee := v_fee + v_ext_fee;
    END IF;
  END IF;

  v_new_storage := v_payment.refunded_storage_pence + v_storage;
  v_new_fee := v_payment.refunded_service_fee_pence + v_fee;
  v_new_total := v_new_storage + v_new_fee;

  UPDATE public.payments SET
    refunded_storage_pence = v_new_storage,
    refunded_service_fee_pence = v_new_fee,
    refunded_total_pence = v_new_total,
    stripe_charge_id = COALESCE(stripe_charge_id, p_charge_id),
    refund_state = CASE
      WHEN v_new_total >= renter_total_amount_pence THEN 'refunded'::public.payment_refund_state
      WHEN v_new_total > 0 THEN 'partially_refunded'::public.payment_refund_state
      ELSE 'none'::public.payment_refund_state END
  WHERE id = p_payment_id;

  -- 3. Push the STORAGE portion (never the service fee) into the host ledger.
  SELECT * INTO v_earning FROM public.host_earnings
   WHERE payment_id = p_payment_id FOR UPDATE;

  IF v_earning.id IS NOT NULL AND v_storage > 0 THEN
    IF v_earning.stripe_transfer_id IS NULL THEN
      v_entitlement := GREATEST(v_earning.gross_storage_amount_pence - v_new_storage, 0);
      UPDATE public.host_earnings SET
        refunded_storage_pence = v_new_storage,
        host_entitlement_pence = v_entitlement,
        hold_refund = CASE WHEN v_entitlement <= 0 THEN true ELSE hold_refund END,
        blocked_reason = CASE WHEN v_entitlement <= 0
          THEN 'Refunded before transfer' ELSE blocked_reason END
      WHERE id = v_earning.id;
    ELSE
      -- Money already left the platform. Record the liability honestly; do NOT
      -- fabricate a recovery and never debit the host's bank account.
      v_liability := LEAST(v_storage, v_earning.transferred_amount_pence);
      UPDATE public.host_earnings SET refunded_storage_pence = v_new_storage
        WHERE id = v_earning.id;
      IF v_liability > 0 THEN
        INSERT INTO public.host_balance_adjustments (
          host_user_id, booking_id, earning_id, source_type, source_id,
          amount_pence, currency, notes
        ) VALUES (
          v_earning.host_user_id, v_earning.booking_id, v_earning.id, 'refund', p_event_id,
          v_liability, UPPER(v_payment.currency),
          'Storage refunded after the host transfer was already sent'
        ) ON CONFLICT (source_type, source_id) DO NOTHING;
      END IF;
    END IF;
    PERFORM public.stow_recompute_earning_status(v_earning.id);
  END IF;

  -- 4. Close out the cancellation once nothing is outstanding.
  UPDATE public.booking_cancellations SET
    financial_resolution_state = 'refunded', resolved_at = COALESCE(resolved_at, now())
  WHERE booking_id = v_payment.booking_id
    AND financial_resolution_state = 'refund_pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_refunds r
       WHERE r.booking_id = v_payment.booking_id AND r.status = 'pending'
    );

  RETURN jsonb_build_object('outcome','applied',
    'storage_refund_pence', v_storage,
    'service_fee_refund_pence', v_fee,
    'refunded_total_pence', v_new_total);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_charge_refund(uuid, text, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_charge_refund(uuid, text, integer, text, text) TO service_role;

-- ==================================================== dispute lifecycle
CREATE OR REPLACE FUNCTION public.record_stripe_dispute(
  p_dispute_id text,
  p_charge_id text,
  p_payment_intent_id text,
  p_amount_pence integer,
  p_currency text,
  p_status text,
  p_reason text,
  p_livemode boolean,
  p_closed boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments;
  v_earning public.host_earnings;
  v_dispute public.stripe_disputes;
  v_prev_status text;
  v_won boolean;
  v_lost boolean;
  v_liability integer;
BEGIN
  SELECT * INTO v_payment FROM public.payments
   WHERE (p_charge_id IS NOT NULL AND stripe_charge_id = p_charge_id)
      OR (p_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = p_payment_intent_id)
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  SELECT status INTO v_prev_status FROM public.stripe_disputes WHERE stripe_dispute_id = p_dispute_id;

  INSERT INTO public.stripe_disputes (
    stripe_dispute_id, payment_id, booking_id, stripe_charge_id, stripe_payment_intent_id,
    amount_pence, currency, status, reason, livemode,
    resolved_at
  ) VALUES (
    p_dispute_id, v_payment.id, v_payment.booking_id, p_charge_id, p_payment_intent_id,
    GREATEST(COALESCE(p_amount_pence, 0), 0), UPPER(COALESCE(p_currency,'GBP')),
    p_status, p_reason, p_livemode,
    CASE WHEN p_closed THEN now() ELSE NULL END
  )
  ON CONFLICT (stripe_dispute_id) DO UPDATE SET
    payment_id = COALESCE(public.stripe_disputes.payment_id, EXCLUDED.payment_id),
    booking_id = COALESCE(public.stripe_disputes.booking_id, EXCLUDED.booking_id),
    stripe_charge_id = COALESCE(public.stripe_disputes.stripe_charge_id, EXCLUDED.stripe_charge_id),
    amount_pence = EXCLUDED.amount_pence,
    status = EXCLUDED.status,
    reason = COALESCE(EXCLUDED.reason, public.stripe_disputes.reason),
    outcome = CASE WHEN p_closed THEN EXCLUDED.status ELSE public.stripe_disputes.outcome END,
    resolved_at = CASE WHEN p_closed
      THEN COALESCE(public.stripe_disputes.resolved_at, now())
      ELSE public.stripe_disputes.resolved_at END
  RETURNING * INTO v_dispute;

  IF v_payment.id IS NULL THEN
    -- Unknown relationship: recorded for investigation, never attached to a
    -- booking we have not verified.
    RETURN jsonb_build_object('outcome','unlinked_dispute','dispute_id', v_dispute.id);
  END IF;

  -- Nothing changed since the last delivery of this dispute: exactly-once.
  IF v_prev_status IS NOT NULL AND v_prev_status = p_status THEN
    RETURN jsonb_build_object('outcome','no_change','dispute_id', v_dispute.id);
  END IF;

  v_won := p_closed AND p_status = 'won';
  v_lost := p_closed AND p_status IN ('lost','charge_refunded');

  SELECT * INTO v_earning FROM public.host_earnings
   WHERE payment_id = v_payment.id FOR UPDATE;

  UPDATE public.payments SET disputed = NOT v_won WHERE id = v_payment.id;

  IF v_earning.id IS NOT NULL THEN
    IF v_won THEN
      -- Release the dispute hold only. Any other hold, and the normal release
      -- date, still apply.
      UPDATE public.host_earnings SET hold_dispute = false WHERE id = v_earning.id;
      UPDATE public.host_balance_adjustments
        SET status = 'cancelled', resolved_at = now()
        WHERE source_type = 'dispute' AND source_id = p_dispute_id AND status = 'outstanding';
    ELSE
      UPDATE public.host_earnings SET
        hold_dispute = true,
        blocked_reason = 'A payment issue is being resolved'
      WHERE id = v_earning.id;

      IF v_lost AND v_earning.stripe_transfer_id IS NOT NULL THEN
        v_liability := LEAST(GREATEST(COALESCE(p_amount_pence,0),0),
                             v_earning.transferred_amount_pence);
        IF v_liability > 0 THEN
          INSERT INTO public.host_balance_adjustments (
            host_user_id, booking_id, earning_id, source_type, source_id,
            amount_pence, currency, notes
          ) VALUES (
            v_earning.host_user_id, v_earning.booking_id, v_earning.id, 'dispute', p_dispute_id,
            v_liability, UPPER(COALESCE(p_currency,'GBP')),
            'Dispute lost after the host transfer was already sent'
          ) ON CONFLICT (source_type, source_id) DO NOTHING;
        END IF;
      ELSIF v_lost THEN
        UPDATE public.host_earnings SET
          host_entitlement_pence = 0,
          blocked_reason = 'Payment was charged back'
        WHERE id = v_earning.id;
      END IF;
    END IF;
    PERFORM public.stow_recompute_earning_status(v_earning.id);
  END IF;

  RETURN jsonb_build_object('outcome', CASE WHEN v_won THEN 'dispute_won'
                                            WHEN v_lost THEN 'dispute_lost'
                                            ELSE 'dispute_open' END,
                            'dispute_id', v_dispute.id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_stripe_dispute(text, text, text, integer, text, text, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_dispute(text, text, text, integer, text, text, text, boolean, boolean) TO service_role;

-- =============================== payout safety: re-check everything late
CREATE OR REPLACE FUNCTION public.claim_host_earnings_for_transfer(p_limit integer DEFAULT 25)
RETURNS SETOF public.host_earnings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT e.id
    FROM public.host_earnings e
    JOIN public.bookings b ON b.id = e.booking_id
    JOIN public.payments p ON p.id = e.payment_id
    JOIN public.host_payout_accounts a ON a.host_user_id = e.host_user_id
    WHERE e.status IN ('pending', 'eligible')
      AND e.eligible_at <= now()
      AND e.stripe_transfer_id IS NULL
      AND e.host_entitlement_pence > 0
      AND e.reversed_amount_pence = 0
      AND e.refunded_storage_pence = 0
      AND e.hold_refund = false
      AND e.hold_dispute = false
      AND e.hold_review = false
      AND UPPER(e.currency) = 'GBP'
      AND b.status = 'confirmed'
      AND b.cancelled_at IS NULL
      AND p.status = 'succeeded'
      AND p.refund_state = 'none'
      AND p.disputed = false
      AND UPPER(p.currency) = UPPER(e.currency)
      AND a.payouts_enabled = true
      AND a.status = 'ready'
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_cancellations c
         WHERE c.booking_id = e.booking_id
           AND c.financial_resolution_state <> 'not_required'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_refunds r
         WHERE r.payment_id = e.payment_id AND r.status IN ('pending','succeeded')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.stripe_disputes d
         WHERE d.payment_id = e.payment_id AND COALESCE(d.status,'') <> 'won'
      )
      -- An outstanding liability from an earlier refund/dispute holds this
      -- host's future earnings. Nothing is debited automatically.
      AND NOT EXISTS (
        SELECT 1 FROM public.host_balance_adjustments l
         WHERE l.host_user_id = e.host_user_id AND l.status = 'outstanding'
      )
    ORDER BY e.eligible_at
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE OF e SKIP LOCKED
  )
  UPDATE public.host_earnings e
  SET status = 'transferring',
      transfer_attempted_at = now(),
      transfer_attempts = e.transfer_attempts + 1,
      connected_account_id = a.stripe_account_id
  FROM claimable c
  JOIN public.host_payout_accounts a ON true
  WHERE e.id = c.id AND a.host_user_id = e.host_user_id
  RETURNING e.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_host_earnings_for_transfer(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_host_earnings_for_transfer(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_host_earning_transfer(
  p_earning_id uuid, p_transfer_id text, p_connected_account_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE public.host_earnings SET
    status = 'transferred',
    stripe_transfer_id = p_transfer_id,
    transferred_amount_pence = host_entitlement_pence,
    connected_account_id = COALESCE(p_connected_account_id, connected_account_id),
    transfer_created_at = COALESCE(transfer_created_at, now()),
    last_error = NULL
  WHERE id = p_earning_id
    AND (stripe_transfer_id IS NULL OR stripe_transfer_id = p_transfer_id);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_host_earning_transfer(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_host_earning_transfer(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_host_earnings_eligible()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE public.host_earnings e SET status = 'eligible'
  FROM public.bookings b, public.payments p
  WHERE b.id = e.booking_id AND p.id = e.payment_id
    AND e.status = 'pending'
    AND e.eligible_at <= now()
    AND e.refunded_storage_pence = 0
    AND e.hold_refund = false
    AND e.hold_dispute = false
    AND e.hold_review = false
    AND b.status = 'confirmed'
    AND b.cancelled_at IS NULL
    AND p.status = 'succeeded'
    AND p.refund_state = 'none'
    AND p.disputed = false;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_host_earnings_eligible() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_host_earnings_eligible() TO service_role;

-- ============================ address privacy is cancellation-aware now
CREATE OR REPLACE FUNCTION public.get_booking_exact_address(p_booking_id uuid)
RETURNS TABLE (
  address_line1 text,
  address_line2 text,
  town text,
  postcode text,
  access_notes text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND
     OR v_booking.renter_id <> auth.uid()
     OR v_booking.status <> 'confirmed'
     OR v_booking.cancelled_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE booking_id = p_booking_id AND status = 'succeeded'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.address_line1, s.address_line2, s.town, s.postcode, s.access_notes
  FROM public.spaces s WHERE s.id = v_booking.space_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_booking_exact_address(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_exact_address(uuid) TO authenticated, service_role;