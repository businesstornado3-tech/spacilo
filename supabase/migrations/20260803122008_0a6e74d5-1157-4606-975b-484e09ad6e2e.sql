-- ============================================================ enums
CREATE TYPE public.host_payout_status AS ENUM (
  'not_started', 'incomplete', 'pending_verification', 'restricted', 'ready'
);

CREATE TYPE public.host_earning_status AS ENUM (
  'pending', 'eligible', 'transferring', 'transferred', 'reversed', 'partially_reversed', 'blocked'
);

-- ============================================ configurable payout policy
-- Centralised so the release rule exists in exactly one place server-side.
CREATE OR REPLACE FUNCTION public.stow_payout_release_delay_hours()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 24;
$$;

CREATE OR REPLACE FUNCTION public.stow_payout_eligible_at(p_start_date date)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (p_start_date::timestamp AT TIME ZONE 'UTC')
       + make_interval(hours => public.stow_payout_release_delay_hours());
$$;

-- ================================================ host payout accounts
CREATE TABLE public.host_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL UNIQUE,
  stripe_account_id text NOT NULL UNIQUE,
  livemode boolean,
  country text,
  status public.host_payout_status NOT NULL DEFAULT 'not_started',
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  transfers_capability text,
  disabled_reason text,
  currently_due jsonb NOT NULL DEFAULT '[]'::jsonb,
  eventually_due jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_verification jsonb NOT NULL DEFAULT '[]'::jsonb,
  onboarding_started_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.host_payout_accounts TO authenticated;
GRANT ALL ON public.host_payout_accounts TO service_role;

ALTER TABLE public.host_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts read their own payout account"
  ON public.host_payout_accounts FOR SELECT TO authenticated
  USING (host_user_id = auth.uid());

-- ================================================= host earnings ledger
CREATE TABLE public.host_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  space_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  period_index integer NOT NULL DEFAULT 0,
  period_label text NOT NULL DEFAULT 'First month',
  gross_storage_amount_pence integer NOT NULL CHECK (gross_storage_amount_pence >= 0),
  platform_fee_pence integer NOT NULL CHECK (platform_fee_pence >= 0),
  host_entitlement_pence integer NOT NULL CHECK (host_entitlement_pence >= 0),
  service_fee_rate_bps integer NOT NULL,
  service_fee_minimum_pence integer NOT NULL,
  status public.host_earning_status NOT NULL DEFAULT 'pending',
  eligible_at timestamptz NOT NULL,
  livemode boolean,
  connected_account_id text,
  stripe_transfer_id text UNIQUE,
  transfer_attempted_at timestamptz,
  transfer_created_at timestamptz,
  transfer_attempts integer NOT NULL DEFAULT 0,
  reversed_amount_pence integer NOT NULL DEFAULT 0 CHECK (reversed_amount_pence >= 0),
  refunded_storage_pence integer NOT NULL DEFAULT 0 CHECK (refunded_storage_pence >= 0),
  blocked_reason text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX host_earnings_host_idx ON public.host_earnings (host_user_id, created_at DESC);
CREATE INDEX host_earnings_release_idx ON public.host_earnings (status, eligible_at);
CREATE INDEX host_earnings_booking_idx ON public.host_earnings (booking_id);

GRANT SELECT ON public.host_earnings TO authenticated;
GRANT ALL ON public.host_earnings TO service_role;

ALTER TABLE public.host_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts read their own earnings"
  ON public.host_earnings FOR SELECT TO authenticated
  USING (host_user_id = auth.uid());

CREATE TRIGGER host_payout_accounts_touch
  BEFORE UPDATE ON public.host_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER host_earnings_touch
  BEFORE UPDATE ON public.host_earnings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================================== earning creation on paid payment
