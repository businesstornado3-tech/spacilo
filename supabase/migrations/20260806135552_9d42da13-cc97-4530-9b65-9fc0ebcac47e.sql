DROP POLICY IF EXISTS "Anyone reads published policy versions" ON public.storage_policy_versions;

CREATE POLICY "Anon reads published policy versions"
ON public.storage_policy_versions
FOR SELECT
TO anon
USING (status = ANY (ARRAY['published'::policy_version_status, 'retired'::policy_version_status]));

CREATE POLICY "Members read published policy versions"
ON public.storage_policy_versions
FOR SELECT
TO authenticated
USING (
  status = ANY (ARRAY['published'::policy_version_status, 'retired'::policy_version_status])
  OR public.has_role(auth.uid(), 'admin'::app_role)
);