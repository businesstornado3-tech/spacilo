-- Security linter 0011: pin a fixed search_path on the reporting helper so it
-- can never resolve object names against a caller-controlled schema.
ALTER FUNCTION public.analytics_is_public_path(text) SET search_path = public, pg_temp;