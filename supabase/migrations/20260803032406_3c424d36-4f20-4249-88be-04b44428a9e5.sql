-- 1. Booking status enum
CREATE TYPE public.booking_status AS ENUM ('pending_payment', 'confirmed', 'cancelled', 'completed');

-- 2. Accepted-request booking window
ALTER TABLE public.storage_requests
  ADD COLUMN booking_action_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.storage_requests_set_booking_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    NEW.booking_action_expires_at := COALESCE(NEW.responded_at, now()) + interval '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER storage_requests_booking_window
BEFORE INSERT OR UPDATE ON public.storage_requests
FOR EACH ROW EXECUTE FUNCTION public.storage_requests_set_booking_window();

-- Backfill: keep already-accepted requests actionable for 24h from now.
UPDATE public.storage_requests
SET booking_action_expires_at = now() + interval '24 hours'
WHERE status = 'accepted' AND booking_action_expires_at IS NULL;

-- 3. Bookings
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.storage_requests(id) ON DELETE RESTRICT,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE RESTRICT,
  renter_id uuid NOT NULL,
  host_id uuid NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'pending_payment',

  -- Commercial snapshot, copied from the request at creation time.
  monthly_price_snapshot integer,
  currency_snapshot text NOT NULL DEFAULT 'GBP',
  start_date date NOT NULL,
  end_date date NOT NULL,

  space_title_snapshot text,
  space_type_snapshot text,
  space_area_snapshot text,
  space_postcode_district_snapshot text,

  inventory_item_count_snapshot integer NOT NULL DEFAULT 0,
  estimated_storage_requirement_m3_snapshot numeric NOT NULL DEFAULT 0,
  inventory_items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,

  spacefit_score_snapshot integer,
  spacefit_label_snapshot text,

  renter_first_name_snapshot text,
  host_accepted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bookings_renter_idx ON public.bookings(renter_id, created_at DESC);
CREATE INDEX bookings_host_idx ON public.bookings(host_id, created_at DESC);

GRANT SELECT ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Renters read their own bookings"
ON public.bookings FOR SELECT TO authenticated
USING (renter_id = auth.uid());

CREATE POLICY "Hosts read bookings for their spaces"
ON public.bookings FOR SELECT TO authenticated
USING (host_id = auth.uid());

CREATE TRIGGER bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Server-controlled creation
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_request
  FROM public.storage_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.renter_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only continue your own request';
  END IF;

  -- Idempotency: an existing booking is returned unchanged.
  SELECT * INTO v_booking FROM public.bookings WHERE request_id = p_request_id;
  IF v_booking.id IS NOT NULL THEN
    RETURN v_booking;
  END IF;

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
    space_title_snapshot, space_type_snapshot, space_area_snapshot, space_postcode_district_snapshot,
    inventory_item_count_snapshot, estimated_storage_requirement_m3_snapshot, inventory_items_snapshot,
    spacefit_score_snapshot, spacefit_label_snapshot,
    renter_first_name_snapshot, host_accepted_at
  ) VALUES (
    v_request.id, v_request.space_id, v_request.renter_id, v_request.host_id, 'pending_payment',
    v_request.monthly_price_snapshot, COALESCE(v_request.currency_snapshot, 'GBP'),
    v_request.requested_start_date, v_request.requested_end_date,
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
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_from_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_booking_from_request(uuid) TO authenticated;