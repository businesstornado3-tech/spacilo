-- Prompt 23 item 27: grants must not exceed what RLS policies actually allow.

-- host_earnings: no anon access at all; hosts read their own rows only.
-- All writes happen through SECURITY DEFINER accounting functions / service_role.
REVOKE ALL ON public.host_earnings FROM anon;
REVOKE ALL ON public.host_earnings FROM authenticated;
GRANT SELECT ON public.host_earnings TO authenticated;
GRANT ALL ON public.host_earnings TO service_role;

-- spaces: there is no anon SELECT policy — public listing reads go through
-- get_published_space(s) / get_space_suitability_public. Anon needs nothing.
REVOKE ALL ON public.spaces FROM anon;
REVOKE ALL ON public.spaces FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spaces TO authenticated;
GRANT ALL ON public.spaces TO service_role;