-- ============================================================ spaces: obstacles + measurement provenance

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS obstacles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS obstacle_volume_m3 numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS measurement_source text NOT NULL DEFAULT 'host_entered',
  ADD COLUMN IF NOT EXISTS measurements_verified_at timestamptz;

ALTER TABLE public.spaces
  DROP CONSTRAINT IF EXISTS spaces_measurement_source_check;
ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_measurement_source_check
  CHECK (measurement_source IN ('ai_estimated', 'host_entered', 'host_verified'));

ALTER TABLE public.spaces
  DROP CONSTRAINT IF EXISTS spaces_obstacles_is_array;
ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_obstacles_is_array
  CHECK (jsonb_typeof(obstacles) = 'array' AND jsonb_array_length(obstacles) <= 20);

ALTER TABLE public.spaces
  DROP CONSTRAINT IF EXISTS spaces_obstacle_volume_range;
ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_obstacle_volume_range
  CHECK (obstacle_volume_m3 >= 0 AND obstacle_volume_m3 <= 10000);

COMMENT ON COLUMN public.spaces.obstacles IS
  'Host-CONFIRMED capacity reducers: [{key,label,volume_m3}]. AI-proposed obstacles live in space_measurement_proposals until the host applies them.';
COMMENT ON COLUMN public.spaces.measurement_source IS
  'Provenance of length/width/height. AI estimates are never written here directly; only an explicit host action can set host_verified.';

-- Usable capacity now = gross x availability share - host-confirmed obstacles.
CREATE OR REPLACE FUNCTION public.spaces_derive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obstacles numeric := 0;
BEGIN
  NEW.updated_at := now();

  -- Sum host-confirmed obstacle volumes; ignore malformed entries rather than failing.
  SELECT COALESCE(sum(GREATEST(COALESCE((o->>'volume_m3')::numeric, 0), 0)), 0)
    INTO v_obstacles
    FROM jsonb_array_elements(COALESCE(NEW.obstacles, '[]'::jsonb)) AS o
   WHERE jsonb_typeof(o) = 'object';
  NEW.obstacle_volume_m3 := round(LEAST(GREATEST(v_obstacles, 0), 10000), 2);

  IF NEW.dimensions_unknown THEN
    NEW.floor_area_m2 := NULL;
    NEW.total_volume_m3 := NULL;
    NEW.estimated_available_volume_m3 := NULL;
  ELSE
    IF NEW.length_m IS NOT NULL AND NEW.width_m IS NOT NULL THEN
      NEW.floor_area_m2 := round(NEW.length_m * NEW.width_m, 2);
    ELSE
      NEW.floor_area_m2 := NULL;
    END IF;

    IF NEW.floor_area_m2 IS NOT NULL AND NEW.height_m IS NOT NULL THEN
      NEW.total_volume_m3 := round(NEW.floor_area_m2 * NEW.height_m, 2);
    ELSE
      NEW.total_volume_m3 := NULL;
    END IF;

    IF NEW.total_volume_m3 IS NOT NULL THEN
      NEW.estimated_available_volume_m3 := GREATEST(round(
        NEW.total_volume_m3 * (COALESCE(
          CASE WHEN NEW.storage_mode = 'partial' THEN NEW.host_available_percentage ELSE 100 END, 100
        )::numeric / 100), 2) - NEW.obstacle_volume_m3, 0);
    ELSE
      NEW.estimated_available_volume_m3 := NULL;
    END IF;
  END IF;

  -- Changing a measurement revokes a previous host verification.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.length_m IS DISTINCT FROM OLD.length_m
       OR NEW.width_m IS DISTINCT FROM OLD.width_m
       OR NEW.height_m IS DISTINCT FROM OLD.height_m
       OR NEW.dimensions_unknown IS DISTINCT FROM OLD.dimensions_unknown THEN
      IF NEW.measurement_source = OLD.measurement_source
         AND NEW.measurements_verified_at IS NOT DISTINCT FROM OLD.measurements_verified_at THEN
        NEW.measurement_source := 'host_entered';
        NEW.measurements_verified_at := NULL;
      END IF;
    END IF;
  END IF;

  IF NEW.measurement_source <> 'host_verified' THEN
    NEW.measurements_verified_at := NULL;
  ELSIF NEW.measurements_verified_at IS NULL THEN
    NEW.measurements_verified_at := now();
  END IF;

  -- derive the public postcode district from the private postcode
  IF NEW.postcode IS NOT NULL AND length(regexp_replace(NEW.postcode, '\s', '', 'g')) >= 5 THEN
    NEW.postcode_district := upper(substring(regexp_replace(NEW.postcode, '\s', '', 'g')
      from 1 for length(regexp_replace(NEW.postcode, '\s', '', 'g')) - 3));
  END IF;

  IF NEW.listing_status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================ host space scan sessions

