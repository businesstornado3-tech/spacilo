REVOKE ALL ON FUNCTION public.admin_demand_geography(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_data_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_demand_geography(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_data_health() TO authenticated;