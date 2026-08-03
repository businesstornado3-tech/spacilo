CREATE OR REPLACE FUNCTION public.is_space_published(_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.spaces s
    WHERE s.id = _space_id AND s.listing_status = 'published'
  );
$$;

REVOKE ALL ON FUNCTION public.is_space_published(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_space_published(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can read photos of published spaces" ON storage.objects;

CREATE POLICY "Anyone can read photos of published spaces"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'space-photos'
    AND public.is_space_published(((storage.foldername(name))[1])::uuid)
  );