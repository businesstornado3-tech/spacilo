CREATE OR REPLACE FUNCTION public.haversine_miles(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT round((3958.7613 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
    * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::numeric, 3);
$function$;