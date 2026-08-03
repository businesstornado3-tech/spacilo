-- ============================================================
-- Prompt 14 — flexible storage duration + booking lifecycle
-- ============================================================

-- 1. Host flexible rates -------------------------------------------------
ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS daily_price_pence integer,
  ADD COLUMN IF NOT EXISTS weekly_price_pence integer,
  ADD COLUMN IF NOT EXISTS minimum_stay_days integer;

ALTER TABLE public.spaces
  DROP CONSTRAINT IF EXISTS spaces_flexible_rates_positive;
ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_flexible_rates_positive CHECK (
    (daily_price_pence IS NULL OR daily_price_pence >= 0)
    AND (weekly_price_pence IS NULL OR weekly_price_pence >= 0)
    AND (minimum_stay_days IS NULL OR (minimum_stay_days >= 1 AND minimum_stay_days <= 3660))
  );

-- 2. Deterministic pricing engine: storage-duration-v1 -------------------
CREATE OR REPLACE FUNCTION public.stow_pricing_version()
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT 'storage-duration-v1'::text $$;

CREATE OR REPLACE FUNCTION public.stow_effective_rates(
  p_daily integer, p_weekly integer, p_monthly integer
) RETURNS TABLE(daily integer, weekly integer, monthly integer)
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE d integer; w integer; m integer;
BEGIN
  d := nullif(greatest(coalesce(p_daily, 0), 0), 0);
  w := nullif(greatest(coalesce(p_weekly, 0), 0), 0);
  m := nullif(greatest(coalesce(p_monthly, 0), 0), 0);
  IF d IS NULL AND w IS NULL AND m IS NULL THEN RETURN; END IF;

  -- Derived rates always round UP so they never undercut a host's own rate.
  IF d IS NULL THEN
    d := CASE WHEN w IS NOT NULL THEN ceil(w::numeric / 7)::integer
              ELSE ceil(m::numeric / 30)::integer END;
  END IF;
  IF w IS NULL THEN
    w := CASE WHEN m IS NOT NULL THEN ceil(m::numeric * 7 / 30)::integer
              ELSE d * 7 END;
  END IF;
  IF m IS NULL THEN
    m := CASE WHEN nullif(greatest(coalesce(p_weekly, 0), 0), 0) IS NOT NULL
              THEN ceil(p_weekly::numeric * 30 / 7)::integer
              ELSE d * 30 END;
  END IF;

  RETURN QUERY SELECT d, w, m;
END $$;

