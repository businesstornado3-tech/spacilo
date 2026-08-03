ALTER TABLE public.storage_requests
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS renter_first_name_snapshot text;

UPDATE public.storage_requests r
   SET renter_first_name_snapshot = p.first_name
  FROM public.profiles p
 WHERE p.id = r.renter_id AND r.renter_first_name_snapshot IS NULL;

CREATE OR REPLACE FUNCTION public.storage_requests_set_renter_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.renter_first_name_snapshot IS NULL THEN
    SELECT p.first_name INTO NEW.renter_first_name_snapshot
      FROM public.profiles p WHERE p.id = NEW.renter_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storage_requests_set_renter_name ON public.storage_requests;
CREATE TRIGGER storage_requests_set_renter_name
BEFORE INSERT ON public.storage_requests
FOR EACH ROW EXECUTE FUNCTION public.storage_requests_set_renter_name();

CREATE OR REPLACE FUNCTION public.respond_to_storage_request(
  p_request_id uuid,
  p_decision text,
  p_decline_reason text DEFAULT NULL
)
RETURNS public.storage_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid := auth.uid();
  v_row public.storage_requests;
  v_current public.storage_requests;
  v_reason text;
BEGIN
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to respond to a request.';
  END IF;
  IF p_decision NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid response.';
  END IF;

  v_reason := nullif(btrim(coalesce(p_decline_reason, '')), '');
  IF p_decision = 'accepted' THEN
    v_reason := NULL;
  ELSIF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Please keep your reason under 500 characters.';
  END IF;

  UPDATE public.storage_requests
     SET status = p_decision::public.storage_request_status,
         responded_at = now(),
         decline_reason = v_reason,
         updated_at = now()
   WHERE id = p_request_id
     AND host_id = v_host
     AND status = 'pending'
     AND expires_at > now()
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT * INTO v_current FROM public.storage_requests
   WHERE id = p_request_id AND host_id = v_host;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'We couldn''t find that request.';
  END IF;

  IF v_current.status = 'pending' THEN
    RAISE EXCEPTION 'This request has expired, so it can no longer be answered.';
  END IF;

  RAISE EXCEPTION 'This request is already %, so it can no longer be answered.', v_current.status;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_storage_request(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.respond_to_storage_request(uuid, text, text) TO authenticated;