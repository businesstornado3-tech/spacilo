CREATE TABLE public.guest_spacefit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('renter','host')),
  token_hash text NOT NULL UNIQUE,
  ip_hash text,
  run_count integer NOT NULL DEFAULT 0,
  photo_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','claimed','failed')),
  result jsonb,
  result_at timestamp with time zone,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '2 hours')
);

GRANT ALL ON public.guest_spacefit_sessions TO service_role;
GRANT SELECT ON public.guest_spacefit_sessions TO authenticated;
ALTER TABLE public.guest_spacefit_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Claimants can read their own claimed guest session"
ON public.guest_spacefit_sessions
FOR SELECT
TO authenticated
USING (claimed_by = auth.uid());

CREATE INDEX guest_spacefit_sessions_expiry_idx ON public.guest_spacefit_sessions (expires_at);
CREATE INDEX guest_spacefit_sessions_ip_idx ON public.guest_spacefit_sessions (ip_hash, created_at);

CREATE TABLE public.guest_spacefit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.guest_spacefit_sessions(id) ON DELETE CASCADE,
  client_request_id text,
  provider text,
  model text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  error_category text,
  photo_count integer NOT NULL DEFAULT 0,
  detection_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

GRANT ALL ON public.guest_spacefit_runs TO service_role;
ALTER TABLE public.guest_spacefit_runs ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX guest_spacefit_runs_idempotency_idx
  ON public.guest_spacefit_runs (session_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX guest_spacefit_runs_session_idx ON public.guest_spacefit_runs (session_id, created_at);

CREATE TRIGGER guest_spacefit_sessions_updated_at
BEFORE UPDATE ON public.guest_spacefit_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.cleanup_guest_spacefit(_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer;
BEGIN
  WITH doomed AS (
    SELECT id FROM public.guest_spacefit_sessions
    WHERE expires_at < now()
    ORDER BY expires_at
    LIMIT GREATEST(1, LEAST(_limit, 2000))
  )
  DELETE FROM public.guest_spacefit_sessions s
  USING doomed d
  WHERE s.id = d.id;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_guest_spacefit(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_guest_spacefit(integer) TO service_role;