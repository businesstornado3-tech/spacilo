-- ============================================================ fee constants
CREATE OR REPLACE FUNCTION public.stow_service_fee_pence(
  p_storage_pence integer,
  p_rate_bps integer DEFAULT 1200,
  p_minimum_pence integer DEFAULT 500
) RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(
    p_minimum_pence,
    ((COALESCE(p_storage_pence, 0)::bigint * p_rate_bps) + 5000) / 10000
  )::integer;
$$;

-- ================================================= booking financial snapshot
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS storage_amount_pence integer,
  ADD COLUMN IF NOT EXISTS service_fee_amount_pence integer,
  ADD COLUMN IF NOT EXISTS renter_total_amount_pence integer,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS service_fee_rate_bps integer,
  ADD COLUMN IF NOT EXISTS service_fee_minimum_pence integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

UPDATE public.bookings
SET
  storage_amount_pence = COALESCE(storage_amount_pence, monthly_price_snapshot),
  service_fee_rate_bps = COALESCE(service_fee_rate_bps, 1200),
  service_fee_minimum_pence = COALESCE(service_fee_minimum_pence, 500),
  service_fee_amount_pence = COALESCE(
    service_fee_amount_pence,
    CASE WHEN monthly_price_snapshot IS NULL THEN NULL
         ELSE public.stow_service_fee_pence(monthly_price_snapshot, 1200, 500) END
  ),
  currency = COALESCE(NULLIF(currency, ''), UPPER(COALESCE(currency_snapshot, 'GBP')))
WHERE storage_amount_pence IS NULL
   OR service_fee_amount_pence IS NULL
   OR service_fee_rate_bps IS NULL
   OR service_fee_minimum_pence IS NULL;

UPDATE public.bookings
SET renter_total_amount_pence = storage_amount_pence + service_fee_amount_pence
WHERE renter_total_amount_pence IS NULL
  AND storage_amount_pence IS NOT NULL
  AND service_fee_amount_pence IS NOT NULL;

