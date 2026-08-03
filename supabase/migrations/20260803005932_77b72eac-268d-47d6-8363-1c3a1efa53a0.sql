-- 1. Private geocoding metadata + privacy-safe approximate coordinates
ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocode_error text,
  ADD COLUMN IF NOT EXISTS geocode_source text,
  ADD COLUMN IF NOT EXISTS approx_latitude numeric,
  ADD COLUMN IF NOT EXISTS approx_longitude numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spaces_geocode_status_check') THEN
    ALTER TABLE public.spaces
      ADD CONSTRAINT spaces_geocode_status_check
      CHECK (geocode_status IN ('pending','ok','failed','skipped'));
  END IF;
END $$;

-- 2. Deterministic, privacy-preserving approximate coordinates.
--    Offset 200-500m in a stable direction derived from the space id, then
--    rounded to 4dp. Exact coordinates never leave the server.
CREATE OR REPLACE FUNCTION public.spaces_derive_approx_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  h bigint;
  angle numeric;
  dist_deg numeric;
BEGIN
  -- Address changed on an existing row: the stored fix is no longer trusted.
  IF TG_OP = 'UPDATE' AND (
       COALESCE(NEW.address_line1,'') IS DISTINCT FROM COALESCE(OLD.address_line1,'')
    OR COALESCE(NEW.town,'')          IS DISTINCT FROM COALESCE(OLD.town,'')
    OR COALESCE(NEW.postcode,'')      IS DISTINCT FROM COALESCE(OLD.postcode,'')
  ) AND NEW.latitude IS NOT DISTINCT FROM OLD.latitude
    AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude
  THEN
    NEW.geocode_status := 'pending';
  END IF;

  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.approx_latitude := NULL;
    NEW.approx_longitude := NULL;
    RETURN NEW;
  END IF;

  h := ('x' || substr(md5(NEW.id::text), 1, 8))::bit(32)::bigint;
  angle := ((h % 3600)::numeric / 3600) * 2 * pi();
  dist_deg := 0.0018 + (((h / 3600) % 1000)::numeric / 1000) * 0.0027;

  NEW.approx_latitude := round(NEW.latitude + dist_deg * cos(angle), 4);
  NEW.approx_longitude := round(
    NEW.longitude + dist_deg * sin(angle) / GREATEST(cos(radians(NEW.latitude)), 0.1), 4);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS spaces_derive_approx_location_trg ON public.spaces;
CREATE TRIGGER spaces_derive_approx_location_trg
BEFORE INSERT OR UPDATE ON public.spaces
FOR EACH ROW EXECUTE FUNCTION public.spaces_derive_approx_location();

-- Backfill approximate coordinates for rows that already have a fix.
UPDATE public.spaces SET updated_at = updated_at WHERE latitude IS NOT NULL;
UPDATE public.spaces SET geocode_status = 'ok', geocoded_at = COALESCE(geocoded_at, now())
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geocode_status = 'pending';

-- 3. Deterministic great-circle distance in miles (Haversine).
CREATE OR REPLACE FUNCTION public.haversine_miles(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT round((3958.7613 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
    * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::numeric, 3);
$function$;

-- 4. Public listing feed must not expose exact host coordinates.
DROP FUNCTION IF EXISTS public.get_published_spaces(integer);
CREATE FUNCTION public.get_published_spaces(limit_count integer DEFAULT 60)
RETURNS TABLE(id uuid, title text, space_type space_type, description text, storage_mode storage_mode, host_available_percentage integer, floor_area_m2 numeric, total_volume_m3 numeric, estimated_available_volume_m3 numeric, postcode_district text, approximate_area text, approx_latitude numeric, approx_longitude numeric, monthly_price_pence integer, currency text, minimum_storage_period_months integer, access_type space_access_type, access_frequency space_access_frequency, features text[], accepted_categories text[], cover_path text, published_at timestamp with time zone, host_display_name text, host_phone_verified boolean, host_restrictions text[], restriction_notes text, door_width_cm numeric, door_height_cm numeric, moisture_condition moisture_condition, temperature_condition temperature_condition, ground_floor_access boolean, stairs_required boolean, lift_available tri_state, vehicle_access_close boolean, photo_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT s.id, s.title, s.space_type, s.description,
         s.storage_mode, s.host_available_percentage,
         s.floor_area_m2, s.total_volume_m3, s.estimated_available_volume_m3,
         s.postcode_district, s.approximate_area,
         s.approx_latitude, s.approx_longitude,
         s.monthly_price_pence, s.currency, s.minimum_storage_period_months,
         s.access_type, s.access_frequency,
         s.features, s.accepted_categories,
         (SELECT p.storage_path FROM public.space_photos p WHERE p.space_id = s.id
           ORDER BY p.is_cover DESC, p.display_order ASC LIMIT 1),
         s.published_at,
         COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.first_name), ''), 'Host'),
         COALESCE(pr.phone_verified, false),
         s.host_restrictions, s.restriction_notes,
         s.door_width_cm, s.door_height_cm,
         s.moisture_condition, s.temperature_condition,
         s.ground_floor_access, s.stairs_required, s.lift_available,
         s.vehicle_access_close,
         (SELECT count(*)::int FROM public.space_photos p2 WHERE p2.space_id = s.id)
  FROM public.spaces s
  LEFT JOIN public.profiles pr ON pr.id = s.host_id
  WHERE s.listing_status = 'published'
  ORDER BY s.published_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(limit_count, 60), 1), 200);
