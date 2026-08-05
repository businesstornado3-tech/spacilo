-- 1. Conversations may now exist before a booking (space enquiries).
ALTER TABLE public.conversations ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN booking_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_space_enquiry_unique
  ON public.conversations (space_id, renter_id)
  WHERE booking_id IS NULL;

DROP POLICY IF EXISTS "Participants send messages" ON public.messages;
CREATE POLICY "Participants send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = messages.conversation_id
         AND c.booking_id IS NOT DISTINCT FROM messages.booking_id
         AND (auth.uid() = c.renter_id OR auth.uid() = c.host_id)
    )
  );

-- 2. Renter-initiated enquiry thread for a published space.
CREATE OR REPLACE FUNCTION public.get_or_create_space_conversation(p_space_id uuid)
RETURNS public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_host uuid;
  v_row public.conversations;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT s.host_id INTO v_host
    FROM public.spaces s
   WHERE s.id = p_space_id AND s.listing_status = 'published';
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'This space is not available' USING ERRCODE = 'P0002';
  END IF;
  IF v_host = v_uid THEN
    RAISE EXCEPTION 'You cannot message your own space' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
    FROM public.conversations
   WHERE space_id = p_space_id AND renter_id = v_uid AND booking_id IS NULL;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO public.conversations (booking_id, space_id, renter_id, host_id)
  VALUES (NULL, p_space_id, v_uid, v_host)
  RETURNING * INTO v_row;

  RETURN v_row;
END $function$;

GRANT EXECUTE ON FUNCTION public.get_or_create_space_conversation(uuid) TO authenticated;

-- 3. Deterministic host responsiveness, exposed on the public listing.
CREATE OR REPLACE FUNCTION public.get_host_response_stats(p_host_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH recent AS (
    SELECT r.created_at, r.responded_at
      FROM public.storage_requests r
     WHERE r.host_id = p_host_id
       AND r.created_at >= now() - interval '90 days'
       AND (r.responded_at IS NOT NULL OR r.status IN ('expired', 'pending'))
       AND (r.responded_at IS NOT NULL OR r.created_at <= now() - interval '48 hours')
  )
  SELECT jsonb_build_object(
    'sample_size', (SELECT count(*) FROM recent),
    'responded_count', (SELECT count(*) FROM recent WHERE responded_at IS NOT NULL),
    'median_response_hours', (
      SELECT round(
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(epoch FROM (responded_at - created_at)) / 3600.0
        )::numeric, 1)
      FROM recent WHERE responded_at IS NOT NULL
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_host_response_stats(uuid) TO anon, authenticated, service_role;

-- 4. Public listing gains factual responsiveness + history columns.
DROP FUNCTION IF EXISTS public.get_published_space(uuid);
CREATE FUNCTION public.get_published_space(space_id uuid)
RETURNS TABLE(
  id uuid, title text, space_type space_type, description text,
  storage_mode storage_mode, host_available_percentage integer,
  length_m numeric, width_m numeric, height_m numeric,
  floor_area_m2 numeric, total_volume_m3 numeric, estimated_available_volume_m3 numeric,
  postcode_district text, approximate_area text,
  monthly_price_pence integer, daily_price_pence integer, weekly_price_pence integer,
  minimum_stay_days integer, currency text, minimum_storage_period_months integer,
  availability_mode text, available_from date, available_until date,
  access_type space_access_type, access_notes text, access_frequency space_access_frequency,
  ground_floor_access boolean, stairs_required boolean, lift_available tri_state,
  vehicle_access_close boolean, door_width_cm numeric, door_height_cm numeric,
  features text[], accepted_categories text[], host_restrictions text[], restriction_notes text,
  temperature_condition temperature_condition, moisture_condition moisture_condition,
  photo_paths text[], published_at timestamp with time zone,
  host_display_name text, host_phone_verified boolean,
  measurement_source text, measurements_verified_at timestamp with time zone,
  host_response_stats jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.title, s.space_type, s.description,
         s.storage_mode, s.host_available_percentage,
         s.length_m, s.width_m, s.height_m,
         s.floor_area_m2, s.total_volume_m3, s.estimated_available_volume_m3,
         s.postcode_district, s.approximate_area,
         s.monthly_price_pence, s.daily_price_pence, s.weekly_price_pence, s.minimum_stay_days,
         s.currency, s.minimum_storage_period_months,
         s.availability_mode::text, s.available_from, s.available_until,
         s.access_type, s.access_notes, s.access_frequency,
         s.ground_floor_access, s.stairs_required, s.lift_available,
         s.vehicle_access_close, s.door_width_cm, s.door_height_cm,
         s.features, s.accepted_categories, s.host_restrictions, s.restriction_notes,
         s.temperature_condition, s.moisture_condition,
         COALESCE((SELECT array_agg(p.storage_path ORDER BY p.is_cover DESC, p.display_order ASC)
                   FROM public.space_photos p WHERE p.space_id = s.id), '{}'),
         s.published_at,
         COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.first_name), ''), 'Host'),
         COALESCE(pr.phone_verified, false),
         s.measurement_source::text,
         s.measurements_verified_at,
         public.get_host_response_stats(s.host_id)
  FROM public.spaces s
  LEFT JOIN public.profiles pr ON pr.id = s.host_id
  WHERE s.id = space_id AND s.listing_status = 'published';
$function$;

GRANT EXECUTE ON FUNCTION public.get_published_space(uuid) TO anon, authenticated, service_role;