-- Snapshot the fee rule at booking creation so historical bookings stay reproducible.
CREATE OR REPLACE FUNCTION public.bookings_apply_fee_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.storage_amount_pence := COALESCE(NEW.storage_amount_pence, NEW.monthly_price_snapshot);
    NEW.service_fee_rate_bps := COALESCE(NEW.service_fee_rate_bps, 1200);
    NEW.service_fee_minimum_pence := COALESCE(NEW.service_fee_minimum_pence, 500);
    NEW.currency := UPPER(COALESCE(NULLIF(NEW.currency, ''), NEW.currency_snapshot, 'GBP'));
    IF NEW.storage_amount_pence IS NOT NULL THEN
      NEW.service_fee_amount_pence := COALESCE(
        NEW.service_fee_amount_pence,
        public.stow_service_fee_pence(
          NEW.storage_amount_pence, NEW.service_fee_rate_bps, NEW.service_fee_minimum_pence
        )
      );
      NEW.renter_total_amount_pence := COALESCE(
        NEW.renter_total_amount_pence,
        NEW.storage_amount_pence + NEW.service_fee_amount_pence
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Financial snapshot is immutable once written.
  NEW.storage_amount_pence := OLD.storage_amount_pence;
  NEW.service_fee_amount_pence := OLD.service_fee_amount_pence;
  NEW.renter_total_amount_pence := OLD.renter_total_amount_pence;
  NEW.service_fee_rate_bps := OLD.service_fee_rate_bps;
  NEW.service_fee_minimum_pence := OLD.service_fee_minimum_pence;
  NEW.currency := OLD.currency;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_fee_snapshot ON public.bookings;
CREATE TRIGGER bookings_fee_snapshot
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_apply_fee_snapshot();

-- ==================================================================== payments
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM (
    'requires_payment', 'processing', 'succeeded', 'failed', 'cancelled', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  renter_id uuid NOT NULL,
  host_id uuid NOT NULL,
  space_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'stripe',
  livemode boolean,
  period_label text NOT NULL DEFAULT 'first_month',
  period_index integer NOT NULL DEFAULT 1,
  storage_amount_pence integer NOT NULL,
  service_fee_amount_pence integer NOT NULL,
  renter_total_amount_pence integer NOT NULL,
  service_fee_rate_bps integer NOT NULL,
  service_fee_minimum_pence integer NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  status public.payment_status NOT NULL DEFAULT 'requires_payment',
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  amount_received_pence integer,
  currency_received text,
  failure_reason text,
  hold_volume_m3 numeric NOT NULL DEFAULT 0,
  hold_expires_at timestamptz,
  hold_released_at timestamptz,
  checkout_created_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  last_webhook_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_booking_idx ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS payments_hold_idx ON public.payments(space_id, status, hold_expires_at);
-- At most one live (unsucceeded) attempt per booking.
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_open_attempt
  ON public.payments(booking_id)
  WHERE status IN ('requires_payment', 'processing');
-- At most one successful payment per booking period.
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_success_per_period
  ON public.payments(booking_id, period_index)
  WHERE status = 'succeeded';

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Renters read their own payments"
  ON public.payments FOR SELECT TO authenticated
  USING (auth.uid() = renter_id);

-- ====================================================== stripe webhook events
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  livemode boolean NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  outcome text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- =============================================== updated_at maintenance
CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================== availability
-- Usable capacity minus time-overlapping confirmed bookings and live holds.
-- Physical capacity columns are never mutated.
CREATE OR REPLACE FUNCTION public.space_available_volume_m3(
  p_space_id uuid,
  p_start date,
  p_end date,
  p_exclude_booking uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_usable numeric;
  v_confirmed numeric;
  v_held numeric;
BEGIN
  SELECT COALESCE(estimated_available_volume_m3, total_volume_m3, 0)
    INTO v_usable FROM public.spaces WHERE id = p_space_id;
  IF v_usable IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(b.estimated_storage_requirement_m3_snapshot), 0)
    INTO v_confirmed
  FROM public.bookings b
  WHERE b.space_id = p_space_id
    AND b.status = 'confirmed'
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
    AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
    AND b.start_date < p_end AND b.end_date > p_start;

  RETURN v_usable - v_confirmed - v_held;
END;
$$;

-- ============================================================ start checkout
-- Creates (or reuses) the payment attempt + 30 minute capacity hold.
CREATE OR REPLACE FUNCTION public.begin_booking_checkout(p_booking_id uuid)
RETURNS public.payments
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Serialise concurrent checkout attempts for the same space.
  PERFORM 1 FROM public.spaces WHERE id = v_booking.space_id FOR UPDATE;

  -- Retire this booking's own stale attempts before re-checking availability.
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
    status, hold_volume_m3, hold_expires_at, checkout_created_at
  ) VALUES (
    v_booking.id, v_booking.renter_id, v_booking.host_id, v_booking.space_id, 'stripe',
    v_booking.storage_amount_pence, v_fee, v_total,
    COALESCE(v_booking.service_fee_rate_bps, 1200),
    COALESCE(v_booking.service_fee_minimum_pence, 500),
    UPPER(COALESCE(v_booking.currency, 'GBP')),
    'requires_payment', v_booking.estimated_storage_requirement_m3_snapshot,
    now() + interval '30 minutes', now()
  ) RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_booking_checkout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_booking_checkout(uuid) TO authenticated, service_role;

-- ======================================================== confirm payment
-- Service-role only. Idempotent, amount/currency/livemode validated.
CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
  p_event_id text,
  p_event_type text,
  p_payment_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_pence integer,
  p_currency text,
  p_livemode boolean
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments;
  v_booking public.bookings;
  v_outcome text;
BEGIN
  -- Idempotency: first writer wins, replays short-circuit.
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

    IF v_booking.status = 'pending_payment' THEN
      UPDATE public.bookings SET
        status = 'confirmed',
        paid_at = COALESCE(paid_at, now()),
        confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = v_booking.id;
    END IF;

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
$$;

REVOKE ALL ON FUNCTION public.confirm_booking_payment(text, text, uuid, text, text, integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(text, text, uuid, text, text, integer, text, boolean) TO service_role;

-- ============================================== record non-success outcomes
CREATE OR REPLACE FUNCTION public.record_payment_failure(
  p_event_id text,
  p_event_type text,
  p_payment_id uuid,
  p_status public.payment_status,
  p_reason text,
  p_livemode boolean
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stripe_webhook_events (id, type, livemode, payment_id)
  VALUES (p_event_id, p_event_type, p_livemode, p_payment_id)
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'duplicate_event');
  END IF;

  UPDATE public.payments SET
    status = p_status,
    failure_reason = p_reason,
    failed_at = now(),
    last_webhook_at = now(),
    hold_released_at = COALESCE(hold_released_at, now())
  WHERE id = p_payment_id AND status IN ('requires_payment', 'processing');

  UPDATE public.stripe_webhook_events
  SET processed_at = now(), outcome = p_status::text WHERE id = p_event_id;

  RETURN jsonb_build_object('outcome', p_status::text);
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_failure(text, text, uuid, public.payment_status, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment_failure(text, text, uuid, public.payment_status, text, boolean) TO service_role;

-- ==================================================== exact address release
-- Only the renter of a confirmed, successfully paid booking.
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
  IF NOT FOUND OR v_booking.renter_id <> auth.uid() OR v_booking.status <> 'confirmed' THEN
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