$function$;

REVOKE ALL ON FUNCTION public.get_published_spaces(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_spaces(integer) TO anon, authenticated;

-- 5. Location search: published spaces near a point, distance in miles.
--    Returns approximate coordinates only.
CREATE OR REPLACE FUNCTION public.search_published_spaces(
  search_lat numeric DEFAULT NULL,
  search_lng numeric DEFAULT NULL,
  radius_miles numeric DEFAULT 5,
  limit_count integer DEFAULT 60
)
RETURNS TABLE(id uuid, title text, space_type space_type, description text, storage_mode storage_mode, host_available_percentage integer, floor_area_m2 numeric, total_volume_m3 numeric, estimated_available_volume_m3 numeric, postcode_district text, approximate_area text, approx_latitude numeric, approx_longitude numeric, distance_miles numeric, monthly_price_pence integer, currency text, minimum_storage_period_months integer, access_type space_access_type, access_frequency space_access_frequency, features text[], accepted_categories text[], cover_path text, published_at timestamp with time zone, host_display_name text, host_phone_verified boolean, host_restrictions text[], restriction_notes text, door_width_cm numeric, door_height_cm numeric, moisture_condition moisture_condition, temperature_condition temperature_condition, ground_floor_access boolean, stairs_required boolean, lift_available tri_state, vehicle_access_close boolean, photo_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT s.id, s.title, s.space_type, s.description,
         s.storage_mode, s.host_available_percentage,
         s.floor_area_m2, s.total_volume_m3, s.estimated_available_volume_m3,
         s.postcode_district, s.approximate_area,
         s.approx_latitude, s.approx_longitude,
         CASE WHEN search_lat IS NULL OR search_lng IS NULL OR s.latitude IS NULL THEN NULL
              ELSE public.haversine_miles(search_lat, search_lng, s.latitude, s.longitude) END,
         s.monthly_price_pence, s.currency, s.minimum_storage_period_months,
         s.access_type, s.access_frequency,
         s.features, s.accepted_categories,
         (SELECT p.storage_path FROM public.space_photos p WHERE p.space_id = s.id
           ORDER BY p.is_cover DESC, p.display_order ASC LIMIT 1),
         s.published_at,
         COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.first_name), ''), 'Host'),
         COALESCE(pr.phone_verified, false),
         s.host_restrictions, s.restriction_notes,
         s.door_width_cm, s.door_height_cm,
         s.moisture_condition, s.temperature_condition,
         s.ground_floor_access, s.stairs_required, s.lift_available,
         s.vehicle_access_close,
         (SELECT count(*)::int FROM public.space_photos p2 WHERE p2.space_id = s.id)
  FROM public.spaces s
  LEFT JOIN public.profiles pr ON pr.id = s.host_id
  WHERE s.listing_status = 'published'
    AND (
      search_lat IS NULL OR search_lng IS NULL
      OR (s.latitude IS NOT NULL AND s.longitude IS NOT NULL
          AND public.haversine_miles(search_lat, search_lng, s.latitude, s.longitude)
              <= LEAST(GREATEST(COALESCE(radius_miles, 5), 0.1), 100))
    )
  ORDER BY
    CASE WHEN search_lat IS NULL OR search_lng IS NULL OR s.latitude IS NULL THEN NULL
         ELSE public.haversine_miles(search_lat, search_lng, s.latitude, s.longitude) END
      ASC NULLS LAST,
    s.published_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(limit_count, 60), 1), 200);
$function$;

REVOKE ALL ON FUNCTION public.search_published_spaces(numeric, numeric, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_published_spaces(numeric, numeric, numeric, integer) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.haversine_miles(numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.haversine_miles(numeric, numeric, numeric, numeric) TO authenticated, service_role;