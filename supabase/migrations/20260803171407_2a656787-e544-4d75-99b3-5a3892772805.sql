CREATE OR REPLACE FUNCTION public.get_booking_exact_address(p_booking_id uuid)
 RETURNS TABLE(address_line1 text, address_line2 text, town text, postcode text, access_notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND
     OR v_booking.renter_id <> auth.uid()
     OR v_booking.status NOT IN ('confirmed', 'active')
     OR v_booking.cancelled_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE booking_id = p_booking_id AND status = 'succeeded'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.address_line1, s.address_line2, s.town, s.postcode, s.access_notes
  FROM public.spaces s WHERE s.id = v_booking.space_id;
END;
$function$;