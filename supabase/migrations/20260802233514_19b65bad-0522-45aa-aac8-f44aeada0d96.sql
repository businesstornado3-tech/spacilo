DROP FUNCTION IF EXISTS public.get_published_spaces(integer);

CREATE OR REPLACE FUNCTION public.get_published_spaces(limit_count integer DEFAULT 60)
 RETURNS TABLE(
   id uuid, title text, space_type space_type, description text,
   storage_mode storage_mode, host_available_percentage integer,
   floor_area_m2 numeric, total_volume_m3 numeric, estimated_available_volume_m3 numeric,
   postcode_district text, approximate_area text, latitude numeric, longitude numeric,
   monthly_price_pence integer, currency text, minimum_storage_period_months integer,
   access_type space_access_type, access_frequency space_access_frequency,
   features text[], accepted_categories text[], cover_path text,
   published_at timestamp with time zone, host_display_name text, host_phone_verified boolean,
   host_restrictions text[], restriction_notes text,
   door_width_cm integer, door_height_cm integer,
   moisture_condition moisture_condition, temperature_condition temperature_condition,
   ground_floor_access boolean, stairs_required boolean, lift_available tri_state,
   vehicle_access_close boolean, photo_count integer
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.title, s.space_type, s.description,
         s.storage_mode, s.host_available_percentage,
         s.floor_area_m2, s.total_volume_m3, s.estimated_available_volume_m3,
         s.postcode_district, s.approximate_area, s.latitude, s.longitude,
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
GRANT EXECUTE ON FUNCTION public.get_published_spaces(integer) TO anon, authenticated, service_role;