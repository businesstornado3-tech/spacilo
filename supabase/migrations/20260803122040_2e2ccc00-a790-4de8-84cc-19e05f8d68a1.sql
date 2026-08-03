REVOKE ALL ON FUNCTION public.confirm_booking_payment(text, text, uuid, text, text, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(text, text, uuid, text, text, integer, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.record_payment_failure(text, text, uuid, payment_status, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_failure(text, text, uuid, payment_status, text, boolean) TO service_role;