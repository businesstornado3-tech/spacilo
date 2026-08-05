-- Prompt 23 item 27: platform-only tables should not be reachable from the API.
REVOKE ALL ON public.guest_spacefit_runs FROM anon, authenticated;
REVOKE ALL ON public.stripe_disputes FROM anon, authenticated;
REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
GRANT ALL ON public.guest_spacefit_runs TO service_role;
GRANT ALL ON public.stripe_disputes TO service_role;
GRANT ALL ON public.stripe_webhook_events TO service_role;

-- Trigger functions are invoked by the row triggers themselves; nobody should
-- be able to call them directly over the API.
REVOKE ALL ON FUNCTION public.messages_touch_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spaces_derive_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.storage_requests_set_renter_name() FROM PUBLIC, anon, authenticated;