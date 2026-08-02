-- Files are stored at: <space_id>/<filename>
CREATE POLICY "Hosts upload photos to their own space folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'space-photos'
    AND EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.host_id = auth.uid()
        AND s.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Hosts update photos in their own space folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'space-photos'
    AND EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.host_id = auth.uid() AND s.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Hosts delete photos in their own space folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'space-photos'
    AND EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.host_id = auth.uid() AND s.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Hosts read photos in their own space folder"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'space-photos'
    AND EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.host_id = auth.uid() AND s.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Anyone can read photos of published spaces"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'space-photos'
    AND EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.listing_status = 'published' AND s.id::text = (storage.foldername(name))[1]
    )
  );