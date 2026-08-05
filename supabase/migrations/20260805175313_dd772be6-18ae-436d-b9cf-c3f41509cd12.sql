
-- 1. Renter price re-review state on the request ---------------------------
ALTER TABLE public.storage_requests
  ADD COLUMN IF NOT EXISTS price_reviewed_amount_pence integer,
  ADD COLUMN IF NOT EXISTS price_reviewed_at timestamptz;

-- 2. Authoritative current price for a request ----------------------------
CREATE OR REPLACE FUNCTION public.stow_request_price_state(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.storage_requests;
  v_space   public.spaces;
  v_breakdown jsonb;
  v_storage integer;
  v_fee integer;
  v_rate integer := 1200;      -- same fee configuration as bookings_apply_fee_snapshot
  v_min  integer := 500;
  v_reviewed integer;
  v_state text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_request FROM public.storage_requests WHERE id = p_request_id;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() NOT IN (v_request.renter_id, v_request.host_id) THEN
    RAISE EXCEPTION 'Not your request' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_space FROM public.spaces WHERE id = v_request.space_id;

  IF v_space.id IS NULL OR v_space.listing_status <> 'published' THEN
    RETURN jsonb_build_object(
      'state', 'unavailable',
      'currency', UPPER(COALESCE(v_request.currency_snapshot, 'GBP')),
      'reviewedStorageAmountPence', v_request.storage_amount_pence
    );
  END IF;

  v_breakdown := public.stow_pricing_breakdown(
    v_space.daily_price_pence, v_space.weekly_price_pence, v_space.monthly_price_pence,
    v_request.requested_start_date, v_request.requested_end_date
  );

  IF v_breakdown IS NULL THEN
    RETURN jsonb_build_object(
      'state', 'unavailable',
      'currency', UPPER(COALESCE(v_request.currency_snapshot, 'GBP')),
      'reviewedStorageAmountPence', v_request.storage_amount_pence
    );
  END IF;

  v_storage  := (v_breakdown->>'storageAmountPence')::integer;
  v_fee      := public.stow_service_fee_pence(v_storage, v_rate, v_min);
  v_reviewed := COALESCE(v_request.price_reviewed_amount_pence, v_request.storage_amount_pence);

  IF v_reviewed IS NULL THEN
    v_state := 'unavailable';
  ELSIF v_storage = v_reviewed THEN
    v_state := 'unchanged';
  ELSE
    v_state := 'price_changed';
  END IF;

  RETURN jsonb_build_object(
    'state', v_state,
    'currency', UPPER(COALESCE(v_space.currency, v_request.currency_snapshot, 'GBP')),
    'reviewedStorageAmountPence', v_reviewed,
    'reviewedTotalAmountPence',
      CASE WHEN v_reviewed IS NULL THEN NULL
           ELSE v_reviewed + public.stow_service_fee_pence(v_reviewed, v_rate, v_min) END,
    'currentStorageAmountPence', v_storage,
    'currentServiceFeePence', v_fee,
    'currentTotalAmountPence', v_storage + v_fee,
    'serviceFeeRateBps', v_rate,
    'serviceFeeMinimumPence', v_min,
    'durationDays', (v_breakdown->>'durationDays')::integer,
    'pricingVersion', v_breakdown->>'version',
    'cancellationPolicyVersion', public.stow_cancellation_policy_version(),
    'priceReviewedAt', v_request.price_reviewed_at
  );
END
$function$;

-- 3. Explicit renter re-review of the authoritative price ------------------
CREATE OR REPLACE FUNCTION public.acknowledge_request_price(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.storage_requests;
  v_state jsonb;
  v_current integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_request FROM public.storage_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.renter_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the renter can review this price' USING ERRCODE = '42501';
  END IF;

  v_state := public.stow_request_price_state(p_request_id);
  v_current := NULLIF(v_state->>'currentStorageAmountPence', '')::integer;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'This space is no longer available' USING ERRCODE = 'P0001';
  END IF;

  -- The renter never supplies an amount: the server records what it priced.
  UPDATE public.storage_requests
     SET price_reviewed_amount_pence = v_current,
         price_reviewed_at = now()
   WHERE id = p_request_id;

  RETURN public.stow_request_price_state(p_request_id);
END
$function$;

-- 4. Booking creation: authoritative price gate ---------------------------
CREATE OR REPLACE FUNCTION public.create_booking_from_request(p_request_id uuid)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.storage_requests;
  v_booking public.bookings;
  v_state jsonb;
  v_current integer;
  v_reviewed integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT * INTO v_request FROM public.storage_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_request.renter_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only continue your own request';
  END IF;

  -- Idempotent: an existing booking is returned untouched.
  SELECT * INTO v_booking FROM public.bookings WHERE request_id = p_request_id;
  IF v_booking.id IS NOT NULL THEN RETURN v_booking; END IF;

  IF v_request.status <> 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted request can become a booking';
  END IF;
  IF v_request.booking_action_expires_at IS NOT NULL
     AND v_request.booking_action_expires_at <= now() THEN
    RAISE EXCEPTION 'The acceptance window for this request has expired';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.spaces WHERE id = v_request.space_id) THEN
    RAISE EXCEPTION 'This space is no longer available';
  END IF;

  -- Stale-price protection: the authoritative price must still match the
  -- price the renter reviewed. Otherwise the renter must re-review it.
  v_state    := public.stow_request_price_state(p_request_id);
  v_current  := NULLIF(v_state->>'currentStorageAmountPence', '')::integer;
  v_reviewed := COALESCE(v_request.price_reviewed_amount_pence, v_request.storage_amount_pence);

  IF v_current IS NOT NULL AND v_reviewed IS NOT NULL AND v_current <> v_reviewed THEN
    RAISE EXCEPTION 'PRICE_CHANGED'
      USING ERRCODE = 'P0001',
            DETAIL = v_state::text,
            HINT = 'The renter must review the current price before booking.';
  END IF;

  INSERT INTO public.bookings (
    request_id, space_id, renter_id, host_id, status,
    monthly_price_snapshot, currency_snapshot, start_date, end_date,
    daily_rate_snapshot, weekly_rate_snapshot, minimum_stay_days_snapshot,
    duration_days_snapshot, pricing_version_snapshot, pricing_breakdown_snapshot,
    storage_amount_pence,
    space_title_snapshot, space_type_snapshot, space_area_snapshot,
    space_postcode_district_snapshot,
    inventory_item_count_snapshot, estimated_storage_requirement_m3_snapshot,
    inventory_items_snapshot, spacefit_score_snapshot, spacefit_label_snapshot,
    spacefit_breakdown_snapshot, spacefit_algorithm_snapshot,
    spacefit_plan_snapshot, spacefit_space_dimensions_snapshot,
    renter_first_name_snapshot, host_accepted_at,
    policy_version_snapshot, policy_version_id_snapshot, policy_screening_snapshot,
    compatibility_snapshot, renter_declaration_snapshot, space_suitability_snapshot,
    cancellation_policy_version
  ) VALUES (
    v_request.id, v_request.space_id, v_request.renter_id, v_request.host_id, 'pending_payment',
    v_request.monthly_price_snapshot, COALESCE(v_request.currency_snapshot, 'GBP'),
    v_request.requested_start_date, v_request.requested_end_date,
    v_request.daily_rate_snapshot, v_request.weekly_rate_snapshot,
    v_request.minimum_stay_days_snapshot,
    COALESCE(v_request.duration_days_snapshot,
             v_request.requested_end_date - v_request.requested_start_date),
    v_request.pricing_version_snapshot, v_request.pricing_breakdown_snapshot,
    v_request.storage_amount_pence,
    v_request.space_title_snapshot, v_request.space_type_snapshot,
    v_request.space_area_snapshot, v_request.space_postcode_district_snapshot,
    v_request.inventory_item_count_snapshot, v_request.estimated_storage_requirement_m3_snapshot,
    COALESCE(v_request.inventory_items_snapshot, '[]'::jsonb),
    v_request.spacefit_score_snapshot, v_request.spacefit_label_snapshot,
    v_request.spacefit_breakdown_snapshot, v_request.spacefit_algorithm_snapshot,
    v_request.spacefit_plan_snapshot, v_request.spacefit_space_dimensions_snapshot,
    v_request.renter_first_name_snapshot, v_request.responded_at,
    v_request.policy_version_snapshot, v_request.policy_version_id_snapshot,
    v_request.policy_screening_snapshot, v_request.compatibility_snapshot,
    v_request.renter_declaration_snapshot, v_request.space_suitability_snapshot,
    public.stow_cancellation_policy_version()
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING * INTO v_booking;

  IF v_booking.id IS NULL THEN
    SELECT * INTO v_booking FROM public.bookings WHERE request_id = p_request_id;
  END IF;

  RETURN v_booking;
END
$function$;

-- 5. Grants: least privilege matching the existing policies ---------------
REVOKE ALL ON public.conversations   FROM anon, authenticated;
REVOKE ALL ON public.messages        FROM anon, authenticated;
REVOKE ALL ON public.bookings        FROM anon, authenticated;
REVOKE ALL ON public.payments        FROM anon, authenticated;
REVOKE ALL ON public.storage_requests FROM anon, authenticated;

GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT ON public.bookings TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT, UPDATE ON public.storage_requests TO authenticated;

GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.bookings TO service_role;
GRANT ALL ON public.payments TO service_role;
GRANT ALL ON public.storage_requests TO service_role;

-- 6. Execute grants: signed-out visitors cannot call sign-in-only functions
DO $do$
DECLARE
  v_name text;
  v_sig text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'activate_booking','begin_booking_checkout','complete_booking',
    'confirm_booking_collection','confirm_booking_handover','get_booking_exact_address',
    'get_or_create_booking_conversation','get_or_create_space_conversation',
    'get_host_response_stats','respond_to_storage_request','has_role',
    'is_booking_participant','is_booking_participant_text','is_support_staff',
    'booking_party_role','booking_stage_open','stow_request_price_state',
    'acknowledge_request_price'
  ] LOOP
    FOR v_sig IN
      SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
    END LOOP;
  END LOOP;
END
$do$;
