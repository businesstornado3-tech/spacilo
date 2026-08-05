-- Owner-folder isolation for host space scan photos: <host_id>/<space_id>/<file>
CREATE POLICY "Hosts read their own space scan files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'space-scans' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Hosts upload their own space scan files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'space-scans' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Hosts update their own space scan files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'space-scans' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'space-scans' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Hosts delete their own space scan files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'space-scans' AND (storage.foldername(name))[1] = auth.uid()::text);