CREATE TABLE IF NOT EXISTS public.space_scan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.analysis_run_status NOT NULL DEFAULT 'queued',
  provider text,
  model text,
  prompt_version text,
  schema_version text,
  photo_count integer NOT NULL DEFAULT 0 CHECK (photo_count >= 0 AND photo_count <= 20),
  client_request_id uuid,
  error_category text CHECK (error_category IS NULL OR char_length(error_category) <= 40),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS space_scan_sessions_client_request_key
  ON public.space_scan_sessions (host_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS space_scan_sessions_space_idx
  ON public.space_scan_sessions (space_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_scan_sessions TO authenticated;
GRANT ALL ON public.space_scan_sessions TO service_role;
ALTER TABLE public.space_scan_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts manage their own space scans"
  ON public.space_scan_sessions FOR ALL TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- ============================================================ host space scan photos

CREATE TABLE IF NOT EXISTS public.space_scan_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.space_scan_sessions(id) ON DELETE SET NULL,
  storage_path text NOT NULL CHECK (char_length(storage_path) BETWEEN 1 AND 400),
  analysis_status public.inventory_photo_status NOT NULL DEFAULT 'uploaded',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS space_scan_photos_space_idx
  ON public.space_scan_photos (space_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_scan_photos TO authenticated;
GRANT ALL ON public.space_scan_photos TO service_role;
ALTER TABLE public.space_scan_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts manage their own space scan photos"
  ON public.space_scan_photos FOR ALL TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- ============================================================ AI measurement proposals

CREATE TABLE IF NOT EXISTS public.space_measurement_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.space_scan_sessions(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  width_m numeric(6,2) CHECK (width_m IS NULL OR (width_m > 0 AND width_m <= 100)),
  depth_m numeric(6,2) CHECK (depth_m IS NULL OR (depth_m > 0 AND depth_m <= 100)),
  usable_height_m numeric(6,2) CHECK (usable_height_m IS NULL OR (usable_height_m > 0 AND usable_height_m <= 20)),
  floor_area_m2 numeric(10,2) CHECK (floor_area_m2 IS NULL OR (floor_area_m2 >= 0 AND floor_area_m2 <= 10000)),
  gross_volume_m3 numeric(10,2) CHECK (gross_volume_m3 IS NULL OR (gross_volume_m3 >= 0 AND gross_volume_m3 <= 100000)),
  usable_volume_m3 numeric(10,2) CHECK (usable_volume_m3 IS NULL OR (usable_volume_m3 >= 0 AND usable_volume_m3 <= 100000)),
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
  proposed_obstacles jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(proposed_obstacles) = 'array' AND jsonb_array_length(proposed_obstacles) <= 20),
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(limitations) = 'array' AND jsonb_array_length(limitations) <= 20),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 600),
  verification_state text NOT NULL DEFAULT 'proposed'
    CHECK (verification_state IN ('proposed', 'applied', 'dismissed')),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS space_measurement_proposals_space_idx
  ON public.space_measurement_proposals (space_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_measurement_proposals TO authenticated;
GRANT ALL ON public.space_measurement_proposals TO service_role;
ALTER TABLE public.space_measurement_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts manage their own measurement proposals"
  ON public.space_measurement_proposals FOR ALL TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- ============================================================ packing plan snapshots

ALTER TABLE public.storage_requests
  ADD COLUMN IF NOT EXISTS spacefit_plan_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS spacefit_space_dimensions_snapshot jsonb;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS spacefit_breakdown_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS spacefit_algorithm_snapshot text,
  ADD COLUMN IF NOT EXISTS spacefit_plan_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS spacefit_space_dimensions_snapshot jsonb;

COMMENT ON COLUMN public.bookings.spacefit_plan_snapshot IS
  'Frozen SpaceFit Pack arrangement agreed at booking time. Never recomputed from live listing or inventory data.';

-- Persist the plan alongside the existing SpaceFit snapshot on the request.
CREATE OR REPLACE FUNCTION public.create_storage_request(
  p_space_id uuid,
  p_inventory_id uuid,
  p_start_date date,
  p_end_date date,
  p_renter_note text DEFAULT NULL::text,
  p_spacefit jsonb DEFAULT NULL::jsonb
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
      'quantity', i.quantity, 'estimated_volume_m3', i.estimated_total_volume_m3,
      'length_cm', i.length_cm, 'width_cm', i.width_cm, 'height_cm', i.height_cm,
      'stackable', i.stackable, 'fragile', i.fragile
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
    spacefit_breakdown_snapshot, spacefit_algorithm_snapshot,
    spacefit_plan_snapshot, spacefit_space_dimensions_snapshot
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
    -- Server-side truth for the geometry the plan was based on; never client supplied.
    jsonb_build_object(
      'length_m', v_space.length_m, 'width_m', v_space.width_m, 'height_m', v_space.height_m,
      'floor_area_m2', v_space.floor_area_m2, 'total_volume_m3', v_space.total_volume_m3,
      'estimated_available_volume_m3', v_space.estimated_available_volume_m3,
      'door_width_cm', v_space.door_width_cm, 'door_height_cm', v_space.door_height_cm,
      'obstacles', v_space.obstacles, 'obstacle_volume_m3', v_space.obstacle_volume_m3,
      'measurement_source', v_space.measurement_source
    )
  )
  RETURNING * INTO v_row;

  RETURN v_row;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_row FROM public.storage_requests
     WHERE renter_id = v_renter AND space_id = p_space_id AND status = 'pending' LIMIT 1;
    RETURN v_row;
END
$$;

-- Carry the frozen SpaceFit plan through to the booking.
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
    v_request.storage_amount_pence,
    v_request.space_title_snapshot, v_request.space_type_snapshot,
    v_request.space_area_snapshot, v_request.space_postcode_district_snapshot,
    v_request.inventory_item_count_snapshot, v_request.estimated_storage_requirement_m3_snapshot,
    COALESCE(v_request.inventory_items_snapshot, '[]'::jsonb),
    v_request.spacefit_score_snapshot, v_request.spacefit_label_snapshot,
    v_request.spacefit_breakdown_snapshot, v_request.spacefit_algorithm_snapshot,
    v_request.spacefit_plan_snapshot, v_request.spacefit_space_dimensions_snapshot,
    v_request.renter_first_name_snapshot, v_request.responded_at
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING * INTO v_booking;

  IF v_booking.id IS NULL THEN
    SELECT * INTO v_booking FROM public.bookings WHERE request_id = p_request_id;
  END IF;

  RETURN v_booking;
END
$$;

REVOKE EXECUTE ON FUNCTION public.create_storage_request(uuid, uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_storage_request(uuid, uuid, date, date, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking_from_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking_from_request(uuid) TO authenticated;