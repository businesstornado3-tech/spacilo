CREATE OR REPLACE FUNCTION public.spaces_derive_approx_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  h bigint;
  angle double precision;
  dist_deg double precision;
BEGIN
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
  angle := ((h % 3600)::double precision / 3600) * 2 * pi();
  dist_deg := 0.0018 + (((h / 3600) % 1000)::double precision / 1000) * 0.0027;

  NEW.approx_latitude := round((NEW.latitude + dist_deg * cos(angle))::numeric, 4);
  NEW.approx_longitude := round(
    (NEW.longitude + dist_deg * sin(angle) / GREATEST(cos(radians(NEW.latitude)), 0.1))::numeric, 4);
  RETURN NEW;
END;
$$;

UPDATE public.spaces
SET latitude = 50.793816,
    longitude = -1.095543,
    geocode_status = 'ok',
    geocoded_at = now()
WHERE postcode = 'PO1 2QZ' AND latitude IS NULL;