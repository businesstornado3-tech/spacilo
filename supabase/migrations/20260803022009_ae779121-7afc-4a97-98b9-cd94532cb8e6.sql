-- Storage request status (future states allowed by the type, unused in V1 UI)
CREATE TYPE public.storage_request_status AS ENUM (
  'pending','withdrawn','expired','accepted','declined','reserved',
  'confirmed','active','completed','cancelled','disputed'
);

CREATE TABLE public.storage_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  renter_id uuid NOT NULL,
  host_id uuid NOT NULL,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.renter_inventories(id) ON DELETE RESTRICT,
  status public.storage_request_status NOT NULL DEFAULT 'pending',
  requested_start_date date NOT NULL,
  requested_end_date date NOT NULL,
  renter_note text,
  -- inventory snapshot
  inventory_item_count_snapshot integer NOT NULL,
  inventory_line_count_snapshot integer NOT NULL,
  estimated_storage_requirement_m3_snapshot numeric(10,3) NOT NULL,
  estimated_item_volume_m3_snapshot numeric(10,3) NOT NULL,
  largest_item_snapshot jsonb,
  inventory_items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- space snapshot (never contains the host's exact address or coordinates)
  space_title_snapshot text,
  space_type_snapshot text,
  space_area_snapshot text,
  space_postcode_district_snapshot text,
  space_available_capacity_m3_snapshot numeric(10,3),
  space_accepted_categories_snapshot text[],
  space_access_summary_snapshot text,
  monthly_price_snapshot integer,
  currency_snapshot text NOT NULL DEFAULT 'GBP',
  -- spacefit snapshot (spacefit-v1, as shown to the renter at request time)
  spacefit_score_snapshot integer,
  spacefit_label_snapshot text,
  spacefit_breakdown_snapshot jsonb,
  spacefit_algorithm_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  withdrawn_at timestamptz,
  CONSTRAINT storage_requests_dates_valid CHECK (requested_end_date > requested_start_date),
  CONSTRAINT storage_requests_note_length CHECK (renter_note IS NULL OR char_length(renter_note) <= 500),
  CONSTRAINT storage_requests_not_self CHECK (renter_id <> host_id)
);

-- One pending request per renter per space: blocks duplicate/double-click rows.
CREATE UNIQUE INDEX storage_requests_one_pending_per_space
  ON public.storage_requests (renter_id, space_id)
  WHERE status = 'pending';

CREATE INDEX storage_requests_renter_idx ON public.storage_requests (renter_id, created_at DESC);
CREATE INDEX storage_requests_host_idx ON public.storage_requests (host_id, created_at DESC);
CREATE INDEX storage_requests_space_idx ON public.storage_requests (space_id);

GRANT SELECT, UPDATE ON public.storage_requests TO authenticated;
GRANT ALL ON public.storage_requests TO service_role;

ALTER TABLE public.storage_requests ENABLE ROW LEVEL SECURITY;

-- Renters read their own requests.
CREATE POLICY "Renters read own storage requests"
  ON public.storage_requests FOR SELECT TO authenticated
  USING (auth.uid() = renter_id);

-- Hosts read requests made for spaces they own (read-only in Prompt 9).
CREATE POLICY "Hosts read requests for their spaces"
  ON public.storage_requests FOR SELECT TO authenticated
  USING (auth.uid() = host_id);

-- Renters may only transition their own pending request to withdrawn.
CREATE POLICY "Renters withdraw own pending requests"
  ON public.storage_requests FOR UPDATE TO authenticated
  USING (auth.uid() = renter_id AND status = 'pending')
  WITH CHECK (auth.uid() = renter_id AND status = 'withdrawn');

-- No INSERT or DELETE policy: rows are created only by the secure routine below.

