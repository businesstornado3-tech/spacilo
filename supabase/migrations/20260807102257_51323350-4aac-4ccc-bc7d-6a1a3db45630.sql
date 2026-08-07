-- guest_spacefit_sessions: server-side (service role) only for writes.
REVOKE ALL ON public.guest_spacefit_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.guest_spacefit_sessions FROM authenticated;
GRANT SELECT ON public.guest_spacefit_sessions TO authenticated;
GRANT ALL ON public.guest_spacefit_sessions TO service_role;

REVOKE ALL ON public.guest_spacefit_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.guest_spacefit_runs FROM authenticated;
GRANT SELECT ON public.guest_spacefit_runs TO authenticated;
GRANT ALL ON public.guest_spacefit_runs TO service_role;

ALTER TABLE public.guest_spacefit_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Claimants can read runs of their claimed guest session" ON public.guest_spacefit_runs;
CREATE POLICY "Claimants can read runs of their claimed guest session"
ON public.guest_spacefit_runs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.guest_spacefit_sessions s
    WHERE s.id = guest_spacefit_runs.session_id
      AND s.claimed_by = auth.uid()
  )
);

-- conversations: read/archive state changes go through security-definer RPCs only.
REVOKE ALL ON public.conversations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.conversations FROM authenticated;
GRANT SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;

-- spaces: public browsing stays on the vetted RPC projection; no anon table access.
REVOKE ALL ON public.spaces FROM anon;