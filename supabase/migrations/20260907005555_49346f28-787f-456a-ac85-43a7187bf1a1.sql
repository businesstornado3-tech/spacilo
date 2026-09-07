REVOKE EXECUTE ON FUNCTION public.admin_safety_incident(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_safety_incident(uuid) TO authenticated;