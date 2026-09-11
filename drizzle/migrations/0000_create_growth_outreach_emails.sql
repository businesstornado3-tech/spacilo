CREATE TABLE public.growth_outreach_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  opportunity_key text,
  source text NOT NULL,
  detected_intent text,
  prospect_type text,
  location_label text,
  channel text NOT NULL DEFAULT 'email',
  recipient_email text NOT NULL,
  sender_account text NOT NULL,
  content_version text NOT NULL,
  subject text NOT NULL,
  eligibility_verdict text NOT NULL,
  status text NOT NULL,
  failure_reason text,
  provider_message_id text,
  provider_thread_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX growth_outreach_emails_created_at_idx
  ON public.growth_outreach_emails (created_at DESC);

GRANT SELECT ON public.growth_outreach_emails TO authenticated;
GRANT ALL ON public.growth_outreach_emails TO service_role;

ALTER TABLE public.growth_outreach_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read outreach emails"
  ON public.growth_outreach_emails
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));