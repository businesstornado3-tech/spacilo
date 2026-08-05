CREATE OR REPLACE FUNCTION public.stow_review_window_days()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 14 $$;
REVOKE EXECUTE ON FUNCTION public.stow_review_window_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stow_review_window_days() TO authenticated, service_role;