-- Entitlement always comes from the payment snapshot, never a recalculation.
CREATE OR REPLACE FUNCTION public.record_host_earning(p_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    period_index, period_label,
    gross_storage_amount_pence, platform_fee_pence, host_entitlement_pence,
    service_fee_rate_bps, service_fee_minimum_pence,
    status, eligible_at, livemode
  ) VALUES (
    v_payment.host_id, v_payment.booking_id, v_payment.id, v_payment.space_id,
    UPPER(v_payment.currency), v_payment.period_index, v_payment.period_label,
    v_payment.storage_amount_pence, v_payment.service_fee_amount_pence,
    v_payment.storage_amount_pence,
    v_payment.service_fee_rate_bps, v_payment.service_fee_minimum_pence,
    'pending', public.stow_payout_eligible_at(v_booking.start_date), v_payment.livemode
  )
  ON CONFLICT (payment_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_host_earning(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_host_earning(uuid) TO service_role;

-- Create the earning as part of the existing confirmation transaction.
CREATE OR REPLACE FUNCTION public.confirm_booking_payment(p_event_id text, p_event_type text, p_payment_id uuid, p_session_id text, p_payment_intent_id text, p_amount_pence integer, p_currency text, p_livemode boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments;
  v_booking public.bookings;
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

    IF v_booking.status = 'pending_payment' THEN
      UPDATE public.bookings SET
        status = 'confirmed',
        paid_at = COALESCE(paid_at, now()),
        confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = v_booking.id;
    END IF;

    -- Host entitlement enters the ledger held; it is NOT transferred here.
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

-- Backfill the already-tested confirmed booking(s) without touching their data.
INSERT INTO public.host_earnings (
  host_user_id, booking_id, payment_id, space_id, currency,
  period_index, period_label,
  gross_storage_amount_pence, platform_fee_pence, host_entitlement_pence,
  service_fee_rate_bps, service_fee_minimum_pence, status, eligible_at, livemode
)
SELECT p.host_id, p.booking_id, p.id, p.space_id, UPPER(p.currency),
       p.period_index, p.period_label,
       p.storage_amount_pence, p.service_fee_amount_pence, p.storage_amount_pence,
       p.service_fee_rate_bps, p.service_fee_minimum_pence,
       'pending', public.stow_payout_eligible_at(b.start_date), p.livemode
FROM public.payments p
JOIN public.bookings b ON b.id = p.booking_id
WHERE p.status = 'succeeded'
ON CONFLICT (payment_id) DO NOTHING;

-- ========================================== payout processor primitives
-- Claims releasable earnings, skipping rows another worker already holds.
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
      AND b.status = 'confirmed'
      AND p.status = 'succeeded'
      AND a.payouts_enabled = true
      AND a.status = 'ready'
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

CREATE OR REPLACE FUNCTION public.fail_host_earning_transfer(
  p_earning_id uuid, p_reason text, p_block boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.host_earnings SET
    status = CASE WHEN p_block THEN 'blocked'::public.host_earning_status
                  ELSE 'pending'::public.host_earning_status END,
    blocked_reason = CASE WHEN p_block THEN p_reason ELSE blocked_reason END,
    last_error = p_reason
  WHERE id = p_earning_id AND status = 'transferring' AND stripe_transfer_id IS NULL;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fail_host_earning_transfer(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_host_earning_transfer(uuid, text, boolean) TO service_role;

-- ================================================= refund / reversal
-- Refund BEFORE transfer reduces or blocks the entitlement.
-- Refund AFTER transfer is recorded for reconciliation, never silently erased.
CREATE OR REPLACE FUNCTION public.apply_storage_refund_to_earning(
  p_payment_id uuid, p_refunded_storage_pence integer, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_earning public.host_earnings;
  v_remaining integer;
BEGIN
  SELECT * INTO v_earning FROM public.host_earnings
  WHERE payment_id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'no_earning');
  END IF;

  v_remaining := GREATEST(v_earning.gross_storage_amount_pence - p_refunded_storage_pence, 0);

  IF v_earning.stripe_transfer_id IS NULL THEN
    UPDATE public.host_earnings SET
      refunded_storage_pence = p_refunded_storage_pence,
      host_entitlement_pence = v_remaining,
      status = CASE WHEN v_remaining = 0 THEN 'blocked'::public.host_earning_status
                    ELSE status END,
      blocked_reason = CASE WHEN v_remaining = 0
                            THEN COALESCE(p_reason, 'refunded before transfer')
                            ELSE blocked_reason END
    WHERE id = v_earning.id;
    RETURN jsonb_build_object('outcome', 'adjusted_before_transfer',
                              'host_entitlement_pence', v_remaining);
  END IF;

  -- Already transferred: flag for reconciliation, keep the audit trail intact.
  UPDATE public.host_earnings SET
    refunded_storage_pence = p_refunded_storage_pence,
    status = CASE WHEN v_remaining = 0 THEN 'reversed'::public.host_earning_status
                  ELSE 'partially_reversed'::public.host_earning_status END,
    blocked_reason = COALESCE(p_reason, 'refunded after transfer — reconciliation required')
  WHERE id = v_earning.id;

  RETURN jsonb_build_object('outcome', 'requires_reversal',
                            'stripe_transfer_id', v_earning.stripe_transfer_id,
                            'recoverable_pence',
                            LEAST(p_refunded_storage_pence, v_earning.host_entitlement_pence));
END;
$$;

REVOKE ALL ON FUNCTION public.apply_storage_refund_to_earning(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_storage_refund_to_earning(uuid, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_host_earning_reversal(
  p_earning_id uuid, p_reversed_pence integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.host_earnings SET
    reversed_amount_pence = p_reversed_pence,
    status = CASE WHEN p_reversed_pence >= host_entitlement_pence
                  THEN 'reversed'::public.host_earning_status
                  ELSE 'partially_reversed'::public.host_earning_status END
  WHERE id = p_earning_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_host_earning_reversal(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_host_earning_reversal(uuid, integer) TO service_role;

-- =========================================== promote pending -> eligible
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
    AND b.status = 'confirmed'
    AND p.status = 'succeeded';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_host_earnings_eligible() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_host_earnings_eligible() TO service_role;

-- ============================= connected account upsert (webhook/server)
CREATE OR REPLACE FUNCTION public.upsert_host_payout_account(
  p_host_user_id uuid,
  p_stripe_account_id text,
  p_livemode boolean,
  p_country text,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_details_submitted boolean,
  p_transfers_capability text,
  p_disabled_reason text,
  p_currently_due jsonb,
  p_eventually_due jsonb,
  p_pending_verification jsonb
)
RETURNS public.host_payout_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status public.host_payout_status;
  v_row public.host_payout_accounts;
BEGIN
  v_status := CASE
    WHEN p_payouts_enabled AND p_transfers_capability = 'active' THEN 'ready'
    WHEN p_disabled_reason IS NOT NULL THEN 'restricted'
    WHEN NOT p_details_submitted THEN 'incomplete'
    WHEN jsonb_array_length(COALESCE(p_currently_due, '[]'::jsonb)) > 0 THEN 'incomplete'
    ELSE 'pending_verification'
  END;

  INSERT INTO public.host_payout_accounts (
    host_user_id, stripe_account_id, livemode, country, status,
    charges_enabled, payouts_enabled, details_submitted, transfers_capability,
    disabled_reason, currently_due, eventually_due, pending_verification,
    onboarding_started_at, last_synced_at
  ) VALUES (
    p_host_user_id, p_stripe_account_id, p_livemode, p_country, v_status,
    COALESCE(p_charges_enabled,false), COALESCE(p_payouts_enabled,false),
    COALESCE(p_details_submitted,false), p_transfers_capability,
    p_disabled_reason, COALESCE(p_currently_due,'[]'::jsonb),
    COALESCE(p_eventually_due,'[]'::jsonb), COALESCE(p_pending_verification,'[]'::jsonb),
    now(), now()
  )
  ON CONFLICT (host_user_id) DO UPDATE SET
    stripe_account_id = EXCLUDED.stripe_account_id,
    livemode = EXCLUDED.livemode,
    country = COALESCE(EXCLUDED.country, public.host_payout_accounts.country),
    status = EXCLUDED.status,
    charges_enabled = EXCLUDED.charges_enabled,
    payouts_enabled = EXCLUDED.payouts_enabled,
    details_submitted = EXCLUDED.details_submitted,
    transfers_capability = EXCLUDED.transfers_capability,
    disabled_reason = EXCLUDED.disabled_reason,
    currently_due = EXCLUDED.currently_due,
    eventually_due = EXCLUDED.eventually_due,
    pending_verification = EXCLUDED.pending_verification,
    last_synced_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_host_payout_account(uuid, text, boolean, text, boolean, boolean, boolean, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_host_payout_account(uuid, text, boolean, text, boolean, boolean, boolean, text, text, jsonb, jsonb, jsonb) TO service_role;