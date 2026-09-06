DROP POLICY IF EXISTS "Platform admins read marketing videos" ON storage.objects;
CREATE POLICY "Platform admins read marketing videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-videos' AND public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins write marketing videos" ON storage.objects;
CREATE POLICY "Platform admins write marketing videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-videos' AND public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins remove marketing videos" ON storage.objects;
CREATE POLICY "Platform admins remove marketing videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-videos' AND public.is_platform_admin(auth.uid()));