-- Best applicable rate. Exact dynamic programme over whole days; the
-- greatest(0, d - unit) base means a shorter stay is never charged more than
-- simply buying the larger unit that covers it.
CREATE OR REPLACE FUNCTION public.stow_pricing_breakdown(
  p_daily integer, p_weekly integer, p_monthly integer, p_start date, p_end date
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE
  v_days integer;
  r record;
  cost bigint[];
  ch text[];
  i integer;
  best bigint;
  unit text;
  base bigint;
  cm integer := 0; cw integer := 0; cd integer := 0;
  comps jsonb := '[]'::jsonb;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN RETURN NULL; END IF;
  v_days := p_end - p_start;
  IF v_days <= 0 OR v_days > 3660 THEN RETURN NULL; END IF;

  SELECT * INTO r FROM public.stow_effective_rates(p_daily, p_weekly, p_monthly);
  IF r.daily IS NULL THEN RETURN NULL; END IF;

  cost := array_fill(0::bigint, ARRAY[v_days + 1]);   -- cost[k+1] = k days
  ch   := array_fill(''::text,  ARRAY[v_days + 1]);

  FOR i IN 1..v_days LOOP
    best := cost[i] + r.daily; unit := 'day';
    base := cost[greatest(0, i - 7) + 1];
    IF base + r.weekly < best THEN best := base + r.weekly; unit := 'week'; END IF;
    base := cost[greatest(0, i - 30) + 1];
    IF base + r.monthly < best THEN best := base + r.monthly; unit := 'month'; END IF;
    cost[i + 1] := best;
    ch[i + 1] := unit;
  END LOOP;

  i := v_days;
  WHILE i > 0 LOOP
    unit := ch[i + 1];
    IF unit = 'day' THEN cd := cd + 1; i := i - 1;
    ELSIF unit = 'week' THEN cw := cw + 1; i := greatest(0, i - 7);
    ELSE cm := cm + 1; i := greatest(0, i - 30);
    END IF;
  END LOOP;

  IF cm > 0 THEN comps := comps || jsonb_build_object(
    'unit','month','quantity',cm,'unitPricePence',r.monthly,'amountPence',cm * r.monthly); END IF;
  IF cw > 0 THEN comps := comps || jsonb_build_object(
    'unit','week','quantity',cw,'unitPricePence',r.weekly,'amountPence',cw * r.weekly); END IF;
  IF cd > 0 THEN comps := comps || jsonb_build_object(
    'unit','day','quantity',cd,'unitPricePence',r.daily,'amountPence',cd * r.daily); END IF;

  RETURN jsonb_build_object(
    'version', public.stow_pricing_version(),
    'startDate', p_start,
    'endDate', p_end,
    'durationDays', v_days,
    'rates', jsonb_build_object(
      'dailyPencePerDay', r.daily, 'weeklyPence', r.weekly, 'monthlyPence', r.monthly),
    'components', comps,
    'storageAmountPence', cost[v_days + 1]
  );
END $$;

CREATE OR REPLACE FUNCTION public.stow_storage_price_pence(
  p_daily integer, p_weekly integer, p_monthly integer, p_start date, p_end date
) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT (public.stow_pricing_breakdown(p_daily, p_weekly, p_monthly, p_start, p_end)
          ->>'storageAmountPence')::integer
$$;

-- 3. Commercial snapshots on requests and bookings -----------------------
ALTER TABLE public.storage_requests
  ADD COLUMN IF NOT EXISTS daily_rate_snapshot integer,
  ADD COLUMN IF NOT EXISTS weekly_rate_snapshot integer,
  ADD COLUMN IF NOT EXISTS minimum_stay_days_snapshot integer,
  ADD COLUMN IF NOT EXISTS duration_days_snapshot integer,
  ADD COLUMN IF NOT EXISTS pricing_version_snapshot text,
  ADD COLUMN IF NOT EXISTS pricing_breakdown_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS storage_amount_pence integer;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS daily_rate_snapshot integer,
  ADD COLUMN IF NOT EXISTS weekly_rate_snapshot integer,
  ADD COLUMN IF NOT EXISTS minimum_stay_days_snapshot integer,
  ADD COLUMN IF NOT EXISTS duration_days_snapshot integer,
  ADD COLUMN IF NOT EXISTS pricing_version_snapshot text,
  ADD COLUMN IF NOT EXISTS pricing_breakdown_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 4. Availability counts bookings that are under way ---------------------
CREATE OR REPLACE FUNCTION public.space_available_volume_m3(
  p_space_id uuid, p_start date, p_end date, p_exclude_booking uuid DEFAULT NULL::uuid
) RETURNS numeric LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  v_usable numeric; v_confirmed numeric; v_held numeric;
BEGIN
  SELECT COALESCE(estimated_available_volume_m3, total_volume_m3, 0)
    INTO v_usable FROM public.spaces WHERE id = p_space_id;
  IF v_usable IS NULL THEN RETURN 0; END IF;

  -- Confirmed AND active both hold space; a booking has exactly one status so
  -- confirmed → active can never reserve twice. Cancelled and completed
  -- bookings drop out of this set, releasing capacity exactly once.
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
    AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
    AND b.start_date < p_end AND b.end_date > p_start;

  RETURN v_usable - v_confirmed - v_held;
END $$;

-- 5. Request creation prices the actual duration -------------------------
CREATE OR REPLACE FUNCTION public.create_storage_request(
  p_space_id uuid, p_inventory_id uuid, p_start_date date, p_end_date date,
  p_renter_note text DEFAULT NULL::text, p_spacefit jsonb DEFAULT NULL::jsonb
) RETURNS storage_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_renter uuid := auth.uid();
  v_space public.spaces%ROWTYPE;
  v_inventory public.renter_inventories%ROWTYPE;
  v_items jsonb; v_lines integer; v_largest jsonb;
  v_existing public.storage_requests; v_row public.storage_requests;
  v_note text;
  v_days integer; v_min integer; v_price jsonb; v_storage integer;
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

  -- Duration: start inclusive, end exclusive. Calendar dates only.
  v_days := p_end_date - p_start_date;
  v_min := GREATEST(COALESCE(v_space.minimum_stay_days, 1), 1);
  IF v_days < v_min THEN
    RAISE EXCEPTION 'This host asks for a minimum stay of % day(s).', v_min;
  END IF;

  v_price := public.stow_pricing_breakdown(
    v_space.daily_price_pence, v_space.weekly_price_pence,
    v_space.monthly_price_pence, p_start_date, p_end_date);
  v_storage := (v_price->>'storageAmountPence')::integer;

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
      'quantity', i.quantity, 'estimated_volume_m3', i.estimated_total_volume_m3
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
    spacefit_breakdown_snapshot, spacefit_algorithm_snapshot
  ) VALUES (
    v_renter, v_space.host_id, v_space.id, v_inventory.id,
    p_start_date, p_end_date, v_note,
    v_inventory.item_count, v_lines,
    v_inventory.estimated_storage_requirement_m3, v_inventory.estimated_total_item_volume_m3,
    v_largest, v_items,
    v_space.title, v_space.space_type::text, v_space.approximate_area,
    v_space.postcode_district,
    (SELECT round(coalesce(
        nullif(v_space.length_m * v_space.width_m * v_space.height_m, 0)
          * coalesce(v_space.host_available_percentage, 100) / 100.0, 0)::numeric, 3)),
    v_space.accepted_categories, v_space.access_type::text,
    v_space.monthly_price_pence, coalesce(v_space.currency, 'GBP'),
    v_space.daily_price_pence, v_space.weekly_price_pence, v_min,
    v_days, public.stow_pricing_version(), v_price,
    v_storage,
    nullif((p_spacefit->>'score'), '')::integer,
    p_spacefit->>'label', p_spacefit->'breakdown', p_spacefit->>'algorithm'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_row FROM public.storage_requests
     WHERE renter_id = v_renter AND space_id = p_space_id AND status = 'pending' LIMIT 1;
    RETURN v_row;
END $$;

-- 6. Booking carries the request's commercial snapshot -------------------
CREATE OR REPLACE FUNCTION public.create_booking_from_request(p_request_id uuid)
RETURNS bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
    renter_first_name_snapshot, host_accepted_at
  ) VALUES (
    v_request.id, v_request.space_id, v_request.renter_id, v_request.host_id, 'pending_payment',
    v_request.monthly_price_snapshot, COALESCE(v_request.currency_snapshot, 'GBP'),
    v_request.requested_start_date, v_request.requested_end_date,
    v_request.daily_rate_snapshot, v_request.weekly_rate_snapshot,
    v_request.minimum_stay_days_snapshot,
    COALESCE(v_request.duration_days_snapshot,
             v_request.requested_end_date - v_request.requested_start_date),
    v_request.pricing_version_snapshot, v_request.pricing_breakdown_snapshot,
    -- Legacy requests carry no engine price; the fee trigger then falls back
    -- to the monthly snapshot exactly as before.
    v_request.storage_amount_pence,
    v_request.space_title_snapshot, v_request.space_type_snapshot,
    v_request.space_area_snapshot, v_request.space_postcode_district_snapshot,
    v_request.inventory_item_count_snapshot, v_request.estimated_storage_requirement_m3_snapshot,
    COALESCE(v_request.inventory_items_snapshot, '[]'::jsonb),
    v_request.spacefit_score_snapshot, v_request.spacefit_label_snapshot,
    v_request.renter_first_name_snapshot, v_request.responded_at
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING * INTO v_booking;

  IF v_booking.id IS NULL THEN
    SELECT * INTO v_booking FROM public.bookings WHERE request_id = p_request_id;
  END IF;

  RETURN v_booking;
END $$;

-- 7. Lifecycle transitions ----------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_booking(p_booking_id uuid)
RETURNS bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_blocked boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.renter_id <> v_uid AND v_booking.host_id <> v_uid THEN
    RAISE EXCEPTION 'Not your booking' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: a retry returns the same row, never a second transition.
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
    SELECT 1 FROM public.payments
     WHERE booking_id = p_booking_id AND status = 'succeeded'
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

  UPDATE public.bookings
     SET status = 'active'::public.booking_status, activated_at = now()
   WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END $$;

CREATE OR REPLACE FUNCTION public.complete_booking(p_booking_id uuid)
RETURNS bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
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
  IF v_booking.end_date > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'You can finish this booking from its end date onwards';
  END IF;

  UPDATE public.bookings
     SET status = 'completed'::public.booking_status, completed_at = now()
   WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END $$;

-- 8. Extension / change request foundation (no charging) -----------------
DO $$ BEGIN
  CREATE TYPE public.booking_change_status AS ENUM (
    'pending', 'accepted_awaiting_payment', 'declined', 'withdrawn', 'applied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.booking_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  renter_id uuid NOT NULL,
  host_id uuid NOT NULL,
  space_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  requested_by_role text NOT NULL,
  kind text NOT NULL DEFAULT 'extension',
  status public.booking_change_status NOT NULL DEFAULT 'pending',
  original_start_date date NOT NULL,
  original_end_date date NOT NULL,
  proposed_start_date date NOT NULL,
  proposed_end_date date NOT NULL,
  additional_days integer NOT NULL,
  pricing_version text NOT NULL,
  pricing_breakdown jsonb,
  additional_storage_amount_pence integer NOT NULL,
  additional_service_fee_pence integer NOT NULL,
  additional_total_pence integer NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  renter_note text,
  host_response_note text,
  responded_at timestamptz,
  responded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_change_requests_one_open
  ON public.booking_change_requests (booking_id)
  WHERE status IN ('pending', 'accepted_awaiting_payment');

CREATE INDEX IF NOT EXISTS booking_change_requests_booking_idx
  ON public.booking_change_requests (booking_id);

GRANT SELECT ON public.booking_change_requests TO authenticated;
GRANT ALL ON public.booking_change_requests TO service_role;

ALTER TABLE public.booking_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read their change requests"
  ON public.booking_change_requests;
CREATE POLICY "Participants read their change requests"
  ON public.booking_change_requests FOR SELECT TO authenticated
  USING (renter_id = auth.uid() OR host_id = auth.uid());

DROP TRIGGER IF EXISTS booking_change_requests_updated_at ON public.booking_change_requests;
CREATE TRIGGER booking_change_requests_updated_at
  BEFORE UPDATE ON public.booking_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.request_booking_extension(
  p_booking_id uuid, p_new_end_date date, p_note text DEFAULT NULL
) RETURNS booking_change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_row public.booking_change_requests;
  v_days integer; v_price jsonb; v_storage integer; v_fee integer;
  v_available numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.renter_id <> v_uid THEN
    RAISE EXCEPTION 'Only the renter can ask to change this booking' USING ERRCODE = '42501';
  END IF;
  IF v_booking.status NOT IN ('confirmed', 'active') THEN
    RAISE EXCEPTION 'Only a confirmed booking can be extended';
  END IF;
  IF p_new_end_date IS NULL OR p_new_end_date <= v_booking.end_date THEN
    RAISE EXCEPTION 'Choose a new end date after the current one';
  END IF;

  -- Idempotent: one open change request per booking.
  SELECT * INTO v_row FROM public.booking_change_requests
   WHERE booking_id = p_booking_id
     AND status IN ('pending', 'accepted_awaiting_payment')
   LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;

  v_days := p_new_end_date - v_booking.end_date;

  -- Capacity for the EXTRA window only; the original window is already held.
  v_available := public.space_available_volume_m3(
    v_booking.space_id, v_booking.end_date, p_new_end_date, v_booking.id);
  IF v_available < v_booking.estimated_storage_requirement_m3_snapshot THEN
    RAISE EXCEPTION 'This space isn''t available for the extra dates you asked for';
  END IF;

  -- Same engine, same snapshotted rates: a later host price edit cannot
  -- change what this extension costs.
  v_price := public.stow_pricing_breakdown(
    v_booking.daily_rate_snapshot, v_booking.weekly_rate_snapshot,
    v_booking.monthly_price_snapshot, v_booking.end_date, p_new_end_date);
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'We couldn''t price that extension';
  END IF;
  v_storage := (v_price->>'storageAmountPence')::integer;
  v_fee := public.stow_service_fee_pence(
    v_storage, COALESCE(v_booking.service_fee_rate_bps, 1200),
    COALESCE(v_booking.service_fee_minimum_pence, 500));

  INSERT INTO public.booking_change_requests (
    booking_id, renter_id, host_id, space_id, requested_by, requested_by_role,
    kind, status, original_start_date, original_end_date,
    proposed_start_date, proposed_end_date, additional_days,
    pricing_version, pricing_breakdown,
    additional_storage_amount_pence, additional_service_fee_pence, additional_total_pence,
    currency, renter_note
  ) VALUES (
    v_booking.id, v_booking.renter_id, v_booking.host_id, v_booking.space_id, v_uid, 'renter',
    'extension', 'pending', v_booking.start_date, v_booking.end_date,
    v_booking.start_date, p_new_end_date, v_days,
    COALESCE(v_booking.pricing_version_snapshot, public.stow_pricing_version()), v_price,
    v_storage, v_fee, v_storage + v_fee,
    UPPER(COALESCE(v_booking.currency, 'GBP')), nullif(btrim(coalesce(p_note, '')), '')
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.respond_to_booking_extension(
  p_change_id uuid, p_accept boolean, p_note text DEFAULT NULL
) RETURNS booking_change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.booking_change_requests;
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

  UPDATE public.booking_change_requests
     SET status = CASE WHEN p_accept
                       THEN 'accepted_awaiting_payment'::public.booking_change_status
                       ELSE 'declined'::public.booking_change_status END,
         host_response_note = nullif(btrim(coalesce(p_note, '')), ''),
         responded_at = now(),
         responded_by = v_uid
   WHERE id = p_change_id
  RETURNING * INTO v_row;

  -- NOTE: the booking's dates are deliberately NOT changed. An extension only
  -- takes effect once its additional payment exists, which is a later prompt.
  RETURN v_row;
END $$;