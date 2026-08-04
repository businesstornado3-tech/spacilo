REVOKE EXECUTE ON FUNCTION public.request_booking_extension(uuid, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.respond_to_booking_extension(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.begin_extension_checkout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_booking_extension(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_booking_extension(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_extension_checkout(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_booking_payment(text, text, uuid, text, text, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(text, text, uuid, text, text, integer, text, boolean) TO service_role;