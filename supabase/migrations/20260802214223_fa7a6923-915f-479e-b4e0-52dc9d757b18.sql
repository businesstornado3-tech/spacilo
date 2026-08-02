REVOKE ALL ON FUNCTION public.get_published_space(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_published_spaces(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_space(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_published_spaces(integer) TO anon, authenticated, service_role;