-- Immutability guard: snapshots, ownership and dates can never be edited.
CREATE OR REPLACE FUNCTION public.storage_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.renter_id <> OLD.renter_id
     OR NEW.host_id <> OLD.host_id
     OR NEW.space_id <> OLD.space_id
     OR NEW.inventory_id <> OLD.inventory_id
     OR NEW.requested_start_date <> OLD.requested_start_date
     OR NEW.requested_end_date <> OLD.requested_end_date
     OR NEW.inventory_item_count_snapshot <> OLD.inventory_item_count_snapshot
     OR NEW.estimated_storage_requirement_m3_snapshot <> OLD.estimated_storage_requirement_m3_snapshot
     OR NEW.inventory_items_snapshot IS DISTINCT FROM OLD.inventory_items_snapshot
     OR NEW.largest_item_snapshot IS DISTINCT FROM OLD.largest_item_snapshot
     OR NEW.monthly_price_snapshot IS DISTINCT FROM OLD.monthly_price_snapshot
     OR NEW.space_available_capacity_m3_snapshot IS DISTINCT FROM OLD.space_available_capacity_m3_snapshot
     OR NEW.spacefit_score_snapshot IS DISTINCT FROM OLD.spacefit_score_snapshot
     OR NEW.spacefit_label_snapshot IS DISTINCT FROM OLD.spacefit_label_snapshot
     OR NEW.spacefit_breakdown_snapshot IS DISTINCT FROM OLD.spacefit_breakdown_snapshot
     OR NEW.renter_note IS DISTINCT FROM OLD.renter_note
     OR NEW.created_at <> OLD.created_at
  THEN
    RAISE EXCEPTION 'Storage request snapshots are immutable';
  END IF;

  NEW.updated_at := now();
  IF NEW.status = 'withdrawn' AND OLD.status <> 'withdrawn' THEN
    NEW.withdrawn_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER storage_requests_guard_update
  BEFORE UPDATE ON public.storage_requests
  FOR EACH ROW EXECUTE FUNCTION public.storage_requests_guard();

-- Marks stale pending requests as expired. Called opportunistically on read.
CREATE OR REPLACE FUNCTION public.expire_stale_storage_requests()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.storage_requests
       SET status = 'expired', updated_at = now()
     WHERE status = 'pending' AND expires_at <= now()
    RETURNING 1
  )
  SELECT count(*)::int FROM updated;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_storage_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_storage_requests() TO authenticated, service_role;

-- Secure creation path. Derives renter from auth, host/price/capacity from the
-- space row, and inventory totals from the renter's own inventory.
CREATE OR REPLACE FUNCTION public.create_storage_request(
  p_space_id uuid,
  p_inventory_id uuid,
  p_start_date date,
  p_end_date date,
  p_renter_note text DEFAULT NULL,
  p_spacefit jsonb DEFAULT NULL
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
  v_items jsonb;
  v_lines integer;
  v_largest jsonb;
  v_existing public.storage_requests;
  v_row public.storage_requests;
  v_note text;
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

  v_note := nullif(btrim(coalesce(p_renter_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Your note is too long. Please keep it under 500 characters.';
  END IF;

  -- Return the existing pending request rather than creating a duplicate.
  SELECT * INTO v_existing
    FROM public.storage_requests
   WHERE renter_id = v_renter AND space_id = p_space_id AND status = 'pending'
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.expires_at > now() THEN
      RETURN v_existing;
    END IF;
    UPDATE public.storage_requests SET status = 'expired', updated_at = now()
     WHERE id = v_existing.id;
  END IF;

  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'catalogue_key', i.catalogue_key,
      'label', i.item_name,
      'category', i.category,
      'quantity', i.quantity,
      'estimated_volume_m3', i.estimated_total_volume_m3
    ) ORDER BY i.item_name), '[]'::jsonb),
    count(*)
  INTO v_items, v_lines
  FROM public.inventory_items i
  WHERE i.inventory_id = p_inventory_id AND i.user_id = v_renter;

  IF v_lines = 0 THEN
    RAISE EXCEPTION 'Add at least one item to My Stuff before sending a request.';
  END IF;

  SELECT jsonb_build_object(
      'label', i.item_name,
      'length_cm', i.length_cm,
      'width_cm', i.width_cm,
      'height_cm', i.height_cm,
      'longest_edge_cm', greatest(i.length_cm, i.width_cm, i.height_cm)
    )
    INTO v_largest
    FROM public.inventory_items i
   WHERE i.inventory_id = p_inventory_id
     AND i.user_id = v_renter
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
    nullif((p_spacefit->>'score'), '')::integer,
    p_spacefit->>'label',
    p_spacefit->'breakdown',
    p_spacefit->>'algorithm'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_row FROM public.storage_requests
     WHERE renter_id = v_renter AND space_id = p_space_id AND status = 'pending' LIMIT 1;
    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_storage_request(uuid, uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_storage_request(uuid, uuid, date, date, text, jsonb) TO authenticated;