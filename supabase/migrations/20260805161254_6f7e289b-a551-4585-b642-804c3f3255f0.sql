DROP FUNCTION IF EXISTS public.create_storage_request(uuid, uuid, date, date, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_storage_request(
  p_space_id uuid,
  p_inventory_id uuid,
  p_start_date date,
  p_end_date date,
  p_renter_note text DEFAULT NULL::text,
  p_spacefit jsonb DEFAULT NULL::jsonb,
  p_declaration jsonb DEFAULT NULL::jsonb
)
RETURNS public.storage_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_renter uuid := auth.uid();
  v_space public.spaces%ROWTYPE;
  v_inventory public.renter_inventories%ROWTYPE;
  v_items jsonb; v_lines integer; v_largest jsonb;
  v_existing public.storage_requests; v_row public.storage_requests;
  v_note text;
  v_days integer; v_min integer; v_price jsonb; v_storage integer;
  v_policy public.storage_policy_versions;
  v_screen jsonb; v_suitability jsonb; v_compat jsonb;
  v_profile public.space_suitability_profiles;
  v_warnings jsonb;
BEGIN
  IF v_renter IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to send a storage request.';
  END IF;

  SELECT * INTO v_space FROM public.spaces WHERE id = p_space_id;
  IF NOT FOUND OR v_space.listing_status <> 'published' THEN
    RAISE EXCEPTION 'This space is no longer available to request.';
  END IF;
  IF v_space.host_id = v_renter THEN
    RAISE EXCEPTION 'You can''t send a storage request to your own space.';
  END IF;

  SELECT * INTO v_inventory
    FROM public.renter_inventories
   WHERE id = p_inventory_id AND user_id = v_renter AND status <> 'archived';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'We couldn''t find your inventory.';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date <= p_start_date THEN
    RAISE EXCEPTION 'Please choose an end date after the start date.';
  END IF;
  IF p_start_date < current_date THEN
    RAISE EXCEPTION 'The start date can''t be in the past.';
  END IF;

  v_days := p_end_date - p_start_date;
  v_min := GREATEST(COALESCE(v_space.minimum_stay_days, 1), 1);
  IF v_days < v_min THEN
    RAISE EXCEPTION 'This host asks for a minimum stay of % day(s).', v_min;
  END IF;

  v_policy := public.stow_active_policy_version();
  IF v_policy.id IS NULL THEN
    RAISE EXCEPTION 'We can''t check the storage policy right now. Please try again shortly.';
  END IF;

  v_screen := public.stow_screen_inventory(p_inventory_id, v_renter);
  IF coalesce((v_screen->>'blocked')::boolean, false) THEN
    RAISE EXCEPTION 'Some items in My Stuff can''t be stored under our storage policy. Please review My Stuff before sending this request.';
  END IF;
  IF coalesce((v_screen->>'action_required')::boolean, false) THEN
    RAISE EXCEPTION 'Some items in My Stuff still need checking before you can send this request.';
  END IF;

  IF coalesce(p_declaration->>'policy_version', '') <> v_policy.version THEN
    RAISE EXCEPTION 'Our storage policy has been updated. Please review it and confirm again.';
  END IF;
  IF NOT (coalesce((p_declaration->>'accurate')::boolean, false)
      AND coalesce((p_declaration->>'no_prohibited_items')::boolean, false)
      AND coalesce((p_declaration->>'accepts_policy')::boolean, false)) THEN
    RAISE EXCEPTION 'Please confirm the storage declarations before sending this request.';
  END IF;

  SELECT * INTO v_profile FROM public.space_suitability_profiles WHERE space_id = p_space_id;
  v_suitability := CASE WHEN v_profile.space_id IS NULL THEN NULL ELSE jsonb_build_object(
      'attributes', v_profile.attributes,
      'host_notes', v_profile.host_notes,
      'host_confirmed_at', v_profile.host_confirmed_at,
      'declared_at', v_profile.declared_at) END;

  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
           'reason_code', r.internal_reason_code,
           'attribute', a.key,
           'required', a.value,
           'actual', coalesce(v_profile.attributes->>a.key, 'unknown'),
           'message', r.renter_message)), '[]'::jsonb)
    INTO v_warnings
    FROM jsonb_array_elements(coalesce(v_screen->'items', '[]'::jsonb)) e
    JOIN public.storage_policy_rules r
      ON r.policy_version_id = v_policy.id AND r.is_active
     AND r.category = e->>'policy_category'
    CROSS JOIN LATERAL jsonb_each_text(r.required_space_attributes) a
   WHERE coalesce(v_profile.attributes->>a.key, 'unknown') IS DISTINCT FROM a.value;

  v_compat := jsonb_build_object(
    'evaluated_at', now(),
    'policy_version', v_policy.version,
    'policy_status', CASE WHEN jsonb_array_length(coalesce(v_warnings,'[]'::jsonb)) > 0
                          THEN 'allowed_with_care' ELSE 'allowed' END,
    'suitability_warnings', coalesce(v_warnings, '[]'::jsonb),
    'suitability_known', v_profile.space_id IS NOT NULL,
    'physical_fit', jsonb_build_object(
      'spacefit_score', nullif((p_spacefit->>'score'), '')::integer,
      'spacefit_label', p_spacefit->>'label'));

  v_note := nullif(btrim(coalesce(p_renter_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Your note is too long. Please keep it under 500 characters.';
  END IF;

  SELECT * INTO v_existing
    FROM public.storage_requests
   WHERE renter_id = v_renter AND space_id = p_space_id AND status = 'pending'
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.expires_at > now() THEN RETURN v_existing; END IF;
    UPDATE public.storage_requests SET status = 'expired', updated_at = now()
     WHERE id = v_existing.id;
  END IF;

  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'catalogue_key', i.catalogue_key, 'label', i.item_name, 'category', i.category,
      'quantity', i.quantity, 'estimated_volume_m3', i.estimated_total_volume_m3,
      'length_cm', i.length_cm, 'width_cm', i.width_cm, 'height_cm', i.height_cm,
      'stackable', i.stackable, 'fragile', i.fragile,
      'policy_category', coalesce(i.policy_category,
        public.stow_policy_category(i.category::text, i.item_name, i.catalogue_key))
    ) ORDER BY i.item_name), '[]'::jsonb),
    count(*)
  INTO v_items, v_lines
  FROM public.inventory_items i
  WHERE i.inventory_id = p_inventory_id AND i.user_id = v_renter;

  IF v_lines = 0 THEN
    RAISE EXCEPTION 'Add at least one item to My Stuff before sending a request.';
  END IF;

  SELECT jsonb_build_object(
      'label', i.item_name, 'length_cm', i.length_cm, 'width_cm', i.width_cm,
      'height_cm', i.height_cm,
      'longest_edge_cm', greatest(i.length_cm, i.width_cm, i.height_cm))
    INTO v_largest
    FROM public.inventory_items i
   WHERE i.inventory_id = p_inventory_id AND i.user_id = v_renter
     AND i.length_cm IS NOT NULL AND i.width_cm IS NOT NULL AND i.height_cm IS NOT NULL
   ORDER BY greatest(i.length_cm, i.width_cm, i.height_cm) DESC
   LIMIT 1;

  v_price := public.stow_pricing_breakdown(
    v_space.daily_price_pence, v_space.weekly_price_pence,
    v_space.monthly_price_pence, p_start_date, p_end_date);
  v_storage := (v_price->>'storageAmountPence')::integer;

  INSERT INTO public.storage_requests (
    renter_id, host_id, space_id, inventory_id,
    requested_start_date, requested_end_date, renter_note,
    inventory_item_count_snapshot, inventory_line_count_snapshot,
    estimated_storage_requirement_m3_snapshot, estimated_item_volume_m3_snapshot,
    largest_item_snapshot, inventory_items_snapshot,
    space_title_snapshot, space_type_snapshot, space_area_snapshot,
    space_postcode_district_snapshot, space_available_capacity_m3_snapshot,
    space_accepted_categories_snapshot, space_access_summary_snapshot,
    monthly_price_snapshot, currency_snapshot,
    daily_rate_snapshot, weekly_rate_snapshot, minimum_stay_days_snapshot,
    duration_days_snapshot, pricing_version_snapshot, pricing_breakdown_snapshot,
    storage_amount_pence,
    spacefit_score_snapshot, spacefit_label_snapshot,
    spacefit_breakdown_snapshot, spacefit_algorithm_snapshot,
    spacefit_plan_snapshot, spacefit_space_dimensions_snapshot,
    policy_version_snapshot, policy_version_id_snapshot, policy_screening_snapshot,
    compatibility_snapshot, renter_declaration_snapshot, space_suitability_snapshot
  ) VALUES (
    v_renter, v_space.host_id, v_space.id, v_inventory.id,
    p_start_date, p_end_date, v_note,
    v_inventory.item_count, v_lines,
    v_inventory.estimated_storage_requirement_m3, v_inventory.estimated_total_item_volume_m3,
    v_largest, v_items,
    v_space.title, v_space.space_type::text, v_space.approximate_area,
    v_space.postcode_district,
    v_space.estimated_available_volume_m3,
    v_space.accepted_categories, v_space.access_type::text,
    v_space.monthly_price_pence, coalesce(v_space.currency, 'GBP'),
    v_space.daily_price_pence, v_space.weekly_price_pence, v_min,
    v_days, public.stow_pricing_version(), v_price,
    v_storage,
    nullif((p_spacefit->>'score'), '')::integer,
    p_spacefit->>'label', p_spacefit->'breakdown', p_spacefit->>'algorithm',
    p_spacefit->'plan',
    jsonb_build_object(
      'length_m', v_space.length_m, 'width_m', v_space.width_m, 'height_m', v_space.height_m,
      'floor_area_m2', v_space.floor_area_m2, 'total_volume_m3', v_space.total_volume_m3,
      'estimated_available_volume_m3', v_space.estimated_available_volume_m3,
      'door_width_cm', v_space.door_width_cm, 'door_height_cm', v_space.door_height_cm,
      'obstacles', v_space.obstacles, 'obstacle_volume_m3', v_space.obstacle_volume_m3,
      'measurement_source', v_space.measurement_source
    ),
    v_policy.version, v_policy.id, v_screen,
    v_compat,
    jsonb_build_object(
      'policy_version', v_policy.version,
      'accurate', true, 'no_prohibited_items', true, 'accepts_policy', true,
      'accepted_at', now()),
    v_suitability
  )
  RETURNING * INTO v_row;

  INSERT INTO public.policy_acceptances (user_id, policy_version_id, role, context)
  VALUES (v_renter, v_policy.id, 'renter',
          jsonb_build_object('request_id', v_row.id, 'space_id', v_space.id));

  INSERT INTO public.policy_audit_events (actor_id, event_type, subject_type, subject_id, detail)
  VALUES (v_renter, 'request_screened', 'storage_request', v_row.id,
          jsonb_build_object('policy_version', v_policy.version,
                             'warnings', coalesce(v_warnings, '[]'::jsonb)));

  RETURN v_row;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_row FROM public.storage_requests
     WHERE renter_id = v_renter AND space_id = p_space_id AND status = 'pending' LIMIT 1;
    RETURN v_row;
END
$$;

REVOKE EXECUTE ON FUNCTION public.create_storage_request(uuid, uuid, date, date, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_storage_request(uuid, uuid, date, date, text, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_booking_from_request(p_request_id uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.storage_requests;
  v_booking public.bookings;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT * INTO v_request FROM public.storage_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_request.renter_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only continue your own request';
  END IF;

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
    compatibility_snapshot, renter_declaration_snapshot, space_suitability_snapshot
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
    v_request.renter_declaration_snapshot, v_request.space_suitability_snapshot
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING * INTO v_booking;

  IF v_booking.id IS NULL THEN
    SELECT * INTO v_booking FROM public.bookings WHERE request_id = p_request_id;
  END IF;

  RETURN v_booking;
END
$$;