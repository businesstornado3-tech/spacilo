-- Harden the published-space check used by the public space-photos storage policy.
-- Accepts text so a malformed folder name fails closed instead of raising a cast error,
-- pins an empty search_path and fully qualifies every reference.
CREATE OR REPLACE FUNCTION private.is_space_published(_space_folder text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _space_id uuid;
BEGIN
  IF _space_folder IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    _space_id := _space_folder::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.spaces s
    WHERE s.id = _space_id
      AND s.listing_status = 'published'
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.is_space_published(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_space_published(text) TO anon, authenticated;

-- Point the public read policy at the hardened, text-based check.
DROP POLICY IF EXISTS "Anyone can read photos of published spaces" ON storage.objects;

CREATE POLICY "Anyone can read photos of published spaces"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'space-photos'
  AND private.is_space_published((storage.foldername(name))[1])
);

-- Remove the old uuid-argument overload now that nothing references it.
DROP FUNCTION IF EXISTS private.is_space_published(uuid);
