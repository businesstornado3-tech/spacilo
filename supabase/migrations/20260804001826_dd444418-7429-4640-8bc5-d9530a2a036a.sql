DROP FUNCTION IF EXISTS public.get_published_space(uuid);

CREATE OR REPLACE FUNCTION public.get_published_space(space_id uuid)
 RETURNS TABLE(id uuid, title text, space_type space_type, description text, storage_mode storage_mode, host_available_percentage integer, length_m numeric, width_m numeric, height_m numeric, floor_area_m2 numeric, total_volume_m3 numeric, estimated_available_volume_m3 numeric, postcode_district text, approximate_area text, monthly_price_pence integer, daily_price_pence integer, weekly_price_pence integer, minimum_stay_days integer, currency text, minimum_storage_period_months integer, availability_mode text, available_from date, available_until date, access_type space_access_type, access_notes text, access_frequency space_access_frequency, ground_floor_access boolean, stairs_required boolean, lift_available tri_state, vehicle_access_close boolean, door_width_cm numeric, door_height_cm numeric, features text[], accepted_categories text[], host_restrictions text[], restriction_notes text, temperature_condition temperature_condition, moisture_condition moisture_condition, photo_paths text[], published_at timestamp with time zone, host_display_name text, host_phone_verified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
         COALESCE(pr.phone_verified, false)
  FROM public.spaces s
  LEFT JOIN public.profiles pr ON pr.id = s.host_id
  WHERE s.id = space_id AND s.listing_status = 'published';
$function$;

GRANT EXECUTE ON FUNCTION public.get_published_space(uuid) TO anon, authenticated, service_role;