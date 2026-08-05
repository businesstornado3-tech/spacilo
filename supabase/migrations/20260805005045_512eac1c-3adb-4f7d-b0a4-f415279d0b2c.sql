REVOKE ALL ON public.user_notifications FROM anon;
REVOKE ALL ON public.user_notifications FROM authenticated;
GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;